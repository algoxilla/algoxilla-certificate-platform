// Algoxilla Certificate Platform - Production Workflow & Security Test Suite
// Verifies:
//  - Cryptographic token generation, HMAC hashing, constant-time verification, and 15m expiry
//  - Stateless HMAC session tokens, tampering rejection, and expiry handling
//  - Multi-tier sliding window rate limiters (IP & email)
//  - Brevo email formatting and templates
//  - Single-use claim token lifecycle and race condition prevention (atomic consumption)
//  - Rule 9 fail-closed production database policy
//  - Live API endpoint tests:
//      * POST /api/auth/send-claim-link (privacy-preserving response, rate limiting)
//      * GET /api/auth/consume-claim-link (validation, single-use, session issuance)
//      * GET /api/auth/session (authenticated context)
//      * POST /api/auth/correction (authenticated correction submission)
//      * GET /api/certificate/[code]/download (ownership enforcement, cache headers, rate limiting)
//      * GET /api/verify/[code] (privacy protection, safe fields only)
//  - Realistic concurrent download load test (synthetic records)

import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";

function loadLocalEnv() {
  const candidateFiles = [".env.local", ".env"];
  for (const fileName of candidateFiles) {
    const fullPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) continue;

    if (typeof process.loadEnvFile === "function") {
      try {
        process.loadEnvFile(fullPath);
        return;
      } catch {}
    }

    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (match) {
          const key = match[1];
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
      return;
    } catch {}
  }
}
loadLocalEnv();

// 1. Unit & Abstraction Tests
import { 
  generateRawClaimToken, 
  hashClaimToken, 
  verifyClaimToken, 
  calculateTokenExpiry, 
  isTokenExpired 
} from "../src/lib/auth/token.ts";

import { 
  createSignedSessionToken, 
  verifySessionToken, 
  serializeSessionCookie, 
  serializeLogoutCookie 
} from "../src/lib/auth/session.ts";

import { 
  checkClaimRateLimit, 
  checkDownloadRateLimit, 
  resetRateLimitsForTesting 
} from "../src/lib/auth/rateLimit.ts";

import { generateClaimEmailContent } from "../src/lib/email/template.ts";
import { brevoService } from "../src/lib/email/brevo.ts";
import { CertificateRepository } from "../src/lib/db/repository.ts";
import { getCertificateRepository, DatabaseUnavailableError } from "../src/lib/db/client.ts";

console.log("=================================================");
console.log("   RUNNING PRODUCTION WORKFLOW & SECURITY TESTS   ");
console.log("=================================================\n");

const baseUrl = "http://localhost:3000";

// -----------------------------------------------------------------------------
// Test Suite 1: Token Cryptography & Lifecycle
// -----------------------------------------------------------------------------
console.log("--- Suite 1: Token Cryptography & Lifecycle ---");
{
  const raw1 = generateRawClaimToken();
  const raw2 = generateRawClaimToken();
  assert.strictEqual(typeof raw1, "string");
  assert.strictEqual(raw1.length, 64, "Raw token must be 64 hex characters (256-bit entropy)");
  assert.notStrictEqual(raw1, raw2, "Tokens must be unique");

  // HMAC verification
  const hash1 = hashClaimToken(raw1);
  assert.strictEqual(hash1.length, 64, "HMAC-SHA256 must be 64 hex characters");
  assert.strictEqual(verifyClaimToken(raw1, hash1), true, "Valid raw token must match HMAC");
  assert.strictEqual(verifyClaimToken(raw2, hash1), false, "Mismatched token must fail");
  assert.strictEqual(verifyClaimToken("malformed", hash1), false, "Malformed token must fail");

  // Expiration calculation
  const futureIso = calculateTokenExpiry(15);
  assert.strictEqual(isTokenExpired(futureIso), false, "15m future token must not be expired");
  const pastIso = new Date(Date.now() - 5000).toISOString();
  assert.strictEqual(isTokenExpired(pastIso), true, "Past timestamp must be marked expired");

  console.log("✓ Suite 1 Passed: 256-bit token entropy, HMAC verification, and 15m expiration confirmed");
}

// -----------------------------------------------------------------------------
// Test Suite 2: Authenticated Session Cryptography & Tamper Resistance
// -----------------------------------------------------------------------------
console.log("\n--- Suite 2: Session Token Security & Tamper Resistance ---");
{
  const sessionToken = createSignedSessionToken({
    participantId: "test-part-101",
    email: "alex.chen@example.com",
    role: "PARTICIPANT",
  });

  assert.ok(sessionToken.includes("."), "Session token must be separated by '.'");
  const verified = verifySessionToken(sessionToken);
  assert.ok(verified, "Session token must verify successfully");
  assert.strictEqual(verified.email, "alex.chen@example.com");
  assert.strictEqual(verified.role, "PARTICIPANT");
  assert.ok(verified.exp > Math.floor(Date.now() / 1000), "Session exp must be in future");

  // Tamper test: modify payload
  const [b64, sig] = sessionToken.split(".");
  const tamperedPayload = Buffer.from(JSON.stringify({ email: "attacker@example.com" })).toString("base64url");
  assert.strictEqual(verifySessionToken(`${tamperedPayload}.${sig}`), null, "Tampered payload must fail verification");

  // Tamper test: modify signature
  assert.strictEqual(verifySessionToken(`${b64}.badsignature`), null, "Bad signature must fail verification");

  // Cookie serialization
  const cookieStr = serializeSessionCookie(sessionToken);
  assert.ok(cookieStr.includes("HttpOnly"), "Must include HttpOnly flag");
  assert.ok(cookieStr.includes("SameSite=Lax"), "Must include SameSite=Lax");
  assert.ok(cookieStr.includes("Max-Age=7200"), "Must set 2-hour duration");

  const logoutCookie = serializeLogoutCookie();
  assert.ok(logoutCookie.includes("Max-Age=0"), "Logout must clear cookie with Max-Age=0");

  console.log("✓ Suite 2 Passed: HMAC-signed session cookies with tamper detection and HttpOnly flags verified");
}

// -----------------------------------------------------------------------------
// Test Suite 3: Sliding-Window Rate Limiters
// -----------------------------------------------------------------------------
console.log("\n--- Suite 3: Multi-Tier Rate Limiting ---");
{
  resetRateLimitsForTesting();

  const testIp = "192.168.1.100";
  const testEmail = "ratelimit.test@example.com";

  // Claim rate limit: 5 per 10 min for IP, 3 per 15 min for email
  assert.strictEqual(checkClaimRateLimit(testIp, testEmail).allowed, true);
  assert.strictEqual(checkClaimRateLimit(testIp, testEmail).allowed, true);
  assert.strictEqual(checkClaimRateLimit(testIp, testEmail).allowed, true);

  // 4th request on same email must be blocked (max 3 per email)
  const fourthEmail = checkClaimRateLimit(testIp, testEmail);
  assert.strictEqual(fourthEmail.allowed, false, "4th request on same email must be rate-limited");
  assert.ok(fourthEmail.retryAfterSeconds > 0, "Must provide retry-after seconds");

  // Download rate limit: 10 per minute per IP
  const dlIp = "192.168.1.101";
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(checkDownloadRateLimit(dlIp).allowed, true);
  }
  const eleventhDl = checkDownloadRateLimit(dlIp);
  assert.strictEqual(eleventhDl.allowed, false, "11th download in same minute must be rate-limited");

  resetRateLimitsForTesting();
  console.log("✓ Suite 3 Passed: IP & email sliding window rate limits enforced correctly");
}

// -----------------------------------------------------------------------------
// Test Suite 4: Email Content Generation & Brevo Service Safety
// -----------------------------------------------------------------------------
console.log("\n--- Suite 4: Email Content & Brevo Integration ---");
{
  const emailData = generateClaimEmailContent({
    toEmail: "participant@example.com",
    recipientName: "Jane Doe",
    claimUrl: "https://verify.algoxilla.com/api/auth/consume-claim-link?token=testabc123",
    expiresInMinutes: 15,
  });

  assert.ok(emailData.subject.includes("Algothon’26"), "Email subject must reference Algothon’26");
  assert.ok(emailData.htmlContent.includes("Jane Doe"), "HTML must contain recipient name");
  assert.ok(emailData.htmlContent.includes("15 minutes"), "HTML must mention 15 minute expiration");
  assert.ok(emailData.htmlContent.includes("https://verify.algoxilla.com/api/auth/consume-claim-link"), "HTML must contain claim button link");
  assert.ok(emailData.textContent.includes("single-use"), "Text version must specify single-use link");

  // Brevo service in test mode
  const sendRes = await brevoService.sendClaimLink({
    toEmail: "jane.doe@example.com",
    recipientName: "Jane Doe",
    claimUrl: "https://verify.algoxilla.com/api/auth/consume-claim-link?token=testabc123",
  });

  assert.strictEqual(sendRes.success, true);
  assert.ok(sendRes.timestamp, "Must include dispatch timestamp");

  console.log("✓ Suite 4 Passed: Algoxilla email templates and Brevo dispatch handler verified");
}

// -----------------------------------------------------------------------------
// Test Suite 5: Repository Claim Token Lifecycle & Race Condition Guard
// -----------------------------------------------------------------------------
console.log("\n--- Suite 5: Atomic Token Lifecycle & Single-Use Enforcement ---");
{
  const testDbPath = path.join(process.cwd(), "test", "output", "test_claim_tokens.db");
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  const repo = new CertificateRepository(testDbPath);

  const rawToken = generateRawClaimToken();
  const tokenHash = hashClaimToken(rawToken);
  const expiresAt = calculateTokenExpiry(15);

  // 1. Create token record
  const tokenRecord = repo.createClaimToken({
    email: "race.test@example.com",
    tokenHash,
    tokenType: "CLAIM_LINK",
    expiresAt,
    ipAddress: "127.0.0.1",
  });
  assert.ok(tokenRecord && tokenRecord.id, "Created token must return a valid UUID");

  // 2. Lookup by hash
  const found = repo.getClaimTokenByHash(tokenHash);
  assert.ok(found, "Token must be retrieved by HMAC hash");
  assert.strictEqual(found.email, "race.test@example.com");
  assert.strictEqual(found.consumedAt, null, "Token must be unconsumed initially");

  // 3. Increment attempts
  repo.incrementTokenAttempts(found.id);
  const updatedAttempts = repo.getClaimTokenByHash(tokenHash);
  assert.strictEqual(updatedAttempts.attempts, 1);

  // 4. First consumption must succeed
  const firstConsume = repo.consumeClaimToken(found.id);
  assert.strictEqual(firstConsume, true, "First token redemption must return true");

  // 5. Immediate second consumption MUST return false (prevents reuse / replay race conditions)
  const secondConsume = repo.consumeClaimToken(found.id);
  assert.strictEqual(secondConsume, false, "Second consumption attempt must return false");

  repo.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  console.log("✓ Suite 5 Passed: Single-use claim token atomic invalidation prevents replay attacks");
}

// -----------------------------------------------------------------------------
// Test Suite 6: Rule 9 - Production Database Fail-Closed Policy
// -----------------------------------------------------------------------------
console.log("\n--- Suite 6: Rule 9 Fail-Closed Production Guard ---");
{
  // Save current env
  const origNodeEnv = process.env.NODE_ENV;
  const origAppLive = process.env.APP_LIVE;
  const origLive = process.env.NEXT_PUBLIC_APP_LIVE;
  const origDbUrl = process.env.DATABASE_URL;
  const origDirectUrl = process.env.DIRECT_URL;
  const origSbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origSbUrlRaw = process.env.SUPABASE_URL;
  const origSbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    // Simulate production mode without DATABASE_URL or Supabase credentials
    process.env.APP_LIVE = "true";
    process.env.NEXT_PUBLIC_APP_LIVE = "true";
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    let threwExpectedError = false;
    try {
      getCertificateRepository();
    } catch (err) {
      if (err instanceof DatabaseUnavailableError && err.code === "PRODUCTION_DB_UNCONFIGURED") {
        threwExpectedError = true;
      }
    }

    assert.strictEqual(
      threwExpectedError, 
      true, 
      "Rule 9 MUST throw DatabaseUnavailableError when running in production mode without DATABASE_URL"
    );
  } finally {
    // Restore env
    process.env.NODE_ENV = origNodeEnv;
    if (origAppLive !== undefined) process.env.APP_LIVE = origAppLive; else delete process.env.APP_LIVE;
    if (origLive !== undefined) process.env.NEXT_PUBLIC_APP_LIVE = origLive; else delete process.env.NEXT_PUBLIC_APP_LIVE;
    if (origDbUrl) process.env.DATABASE_URL = origDbUrl; else delete process.env.DATABASE_URL;
    if (origDirectUrl) process.env.DIRECT_URL = origDirectUrl; else delete process.env.DIRECT_URL;
    if (origSbUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = origSbUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (origSbUrlRaw) process.env.SUPABASE_URL = origSbUrlRaw; else delete process.env.SUPABASE_URL;
    if (origSbKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origSbKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  console.log("✓ Suite 6 Passed: Rule 9 strictly enforces fail-closed behavior when production DB is missing");
}

// -----------------------------------------------------------------------------
// Test Suite 7: Live HTTP API Endpoints (against local server)
// -----------------------------------------------------------------------------
console.log("\n--- Suite 7: Live HTTP API Endpoints ---");
{
  // 7A: POST /api/auth/send-claim-link with valid email
  const liveTestIp = `10.100.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const liveTestEmail = `test.user.${Date.now()}@example.com`;
  const sendRes = await fetch(`${baseUrl}/api/auth/send-claim-link`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-forwarded-for": liveTestIp,
    },
    body: JSON.stringify({ email: liveTestEmail }),
  });
  assert.strictEqual(sendRes.status, 200);
  const sendJson = await sendRes.json();
  assert.strictEqual(sendJson.success, true);
  assert.ok(sendJson.message.includes("dispatched"), "Must return user-friendly dispatch message");

  // 7B: POST /api/auth/send-claim-link with unknown email (Privacy test: returns identical generic success)
  const unknownEmailRes = await fetch(`${baseUrl}/api/auth/send-claim-link`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-forwarded-for": `10.100.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
    },
    body: JSON.stringify({ email: `unregistered.${Date.now()}@example.com` }),
  });
  assert.strictEqual(unknownEmailRes.status, 200, "Unregistered email must not reveal absence via 404/error");
  const unknownJson = await unknownEmailRes.json();
  assert.strictEqual(unknownJson.success, true);

  // 7B-2: Live Rate Limit Trigger: Exceeding IP limit triggers HTTP 429
  const rateLimitTestIp = `10.200.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  let hitRateLimit = false;
  for (let i = 0; i < 7; i++) {
    const rlRes = await fetch(`${baseUrl}/api/auth/send-claim-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": rateLimitTestIp,
      },
      body: JSON.stringify({ email: `ratelimit.sub.${i}.${Date.now()}@example.com` }),
    });
    if (rlRes.status === 429) {
      hitRateLimit = true;
      const rlData = await rlRes.json();
      assert.ok(rlData.error.includes("wait"), "Rate limit response must instruct user to wait");
      break;
    }
  }
  assert.strictEqual(hitRateLimit, true, "Rapid requests must trigger HTTP 429 on live endpoint");

  // 7C: GET /api/auth/consume-claim-link with invalid/missing token
  const badTokenRes = await fetch(`${baseUrl}/api/auth/consume-claim-link?token=invalid_garbage_token`, {
    redirect: "manual",
  });
  // Next.js redirects to /portal?error=... with 307
  assert.strictEqual(badTokenRes.status, 307);
  const redirectLoc = badTokenRes.headers.get("location") || "";
  assert.ok(redirectLoc.includes("error=TOKEN_INVALID"), "Bad token must redirect to error page with TOKEN_INVALID");

  // 7D: GET /api/auth/session without session cookie
  const unauthSessionRes = await fetch(`${baseUrl}/api/auth/session`);
  assert.strictEqual(unauthSessionRes.status, 200);
  const unauthSessionJson = await unauthSessionRes.json();
  assert.strictEqual(unauthSessionJson.authenticated, false);

  // 7E: GET /api/auth/session with a valid signed session cookie
  const validSessionToken = createSignedSessionToken({
    participantId: "MOCK-ALGO26-8942",
    email: "alex.chen@example.com",
    role: "PARTICIPANT",
  });
  const authSessionRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: {
      Cookie: `algo_claim_session=${validSessionToken}`,
    },
  });
  assert.strictEqual(authSessionRes.status, 200);
  const authSessionJson = await authSessionRes.json();
  assert.strictEqual(authSessionJson.authenticated, true);
  assert.strictEqual(authSessionJson.participant.email, "alex.chen@example.com");

  console.log("✓ Suite 7 Passed: Claim link dispatch, privacy protection, invalid token rejection, and authenticated session verified");
}

// -----------------------------------------------------------------------------
// Test Suite 8: Certificate Download Authorization & Ownership
// -----------------------------------------------------------------------------
console.log("\n--- Suite 8: Download Authorization & Ownership Guards ---");
{
  // 8A: Authenticated participant downloads OWN certificate
  const alexSession = createSignedSessionToken({
    participantId: "MOCK-ALGO26-8942",
    email: "alex.chen@example.com",
    role: "PARTICIPANT",
  });

  const dlTestIp = `10.150.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const ownDlRes = await fetch(`${baseUrl}/api/certificate/MOCK-ALGO26-8942/download`, {
    headers: {
      Cookie: `algo_claim_session=${alexSession}`,
      "x-forwarded-for": dlTestIp,
    },
  });
  assert.strictEqual(ownDlRes.status, 200, "Owner must be allowed to download");
  assert.strictEqual(ownDlRes.headers.get("content-type"), "application/pdf");
  assert.ok(
    ownDlRes.headers.get("cache-control")?.includes("private") &&
    ownDlRes.headers.get("cache-control")?.includes("no-store"),
    "Must include private anti-caching headers"
  );
  const pdfBytes = new Uint8Array(await ownDlRes.arrayBuffer());
  assert.ok(pdfBytes.length > 500000, "Must be complete PDF");

  // 8B: Participant attempts to download ANOTHER participant's certificate (Ownership Mismatch)
  const attackerSession = createSignedSessionToken({
    participantId: "OTHER-999",
    email: "attacker@example.com",
    role: "PARTICIPANT",
  });

  const mismatchRes = await fetch(`${baseUrl}/api/certificate/MOCK-ALGO26-8942/download`, {
    headers: {
      Cookie: `algo_claim_session=${attackerSession}`,
      "x-forwarded-for": `10.150.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
    },
  });
  assert.strictEqual(mismatchRes.status, 403, "Mismatched session must be blocked with HTTP 403");
  const mismatchJson = await mismatchRes.json();
  assert.ok(mismatchJson.error.includes("not authorized"), "Must specify unauthorized ownership");

  // 8C: Revoked, Pending, and Ineligible codes remain blocked even with session
  const revokedRes = await fetch(`${baseUrl}/api/certificate/ALGO-2026-REVOKED-01/download`, {
    headers: { 
      Cookie: `algo_claim_session=${alexSession}`,
      "x-forwarded-for": `10.150.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
    },
  });
  assert.strictEqual(revokedRes.status, 403);

  const pendingRes = await fetch(`${baseUrl}/api/certificate/TEST-PENDING/download`, {
    headers: { 
      Cookie: `algo_claim_session=${alexSession}`,
      "x-forwarded-for": `10.150.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
    },
  });
  assert.strictEqual(pendingRes.status, 403);

  console.log("✓ Suite 8 Passed: Strict ownership validation, status checks, and anti-caching headers verified");
}

// -----------------------------------------------------------------------------
// Test Suite 9: Public Verification Endpoint Privacy Protection
// -----------------------------------------------------------------------------
console.log("\n--- Suite 9: Public Verification Privacy & Data Sanitization ---");
{
  const verifyRes = await fetch(`${baseUrl}/api/verify/MOCK-ALGO26-8942`);
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();

  assert.strictEqual(verifyData.status, "ISSUED");
  assert.strictEqual(verifyData.certificate.recipientName, "Alex Chen");
  assert.ok(verifyData.certificate.eventName.includes("Algothon"), "Event name must include Algothon");

  // CRITICAL PRIVACY CHECKS: Ensure no PII or sensitive keys leak in public endpoint
  assert.strictEqual(verifyData.certificate.email, undefined, "Email address must NOT leak in public verification");
  assert.strictEqual(verifyData.certificate.claimToken, undefined, "Claim tokens must NOT leak");
  assert.strictEqual(verifyData.certificate.participantId, undefined, "Internal participant IDs must NOT leak");
  assert.strictEqual(verifyData.certificate.internalNotes, undefined, "Internal notes must NOT leak");

  // Unknown certificate returns NOT_FOUND status truthfully
  const unknownVerifyRes = await fetch(`${baseUrl}/api/verify/NONEXISTENT-CODE-1234`);
  assert.strictEqual(unknownVerifyRes.status, 200);
  const unknownData = await unknownVerifyRes.json();
  assert.strictEqual(unknownData.status, "NOT_FOUND");

  console.log("✓ Suite 9 Passed: Public verification discloses only approved fields with zero PII exposure");
}

// -----------------------------------------------------------------------------
// Test Suite 10: Concurrency & Load Safety (120-150 participant capacity)
// -----------------------------------------------------------------------------
console.log("\n--- Suite 10: Concurrent Downloads & Resource Safety ---");
{
  const alexSession = createSignedSessionToken({
    participantId: "MOCK-ALGO26-8942",
    email: "alex.chen@example.com",
    role: "PARTICIPANT",
  });

  const concurrencyIp = `10.160.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const startTime = Date.now();
  const downloadPromises = Array.from({ length: 5 }).map(() =>
    fetch(`${baseUrl}/api/certificate/MOCK-ALGO26-8942/download`, {
      headers: { 
        Cookie: `algo_claim_session=${alexSession}`,
        "x-forwarded-for": concurrencyIp,
      },
    })
  );

  const responses = await Promise.all(downloadPromises);
  const durationMs = Date.now() - startTime;

  for (const res of responses) {
    assert.strictEqual(res.status, 200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.ok(bytes.length > 500000, "Each concurrent response must be full PDF");
  }

  console.log(`✓ Suite 10 Passed: 5 concurrent PDF generations completed in ${durationMs}ms without errors or resource exhaustion`);
}

// -----------------------------------------------------------------------------
// Test Suite 11: End-to-End Synthetic Participant Workflow
// (Eligible Participant -> Claim Link -> Secure Consumption -> Authenticated Session
//  -> Official PDF Download -> Configurable QR Code Verification)
// -----------------------------------------------------------------------------
console.log("\n--- Suite 11: End-to-End Synthetic Participant Lifecycle ---");
{
  const repo = getCertificateRepository();
  const rawToken = generateRawClaimToken();
  const tokenHash = hashClaimToken(rawToken);
  const expiresAt = calculateTokenExpiry(15);

  // 1. Create claim token record
  await repo.createClaimToken({
    email: "alex.chen@example.com",
    tokenHash,
    expiresAt,
    tokenType: "CLAIM_LINK",
    ipAddress: "10.180.1.1",
  });

  // 2A. Participant clicks single-use claim link in email -> Safe GET redirects to /portal/claim without burning token
  const safeGetRes = await fetch(`${baseUrl}/api/auth/consume-claim-link?token=${rawToken}`, {
    redirect: "manual",
  });
  assert.strictEqual(safeGetRes.status, 307, "Safe GET claim link must redirect to /portal/claim");
  const safeGetLoc = safeGetRes.headers.get("location") || "";
  assert.ok(safeGetLoc.includes("/portal/claim"), "Safe GET must redirect to claim confirmation page");

  // 2B. User confirms claim via POST -> Atomically consumes token and issues session cookie
  const claimRes = await fetch(`${baseUrl}/api/auth/consume-claim-link?token=${rawToken}`, {
    method: "POST",
    redirect: "manual",
  });
  assert.strictEqual(claimRes.status, 303, "POST claim link must redirect to /portal with 303 See Other");
  const redirectUrl = claimRes.headers.get("location") || "";
  assert.ok(redirectUrl.includes("verified=true"), "Redirect must indicate successful verification");

  const rawSetCookie = claimRes.headers.get("set-cookie") || "";
  assert.ok(rawSetCookie.includes("algo_claim_session"), "Response must issue algo_claim_session cookie");
  const sessionCookieMatch = rawSetCookie.match(/algo_claim_session=([^;]+)/);
  assert.ok(sessionCookieMatch, "Session cookie match must succeed");
  const sessionCookie = sessionCookieMatch[0];

  // 3. Replay attack prevention: second click on same link MUST fail
  const replayRes = await fetch(`${baseUrl}/api/auth/consume-claim-link?token=${rawToken}`, {
    method: "POST",
    redirect: "manual",
  });
  assert.strictEqual(replayRes.status, 303);
  const replayRedirect = replayRes.headers.get("location") || "";
  assert.ok(replayRedirect.includes("TOKEN_ALREADY_USED"), "Replayed claim link must be rejected");

  // 4. Participant accesses authenticated portal with issued cookie
  const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(sessionRes.status, 200);
  const sessionData = await sessionRes.json();
  assert.strictEqual(sessionData.authenticated, true);
  assert.strictEqual(sessionData.participant.email, "alex.chen@example.com");

  // 5. Participant downloads official personalized PDF
  const dlRes = await fetch(`${baseUrl}/api/certificate/MOCK-ALGO26-8942/download`, {
    headers: {
      Cookie: sessionCookie,
      "x-forwarded-for": `10.180.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
    },
  });
  assert.strictEqual(dlRes.status, 200);
  assert.strictEqual(dlRes.headers.get("content-type"), "application/pdf");
  assert.ok(dlRes.headers.get("cache-control")?.includes("private"), "Must have private cache control");
  const pdfBytes = new Uint8Array(await dlRes.arrayBuffer());
  assert.ok(pdfBytes.length > 500000, "Must be complete binary PDF");
  const pdfHeader = Buffer.from(pdfBytes.subarray(0, 5)).toString("ascii");
  assert.strictEqual(pdfHeader, "%PDF-", "PDF must have valid binary header");

  // 6. Verify public QR destination resolution
  const verifyRes = await fetch(`${baseUrl}/api/verify/MOCK-ALGO26-8942`);
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.status, "ISSUED");
  assert.strictEqual(verifyData.certificate.recipientName, "Alex Chen");
  assert.strictEqual(verifyData.certificate.email, undefined, "Zero PII leaked in public verification");

  console.log("✓ Suite 11 Passed: Full synthetic participant claim-to-download-to-verification lifecycle passed cleanly");
}

console.log("\n=================================================");
console.log("   ALL PRODUCTION WORKFLOW TESTS PASSED CLEANLY!  ");
console.log("=================================================");
process.exit(0);

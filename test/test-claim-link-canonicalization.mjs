// Algoxilla Certificate Platform - Claim Link Canonicalization & Cryptographic Integrity Tests
import assert from "node:assert/strict";
import { 
  canonicalizeUrl, 
  getPublicAppUrl, 
  getAppBaseUrl, 
  getVerificationUrl 
} from "../src/lib/config.ts";
import { 
  generateRawClaimToken, 
  hashClaimToken, 
  verifyClaimToken, 
  calculateTokenExpiry, 
  isTokenExpired 
} from "../src/lib/auth/token.ts";
import { 
  createSignedSessionToken, 
  verifySessionToken 
} from "../src/lib/auth/session.ts";

console.log("=================================================");
console.log("   CLAIM LINK CANONICALIZATION & CRYPTO TESTS   ");
console.log("=================================================\n");

// 1. URL Canonicalization Tests
console.log("--- 1. CANONICALIZE URL TESTS ---");
const CANONICAL_PROD = "https://algoxilla-certificate-platform-1.vercel.app";

const testUrls = [
  "https://algoxilla-certificate-platform-1.vercel.app",
  "https://algoxilla-certificate-platform-1.vercel.app/",
  "https://algoxilla-certificate-platform-1-of4b9z56r.vercel.app",
  "https://algoxilla-certificate-platform-1-3wu6d64cf.vercel.app",
  "https://algoxilla-certificate-platform-1-haxmvuu83.vercel.app",
  "https://algoxilla-certificate-platform-12-op0lzncb0.vercel.app",
  "https://algoxilla-certificate-platform-q1q7-jphipith5.vercel.app",
  "https://verify.algoxilla.com",
  "http://verify.algoxilla.com/",
];

for (const u of testUrls) {
  const canonical = canonicalizeUrl(u);
  assert.equal(canonical, CANONICAL_PROD, `Expected canonical URL for ${u} to be ${CANONICAL_PROD}, got ${canonical}`);
  console.log(`✓ Canonicalized: ${u} -> ${canonical}`);
}

// Custom unrelated URLs should remain unchanged
assert.equal(canonicalizeUrl("https://example.com/subpath"), "https://example.com/subpath");
console.log("✓ Unrelated URLs untouched: https://example.com/subpath");

// 2. Public Application URL vs. Verification Base URL Isolation
console.log("\n--- 2. APPLICATION ROUTE ORIGIN ISOLATION ---");
const origAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const origVerifyUrl = process.env.NEXT_PUBLIC_VERIFY_BASE_URL;

try {
  // Test scenario A: verify URL is configured to an old preview, but app URL is production
  process.env.NEXT_PUBLIC_APP_URL = "https://algoxilla-certificate-platform-1.vercel.app";
  process.env.NEXT_PUBLIC_VERIFY_BASE_URL = "https://algoxilla-certificate-platform-1-of4b9z56r.vercel.app";

  const publicApp = getPublicAppUrl();
  assert.equal(publicApp, CANONICAL_PROD, `getPublicAppUrl must return ${CANONICAL_PROD}, got ${publicApp}`);
  console.log("✓ getPublicAppUrl correctly prioritizes NEXT_PUBLIC_APP_URL over NEXT_PUBLIC_VERIFY_BASE_URL");

  // Test scenario B: NEXT_PUBLIC_APP_URL unset, but NEXT_PUBLIC_VERIFY_BASE_URL set
  delete process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_VERIFY_BASE_URL = "https://verify.algoxilla.com";
  // In production mode, getPublicAppUrl should return canonical prod, not verify.algoxilla.com
  process.env.NODE_ENV = "production";
  const publicAppFallback = getPublicAppUrl();
  assert.equal(publicAppFallback, CANONICAL_PROD, "getPublicAppUrl must NEVER use NEXT_PUBLIC_VERIFY_BASE_URL");
  console.log("✓ getPublicAppUrl strictly ignores NEXT_PUBLIC_VERIFY_BASE_URL");

  // Verification URL should use verification base URL when preferPublicDomain is true
  const qrUrl = getVerificationUrl("ALGO-2026-TEST-HELLO", true);
  assert.equal(qrUrl, `${CANONICAL_PROD}/verify/ALGO-2026-TEST-HELLO`);
  console.log("✓ getVerificationUrl constructs canonical verification link:", qrUrl);

} finally {
  if (origAppUrl !== undefined) process.env.NEXT_PUBLIC_APP_URL = origAppUrl;
  else delete process.env.NEXT_PUBLIC_APP_URL;
  if (origVerifyUrl !== undefined) process.env.NEXT_PUBLIC_VERIFY_BASE_URL = origVerifyUrl;
  else delete process.env.NEXT_PUBLIC_VERIFY_BASE_URL;
}

// 3. Cryptographic Claim Token Integrity
console.log("\n--- 3. CRYPTOGRAPHIC CLAIM TOKEN INTEGRITY ---");
const rawToken = generateRawClaimToken();
assert.equal(typeof rawToken, "string");
assert.equal(rawToken.length, 64, "Raw token must be 64-char hex (256-bit entropy)");

const hash1 = hashClaimToken(rawToken);
const hash2 = hashClaimToken(rawToken);
assert.equal(hash1, hash2, "hashClaimToken must be deterministic for identical secret and token");
assert.notEqual(rawToken, hash1, "Token hash must not match plaintext token");

assert.equal(verifyClaimToken(rawToken, hash1), true, "verifyClaimToken must return true for matching hash");
assert.equal(verifyClaimToken(rawToken + "a", hash1), false, "verifyClaimToken must reject modified token");
assert.equal(verifyClaimToken(rawToken, "00".repeat(32)), false, "verifyClaimToken must reject mismatched hash");
console.log("✓ HMAC-SHA256 token generation and constant-time verification pass");

// Expiry
const futureIso = calculateTokenExpiry(15);
assert.equal(isTokenExpired(futureIso), false, "Fresh token must not be expired");
const pastIso = new Date(Date.now() - 1000).toISOString();
assert.equal(isTokenExpired(pastIso), true, "Past token must be expired");
console.log("✓ Token expiry calculations and validations pass");

// 4. Session Token Signing & Validation
console.log("\n--- 4. SESSION TOKEN SIGNING & VALIDATION ---");
const session = createSignedSessionToken({
  participantId: "synth-part-hello-algoxilla",
  email: "hello@algoxilla.com",
  role: "PARTICIPANT",
});
assert.equal(typeof session, "string");
const verifiedPayload = verifySessionToken(session);
assert.notEqual(verifiedPayload, null);
assert.equal(verifiedPayload.email, "hello@algoxilla.com");
assert.equal(verifiedPayload.participantId, "synth-part-hello-algoxilla");
assert.equal(verifiedPayload.role, "PARTICIPANT");

// Tampering check
const tamperedSession = session.slice(0, -4) + "abcd";
assert.equal(verifySessionToken(tamperedSession), null, "Tampered session token must be rejected");
console.log("✓ Session token creation and tamper detection pass");

console.log("\n=================================================");
console.log("   ALL CLAIM LINK & CRYPTO TESTS PASSED!         ");
console.log("=================================================");

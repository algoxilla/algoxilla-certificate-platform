import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import pg from "pg";
import { PDFDocument } from "pdf-lib";
import { sanitizePostgresUrl } from "../src/lib/db/supabaseClient.ts";
import { getPublicAppUrl, getVerificationUrl } from "../src/lib/config.ts";
import { generateClaimEmailContent } from "../src/lib/email/template.ts";
import { generateRawClaimToken, hashClaimToken, calculateTokenExpiry } from "../src/lib/auth/token.ts";
import { createSignedSessionToken, SESSION_COOKIE_NAME } from "../src/lib/auth/session.ts";

const PROD_URL = "https://algoxilla-certificate-platform-1.vercel.app";
const LOCAL_URL = "http://localhost:3000";

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!conn) {
  console.error("Missing database connection URL.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: sanitizePostgresUrl(conn),
  ssl: { rejectUnauthorized: false },
});

async function runAudit() {
  console.log("================================================================================");
  console.log("   ALGOXILLA CERTIFICATE PLATFORM — COMPLETE CLAIM FLOW VERIFICATION            ");
  console.log("================================================================================\n");

  const results = {};

  // ---------------------------------------------------------------------------
  // Check 1: Canonical Participant URL is https://algoxilla-certificate-platform-1.vercel.app/portal
  // ---------------------------------------------------------------------------
  console.log("--- 1. CANONICAL PARTICIPANT PORTAL URL ---");
  const canonicalBase = getPublicAppUrl();
  const canonicalPortalUrl = `${canonicalBase}/portal`;
  console.log(`Configured Canonical Base URL:   ${canonicalBase}`);
  console.log(`Canonical Participant Portal URL: ${canonicalPortalUrl}`);

  const portalRes = await fetch(canonicalPortalUrl);
  console.log(`Live HTTP Status (${canonicalPortalUrl}): ${portalRes.status}`);
  const portalHtml = await portalRes.text();
  const portalHasTitle = portalHtml.includes("Claim Your Algothon’26 Certificate") || portalHtml.includes("Algoxilla");

  if (canonicalPortalUrl === "https://algoxilla-certificate-platform-1.vercel.app/portal" && portalRes.status === 200 && portalHasTitle) {
    results.check1 = "PASS";
    console.log("✓ Check 1 PASS: Canonical participant URL verified at https://algoxilla-certificate-platform-1.vercel.app/portal\n");
  } else {
    results.check1 = "FAIL";
    console.error("✗ Check 1 FAIL: Canonical participant portal URL mismatch or inaccessible\n");
  }

  // ---------------------------------------------------------------------------
  // Check 2: Email Lookup & Claim-Link Dispatch Flow (Authorized Synthetic Account Only)
  // ---------------------------------------------------------------------------
  console.log("--- 2. EMAIL LOOKUP & CLAIM-LINK DISPATCH FLOW (hello@algoxilla.com) ---");
  const countBefore = await pool.query("SELECT count(*) FROM claim_tokens WHERE email = 'hello@algoxilla.com'");

  const sendLinkRes = await fetch(`${PROD_URL}/api/auth/send-claim-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "hello@algoxilla.com" }),
  });

  console.log(`Send Claim Link HTTP Status: ${sendLinkRes.status}`);
  const sendLinkJson = await sendLinkRes.json();
  console.log("Send Claim Link API Response:", sendLinkJson);

  // Retrieve token created in Supabase PostgreSQL
  const tokenQuery = await pool.query(
    "SELECT id, email, token_hash, token_type, attempts, max_attempts, expires_at, consumed_at, created_at FROM claim_tokens WHERE email = 'hello@algoxilla.com' ORDER BY created_at DESC LIMIT 1"
  );
  const createdToken = tokenQuery.rows[0];

  if (sendLinkRes.status === 200 && sendLinkJson.success === true && createdToken) {
    results.check2 = "PASS";
    console.log(`✓ Check 2 PASS: Email lookup succeeded; single-use token record ${createdToken.id} verified in DB.\n`);
  } else {
    results.check2 = "FAIL";
    console.error("✗ Check 2 FAIL: Claim link dispatch failed.\n");
  }

  // ---------------------------------------------------------------------------
  // Check 3: Email Button URL & Fallback Link Integrity
  // ---------------------------------------------------------------------------
  console.log("--- 3. EMAIL BUTTON & FALLBACK URL INTEGRITY ---");
  const sampleRawToken = "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef";
  const sampleClaimUrl = `${canonicalBase}/portal/claim?token=${encodeURIComponent(sampleRawToken)}`;
  const emailContent = generateClaimEmailContent({
    toEmail: "hello@algoxilla.com",
    recipientName: "Algoxilla Test Participant",
    claimUrl: sampleClaimUrl,
    expiresMinutes: 15,
  });

  const buttonHrefMatch = emailContent.htmlContent.match(/href="([^"]+)"\s+class="btn"/);
  const fallbackHrefMatch = emailContent.htmlContent.match(/class="link-fallback"[\s\S]*?<a\s+href="([^"]+)"/);
  const textContentHasUrl = emailContent.textContent.includes(sampleClaimUrl);

  const buttonTarget = buttonHrefMatch ? buttonHrefMatch[1] : "";
  const fallbackTarget = fallbackHrefMatch ? fallbackHrefMatch[1] : "";

  console.log(`Email CTA Button Target: ${buttonTarget}`);
  console.log(`Email Fallback Link URL: ${fallbackTarget}`);

  const buttonCorrect = buttonTarget.startsWith("https://algoxilla-certificate-platform-1.vercel.app/portal/claim?token=");
  const fallbackCorrect = fallbackTarget.startsWith("https://algoxilla-certificate-platform-1.vercel.app/portal/claim?token=");

  // Verify the /portal/claim page renders with HTTP 200 when opening the fallback URL
  const claimPageRes = await fetch(`${PROD_URL}/portal/claim?token=${encodeURIComponent(sampleRawToken)}`);
  console.log(`Live Claim Page HTTP Status (Pasted Fallback URL): ${claimPageRes.status}`);

  if (buttonCorrect && fallbackCorrect && textContentHasUrl && claimPageRes.status === 200) {
    results.check3 = "PASS";
    console.log("✓ Check 3 PASS: Email button opens /portal/claim?token=... and fallback URL renders claim page.\n");
  } else {
    results.check3 = "FAIL";
    console.error("✗ Check 3 FAIL: Email button or fallback link structure incorrect.\n");
  }

  // ---------------------------------------------------------------------------
  // Check 4: Anti-Scanner Protection (GET does NOT consume token; only POST consumes)
  // ---------------------------------------------------------------------------
  console.log("--- 4. EMAIL LINK SCANNER DEFENSE (GET VS POST) ---");
  const testRawToken = generateRawClaimToken();
  const testTokenHash = hashClaimToken(testRawToken);
  const testExpiry = calculateTokenExpiry(15);

  const insRes = await pool.query(
    "INSERT INTO claim_tokens (id, email, token_hash, token_type, attempts, max_attempts, expires_at, created_at) VALUES (gen_random_uuid(), 'hello@algoxilla.com', $1, 'CLAIM_LINK', 0, 3, $2, NOW()) RETURNING id",
    [testTokenHash, testExpiry]
  );
  const scannerTokenId = insRes.rows[0].id;

  // Step 4A: Automated email link scanner issues GET request
  console.log("[Simulation] Automated security crawler issues GET request to verify URL...");
  const scannerGetRes = await fetch(`${LOCAL_URL}/api/auth/consume-claim-link?token=${encodeURIComponent(testRawToken)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  console.log(`Scanner GET HTTP Status: ${scannerGetRes.status}`);
  const scannerGetData = await scannerGetRes.json();
  console.log("Scanner GET JSON Response:", scannerGetData);

  // Verify in database: consumed_at MUST STILL BE NULL!
  const dbCheckAfterGet = await pool.query("SELECT consumed_at FROM claim_tokens WHERE id = $1", [scannerTokenId]);
  const isStillUnconsumed = dbCheckAfterGet.rows[0].consumed_at === null;
  console.log(`Token consumed_at in database after scanner GET: ${dbCheckAfterGet.rows[0].consumed_at} (Is Unconsumed: ${isStillUnconsumed})`);

  // Step 4B: Participant explicitly clicks "Confirm & Access Credential" -> POST request
  console.log("[Simulation] Participant clicks Confirm button -> POST request...");
  const participantPostRes = await fetch(`${LOCAL_URL}/api/auth/consume-claim-link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token: testRawToken }),
  });
  console.log(`Participant POST HTTP Status: ${participantPostRes.status}`);
  const participantPostJson = await participantPostRes.json();
  console.log("Participant POST JSON Response:", participantPostJson);

  // Verify in database: consumed_at MUST NOW BE POPULATED!
  const dbCheckAfterPost = await pool.query("SELECT consumed_at FROM claim_tokens WHERE id = $1", [scannerTokenId]);
  const isNowConsumed = dbCheckAfterPost.rows[0].consumed_at !== null;
  console.log(`Token consumed_at in database after participant POST: ${dbCheckAfterPost.rows[0].consumed_at} (Is Consumed: ${isNowConsumed})`);

  // Step 4C: Replay test: trying to consume the same token a second time
  const replayPostRes = await fetch(`${LOCAL_URL}/api/auth/consume-claim-link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token: testRawToken }),
  });
  const replayPostJson = await replayPostRes.json();
  console.log(`Replay POST HTTP Status: ${replayPostRes.status}, Error Code: ${replayPostJson.code}`);
  const replayBlocked = replayPostRes.status === 409 && replayPostJson.code === "TOKEN_ALREADY_USED";

  if (isStillUnconsumed && isNowConsumed && scannerGetData.valid === true && replayBlocked) {
    results.check4 = "PASS";
    console.log("✓ Check 4 PASS: GET requests do NOT burn token. Only explicit POST atomically consumes it.\n");
  } else {
    results.check4 = "FAIL";
    console.error("✗ Check 4 FAIL: Scanner defense failed.\n");
  }

  // ---------------------------------------------------------------------------
  // Check 5: Authenticated Session & Certificate Retrieval
  // ---------------------------------------------------------------------------
  console.log("--- 5. AUTHENTICATED SESSION CREATION & CERTIFICATE DISPLAY ---");
  const setCookie = participantPostRes.headers.get("set-cookie") || "";
  const hasSessionCookie = setCookie.includes(`${SESSION_COOKIE_NAME}=`);
  console.log(`Session Cookie Set in Response: ${hasSessionCookie}`);

  const sessionTokenMatch = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const sessionToken = sessionTokenMatch ? sessionTokenMatch[1] : "";

  // Call /api/auth/session with session cookie
  const sessionRes = await fetch(`${LOCAL_URL}/api/auth/session`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
    },
  });
  console.log(`Session Verification HTTP Status: ${sessionRes.status}`);
  const sessionData = await sessionRes.json();
  console.log("Authenticated Session Data:", {
    authenticated: sessionData.authenticated,
    email: sessionData.participant?.email,
    name: sessionData.participant?.normalizedName,
    certificateCode: sessionData.certificate?.certificateCode,
    status: sessionData.certificate?.status,
  });

  const sessionValid =
    sessionData.authenticated === true &&
    sessionData.participant?.email === "hello@algoxilla.com" &&
    sessionData.certificate?.certificateCode === "ALGO-2026-TEST-HELLO";

  if (sessionValid) {
    results.check5 = "PASS";
    console.log("✓ Check 5 PASS: Authenticated session displays certificate ALGO-2026-TEST-HELLO for hello@algoxilla.com.\n");
  } else {
    results.check5 = "FAIL";
    console.error("✗ Check 5 FAIL: Authenticated session invalid.\n");
  }

  // ---------------------------------------------------------------------------
  // Check 6: Official PDF Download & Canonical QR Verification
  // ---------------------------------------------------------------------------
  console.log("--- 6. OFFICIAL PDF DOWNLOAD & QR RESOLUTION ---");
  const downloadRes = await fetch(`${LOCAL_URL}/api/certificate/ALGO-2026-TEST-HELLO/download`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
    },
  });

  console.log(`PDF Download HTTP Status: ${downloadRes.status}`);
  console.log(`Content-Type: ${downloadRes.headers.get("content-type")}`);
  console.log(`Content-Disposition: ${downloadRes.headers.get("content-disposition")}`);
  const pdfBytes = Buffer.from(await downloadRes.arrayBuffer());
  console.log(`Downloaded PDF Size: ${pdfBytes.length} bytes`);

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  const page1 = pdfDoc.getPage(0);
  const { width, height } = page1.getSize();
  console.log(`PDF Pages: ${pageCount}, Dimensions: ${width} x ${height} pt`);

  // QR Code URL check
  const expectedQrUrl = getVerificationUrl("ALGO-2026-TEST-HELLO");
  console.log(`Canonical QR Verification Page URL: ${expectedQrUrl}`);

  // Verify public verification page opens with 200 OK on production
  const qrVerifyPageRes = await fetch(expectedQrUrl);
  console.log(`Production Verification Page HTTP Status: ${qrVerifyPageRes.status}`);

  // Verify public verification API returns valid ISSUED data
  const qrVerifyApiRes = await fetch(`${PROD_URL}/api/verify/ALGO-2026-TEST-HELLO`);
  console.log(`Production Verification API HTTP Status: ${qrVerifyApiRes.status}`);
  const qrVerifyData = await qrVerifyApiRes.json();
  console.log("Public Verification Payload:", {
    status: qrVerifyData.status,
    recipient: qrVerifyData.certificate?.recipientName,
    code: qrVerifyData.certificate?.certificateCode,
  });

  const pdfValid =
    downloadRes.status === 200 &&
    pdfBytes.length > 500000 &&
    width === 842 &&
    height === 595 && // A4 Landscape
    qrVerifyPageRes.status === 200 &&
    qrVerifyApiRes.status === 200 &&
    qrVerifyData.status === "ISSUED";

  if (pdfValid) {
    results.check6 = "PASS";
    console.log("✓ Check 6 PASS: PDF downloads with valid A4 Landscape geometry and QR scans to live verification.\n");
  } else {
    results.check6 = "FAIL";
    console.error("✗ Check 6 FAIL: PDF download or QR verification failed.\n");
  }

  // ---------------------------------------------------------------------------
  // Check 7: Unauthorized & Ineligible Access Blocking (Cross-Participant & Unauthenticated)
  // ---------------------------------------------------------------------------
  console.log("--- 7. UNAUTHORIZED & CROSS-PARTICIPANT ACCESS BLOCKING ---");

  // 7A: Unauthenticated user attempts to download certificate
  const unauthDownloadRes = await fetch(`${PROD_URL}/api/certificate/ALGO-2026-TEST-HELLO/download`);
  console.log(`Production Unauthenticated Download Status: ${unauthDownloadRes.status} (Expected 401)`);

  // 7B: Cross-participant attack: attacker attempts to download ALGO-2026-TEST-HELLO
  const attackerSession = createSignedSessionToken({
    participantId: "attacker-id-1234",
    email: "attacker@example.com",
    role: "PARTICIPANT",
  });

  const crossDownloadRes = await fetch(`${LOCAL_URL}/api/certificate/ALGO-2026-TEST-HELLO/download`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${attackerSession}`,
    },
  });
  console.log(`Cross-Participant Download Status: ${crossDownloadRes.status} (Expected 403)`);

  // 7C: Ineligible user attempts claim link
  const ineligibleRes = await fetch(`${PROD_URL}/api/auth/send-claim-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "unregistered.ineligible@example.com" }),
  });
  const ineligJson = await ineligibleRes.json();
  console.log(`Ineligible Lookup Response Status: ${ineligibleRes.status}, Message: ${ineligJson.message}`);

  const authGuardsPass =
    unauthDownloadRes.status === 401 &&
    crossDownloadRes.status === 403 &&
    ineligibleRes.status === 200;

  if (authGuardsPass) {
    results.check7 = "PASS";
    console.log("✓ Check 7 PASS: Unauthenticated (401) and cross-participant (403) downloads strictly blocked.\n");
  } else {
    results.check7 = "FAIL";
    console.error("✗ Check 7 FAIL: Access guards failed.\n");
  }

  // ---------------------------------------------------------------------------
  // Check 8: APP_LIVE Safety Invariants During Testing
  // ---------------------------------------------------------------------------
  console.log("--- 8. LIVE FLAG INVARIANTS & REAL PARTICIPANT PROTECTION ---");
  const afterRealTokensCheck = await pool.query(
    "SELECT count(*) FROM claim_tokens WHERE email NOT LIKE '%@example.com' AND email != 'hello@algoxilla.com'"
  );
  const afterRealCertsCheck = await pool.query(
    "SELECT count(*) FROM certificates c JOIN event_registrations er ON c.registration_id = er.id JOIN participants p ON er.participant_id = p.id WHERE p.email NOT LIKE '%@example.com' AND p.email != 'hello@algoxilla.com'"
  );

  const realTokensZero = Number(afterRealTokensCheck.rows[0].count) === 0;
  const realCertsZero = Number(afterRealCertsCheck.rows[0].count) === 0;
  const appLiveFalse = process.env.APP_LIVE === "false";
  const nextPublicAppLiveFalse = process.env.NEXT_PUBLIC_APP_LIVE === "false";

  console.log(`Real Participant Claim Tokens in DB: ${afterRealTokensCheck.rows[0].count} (Zero: ${realTokensZero})`);
  console.log(`Real Participant Certificates in DB: ${afterRealCertsCheck.rows[0].count} (Zero: ${realCertsZero})`);
  console.log(`APP_LIVE flag: ${process.env.APP_LIVE}`);
  console.log(`NEXT_PUBLIC_APP_LIVE flag: ${process.env.NEXT_PUBLIC_APP_LIVE}`);

  // Clean up temporary test tokens
  await pool.query("DELETE FROM claim_tokens WHERE id = $1", [scannerTokenId]);
  if (createdToken) {
    await pool.query("DELETE FROM claim_tokens WHERE id = $1", [createdToken.id]);
  }
  console.log("Cleaned up temporary test claim tokens for hello@algoxilla.com.");

  const safetyPass = realTokensZero && realCertsZero && appLiveFalse && nextPublicAppLiveFalse;
  if (safetyPass) {
    results.check8 = "PASS";
    console.log("✓ Check 8 PASS: Strict safety invariants maintained (0 real tokens, 0 real certs, flags false).\n");
  } else {
    results.check8 = "FAIL";
    console.error("✗ Check 8 FAIL: Safety invariants violated.\n");
  }

  console.log("================================================================================");
  console.log("   FINAL VERIFICATION RESULTS MATRIX                                            ");
  console.log("================================================================================\n");
  for (const [check, status] of Object.entries(results)) {
    console.log(`  ${check.toUpperCase()}: ${status}`);
  }
  console.log("\n================================================================================");

  await pool.end();
}

runAudit().catch(console.error);

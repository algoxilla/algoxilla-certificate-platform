// Algoxilla Certificate Platform - Live Production Verification & Invariant Audit
// Tests live production endpoints, suppresses demo banners, verifies public verification,
// and audits real participant safety without sending unsolicited emails.

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import pg from "pg";
import { sanitizePostgresUrl } from "../src/lib/db/supabaseClient.ts";

function loadEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const fullPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (match) {
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[match[1]] === undefined) process.env[match[1]] = val;
        }
      }
    } catch {}
  }
}
loadEnv();

const PROD_URL = "https://algoxilla-certificate-platform-1.vercel.app";
const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!conn) {
  console.error("Missing database connection URL.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: sanitizePostgresUrl(conn),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("=================================================");
  console.log("   LIVE PRODUCTION VERIFICATION & SAFETY AUDIT   ");
  console.log("   Target URL: " + PROD_URL);
  console.log("=================================================\n");

  // 1. Live Public Certificate Verification on Production
  console.log("--- 1. LIVE PUBLIC CERTIFICATE VERIFICATION ---");
  const verifyRes = await fetch(`${PROD_URL}/api/verify/ALGO-2026-TEST-HELLO`);
  console.log(`Verify Endpoint HTTP Status: ${verifyRes.status}`);
  const verifyData = await verifyRes.json();
  console.log("Verification Response:", {
    status: verifyData.status,
    recipient: verifyData.certificate?.recipientName,
    code: verifyData.certificate?.certificateCode,
    db: verifyData.databaseIntegration,
  });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyData.status, "ISSUED");
  assert.equal(verifyData.certificate?.recipientName, "Algoxilla Test Participant");
  assert.equal(verifyData.certificate?.certificateCode, "ALGO-2026-TEST-HELLO");
  assert.equal(verifyData.databaseIntegration, "CONNECTED");
  console.log("✓ Live production certificate verification returns 200 ISSUED for ALGO-2026-TEST-HELLO!");

  // 2. Live Portal Page Audit (Suppression of Demo Artifacts)
  console.log("\n--- 2. LIVE PORTAL PAGE DEMO SUPPRESSION AUDIT ---");
  const portalRes = await fetch(`${PROD_URL}/portal`);
  console.log(`Portal Page HTTP Status: ${portalRes.status}`);
  const portalHtml = await portalRes.text();

  const hasDemoBanner = portalHtml.includes("Phase 1 Demo Mode") || portalHtml.includes("Strict Mock Data Prototype");
  const hasAlexChen = portalHtml.includes("Alex Chen (Eligible)");
  const hasPriyaSharma = portalHtml.includes("Priya Sharma (Correction Pending)");
  const hasDavidKim = portalHtml.includes("David Kim (Pending Review)");
  const hasProductionReady = portalHtml.includes("Status: Production Ready");

  console.log(`Has Phase 1 Demo Banner: ${hasDemoBanner}`);
  console.log(`Has Alex Chen Quick-Fill: ${hasAlexChen}`);
  console.log(`Has Priya Sharma Quick-Fill: ${hasPriyaSharma}`);
  console.log(`Has David Kim Quick-Fill: ${hasDavidKim}`);
  console.log(`Has Status Production Ready: ${hasProductionReady}`);

  assert.equal(hasDemoBanner, false, "Phase 1 Demo Banner must be completely absent in production");
  assert.equal(hasAlexChen, false, "Alex Chen demo button must be completely absent in production");
  assert.equal(hasPriyaSharma, false, "Priya Sharma demo button must be completely absent in production");
  assert.equal(hasDavidKim, false, "David Kim demo button must be completely absent in production");
  assert.equal(hasProductionReady, true, "Footer must indicate Status: Production Ready");
  console.log("✓ Live production portal strictly suppresses all demo artifacts and mock banners!");

  // 3. Live Token Rejection Invariants
  console.log("\n--- 3. LIVE TOKEN REJECTION INVARIANTS ---");
  // 3A: Malformed short token
  const shortRes = await fetch(`${PROD_URL}/api/auth/consume-claim-link?token=abc`, { redirect: "manual" });
  const shortLoc = shortRes.headers.get("location") || "";
  console.log(`Short Token Status: ${shortRes.status}, Location: ${shortLoc}`);
  assert.equal(shortRes.status, 307);
  assert.ok(shortLoc.startsWith(PROD_URL), "Redirect must use canonical production URL");
  assert.ok(shortLoc.includes("error=TOKEN_INVALID"), "Short token must yield TOKEN_INVALID");
  console.log("✓ Malformed token safely rejected with HTTP 307 redirect to canonical URL with TOKEN_INVALID");

  // 3B: Non-existent token
  const fakeToken = "f".repeat(64);
  const fakeRes = await fetch(`${PROD_URL}/api/auth/consume-claim-link?token=${fakeToken}`, { redirect: "manual" });
  const fakeLoc = fakeRes.headers.get("location") || "";
  console.log(`Fake Token Status: ${fakeRes.status}, Location: ${fakeLoc}`);
  assert.equal(fakeRes.status, 307);
  assert.ok(fakeLoc.startsWith(PROD_URL), "Redirect must use canonical production URL");
  assert.ok(fakeLoc.includes("error=TOKEN_NOT_FOUND"), "Fake token must yield TOKEN_NOT_FOUND");
  console.log("✓ Non-existent token safely rejected with HTTP 307 redirect to canonical URL with TOKEN_NOT_FOUND");

  // 3C: Dedicated Claim Confirmation Page Rendering
  const claimPageRes = await fetch(`${PROD_URL}/portal/claim?token=${fakeToken}`);
  console.log(`Claim Page Status: ${claimPageRes.status}`);
  assert.equal(claimPageRes.status, 200, "Claim confirmation page must return HTTP 200");
  const claimPageHtml = await claimPageRes.text();
  assert.ok(claimPageHtml.includes("Claim Your Certificate") || claimPageHtml.includes("Algothon"), "Claim page must render certificate claim UI");
  console.log("✓ Dedicated interactive claim confirmation page renders successfully with HTTP 200");

  // 4. Live Session Endpoint Unauthorized Protection
  console.log("\n--- 4. LIVE SESSION ENDPOINT AUTH PROTECTION ---");
  const unauthRes = await fetch(`${PROD_URL}/api/auth/session`);
  const unauthData = await unauthRes.json();
  console.log("Unauthenticated Session Response:", unauthData);
  assert.equal(unauthRes.status, 200);
  assert.equal(unauthData.authenticated, false);
  console.log("✓ Unauthenticated session request safely returns authenticated: false");

  // 5. Invariant Audit on Real Participant Gopika S
  console.log("\n--- 5. REAL PARTICIPANT (GOPIKA S) SAFETY AUDIT ---");
  const gopikaRes = await pool.query(`
    SELECT 
      p.email,
      p.normalized_name,
      e.eligibility_status,
      e.attendance_confirmed
    FROM participants p
    JOIN event_registrations r ON r.participant_id = p.id
    JOIN eligibility_records e ON e.registration_id = r.id
    WHERE p.email = 'gopikasen43@gmail.com';
  `);
  console.log("Gopika S status:", gopikaRes.rows[0]);
  assert.equal(gopikaRes.rows[0].attendance_confirmed, 1, "Gopika S attendance must be 1 (confirmed by organizer)");
  assert.equal(gopikaRes.rows[0].eligibility_status, "ELIGIBLE", "Gopika S eligibility must be ELIGIBLE");

  const certRes = await pool.query(`
    SELECT c.* FROM certificates c
    JOIN event_registrations r ON c.registration_id = r.id
    JOIN participants p ON r.participant_id = p.id
    WHERE p.email = 'gopikasen43@gmail.com';
  `);
  assert.equal(certRes.rows.length, 0, "Zero certificates must exist for Gopika S");
  console.log("✓ Real participant records verified with attendance=1, eligibility=ELIGIBLE, 0 certificates");

  await pool.end();

  console.log("\n=================================================");
  console.log("   ALL LIVE PRODUCTION CHECKS PASSED CLEANLY!    ");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR IN LIVE TEST:", err);
  process.exit(1);
});

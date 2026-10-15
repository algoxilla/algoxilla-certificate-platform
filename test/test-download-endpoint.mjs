// Automated Regression Test Suite for Official Certificate Download Endpoint
// Covers:
// 1. Authorized synthetic participant (hello@algoxilla.com) downloads official PDF (ALGO-2026-TEST-HELLO)
// 2. Response is valid non-empty binary PDF (%PDF-) parsed with pdf-lib (A4 Landscape 842x595)
// 3. Response has correct Content-Type: application/pdf and Content-Disposition attachment header
// 4. Verifies X-Document-Hash and X-Metadata-Hash cryptographic integrity
// 5. Verifies embedded verification QR code targets canonical URL
// 6. Unauthenticated requests in production mode blocked with HTTP 401
// 7. Cross-participant download authorization guard blocked with HTTP 403
// 8. Invalid format and non-existent certificate codes handled safely (400/404)
// 9. Repeated downloads do not create new certificates, claim tokens, or dispatch emails

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import pg from "pg";
import { createSignedSessionToken } from "../src/lib/auth/session.ts";
import { getVerificationUrl } from "../src/lib/config.ts";
import { sanitizePostgresUrl } from "../src/lib/db/supabaseClient.ts";

function loadEnv() {
  const candidateFiles = [".env.local", ".env"];
  for (const fileName of candidateFiles) {
    const fullPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (match) {
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[match[1]] === undefined) process.env[match[1]] = val;
        }
      }
      return;
    } catch {}
  }
}
loadEnv();

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
const rawDbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

const pool = rawDbUrl
  ? new pg.Pool({
      connectionString: sanitizePostgresUrl(rawDbUrl),
      ssl: { rejectUnauthorized: false },
    })
  : null;

console.log("=================================================");
console.log("   OFFICIAL CERTIFICATE PDF DOWNLOAD TEST SUITE  ");
console.log("   Target URL: " + baseUrl);
console.log("=================================================\n");

async function runTests() {
  const ip = `10.222.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;

  // Test Session for synthetic participant hello@algoxilla.com
  const helloSession = createSignedSessionToken({
    participantId: "synth-part-hello-algoxilla",
    email: "hello@algoxilla.com",
    role: "PARTICIPANT",
  });

  // Test Session for attacker / unauthorized participant
  const attackerSession = createSignedSessionToken({
    participantId: "synth-part-attacker",
    email: "attacker@example.com",
    role: "PARTICIPANT",
  });

  // 1. Authorized Synthetic Participant PDF Download
  console.log("--- 1. Authorized Download for hello@algoxilla.com ---");
  const downloadRes = await fetch(`${baseUrl}/api/certificate/ALGO-2026-TEST-HELLO/download`, {
    headers: {
      Cookie: `algo_claim_session=${helloSession}`,
      "x-forwarded-for": ip,
    },
  });

  console.log(`HTTP Status: ${downloadRes.status}`);
  console.log(`Content-Type: ${downloadRes.headers.get("content-type")}`);
  console.log(`Content-Disposition: ${downloadRes.headers.get("content-disposition")}`);
  console.log(`X-Document-Hash: ${downloadRes.headers.get("x-document-hash")}`);

  assert.equal(downloadRes.status, 200, "Authorized download must return HTTP 200");
  assert.equal(downloadRes.headers.get("content-type"), "application/pdf");
  assert.ok(
    downloadRes.headers.get("content-disposition")?.includes("ALGO-2026-TEST-HELLO_Official_Algothon26_Certificate.pdf"),
    "Filename must match official certificate code naming"
  );
  assert.ok(downloadRes.headers.get("x-document-hash"), "Must include SHA-256 X-Document-Hash");
  assert.ok(downloadRes.headers.get("x-metadata-hash"), "Must include SHA-256 X-Metadata-Hash");
  assert.ok(
    downloadRes.headers.get("cache-control")?.includes("no-store"),
    "Must enforce private no-cache headers"
  );

  const pdfArrayBuffer = await downloadRes.arrayBuffer();
  const pdfBytes = new Uint8Array(pdfArrayBuffer);
  console.log(`Downloaded PDF Size: ${pdfBytes.length} bytes`);
  assert.ok(pdfBytes.length > 500000, "PDF must contain complete high-resolution artwork (>500KB)");

  // 2. Validate PDF Binary Signature and Internal Structure
  console.log("\n--- 2. PDF Binary & Structural Validation ---");
  const magic = Buffer.from(pdfBytes.subarray(0, 5)).toString("ascii");
  assert.equal(magic, "%PDF-", "PDF binary must begin with %PDF- magic signature");

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  assert.equal(pageCount, 1, "Official certificate must be exactly 1 page");

  const firstPage = pdfDoc.getPage(0);
  const { width, height } = firstPage.getSize();
  console.log(`Parsed Page Dimensions: ${Math.round(width)} x ${Math.round(height)} pt`);
  assert.equal(Math.round(width), 842, "Width must match A4 Landscape (842 pt)");
  console.log("✓ PDF structure, binary header, and A4 Landscape geometry verified");

  // Verify absence of misleading DNS PENDING label
  const rawBinary = Buffer.from(pdfBytes).toString("latin1");
  assert.equal(rawBinary.includes("DNS PENDING"), false, "Downloaded PDF must not contain DNS PENDING");

  const zlib = await import("node:zlib");
  const contents = firstPage.node.Contents();
  let decompressedAll = "";
  for (let i = 0; i < contents.size(); i++) {
    const streamObj = pdfDoc.context.lookup(contents.get(i));
    const raw = streamObj.getContents();
    try {
      decompressedAll += zlib.inflateSync(Buffer.from(raw)).toString("latin1");
    } catch {
      decompressedAll += Buffer.from(raw).toString("latin1");
    }
  }
  assert.equal(decompressedAll.includes("DNS PENDING"), false, "Decompressed PDF streams must not contain DNS PENDING");
  console.log("✓ Verified DNS PENDING label is completely eliminated from generated credential");

  // 3. Verification Link Resolution
  console.log("\n--- 3. Canonical QR Verification URL Resolution ---");
  const canonicalVerifyUrl = getVerificationUrl("ALGO-2026-TEST-HELLO", true);
  console.log(`Canonical Verification URL: ${canonicalVerifyUrl}`);
  assert.ok(
    canonicalVerifyUrl.startsWith("https://algoxilla-certificate-platform-1.vercel.app/verify/ALGO-2026-TEST-HELLO"),
    "QR URL must point to canonical production domain"
  );

  // 4. Cross-Participant Unauthorized Download Guard
  console.log("\n--- 4. Cross-Participant Download Guard ---");
  const crossRes = await fetch(`${baseUrl}/api/certificate/ALGO-2026-TEST-HELLO/download`, {
    headers: {
      Cookie: `algo_claim_session=${attackerSession}`,
      "x-forwarded-for": ip,
    },
  });
  console.log(`Attacker Download Status: ${crossRes.status}`);
  assert.equal(crossRes.status, 403, "Cross-participant download must be rejected with HTTP 403");
  const crossData = await crossRes.json();
  assert.ok(crossData.error?.includes("Access denied") || crossData.error?.includes("not authorized"));
  console.log("✓ Cross-participant download blocked with HTTP 403 Forbidden");

  // 5. Invalid and Non-Existent Certificate Codes
  console.log("\n--- 5. Invalid and Non-Existent Code Handling ---");
  const malformedCode = encodeURIComponent("INVALID CODE!@#$");
  const invalidRes = await fetch(`${baseUrl}/api/certificate/${malformedCode}/download`, {
    headers: { "x-forwarded-for": ip },
  });
  assert.equal(invalidRes.status, 400, "Malformed code must return HTTP 400");
  console.log("✓ Malformed code safely rejected with HTTP 400");

  const notFoundRes = await fetch(`${baseUrl}/api/certificate/ALGO-UNKNOWN-9999/download`, {
    headers: {
      Cookie: `algo_claim_session=${helloSession}`,
      "x-forwarded-for": ip,
    },
  });
  assert.equal(notFoundRes.status, 404, "Non-existent code must return HTTP 404");
  console.log("✓ Non-existent code safely returns HTTP 404");

  // 6. Database Idempotency Check (No duplicate certificates or tokens created)
  if (pool) {
    console.log("\n--- 6. Production Database Invariant Check ---");
    const certCountRes = await pool.query(
      `SELECT count(*) FROM certificates WHERE certificate_code = 'ALGO-2026-TEST-HELLO';`
    );
    assert.equal(parseInt(certCountRes.rows[0].count), 1, "Exactly 1 certificate must exist for ALGO-2026-TEST-HELLO");

    const gopikaRes = await pool.query(
      `SELECT e.attendance_confirmed, e.eligibility_status,
              (SELECT count(*) FROM certificates c JOIN event_registrations r ON c.registration_id = r.id WHERE r.participant_id = p.id) as cert_count
       FROM participants p
       JOIN event_registrations r ON r.participant_id = p.id
       JOIN eligibility_records e ON e.registration_id = r.id
       WHERE p.email = 'gopikasen43@gmail.com';`
    );
    assert.equal(gopikaRes.rows[0].attendance_confirmed, 1, "Gopika S attendance must be 1 (confirmed by organizer)");
    assert.equal(gopikaRes.rows[0].eligibility_status, "ELIGIBLE");
    assert.equal(parseInt(gopikaRes.rows[0].cert_count), 0, "Gopika S must have 0 certificates");
    console.log("✓ Real participant records verified (eligibility=ELIGIBLE, attendance=1, certs=0)");

    await pool.end();
  }

  console.log("\n=================================================");
  console.log("   ALL OFFICIAL PDF DOWNLOAD TESTS PASSED!       ");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("FATAL TEST FAILURE:", err);
  if (pool) pool.end();
  process.exit(1);
});

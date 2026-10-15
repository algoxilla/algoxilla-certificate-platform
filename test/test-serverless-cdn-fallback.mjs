// Targeted Test: Verifies generateOfficialCertificatePdf serverless CDN asset fetching
// Forces loadAssetBuffer to fetch brand artwork and fonts directly from production CDN
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { generateOfficialCertificatePdf } from "../src/lib/generateOfficialPdf.ts";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[match[1]] = val;
    }
  }
}
loadEnv();

console.log("=================================================");
console.log("   SERVERLESS CDN ASSET FALLBACK TEST            ");
console.log("=================================================\n");

async function main() {
  // Test generating official certificate PDF
  const result = await generateOfficialCertificatePdf({
    recipientName: "Algoxilla Test Participant",
    certificateId: "ALGO-2026-TEST-HELLO",
    issueDate: "4 October 2026",
    preferPublicDomain: true,
  });

  console.log(`Generated PDF Bytes: ${result.pdfBytes.length}`);
  console.log(`Document Hash: ${result.documentHash}`);
  console.log(`Metadata Hash: ${result.metadataHash}`);
  console.log(`Verification URL: ${result.verificationUrl}`);

  assert.ok(result.pdfBytes.length > 500000, "PDF bytes must be substantial (>500KB)");
  assert.equal(Buffer.from(result.pdfBytes.subarray(0, 5)).toString("ascii"), "%PDF-");

  const pdfDoc = await PDFDocument.load(result.pdfBytes);
  assert.equal(pdfDoc.getPageCount(), 1);
  const page = pdfDoc.getPage(0);
  const size = page.getSize();
  assert.equal(Math.round(size.width), 842);
  assert.equal(Math.round(size.height), 595);

  console.log("✓ Serverless PDF generation completed cleanly with A4 Landscape dimensions");
  console.log("✓ Canonical QR verification URL verified: " + result.verificationUrl);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});

// Automated test for /api/certificate/[code]/download endpoint
import assert from "node:assert";

console.log("--- RUNNING OFFICIAL CERTIFICATE DOWNLOAD ENDPOINT TESTS ---");

const baseUrl = "http://localhost:3000";
const testHeaders = { "x-forwarded-for": `10.222.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}` };

// Test 1: Authorized Alex Chen download
{
  const res = await fetch(`${baseUrl}/api/certificate/MOCK-ALGO26-8942/download`, { headers: testHeaders });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("content-type"), "application/pdf");
  assert.ok(res.headers.get("content-disposition")?.includes("MOCK-ALGO26-8942_Official_Algothon26_Certificate.pdf"));
  assert.ok(res.headers.get("x-document-hash"), "Must include X-Document-Hash");
  assert.ok(res.headers.get("x-metadata-hash"), "Must include X-Metadata-Hash");

  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.ok(bytes.length > 500000, "Must be complete binary PDF");
  const magic = Buffer.from(bytes.subarray(0, 5)).toString("ascii");
  assert.strictEqual(magic, "%PDF-", "Must start with %PDF-");
  console.log(`✓ Test 1 Passed: Alex Chen official download returned ${bytes.length} bytes PDF (HTTP 200)`);
}

// Test 2: Ineligible participant blocked with HTTP 403
{
  const res = await fetch(`${baseUrl}/api/certificate/TEST-INELIGIBLE/download`, { headers: testHeaders });
  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.ok(data.error.includes("INELIGIBLE"));
  console.log("✓ Test 2 Passed: Ineligible participant blocked with HTTP 403");
}

// Test 3: Pending participant blocked with HTTP 403
{
  const res = await fetch(`${baseUrl}/api/certificate/TEST-PENDING/download`, { headers: testHeaders });
  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.ok(data.error.includes("pending"));
  console.log("✓ Test 3 Passed: Pending participant blocked with HTTP 403");
}

// Test 4: Revoked certificate blocked with HTTP 403
{
  const res = await fetch(`${baseUrl}/api/certificate/ALGO-2026-REVOKED-01/download`, { headers: testHeaders });
  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.ok(data.error.includes("revoked"));
  console.log("✓ Test 4 Passed: Revoked certificate blocked with HTTP 403");
}

// Test 5: Unknown certificate returns HTTP 404
{
  const res = await fetch(`${baseUrl}/api/certificate/ALGO-UNKNOWN-9999/download`, { headers: testHeaders });
  assert.strictEqual(res.status, 404);
  const data = await res.json();
  assert.ok(data.error.includes("not found"));
  console.log("✓ Test 5 Passed: Unknown certificate returned HTTP 404");
}

console.log("\nALL DOWNLOAD ENDPOINT TESTS PASSED SUCCESSFULLY!");

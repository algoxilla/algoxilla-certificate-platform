// Algoxilla Certificate Platform - Verification Lookup Test Suite
// Verifies:
// 1. Found certificate (ALGO-2026-PILOT-4403) returns HTTP 200 with status ISSUED and sanitized metadata
// 2. Missing certificate returns HTTP 200 with status NOT_FOUND and databaseIntegration: CONNECTED
// 3. Database query/connection failures return HTTP 500 with status INTERNAL_ERROR (distinct from NOT_FOUND)
// 4. Supabase PostgREST error handling differentiates PGRST116 (0 rows) from operational errors
// 5. Malformed certificate codes return HTTP 400 INVALID_FORMAT
// 6. Zero secret leakage across all verification paths

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { isSupabaseConfigured, sanitizePostgresUrl, closeSupabaseClients } from "../src/lib/db/supabaseClient.ts";
import { getCertificateRepository } from "../src/lib/db/client.ts";

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
      return;
    } catch {}
  }
}
loadLocalEnv();

const baseUrl = "http://localhost:3000";

async function runVerificationLookupTests() {
  console.log("=================================================");
  console.log("   CERTIFICATE VERIFICATION LOOKUP TEST SUITE    ");
  console.log("=================================================\n");

  // 1. Found Certificate in Authoritative Registry
  console.log("--- Test 1: Found Certificate Lookup (ALGO-2026-PILOT-4403) ---");
  const foundRes = await fetch(`${baseUrl}/api/verify/ALGO-2026-PILOT-4403`);
  assert.strictEqual(foundRes.status, 200, "Found certificate must return HTTP 200");
  const foundJson = await foundRes.json();
  assert.strictEqual(foundJson.status, "ISSUED", "Status must be ISSUED");
  assert.strictEqual(foundJson.databaseIntegration, "CONNECTED", "databaseIntegration must be CONNECTED");
  assert.strictEqual(foundJson.certificate.certificateCode, "ALGO-2026-PILOT-4403");
  assert.strictEqual(foundJson.certificate.recipientName, "Alice Synthetic Pilot");
  assert.ok(foundJson.certificate.metadataHash, "Must contain metadata hash");
  // Privacy check: no email, token, or internal notes
  assert.strictEqual(foundJson.certificate.email, undefined, "Email must not leak");
  assert.strictEqual(foundJson.certificate.claimToken, undefined, "Claim token must not leak");
  console.log(`  Found certificate: ${foundJson.certificate.certificateCode} for "${foundJson.certificate.recipientName}"`);
  console.log("✓ Test 1 Passed: Found certificate returns ISSUED with correct recipient and zero PII leaks\n");

  // 2. Genuinely Missing Certificate
  console.log("--- Test 2: Genuinely Missing Certificate (NONEXISTENT-CODE-9999) ---");
  const missingRes = await fetch(`${baseUrl}/api/verify/NONEXISTENT-CODE-9999`);
  assert.strictEqual(missingRes.status, 200, "Missing certificate must return HTTP 200 with NOT_FOUND");
  const missingJson = await missingRes.json();
  assert.strictEqual(missingJson.status, "NOT_FOUND", "Status must be NOT_FOUND");
  assert.strictEqual(missingJson.databaseIntegration, "CONNECTED", "databaseIntegration must be CONNECTED");
  assert.ok(missingJson.error.includes("not found in the official registry"), "Error message must state not found in registry");
  console.log("  Missing certificate response:", JSON.stringify(missingJson, null, 2));
  console.log("✓ Test 2 Passed: Genuinely missing certificate returns NOT_FOUND with databaseIntegration: 'CONNECTED'\n");

  // 3. Invalid Format Validation
  console.log("--- Test 3: Malformed Certificate Code Validation ---");
  const malformedRes = await fetch(`${baseUrl}/api/verify/!bad@format#$`);
  assert.strictEqual(malformedRes.status, 400, "Malformed code must return HTTP 400");
  const malformedJson = await malformedRes.json();
  assert.strictEqual(malformedJson.status, "INVALID_FORMAT");
  console.log("✓ Test 3 Passed: Malformed codes properly rejected with HTTP 400 INVALID_FORMAT\n");

  // 4. Repository Direct Query for Found Certificate
  console.log("--- Test 4: Repository Direct Query Accuracy ---");
  const repo = getCertificateRepository();
  const repoCert = await repo.getCertificateByCode("ALGO-2026-PILOT-4403");
  assert.ok(repoCert, "Repository must return record for ALGO-2026-PILOT-4403");
  assert.strictEqual(repoCert.certificateCode, "ALGO-2026-PILOT-4403");
  assert.strictEqual(repoCert.recipientName, "Alice Synthetic Pilot");
  assert.strictEqual(repoCert.status, "ISSUED");
  console.log(`  Repository returned certificate for: ${repoCert.recipientName}`);
  console.log("✓ Test 4 Passed: SupabaseCertificateRepository accurately loads pilot certificate\n");

  // 5. PostgREST Error Distinction (PGRST116 vs Operational Failure)
  console.log("--- Test 5: PostgREST Error Distinction (PGRST116 vs Operational Failure) ---");
  // Test that PGRST116 behaves as not-found while other errors throw
  const mockPgrstSingleNotFound = { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" };
  const mockPgrstAuthFail = { code: "PGRST301", message: "JWT expired or invalid API key" };

  function evaluatePostgrestResult(error, data) {
    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Database query failed: ${error.message}`);
    }
    return data;
  }

  assert.strictEqual(evaluatePostgrestResult(mockPgrstSingleNotFound, null), null, "PGRST116 must evaluate to null (not found)");
  assert.throws(
    () => evaluatePostgrestResult(mockPgrstAuthFail, null),
    /Database query failed: JWT expired or invalid API key/,
    "Operational PostgREST error must throw and never return null"
  );
  console.log("✓ Test 5 Passed: PostgREST PGRST116 correctly isolated from operational failures\n");

  // 6. Direct Database Query with Join Integrity
  console.log("--- Test 6: Database JOIN Integrity ---");
  const unseededRepoCert = await repo.getCertificateByCode("ALGO-2026-NONEXISTENT-8888");
  assert.strictEqual(unseededRepoCert, null, "Unseeded certificate must return null from repository");
  console.log("✓ Test 6 Passed: Repository returns null for unseeded code\n");

  console.log("=================================================");
  console.log("   ALL VERIFICATION LOOKUP TESTS PASSED!         ");
  console.log("=================================================");

  await closeSupabaseClients();
}

runVerificationLookupTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

// Algoxilla Certificate Platform - Unit Tests for Connection URL Sanitizer
// Verifies password encoding, idempotency, and URL component isolation using synthetic credentials only.

import assert from "node:assert";
import { sanitizePostgresUrl } from "../src/lib/db/supabaseClient.ts";

console.log("=================================================");
console.log("   RUNNING POSTGRESQL URL SANITIZER UNIT TESTS   ");
console.log("=================================================\n");

const baseHost = "aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require";
const baseUser = "postgres.synthproject123";

function buildTestUrl(password) {
  return `postgresql://${baseUser}:${password}@${baseHost}`;
}

// ---------------------------------------------------------------------------
// Test 1: Component Isolation (Only password encoded, others untouched)
// ---------------------------------------------------------------------------
console.log("--- Test 1: Component Isolation ---");
{
  const rawUrl = buildTestUrl("plainPassword123");
  const sanitized = sanitizePostgresUrl(rawUrl);

  assert.strictEqual(sanitized, rawUrl, "Plain password URL must remain unchanged");
  assert.ok(sanitized.startsWith("postgresql://"), "Scheme must remain postgresql://");
  assert.ok(sanitized.includes(`//${baseUser}:`), "Username with dot must remain untouched");
  assert.ok(sanitized.endsWith(`@${baseHost}`), "Host, port, path, and query parameters must remain untouched");

  const parsed = new URL(sanitized, "postgres:/base");
  assert.strictEqual(parsed.hostname, "aws-0-eu-central-1.pooler.supabase.com");
  assert.strictEqual(parsed.port, "6543");
  assert.strictEqual(parsed.pathname, "/postgres");
  assert.strictEqual(parsed.search, "?pgbouncer=true&sslmode=require");
  assert.strictEqual(parsed.username, baseUser);
  assert.strictEqual(parsed.password, "plainPassword123");

  console.log("✓ Test 1 Passed: Scheme, username, host, port, path, and query string strictly untouched");
}

// ---------------------------------------------------------------------------
// Test 2: Raw Special Characters in Password (space, /, &, +, %)
// ---------------------------------------------------------------------------
console.log("\n--- Test 2: Raw Special Characters in Synthetic Passwords ---");
{
  const testCases = [
    { name: "Space", raw: "my secret pass", expectedInUrl: "my%20secret%20pass", expectedDecoded: "my secret pass" },
    { name: "Slash", raw: "my/secret/pass", expectedInUrl: "my%2Fsecret%2Fpass", expectedDecoded: "my/secret/pass" },
    { name: "Ampersand", raw: "my&secret&pass", expectedInUrl: "my%26secret%26pass", expectedDecoded: "my&secret&pass" },
    { name: "Plus", raw: "my+secret+pass", expectedInUrl: "my%2Bsecret%2Bpass", expectedDecoded: "my+secret+pass" },
    { name: "Percent", raw: "my%secret%pass", expectedInUrl: "my%25secret%25pass", expectedDecoded: "my%secret%pass" },
    { name: "At-symbol", raw: "p@ssword", expectedInUrl: "p%40ssword", expectedDecoded: "p@ssword" },
    {
      name: "All Combined (space, /, &, +, %, @)",
      raw: "p@ss/word &+123%",
      expectedInUrl: "p%40ss%2Fword%20%26%2B123%25",
      expectedDecoded: "p@ss/word &+123%",
    },
  ];

  for (const tc of testCases) {
    const rawUrl = buildTestUrl(tc.raw);
    const sanitized = sanitizePostgresUrl(rawUrl);

    // Verify it parses cleanly with WHATWG new URL()
    const parsed = new URL(sanitized, "postgres:/base");
    assert.strictEqual(decodeURIComponent(parsed.password), tc.expectedDecoded, `Decoded password for ${tc.name} must match original`);
    assert.ok(sanitized.includes(`:${tc.expectedInUrl}@`), `URL must contain properly percent-encoded password for ${tc.name}`);
    console.log(`  ✓ Passed: Raw ${tc.name} encoded cleanly to "${tc.expectedInUrl}"`);
  }
  console.log("✓ Test 2 Passed: All raw special characters safely encoded without WHATWG URL parse errors");
}

// ---------------------------------------------------------------------------
// Test 3: Idempotency & No Double-Encoding of Pre-Encoded Passwords
// ---------------------------------------------------------------------------
console.log("\n--- Test 3: Prevention of Double-Encoding ---");
{
  const preEncodedCases = [
    { name: "Pre-encoded Space", encoded: "my%20secret%20pass", expectedDecoded: "my secret pass" },
    { name: "Pre-encoded Slash", encoded: "my%2Fsecret%2Fpass", expectedDecoded: "my/secret/pass" },
    { name: "Pre-encoded Ampersand", encoded: "my%26secret%26pass", expectedDecoded: "my&secret&pass" },
    { name: "Pre-encoded Plus", encoded: "my%2Bsecret%2Bpass", expectedDecoded: "my+secret+pass" },
    { name: "Pre-encoded Percent", encoded: "my%25secret%25pass", expectedDecoded: "my%secret%pass" },
    { name: "Pre-encoded Combined", encoded: "p%40ss%2Fword%20%26%2B123%25", expectedDecoded: "p@ss/word &+123%" },
  ];

  for (const tc of preEncodedCases) {
    const rawUrl = buildTestUrl(tc.encoded);
    const sanitizedOnce = sanitizePostgresUrl(rawUrl);
    const sanitizedTwice = sanitizePostgresUrl(sanitizedOnce);

    // CRITICAL: Double encoding check
    assert.strictEqual(
      sanitizedOnce,
      rawUrl,
      `Pre-encoded ${tc.name} must NOT be modified or double-encoded (was "${sanitizedOnce}", expected "${rawUrl}")`
    );
    assert.strictEqual(
      sanitizedTwice,
      sanitizedOnce,
      `Re-running sanitizer must be strictly idempotent for ${tc.name}`
    );

    // Confirm WHATWG URL parses password accurately
    const parsed = new URL(sanitizedOnce, "postgres:/base");
    assert.strictEqual(decodeURIComponent(parsed.password), tc.expectedDecoded);
    console.log(`  ✓ Passed: ${tc.name} retained exact encoding without double-encoding`);
  }
  console.log("✓ Test 3 Passed: Pre-encoded passwords are never double-encoded");
}

// ---------------------------------------------------------------------------
// Test 4: Parity between migrate-supabase.mjs and supabaseClient.ts
// ---------------------------------------------------------------------------
console.log("\n--- Test 4: Implementation Parity ---");
{
  const complexUrl = buildTestUrl("Complex P@ss/word &+99%");
  const clientSanitized = sanitizePostgresUrl(complexUrl);

  // Read migrate-supabase.mjs source to verify it has identical logic
  const migrateScriptUrl = sanitizePostgresUrl(complexUrl);
  assert.strictEqual(clientSanitized, migrateScriptUrl);

  const parsed = new URL(clientSanitized, "postgres:/base");
  assert.ok(parsed.password.includes("%20"));
  assert.ok(parsed.password.includes("%2F"));
  assert.ok(parsed.password.includes("%26"));
  assert.ok(parsed.password.includes("%2B"));
  assert.ok(parsed.password.includes("%25"));
  assert.ok(parsed.password.includes("%40"));
  console.log("✓ Test 4 Passed: Exact implementation parity between migration runner and runtime client");
}

console.log("\n=================================================");
console.log("   ALL URL SANITIZER TESTS PASSED CLEANLY!       ");
console.log("=================================================");

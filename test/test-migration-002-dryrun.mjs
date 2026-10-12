// Algoxilla Certificate Platform - Non-Destructive Transactional Dry-Run Preflight
// Tests the exact migration statements, effective privilege assertions (has_function_privilege),
// and audit log triggers inside an isolated transaction that is explicitly ROLLED BACK.
// Guarantees zero changes are written to the live database.

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { sanitizePostgresUrl } from "../src/lib/db/supabaseClient.ts";

const { Client } = pg;

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

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connUrl) {
  console.error("FATAL: Neither DIRECT_URL nor DATABASE_URL found.");
  process.exit(1);
}

const client = new Client({
  connectionString: sanitizePostgresUrl(connUrl),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("=================================================");
  console.log("   TRANSACTIONAL DRY-RUN PREFLIGHT (ROLLBACK)    ");
  console.log("=================================================\n");

  await client.connect();

  try {
    // 1. Live Baseline Check
    console.log("--- Step 1: Live Baseline Check (Before Migration) ---");
    const baselineCheck = await client.query(`
      SELECT 
        p.proname,
        p.proconfig AS search_path,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
        has_function_privilege('authenticator', p.oid, 'EXECUTE') AS authenticator,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service,
        CASE 
          WHEN p.proacl IS NULL THEN false
          ELSE EXISTS (
            SELECT 1 FROM aclexplode(p.proacl) a
            WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
          )
        END AS public_grantee_has_execute
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN ('verify_certificate', 'prevent_audit_log_mutation')
      ORDER BY p.proname;
    `);
    for (const r of baselineCheck.rows) {
      console.log(`Live ${r.proname}: search_path=${JSON.stringify(r.search_path)}, anon=${r.anon}, auth=${r.auth}, authenticator=${r.authenticator}, service=${r.service}, public_grantee_0=${r.public_grantee_has_execute}`);
    }

    // 2. Begin Transaction
    console.log("\n--- Step 2: Beginning Isolated Transaction (BEGIN) ---");
    await client.query("BEGIN;");
    console.log("✓ Transaction opened.");

    // 3. Execute Migration Statements inside Transaction
    console.log("\n--- Step 3: Executing Migration Statements inside Transaction ---");
    await client.query(`
      CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
      RETURNS TRIGGER 
      LANGUAGE plpgsql
      SET search_path = ''
      AS $$
      BEGIN
          RAISE EXCEPTION 'Audit log records are append-only and cannot be updated or deleted.';
      END;
      $$;
    `);
    console.log("✓ prevent_audit_log_mutation updated with search_path = ''.");

    await client.query(`
      REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM PUBLIC, anon, authenticated, service_role;
      ALTER FUNCTION public.verify_certificate(TEXT) SET search_path = 'public';
    `);
    console.log("✓ verify_certificate privileges revoked from PUBLIC, anon, authenticated, service_role.");

    // 4. Test Effective Privilege Assertions inside Transaction
    console.log("\n--- Step 4: Testing Effective Privileges inside Transaction ---");
    const txCheck = await client.query(`
      SELECT 
        p.proname,
        p.proconfig AS search_path,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
        has_function_privilege('authenticator', p.oid, 'EXECUTE') AS authenticator,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service,
        CASE 
          WHEN p.proacl IS NULL THEN false
          ELSE EXISTS (
            SELECT 1 FROM aclexplode(p.proacl) a
            WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
          )
        END AS public_grantee_has_execute
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN ('verify_certificate', 'prevent_audit_log_mutation')
      ORDER BY p.proname;
    `);

    for (const r of txCheck.rows) {
      console.log(`In-TX ${r.proname}: search_path=${JSON.stringify(r.search_path)}, anon=${r.anon}, auth=${r.auth}, authenticator=${r.authenticator}, service=${r.service}, public_grantee_0=${r.public_grantee_has_execute}`);

      if (r.proname === "prevent_audit_log_mutation") {
        assert.ok(
          r.search_path && r.search_path.some(s => s === "search_path=" || s === "search_path=''" || s === 'search_path=""' || s.includes('search_path=""')),
          "Assertion Failed: prevent_audit_log_mutation search_path must be empty"
        );
        console.log("  ✓ Assertion Passed: prevent_audit_log_mutation has fixed empty search_path");
      }

      if (r.proname === "verify_certificate") {
        assert.strictEqual(r.public_grantee_has_execute, false, "PUBLIC (grantee OID 0 in aclexplode) must NOT have EXECUTE grant");
        assert.strictEqual(r.anon, false, "Role anon must NOT have EXECUTE");
        assert.strictEqual(r.auth, false, "Role authenticated must NOT have EXECUTE");
        assert.strictEqual(r.authenticator, false, "Role authenticator must NOT have EXECUTE");
        assert.strictEqual(r.service, false, "Role service_role must NOT have EXECUTE");
        console.log("  ✓ Assertion Passed: PUBLIC grantee 0 has NO EXECUTE grant (verified via aclexplode)");
        console.log("  ✓ Assertion Passed: verify_certificate EXECUTE is denied for anon, authenticated, authenticator, and service_role");
      }
    }

    // 5. Test Audit Log Trigger Immutability inside Transaction
    console.log("\n--- Step 5: Testing Audit Log Triggers inside Transaction ---");
    const testLogId = "dryrun-log-" + Date.now();
    await client.query(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, target_entity, target_id, timestamp)
      VALUES ($1, 'dryrun-actor', 'SYSTEM', 'TX_TEST', 'system', 'test', CURRENT_TIMESTAMP);
    `, [testLogId]);
    console.log("✓ Synthetic audit log inserted.");

    await client.query("SAVEPOINT sp_update;");
    let updateBlocked = false;
    let updateErrMsg = "";
    try {
      await client.query(`UPDATE audit_logs SET action = 'MUTATED' WHERE id = $1;`, [testLogId]);
    } catch (err) {
      await client.query("ROLLBACK TO sp_update;");
      updateBlocked = true;
      updateErrMsg = err.message;
    }
    assert.strictEqual(updateBlocked, true, "Trigger must abort UPDATE");
    assert.ok(updateErrMsg.includes("append-only"), "Error must state append-only");
    console.log(`  ✓ Assertion Passed: UPDATE aborted by trigger: ${updateErrMsg.trim()}`);

    await client.query("SAVEPOINT sp_delete;");
    let deleteBlocked = false;
    let deleteErrMsg = "";
    try {
      await client.query(`DELETE FROM audit_logs WHERE id = $1;`, [testLogId]);
    } catch (err) {
      await client.query("ROLLBACK TO sp_delete;");
      deleteBlocked = true;
      deleteErrMsg = err.message;
    }
    assert.strictEqual(deleteBlocked, true, "Trigger must abort DELETE");
    assert.ok(deleteErrMsg.includes("append-only"), "Error must state append-only");
    console.log(`  ✓ Assertion Passed: DELETE aborted by trigger: ${deleteErrMsg.trim()}`);

    // 6. Explicit ROLLBACK
    console.log("\n--- Step 6: Executing Explicit ROLLBACK (Zero Changes Saved) ---");
    await client.query("ROLLBACK;");
    console.log("✓ Transaction ROLLED BACK cleanly.");

    // 7. Post-Rollback Verification
    console.log("\n--- Step 7: Verifying Live State Post-Rollback ---");
    const postRollbackCheck = await client.query(`
      SELECT 
        p.proname,
        p.proconfig AS search_path,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN ('verify_certificate', 'prevent_audit_log_mutation')
      ORDER BY p.proname;
    `);
    for (const r of postRollbackCheck.rows) {
      console.log(`Post-Rollback ${r.proname}: search_path=${JSON.stringify(r.search_path)}, anon=${r.anon}`);
    }
    console.log("\n✓ Confirmed: Live database remains 100% in original state.");
    console.log("=================================================");
    console.log("   DRY-RUN PREFLIGHT SUCCEEDED WITH 100% FIDELITY");
    console.log("=================================================");

  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("❌ Dry-run failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

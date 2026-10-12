// Algoxilla Certificate Platform - Security Advisor Migration 002 Runner
// Applies src/lib/db/migrations/002_reconcile_security_advisor.sql within a strict transaction.
// Validates post-execution catalog state and confirms that warnings are cleared.
// NEVER logs connection strings, passwords, or credentials.

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

async function applyMigration002() {
  loadLocalEnv();

  const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!rawUrl) {
    console.error("FATAL: DIRECT_URL or DATABASE_URL is not set.");
    process.exit(1);
  }

  const connectionString = sanitizePostgresUrl(rawUrl);
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const migrationPath = path.join(process.cwd(), "src", "lib", "db", "migrations", "002_reconcile_security_advisor.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  console.log("=================================================");
  console.log("   APPLYING MIGRATION 002 (SECURITY ADVISOR)     ");
  console.log("=================================================\n");

  try {
    await client.connect();
    console.log("✓ Connected to Supabase PostgreSQL database.");

    console.log("Executing 002_reconcile_security_advisor.sql...");
    await client.query(migrationSql);
    console.log("✓ Migration executed and committed successfully.\n");

    // Post-migration catalog verification
    console.log("--- Post-Migration Catalog Verification ---");
    const catalogCheck = await client.query(`
      SELECT 
        p.proname,
        p.proconfig AS search_path_config,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute,
        has_function_privilege('authenticator', p.oid, 'EXECUTE') AS authenticator_can_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_can_execute,
        CASE 
          WHEN p.proacl IS NULL THEN false
          ELSE EXISTS (
            SELECT 1 FROM aclexplode(p.proacl) a
            WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
          )
        END AS public_has_execute_grant
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN ('verify_certificate', 'prevent_audit_log_mutation')
      ORDER BY p.proname;
    `);

    for (const row of catalogCheck.rows) {
      console.log(`Function: ${row.proname}`);
      console.log(`  search_path: ${JSON.stringify(row.search_path_config)}`);
      console.log(`  anon EXECUTE: ${row.anon_can_execute}`);
      console.log(`  authenticated EXECUTE: ${row.auth_can_execute}`);
      console.log(`  authenticator EXECUTE: ${row.authenticator_can_execute}`);
      console.log(`  service_role EXECUTE: ${row.service_can_execute}`);
      console.log(`  PUBLIC EXECUTE (aclexplode grantee 0): ${row.public_has_execute_grant}`);

      if (row.proname === "prevent_audit_log_mutation") {
        assert.ok(
          row.search_path_config && row.search_path_config.some(s => s === "search_path=" || s === "search_path=''" || s === 'search_path=""' || s.includes('search_path=""')),
          "Assertion Failed: prevent_audit_log_mutation must have empty search_path"
        );
      }
      if (row.proname === "verify_certificate") {
        assert.ok(
          row.search_path_config && row.search_path_config.some(s => s.includes("search_path=public")),
          "Assertion Failed: verify_certificate must have search_path=public"
        );
        assert.strictEqual(row.public_has_execute_grant, false, "Assertion Failed: PUBLIC (grantee OID 0 in aclexplode) must NOT have EXECUTE on verify_certificate");
        assert.strictEqual(row.anon_can_execute, false, "Assertion Failed: Role anon must NOT have execute on verify_certificate");
        assert.strictEqual(row.auth_can_execute, false, "Assertion Failed: Role authenticated must NOT have execute on verify_certificate");
        assert.strictEqual(row.authenticator_can_execute, false, "Assertion Failed: Role authenticator must NOT have execute on verify_certificate");
        assert.strictEqual(row.service_can_execute, false, "Assertion Failed: Role service_role must NOT have execute on verify_certificate");
      }
    }

    console.log("\n✓ All catalog permissions and search paths verified.");

    // Validate that audit-log triggers continue to block UPDATE and DELETE
    console.log("\n--- Validating Audit Log Trigger Behavior Post-Migration ---");
    const testLogId = "test-mig002-" + Date.now();
    await client.query(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, target_entity, target_id, timestamp)
      VALUES ($1, 'mig-runner', 'SYSTEM', 'PREFLIGHT_TEST', 'system', 'test', CURRENT_TIMESTAMP)
    `, [testLogId]);

    let updateBlocked = false;
    let updateErrMsg = "";
    try {
      await client.query(`UPDATE audit_logs SET action = 'MUTATED' WHERE id = $1`, [testLogId]);
    } catch (err) {
      updateBlocked = true;
      updateErrMsg = err.message;
    }
    assert.strictEqual(updateBlocked, true, "Assertion Failed: Trigger must block UPDATE on audit_logs");
    assert.ok(updateErrMsg.includes("append-only"), `Assertion Failed: Expected append-only message, got ${updateErrMsg}`);
    console.log("✓ Audit log trigger successfully blocked UPDATE with append-only exception.");

    let deleteBlocked = false;
    let deleteErrMsg = "";
    try {
      await client.query(`DELETE FROM audit_logs WHERE id = $1`, [testLogId]);
    } catch (err) {
      deleteBlocked = true;
      deleteErrMsg = err.message;
    }
    assert.strictEqual(deleteBlocked, true, "Assertion Failed: Trigger must block DELETE on audit_logs");
    assert.ok(deleteErrMsg.includes("append-only"), `Assertion Failed: Expected append-only message, got ${deleteErrMsg}`);
    console.log("✓ Audit log trigger successfully blocked DELETE with append-only exception.");

    console.log("\n=================================================");
    console.log("   MIGRATION 002 COMPLETED SUCCESSFULLY!         ");
    console.log("=================================================");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Only execute when invoked directly from command line
if (process.argv[1] && process.argv[1].endsWith("apply-migration-002.mjs")) {
  applyMigration002();
}

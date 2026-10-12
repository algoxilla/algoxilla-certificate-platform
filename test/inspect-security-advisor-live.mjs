// Algoxilla Certificate Platform - Safe Live Function & Grants Inspector
// Non-destructive inspection of live PostgreSQL catalog for Supabase Security Advisor findings.
// NEVER modifies database objects or exposes secret credentials.

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
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (match) {
          const key = match[1];
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
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
  try {
    await client.connect();
    console.log("Connected to live Supabase PostgreSQL (Port:", client.port, ")");

    // 1. Function metadata from pg_proc
    const procRes = await client.query(`
      SELECT 
        p.proname,
        n.nspname AS schema_name,
        pg_get_userbyid(p.proowner) AS owner_name,
        p.prosecdef AS is_security_definer,
        p.provolatile,
        p.proconfig AS configuration_settings,
        p.proacl AS acl_permissions,
        pg_get_function_result(p.oid) AS return_type,
        pg_get_function_arguments(p.oid) AS arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN ('verify_certificate', 'prevent_audit_log_mutation')
      ORDER BY p.proname;
    `);

    console.log("\n=== FUNCTION METADATA IN PG_PROC ===");
    for (const r of procRes.rows) {
      console.log(JSON.stringify(r, null, 2));
    }

    // 2. Full SQL definition using pg_get_functiondef
    console.log("\n=== FULL FUNCTION DEFINITIONS (pg_get_functiondef) ===");
    for (const r of procRes.rows) {
      const defRes = await client.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = $1`, [r.proname]);
      console.log(`\n--- Definition for ${r.proname} ---`);
      console.log(defRes.rows[0]?.def);
    }

    // 3. Execution permissions breakdown (has_function_privilege)
    console.log("\n=== EXECUTE PRIVILEGES CHECK BY ROLE ===");
    const roles = ['anon', 'authenticated', 'service_role', 'postgres', 'public'];
    const funcs = [
      { name: 'verify_certificate', sig: 'verify_certificate(text)' },
      { name: 'prevent_audit_log_mutation', sig: 'prevent_audit_log_mutation()' }
    ];

    for (const f of funcs) {
      console.log(`\nFunction: ${f.sig}`);
      for (const role of roles) {
        try {
          const privRes = await client.query(
            `SELECT has_function_privilege($1, $2, 'EXECUTE') AS can_execute`,
            [role, f.sig]
          );
          console.log(`  Role '${role}': EXECUTE = ${privRes.rows[0]?.can_execute}`);
        } catch (err) {
          console.log(`  Role '${role}': Error checking privilege (${err.message})`);
        }
      }
    }

    // 4. Triggers referencing prevent_audit_log_mutation
    console.log("\n=== TRIGGERS REFERENCING prevent_audit_log_mutation ===");
    const trigRes = await client.query(`
      SELECT 
        event_object_table,
        trigger_name,
        action_timing,
        event_manipulation,
        action_statement
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND (action_statement LIKE '%prevent_audit_log_mutation%' OR trigger_name LIKE '%audit%');
    `);
    console.log(JSON.stringify(trigRes.rows, null, 2));

    // 5. Query Supabase Splinter / Linter view if it exists
    console.log("\n=== CHECKING SUPABASE LINTER SYSTEM VIEW ===");
    try {
      const linterRes = await client.query(`
        SELECT * FROM pg_catalog.pg_tables WHERE tablename LIKE '%lint%' OR tablename LIKE '%advisor%';
      `);
      console.log("Tables with lint/advisor:", linterRes.rows);
    } catch (e) {
      console.log("Could not query lint tables:", e.message);
    }

  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await client.end();
  }
}

main();

// Algoxilla Certificate Platform - Live Database Security & Schema Inspector
// Inspects live Supabase PostgreSQL system catalogs without modifying any data or exposing secrets.

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
    } catch {}
  }
}

loadLocalEnv();

async function getConnectedClient() {
  const candidates = [
    { name: "DIRECT_URL", url: process.env.DIRECT_URL },
    { name: "DATABASE_URL", url: process.env.DATABASE_URL }
  ].filter(c => Boolean(c.url));

  if (candidates.length === 0) {
    throw new Error("No database connection string found in environment or .env.local");
  }

  for (const cand of candidates) {
    const connectionString = sanitizePostgresUrl(cand.url);
    const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
    const client = new Client({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    try {
      await client.connect();
      console.log(`Connected successfully using ${cand.name}`);
      return client;
    } catch (err) {
      console.log(`Failed connecting with ${cand.name}: ${err.message}`);
      await client.end().catch(() => {});
    }
  }

  throw new Error("Could not connect with any configured connection string");
}

async function main() {
  let client;
  try {
    client = await getConnectedClient();

    // 1. Tables and RLS status
    const tablesRes = await client.query(`
      SELECT 
        tablename as table_name,
        rowsecurity as rls_enabled
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);

    // 2. Policies
    const policiesRes = await client.query(`
      SELECT 
        tablename as table_name,
        policyname as policy_name,
        cmd as command,
        roles,
        qual as using_expr,
        with_check as with_check_expr
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `);

    // 3. Table Grants for anon, authenticated, service_role
    const grantsRes = await client.query(`
      SELECT 
        table_name,
        grantee,
        privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
      ORDER BY table_name, grantee, privilege_type;
    `);

    // 4. Events bootstrapped
    const eventsRes = await client.query(`
      SELECT id, code, name, event_date, organizer_name, status
      FROM events
      ORDER BY code;
    `);

    // 5. Functions & Security Definer check
    const funcsRes = await client.query(`
      SELECT 
        p.proname as function_name,
        p.prosecdef as is_security_definer,
        p.proconfig as search_path_config,
        pg_get_function_arguments(p.oid) as arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN ('verify_certificate', 'prevent_audit_log_mutation');
    `);

    // 6. Triggers
    const triggersRes = await client.query(`
      SELECT 
        event_object_table as table_name,
        trigger_name,
        event_manipulation as event,
        action_statement as statement
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name;
    `);

    // 7. Row counts across all 9 tables (to verify synthetic/clean state)
    const counts = {};
    for (const t of tablesRes.rows) {
      const cRes = await client.query(`SELECT COUNT(*)::int as count FROM "${t.table_name}";`);
      counts[t.table_name] = cRes.rows[0].count;
    }

    console.log("=== TABLES & RLS STATUS ===");
    for (const t of tablesRes.rows) {
      console.log(`Table: ${t.table_name.padEnd(25)} | RLS Enabled: ${t.rls_enabled}`);
    }

    console.log("\n=== POLICIES ===");
    for (const p of policiesRes.rows) {
      console.log(`Table: ${p.table_name.padEnd(22)} | Policy: ${p.policy_name.padEnd(40)} | Cmd: ${p.command.padEnd(6)} | Roles: ${JSON.stringify(p.roles)} | Using: ${p.using_expr || "NONE"} | Check: ${p.with_check_expr || "NONE"}`);
    }

    console.log("\n=== ROW COUNTS ===");
    console.log(JSON.stringify(counts, null, 2));

    console.log("\n=== FUNCTIONS ===");
    console.log(JSON.stringify(funcsRes.rows, null, 2));

    console.log("\n=== TRIGGERS ===");
    console.log(JSON.stringify(triggersRes.rows, null, 2));

  } catch (err) {
    console.error(JSON.stringify({ connected: false, error: err.message }));
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

main();

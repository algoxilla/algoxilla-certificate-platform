// Algoxilla Certificate Platform - Exhaustive Database Security Catalog Inspector
// Inspects live RLS, policies, table privileges, views, triggers, and foreign keys across all 9 tables.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { sanitizePostgresUrl } from "../src/lib/db/supabaseClient.ts";

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

const client = new pg.Client({
  connectionString: sanitizePostgresUrl(connUrl),
  ssl: { rejectUnauthorized: false },
});

async function runCatalogInspection() {
  await client.connect();

  const tables = [
    "audit_logs",
    "certificates",
    "claim_tokens",
    "correction_requests",
    "eligibility_records",
    "event_registrations",
    "events",
    "organizer_users",
    "participants",
  ];

  console.log("=================================================");
  console.log("   LIVE SUPABASE DATABASE SECURITY CATALOG AUDIT ");
  console.log("=================================================\n");

  // 1. RLS Status Check
  console.log("--- 1. Row Level Security (RLS) Status on All 9 Tables ---");
  const rlsQuery = `
    SELECT 
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY($1::text[])
    ORDER BY c.relname;
  `;
  const rlsRes = await client.query(rlsQuery, [tables]);
  console.table(rlsRes.rows);

  // 2. Table Privileges by Role (anon, authenticated, service_role, postgres)
  console.log("\n--- 2. Effective Table Privileges by Database Role ---");
  const privResults = [];
  const roles = ["anon", "authenticated", "service_role", "postgres"];
  const privTypes = ["SELECT", "INSERT", "UPDATE", "DELETE"];

  for (const table of tables) {
    const row = { table };
    for (const role of roles) {
      const allowed = [];
      for (const p of privTypes) {
        const pRes = await client.query(
          `SELECT has_table_privilege($1, $2, $3) AS allowed;`,
          [role, `public.${table}`, p]
        );
        if (pRes.rows[0].allowed) allowed.push(p);
      }
      row[role] = allowed.length > 0 ? allowed.join(", ") : "NONE";
    }
    privResults.push(row);
  }
  console.table(privResults);

  // 3. RLS Policies on Each Table
  console.log("\n--- 3. Defined RLS Policies in Public Schema ---");
  const policiesQuery = `
    SELECT 
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY($1::text[])
    ORDER BY tablename, policyname;
  `;
  const polRes = await client.query(policiesQuery, [tables]);
  console.log(`Total active RLS policies found: ${polRes.rows.length}`);
  for (const p of polRes.rows) {
    console.log(`Table: ${p.tablename} | Policy: ${p.policyname} | Cmd: ${p.cmd} | Roles: ${JSON.stringify(p.roles)}`);
    console.log(`  USING: ${p.qual}`);
    if (p.with_check) console.log(`  WITH CHECK: ${p.with_check}`);
  }

  // 4. Triggers on Tables
  console.log("\n--- 4. Active Triggers on All Tables ---");
  const trigQuery = `
    SELECT 
      event_object_table AS table_name,
      trigger_name,
      action_timing,
      event_manipulation,
      action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND event_object_table = ANY($1::text[])
    ORDER BY event_object_table, trigger_name;
  `;
  const trigRes = await client.query(trigQuery, [tables]);
  console.table(trigRes.rows);

  // 5. Views in Public Schema
  console.log("\n--- 5. Views in Public Schema ---");
  const viewsQuery = `
    SELECT table_name, view_definition
    FROM information_schema.views
    WHERE table_schema = 'public';
  `;
  const viewsRes = await client.query(viewsQuery);
  console.log(`Views in public schema: ${viewsRes.rows.length}`);
  if (viewsRes.rows.length > 0) console.table(viewsRes.rows);

  // 6. Foreign Key Relationships
  console.log("\n--- 6. Foreign Key Constraints ---");
  const fkQuery = `
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name;
  `;
  const fkRes = await client.query(fkQuery);
  console.table(fkRes.rows);

  // 7. Security Advisor Functions Check
  console.log("\n--- 7. Function Search Paths and ACL Permissions ---");
  const funcQuery = `
    SELECT 
      p.proname,
      p.prosecdef AS is_security_definer,
      p.proconfig AS search_path_config,
      p.proacl
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN ('verify_certificate', 'prevent_audit_log_mutation');
  `;
  const funcRes = await client.query(funcQuery);
  console.table(funcRes.rows);

  await client.end();
}

runCatalogInspection().catch(err => {
  console.error("Audit error:", err);
  process.exit(1);
});

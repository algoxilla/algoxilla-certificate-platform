// Algoxilla Certificate Platform - Safe All-Roles Grant Inspector
// Inspects function owners and execution privileges across all database roles in pg_roles.
// Non-destructive read-only inspection.

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
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
const client = new Client({
  connectionString: sanitizePostgresUrl(connUrl),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  try {
    // 1. List all roles in pg_roles
    const rolesRes = await client.query(`
      SELECT rolname, rolsuper, rolinherit, rolcanlogin 
      FROM pg_roles 
      WHERE rolname NOT LIKE 'pg_%' 
      ORDER BY rolname;
    `);
    console.log("=== DATABASE ROLES (Excluding pg_*) ===");
    console.log(rolesRes.rows.map(r => r.rolname).join(", "));

    // 2. Function metadata & owners
    const funcsRes = await client.query(`
      SELECT 
        p.proname,
        pg_get_userbyid(p.proowner) AS owner_name,
        p.prosecdef AS is_security_definer,
        p.proconfig AS config,
        p.proacl AS acl
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN ('verify_certificate', 'prevent_audit_log_mutation');
    `);
    console.log("\n=== FUNCTION OWNERS & ACL ===");
    for (const f of funcsRes.rows) {
      console.log(`Function: ${f.proname}`);
      console.log(`  Owner: ${f.owner_name}`);
      console.log(`  Security Definer: ${f.is_security_definer}`);
      console.log(`  Config: ${JSON.stringify(f.config)}`);
      console.log(`  ACL: ${f.acl}`);
    }

    // 3. Check has_function_privilege for every role in the DB
    console.log("\n=== EXECUTE PRIVILEGES FOR ALL ROLES ===");
    for (const f of ['verify_certificate(text)', 'prevent_audit_log_mutation()']) {
      console.log(`\nPrivileges for ${f}:`);
      for (const r of rolesRes.rows) {
        const privRes = await client.query(
          `SELECT has_function_privilege($1, $2, 'EXECUTE') AS can_exec`,
          [r.rolname, f]
        );
        console.log(`  Role '${r.rolname}': EXECUTE = ${privRes.rows[0].can_exec}`);
      }
      // Also check PUBLIC pseudo-role
      const pubRes = await client.query(
        `SELECT has_function_privilege('public', $1, 'EXECUTE') AS can_exec`,
        [f]
      );
      console.log(`  Pseudo-role 'PUBLIC': EXECUTE = ${pubRes.rows[0].can_exec}`);
    }

  } finally {
    await client.end();
  }
}

main();

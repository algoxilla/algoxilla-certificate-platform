// Algoxilla Certificate Platform - Supabase & PostgreSQL Migration Runner
// Safely applies DDL schemas (src/lib/db/schema.sql) and Row Level Security policies (src/lib/db/supabase-rls.sql)
// to a connected Supabase project.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

/**
 * Safely loads .env.local and .env files into process.env if present.
 * Uses Node.js native process.loadEnvFile (Node >= 20.12) with a resilient parser fallback.
 * Strictly avoids logging or exposing any secret values or credentials.
 */
function loadLocalEnv() {
  const candidateFiles = [".env.local", ".env"];
  for (const fileName of candidateFiles) {
    const fullPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) continue;

    let loaded = false;
    if (typeof process.loadEnvFile === "function") {
      try {
        process.loadEnvFile(fullPath);
        loaded = true;
      } catch {
        loaded = false;
      }
    }

    if (!loaded) {
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
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
      } catch {
        // Silently ignore read errors
      }
    }
  }
}

/**
 * Safely sanitizes a PostgreSQL connection URL.
 * Automatically percent-encodes unencoded special characters in the password component
 * (such as spaces, slashes, ampersands) to prevent WHATWG URL parsing errors in pg-connection-string.
 */
function sanitizePostgresUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  const trimmed = rawUrl.trim();
  const match = trimmed.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^@]+)$/);
  if (!match) return trimmed;
  const [, scheme, user, rawPassword, rest] = match;
  let cleanPassword = rawPassword;
  try {
    cleanPassword = decodeURIComponent(rawPassword);
  } catch {
    cleanPassword = rawPassword;
  }
  const encodedPassword = encodeURIComponent(cleanPassword);
  return `${scheme}${user}:${encodedPassword}@${rest}`;
}

async function runMigration() {
  // Load .env.local / .env before checking connection configuration
  loadLocalEnv();

  const rawConnectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!rawConnectionString) {
    console.error("❌ MIGRATION BLOCKED: DIRECT_URL or DATABASE_URL environment variable is missing.");
    console.error("Please provide your Supabase connection string in your environment or .env.local file.");
    process.exit(1);
  }

  const connectionString = sanitizePostgresUrl(rawConnectionString);

  console.log("=================================================");
  console.log("   ALGOXILLA PLATFORM - SUPABASE MIGRATION RUNNER ");
  console.log("=================================================\n");

  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  const client = new Client({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log("Connecting to Supabase PostgreSQL...");
    await client.connect();
    console.log("✓ Connected successfully to database.\n");

    const schemaPath = path.join(process.cwd(), "src", "lib", "db", "schema.sql");
    const rlsPath = path.join(process.cwd(), "src", "lib", "db", "supabase-rls.sql");

    const schemaSql = fs.readFileSync(schemaPath, "utf-8");
    const rlsSql = fs.readFileSync(rlsPath, "utf-8");

    console.log("1. Applying Canonical DDL Schema (tables, constraints, indexes)...");
    // Strip SQLite-specific triggers if present; PostgreSQL uses PL/pgSQL triggers in supabase-rls.sql
    const pgSchemaSql = schemaSql.replace(/-- IMMUTABILITY ENFORCEMENT ON AUDIT LOGS[\s\S]*$/, "");
    await client.query(pgSchemaSql);
    console.log("✓ Schema DDL applied successfully.\n");

    console.log("2. Applying Supabase Row Level Security (RLS) policies & triggers...");
    await client.query(rlsSql);
    console.log("✓ RLS policies applied successfully.\n");

    console.log("3. Bootstrapping Algothon'26 Primary Event...");
    const eventCheck = await client.query("SELECT id FROM events WHERE code = 'ALGOTHON26'");
    if (eventCheck.rows.length === 0) {
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO events (id, code, name, event_date, organizer_name, description, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [
          "algothon-26-event-id",
          "ALGOTHON26",
          "Algothon’26 — A National Level Hackathon",
          "2026-10-04",
          "Algoxilla",
          "Official Hackathon Certificate Registry",
          "ACTIVE",
          now,
        ]
      );
      console.log("✓ Event 'ALGOTHON26' bootstrapped into registry.\n");
    } else {
      console.log("✓ Event 'ALGOTHON26' already exists.\n");
    }

    console.log("4. Verifying Table Inventory...");
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log(`Found ${tableRes.rows.length} public tables:`);
    for (const r of tableRes.rows) {
      console.log(`  - ${r.table_name}`);
    }

    console.log("\n=================================================");
    console.log("   SUPABASE MIGRATION COMPLETED SUCCESSFULLY!    ");
    console.log("=================================================");
  } catch (err) {
    console.error("❌ Migration failed with error:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();

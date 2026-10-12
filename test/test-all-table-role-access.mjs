// Test direct query access for anon and authenticated across all 9 tables
import pg from "pg";
import fs from "node:fs";
import { sanitizePostgresUrl } from "../src/lib/db/supabaseClient.ts";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
const client = new pg.Client({
  connectionString: sanitizePostgresUrl(process.env.DIRECT_URL || process.env.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const tables = [
  "audit_logs", "certificates", "claim_tokens", "correction_requests",
  "eligibility_records", "event_registrations", "events", "organizer_users", "participants"
];

console.log("=== TESTING DIRECT QUERY AS ROLE anon AND authenticated ===");
await client.query("BEGIN;");
for (const role of ["anon", "authenticated"]) {
  for (const table of tables) {
    try {
      await client.query("SAVEPOINT sp;");
      await client.query(`SET LOCAL ROLE ${role};`);
      const res = await client.query(`SELECT count(*) FROM public.${table};`);
      console.log(`[${role}] ${table}: READ ALLOWED (count=${res.rows[0].count})`);
      await client.query("ROLLBACK TO sp;");
    } catch (err) {
      await client.query("ROLLBACK TO sp;");
      console.log(`[${role}] ${table}: BLOCKED (${err.code} - ${err.message.trim()})`);
    }
  }
}
await client.query("ROLLBACK;");
await client.end();

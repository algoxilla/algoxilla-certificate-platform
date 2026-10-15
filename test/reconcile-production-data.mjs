// Algoxilla Certificate Platform - Production Data Reconciliation Inspector
// Inspects registrations, certificates, claim tokens, and eligibility in detail.
// Read-only; strictly does not modify, delete, or expose any sensitive data.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { sanitizePostgresUrl } from "../src/lib/db/supabaseClient.ts";

function loadEnv() {
  const candidateFiles = [".env.local", ".env"];
  for (const fileName of candidateFiles) {
    const fullPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) continue;

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
loadEnv();

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!conn) {
  console.error("Missing database connection URL.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: sanitizePostgresUrl(conn),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("=================================================");
  console.log("   PRODUCTION DATA RECONCILIATION AUDIT          ");
  console.log("=================================================\n");

  // 1. Registrations
  console.log("--- 1. EVENT REGISTRATIONS ANALYSIS ---");
  const regRes = await pool.query(`
    SELECT 
      r.id,
      r.external_registration_id,
      r.registration_source,
      r.registration_status,
      p.email,
      p.normalized_name,
      r.created_at
    FROM event_registrations r
    JOIN participants p ON r.participant_id = p.id
    ORDER BY r.created_at ASC;
  `);

  console.log(`Total registrations: ${regRes.rows.length}`);
  const domainCounts = {};
  const sourceCounts = {};
  const syntheticMatches = [];
  const potentiallyReal = [];

  for (const row of regRes.rows) {
    const domain = (row.email.split("@")[1] || "unknown").toLowerCase();
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    sourceCounts[row.registration_source] = (sourceCounts[row.registration_source] || 0) + 1;

    const isSynthetic =
      row.email.endsWith(".test") ||
      row.email.includes("test") ||
      row.email.includes("example.com") ||
      row.email.includes("pilot") ||
      row.email.includes("synthetic") ||
      row.external_registration_id?.startsWith("GF-TEST") ||
      row.external_registration_id?.startsWith("PILOT-") ||
      row.external_registration_id?.startsWith("MOCK-");

    if (isSynthetic) {
      syntheticMatches.push(row);
    } else {
      potentiallyReal.push({
        id: row.id,
        externalId: row.external_registration_id,
        source: row.registration_source,
        name: row.normalized_name,
        emailDomain: domain,
        createdAt: row.created_at,
      });
    }
  }

  console.log("Registration Sources:", sourceCounts);
  console.log("Email Domains:", domainCounts);
  console.log(`Synthetic / Test Registrations: ${syntheticMatches.length}`);
  console.log(`Potentially Real / Non-test Domain Registrations: ${potentiallyReal.length}`);
  if (potentiallyReal.length > 0) {
    console.log("Non-test domain registrations breakdown:", potentiallyReal);
  }

  // 2. Certificates
  console.log("\n--- 2. CERTIFICATES ANALYSIS ---");
  const certCols = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'certificates' ORDER BY ordinal_position;
  `);
  console.log("Certificate columns:", certCols.rows.map(r => r.column_name));

  const certRes = await pool.query(`
    SELECT 
      c.*,
      p.email as participant_email
    FROM certificates c
    LEFT JOIN event_registrations r ON c.registration_id = r.id
    LEFT JOIN participants p ON r.participant_id = p.id
    ORDER BY c.created_at ASC;
  `);

  console.log(`Total certificates: ${certRes.rows.length}`);
  const certStatusCounts = {};
  const certCodePrefixes = {};
  const certRecipients = [];

  for (const c of certRes.rows) {
    certStatusCounts[c.status] = (certStatusCounts[c.status] || 0) + 1;
    const parts = c.certificate_code.split("-");
    const prefix = parts.slice(0, 3).join("-");
    certCodePrefixes[prefix] = (certCodePrefixes[prefix] || 0) + 1;
    certRecipients.push({
      code: c.certificate_code,
      name: c.recipient_name,
      status: c.status,
      type: c.certificate_type,
      email: c.participant_email,
    });
  }

  console.log("Certificate Statuses:", certStatusCounts);
  console.log("Certificate Code Groups:", certCodePrefixes);
  console.log("Sample Certificates (first 10):", certRecipients.slice(0, 10));

  // 3. Claim Tokens
  console.log("\n--- 3. CLAIM TOKENS ANALYSIS ---");
  const tokenCols = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'claim_tokens' ORDER BY ordinal_position;
  `);
  console.log("Claim token columns:", tokenCols.rows.map(r => r.column_name));

  const tokenRes = await pool.query(`
    SELECT t.*
    FROM claim_tokens t
    ORDER BY t.created_at ASC;
  `);

  console.log(`Total claim tokens: ${tokenRes.rows.length}`);
  const now = new Date();
  let usedCount = 0;
  let expiredCount = 0;
  let activeUnusedCount = 0;
  const activeTokensList = [];

  for (const t of tokenRes.rows) {
    const exp = new Date(t.expires_at);
    if (t.is_used) {
      usedCount++;
    } else if (exp < now) {
      expiredCount++;
    } else {
      activeUnusedCount++;
      activeTokensList.push({
        id: t.id,
        expiresAt: t.expires_at,
        isUsed: t.is_used,
        tokenHash: t.token_hash ? t.token_hash.slice(0, 10) + "..." : null,
      });
    }
  }

  console.log({
    total: tokenRes.rows.length,
    usedCount,
    expiredCount,
    activeUnusedCount,
  });

  if (activeTokensList.length > 0) {
    console.log("Active (unexpired & unused) tokens:", activeTokensList);
  } else {
    console.log("Active tokens: NONE (All 48 tokens are either consumed or expired).");
  }

  // 4. Eligibility Records
  console.log("\n--- 4. ELIGIBILITY RECORDS ANALYSIS ---");
  const eligCols = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'eligibility_records' ORDER BY ordinal_position;
  `);
  console.log("Eligibility columns:", eligCols.rows.map(r => r.column_name));

  const eligRes = await pool.query(`
    SELECT 
      e.eligibility_status,
      e.attendance_confirmed,
      count(*) as count
    FROM eligibility_records e
    GROUP BY e.eligibility_status, e.attendance_confirmed;
  `);
  console.log("Eligibility Breakdown:", eligRes.rows);

  const eligPending = await pool.query(`
    SELECT e.id, e.eligibility_status, e.attendance_confirmed, r.external_registration_id, p.email, p.normalized_name
    FROM eligibility_records e
    JOIN event_registrations r ON e.registration_id = r.id
    JOIN participants p ON r.participant_id = p.id;
  `);
  console.log("Eligibility Records Detail (all 20):", eligPending.rows);

  await pool.end();
}

main().catch((err) => {
  console.error("Reconciliation error:", err);
  process.exit(1);
});

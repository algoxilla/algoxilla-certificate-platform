// Algoxilla Certificate Platform - Safe Participant CSV Dry-Run Import Tool
// Validates an input CSV against the canonical schema and live database state WITHOUT writing data or sending emails.
// Produces a comprehensive summary: valid, invalid, duplicate, conflict, eligible, and projected actions.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { parseAndValidateParticipantCsv, normalizeEmail } from "../src/lib/csvImport.ts";
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

async function runDryRun() {
  const args = process.argv.slice(2);
  const csvArg = args.find((a) => !a.startsWith("--"));
  const trustConfirmation = args.includes("--trust-confirmation");

  if (!csvArg) {
    console.error("Usage: node scripts/dry-run-import.mjs <path-to-csv> [--trust-confirmation]");
    process.exit(1);
  }

  const csvPath = path.resolve(process.cwd(), csvArg);
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Error: CSV file not found at: ${csvPath}`);
    process.exit(1);
  }

  console.log("=================================================");
  console.log("   ALGOXILLA PARTICIPANT IMPORT — DRY RUN AUDIT  ");
  console.log("=================================================");
  console.log(`Source File:        ${path.basename(csvPath)}`);
  console.log(`Trust Attendance:   ${trustConfirmation ? "YES (Organizer Checked)" : "NO (Strict Attendance Safeguard)"}`);
  console.log(`Execution Mode:     STRICT DRY RUN (0 database writes, 0 emails)\n`);

  const csvContent = fs.readFileSync(csvPath, "utf-8");

  // 1. Fetch existing participants and verify event ALGOTHON26 from live database (Read-Only)
  let existingRecords = [];
  const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (rawUrl) {
    const connectionString = sanitizePostgresUrl(rawUrl);
    const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
    const client = new Client({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    try {
      await client.connect();

      // Verify event existence
      const eventRes = await client.query("SELECT id, code, name, status FROM events WHERE code = 'ALGOTHON26';");
      if (eventRes.rows.length === 0) {
        console.warn("⚠️ Warning: Event 'ALGOTHON26' was not found in database registry.");
      } else {
        const ev = eventRes.rows[0];
        console.log(`Target Event:       ${ev.name} [${ev.code}] (Status: ${ev.status})\n`);
      }

      // Read existing participants for duplicate and conflict cross-checks
      const partRes = await client.query(`
        SELECT p.email, p.normalized_name as "fullName", c.status as "certificateStatus"
        FROM participants p
        LEFT JOIN event_registrations r ON p.id = r.participant_id
        LEFT JOIN certificates c ON r.id = c.registration_id;
      `);
      existingRecords = partRes.rows;
      console.log(`Live DB Records:    ${existingRecords.length} existing participant records loaded for conflict check.\n`);
    } catch (dbErr) {
      console.warn(`⚠️ Notice: Live DB read-only lookup skipped (${dbErr.message}). Performing in-file validation only.\n`);
    } finally {
      await client.end().catch(() => {});
    }
  }

  // 2. Parse and Validate CSV
  const result = parseAndValidateParticipantCsv(csvContent, existingRecords, {
    trustConfirmationAsAttendance: trustConfirmation,
  });

  if (result.errors.length > 0) {
    console.error("❌ CRITICAL IMPORT ERRORS:");
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  // 3. Analyze Actions
  let wouldInsert = 0;
  let wouldSkipDuplicate = 0;
  let wouldFlagConflict = 0;
  let wouldReject = 0;
  let missingRequired = 0;

  const existingEmailMap = new Map();
  for (const rec of existingRecords) {
    existingEmailMap.set(normalizeEmail(rec.email), rec);
  }

  const reviewRows = [];

  for (const row of result.rows) {
    if (row.validationStatus === "REJECTED") {
      wouldReject++;
      if (!row.email || !row.fullName) missingRequired++;
      reviewRows.push({
        row: row.rowNumber,
        status: "REJECTED",
        reasons: row.validationNotes.join("; "),
      });
      continue;
    }

    if (row.validationStatus === "DUPLICATE") {
      wouldSkipDuplicate++;
      continue;
    }

    if (existingEmailMap.has(row.email)) {
      const existing = existingEmailMap.get(row.email);
      if (existing.fullName.toLowerCase() === row.fullName.toLowerCase()) {
        wouldSkipDuplicate++;
      } else {
        wouldFlagConflict++;
        reviewRows.push({
          row: row.rowNumber,
          status: "CONFLICT",
          reasons: `Conflicting name against existing DB record ('${existing.fullName}' vs '${row.fullName}')`,
        });
      }
    } else {
      if (row.validationStatus === "FLAGGED_FOR_REVIEW") {
        wouldFlagConflict++;
        reviewRows.push({
          row: row.rowNumber,
          status: "FLAGGED",
          reasons: row.validationNotes.join("; "),
        });
      } else {
        wouldInsert++;
      }
    }
  }

  // 4. Output Summary Report
  console.log("-------------------------------------------------");
  console.log("             DRY RUN SUMMARY REPORT              ");
  console.log("-------------------------------------------------");
  console.log(`Detected Format:          ${result.formatDetected}`);
  console.log(`Total Input Rows:         ${result.summary.totalRows}`);
  console.log(`Valid Records:            ${result.summary.acceptedCount + result.summary.flaggedCount}`);
  console.log(`Invalid / Rejected Rows:  ${result.summary.rejectedCount}`);
  console.log(`Missing Required Fields:  ${missingRequired}`);
  console.log(`In-File Duplicate Rows:   ${result.summary.duplicateCount}`);
  console.log(`Conflicting Records:      ${wouldFlagConflict}`);
  console.log("-------------------------------------------------");
  console.log("           ELIGIBILITY CLASSIFICATION            ");
  console.log("-------------------------------------------------");
  console.log(`Eligible for Certificate: ${result.summary.eligibleCount}`);
  console.log(`Pending Approval/Review:  ${result.summary.pendingApprovalCount}`);
  console.log(`Ineligible / Disqualified: ${result.summary.ineligibleCount}`);
  console.log("-------------------------------------------------");
  console.log("               PROJECTED ACTIONS                 ");
  console.log("-------------------------------------------------");
  console.log(`Records to INSERT:        ${wouldInsert}`);
  console.log(`Duplicates to SKIP:       ${wouldSkipDuplicate}`);
  console.log(`Records to FLAG/REVIEW:   ${wouldFlagConflict}`);
  console.log(`Invalid rows to REJECT:   ${wouldReject}`);
  console.log("-------------------------------------------------");

  if (reviewRows.length > 0) {
    console.log("\n⚠️ ROWS FLAGGED FOR ORGANIZER MANUAL REVIEW (First 10):");
    for (const r of reviewRows.slice(0, 10)) {
      console.log(`  - Row ${r.row} [${r.status}]: ${r.reasons}`);
    }
    if (reviewRows.length > 10) {
      console.log(`  ... and ${reviewRows.length - 10} more rows.`);
    }
  }

  console.log("\n=================================================");
  console.log("   DRY RUN COMPLETE — ZERO DATA MUTATED         ");
  console.log("=================================================");
}

runDryRun().catch((err) => {
  console.error("Dry run error:", err);
  process.exit(1);
});

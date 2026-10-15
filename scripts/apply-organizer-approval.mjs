// Script: apply-organizer-approval.mjs
// Applies organizer's verified decision approving eligibility for real participant Gopika S.
// Preserves attendance_confirmed = 0 to uphold the strict schema distinction and ensure zero unintended issuance.

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { sanitizePostgresUrl } from "../src/lib/db/supabaseClient.ts";

function loadEnv() {
  const candidateFiles = [".env.local", ".env"];
  for (const fileName of candidateFiles) {
    const fullPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) continue;
    const raw = fs.readFileSync(fullPath, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) {
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[match[1]] === undefined) process.env[match[1]] = val;
      }
    }
    return;
  }
}
loadEnv();

const rawConn = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!rawConn) {
  console.error("Missing direct/database URL");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: sanitizePostgresUrl(rawConn),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log("=== APPLY ORGANIZER ELIGIBILITY APPROVAL FOR REAL PARTICIPANT ===");

  // 1. Fetch current record for Gopika S
  const checkRes = await pool.query(`
    SELECT 
      e.id as eligibility_id,
      e.registration_id,
      e.eligibility_status,
      e.attendance_confirmed,
      e.review_decision_by,
      e.review_notes,
      e.reviewed_at,
      p.email,
      p.normalized_name
    FROM eligibility_records e
    JOIN event_registrations r ON e.registration_id = r.id
    JOIN participants p ON r.participant_id = p.id
    WHERE p.email = 'gopikasen43@gmail.com'
  `);

  if (checkRes.rows.length === 0) {
    console.error("No record found for gopikasen43@gmail.com!");
    process.exit(1);
  }

  const current = checkRes.rows[0];
  console.log("Current state:", current);

  if (current.eligibility_status === "ELIGIBLE") {
    console.log("Record is already approved as ELIGIBLE.");
  } else {
    const now = new Date().toISOString();
    const notes = "Organizer verified form respondent as eligible for certificate. Attendance unconfirmed; issuance strictly gated.";
    const actorId = "ORGANIZER";
    const actorRole = "ORGANIZER";

    // 2. Perform update in transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      const updateRes = await client.query(`
        UPDATE eligibility_records
        SET eligibility_status = 'ELIGIBLE',
            attendance_confirmed = 0,
            review_decision_by = $1,
            review_notes = $2,
            reviewed_at = $3,
            updated_at = $3
        WHERE id = $4
        RETURNING *;
      `, [actorId, notes, now, current.eligibility_id]);

      const previousState = JSON.stringify({
        eligibility_status: current.eligibility_status,
        attendance_confirmed: current.attendance_confirmed,
        review_decision_by: current.review_decision_by,
        reviewed_at: current.reviewed_at,
        review_notes: current.review_notes,
      });

      const newState = JSON.stringify({
        eligibility_status: "ELIGIBLE",
        attendance_confirmed: 0,
        review_decision_by: actorId,
        reviewed_at: now,
        review_notes: notes,
      });

      const auditId = crypto.randomUUID();
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, actor_role, action, target_entity, target_id, previous_state, new_state, timestamp)
        VALUES ($1, $2, $3, 'ELIGIBILITY_APPROVED', 'eligibility_records', $4, $5, $6, $7);
      `, [auditId, actorId, actorRole, current.eligibility_id, previousState, newState, now]);

      await client.query("COMMIT;");
      console.log("\nSuccessfully updated eligibility record and committed audit log.");
      console.log("Updated record:", updateRes.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK;");
      console.error("Failed to update eligibility record:", err);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  // 3. Post-update verification
  console.log("\n=== POST-UPDATE VERIFICATION ===");
  const verifyRes = await pool.query(`
    SELECT 
      e.id as eligibility_id,
      e.registration_id,
      e.eligibility_status,
      e.attendance_confirmed,
      e.review_decision_by,
      e.review_notes,
      e.reviewed_at,
      p.email,
      p.normalized_name,
      (SELECT COUNT(*) FROM certificates c WHERE c.registration_id = r.id) as cert_count,
      (SELECT COUNT(*) FROM claim_tokens t WHERE t.email = p.email) as token_count
    FROM eligibility_records e
    JOIN event_registrations r ON e.registration_id = r.id
    JOIN participants p ON r.participant_id = p.id
    WHERE p.email = 'gopikasen43@gmail.com'
  `);

  const updated = verifyRes.rows[0];
  console.log("Verified state:", updated);

  if (updated.eligibility_status !== "ELIGIBLE") {
    throw new Error(`Assertion failed: eligibility_status is ${updated.eligibility_status}, expected ELIGIBLE`);
  }
  if (Number(updated.attendance_confirmed) !== 0) {
    throw new Error(`Assertion failed: attendance_confirmed is ${updated.attendance_confirmed}, expected 0`);
  }
  if (Number(updated.cert_count) !== 0) {
    throw new Error(`Assertion failed: cert_count is ${updated.cert_count}, expected 0`);
  }
  if (Number(updated.token_count) !== 0) {
    throw new Error(`Assertion failed: token_count is ${updated.token_count}, expected 0`);
  }

  console.log("\nAll assertions PASSED:");
  console.log("- eligibility_status: ELIGIBLE");
  console.log("- attendance_confirmed: 0 (Unconfirmed - issuance strictly gated)");
  console.log("- certificates count: 0 (No certificate created)");
  console.log("- claim tokens count: 0 (No token or email sent)");
}

main().catch(console.error).finally(() => pool.end());

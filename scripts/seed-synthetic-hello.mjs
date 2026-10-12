import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

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

const isLive = process.env.NEXT_PUBLIC_APP_LIVE === "true";
if (isLive) {
  console.error("FATAL: Seeding synthetic participant is strictly forbidden when NEXT_PUBLIC_APP_LIVE is true.");
  process.exit(1);
}

const rawDbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!rawDbUrl) {
  console.error("FATAL: Missing DATABASE_URL or DIRECT_URL in environment.");
  process.exit(1);
}

// Clean connection URL
let connectionString = rawDbUrl.trim();
const match = connectionString.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^@]+)$/);
if (match) {
  const [, scheme, user, rawPassword, rest] = match;
  connectionString = `${scheme}${user}:${encodeURIComponent(rawPassword)}@${rest}`;
}

const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
const client = new Client({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

async function seedSyntheticHello() {
  console.log("================================================================================");
  console.log("   SEEDING SYNTHETIC TEST PARTICIPANT FOR hello@algoxilla.com                   ");
  console.log("================================================================================\n");

  await client.connect();

  const nowIso = new Date().toISOString();
  const eventId = "algothon-26-event-id";
  const targetEmail = "hello@algoxilla.com";
  const participantId = "synth-part-hello-algoxilla";
  const registrationId = "synth-reg-hello-algoxilla";
  const eligibilityId = "synth-elig-hello-algoxilla";
  const certificateId = "synth-cert-hello-algoxilla";
  const certificateCode = "ALGO-2026-TEST-HELLO";
  const recipientName = "Algoxilla Test Participant";
  const certificateType = "PARTICIPATION";

  const verificationHash = crypto
    .createHash("sha256")
    .update(`${certificateCode}|${recipientName}|${certificateType}|${nowIso}`)
    .digest("hex");

  try {
    await client.query("BEGIN;");

    // 1. Safety Guard: Check if email already exists in participants
    const existingCheck = await client.query(
      `SELECT id, email, normalized_name FROM participants WHERE LOWER(email) = $1;`,
      [targetEmail]
    );

    if (existingCheck.rows.length > 0) {
      const existing = existingCheck.rows[0];
      if (!existing.id.startsWith("synth-")) {
        throw new Error(
          `Safety violation: Email ${targetEmail} is already bound to non-synthetic record id ${existing.id}. Operation aborted.`
        );
      }
      console.log(`ℹ Found existing synthetic participant record (${existing.id}). Refreshing records cleanly.`);
      // Clean up previous child records for this synthetic participant
      await client.query(`DELETE FROM certificates WHERE registration_id = $1;`, [registrationId]);
      await client.query(`DELETE FROM eligibility_records WHERE registration_id = $1;`, [registrationId]);
      await client.query(`DELETE FROM event_registrations WHERE id = $1;`, [registrationId]);
      await client.query(`DELETE FROM participants WHERE id = $1;`, [existing.id]);
    }

    // 2. Ensure Event exists
    const eventCheck = await client.query(`SELECT id FROM events WHERE id = $1;`, [eventId]);
    if (eventCheck.rows.length === 0) {
      await client.query(
        `INSERT INTO events (id, code, name, event_date, organizer_name, status, created_at, updated_at)
         VALUES ($1, 'ALGOTHON26', 'Algothon’26 — A National Level Hackathon', 'October 04, 2026', 'Algoxilla', 'ACTIVE', $2, $2);`,
        [eventId, nowIso]
      );
      console.log(`✓ Seeded canonical event: ${eventId}`);
    }

    // 3. Insert Participant
    await client.query(
      `INSERT INTO participants (id, email, normalized_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4);`,
      [participantId, targetEmail, recipientName, nowIso]
    );
    console.log(`✓ Seeded synthetic participant: ${participantId} (${targetEmail})`);

    // 4. Insert Event Registration
    await client.query(
      `INSERT INTO event_registrations (id, event_id, participant_id, external_registration_id, registration_source, registered_name, registration_status, created_at, updated_at)
       VALUES ($1, $2, $3, 'SYNTH-REG-HELLO-001', 'MANUAL_IMPORT', $4, 'CONFIRMED', $5, $5);`,
      [registrationId, eventId, participantId, recipientName, nowIso]
    );
    console.log(`✓ Seeded event registration: ${registrationId} (Status: CONFIRMED)`);

    // 5. Insert Eligibility Record
    await client.query(
      `INSERT INTO eligibility_records (id, registration_id, eligibility_status, attendance_confirmed, review_decision_by, review_notes, reviewed_at, created_at, updated_at)
       VALUES ($1, $2, 'ELIGIBLE', 1, 'SYSTEM_PILOT', 'Designated synthetic test participant for single-recipient verification', $3, $3, $3);`,
      [eligibilityId, registrationId, nowIso]
    );
    console.log(`✓ Seeded eligibility record: ${eligibilityId} (Status: ELIGIBLE, Attendance: 1)`);

    // 6. Insert Certificate
    await client.query(
      `INSERT INTO certificates (id, certificate_code, registration_id, recipient_name, certificate_type, verification_hash, status, reissue_count, issued_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ISSUED', 0, $7, $7, $7);`,
      [certificateId, certificateCode, registrationId, recipientName, certificateType, verificationHash, nowIso]
    );
    console.log(`✓ Seeded issued certificate: ${certificateCode} (${certificateId})`);

    await client.query("COMMIT;");
    console.log("\n✓ Transaction committed successfully.");

    // 7. Verify portal lookup via Supabase PostgreSQL
    const portalRes = await client.query(
      `SELECT 
        p.id as part_id, p.email, p.normalized_name,
        r.id as reg_id, r.registration_status,
        el.eligibility_status, el.attendance_confirmed,
        c.certificate_code, c.status as cert_status
       FROM participants p
       JOIN event_registrations r ON p.id = r.participant_id
       JOIN eligibility_records el ON r.id = el.registration_id
       JOIN certificates c ON r.id = c.registration_id
       WHERE p.email = $1;`,
      [targetEmail]
    );

    if (portalRes.rows.length === 1) {
      const row = portalRes.rows[0];
      console.log("\n--- Verification Query Result ---");
      console.log(`  Participant ID:       ${row.part_id}`);
      console.log(`  Email:                ${row.email}`);
      console.log(`  Name:                 ${row.normalized_name}`);
      console.log(`  Registration Status:  ${row.registration_status}`);
      console.log(`  Eligibility Status:   ${row.eligibility_status}`);
      console.log(`  Attendance Confirmed: ${row.attendance_confirmed === 1 ? "true (1)" : "false (0)"}`);
      console.log(`  Certificate Code:     ${row.certificate_code}`);
      console.log(`  Certificate Status:   ${row.cert_status}`);
      console.log("---------------------------------\n");
    } else {
      throw new Error("Portal verification query failed to return the seeded participant.");
    }

  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("FATAL: Transaction rolled back:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedSyntheticHello().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

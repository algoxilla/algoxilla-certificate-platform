// Read-only inspection of Google Forms respondents and related database records
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
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
  console.error("Missing DB URL");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: sanitizePostgresUrl(rawConn),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log("=== 1. EVENTS ===");
  const events = await pool.query("SELECT id, code, name, event_date, status FROM events");
  console.log("Events:", events.rows);

  console.log("\n=== 2. ORGANIZER USERS ===");
  const organizers = await pool.query("SELECT id, email, full_name, role, is_active FROM organizer_users");
  console.log("Organizers:", organizers.rows);

  console.log("\n=== 3. ALL REGISTRATIONS WITH SOURCE GOOGLE_FORMS ===");
  const gfRegs = await pool.query(`
    SELECT 
      r.id as registration_id,
      r.event_id,
      r.external_registration_id,
      r.registration_source,
      r.registered_name,
      r.registration_status,
      r.raw_metadata,
      r.created_at as registration_created_at,
      p.id as participant_id,
      p.email as participant_email,
      p.normalized_name as participant_name,
      p.phone as participant_phone,
      e.id as eligibility_id,
      e.eligibility_status,
      e.attendance_confirmed,
      e.review_decision_by,
      e.reviewed_at,
      c.id as certificate_id,
      c.certificate_code,
      c.status as certificate_status
    FROM event_registrations r
    JOIN participants p ON r.participant_id = p.id
    LEFT JOIN eligibility_records e ON e.registration_id = r.id
    LEFT JOIN certificates c ON c.registration_id = r.id
    WHERE r.registration_source = 'GOOGLE_FORMS' OR r.external_registration_id LIKE 'GF-%'
    ORDER BY r.created_at ASC;
  `);

  console.log(`Found ${gfRegs.rows.length} Google Forms registrations:`);
  for (const row of gfRegs.rows) {
    console.log(JSON.stringify(row, null, 2));
  }

  console.log("\n=== 4. ALL OTHER REGISTRATIONS SUMMARY BY SOURCE ===");
  const sourceSummary = await pool.query(`
    SELECT registration_source, count(*) as count 
    FROM event_registrations 
    GROUP BY registration_source;
  `);
  console.log("Registrations by source:", sourceSummary.rows);

  console.log("\n=== 5. PARTICIPANTS SEARCH: GOPIKA ===");
  const gopika = await pool.query(`
    SELECT p.*, r.id as reg_id, r.registration_source, r.external_registration_id, e.id as eligibility_id, e.eligibility_status, e.attendance_confirmed, e.review_decision_by, e.reviewed_at
    FROM participants p
    LEFT JOIN event_registrations r ON r.participant_id = p.id
    LEFT JOIN eligibility_records e ON e.registration_id = r.id
    WHERE p.email ILIKE '%gopika%' OR p.normalized_name ILIKE '%gopika%';
  `);
  console.log("Gopika search:", gopika.rows);

  console.log("\n=== 6. EXTERNAL REGISTRATION IDS ACROSS ALL REGISTRATIONS ===");
  const extRegs = await pool.query(`
    SELECT r.id, r.external_registration_id, r.registration_source, p.email, p.normalized_name, e.eligibility_status, e.attendance_confirmed
    FROM event_registrations r
    JOIN participants p ON r.participant_id = p.id
    LEFT JOIN eligibility_records e ON e.registration_id = r.id
    WHERE r.external_registration_id IS NOT NULL;
  `);
  console.log("External registrations:", extRegs.rows);

  console.log("\n=== 7. AUDIT LOGS RECENT ENTRIES ===");
  const logs = await pool.query(`
    SELECT id, actor_id, actor_role, action, target_entity, target_id, timestamp
    FROM audit_logs
    ORDER BY timestamp DESC
    LIMIT 20;
  `);
  console.log("Recent audit logs count:", logs.rows.length);
  for (const log of logs.rows) {
    console.log(`[${log.timestamp}] actor: ${log.actor_id} (${log.actor_role}) -> action: ${log.action} on ${log.target_entity} (${log.target_id})`);
  }

  console.log("\n=== 8. CERTIFICATES IN PRODUCTION DB ===");
  const certCounts = await pool.query(`
    SELECT status, count(*) as count
    FROM certificates
    GROUP BY status;
  `);
  console.log("Certificates by status:", certCounts.rows);

  const sampleCerts = await pool.query(`
    SELECT c.certificate_code, c.recipient_name, c.status, p.email
    FROM certificates c
    LEFT JOIN event_registrations r ON c.registration_id = r.id
    LEFT JOIN participants p ON r.participant_id = p.id
    ORDER BY c.created_at DESC
    LIMIT 10;
  `);
  console.log("Sample recent certificates:", sampleCerts.rows);
}

main().catch(console.error).finally(() => pool.end());

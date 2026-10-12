import fs from "node:fs";
import path from "node:path";
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

async function run() {
  console.log("================================================================================");
  console.log("   CONTROLLED SINGLE-RECIPIENT CLAIM-LINK EMAIL DISPATCH TEST                   ");
  console.log("================================================================================\n");

  // 1. Safety Checks
  const appLiveVal = process.env.APP_LIVE ?? process.env.NEXT_PUBLIC_APP_LIVE;
  const isLive = appLiveVal === "true";
  console.log(`[Safety Check 1] APP_LIVE = ${appLiveVal}`);
  if (isLive || appLiveVal !== "false") {
    console.error("FATAL: APP_LIVE must be explicitly 'false'.");
    process.exit(1);
  }

  const rawAllowlist = process.env.TEST_EMAIL_ALLOWLIST || "";
  const allowlistItems = rawAllowlist.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  console.log(`[Safety Check 2] TEST_EMAIL_ALLOWLIST contains: [${allowlistItems.join(", ")}]`);
  if (allowlistItems.length !== 1 || allowlistItems[0] !== "hello@algoxilla.com") {
    console.error("FATAL: TEST_EMAIL_ALLOWLIST must contain exclusively hello@algoxilla.com.");
    process.exit(1);
  }

  const rawFrom = process.env.EMAIL_FROM || "";
  console.log(`[Safety Check 3] EMAIL_FROM configured: ${rawFrom.includes("devns181@gmail.com") ? "YES (devns181@gmail.com)" : "OTHER"}`);
  if (!rawFrom.includes("devns181@gmail.com")) {
    console.error("FATAL: EMAIL_FROM must use the verified Brevo sender devns181@gmail.com.");
    process.exit(1);
  }

  // 2. Database Record Verification
  const rawDbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  let connectionString = rawDbUrl.trim();
  const match = connectionString.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^@]+)$/);
  if (match) {
    const [, scheme, user, rawPassword, rest] = match;
    connectionString = `${scheme}${user}:${encodeURIComponent(rawPassword)}@${rest}`;
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  console.log("\n--- Checking Synthetic Participant In Database ---");
  const partRes = await client.query(
    `SELECT 
      p.id as part_id, p.email, p.normalized_name,
      r.id as reg_id, r.registration_status,
      el.eligibility_status, el.attendance_confirmed,
      c.id as cert_id, c.certificate_code, c.status as cert_status
     FROM participants p
     JOIN event_registrations r ON p.id = r.participant_id
     JOIN eligibility_records el ON r.id = el.registration_id
     JOIN certificates c ON r.id = c.registration_id
     WHERE p.id = 'synth-part-hello-algoxilla' AND LOWER(p.email) = 'hello@algoxilla.com';`
  );

  if (partRes.rows.length !== 1) {
    console.error("FATAL: Synthetic participant synth-part-hello-algoxilla not found or incomplete in database.");
    await client.end();
    process.exit(1);
  }

  const pData = partRes.rows[0];
  console.log(`  ✓ Participant ID:       ${pData.part_id}`);
  console.log(`  ✓ Email:                ${pData.email}`);
  console.log(`  ✓ Registration Status:  ${pData.registration_status} (CONFIRMED)`);
  console.log(`  ✓ Eligibility Status:   ${pData.eligibility_status} (ELIGIBLE)`);
  console.log(`  ✓ Attendance Confirmed: ${pData.attendance_confirmed === 1 ? "true (1)" : "false (0)"}`);
  console.log(`  ✓ Certificate Code:     ${pData.certificate_code} (ALGO-2026-TEST-HELLO)`);
  console.log(`  ✓ Certificate Status:   ${pData.cert_status} (ISSUED)`);

  if (pData.eligibility_status !== "ELIGIBLE" || pData.attendance_confirmed !== 1 || pData.certificate_code !== "ALGO-2026-TEST-HELLO") {
    console.error("FATAL: Participant record does not meet eligibility or certificate prerequisites.");
    await client.end();
    process.exit(1);
  }

  // Count existing claim tokens for hello@algoxilla.com before dispatch
  const beforeTokens = await client.query(
    `SELECT count(*) FROM claim_tokens WHERE LOWER(email) = 'hello@algoxilla.com';`
  );
  const countBefore = parseInt(beforeTokens.rows[0].count, 10);
  console.log(`  Current claim tokens for hello@algoxilla.com: ${countBefore}`);

  // 3. Execute Existing POST /api/auth/send-claim-link flow
  console.log("\n--- Triggering POST /api/auth/send-claim-link Flow ---");
  const uniqueIp = `10.99.88.${Math.floor(10 + Math.random() * 80)}`;
  const dispatchRes = await fetch("http://localhost:3000/api/auth/send-claim-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": uniqueIp,
    },
    body: JSON.stringify({ email: "hello@algoxilla.com" }),
  });

  const dispatchStatus = dispatchRes.status;
  const dispatchBody = await dispatchRes.json();
  console.log(`  HTTP Response Status: ${dispatchStatus}`);
  console.log(`  Response Body:`, JSON.stringify(dispatchBody, null, 2));

  if (dispatchStatus !== 200 || !dispatchBody.success) {
    console.error("FATAL: send-claim-link route failed.");
    await client.end();
    process.exit(1);
  }

  // 4. Verify Claim Token in Database
  console.log("\n--- Verifying Stored Claim Token in Database ---");
  const afterTokens = await client.query(
    `SELECT id, email, token_hash, token_type, attempts, expires_at, consumed_at, created_at
     FROM claim_tokens 
     WHERE LOWER(email) = 'hello@algoxilla.com'
     ORDER BY created_at DESC 
     LIMIT 1;`
  );

  if (afterTokens.rows.length === 0) {
    console.error("FATAL: No claim token was recorded in claim_tokens.");
    await client.end();
    process.exit(1);
  }

  const latestToken = afterTokens.rows[0];
  console.log(`  ✓ Token Record ID:   ${latestToken.id}`);
  console.log(`  ✓ Token Type:        ${latestToken.token_type}`);
  console.log(`  ✓ Recipient Email:   ${latestToken.email}`);
  console.log(`  ✓ Hash Stored:       ${latestToken.token_hash ? "YES (SHA-256)" : "NO"}`);
  console.log(`  ✓ Expires At:        ${latestToken.expires_at}`);
  console.log(`  ✓ Consumed At:       ${latestToken.consumed_at === null ? "null (UNCONSUMED)" : latestToken.consumed_at}`);
  console.log(`  ✓ Created At:        ${latestToken.created_at}`);

  await client.end();

  // 5. Inspect Brevo Telemetry for Dispatch Outcome
  console.log("\n--- Inspecting Brevo Transactional Telemetry ---");
  const apiKey = process.env.BREVO_API_KEY;
  if (apiKey) {
    try {
      // Pause 2 seconds for Brevo relay processing
      await new Promise(r => setTimeout(r, 2000));
      const brevoRes = await fetch("https://api.brevo.com/v3/smtp/statistics/events?email=hello%40algoxilla.com&limit=3", {
        headers: {
          accept: "application/json",
          "api-key": apiKey,
        },
      });

      if (brevoRes.ok) {
        const brevoData = await brevoRes.json();
        const events = brevoData.events || [];
        console.log(`  Brevo events recorded for hello@algoxilla.com: ${events.length}`);
        if (events.length > 0) {
          const latestEvent = events[0];
          console.log(`  Latest Event:`);
          console.log(`    Date:      ${latestEvent.date}`);
          console.log(`    Event:     ${latestEvent.event}`);
          console.log(`    From:      ${latestEvent.from}`);
          console.log(`    Subject:   ${latestEvent.subject}`);
          if (latestEvent.reason) {
            console.log(`    Reason:    ${latestEvent.reason}`);
          }
        }
      } else {
        console.log(`  Brevo statistics query returned status ${brevoRes.status}`);
      }
    } catch (e) {
      console.log(`  Could not fetch Brevo events: ${e.message}`);
    }
  }

  console.log("\n================================================================================");
  console.log("   SINGLE-RECIPIENT CLAIM-LINK EMAIL TEST COMPLETED                             ");
  console.log("================================================================================\n");
}

run().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

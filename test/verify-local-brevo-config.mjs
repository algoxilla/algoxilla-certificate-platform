import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.log(JSON.stringify({ error: ".env.local not found" }));
  process.exit(1);
}

const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
const env = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) {
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
}

const brevoKeyPresent = Boolean(env.BREVO_API_KEY && env.BREVO_API_KEY.trim().length > 0);
const brevoKeyIsPlaceholder = Boolean(env.BREVO_API_KEY && env.BREVO_API_KEY.includes("replace-with"));
const emailFromPresent = Boolean(env.EMAIL_FROM && env.EMAIL_FROM.trim().length > 0);
const appLiveIsFalse = env.APP_LIVE === "false" || env.NEXT_PUBLIC_APP_LIVE === "false";

const rawAllowlist = env.TEST_EMAIL_ALLOWLIST || "";
const allowlistEntries = rawAllowlist.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const allowlistOnlyHello = allowlistEntries.length === 1 && allowlistEntries[0] === "hello@algoxilla.com";

console.log(JSON.stringify({
  check1_brevo_key_present: brevoKeyPresent,
  check1_brevo_key_is_placeholder: brevoKeyIsPlaceholder,
  check2_email_from_configured: emailFromPresent,
  check3_app_live_is_false: appLiveIsFalse,
  check4_allowlist_only_hello: allowlistOnlyHello,
  email_from_format: env.EMAIL_FROM ? "CONFIGURED" : "MISSING"
}, null, 2));

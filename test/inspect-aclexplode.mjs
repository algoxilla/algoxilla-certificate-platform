import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { sanitizePostgresUrl } from "../src/lib/db/supabaseClient.ts";

function loadLocalEnv() {
  const candidateFiles = [".env.local", ".env"];
  for (const fileName of candidateFiles) {
    const fullPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) continue;
    if (typeof process.loadEnvFile === "function") {
      try { process.loadEnvFile(fullPath); return; } catch {}
    }
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (match) {
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
          if (process.env[match[1]] === undefined) process.env[match[1]] = val;
        }
      }
      return;
    } catch {}
  }
}
loadLocalEnv();

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: sanitizePostgresUrl(connUrl), ssl: { rejectUnauthorized: false } });
await client.connect();

const res = await client.query(`
  SELECT 
    p.proname,
    p.proacl,
    a.grantor,
    a.grantee,
    CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee_name,
    a.privilege_type,
    a.is_grantable
  FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(p.proacl) a
  WHERE p.proname IN ('verify_certificate', 'prevent_audit_log_mutation');
`);

console.log("=== ACLEXPLODE CURRENT RESULTS ===");
console.log(JSON.stringify(res.rows, null, 2));

await client.end();

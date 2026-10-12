// Algoxilla Certificate Platform - Test Real PostgREST HTTP Gateway vs Direct PostgreSQL Connection
// Inspects real HTTP response of Supabase PostgREST gateway to compare against direct SQL 'SET ROLE anon'.

import fs from "node:fs";
import path from "node:path";

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

loadLocalEnv();

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function testGateway() {
  console.log("=== SUPABASE POSTGREST HTTP GATEWAY INSPECTION ===");
  console.log("Supabase URL configured:", Boolean(sbUrl));

  if (!sbUrl) {
    console.log("No NEXT_PUBLIC_SUPABASE_URL configured.");
    return;
  }

  // 1. Unauthenticated request to /rest/v1/rpc/verify_certificate (no apikey header)
  try {
    const resNoKey = await fetch(`${sbUrl}/rest/v1/rpc/verify_certificate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_code: "NONEXISTENT-CODE" }),
    });
    console.log("\n1. Request WITHOUT apikey header:");
    console.log("   Status:", resNoKey.status, resNoKey.statusText);
    const bodyNoKey = await resNoKey.text();
    console.log("   Body:", bodyNoKey);
  } catch (err) {
    console.log("   Fetch error (no key):", err.message);
  }

  // 2. Request with invalid/arbitrary apikey header
  try {
    const resBadKey = await fetch(`${sbUrl}/rest/v1/rpc/verify_certificate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "invalid-dummy-anon-key-for-testing",
      },
      body: JSON.stringify({ p_code: "NONEXISTENT-CODE" }),
    });
    console.log("\n2. Request WITH invalid apikey header:");
    console.log("   Status:", resBadKey.status, resBadKey.statusText);
    const bodyBadKey = await resBadKey.text();
    console.log("   Body:", bodyBadKey);
  } catch (err) {
    console.log("   Fetch error (bad key):", err.message);
  }

  // 3. Inspect what happens when calling the Next.js server verification endpoint
  try {
    const localRes = await fetch("http://localhost:3000/api/verify/ALGO-2026-HACK-8942");
    console.log("\n3. Request to Next.js API route (/api/verify/ALGO-2026-HACK-8942):");
    console.log("   Status:", localRes.status, localRes.statusText);
    const localBody = await localRes.json();
    console.log("   Status Field:", localBody.status);
    console.log("   Database Integration:", localBody.databaseIntegration);
  } catch (err) {
    console.log("   Fetch error (Next.js route):", err.message);
  }
}

testGateway();

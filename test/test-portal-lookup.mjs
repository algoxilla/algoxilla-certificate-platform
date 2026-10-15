import fs from "node:fs";
import path from "node:path";
import { getCertificateRepository } from "../src/lib/db/client.ts";

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

async function main() {
  const repo = getCertificateRepository();
  console.log("Testing getParticipantPortalData with non-existent email...");
  const res = await repo.getParticipantPortalData("synthetic.test.user.audit@example.com");
  console.log("Result for non-existent:", res);

  console.log("\nTesting getParticipantPortalData with Gopika S (pending)...");
  const gopikaRes = await repo.getParticipantPortalData("gopikasen43@gmail.com");
  console.log("Result for Gopika S:", gopikaRes ? {
    participant: gopikaRes.participant.email,
    eligibility: gopikaRes.eligibility.eligibilityStatus,
    attendance: gopikaRes.eligibility.attendanceConfirmed,
    cert: gopikaRes.certificate
  } : null);

  await repo.close();
}

main().catch(console.error);

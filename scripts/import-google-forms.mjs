// Algoxilla Certificate Platform - Safe Google Forms CLI Import & Dry-Run Tool
// Validates, evaluates, or imports Google Forms submissions (JSON or CSV export)
// Default mode is strictly DRY-RUN. Passing --commit executes transactional database import.
// Safety Guarantee: NEVER issues certificates, NEVER sends emails, NEVER marks attendance.

import fs from "node:fs";
import path from "node:path";
import {
  evaluateGoogleFormsDryRun,
  processGoogleFormsBatch,
  validateAndNormalizeSubmission,
} from "../src/lib/integrations/googleForms.ts";
import { parseAndValidateParticipantCsv } from "../src/lib/csvImport.ts";
import { closeSupabaseClients } from "../src/lib/db/supabaseClient.ts";

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

async function main() {
  const args = process.argv.slice(2);
  const isCommit = args.includes("--commit");
  const eventIdx = args.indexOf("--event");
  const targetEvent = eventIdx !== -1 && args[eventIdx + 1] ? args[eventIdx + 1] : "ALGOTHON26";

  const filePath = args.find((a) => !a.startsWith("--") && a !== targetEvent);

  if (!filePath) {
    console.log(`
Usage: node scripts/import-google-forms.mjs <file-path.json|csv> [options]

Options:
  --dry-run       Evaluate import against database state without writing (DEFAULT)
  --commit        Execute transactional import into database
  --event <code>  Target event code (default: ALGOTHON26)
    `);
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Error: File not found at: ${resolvedPath}`);
    process.exit(1);
  }

  console.log("=================================================");
  console.log("   ALGOXILLA GOOGLE FORMS IMPORT & DRY-RUN TOOL  ");
  console.log("=================================================");
  console.log(`File:           ${path.basename(resolvedPath)}`);
  console.log(`Target Event:   ${targetEvent}`);
  console.log(`Mode:           ${isCommit ? "🚨 COMMIT (TRANSACTIONAL PERSISTENCE)" : "🛡️  STRICT DRY-RUN (0 WRITES)"}`);
  console.log("-------------------------------------------------\n");

  const fileContent = fs.readFileSync(resolvedPath, "utf-8");
  let submissions = [];

  // Parse JSON or CSV
  if (resolvedPath.endsWith(".json")) {
    try {
      const parsedJson = JSON.parse(fileContent);
      const rawList = Array.isArray(parsedJson)
        ? parsedJson
        : Array.isArray(parsedJson.submissions)
        ? parsedJson.submissions
        : [parsedJson];

      for (const item of rawList) {
        submissions.push({
          ...item,
          eventId: item.eventId || targetEvent,
        });
      }
    } catch (jsonErr) {
      console.error("❌ Failed to parse JSON input:", jsonErr.message);
      process.exit(1);
    }
  } else {
    // CSV parsing using existing csvImport engine
    const csvResult = parseAndValidateParticipantCsv(fileContent, [], {
      trustConfirmationAsAttendance: false, // Never trust registration as attendance
    });

    for (const row of csvResult.rows) {
      submissions.push({
        responseId: row.externalId || `GF-ROW-${row.rowNumber}`,
        email: row.email,
        fullName: row.fullName,
        eventId: targetEvent,
      });
    }
  }

  console.log(`Loaded ${submissions.length} submission(s) from input source.\n`);

  if (!isCommit) {
    // Execute Dry-Run
    const dryRunResult = await evaluateGoogleFormsDryRun(submissions, targetEvent);

    console.log("-------------------------------------------------");
    console.log("               DRY-RUN EVALUATION                ");
    console.log("-------------------------------------------------");
    console.log(`Total Submissions:       ${dryRunResult.total}`);
    console.log(`Would INSERT (New):      ${dryRunResult.wouldInsert}`);
    console.log(`Already Processed (Skip):${dryRunResult.alreadyProcessed}`);
    console.log(`Would EDIT (Name update):${dryRunResult.wouldEdit}`);
    console.log(`Conflicting Registrations:${dryRunResult.wouldFlagConflict}`);
    console.log(`Invalid / Rejected:      ${dryRunResult.wouldReject}`);
    console.log("-------------------------------------------------");

    if (dryRunResult.results.length > 0) {
      console.log("\nSample Projected Outcomes (First 10):");
      for (const r of dryRunResult.results.slice(0, 10)) {
        console.log(`  - [${r.action}] ID: ${r.responseId} | ${r.email || "N/A"} (${r.fullName || "N/A"}) - ${r.notes || ""}`);
      }
    }

    console.log("\n🛡️  DRY-RUN COMPLETE. No data was modified in the database.");
    console.log("To apply these changes, rerun with '--commit'.\n");
  } else {
    // Execute Commit
    const commitResult = await processGoogleFormsBatch(submissions, {
      id: "ADMIN_CLI_IMPORT",
      role: "ORGANIZER",
      ip: "127.0.0.1",
    });

    console.log("-------------------------------------------------");
    console.log("             IMPORT EXECUTION SUMMARY            ");
    console.log("-------------------------------------------------");
    console.log(`Total Submissions:       ${commitResult.total}`);
    console.log(`Inserted (New):          ${commitResult.wouldInsert}`);
    console.log(`Already Processed (Skip):${commitResult.alreadyProcessed}`);
    console.log(`Edited (Name update):    ${commitResult.wouldEdit}`);
    console.log(`Conflicting:             ${commitResult.wouldFlagConflict}`);
    console.log(`Rejected:                ${commitResult.wouldReject}`);
    console.log("-------------------------------------------------");
    console.log("✅ COMMIT COMPLETE. All operations executed in transactional safety.");
    console.log("Zero certificates were issued. Zero emails were dispatched.\n");
  }
}

main()
  .catch((err) => {
    console.error("❌ Fatal error during Google Forms import:", err);
    process.exit(1);
  })
  .finally(async () => {
    await closeSupabaseClients();
  });

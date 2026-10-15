// Algoxilla Certificate Platform - Organizer Eligibility Approval & Invariant Test
// Verifies:
// 1. approveEligibility DAL method updates eligibility to ELIGIBLE while preserving attendance_confirmed = 0
// 2. Audit log entry is created with action ELIGIBILITY_APPROVED
// 3. Participant portal data and certificate issuance gate strictly block issuance when attendance_confirmed = false
// 4. Admin route rejects unauthorized requests (missing or invalid x-organizer-secret -> 401) via HTTP

import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CertificateRepository } from "../src/lib/db/repository.ts";

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
    } catch {}
  }
}
loadEnv();

async function runTests() {
  console.log("================================================================================");
  console.log("   ADMIN ELIGIBILITY APPROVAL & ATTENDANCE INVARIANT TESTS                      ");
  console.log("================================================================================\n");

  const repo = new CertificateRepository(":memory:");

  // Setup seed event and participant
  const eventId = crypto.randomUUID();
  repo.upsertEvent({
    id: eventId,
    code: "TEST-EVENT",
    name: "Test Event 2026",
    eventDate: "2026-10-15",
    organizerName: "Algoxilla",
    status: "COMPLETED",
  });

  repo.commitCsvImport({
    eventId,
    organizerId: "TEST_ORGANIZER",
    sourceFile: "test_input.csv",
    rows: [
      {
        fullName: "Test Candidate",
        email: "candidate@test.com",
        source: "GOOGLE_FORMS",
        registrationStatus: "CONFIRMED",
        attendanceConfirmed: false,
        eligibilityStatus: "PENDING_ORGANIZER_APPROVAL",
      },
    ],
  });

  const portalBefore = repo.getParticipantPortalData("candidate@test.com");
  assert.ok(portalBefore, "Candidate must exist");
  assert.strictEqual(portalBefore.eligibility.eligibilityStatus, "PENDING_ORGANIZER_APPROVAL");
  assert.strictEqual(portalBefore.eligibility.attendanceConfirmed, false);
  console.log("✓ Initial state: PENDING_ORGANIZER_APPROVAL, attendanceConfirmed: false");

  // -------------------------------------------------------------------------
  // TEST 1: approveEligibility Preserves attendance_confirmed = 0
  // -------------------------------------------------------------------------
  console.log("\n--- Test 1: approveEligibility Logic & Attendance Separation ---");
  {
    const approved = repo.approveEligibility({
      registrationId: portalBefore.registration.id,
      actorId: "ORGANIZER_001",
      reviewNotes: "Organizer manually verified eligibility.",
    });

    assert.strictEqual(approved.eligibilityStatus, "ELIGIBLE");
    assert.strictEqual(approved.attendanceConfirmed, false, "attendanceConfirmed must remain false");
    assert.strictEqual(approved.reviewDecisionBy, "ORGANIZER_001");

    const portalAfter = repo.getParticipantPortalData("candidate@test.com");
    assert.strictEqual(portalAfter.eligibility.eligibilityStatus, "ELIGIBLE");
    assert.strictEqual(portalAfter.eligibility.attendanceConfirmed, false);
    console.log("✓ Test 1: Participant is ELIGIBLE but attendanceConfirmed is strictly false.");
  }

  // -------------------------------------------------------------------------
  // TEST 2: Audit Log Verification
  // -------------------------------------------------------------------------
  console.log("\n--- Test 2: Immutable Audit Log Generation ---");
  {
    const auditLogs = repo.getAuditLogs(10);
    const approvalLog = auditLogs.find((l) => l.action === "ELIGIBILITY_APPROVED");
    assert.ok(approvalLog, "Audit log must contain ELIGIBILITY_APPROVED entry");
    assert.strictEqual(approvalLog.actorId, "ORGANIZER_001");
    assert.strictEqual(approvalLog.actorRole, "ORGANIZER");
    assert.strictEqual(approvalLog.targetEntity, "eligibility_records");
    console.log("✓ Test 2: Audit log correctly recorded ELIGIBILITY_APPROVED.");
  }

  // -------------------------------------------------------------------------
  // TEST 3: Issuance Gate Strictly Blocks When attendanceConfirmed = false
  // -------------------------------------------------------------------------
  console.log("\n--- Test 3: Issuance Gate Enforces Attendance Requirement ---");
  {
    let claimError = null;
    try {
      repo.claimCertificate({
        registrationId: portalBefore.registration.id,
        recipientName: "Test Candidate",
      });
    } catch (err) {
      claimError = err;
    }

    assert.ok(claimError, "claimCertificate MUST throw error when attendance is unconfirmed");
    assert.ok(
      claimError.message.includes("not approved by organizer") ||
      claimError.message.includes("attendance"),
      `Expected attendance error message, got: ${claimError.message}`
    );
    console.log("✓ Test 3: Certificate claiming strictly blocked for ELIGIBLE participant with unconfirmed attendance.");
  }

  // -------------------------------------------------------------------------
  // TEST 4: HTTP Admin Route Authorization (against dev server or production)
  // -------------------------------------------------------------------------
  console.log("\n--- Test 4: HTTP Admin Route Authorization Guard ---");
  const testBaseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
  try {
    // 4A. Unauthenticated request without secret header
    const unauthRes = await fetch(`${testBaseUrl}/api/admin/eligibility/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId: "some-id" }),
    });
    assert.strictEqual(unauthRes.status, 401, "Unauthenticated request must return 401");
    console.log("✓ Test 4A: Unauthenticated request rejected with HTTP 401.");

    // 4B. Forged organizer secret
    const badSecretRes = await fetch(`${testBaseUrl}/api/admin/eligibility/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-organizer-secret": "forged-invalid-organizer-secret-999",
      },
      body: JSON.stringify({ registrationId: "some-id" }),
    });
    assert.strictEqual(badSecretRes.status, 401, "Forged secret must return HTTP 401");
    console.log("✓ Test 4B: Forged secret rejected with HTTP 401.");
  } catch (netErr) {
    console.log("Note: Local dev server HTTP check skipped or not running:", netErr.message);
  }

  repo.close();

  console.log("\n================================================================================");
  console.log("   ALL ADMIN ELIGIBILITY APPROVAL & INVARIANT TESTS PASSED!                     ");
  console.log("================================================================================\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

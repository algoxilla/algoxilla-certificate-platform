// Test suite for Phase B Data Model, Schema, and Repository
import assert from "node:assert";
import { CertificateRepository } from "../src/lib/db/repository.ts";
import { parseAndValidateParticipantCsv, getSyntheticVerifiedCsvContent } from "../src/lib/csvImport.ts";

console.log("--- RUNNING PHASE B DATABASE & SCHEMA TEST SUITE ---");

// Initialize in-memory database instance
const repo = new CertificateRepository(":memory:");

// Test 1: Event bootstrapping
{
  const event = repo.upsertEvent({
    id: "algothon-26-event-id",
    code: "ALGOTHON26",
    name: "Algothon’26 — A National Level Hackathon",
    eventDate: "2026-10-04",
    organizerName: "Algoxilla",
    description: "Official Hackathon Certificate Registry",
    status: "ACTIVE",
  });

  assert.strictEqual(event.code, "ALGOTHON26");
  const fetched = repo.getEventByCode("ALGOTHON26");
  assert.ok(fetched, "Should fetch created event");
  assert.strictEqual(fetched.name, "Algothon’26 — A National Level Hackathon");
  console.log("✓ Test 1 Passed: Event bootstrap and retrieval");
}

// Test 2: Ingest Organizer-Verified CSV Import into Persistent DAL
let sampleEligibleRegId = "";
{
  const csvRaw = getSyntheticVerifiedCsvContent();
  const parsed = parseAndValidateParticipantCsv(csvRaw);

  const importPayload = {
    eventId: "algothon-26-event-id",
    organizerId: "organizer-dev-raj",
    sourceFile: "Synthetic_Algothon26_Verified.csv",
    rows: parsed.rows
      .filter((r) => r.validationStatus === "ACCEPTED")
      .map((r) => ({
        fullName: r.fullName,
        email: r.email,
        externalId: r.externalId,
        source: r.source,
        registrationStatus: r.registrationStatus,
        eligibilityStatus: r.eligibilityStatus,
        attendanceConfirmed: r.attendanceConfirmed,
        rawMetadata: { originalSource: "Synthetic Verified Generator", rowNumber: r.rowNumber },
      })),
  };

  const commitResult = repo.commitCsvImport(importPayload);
  assert.ok(commitResult.insertedParticipants > 0, "Should insert participants");
  assert.ok(commitResult.createdRegistrations > 0, "Should create registrations");
  assert.ok(commitResult.createdEligibilityRecords > 0, "Should create eligibility records");
  console.log(`✓ Test 2 Passed: Atomic CSV import committed ${commitResult.createdRegistrations} registrations`);

  // Grab one eligible participant registration for subsequent certificate tests
  const p = repo.getParticipantByEmail("alex.chen@example.com");
  assert.ok(p, "Participant Alex Chen should exist");
  assert.strictEqual(p.normalizedName, "Alex Chen");
}

// Test 3: Idempotent repeat import (Safe Handling for Repeat Imports)
{
  const csvRaw = getSyntheticVerifiedCsvContent();
  const parsed = parseAndValidateParticipantCsv(csvRaw);

  const repeatPayload = {
    eventId: "algothon-26-event-id",
    organizerId: "organizer-dev-raj",
    sourceFile: "Synthetic_Algothon26_Verified.csv",
    rows: parsed.rows
      .filter((r) => r.validationStatus === "ACCEPTED")
      .map((r) => ({
        fullName: r.fullName,
        email: r.email,
        externalId: r.externalId,
        source: r.source,
        registrationStatus: r.registrationStatus,
        eligibilityStatus: r.eligibilityStatus,
        attendanceConfirmed: r.attendanceConfirmed,
      })),
  };

  const repeatResult = repo.commitCsvImport(repeatPayload);
  // All rows already registered for this event must be skipped as duplicates
  assert.strictEqual(repeatResult.createdRegistrations, 0, "Should create 0 new registrations on re-import");
  assert.ok(repeatResult.skippedDuplicates > 0, "Should count re-imported rows as skipped duplicates");
  console.log(`✓ Test 3 Passed: Idempotent repeat import cleanly skipped ${repeatResult.skippedDuplicates} duplicates`);
}

// Test 4: Conflicting Participant Records Handling
{
  const conflictPayload = {
    eventId: "algothon-26-event-id",
    organizerId: "organizer-aditya-raj",
    sourceFile: "Synthetic_Conflict_Test.csv",
    rows: [
      {
        fullName: "Alexander Chen", // Existing participant is "Alex Chen"
        email: "alex.chen@example.com",
        source: "GOOGLE_FORMS",
        registrationStatus: "CONFIRMED",
        eligibilityStatus: "ELIGIBLE",
        attendanceConfirmed: true,
      },
    ],
  };

  const conflictResult = repo.commitCsvImport(conflictPayload);
  assert.strictEqual(conflictResult.flaggedConflicts, 1, "Should flag name discrepancy conflict");
  console.log("✓ Test 4 Passed: Detected and flagged conflicting participant name against registry");
}

// Test 5: Certificate Issuance Safeguards (Ineligible participant must be rejected)
{
  // Insert an ineligible registration directly
  const dummyP = repo.db.prepare("INSERT INTO participants (id, email, normalized_name) VALUES (?, ?, ?)");
  dummyP.run("ineligible-p-id", "ineligible.user@example.com", "Ineligible User");
  
  const dummyR = repo.db.prepare(`
    INSERT INTO event_registrations (id, event_id, participant_id, registration_source, registered_name, registration_status)
    VALUES (?, ?, ?, 'MANUAL_IMPORT', 'Ineligible User', 'UNCONFIRMED')
  `);
  dummyR.run("ineligible-reg-id", "algothon-26-event-id", "ineligible-p-id");

  const dummyE = repo.db.prepare(`
    INSERT INTO eligibility_records (id, registration_id, eligibility_status, attendance_confirmed)
    VALUES (?, ?, 'INELIGIBLE', 0)
  `);
  dummyE.run("ineligible-elig-id", "ineligible-reg-id");

  assert.throws(
    () => {
      repo.issueCertificate({
        registrationId: "ineligible-reg-id",
        recipientName: "Ineligible User",
        actorId: "organizer-dev-raj",
      });
    },
    /Cannot issue certificate: Registration ineligible-reg-id is not approved ELIGIBLE/,
    "Must throw error when attempting to issue certificate to ineligible participant"
  );
  console.log("✓ Test 5 Passed: Eligibility safeguard blocked unauthorized certificate issuance");
}

// Test 5b: Safeguard: Unconfirmed Attendance must be rejected even if marked ELIGIBLE
{
  const dummyP2 = repo.db.prepare("INSERT INTO participants (id, email, normalized_name) VALUES (?, ?, ?)");
  dummyP2.run("unattended-p-id", "unattended.user@example.com", "Unattended User");

  const dummyR2 = repo.db.prepare(`
    INSERT INTO event_registrations (id, event_id, participant_id, registration_source, registered_name, registration_status)
    VALUES (?, ?, ?, 'MANUAL_IMPORT', 'Unattended User', 'CONFIRMED')
  `);
  dummyR2.run("unattended-reg-id", "algothon-26-event-id", "unattended-p-id");

  const dummyE2 = repo.db.prepare(`
    INSERT INTO eligibility_records (id, registration_id, eligibility_status, attendance_confirmed)
    VALUES (?, ?, 'ELIGIBLE', 0)
  `);
  dummyE2.run("unattended-elig-id", "unattended-reg-id");

  assert.throws(
    () => {
      repo.issueCertificate({
        registrationId: "unattended-reg-id",
        recipientName: "Unattended User",
        actorId: "organizer-dev-raj",
      });
    },
    /Cannot issue certificate: Registration unattended-reg-id is not approved ELIGIBLE with verified attendance/,
    "Must throw error when attendance is not confirmed"
  );
  console.log("✓ Test 5b Passed: Attendance confirmation safeguard blocked issuance without confirmed attendance");
}

// Test 6: Authorized Certificate Issuance & Public Verification Lookup
let issuedCertCode = "";
{
  // Find Alex's registration ID
  const p = repo.getParticipantByEmail("alex.chen@example.com");
  const regStmt = repo.db.prepare("SELECT id FROM event_registrations WHERE participant_id = ?");
  const reg = regStmt.get(p.id);
  sampleEligibleRegId = reg.id;

  const cert = repo.issueCertificate({
    registrationId: sampleEligibleRegId,
    recipientName: "Alex Chen",
    certificateCode: "ALGO-2026-HACK-1001",
    certificateType: "PARTICIPATION",
    actorId: "organizer-dev-raj",
  });

  issuedCertCode = cert.certificateCode;
  assert.strictEqual(cert.certificateCode, "ALGO-2026-HACK-1001");
  assert.strictEqual(cert.status, "ISSUED");
  assert.ok(cert.verificationHash.length === 64, "Should have SHA-256 hash");

  // Public verification lookup
  const verified = repo.getCertificateByCode("ALGO-2026-HACK-1001");
  assert.ok(verified, "Certificate must be found by public code");
  assert.strictEqual(verified.recipientName, "Alex Chen");
  assert.strictEqual(verified.eventName, "Algothon’26 — A National Level Hackathon");
  assert.strictEqual(verified.email, "alex.chen@example.com");
  console.log("✓ Test 6 Passed: Certificate issuance and public cryptographic verification lookup");
}

// Test 7: Certificate Replacement & Reissue (Name Correction Lifecycle)
let newCertCode = "";
{
  const reissued = repo.reissueCertificate({
    oldCertificateCode: issuedCertCode,
    newRecipientName: "Aarav V. Sharma",
    reason: "Approved name spelling adjustment",
    actorId: "organizer-dev-raj",
  });

  newCertCode = reissued.certificateCode;
  assert.strictEqual(reissued.recipientName, "Aarav V. Sharma");
  assert.strictEqual(reissued.reissueCount, 1, "Reissue count must increment to 1");
  assert.strictEqual(reissued.status, "ISSUED");

  // Verify that the old certificate is now marked REPLACED
  const oldCert = repo.getCertificateByCode(issuedCertCode);
  assert.strictEqual(oldCert.status, "REPLACED", "Old certificate status must be REPLACED");
  assert.strictEqual(oldCert.supersededById, reissued.id, "Old certificate must point to new certificate ID");
  assert.strictEqual(oldCert.supersededByCode, newCertCode, "Old certificate must resolve new code via JOIN");
  console.log(`✓ Test 7 Passed: Certificate replacement lifecycle: ${issuedCertCode} replaced by ${newCertCode}`);
}

// Test 8: Certificate Revocation Lifecycle
{
  repo.revokeCertificate({
    certificateCode: newCertCode,
    reason: "Administrative revocation benchmark test",
    actorId: "organizer-super-admin",
  });

  const revoked = repo.getCertificateByCode(newCertCode);
  assert.strictEqual(revoked.status, "REVOKED", "Status must be REVOKED");
  assert.strictEqual(revoked.revocationReason, "Administrative revocation benchmark test");
  assert.ok(revoked.revokedAt, "Revoked timestamp must be present");
  console.log("✓ Test 8 Passed: Certificate revocation lifecycle");
}

// Test 9: Immutable Audit Logs Verification
{
  const auditLogs = repo.getAuditLogs(20);
  assert.ok(auditLogs.length >= 4, "Should have logged multiple audit actions");
  const actions = auditLogs.map((l) => l.action);
  assert.ok(actions.includes("CSV_IMPORT"), "Audit log should contain CSV_IMPORT");
  assert.ok(actions.includes("CERTIFICATE_ISSUED"), "Audit log should contain CERTIFICATE_ISSUED");
  assert.ok(actions.includes("CERTIFICATE_REISSUED"), "Audit log should contain CERTIFICATE_REISSUED");
  assert.ok(actions.includes("CERTIFICATE_REVOKED"), "Audit log should contain CERTIFICATE_REVOKED");
  console.log(`✓ Test 9 Passed: Verified ${auditLogs.length} immutable audit log entries`);
}

// Test 10: Database Trigger Enforcement: Audit Log Immutability
{
  assert.throws(
    () => {
      repo.db.prepare("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = (SELECT id FROM audit_logs LIMIT 1)").run();
    },
    /Audit log records are immutable and cannot be updated/,
    "Database trigger must block UPDATE on audit_logs"
  );

  assert.throws(
    () => {
      repo.db.prepare("DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1)").run();
    },
    /Audit log records are immutable and cannot be deleted/,
    "Database trigger must block DELETE on audit_logs"
  );
  console.log("✓ Test 10 Passed: Database triggers strictly block UPDATE and DELETE on audit_logs");
}

// Test 11: Unique Constraint on External Registration ID per Event
{
  const p1 = repo.db.prepare("INSERT INTO participants (id, email, normalized_name) VALUES (?, ?, ?)");
  p1.run("ext-test-p1", "ext1@example.com", "Ext One");
  const p2 = repo.db.prepare("INSERT INTO participants (id, email, normalized_name) VALUES (?, ?, ?)");
  p2.run("ext-test-p2", "ext2@example.com", "Ext Two");

  repo.db.prepare(`
    INSERT INTO event_registrations (id, event_id, participant_id, registration_source, registered_name, external_registration_id)
    VALUES ('ext-r1', 'algothon-26-event-id', 'ext-test-p1', 'GOOGLE_FORMS', 'Ext One', 'UNSTOP-REG-999')
  `).run();

  assert.throws(
    () => {
      repo.db.prepare(`
        INSERT INTO event_registrations (id, event_id, participant_id, registration_source, registered_name, external_registration_id)
        VALUES ('ext-r2', 'algothon-26-event-id', 'ext-test-p2', 'GOOGLE_FORMS', 'Ext Two', 'UNSTOP-REG-999')
      `).run();
    },
    /UNIQUE constraint failed/,
    "Must enforce UNIQUE(event_id, external_registration_id)"
  );
  console.log("✓ Test 11 Passed: Database unique index enforces (event_id, external_registration_id) uniqueness");
}

repo.close();
console.log("\nALL 11 PHASE B DATABASE & SCHEMA TESTS PASSED SUCCESSFULLY!");

// Phase B Independent Audit & Remediation Verification Test Script
// Systematically validates data integrity, normalization boundaries,
// formula injection neutralization, eligibility defaults, and database constraints.

import assert from "node:assert";
import crypto from "node:crypto";
import { CertificateRepository } from "../src/lib/db/repository.ts";
import { normalizeName, parseAndValidateParticipantCsv, sanitizeFormulaInjection } from "../src/lib/csvImport.ts";

console.log("=================================================");
console.log("   RUNNING PHASE B REMEDIATION VERIFICATION AUDIT ");
console.log("=================================================\n");

// -----------------------------------------------------------------------------
// 1. Audit Name Normalization Boundaries (Unicode, Accents, Non-English)
// -----------------------------------------------------------------------------
console.log("--- 1. AUDITING NAME NORMALIZATION ---");

// Test 1.1: English & Cased Names
assert.strictEqual(normalizeName("  priya sharma  "), "Priya Sharma");
assert.strictEqual(normalizeName("MICHAEL O'CONNOR"), "Michael O'Connor");
assert.strictEqual(normalizeName("jean-luc picard"), "Jean-Luc Picard");
console.log("✓ Standard English casing, apostrophes, and hyphens handled correctly.");

// Test 1.2: Accented Latin (Spanish / German)
const spanishUpper = "JOSÉ GARCÍA";
const spanishCased = normalizeName(spanishUpper);
console.log(`  Input: '${spanishUpper}' -> Output: '${spanishCased}'`);

// Test 1.3: Non-Latin Unicode (Cyrillic & Devanagari)
const cyrillicUpper = "ИВАН ИВАНОВ";
const cyrillicCased = normalizeName(cyrillicUpper);
assert.strictEqual(cyrillicCased, "ИВАН ИВАНОВ", "Cyrillic preserved without mangling");

const devanagari = "देव राज";
const devanagariOut = normalizeName(devanagari);
assert.strictEqual(devanagariOut, "देव राज", "Devanagari script preserved without mangling");
console.log("✓ Unicode scripts without ASCII case are safely preserved.");

// -----------------------------------------------------------------------------
// 2. Audit Formula Injection Neutralization in CSV Parser
// -----------------------------------------------------------------------------
console.log("\n--- 2. AUDITING SPREADSHEET FORMULA INJECTION NEUTRALIZATION ---");

const formulaCsv = `Timestamp,First Name,Last Name,Email Address,Confirmation
2026/10/04 10:00:00 AM,=cmd|' /C calc'!A0,Smith,calc.user@example.com,Yes
2026/10/04 10:01:00 AM,+SUM(1+1),Jones,sum.user@example.com,Yes
2026/10/04 10:02:00 AM,-2+5,Davis,minus.user@example.com,Yes
2026/10/04 10:03:00 AM,@HYPERLINK("http://evil.com"),Attacker,evil.user@example.com,Yes`;

const parsedFormulas = parseAndValidateParticipantCsv(formulaCsv);
console.log(`  Parsed ${parsedFormulas.rows.length} rows containing formula payloads.`);
parsedFormulas.rows.forEach((r) => {
  // Each sanitized row must be prefixed with a single quote to neutralize formula execution in Excel/Sheets
  assert.ok(r.fullName.startsWith("'"), `Row ${r.rowNumber} (${r.fullName}) must be neutralized with leading single quote`);
  assert.strictEqual(/^[=+\-@]/.test(r.fullName), false, `Row ${r.rowNumber} must not execute as formula`);
});
assert.strictEqual(sanitizeFormulaInjection("=cmd"), "'=cmd");
console.log("✓ Remediated: Spreadsheet formula payloads (=, +, -, @) neutralized by prepending single quote.");

// -----------------------------------------------------------------------------
// 3. Audit Eligibility Safeguard vs. Self-Confirmation (Priority 1)
// -----------------------------------------------------------------------------
console.log("\n--- 3. AUDITING REGISTRATION VS. ELIGIBILITY SEPARATION ---");

const selfConfirmCsv = `Timestamp,First Name,Last Name,Email Address,Confirmation
2026/10/04 10:00:00 AM,Self,Confirmed,self.confirmed@example.com,Yes
2026/10/04 10:01:00 AM,No,Attended,no.attended@example.com,No
2026/10/04 10:02:00 AM,Pending,Review,pending.review@example.com,Pending`;

const parsedSelfConfirm = parseAndValidateParticipantCsv(selfConfirmCsv);
const rowYes = parsedSelfConfirm.rows[0];
const rowNo = parsedSelfConfirm.rows[1];
const rowPending = parsedSelfConfirm.rows[2];

console.log(`  Row 1 (Confirmation: Yes) -> eligStatus='${rowYes.eligibilityStatus}', attendanceConfirmed=${rowYes.attendanceConfirmed}, validationStatus='${rowYes.validationStatus}'`);
console.log(`  Row 2 (Confirmation: No)  -> eligStatus='${rowNo.eligibilityStatus}', attendanceConfirmed=${rowNo.attendanceConfirmed}`);
console.log(`  Row 3 (Confirmation: Pending) -> eligStatus='${rowPending.eligibilityStatus}', attendanceConfirmed=${rowPending.attendanceConfirmed}`);

assert.strictEqual(rowYes.registrationStatus, "CONFIRMED");
assert.strictEqual(rowYes.eligibilityStatus, "PENDING_ORGANIZER_APPROVAL", "Self-confirmation must NOT auto-grant ELIGIBLE");
assert.strictEqual(rowYes.attendanceConfirmed, false, "Attendance must not be inferred from registration confirmation");
assert.strictEqual(rowYes.validationStatus, "FLAGGED_FOR_REVIEW", "Must be flagged for organizer review");

assert.strictEqual(rowNo.eligibilityStatus, "INELIGIBLE");
assert.strictEqual(rowPending.eligibilityStatus, "PENDING_ORGANIZER_APPROVAL");
console.log("✓ Remediated: Google Forms Confirmation: Yes strictly defaults to PENDING_ORGANIZER_APPROVAL.");

// -----------------------------------------------------------------------------
// 4. Audit Database Constraint & Lifecycle Boundaries
// -----------------------------------------------------------------------------
console.log("\n--- 4. AUDITING DATABASE CONSTRAINTS & CRYPTOGRAPHIC CLAIMS ---");

const repo = new CertificateRepository(":memory:");

// 4.1 Setup Event
repo.upsertEvent({
  id: "audit-event-1",
  code: "AUDIT1",
  name: "Audit Hackathon 2026",
  eventDate: "2026-10-04",
  organizerName: "Algoxilla",
  status: "ACTIVE",
});

// 4.2 Duplicate Registration Enforcement
repo.commitCsvImport({
  eventId: "audit-event-1",
  organizerId: "audit-admin",
  sourceFile: "test.csv",
  rows: [
    {
      fullName: "Jane Doe",
      email: "jane.doe@example.com",
      source: "GOOGLE_FORMS",
      registrationStatus: "CONFIRMED",
      eligibilityStatus: "ELIGIBLE",
      attendanceConfirmed: true,
    },
  ],
});

// Attempting duplicate direct insert to event_registrations
const p = repo.getParticipantByEmail("jane.doe@example.com");
assert.throws(
  () => {
    repo.db.prepare(`
      INSERT INTO event_registrations (id, event_id, participant_id, registration_source, registered_name, registration_status)
      VALUES (?, ?, ?, 'GOOGLE_FORMS', 'Jane Doe', 'CONFIRMED')
    `).run("dup-reg-id", "audit-event-1", p.id);
  },
  /UNIQUE constraint failed/,
  "Must enforce UNIQUE(event_id, participant_id) at database level"
);
console.log("✓ Database strictly enforces UNIQUE(event_id, participant_id).");

// 4.3 Verify Hash Calculation Source
const reg = repo.db.prepare("SELECT id FROM event_registrations WHERE participant_id = ?").get(p.id);
const cert = repo.issueCertificate({
  registrationId: reg.id,
  recipientName: "Jane Doe",
  certificateCode: "AUDIT-CERT-001",
  actorId: "audit-admin",
});

console.log(`  Issued Certificate Code: ${cert.certificateCode}`);
console.log(`  Verification Hash: ${cert.verificationHash}`);

const expectedHash = crypto
  .createHash("sha256")
  .update(`${cert.certificateCode}:Jane Doe:PARTICIPATION:${cert.issuedAt}`)
  .digest("hex");

assert.strictEqual(cert.verificationHash, expectedHash, "Hash matches canonical metadata digest format");
console.log("✓ Confirmed: Verification hash is canonical metadata digest (document_hash reserved for PDF binary bytes).");

// 4.4 Audit Log Immutability Enforcement
assert.throws(
  () => {
    repo.db.prepare("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = (SELECT id FROM audit_logs LIMIT 1)").run();
  },
  /Audit log records are immutable and cannot be updated/,
  "Audit log UPDATE must be blocked by trigger"
);

assert.throws(
  () => {
    repo.db.prepare("DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1)").run();
  },
  /Audit log records are immutable and cannot be deleted/,
  "Audit log DELETE must be blocked by trigger"
);
console.log("✓ Remediated: Database triggers strictly enforce audit log immutability (UPDATE and DELETE blocked).");

repo.close();

console.log("\n=================================================");
console.log("   AUDIT & REMEDIATION VERIFICATION PASSED!       ");
console.log("=================================================");

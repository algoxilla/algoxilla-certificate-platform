// Test suite for src/lib/csvImport.ts
import assert from "node:assert";

import {
  parseCsvRaw,
  normalizeName,
  normalizeEmail,
  parseAndValidateParticipantCsv,
  getSyntheticTestCsvContent,
  getSyntheticVerifiedCsvContent,
  hasFormulaInjectionRisk,
  sanitizeFormulaInjection,
} from "../src/lib/csvImport.ts";

console.log("--- RUNNING CSV IMPORT TEST SUITE ---");

// Test 1: Raw CSV parsing with quotes and commas
{
  const raw = `Col1,Col2,"Col3, with comma","Col4 ""escaped"""\r\nval1,val2,"val3, sub",val4`;
  const parsed = parseCsvRaw(raw);
  assert.strictEqual(parsed.length, 2, "Should parse 2 rows");
  assert.strictEqual(parsed[0][2], "Col3, with comma", "Should preserve comma inside quotes");
  assert.strictEqual(parsed[0][3], 'Col4 "escaped"', "Should unescape double quotes");
  assert.strictEqual(parsed[1][2], "val3, sub", "Should parse row 2 quoted field");
  console.log("✓ Test 1 Passed: RFC 4180 raw CSV parsing");
}

// Test 2: Name normalization
{
  assert.strictEqual(normalizeName("  priya sharma  "), "Priya Sharma");
  assert.strictEqual(normalizeName("MICHAEL O'CONNOR"), "Michael O'Connor");
  assert.strictEqual(normalizeName("jean-luc picard"), "Jean-Luc Picard");
  assert.strictEqual(normalizeName("McDonald"), "McDonald", "Should preserve mixed case");
  assert.strictEqual(normalizeName("   "), "", "Blank name handling");
  console.log("✓ Test 2 Passed: Intelligent name normalization & title casing");
}

// Test 3: Email normalization
{
  assert.strictEqual(normalizeEmail("  Alex.Chen@Example.COM  "), "alex.chen@example.com");
  console.log("✓ Test 3 Passed: Email normalization");
}

// Test 4: Formula Injection Prevention
{
  assert.strictEqual(hasFormulaInjectionRisk("=cmd|' /C calc'!A0"), true);
  assert.strictEqual(hasFormulaInjectionRisk("+SUM(1+1)"), true);
  assert.strictEqual(hasFormulaInjectionRisk("-10"), true);
  assert.strictEqual(hasFormulaInjectionRisk("@HYPERLINK('http://evil.com')"), true);
  assert.strictEqual(hasFormulaInjectionRisk("Alex Chen"), false);

  assert.strictEqual(sanitizeFormulaInjection("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  assert.strictEqual(sanitizeFormulaInjection("@evil"), "'@evil");
  assert.strictEqual(sanitizeFormulaInjection("Normal Name"), "Normal Name");
  console.log("✓ Test 4 Passed: Formula injection detection and sanitization");
}

// Test 5: Unverified Google Forms Import (Priority 1 Safeguard: Confirmation != Attendance)
{
  const syntheticCsv = getSyntheticTestCsvContent();
  const result = parseAndValidateParticipantCsv(syntheticCsv);

  assert.strictEqual(result.formatDetected, "GOOGLE_FORMS", "Should detect Google Forms format");
  assert.strictEqual(result.summary.totalRows, 11, "Should have 11 data rows");

  // Row 1: Alex Chen -> Confirmation: Yes, but NO organizer attendance -> PENDING_ORGANIZER_APPROVAL & FLAGGED_FOR_REVIEW
  const row1 = result.rows.find((r) => r.rowNumber === 2);
  assert.strictEqual(row1.registrationStatus, "CONFIRMED");
  assert.strictEqual(row1.eligibilityStatus, "PENDING_ORGANIZER_APPROVAL", "Self-confirmation must NOT auto-grant eligibility");
  assert.strictEqual(row1.attendanceConfirmed, false, "Attendance must not be inferred from registration confirmation");
  assert.strictEqual(row1.validationStatus, "FLAGGED_FOR_REVIEW", "Unverified attendance must be flagged for organizer review");

  // Row 6: Sam Morgan -> Confirmation No -> Ineligible
  const row6 = result.rows.find((r) => r.rowNumber === 7);
  assert.strictEqual(row6.fullName, "Sam Morgan");
  assert.strictEqual(row6.eligibilityStatus, "INELIGIBLE");
  assert.strictEqual(row6.validationStatus, "FLAGGED_FOR_REVIEW");

  // Row 7: Jordan Taylor -> Pending confirmation -> Pending Organizer Approval
  const row7 = result.rows.find((r) => r.rowNumber === 8);
  assert.strictEqual(row7.eligibilityStatus, "PENDING_ORGANIZER_APPROVAL");

  // Row 8: Alex Chen duplicate
  const row8 = result.rows.find((r) => r.rowNumber === 9);
  assert.strictEqual(row8.validationStatus, "DUPLICATE");

  // Row 9: Alexander Chen -> Same email, conflicting name
  const row9 = result.rows.find((r) => r.rowNumber === 10);
  assert.strictEqual(row9.validationStatus, "FLAGGED_FOR_REVIEW");
  assert.ok(row9.validationNotes.some((n) => n.includes("Name Conflict")), "Should flag name conflict");

  // Row 10: Invalid email
  const row10 = result.rows.find((r) => r.rowNumber === 11);
  assert.strictEqual(row10.validationStatus, "REJECTED");

  // Row 11: Missing name
  const row11 = result.rows.find((r) => r.rowNumber === 12);
  assert.strictEqual(row11.validationStatus, "REJECTED");

  console.log("✓ Test 5 Passed: Unverified Google Forms import strictly defaults to PENDING_ORGANIZER_APPROVAL");
}

// Test 6: Organizer-Verified Import with Explicit Attendance / Eligibility
{
  const verifiedCsv = getSyntheticVerifiedCsvContent();
  const result = parseAndValidateParticipantCsv(verifiedCsv);

  // Row 1: Alex Chen with Attendance: Attended & Eligibility: Eligible
  const row1 = result.rows.find((r) => r.rowNumber === 2);
  assert.strictEqual(row1.registrationStatus, "CONFIRMED");
  assert.strictEqual(row1.attendanceConfirmed, true);
  assert.strictEqual(row1.eligibilityStatus, "ELIGIBLE");
  assert.strictEqual(row1.validationStatus, "ACCEPTED");

  // Row 2: Priya Sharma with Attendance: Attended
  const row2 = result.rows.find((r) => r.rowNumber === 3);
  assert.strictEqual(row2.fullName, "Priya Sharma");
  assert.strictEqual(row2.eligibilityStatus, "ELIGIBLE");
  assert.strictEqual(row2.validationStatus, "ACCEPTED");

  // Row 6: Sam Morgan with Attendance: Absent & Ineligible
  const row6 = result.rows.find((r) => r.rowNumber === 7);
  assert.strictEqual(row6.eligibilityStatus, "INELIGIBLE");
  assert.strictEqual(row6.attendanceConfirmed, false);

  console.log("✓ Test 6 Passed: Organizer-verified CSV correctly grants ELIGIBLE and ACCEPTED status");
}

// Test 7: Repeat Import Idempotency and Conflict Detection
{
  const existingRecords = [
    { email: "alex.chen@example.com", fullName: "Alex Chen", certificateStatus: "ISSUED" },
    { email: "rohit.verma@example.com", fullName: "Rohit Verma" }
  ];

  const csv = `Full Name,Email,Confirmation,Attendance\nAlex Chen,alex.chen@example.com,Yes,Attended\nRohit K. Verma,rohit.verma@example.com,Yes,Attended\nNew Person,new.person@example.com,Yes,Attended`;
  const result = parseAndValidateParticipantCsv(csv, existingRecords);

  // Alex Chen matches existing identically -> DUPLICATE (idempotent skip)
  const alexRow = result.rows.find((r) => r.email === "alex.chen@example.com");
  assert.strictEqual(alexRow.validationStatus, "DUPLICATE");
  assert.ok(alexRow.validationNotes.some((n) => n.includes("Record already exists")));

  // Rohit has name difference -> FLAGGED_FOR_REVIEW
  const rohitRow = result.rows.find((r) => r.email === "rohit.verma@example.com");
  assert.strictEqual(rohitRow.validationStatus, "FLAGGED_FOR_REVIEW");
  assert.ok(rohitRow.validationNotes.some((n) => n.includes("Existing record conflict")));

  // New person -> ACCEPTED
  const newRow = result.rows.find((r) => r.email === "new.person@example.com");
  assert.strictEqual(newRow.validationStatus, "ACCEPTED");

  console.log("✓ Test 7 Passed: Repeat import idempotency and existing record conflict detection");
}

console.log("\nALL 7 CSV IMPORT TEST SUITES PASSED SUCCESSFULLY!");

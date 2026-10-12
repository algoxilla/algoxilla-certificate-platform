// Algoxilla Certificate Platform - Authoritative Participant CSV Import Engine
// Implements safe CSV parsing, normalization, required-field validation,
// in-file duplicate detection, cross-import idempotency, and eligibility safeguards.

export type ParticipantSource = "GOOGLE_FORMS" | "UNSTOP" | "STANDARD_CSV" | "OTHER";
export type RegistrationStatus = "CONFIRMED" | "PENDING_APPROVAL" | "UNCONFIRMED";
export type EligibilityStatus = "ELIGIBLE" | "INELIGIBLE" | "PENDING_ORGANIZER_APPROVAL";
export type RowValidationStatus = "ACCEPTED" | "FLAGGED_FOR_REVIEW" | "REJECTED" | "DUPLICATE";

export interface ParsedParticipantRow {
  rowNumber: number;
  fullName: string;
  email: string;
  externalId?: string;
  source: ParticipantSource;
  registrationStatus: RegistrationStatus;
  eligibilityStatus: EligibilityStatus;
  attendanceConfirmed: boolean;
  rawConfirmation?: string;
  existingCertificateId?: string;
  validationStatus: RowValidationStatus;
  validationNotes: string[];
}

export interface CsvImportSummary {
  totalRows: number;
  acceptedCount: number;
  flaggedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  pendingApprovalCount: number;
}

export interface ParseCsvOptions {
  /** If true, explicitly instructs the parser to treat Confirmation: Yes as verified attendance (e.g. from an organizer-verified check-in list) */
  trustConfirmationAsAttendance?: boolean;
}

export interface CsvImportResult {
  summary: CsvImportSummary;
  rows: ParsedParticipantRow[];
  headersDetected: Record<string, string>;
  formatDetected: "GOOGLE_FORMS" | "UNSTOP" | "STANDARD_CSV" | "UNKNOWN";
  errors: string[];
}

export interface ExistingParticipantRecord {
  email: string;
  fullName: string;
  certificateStatus?: "ISSUED" | "PENDING_ISSUANCE" | "INELIGIBLE";
}

// RFC 5322 simplified email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Normalizes email address by trimming whitespace and converting to lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalizes name formatting:
 * - Collapses extra spaces
 * - Converts ALL-CAPS or all-lowercase names to Title Case
 * - Preserves hyphenated names ("Jean-Luc") and apostrophes ("O'Connor")
 */
export function normalizeName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  // Check if all lowercase or all uppercase
  const isAllUpper = cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned);
  const isAllLower = cleaned === cleaned.toLowerCase() && /[a-z]/.test(cleaned);

  if (!isAllUpper && !isAllLower) {
    return cleaned; // Mixed case already; keep as-is (e.g. McDonald)
  }

  return cleaned
    .toLowerCase()
    .split(" ")
    .map((word) => {
      if (!word) return "";
      // Handle apostrophes (e.g. o'connor -> O'Connor)
      if (word.includes("'")) {
        return word
          .split("'")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("'");
      }
      // Handle hyphens (e.g. jean-luc -> Jean-Luc)
      if (word.includes("-")) {
        return word
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("-");
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Detects whether a string begins with potential spreadsheet formula injection characters (=, +, -, @, \t, \r).
 */
export function hasFormulaInjectionRisk(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value.trim());
}

/**
 * Sanitizes a string for spreadsheet export by prefixing with a single quote (') if it starts with formula characters.
 */
export function sanitizeFormulaInjection(value: string): string {
  const trimmed = value.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return value;
}

/**
 * Robust RFC 4180 compliant CSV parser.
 * Supports quoted fields, multiline cells, escaped quotes, and CRLF / LF line endings.
 */
export function parseCsvRaw(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  const text = csvText.replace(/^\uFEFF/, ""); // Remove UTF-8 BOM if present

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      } else if (char === '"') {
        inQuotes = false;
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (char === "\r" && nextChar === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i += 2;
        continue;
      } else if (char === "\n" || char === "\r") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push last field & row if anything remains
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/**
 * Matches raw header strings to canonical schema fields.
 */
function mapHeaderIndex(headers: string[]): {
  mapping: Record<string, number>;
  format: "GOOGLE_FORMS" | "UNSTOP" | "STANDARD_CSV" | "UNKNOWN";
} {
  const normalizedHeaders = headers.map((h) =>
    h.toLowerCase().trim().replace(/[^a-z0-9]/g, "")
  );

  const mapping: Record<string, number> = {};

  normalizedHeaders.forEach((h, index) => {
    if (h === "email" || h === "emailaddress" || h === "registeredemail" || h === "participantemail") {
      mapping.email = index;
    } else if (h === "fullname" || h === "participantname" || h === "name" || h === "studentname") {
      mapping.fullName = index;
    } else if (h === "firstname" || h === "fname") {
      mapping.firstName = index;
    } else if (h === "lastname" || h === "lname") {
      mapping.lastName = index;
    } else if (h === "confirmation" || h === "confirm" || h === "registrationstatus") {
      mapping.confirmation = index;
    } else if (h === "attendance" || h === "attended" || h === "present") {
      mapping.attendance = index;
    } else if (h === "eligibility" || h === "certificateeligibility" || h === "eligible" || h === "certificatestatus") {
      mapping.eligibility = index;
    } else if (h === "externalid" || h === "registrationid" || h === "unstopid" || h === "formid") {
      mapping.externalId = index;
    } else if (h === "source" || h === "registrationsource") {
      mapping.source = index;
    } else if (h === "certificateid" || h === "certid") {
      mapping.certificateId = index;
    }
  });

  let format: "GOOGLE_FORMS" | "UNSTOP" | "STANDARD_CSV" | "UNKNOWN" = "UNKNOWN";
  if (normalizedHeaders.includes("timestamp") && normalizedHeaders.includes("firstname")) {
    format = "GOOGLE_FORMS";
  } else if (normalizedHeaders.includes("unstopid") || normalizedHeaders.includes("externalid")) {
    format = "UNSTOP";
  } else if (mapping.email !== undefined && (mapping.fullName !== undefined || mapping.firstName !== undefined)) {
    format = "STANDARD_CSV";
  }

  return { mapping, format };
}

/**
 * Parses and validates an organizer-supplied CSV string into typed participant records.
 * Performs duplicate detection, conflict detection, and eligibility classification.
 */
export function parseAndValidateParticipantCsv(
  csvContent: string,
  existingRecords: ExistingParticipantRecord[] = [],
  options?: ParseCsvOptions
): CsvImportResult {
  const rawRows = parseCsvRaw(csvContent);
  const errors: string[] = [];

  if (rawRows.length < 2) {
    return {
      summary: {
        totalRows: 0,
        acceptedCount: 0,
        flaggedCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        eligibleCount: 0,
        ineligibleCount: 0,
        pendingApprovalCount: 0,
      },
      rows: [],
      headersDetected: {},
      formatDetected: "UNKNOWN",
      errors: ["The uploaded file is empty or does not contain a header row and at least one data row."],
    };
  }

  const rawHeaders = rawRows[0];
  const { mapping, format } = mapHeaderIndex(rawHeaders);

  const headersDetected: Record<string, string> = {};
  Object.keys(mapping).forEach((key) => {
    headersDetected[key] = rawHeaders[mapping[key]];
  });

  if (mapping.email === undefined) {
    errors.push("Missing required 'Email Address' column. Required columns: Email, Full Name (or First Name/Last Name).");
  }

  if (mapping.fullName === undefined && mapping.firstName === undefined) {
    errors.push("Missing required participant name column. Required: 'Full Name' or 'First Name'.");
  }

  if (errors.length > 0) {
    return {
      summary: {
        totalRows: rawRows.length - 1,
        acceptedCount: 0,
        flaggedCount: 0,
        rejectedCount: rawRows.length - 1,
        duplicateCount: 0,
        eligibleCount: 0,
        ineligibleCount: 0,
        pendingApprovalCount: 0,
      },
      rows: [],
      headersDetected,
      formatDetected: format,
      errors,
    };
  }

  // Pre-load existing records map for cross-check idempotency
  const existingMap = new Map<string, ExistingParticipantRecord>();
  existingRecords.forEach((rec) => {
    existingMap.set(normalizeEmail(rec.email), rec);
  });

  const parsedRows: ParsedParticipantRow[] = [];
  const seenEmailsInFile = new Map<string, { rowNumber: number; fullName: string }>();

  for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex++) {
    const rawCells = rawRows[rowIndex];
    const rowNumber = rowIndex + 1; // 1-indexed for human readability

    const rawEmail = mapping.email !== undefined ? (rawCells[mapping.email] || "").trim() : "";
    let rawName = "";
    if (mapping.fullName !== undefined) {
      rawName = (rawCells[mapping.fullName] || "").trim();
    } else {
      const first = (mapping.firstName !== undefined ? rawCells[mapping.firstName] || "" : "").trim();
      const last = (mapping.lastName !== undefined ? rawCells[mapping.lastName] || "" : "").trim();
      rawName = `${first} ${last}`.trim();
    }

    const rawConfirmation = mapping.confirmation !== undefined ? (rawCells[mapping.confirmation] || "").trim() : "";
    const rawAttendance = mapping.attendance !== undefined ? (rawCells[mapping.attendance] || "").trim() : "";
    const rawEligibility = mapping.eligibility !== undefined ? (rawCells[mapping.eligibility] || "").trim() : "";
    const rawExternalId = mapping.externalId !== undefined ? (rawCells[mapping.externalId] || "").trim() : undefined;
    const rawSource = mapping.source !== undefined ? (rawCells[mapping.source] || "").trim() : undefined;
    const rawCertId = mapping.certificateId !== undefined ? (rawCells[mapping.certificateId] || "").trim() : undefined;

    const validationNotes: string[] = [];
    let validationStatus: RowValidationStatus = "ACCEPTED";

    // 1. Validate Email
    if (!rawEmail) {
      validationStatus = "REJECTED";
      validationNotes.push("Missing email address.");
    } else if (!EMAIL_REGEX.test(rawEmail)) {
      validationStatus = "REJECTED";
      validationNotes.push(`Invalid email format: '${rawEmail}'.`);
    }

    // 2. Validate Name & Check Formula Injection
    if (!rawName) {
      validationStatus = "REJECTED";
      validationNotes.push("Missing participant name.");
    } else if (hasFormulaInjectionRisk(rawName)) {
      validationNotes.push(`Potential spreadsheet formula character ('${rawName.trim()[0]}') detected and neutralized.`);
    }

    const normalizedEmail = normalizeEmail(rawEmail);
    const normalizedFullName = normalizeName(rawName);

    // Note if name required title-casing
    if (rawName && rawName !== normalizedFullName && validationStatus !== "REJECTED") {
      validationNotes.push(`Normalized name casing from '${rawName}' to '${normalizedFullName}'.`);
    }

    // 3. Determine Registration Status, Attendance, & Eligibility Status
    let regStatus: RegistrationStatus = "CONFIRMED";
    let eligStatus: EligibilityStatus = "PENDING_ORGANIZER_APPROVAL";
    let attendanceConfirmed = false;

    // A. Evaluate attendee self-confirmation from registration form
    const confUpper = rawConfirmation.toUpperCase();
    if (confUpper === "NO" || confUpper === "UNCONFIRMED" || confUpper === "REJECTED" || confUpper === "FALSE" || confUpper === "CANCELLED") {
      regStatus = "UNCONFIRMED";
      eligStatus = "INELIGIBLE";
      attendanceConfirmed = false;
      validationStatus = validationStatus === "REJECTED" ? "REJECTED" : "FLAGGED_FOR_REVIEW";
      validationNotes.push("Registration marked UNCONFIRMED by attendee. Ineligible for certificate.");
    } else if (confUpper === "MAYBE" || confUpper === "PENDING" || (!rawConfirmation && format === "GOOGLE_FORMS")) {
      regStatus = "PENDING_APPROVAL";
      eligStatus = "PENDING_ORGANIZER_APPROVAL";
      attendanceConfirmed = false;
      validationStatus = validationStatus === "REJECTED" ? "REJECTED" : "FLAGGED_FOR_REVIEW";
      validationNotes.push("Confirmation status pending organizer review.");
    } else {
      // Participant confirmed registration (e.g. Confirmation: Yes)
      regStatus = "CONFIRMED";
      // Priority 1 Safeguard: Self-confirmation does NOT independently prove attendance or certificate eligibility.
      eligStatus = "PENDING_ORGANIZER_APPROVAL";
      attendanceConfirmed = false;
      validationNotes.push("Registration confirmed by participant. Certificate eligibility pending organizer attendance verification.");
    }

    // B. Explicit Attendance column (from organizer check-in / venue attendance records)
    const attendUpper = rawAttendance.toUpperCase();
    if (attendUpper === "YES" || attendUpper === "ATTENDED" || attendUpper === "PRESENT" || attendUpper === "TRUE" || attendUpper === "CONFIRMED") {
      attendanceConfirmed = true;
      eligStatus = "ELIGIBLE";
      validationNotes.push("Organizer attendance verified.");
    } else if (attendUpper === "NO" || attendUpper === "ABSENT" || attendUpper === "FALSE") {
      attendanceConfirmed = false;
      eligStatus = "INELIGIBLE";
      validationStatus = validationStatus === "REJECTED" ? "REJECTED" : "FLAGGED_FOR_REVIEW";
      validationNotes.push("Organizer attendance marked ABSENT. Ineligible for certificate.");
    }

    // C. Explicit Eligibility column (from organizer whitelist / evaluation)
    const eligUpper = rawEligibility.toUpperCase();
    if (eligUpper === "ELIGIBLE" || eligUpper === "APPROVED" || eligUpper === "YES" || eligUpper === "TRUE") {
      eligStatus = "ELIGIBLE";
      validationNotes.push("Explicitly marked ELIGIBLE by organizer.");
    } else if (eligUpper === "INELIGIBLE" || eligUpper === "NO" || eligUpper === "FALSE" || eligUpper === "REJECTED") {
      eligStatus = "INELIGIBLE";
      validationStatus = validationStatus === "REJECTED" ? "REJECTED" : "FLAGGED_FOR_REVIEW";
      validationNotes.push("Explicitly marked INELIGIBLE by organizer.");
    }

    // D. Explicit Organizer Option Override (e.g., organizer specifically importing a trusted attendance checklist)
    if (options?.trustConfirmationAsAttendance && confUpper === "YES") {
      attendanceConfirmed = true;
      eligStatus = "ELIGIBLE";
      validationNotes.push("Trusted organizer import setting applied: attendance confirmed via registration list.");
    }

    // Assign validation status based on eligibility
    if (validationStatus !== "REJECTED") {
      if (eligStatus === "ELIGIBLE") {
        validationStatus = "ACCEPTED";
      } else {
        // Pending approval or ineligible rows are flagged for organizer review
        validationStatus = "FLAGGED_FOR_REVIEW";
      }
    }

    // 4. In-file duplicate & conflict detection
    if (normalizedEmail && validationStatus !== "REJECTED") {
      if (seenEmailsInFile.has(normalizedEmail)) {
        const prior = seenEmailsInFile.get(normalizedEmail)!;
        if (prior.fullName.toLowerCase() === normalizedFullName.toLowerCase()) {
          validationStatus = "DUPLICATE";
          validationNotes.push(`Duplicate row: Email already seen on Row ${prior.rowNumber} with identical name.`);
        } else {
          validationStatus = "FLAGGED_FOR_REVIEW";
          validationNotes.push(`Name Conflict: Email matches Row ${prior.rowNumber} ('${prior.fullName}') but has conflicting name '${normalizedFullName}'.`);
        }
      } else {
        seenEmailsInFile.set(normalizedEmail, { rowNumber, fullName: normalizedFullName });
      }
    }

    // 5. Existing records cross-check (Idempotency)
    if (normalizedEmail && existingMap.has(normalizedEmail) && validationStatus === "ACCEPTED") {
      const existing = existingMap.get(normalizedEmail)!;
      if (existing.fullName.toLowerCase() === normalizedFullName.toLowerCase()) {
        validationStatus = "DUPLICATE";
        validationNotes.push("Record already exists in registry with identical name (idempotent skip).");
      } else {
        validationStatus = "FLAGGED_FOR_REVIEW";
        validationNotes.push(`Existing record conflict: Registered as '${existing.fullName}' previously; CSV requests '${normalizedFullName}'.`);
      }
    }

    // Determine source
    let source: ParticipantSource = "STANDARD_CSV";
    if (rawSource) {
      source = rawSource.toUpperCase().includes("UNSTOP") ? "UNSTOP" : "OTHER";
    } else if (format === "GOOGLE_FORMS") {
      source = "GOOGLE_FORMS";
    } else if (format === "UNSTOP") {
      source = "UNSTOP";
    }

    parsedRows.push({
      rowNumber,
      fullName: sanitizeFormulaInjection(normalizedFullName || rawName),
      email: normalizedEmail || rawEmail,
      externalId: rawExternalId,
      source,
      registrationStatus: regStatus,
      eligibilityStatus: eligStatus,
      attendanceConfirmed,
      rawConfirmation: rawConfirmation || undefined,
      existingCertificateId: rawCertId || undefined,
      validationStatus,
      validationNotes,
    });
  }

  // Calculate summary metrics
  const summary: CsvImportSummary = {
    totalRows: parsedRows.length,
    acceptedCount: parsedRows.filter((r) => r.validationStatus === "ACCEPTED").length,
    flaggedCount: parsedRows.filter((r) => r.validationStatus === "FLAGGED_FOR_REVIEW").length,
    rejectedCount: parsedRows.filter((r) => r.validationStatus === "REJECTED").length,
    duplicateCount: parsedRows.filter((r) => r.validationStatus === "DUPLICATE").length,
    eligibleCount: parsedRows.filter((r) => r.eligibilityStatus === "ELIGIBLE" && r.validationStatus === "ACCEPTED").length,
    ineligibleCount: parsedRows.filter((r) => r.eligibilityStatus === "INELIGIBLE").length,
    pendingApprovalCount: parsedRows.filter((r) => r.eligibilityStatus === "PENDING_ORGANIZER_APPROVAL").length,
  };

  return {
    summary,
    rows: parsedRows,
    headersDetected,
    formatDetected: format,
    errors,
  };
}

/**
 * Returns synthetic demonstration CSV content containing realistic edge cases:
 * - Clean confirmed attendees
 * - All-caps and all-lowercase names requiring title-casing
 * - Hyphenated and apostrophe names
 * - Duplicate entries
 * - Name conflicts on identical email
 * - Unconfirmed / ineligible attendees
 * - Corrupted email syntax
 * - Missing name
 */
export function getSyntheticTestCsvContent(): string {
  return `Timestamp,First Name,Last Name,Email Address,Confirmation
2026/10/04 10:15:00 AM,Alex,Chen,alex.chen@example.com,Yes
2026/10/04 10:16:30 AM,priya,sharma,priya.sharma@example.com,Yes
2026/10/04 10:18:00 AM,MICHAEL,O'CONNOR,michael.oconnor@example.com,Yes
2026/10/04 10:20:00 AM,Jean-Luc,Picard,jeanluc.picard@example.com,Yes
2026/10/04 10:22:00 AM,David,Kim,david.kim@example.com,Yes
2026/10/04 10:25:00 AM,Sam,Morgan,sam.morgan@example.com,No
2026/10/04 10:28:00 AM,Jordan,Taylor,jordan.taylor@example.com,Pending
2026/10/04 10:30:00 AM,Alex,Chen,alex.chen@example.com,Yes
2026/10/04 10:35:00 AM,Alexander,Chen,alex.chen@example.com,Yes
2026/10/04 10:40:00 AM,Invalid,User,invalid-email-address,Yes
2026/10/04 10:45:00 AM,,,missing.name@example.com,Yes`;
}

/**
 * Returns synthetic organizer-verified CSV content containing explicit Attendance and Eligibility columns.
 */
export function getSyntheticVerifiedCsvContent(): string {
  return `Timestamp,First Name,Last Name,Email Address,Confirmation,Attendance,Eligibility
2026/10/04 10:15:00 AM,Alex,Chen,alex.chen@example.com,Yes,Attended,Eligible
2026/10/04 10:16:30 AM,priya,sharma,priya.sharma@example.com,Yes,Attended,Eligible
2026/10/04 10:18:00 AM,MICHAEL,O'CONNOR,michael.oconnor@example.com,Yes,Attended,Eligible
2026/10/04 10:20:00 AM,Jean-Luc,Picard,jeanluc.picard@example.com,Yes,Attended,Eligible
2026/10/04 10:22:00 AM,David,Kim,david.kim@example.com,Yes,Attended,Eligible
2026/10/04 10:25:00 AM,Sam,Morgan,sam.morgan@example.com,No,Absent,Ineligible
2026/10/04 10:28:00 AM,Jordan,Taylor,jordan.taylor@example.com,Pending,Absent,Ineligible`;
}

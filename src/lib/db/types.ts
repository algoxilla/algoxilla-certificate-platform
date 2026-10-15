// Algoxilla Certificate Platform - Authoritative Data Model & Schema Types
// Defines strongly-typed entities, status enums, and data-access layer interfaces
// across Events, Participants, Registrations, Eligibility, Certificates, Corrections, Organizers, and Audit Logs.

export type EventStatus = "UPCOMING" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export interface EventRecord {
  id: string; // Unique UUID or event slug (e.g. 'algothon-26')
  code: string; // Standard short identifier (e.g. 'ALGOTHON26')
  name: string; // Full title: 'Algothon’26 — A National Level Hackathon'
  eventDate: string; // ISO date string (e.g. '2026-10-04')
  organizerName: string; // 'Algoxilla'
  description?: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantRecord {
  id: string; // Unique canonical participant UUID
  email: string; // Normalized lowercase email (canonical unique key)
  normalizedName: string; // Approved canonical Title Case full name
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export type RegistrationSource = "GOOGLE_FORMS" | "UNSTOP" | "MANUAL_IMPORT" | "API";
export type RegistrationStatus = "CONFIRMED" | "PENDING_APPROVAL" | "UNCONFIRMED" | "CANCELLED";

export interface EventRegistrationRecord {
  id: string; // Unique registration UUID
  eventId: string; // Foreign key referencing EventRecord.id
  participantId: string; // Foreign key referencing ParticipantRecord.id
  externalRegistrationId?: string; // External ID from Google Forms or Unstop
  registrationSource: RegistrationSource;
  registeredName: string; // Name as originally submitted by participant
  registrationStatus: RegistrationStatus;
  rawMetadata?: string; // Serialized JSON of raw spreadsheet/webhook payload
  createdAt: string;
  updatedAt: string;
}

export type EligibilityStatus = "ELIGIBLE" | "INELIGIBLE" | "PENDING_ORGANIZER_APPROVAL";

export interface EligibilityRecord {
  id: string; // Unique eligibility decision UUID
  registrationId: string; // Unique foreign key to EventRegistrationRecord.id
  eligibilityStatus: EligibilityStatus;
  attendanceConfirmed: boolean; // Attendance verified by organizer
  reviewDecisionBy?: string; // Organizer ID or 'SYSTEM_IMPORT'
  reviewNotes?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CertificateType = "PARTICIPATION" | "WINNER" | "RUNNER_UP" | "MENTOR" | "ORGANIZER";
export type CertificateStatus = "ISSUED" | "REVOKED" | "REPLACED";

export interface CertificateRecord {
  id: string; // Unique UUID
  certificateCode: string; // Human-readable public ID (e.g. 'ALGO-2026-HACK-7892')
  registrationId: string; // Foreign key to EventRegistrationRecord.id
  recipientName: string; // The exact name printed on the certificate
  certificateType: CertificateType;
  /**
   * Canonical Metadata SHA-256 Digest:
   * Computed over `${certificateCode}:${recipientName}:${certificateType}:${issuedAt}`.
   * Proves database record integrity and QR-code parameter alignment.
   * NOTE: Does NOT verify binary PDF bytes (which is documentHash).
   */
  verificationHash: string;
  /**
   * PDF Document Binary Hash (Phase C):
   * Reserved for SHA-256 digest of the final rendered PDF binary bytes.
   * Populated once PDF generation is executed.
   */
  documentHash?: string;
  status: CertificateStatus;
  reissueCount: number; // 0 for initial issue, increments on correction
  supersededById?: string; // If REPLACED, points to the new CertificateRecord.id
  revocationReason?: string; // Reason if revoked or superseded
  revokedAt?: string;
  issuedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CertificateDetailsRecord extends CertificateRecord {
  eventName?: string;
  eventDate?: string;
  email?: string;
  supersededByCode?: string;
}

export type CorrectionStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CorrectionRequestRecord {
  id: string; // Unique correction request UUID
  certificateId: string; // Foreign key referencing CertificateRecord.id
  requestedName: string; // Corrected participant name requested
  reason: string; // Explanation of error / misalignment
  supportingEvidence?: string;
  status: CorrectionStatus;
  reviewedBy?: string; // Organizer user ID
  reviewerNotes?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type OrganizerRole = "SUPER_ADMIN" | "ORGANIZER" | "VERIFIER";

export interface OrganizerUserRecord {
  id: string; // Unique user UUID
  email: string;
  fullName: string;
  role: OrganizerRole;
  isActive: boolean;
  passwordHash?: string; // Bcrypt or Argon2 hash
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AuditAction = 
  | "CSV_IMPORT"
  | "ELIGIBILITY_APPROVED"
  | "ELIGIBILITY_REJECTED"
  | "CERTIFICATE_ISSUED"
  | "CERTIFICATE_REISSUED"
  | "CERTIFICATE_REVOKED"
  | "CLAIM_LINK_SENT"
  | "CLAIM_LINK_CONSUMED"
  | "CORRECTION_SUBMITTED"
  | "CORRECTION_APPROVED"
  | "CORRECTION_REJECTED"
  | "ORGANIZER_ROLE_CHANGED";

export interface AuditLogRecord {
  id: string; // Unique audit log UUID
  actorId: string; // Organizer ID, Participant ID, or 'SYSTEM'
  actorRole: string; // 'SUPER_ADMIN', 'ORGANIZER', 'PARTICIPANT', 'SYSTEM'
  action: AuditAction;
  targetEntity: string; // Table name, e.g. 'certificates'
  targetId: string; // Primary key of affected record
  previousState?: string; // JSON snapshot of previous data
  newState?: string; // JSON snapshot of new data
  ipAddress?: string;
  timestamp: string; // ISO timestamp
}

export type ClaimTokenType = "CLAIM_LINK" | "OTP";

export interface ClaimTokenRecord {
  id: string;
  email: string;
  tokenHash: string;
  tokenType: ClaimTokenType;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  consumedAt?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

// Data Access Layer Operations & Parameters
export interface ImportCommitPayload {
  eventId: string;
  organizerId: string;
  sourceFile: string;
  rows: Array<{
    fullName: string;
    email: string;
    externalId?: string;
    source: RegistrationSource;
    registrationStatus: RegistrationStatus;
    eligibilityStatus: EligibilityStatus;
    attendanceConfirmed?: boolean;
    rawMetadata?: Record<string, unknown>;
  }>;
}

export interface ImportCommitResult {
  insertedParticipants: number;
  updatedParticipants: number;
  createdRegistrations: number;
  skippedDuplicates: number;
  flaggedConflicts: number;
  createdEligibilityRecords: number;
  auditLogId: string;
}

export interface RevokeCertificateParams {
  certificateCode: string;
  reason: string;
  actorId: string;
}

export interface ReissueCertificateParams {
  oldCertificateCode: string;
  newRecipientName: string;
  reason: string;
  actorId: string;
}

export interface ApproveEligibilityParams {
  registrationId?: string;
  eligibilityId?: string;
  actorId: string;
  actorRole?: string;
  reviewNotes?: string;
  attendanceConfirmed?: boolean;
}

// Public Server-Side Verification Endpoint Contract
export type VerificationOutcome = "ISSUED" | "REVOKED" | "REPLACED" | "NOT_FOUND" | "INTERNAL_ERROR" | "INVALID_FORMAT";

export interface PublicVerificationResponse {
  status: VerificationOutcome;
  certificate?: {
    certificateCode: string;
    recipientName: string;
    eventName: string;
    eventDate: string;
    certificateType: CertificateType;
    metadataHash: string;
    documentHash?: string;
    reissueCount: number;
    issuedAt: string;
    // Superseded metadata if status === "REPLACED"
    supersededByCode?: string;
    // Revocation metadata if status === "REVOKED"
    revocationReason?: string;
    revokedAt?: string;
  };
  error?: string;
  databaseIntegration: "CONNECTED" | "PENDING_SUPABASE";
  verifiedAt: string;
}

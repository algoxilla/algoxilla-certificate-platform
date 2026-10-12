-- =========================================================================
-- ALGOXILLA CERTIFICATE PLATFORM — CANONICAL DATABASE SCHEMA
-- Compatible with SQLite (local development/testing) and PostgreSQL / Supabase
-- Covers: Events, Participants, Registrations, Eligibility, Certificates,
--         Correction Requests, Organizer Roles, and Audit Logs.
-- =========================================================================

-- 1. EVENTS (Multi-Event Architecture)
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    event_date TEXT NOT NULL,
    organizer_name TEXT NOT NULL DEFAULT 'Algoxilla',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED')),
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 2. PARTICIPANTS (Canonical Participant Directory)
CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE, -- Normalized lowercase RFC 5322 email
    normalized_name TEXT NOT NULL, -- Canonical Title-Cased full name
    phone TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 3. EVENT REGISTRATIONS (Links Participant to Event)
CREATE TABLE IF NOT EXISTS event_registrations (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
    external_registration_id TEXT, -- Unstop or Google Forms response ID
    registration_source TEXT NOT NULL CHECK (registration_source IN ('GOOGLE_FORMS', 'UNSTOP', 'MANUAL_IMPORT', 'API')),
    registered_name TEXT NOT NULL, -- As typed originally by the registrant
    registration_status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (registration_status IN ('CONFIRMED', 'PENDING_APPROVAL', 'UNCONFIRMED', 'CANCELLED')),
    raw_metadata TEXT, -- JSON audit string of raw submission columns
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    CONSTRAINT uq_event_participant UNIQUE (event_id, participant_id)
);

-- 4. ORGANIZER-APPROVED ELIGIBILITY RECORDS (Authoritative Eligibility Safeguard)
CREATE TABLE IF NOT EXISTS eligibility_records (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL UNIQUE REFERENCES event_registrations(id) ON DELETE CASCADE,
    eligibility_status TEXT NOT NULL DEFAULT 'PENDING_ORGANIZER_APPROVAL' CHECK (eligibility_status IN ('ELIGIBLE', 'INELIGIBLE', 'PENDING_ORGANIZER_APPROVAL')),
    attendance_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (attendance_confirmed IN (0, 1)),
    review_decision_by TEXT, -- Organizer user ID or 'SYSTEM_IMPORT'
    review_notes TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 5. CERTIFICATES (Issued Credentials & Cryptographic Stamping)
CREATE TABLE IF NOT EXISTS certificates (
    id TEXT PRIMARY KEY,
    certificate_code TEXT NOT NULL UNIQUE, -- e.g. 'ALGO-2026-HACK-7892'
    registration_id TEXT NOT NULL REFERENCES event_registrations(id) ON DELETE RESTRICT,
    recipient_name TEXT NOT NULL, -- Exact name stamped on PDF artwork
    certificate_type TEXT NOT NULL DEFAULT 'PARTICIPATION' CHECK (certificate_type IN ('PARTICIPATION', 'WINNER', 'RUNNER_UP', 'MENTOR', 'ORGANIZER')),
    verification_hash TEXT NOT NULL UNIQUE, -- SHA-256 fingerprint
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'REVOKED', 'REPLACED')),
    reissue_count INTEGER NOT NULL DEFAULT 0,
    superseded_by_id TEXT REFERENCES certificates(id) ON DELETE SET NULL,
    revocation_reason TEXT,
    revoked_at TEXT,
    issued_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 6. CORRECTION REQUESTS (Self-Service Name Appeals & Organizer Review)
CREATE TABLE IF NOT EXISTS correction_requests (
    id TEXT PRIMARY KEY,
    certificate_id TEXT NOT NULL REFERENCES certificates(id) ON DELETE RESTRICT,
    requested_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    supporting_evidence TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by TEXT, -- Organizer user ID
    reviewer_notes TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 7. ORGANIZER ROLES & USERS (Role-Based Access Control)
CREATE TABLE IF NOT EXISTS organizer_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'ORGANIZER' CHECK (role IN ('SUPER_ADMIN', 'ORGANIZER', 'VERIFIER')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    password_hash TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 8. AUDIT LOGS (Immutable, Append-Only Regulatory Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL, -- Organizer ID, Participant ID, or 'SYSTEM'
    actor_role TEXT NOT NULL, -- 'SUPER_ADMIN', 'ORGANIZER', 'PARTICIPANT', 'SYSTEM'
    action TEXT NOT NULL, -- e.g. 'CSV_IMPORT', 'CERTIFICATE_ISSUED', 'CERTIFICATE_REVOKED'
    target_entity TEXT NOT NULL, -- e.g. 'certificates', 'participants', 'eligibility_records'
    target_id TEXT NOT NULL, -- Primary key of modified record
    previous_state TEXT, -- Serialized JSON snapshot before mutation
    new_state TEXT, -- Serialized JSON snapshot after mutation
    ip_address TEXT,
    timestamp TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 9. CLAIM TOKENS (Secure Passwordless Email Verification Tokens)
CREATE TABLE IF NOT EXISTS claim_tokens (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_type TEXT NOT NULL DEFAULT 'CLAIM_LINK' CHECK (token_type IN ('CLAIM_LINK', 'OTP')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- PERFORMANCE & INTEGRITY INDEXES
CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email);
CREATE INDEX IF NOT EXISTS idx_registrations_event ON event_registrations(event_id, participant_id);
CREATE INDEX IF NOT EXISTS idx_registrations_ext_id ON event_registrations(external_registration_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_external_id ON event_registrations(event_id, external_registration_id) WHERE external_registration_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eligibility_status ON eligibility_records(eligibility_status);
CREATE INDEX IF NOT EXISTS idx_certificates_code ON certificates(certificate_code);
CREATE INDEX IF NOT EXISTS idx_certificates_hash ON certificates(verification_hash);
CREATE INDEX IF NOT EXISTS idx_certificates_reg ON certificates(registration_id);
CREATE INDEX IF NOT EXISTS idx_corrections_cert ON correction_requests(certificate_id);
CREATE INDEX IF NOT EXISTS idx_claim_tokens_hash ON claim_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_claim_tokens_email ON claim_tokens(email);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_entity, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);

-- IMMUTABILITY ENFORCEMENT ON AUDIT LOGS
-- Audit logs are strictly append-only. Updates and deletions are rejected at the database level.
CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'Audit log records are immutable and cannot be updated.');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'Audit log records are immutable and cannot be deleted.');
END;


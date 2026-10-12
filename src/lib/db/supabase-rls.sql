-- =========================================================================
-- ALGOXILLA CERTIFICATE PLATFORM — SUPABASE ROW LEVEL SECURITY (RLS) POLICIES
-- Enforces strict client-side read/write boundaries:
-- - Protects participant PII (email, phone, metadata)
-- - Allows public verification of issued certificates
-- - Restricts all administrative mutations to service_role
-- =========================================================================

-- Enable Row Level Security on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_tokens ENABLE ROW LEVEL SECURITY;

-- 1. EVENTS: Public can view active events
DROP POLICY IF EXISTS "Public events are viewable by everyone" ON events;
CREATE POLICY "Public events are viewable by everyone" 
ON events FOR SELECT 
USING (status = 'ACTIVE' OR status = 'COMPLETED');

DROP POLICY IF EXISTS "Events service role full access" ON events;
CREATE POLICY "Events service role full access" 
ON events FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- 2. PARTICIPANTS: PII Protected (Service Role Only)
DROP POLICY IF EXISTS "Participants service role full access" ON participants;
CREATE POLICY "Participants service role full access" 
ON participants FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- 3. EVENT REGISTRATIONS: Protected (Service Role Only)
DROP POLICY IF EXISTS "Registrations service role full access" ON event_registrations;
CREATE POLICY "Registrations service role full access" 
ON event_registrations FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- 4. ELIGIBILITY RECORDS: Protected (Service Role Only)
DROP POLICY IF EXISTS "Eligibility service role full access" ON eligibility_records;
CREATE POLICY "Eligibility service role full access" 
ON eligibility_records FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- 5. CERTIFICATES: Zero direct public table access
-- Direct SELECT by anonymous users is BLOCKED to prevent bulk enumeration and scraping.
-- All public verifications must use the server-side /api/verify/[code] Route Handler
-- (or the secure RPC function verify_certificate below).
DROP POLICY IF EXISTS "Certificates service role full access" ON certificates;
CREATE POLICY "Certificates service role full access" 
ON certificates FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- 6. CORRECTION REQUESTS: Zero unauthenticated public insert
-- Direct INSERT from anonymous clients is BLOCKED to prevent spam flooding.
-- Submissions must pass through authenticated organizer/participant API with rate-limiting.
DROP POLICY IF EXISTS "Corrections service role full access" ON correction_requests;
CREATE POLICY "Corrections service role full access" 
ON correction_requests FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- 7. ORGANIZER USERS: Protected (Service Role Only)
DROP POLICY IF EXISTS "Organizers service role full access" ON organizer_users;
CREATE POLICY "Organizers service role full access" 
ON organizer_users FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- 8. AUDIT LOGS: Protected (Service Role Only)
DROP POLICY IF EXISTS "Audit logs service role full access" ON audit_logs;
CREATE POLICY "Audit logs service role full access" 
ON audit_logs FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- 9. CLAIM TOKENS: Protected (Service Role Only)
-- Direct client access is strictly blocked to prevent token enumeration, timing attacks, and spoofing.
DROP POLICY IF EXISTS "Claim tokens service role full access" ON claim_tokens;
CREATE POLICY "Claim tokens service role full access" 
ON claim_tokens FOR ALL 
TO service_role 
USING (true) WITH CHECK (true);

-- =========================================================================
-- SECURE PUBLIC VERIFICATION RPC FUNCTION (SECURITY DEFINER)
-- Returns ONLY the minimal projection required for public credential display.
-- Supports ISSUED, REVOKED, and REPLACED states without exposing table scans.
-- =========================================================================
CREATE OR REPLACE FUNCTION verify_certificate(p_code TEXT)
RETURNS TABLE (
    status TEXT,
    certificate_code TEXT,
    recipient_name TEXT,
    event_name TEXT,
    event_date TEXT,
    certificate_type TEXT,
    verification_hash TEXT,
    document_hash TEXT,
    reissue_count INT,
    issued_at TEXT,
    superseded_by_code TEXT,
    revocation_reason TEXT,
    revoked_at TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.status::TEXT,
        c.certificate_code::TEXT,
        c.recipient_name::TEXT,
        e.name::TEXT AS event_name,
        e.event_date::TEXT AS event_date,
        c.certificate_type::TEXT,
        c.verification_hash::TEXT,
        NULL::TEXT AS document_hash,
        c.reissue_count::INT,
        c.issued_at::TEXT,
        sc.certificate_code::TEXT AS superseded_by_code,
        c.revocation_reason::TEXT,
        c.revoked_at::TEXT
    FROM certificates c
    JOIN event_registrations r ON c.registration_id = r.id
    JOIN events e ON r.event_id = e.id
    LEFT JOIN certificates sc ON c.superseded_by_id = sc.id
    WHERE UPPER(c.certificate_code) = UPPER(TRIM(p_code))
    LIMIT 1;
END;
$$;

-- Security Hardening: Revoke execution from all API/client roles (PUBLIC, anon, authenticated, service_role).
-- Public QR verifications are mediated securely by the Next.js server Route Handler (/api/verify/[code])
-- with sliding-window rate limiting, input validation, and direct database connection pooling.
-- Direct PostgREST execution is completely disabled following the Principle of Least Privilege.
REVOKE ALL ON FUNCTION verify_certificate(TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- =========================================================================
-- AUDIT LOG IMMUTABILITY ENFORCEMENT (POSTGRESQL TRIGGER)
-- =========================================================================
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Audit log records are append-only and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutability_update ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutability_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_audit_logs_immutability_delete ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutability_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();


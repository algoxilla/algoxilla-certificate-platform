-- =========================================================================
-- ALGOXILLA CERTIFICATE PLATFORM — SECURITY ADVISOR REMEDIATION MIGRATION
-- Migration: 002_reconcile_security_advisor.sql
-- Target Event: Algothon’26 (ALGOTHON26)
-- Resolves Supabase Security Advisor warnings:
--   1. Function Search Path Mutable — public.prevent_audit_log_mutation
--   2. Public Can Execute SECURITY DEFINER Function — public.verify_certificate
--   3. Signed-In Users Can Execute SECURITY DEFINER Function — public.verify_certificate
-- =========================================================================

BEGIN;

-- 1. Remediate prevent_audit_log_mutation (Warning 1)
-- Sets an explicit empty search_path to prevent search-path hijacking (CVE-2018-1058 class).
-- Retains standard trigger execution ownership and immutability behavior.
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Audit log records are append-only and cannot be updated or deleted.';
END;
$$;

-- 2. Remediate verify_certificate (Warnings 2 and 3)
-- Revokes all execution privileges from PUBLIC, anon, authenticated, and service_role.
-- The Next.js application mediates all public QR verifications through the server-side
-- Route Handler (/api/verify/[code]) using direct connection pooling with rate limiting.
-- Direct PostgREST execution is completely disabled following the Principle of Least Privilege.
REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- Ensure search_path is strictly fixed to public
ALTER FUNCTION public.verify_certificate(TEXT) SET search_path = 'public';

COMMIT;

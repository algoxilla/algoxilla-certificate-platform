// Algoxilla Certificate Platform - Supabase PostgreSQL Repository
// Implements authoritative data access against Supabase PostgreSQL via connection pooler or REST client.
// Enforces participant eligibility, atomic token invalidation, certificate issuance, and immutable audit logs.

import crypto from "node:crypto";
import { getPostgresPool, getSupabaseAdminClient } from "./supabaseClient.ts";
import type {
  CertificateRecord,
  CertificateDetailsRecord,
  ClaimTokenRecord,
  CorrectionRequestRecord,
  ParticipantRecord,
  EventRegistrationRecord,
  EligibilityRecord,
  CertificateType,
  ApproveEligibilityParams,
} from "./types.ts";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class SupabaseCertificateRepository {
  private useDirectPg: boolean;

  constructor() {
    this.useDirectPg = Boolean(
      process.env.DATABASE_URL ||
      process.env.DIRECT_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING
    );
  }

  // ---------------------------------------------------------------------------
  // CERTIFICATE LOOKUP & VERIFICATION
  // ---------------------------------------------------------------------------
  public async getCertificateByCode(code: string): Promise<CertificateDetailsRecord | null> {
    const normalizedCode = code.trim().toUpperCase();

    if (this.useDirectPg) {
      const pool = getPostgresPool();
      const res = await pool.query(
        `SELECT 
          c.id, c.certificate_code, c.registration_id, c.recipient_name,
          c.certificate_type, c.verification_hash, c.status, c.reissue_count,
          c.superseded_by_id, c.revocation_reason, c.revoked_at, c.issued_at,
          c.created_at, c.updated_at,
          e.name as event_name, e.event_date,
          p.email,
          sc.certificate_code as superseded_by_code
        FROM certificates c
        JOIN event_registrations r ON c.registration_id = r.id
        JOIN events e ON r.event_id = e.id
        JOIN participants p ON r.participant_id = p.id
        LEFT JOIN certificates sc ON c.superseded_by_id = sc.id
        WHERE c.certificate_code = $1`,
        [normalizedCode]
      );

      if (res.rows.length === 0) return null;
      const row = res.rows[0];

      return {
        id: row.id,
        certificateCode: row.certificate_code,
        registrationId: row.registration_id,
        recipientName: row.recipient_name,
        certificateType: row.certificate_type,
        verificationHash: row.verification_hash,
        status: row.status,
        reissueCount: row.reissue_count,
        supersededById: row.superseded_by_id,
        supersededByCode: row.superseded_by_code,
        revocationReason: row.revocation_reason,
        revokedAt: row.revoked_at,
        issuedAt: row.issued_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        eventName: row.event_name,
        eventDate: row.event_date,
        email: row.email,
      };
    } else {
      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase
        .from("certificates")
        .select(`
          id, certificate_code, registration_id, recipient_name, certificate_type,
          verification_hash, status, reissue_count, superseded_by_id, revocation_reason,
          revoked_at, issued_at, created_at, updated_at,
          event_registrations (
            events (name, event_date),
            participants (email)
          )
        `)
        .eq("certificate_code", normalizedCode)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        console.error(`[DB_LOOKUP_ERROR] Supabase SDK query failed for code ${normalizedCode}:`, error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }

      if (!data) return null;

      // Extract joined fields safely
      const reg = data.event_registrations as unknown as {
        events?: { name: string; event_date: string };
        participants?: { email: string };
      } | null;

      return {
        id: data.id,
        certificateCode: data.certificate_code,
        registrationId: data.registration_id,
        recipientName: data.recipient_name,
        certificateType: data.certificate_type,
        verificationHash: data.verification_hash,
        status: data.status,
        reissueCount: data.reissue_count,
        supersededById: data.superseded_by_id,
        revocationReason: data.revocation_reason,
        revokedAt: data.revoked_at,
        issuedAt: data.issued_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        eventName: reg?.events?.name || "Algothon’26",
        eventDate: reg?.events?.event_date || "October 04, 2026",
        email: reg?.participants?.email,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // PARTICIPANT PORTAL STATUS
  // ---------------------------------------------------------------------------
  public async getParticipantPortalData(email: string): Promise<{
    participant: ParticipantRecord;
    registration: EventRegistrationRecord;
    eligibility: EligibilityRecord;
    certificate: CertificateRecord | null;
    correction: CorrectionRequestRecord | null;
  } | null> {
    const cleanEmail = normalizeEmail(email);

    if (this.useDirectPg) {
      const pool = getPostgresPool();
      const res = await pool.query(
        `SELECT 
          p.id as part_id, p.email, p.normalized_name, p.phone, p.created_at as part_created_at, p.updated_at as part_updated_at,
          r.id as reg_id, r.event_id, r.external_registration_id, r.registration_source, r.registered_name, r.registration_status, r.created_at as reg_created_at, r.updated_at as reg_updated_at,
          el.id as el_id, el.eligibility_status, el.attendance_confirmed, el.review_notes, el.reviewed_at, el.created_at as el_created_at, el.updated_at as el_updated_at,
          c.id as cert_id, c.certificate_code, c.recipient_name, c.certificate_type, c.verification_hash, c.status as cert_status, c.issued_at, c.created_at as cert_created_at, c.updated_at as cert_updated_at,
          cr.id as corr_id, cr.requested_name, cr.reason as corr_reason, cr.status as corr_status, cr.created_at as corr_created_at
        FROM participants p
        JOIN event_registrations r ON p.id = r.participant_id
        LEFT JOIN eligibility_records el ON r.id = el.registration_id
        LEFT JOIN certificates c ON r.id = c.registration_id AND c.status = 'ISSUED'
        LEFT JOIN correction_requests cr ON c.id = cr.certificate_id AND cr.status = 'PENDING'
        WHERE p.email = $1
        ORDER BY r.created_at DESC
        LIMIT 1`,
        [cleanEmail]
      );

      if (res.rows.length === 0) return null;
      const row = res.rows[0];

      return {
        participant: {
          id: row.part_id,
          email: row.email,
          normalizedName: row.normalized_name,
          phone: row.phone,
          createdAt: row.part_created_at,
          updatedAt: row.part_updated_at,
        },
        registration: {
          id: row.reg_id,
          eventId: row.event_id,
          participantId: row.part_id,
          externalRegistrationId: row.external_registration_id,
          registrationSource: row.registration_source,
          registeredName: row.registered_name,
          registrationStatus: row.registration_status,
          createdAt: row.reg_created_at,
          updatedAt: row.reg_updated_at,
        },
        eligibility: {
          id: row.el_id || crypto.randomUUID(),
          registrationId: row.reg_id,
          eligibilityStatus: row.eligibility_status || "PENDING_ORGANIZER_APPROVAL",
          attendanceConfirmed: Boolean(row.attendance_confirmed),
          reviewNotes: row.review_notes,
          reviewedAt: row.reviewed_at,
          createdAt: row.el_created_at || row.reg_created_at,
          updatedAt: row.el_updated_at || row.reg_updated_at,
        },
        certificate: row.cert_id ? {
          id: row.cert_id,
          certificateCode: row.certificate_code,
          registrationId: row.reg_id,
          recipientName: row.recipient_name,
          certificateType: row.certificate_type,
          verificationHash: row.verification_hash,
          status: row.cert_status,
          reissueCount: 0,
          issuedAt: row.issued_at,
          createdAt: row.cert_created_at,
          updatedAt: row.cert_updated_at,
        } : null,
        correction: row.corr_id ? {
          id: row.corr_id,
          certificateId: row.cert_id,
          requestedName: row.requested_name,
          reason: row.corr_reason,
          status: row.corr_status,
          createdAt: row.corr_created_at,
          updatedAt: row.corr_created_at,
        } : null,
      };
    } else {
      const supabase = getSupabaseAdminClient();
      const { data: part, error } = await supabase
        .from("participants")
        .select(`
          id, email, normalized_name, phone, created_at, updated_at,
          event_registrations (
            id, event_id, external_registration_id, registration_source, registered_name, registration_status, created_at, updated_at,
            eligibility_records (id, eligibility_status, attendance_confirmed, review_notes, reviewed_at, created_at, updated_at),
            certificates (id, certificate_code, recipient_name, certificate_type, verification_hash, status, issued_at, created_at, updated_at,
              correction_requests (id, requested_name, reason, status, created_at)
            )
          )
        `)
        .eq("email", cleanEmail)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        console.error("[DB_LOOKUP_ERROR] Supabase SDK query failed for participant:", error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }

      if (!part) return null;

      const regList = (part.event_registrations as unknown as Array<{
        id: string;
        event_id: string;
        external_registration_id?: string;
        registration_source: string;
        registered_name: string;
        registration_status: string;
        created_at: string;
        updated_at: string;
        eligibility_records?: Array<{
          id: string;
          eligibility_status: string;
          attendance_confirmed: boolean;
          review_notes?: string;
          reviewed_at?: string;
          created_at: string;
          updated_at: string;
        }>;
        certificates?: Array<{
          id: string;
          certificate_code: string;
          recipient_name: string;
          certificate_type: string;
          verification_hash: string;
          status: string;
          issued_at: string;
          created_at: string;
          updated_at: string;
          correction_requests?: Array<{
            id: string;
            requested_name: string;
            reason: string;
            status: string;
            created_at: string;
          }>;
        }>;
      }>) || [];

      if (regList.length === 0) return null;
      const reg = regList[0];
      const el = reg.eligibility_records?.[0];
      const issuedCert = reg.certificates?.find((c) => c.status === "ISSUED");
      const pendingCorr = issuedCert?.correction_requests?.find((cr) => cr.status === "PENDING");

      return {
        participant: {
          id: part.id,
          email: part.email,
          normalizedName: part.normalized_name,
          phone: part.phone,
          createdAt: part.created_at,
          updatedAt: part.updated_at,
        },
        registration: {
          id: reg.id,
          eventId: reg.event_id,
          participantId: part.id,
          externalRegistrationId: reg.external_registration_id,
          registrationSource: reg.registration_source as EventRegistrationRecord["registrationSource"],
          registeredName: reg.registered_name,
          registrationStatus: reg.registration_status as EventRegistrationRecord["registrationStatus"],
          createdAt: reg.created_at,
          updatedAt: reg.updated_at,
        },
        eligibility: {
          id: el?.id || crypto.randomUUID(),
          registrationId: reg.id,
          eligibilityStatus: (el?.eligibility_status as EligibilityRecord["eligibilityStatus"]) || "PENDING_ORGANIZER_APPROVAL",
          attendanceConfirmed: Boolean(el?.attendance_confirmed),
          reviewNotes: el?.review_notes,
          reviewedAt: el?.reviewed_at,
          createdAt: el?.created_at || reg.created_at,
          updatedAt: el?.updated_at || reg.updated_at,
        },
        certificate: issuedCert ? {
          id: issuedCert.id,
          certificateCode: issuedCert.certificate_code,
          registrationId: reg.id,
          recipientName: issuedCert.recipient_name,
          certificateType: issuedCert.certificate_type as CertificateRecord["certificateType"],
          verificationHash: issuedCert.verification_hash,
          status: issuedCert.status as CertificateRecord["status"],
          reissueCount: 0,
          issuedAt: issuedCert.issued_at,
          createdAt: issuedCert.created_at,
          updatedAt: issuedCert.updated_at,
        } : null,
        correction: pendingCorr ? {
          id: pendingCorr.id,
          certificateId: issuedCert?.id || "",
          requestedName: pendingCorr.requested_name,
          reason: pendingCorr.reason as CorrectionRequestRecord["reason"],
          status: pendingCorr.status as CorrectionRequestRecord["status"],
          createdAt: pendingCorr.created_at,
          updatedAt: pendingCorr.created_at,
        } : null,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // CLAIM TOKENS (Magic Links & OTPs)
  // ---------------------------------------------------------------------------
  public async createClaimToken(params: {
    email: string;
    tokenHash: string;
    expiresAt: string;
    tokenType?: "CLAIM_LINK" | "OTP";
    ipAddress?: string;
  }): Promise<ClaimTokenRecord> {
    const id = crypto.randomUUID();
    const cleanEmail = normalizeEmail(params.email);
    const tokenType = params.tokenType || "CLAIM_LINK";
    const now = new Date().toISOString();

    if (this.useDirectPg) {
      const pool = getPostgresPool();
      await pool.query(
        `INSERT INTO claim_tokens (id, email, token_hash, token_type, attempts, max_attempts, expires_at, ip_address, created_at)
         VALUES ($1, $2, $3, $4, 0, 3, $5, $6, $7)`,
        [id, cleanEmail, params.tokenHash, tokenType, params.expiresAt, params.ipAddress || null, now]
      );
    } else {
      const supabase = getSupabaseAdminClient();
      const { error } = await supabase.from("claim_tokens").insert({
        id,
        email: cleanEmail,
        token_hash: params.tokenHash,
        token_type: tokenType,
        attempts: 0,
        max_attempts: 3,
        expires_at: params.expiresAt,
        ip_address: params.ipAddress || null,
        created_at: now,
      });
      if (error) throw new Error(`Supabase error creating claim token: ${error.message}`);
    }

    return {
      id,
      email: cleanEmail,
      tokenHash: params.tokenHash,
      tokenType,
      attempts: 0,
      maxAttempts: 3,
      expiresAt: params.expiresAt,
      consumedAt: null,
      ipAddress: params.ipAddress,
      createdAt: now,
    };
  }

  public async getClaimTokenByHash(tokenHash: string): Promise<ClaimTokenRecord | null> {
    if (this.useDirectPg) {
      const pool = getPostgresPool();
      const res = await pool.query(
        `SELECT id, email, token_hash, token_type, attempts, max_attempts, expires_at, consumed_at, ip_address, created_at
         FROM claim_tokens WHERE token_hash = $1`,
        [tokenHash]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        tokenHash: row.token_hash,
        tokenType: row.token_type,
        attempts: Number(row.attempts),
        maxAttempts: Number(row.max_attempts),
        expiresAt: row.expires_at,
        consumedAt: row.consumed_at,
        ipAddress: row.ip_address,
        createdAt: row.created_at,
      };
    } else {
      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase
        .from("claim_tokens")
        .select("id, email, token_hash, token_type, attempts, max_attempts, expires_at, consumed_at, ip_address, created_at")
        .eq("token_hash", tokenHash)
        .single();
      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        console.error("[DB_LOOKUP_ERROR] Supabase SDK query failed for claim token:", error.message);
        throw new Error(`Database query failed: ${error.message}`);
      }
      if (!data) return null;
      return {
        id: data.id,
        email: data.email,
        tokenHash: data.token_hash,
        tokenType: data.token_type,
        attempts: Number(data.attempts),
        maxAttempts: Number(data.max_attempts),
        expiresAt: data.expires_at,
        consumedAt: data.consumed_at,
        ipAddress: data.ip_address,
        createdAt: data.created_at,
      };
    }
  }

  public async incrementTokenAttempts(tokenId: string): Promise<number> {
    if (this.useDirectPg) {
      const pool = getPostgresPool();
      const res = await pool.query(
        `UPDATE claim_tokens SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
        [tokenId]
      );
      return res.rows[0]?.attempts ? Number(res.rows[0].attempts) : 0;
    } else {
      const supabase = getSupabaseAdminClient();
      const token = await supabase.from("claim_tokens").select("attempts").eq("id", tokenId).single();
      const newAttempts = ((token.data?.attempts as number) || 0) + 1;
      await supabase.from("claim_tokens").update({ attempts: newAttempts }).eq("id", tokenId);
      return newAttempts;
    }
  }

  /**
   * Atomically consumes a token (prevents concurrent replay attacks).
   * Returns true ONLY if this call marked the token as consumed.
   */
  public async consumeClaimToken(tokenId: string): Promise<boolean> {
    const now = new Date().toISOString();

    if (this.useDirectPg) {
      const pool = getPostgresPool();
      const res = await pool.query(
        `UPDATE claim_tokens SET consumed_at = $1 WHERE id = $2 AND consumed_at IS NULL`,
        [now, tokenId]
      );
      return (res.rowCount ?? 0) > 0;
    } else {
      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase
        .from("claim_tokens")
        .update({ consumed_at: now })
        .eq("id", tokenId)
        .is("consumed_at", null)
        .select("id");
      if (error) return false;
      return Boolean(data && data.length > 0);
    }
  }

  // ---------------------------------------------------------------------------
  // CERTIFICATE ISSUANCE & CORRECTIONS
  // ---------------------------------------------------------------------------
  public async claimCertificate(params: {
    registrationId: string;
    recipientName: string;
    certificateType?: CertificateType;
    preferPublicDomain?: boolean;
  }): Promise<CertificateRecord> {
    // Check if certificate already exists
    if (this.useDirectPg) {
      const pool = getPostgresPool();
      const existing = await pool.query(
        `SELECT id, certificate_code, registration_id, recipient_name, certificate_type, verification_hash, status, reissue_count, issued_at, created_at, updated_at
         FROM certificates WHERE registration_id = $1 AND status = 'ISSUED'`,
        [params.registrationId]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        return {
          id: row.id,
          certificateCode: row.certificate_code,
          registrationId: row.registration_id,
          recipientName: row.recipient_name,
          certificateType: row.certificate_type,
          verificationHash: row.verification_hash,
          status: row.status,
          reissueCount: row.reissue_count,
          issuedAt: row.issued_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }

      // Generate unique certificate code
      const randDigits = Math.floor(1000 + Math.random() * 9000);
      const certCode = `ALGO-2026-HACK-${randDigits}`;
      const certId = crypto.randomUUID();
      const issuedAt = new Date().toISOString();
      const certType = params.certificateType || "PARTICIPATION";
      const metadataHash = crypto
        .createHash("sha256")
        .update(`${certCode}|${params.recipientName}|${certType}|${issuedAt}`)
        .digest("hex");

      await pool.query(
        `INSERT INTO certificates (id, certificate_code, registration_id, recipient_name, certificate_type, verification_hash, status, reissue_count, issued_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'ISSUED', 0, $7, $8, $8)`,
        [certId, certCode, params.registrationId, params.recipientName, certType, metadataHash, issuedAt, issuedAt]
      );

      return {
        id: certId,
        certificateCode: certCode,
        registrationId: params.registrationId,
        recipientName: params.recipientName,
        certificateType: certType,
        verificationHash: metadataHash,
        status: "ISSUED",
        reissueCount: 0,
        issuedAt,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      };
    } else {
      const supabase = getSupabaseAdminClient();
      const { data: existing } = await supabase
        .from("certificates")
        .select("id, certificate_code, registration_id, recipient_name, certificate_type, verification_hash, status, reissue_count, issued_at, created_at, updated_at")
        .eq("registration_id", params.registrationId)
        .eq("status", "ISSUED")
        .maybeSingle();

      if (existing) {
        return {
          id: existing.id,
          certificateCode: existing.certificate_code,
          registrationId: existing.registration_id,
          recipientName: existing.recipient_name,
          certificateType: existing.certificate_type,
          verificationHash: existing.verification_hash,
          status: existing.status,
          reissueCount: existing.reissue_count,
          issuedAt: existing.issued_at,
          createdAt: existing.created_at,
          updatedAt: existing.updated_at,
        };
      }

      const randDigits = Math.floor(1000 + Math.random() * 9000);
      const certCode = `ALGO-2026-HACK-${randDigits}`;
      const certId = crypto.randomUUID();
      const issuedAt = new Date().toISOString();
      const certType = params.certificateType || "PARTICIPATION";
      const metadataHash = crypto
        .createHash("sha256")
        .update(`${certCode}|${params.recipientName}|${certType}|${issuedAt}`)
        .digest("hex");

      const { data, error } = await supabase
        .from("certificates")
        .insert({
          id: certId,
          certificate_code: certCode,
          registration_id: params.registrationId,
          recipient_name: params.recipientName,
          certificate_type: certType,
          verification_hash: metadataHash,
          status: "ISSUED",
          reissue_count: 0,
          issued_at: issuedAt,
          created_at: issuedAt,
          updated_at: issuedAt,
        })
        .select()
        .single();

      if (error || !data) throw new Error(`Supabase error issuing certificate: ${error?.message}`);

      return {
        id: data.id,
        certificateCode: data.certificate_code,
        registrationId: data.registration_id,
        recipientName: data.recipient_name,
        certificateType: data.certificate_type,
        verificationHash: data.verification_hash,
        status: data.status,
        reissueCount: data.reissue_count,
        issuedAt: data.issued_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  }

  public async submitCorrectionRequest(params: {
    certificateId: string;
    requestedName: string;
    reason: string;
    supportingEvidence?: string;
  }): Promise<CorrectionRequestRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    if (this.useDirectPg) {
      const pool = getPostgresPool();
      await pool.query(
        `INSERT INTO correction_requests (id, certificate_id, requested_name, reason, supporting_evidence, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $6)`,
        [id, params.certificateId, params.requestedName.trim(), params.reason, params.supportingEvidence || null, now]
      );
    } else {
      const supabase = getSupabaseAdminClient();
      const { error } = await supabase.from("correction_requests").insert({
        id,
        certificate_id: params.certificateId,
        requested_name: params.requestedName.trim(),
        reason: params.reason,
        supporting_evidence: params.supportingEvidence || null,
        status: "PENDING",
        created_at: now,
        updated_at: now,
      });
      if (error) throw new Error(`Supabase error submitting correction request: ${error.message}`);
    }

    return {
      id,
      certificateId: params.certificateId,
      requestedName: params.requestedName.trim(),
      reason: params.reason as CorrectionRequestRecord["reason"],
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };
  }

  public async approveEligibility(params: ApproveEligibilityParams): Promise<EligibilityRecord> {
    const now = new Date().toISOString();
    const actorRole = params.actorRole || "ORGANIZER";
    const notes = params.reviewNotes || "Organizer confirmed eligibility";

    if (this.useDirectPg) {
      const pool = getPostgresPool();
      let query = "SELECT * FROM eligibility_records WHERE ";
      let paramVal: string;
      if (params.eligibilityId) {
        query += "id = $1";
        paramVal = params.eligibilityId;
      } else if (params.registrationId) {
        query += "registration_id = $1";
        paramVal = params.registrationId;
      } else {
        throw new Error("Must provide either registrationId or eligibilityId.");
      }

      const existingRes = await pool.query(query, [paramVal]);
      if (existingRes.rows.length === 0) {
        throw new Error("Eligibility record not found.");
      }
      const existing = existingRes.rows[0];

      const newAttendance = params.attendanceConfirmed !== undefined 
        ? (params.attendanceConfirmed ? 1 : 0) 
        : Number(existing.attendance_confirmed);

      await pool.query(
        `UPDATE eligibility_records
         SET eligibility_status = 'ELIGIBLE',
             attendance_confirmed = $1,
             review_decision_by = $2,
             review_notes = $3,
             reviewed_at = $4,
             updated_at = $4
         WHERE id = $5`,
        [newAttendance, params.actorId, notes, now, existing.id]
      );

      const previousState = JSON.stringify({
        eligibility_status: existing.eligibility_status,
        attendance_confirmed: existing.attendance_confirmed,
        review_decision_by: existing.review_decision_by,
        reviewed_at: existing.reviewed_at,
        review_notes: existing.review_notes,
      });
      const newState = JSON.stringify({
        eligibility_status: "ELIGIBLE",
        attendance_confirmed: newAttendance,
        review_decision_by: params.actorId,
        reviewed_at: now,
        review_notes: notes,
      });

      await pool.query(
        `INSERT INTO audit_logs (id, actor_id, actor_role, action, target_entity, target_id, previous_state, new_state, timestamp)
         VALUES ($1, $2, $3, 'ELIGIBILITY_APPROVED', 'eligibility_records', $4, $5, $6, $7)`,
        [crypto.randomUUID(), params.actorId, actorRole, existing.id, previousState, newState, now]
      );

      return {
        id: existing.id,
        registrationId: existing.registration_id,
        eligibilityStatus: "ELIGIBLE",
        attendanceConfirmed: Boolean(newAttendance),
        reviewDecisionBy: params.actorId,
        reviewNotes: notes,
        reviewedAt: now,
        createdAt: existing.created_at,
        updatedAt: now,
      };
    } else {
      const supabase = getSupabaseAdminClient();
      let query = supabase.from("eligibility_records").select("*");
      if (params.eligibilityId) {
        query = query.eq("id", params.eligibilityId);
      } else if (params.registrationId) {
        query = query.eq("registration_id", params.registrationId);
      } else {
        throw new Error("Must provide either registrationId or eligibilityId.");
      }

      const { data: existing, error: findErr } = await query.single();
      if (findErr || !existing) {
        throw new Error(`Eligibility record not found: ${findErr?.message || "Not found"}`);
      }

      const newAttendance = params.attendanceConfirmed !== undefined 
        ? (params.attendanceConfirmed ? 1 : 0) 
        : Number(existing.attendance_confirmed);

      const { error: updateErr } = await supabase
        .from("eligibility_records")
        .update({
          eligibility_status: "ELIGIBLE",
          attendance_confirmed: newAttendance,
          review_decision_by: params.actorId,
          review_notes: notes,
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", existing.id);

      if (updateErr) throw new Error(`Supabase update error: ${updateErr.message}`);

      await this.logAudit({
        entityType: "eligibility_records",
        entityId: existing.id,
        action: "ELIGIBILITY_APPROVED",
        actorType: actorRole,
        actorId: params.actorId,
        oldState: JSON.stringify(existing),
        newState: JSON.stringify({
          ...existing,
          eligibility_status: "ELIGIBLE",
          attendance_confirmed: newAttendance,
          review_decision_by: params.actorId,
          review_notes: notes,
          reviewed_at: now,
        }),
      });

      return {
        id: existing.id,
        registrationId: existing.registration_id,
        eligibilityStatus: "ELIGIBLE",
        attendanceConfirmed: Boolean(newAttendance),
        reviewDecisionBy: params.actorId,
        reviewNotes: notes,
        reviewedAt: now,
        createdAt: existing.created_at,
        updatedAt: now,
      };
    }
  }

  public async logAudit(params: {
    entityType: string;
    entityId: string;
    action: string;
    actorType?: string;
    actorId?: string;
    oldState?: string;
    newState?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      if (this.useDirectPg) {
        const pool = getPostgresPool();
        await pool.query(
          `INSERT INTO audit_logs (id, actor_id, actor_role, action, target_entity, target_id, previous_state, new_state, ip_address, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id,
            params.actorId || "SYSTEM",
            params.actorType || "SYSTEM",
            params.action,
            params.entityType,
            params.entityId,
            params.oldState || null,
            params.newState || null,
            params.ipAddress || null,
            now,
          ]
        );
      } else {
        const supabase = getSupabaseAdminClient();
        await supabase.from("audit_logs").insert({
          id,
          actor_id: params.actorId || "SYSTEM",
          actor_role: params.actorType || "SYSTEM",
          action: params.action,
          target_entity: params.entityType,
          target_id: params.entityId,
          previous_state: params.oldState || null,
          new_state: params.newState || null,
          ip_address: params.ipAddress || null,
          timestamp: now,
        });
      }
    } catch (err) {
      console.error("Failed to write audit log entry:", err);
    }
  }

  public async close(): Promise<void> {
    // Pool cleanup is handled centrally
  }
}

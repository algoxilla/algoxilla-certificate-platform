// Algoxilla Certificate Platform - Data Access Layer (DAL) & Repository
// Implements safe transactional database operations, integrates the CSV import engine,
// and enforces duplicate prevention, conflict flagging, and certificate lifecycle management.

import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  EventRecord,
  ParticipantRecord,
  EventRegistrationRecord,
  EligibilityRecord,
  CertificateRecord,
  CertificateDetailsRecord,
  CorrectionRequestRecord,
  ClaimTokenRecord,
  AuditLogRecord,
  ImportCommitPayload,
  ImportCommitResult,
  RevokeCertificateParams,
  ReissueCertificateParams,
} from "./types.ts";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  const isAllUpper = cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned);
  const isAllLower = cleaned === cleaned.toLowerCase() && /[a-z]/.test(cleaned);

  if (!isAllUpper && !isAllLower) {
    return cleaned;
  }

  return cleaned
    .toLowerCase()
    .split(" ")
    .map((word) => {
      if (!word) return "";
      if (word.includes("'")) {
        return word
          .split("'")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("'");
      }
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

export class CertificateRepository {
  private db: DatabaseSync;

  constructor(dbPath: string | ":memory:" = ":memory:") {
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initializeSchema();
  }

  public get rawDb(): DatabaseSync {
    return this.db;
  }

  /**
   * Reads and executes the canonical schema DDL.
   */
  private initializeSchema(): void {
    const schemaPath = path.join(process.cwd(), "src", "lib", "db", "schema.sql");
    if (fs.existsSync(schemaPath)) {
      const ddl = fs.readFileSync(schemaPath, "utf-8");
      this.db.exec(ddl);
    } else {
      // Fallback inline bootstrap if file path is not resolved in bundled context
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          event_date TEXT NOT NULL,
          organizer_name TEXT NOT NULL DEFAULT 'Algoxilla',
          description TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE TABLE IF NOT EXISTS participants (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          normalized_name TEXT NOT NULL,
          phone TEXT,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE TABLE IF NOT EXISTS event_registrations (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
          participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
          external_registration_id TEXT,
          registration_source TEXT NOT NULL,
          registered_name TEXT NOT NULL,
          registration_status TEXT NOT NULL DEFAULT 'CONFIRMED',
          raw_metadata TEXT,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          CONSTRAINT uq_event_participant UNIQUE (event_id, participant_id)
        );
        CREATE TABLE IF NOT EXISTS eligibility_records (
          id TEXT PRIMARY KEY,
          registration_id TEXT NOT NULL UNIQUE REFERENCES event_registrations(id) ON DELETE CASCADE,
          eligibility_status TEXT NOT NULL DEFAULT 'PENDING_ORGANIZER_APPROVAL',
          attendance_confirmed INTEGER NOT NULL DEFAULT 0,
          review_decision_by TEXT,
          review_notes TEXT,
          reviewed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE TABLE IF NOT EXISTS certificates (
          id TEXT PRIMARY KEY,
          certificate_code TEXT NOT NULL UNIQUE,
          registration_id TEXT NOT NULL REFERENCES event_registrations(id) ON DELETE RESTRICT,
          recipient_name TEXT NOT NULL,
          certificate_type TEXT NOT NULL DEFAULT 'PARTICIPATION',
          verification_hash TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'ISSUED',
          reissue_count INTEGER NOT NULL DEFAULT 0,
          superseded_by_id TEXT REFERENCES certificates(id),
          revocation_reason TEXT,
          revoked_at TEXT,
          issued_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE TABLE IF NOT EXISTS correction_requests (
          id TEXT PRIMARY KEY,
          certificate_id TEXT NOT NULL REFERENCES certificates(id) ON DELETE RESTRICT,
          requested_name TEXT NOT NULL,
          reason TEXT NOT NULL,
          supporting_evidence TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING',
          reviewed_by TEXT,
          reviewer_notes TEXT,
          reviewed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE TABLE IF NOT EXISTS organizer_users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'ORGANIZER',
          is_active INTEGER NOT NULL DEFAULT 1,
          password_hash TEXT,
          last_login_at TEXT,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          actor_id TEXT NOT NULL,
          actor_role TEXT NOT NULL,
          action TEXT NOT NULL,
          target_entity TEXT NOT NULL,
          target_id TEXT NOT NULL,
          previous_state TEXT,
          new_state TEXT,
          ip_address TEXT,
          timestamp TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE TABLE IF NOT EXISTS claim_tokens (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          token_type TEXT NOT NULL DEFAULT 'CLAIM_LINK',
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          ip_address TEXT,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE INDEX IF NOT EXISTS idx_claim_tokens_hash ON claim_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_claim_tokens_email ON claim_tokens(email);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_event_external_id ON event_registrations(event_id, external_registration_id) WHERE external_registration_id IS NOT NULL;
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
      `);
    }
  }

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------
  public upsertEvent(event: Omit<EventRecord, "createdAt" | "updatedAt">): EventRecord {
    const existing = this.getEventByCode(event.code);
    const now = new Date().toISOString();
    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE events 
        SET name = ?, event_date = ?, organizer_name = ?, description = ?, status = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(event.name, event.eventDate, event.organizerName, event.description || "", event.status, now, existing.id);
      return { ...existing, ...event, updatedAt: now };
    }

    const id = event.id || crypto.randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO events (id, code, name, event_date, organizer_name, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, event.code, event.name, event.eventDate, event.organizerName, event.description || "", event.status, now, now);
    return { ...event, id, createdAt: now, updatedAt: now };
  }

  public getEventByCode(code: string): EventRecord | null {
    const stmt = this.db.prepare("SELECT * FROM events WHERE code = ?");
    const row = stmt.get(code) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      code: row.code as string,
      name: row.name as string,
      eventDate: row.event_date as string,
      organizerName: row.organizer_name as string,
      description: (row.description as string) || undefined,
      status: row.status as EventRecord["status"],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // ---------------------------------------------------------------------------
  // PARTICIPANTS
  // ---------------------------------------------------------------------------
  public getParticipantByEmail(email: string): ParticipantRecord | null {
    const normalized = normalizeEmail(email);
    const stmt = this.db.prepare("SELECT * FROM participants WHERE email = ?");
    const row = stmt.get(normalized) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      email: row.email as string,
      normalizedName: row.normalized_name as string,
      phone: (row.phone as string) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // ---------------------------------------------------------------------------
  // CSV IMPORT COMMIT INTEGRATION (ATOMIC TRANSACTION)
  // ---------------------------------------------------------------------------
  public commitCsvImport(payload: ImportCommitPayload): ImportCommitResult {
    const now = new Date().toISOString();
    let insertedParticipants = 0;
    let updatedParticipants = 0;
    let createdRegistrations = 0;
    let skippedDuplicates = 0;
    let flaggedConflicts = 0;
    let createdEligibilityRecords = 0;

    const event = this.db.prepare("SELECT id FROM events WHERE id = ?").get(payload.eventId);
    if (!event) {
      throw new Error(`Event with ID '${payload.eventId}' does not exist.`);
    }

    this.db.exec("BEGIN TRANSACTION;");

    try {
      for (const row of payload.rows) {
        const cleanEmail = normalizeEmail(row.email);
        const cleanName = normalizeName(row.fullName);

        // Check if participant already exists in the system
        const participant = this.getParticipantByEmail(cleanEmail);
        let participantId: string;

        if (!participant) {
          participantId = crypto.randomUUID();
          const pStmt = this.db.prepare(`
            INSERT INTO participants (id, email, normalized_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `);
          pStmt.run(participantId, cleanEmail, cleanName, now, now);
          insertedParticipants++;
        } else {
          participantId = participant.id;
          // Check for name discrepancy
          if (participant.normalizedName.toLowerCase() !== cleanName.toLowerCase()) {
            flaggedConflicts++;
          } else {
            updatedParticipants++;
          }
        }

        // Check if registration already exists for this event
        const regStmt = this.db.prepare(`
          SELECT id, registration_status FROM event_registrations
          WHERE event_id = ? AND participant_id = ?
        `);
        const existingReg = regStmt.get(payload.eventId, participantId) as Record<string, unknown> | undefined;

        let registrationId: string;

        if (existingReg) {
          skippedDuplicates++;
          registrationId = existingReg.id as string;
        } else {
          registrationId = crypto.randomUUID();
          const insReg = this.db.prepare(`
            INSERT INTO event_registrations (
              id, event_id, participant_id, external_registration_id, 
              registration_source, registered_name, registration_status, raw_metadata, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          insReg.run(
            registrationId,
            payload.eventId,
            participantId,
            row.externalId || null,
            row.source,
            row.fullName,
            row.registrationStatus,
            row.rawMetadata ? JSON.stringify(row.rawMetadata) : null,
            now,
            now
          );
          createdRegistrations++;

          // Create eligibility record based on verified attendance & organizer status
          const eligId = crypto.randomUUID();
          const eligStmt = this.db.prepare(`
            INSERT INTO eligibility_records (
              id, registration_id, eligibility_status, attendance_confirmed,
              review_decision_by, review_notes, reviewed_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          eligStmt.run(
            eligId,
            registrationId,
            row.eligibilityStatus,
            row.attendanceConfirmed ? 1 : 0,
            payload.organizerId,
            `Imported from ${payload.sourceFile}`,
            now,
            now,
            now
          );
          createdEligibilityRecords++;
        }
      }

      // Record immutable audit log entry
      const auditLogId = crypto.randomUUID();
      const auditStmt = this.db.prepare(`
        INSERT INTO audit_logs (
          id, actor_id, actor_role, action, target_entity, target_id,
          previous_state, new_state, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      auditStmt.run(
        auditLogId,
        payload.organizerId,
        "ORGANIZER",
        "CSV_IMPORT",
        "event_registrations",
        payload.eventId,
        null,
        JSON.stringify({
          sourceFile: payload.sourceFile,
          rowsCount: payload.rows.length,
          createdRegistrations,
          skippedDuplicates,
          flaggedConflicts,
        }),
        now
      );

      this.db.exec("COMMIT;");

      return {
        insertedParticipants,
        updatedParticipants,
        createdRegistrations,
        skippedDuplicates,
        flaggedConflicts,
        createdEligibilityRecords,
        auditLogId,
      };
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // CERTIFICATE ISSUANCE & VERIFICATION
  // ---------------------------------------------------------------------------
  public issueCertificate(params: {
    registrationId: string;
    recipientName: string;
    certificateCode?: string;
    certificateType?: "PARTICIPATION" | "WINNER" | "RUNNER_UP" | "MENTOR" | "ORGANIZER";
    actorId: string;
  }): CertificateRecord {
    const now = new Date().toISOString();
    const certId = crypto.randomUUID();
    const code = params.certificateCode || `ALGO-2026-HACK-${Math.floor(1000 + Math.random() * 9000)}`;
    const type = params.certificateType || "PARTICIPATION";

    // Verify registration and eligibility
    const elig = this.db.prepare(`
      SELECT eligibility_status, attendance_confirmed 
      FROM eligibility_records 
      WHERE registration_id = ?
    `).get(params.registrationId) as Record<string, unknown> | undefined;

    if (!elig || elig.eligibility_status !== "ELIGIBLE" || elig.attendance_confirmed !== 1) {
      throw new Error(`Cannot issue certificate: Registration ${params.registrationId} is not approved ELIGIBLE with verified attendance.`);
    }

    // Priority 4: Canonical Metadata SHA-256 Digest
    // Computed over canonical metadata to verify record integrity and QR parameters.
    // PDF Document Binary Hash (document_hash) is reserved for Phase C upon PDF generation.
    const metadataHash = crypto
      .createHash("sha256")
      .update(`${code}:${params.recipientName}:${type}:${now}`)
      .digest("hex");

    const stmt = this.db.prepare(`
      INSERT INTO certificates (
        id, certificate_code, registration_id, recipient_name,
        certificate_type, verification_hash, status, reissue_count,
        issued_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ISSUED', 0, ?, ?, ?)
    `);
    stmt.run(certId, code, params.registrationId, params.recipientName, type, metadataHash, now, now, now);

    // Audit log
    const auditStmt = this.db.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, target_entity, target_id, new_state, timestamp)
      VALUES (?, ?, 'ORGANIZER', 'CERTIFICATE_ISSUED', 'certificates', ?, ?, ?)
    `);
    auditStmt.run(crypto.randomUUID(), params.actorId, certId, JSON.stringify({ code, recipientName: params.recipientName, metadataHash }), now);

    return {
      id: certId,
      certificateCode: code,
      registrationId: params.registrationId,
      recipientName: params.recipientName,
      certificateType: type,
      verificationHash: metadataHash,
      status: "ISSUED",
      reissueCount: 0,
      issuedAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  public getCertificateByCode(code: string): CertificateDetailsRecord | null {
    const stmt = this.db.prepare(`
      SELECT 
        c.*,
        e.name as event_name,
        e.event_date,
        p.email,
        sc.certificate_code as superseded_by_code
      FROM certificates c
      JOIN event_registrations r ON c.registration_id = r.id
      JOIN events e ON r.event_id = e.id
      JOIN participants p ON r.participant_id = p.id
      LEFT JOIN certificates sc ON c.superseded_by_id = sc.id
      WHERE c.certificate_code = ?
    `);
    const row = stmt.get(code) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: row.id as string,
      certificateCode: row.certificate_code as string,
      registrationId: row.registration_id as string,
      recipientName: row.recipient_name as string,
      certificateType: row.certificate_type as CertificateRecord["certificateType"],
      verificationHash: row.verification_hash as string,
      status: row.status as CertificateRecord["status"],
      reissueCount: Number(row.reissue_count || 0),
      supersededById: (row.superseded_by_id as string) || undefined,
      supersededByCode: (row.superseded_by_code as string) || undefined,
      revocationReason: (row.revocation_reason as string) || undefined,
      revokedAt: (row.revoked_at as string) || undefined,
      issuedAt: row.issued_at as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      eventName: row.event_name as string,
      eventDate: row.event_date as string,
      email: row.email as string,
    };
  }

  // ---------------------------------------------------------------------------
  // REVOCATION & REISSUE
  // ---------------------------------------------------------------------------
  public revokeCertificate(params: RevokeCertificateParams): void {
    const now = new Date().toISOString();
    const existing = this.getCertificateByCode(params.certificateCode);
    if (!existing) {
      throw new Error(`Certificate with code '${params.certificateCode}' does not exist.`);
    }

    const stmt = this.db.prepare(`
      UPDATE certificates 
      SET status = 'REVOKED', revocation_reason = ?, revoked_at = ?, updated_at = ?
      WHERE certificate_code = ?
    `);
    stmt.run(params.reason, now, now, params.certificateCode);

    // Audit log
    const auditStmt = this.db.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, target_entity, target_id, previous_state, new_state, timestamp)
      VALUES (?, ?, 'ORGANIZER', 'CERTIFICATE_REVOKED', 'certificates', ?, ?, ?, ?)
    `);
    auditStmt.run(
      crypto.randomUUID(),
      params.actorId,
      existing.id,
      JSON.stringify({ status: existing.status }),
      JSON.stringify({ status: "REVOKED", reason: params.reason }),
      now
    );
  }

  public reissueCertificate(params: ReissueCertificateParams): CertificateRecord {
    const now = new Date().toISOString();
    const oldCert = this.getCertificateByCode(params.oldCertificateCode);
    if (!oldCert) {
      throw new Error(`Original certificate '${params.oldCertificateCode}' not found.`);
    }

    const newCertId = crypto.randomUUID();
    const newCode = `ALGO-2026-HACK-${Math.floor(1000 + Math.random() * 9000)}`;
    const newHash = crypto
      .createHash("sha256")
      .update(`${newCode}:${params.newRecipientName}:${oldCert.certificateType}:${now}`)
      .digest("hex");

    this.db.exec("BEGIN TRANSACTION;");
    try {
      // 1. Insert new certificate with incremented reissueCount
      const insNew = this.db.prepare(`
        INSERT INTO certificates (
          id, certificate_code, registration_id, recipient_name,
          certificate_type, verification_hash, status, reissue_count,
          issued_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?, ?)
      `);
      insNew.run(
        newCertId,
        newCode,
        oldCert.registrationId,
        params.newRecipientName,
        oldCert.certificateType,
        newHash,
        oldCert.reissueCount + 1,
        now,
        now,
        now
      );

      // 2. Mark old certificate as REPLACED and point superseded_by_id to the new certificate
      const updateOld = this.db.prepare(`
        UPDATE certificates 
        SET status = 'REPLACED', superseded_by_id = ?, revocation_reason = ?, revoked_at = ?, updated_at = ?
        WHERE id = ?
      `);
      updateOld.run(newCertId, `Replaced by ${newCode} (${params.reason})`, now, now, oldCert.id);

      // 3. Audit log
      const auditStmt = this.db.prepare(`
        INSERT INTO audit_logs (id, actor_id, actor_role, action, target_entity, target_id, previous_state, new_state, timestamp)
        VALUES (?, ?, 'ORGANIZER', 'CERTIFICATE_REISSUED', 'certificates', ?, ?, ?, ?)
      `);
      auditStmt.run(
        crypto.randomUUID(),
        params.actorId,
        newCertId,
        JSON.stringify({ supersededCertId: oldCert.id, oldCode: oldCert.certificateCode, oldName: oldCert.recipientName }),
        JSON.stringify({ newCode, newRecipientName: params.newRecipientName, reason: params.reason }),
        now
      );

      this.db.exec("COMMIT;");

      return {
        id: newCertId,
        certificateCode: newCode,
        registrationId: oldCert.registrationId,
        recipientName: params.newRecipientName,
        certificateType: oldCert.certificateType,
        verificationHash: newHash,
        status: "ISSUED",
        reissueCount: oldCert.reissueCount + 1,
        issuedAt: now,
        createdAt: now,
        updatedAt: now,
      };
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // AUDIT LOGS & INSPECTION
  // ---------------------------------------------------------------------------
  public getAuditLogs(limit: number = 50): AuditLogRecord[] {
    const stmt = this.db.prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?");
    const rows = stmt.all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      actorId: r.actor_id as string,
      actorRole: r.actor_role as string,
      action: r.action as AuditLogRecord["action"],
      targetEntity: r.target_entity as string,
      targetId: r.target_id as string,
      previousState: (r.previous_state as string) || undefined,
      newState: (r.new_state as string) || undefined,
      ipAddress: (r.ip_address as string) || undefined,
      timestamp: r.timestamp as string,
    }));
  }

  // ---------------------------------------------------------------------------
  // CLAIM TOKENS (PASSWORDLESS CLAIM FLOW)
  // ---------------------------------------------------------------------------
  public createClaimToken(params: {
    email: string;
    tokenHash: string;
    expiresAt: string;
    tokenType?: "CLAIM_LINK" | "OTP";
    ipAddress?: string;
  }): ClaimTokenRecord {
    const id = crypto.randomUUID();
    const cleanEmail = normalizeEmail(params.email);
    const tokenType = params.tokenType || "CLAIM_LINK";
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO claim_tokens (id, email, token_hash, token_type, attempts, max_attempts, expires_at, ip_address, created_at)
      VALUES (?, ?, ?, ?, 0, 3, ?, ?, ?)
    `);
    stmt.run(id, cleanEmail, params.tokenHash, tokenType, params.expiresAt, params.ipAddress || null, now);

    return {
      id,
      email: cleanEmail,
      tokenHash: params.tokenHash,
      tokenType,
      attempts: 0,
      maxAttempts: 3,
      expiresAt: params.expiresAt,
      consumedAt: null,
      ipAddress: params.ipAddress || null,
      createdAt: now,
    };
  }

  public getClaimTokenByHash(tokenHash: string): ClaimTokenRecord | null {
    const stmt = this.db.prepare("SELECT * FROM claim_tokens WHERE token_hash = ?");
    const row = stmt.get(tokenHash) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      email: row.email as string,
      tokenHash: row.token_hash as string,
      tokenType: row.token_type as "CLAIM_LINK" | "OTP",
      attempts: Number(row.attempts || 0),
      maxAttempts: Number(row.max_attempts || 3),
      expiresAt: row.expires_at as string,
      consumedAt: (row.consumed_at as string) || null,
      ipAddress: (row.ip_address as string) || null,
      createdAt: row.created_at as string,
    };
  }

  public incrementTokenAttempts(tokenId: string): number {
    const stmt = this.db.prepare(`
      UPDATE claim_tokens SET attempts = attempts + 1 WHERE id = ?
    `);
    stmt.run(tokenId);
    const updated = this.db.prepare("SELECT attempts FROM claim_tokens WHERE id = ?").get(tokenId) as { attempts: number } | undefined;
    return updated ? Number(updated.attempts) : 0;
  }

  public consumeClaimToken(tokenId: string): boolean {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE claim_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL
    `);
    const result = stmt.run(now, tokenId) as { changes?: number };
    return (result && typeof result.changes === "number" ? result.changes : 0) > 0;
  }

  // ---------------------------------------------------------------------------
  // PARTICIPANT PORTAL STATUS & ATOMIC CLAIM
  // ---------------------------------------------------------------------------
  public getParticipantPortalData(email: string): {
    participant: ParticipantRecord;
    registration: EventRegistrationRecord;
    eligibility: EligibilityRecord;
    certificate: CertificateRecord | null;
    correction: CorrectionRequestRecord | null;
  } | null {
    const cleanEmail = normalizeEmail(email);
    const participant = this.getParticipantByEmail(cleanEmail);
    if (!participant) return null;

    const regStmt = this.db.prepare(`
      SELECT 
        r.*,
        el.id as eligibility_id,
        el.eligibility_status,
        el.attendance_confirmed,
        el.review_decision_by,
        el.review_notes,
        el.reviewed_at,
        c.id as cert_id,
        c.certificate_code,
        c.recipient_name,
        c.certificate_type,
        c.verification_hash,
        c.status as cert_status,
        c.reissue_count,
        c.issued_at,
        cr.id as correction_id,
        cr.requested_name,
        cr.reason as correction_reason,
        cr.status as correction_status
      FROM event_registrations r
      LEFT JOIN eligibility_records el ON el.registration_id = r.id
      LEFT JOIN certificates c ON c.registration_id = r.id AND c.status = 'ISSUED'
      LEFT JOIN correction_requests cr ON cr.certificate_id = c.id AND cr.status = 'PENDING'
      WHERE r.participant_id = ?
      ORDER BY r.created_at DESC
      LIMIT 1
    `);
    const row = regStmt.get(participant.id) as Record<string, unknown> | undefined;
    if (!row) return null;

    const registration: EventRegistrationRecord = {
      id: row.id as string,
      eventId: row.event_id as string,
      participantId: row.participant_id as string,
      externalRegistrationId: (row.external_registration_id as string) || undefined,
      registrationSource: row.registration_source as EventRegistrationRecord["registrationSource"],
      registeredName: row.registered_name as string,
      registrationStatus: row.registration_status as EventRegistrationRecord["registrationStatus"],
      rawMetadata: (row.raw_metadata as string) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };

    const eligibility: EligibilityRecord = {
      id: (row.eligibility_id as string) || crypto.randomUUID(),
      registrationId: registration.id,
      eligibilityStatus: (row.eligibility_status as EligibilityRecord["eligibilityStatus"]) || "PENDING_ORGANIZER_APPROVAL",
      attendanceConfirmed: Boolean(row.attendance_confirmed),
      reviewDecisionBy: (row.review_decision_by as string) || undefined,
      reviewNotes: (row.review_notes as string) || undefined,
      reviewedAt: (row.reviewed_at as string) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };

    const certificate: CertificateRecord | null = row.cert_id ? {
      id: row.cert_id as string,
      certificateCode: row.certificate_code as string,
      registrationId: registration.id,
      recipientName: row.recipient_name as string,
      certificateType: row.certificate_type as CertificateRecord["certificateType"],
      verificationHash: row.verification_hash as string,
      status: row.cert_status as CertificateRecord["status"],
      reissueCount: Number(row.reissue_count || 0),
      issuedAt: row.issued_at as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    } : null;

    const correction: CorrectionRequestRecord | null = row.correction_id ? {
      id: row.correction_id as string,
      certificateId: row.cert_id as string,
      requestedName: row.requested_name as string,
      reason: row.correction_reason as string,
      status: row.correction_status as CorrectionRequestRecord["status"],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    } : null;

    return {
      participant,
      registration,
      eligibility,
      certificate,
      correction,
    };
  }

  /**
   * Atomically claims or generates a certificate for an eligible participant.
   */
  public claimCertificate(params: {
    registrationId: string;
    recipientName: string;
    actorId?: string;
  }): CertificateRecord {
    // Check if certificate already exists
    const existingStmt = this.db.prepare(`
      SELECT * FROM certificates WHERE registration_id = ? AND status = 'ISSUED' LIMIT 1
    `);
    const existing = existingStmt.get(params.registrationId) as Record<string, unknown> | undefined;
    if (existing) {
      return {
        id: existing.id as string,
        certificateCode: existing.certificate_code as string,
        registrationId: existing.registration_id as string,
        recipientName: existing.recipient_name as string,
        certificateType: existing.certificate_type as CertificateRecord["certificateType"],
        verificationHash: existing.verification_hash as string,
        status: existing.status as CertificateRecord["status"],
        reissueCount: Number(existing.reissue_count || 0),
        issuedAt: existing.issued_at as string,
        createdAt: existing.created_at as string,
        updatedAt: existing.updated_at as string,
      };
    }

    // Verify eligibility
    const elStmt = this.db.prepare(`
      SELECT eligibility_status, attendance_confirmed FROM eligibility_records WHERE registration_id = ?
    `);
    const el = elStmt.get(params.registrationId) as { eligibility_status: string; attendance_confirmed: number } | undefined;
    if (!el || el.eligibility_status !== "ELIGIBLE" || el.attendance_confirmed !== 1) {
      throw new Error("Cannot claim certificate: Participant record is not approved by organizer.");
    }

    return this.issueCertificate({
      registrationId: params.registrationId,
      recipientName: params.recipientName,
      actorId: params.actorId || "PARTICIPANT_SELF_CLAIM",
    });
  }

  /**
   * Submits a participant name correction request.
   */
  public submitCorrectionRequest(params: {
    certificateId: string;
    requestedName: string;
    reason: string;
    supportingEvidence?: string;
  }): CorrectionRequestRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO correction_requests (id, certificate_id, requested_name, reason, supporting_evidence, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `);
    stmt.run(id, params.certificateId, params.requestedName.trim(), params.reason.trim(), params.supportingEvidence || null, now, now);

    return {
      id,
      certificateId: params.certificateId,
      requestedName: params.requestedName.trim(),
      reason: params.reason.trim(),
      supportingEvidence: params.supportingEvidence,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };
  }

  public close(): void {
    this.db.close();
  }
}

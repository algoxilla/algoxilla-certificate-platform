// Algoxilla Certificate Platform - Google Forms Integration Engine
// Provides secure, idempotent payload normalization, dry-run evaluation,
// transactional persistence, and replay-resistant webhook synchronization.

import crypto from "node:crypto";
import { getPostgresPool } from "../db/supabaseClient.ts";
import { getCertificateRepository, isSupabaseConfigured } from "../db/client.ts";
import { CertificateRepository } from "../db/repository.ts";
import { normalizeEmail, normalizeName, sanitizeFormulaInjection } from "../csvImport.ts";

export type GoogleFormsSyncAction =
  | "CREATED"
  | "ALREADY_PROCESSED"
  | "EDITED"
  | "FLAGGED_CONFLICT"
  | "REJECTED";

export interface GoogleFormsSubmissionPayload {
  responseId: string;
  email: string;
  fullName: string;
  phone?: string;
  timestamp?: string; // Form submission timestamp
  formSubmittedAt?: string; // Explicit form submission timestamp
  requestTimestamp?: string; // HTTP request dispatch timestamp
  eventId?: string;
  answers?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface GoogleFormsSyncResult {
  action: GoogleFormsSyncAction;
  responseId: string;
  email?: string;
  fullName?: string;
  participantId?: string;
  registrationId?: string;
  notes?: string;
}

export interface GoogleFormsDryRunResult {
  total: number;
  wouldInsert: number;
  alreadyProcessed: number;
  wouldEdit: number;
  wouldFlagConflict: number;
  wouldReject: number;
  results: GoogleFormsSyncResult[];
}

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface SecretVerificationResult {
  valid: boolean;
  error?: "MISSING_SECRET" | "UNAUTHORIZED" | "WEBHOOK_CONFIGURATION_MISSING";
}

/**
 * Validates the pre-shared secret using constant-time comparison to prevent timing attacks.
 * In production mode, strictly requires GOOGLE_FORMS_WEBHOOK_SECRET and fails closed if missing.
 */
export function verifyWebhookSecret(
  providedSecret: string | null | undefined,
  options?: { isReconcile?: boolean }
): SecretVerificationResult {
  if (!providedSecret || !providedSecret.trim()) {
    return { valid: false, error: "MISSING_SECRET" };
  }

  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.APP_LIVE === "true" ||
    process.env.NEXT_PUBLIC_APP_LIVE === "true";

  const configuredWebhookSecret = process.env.GOOGLE_FORMS_WEBHOOK_SECRET;

  // Strict Fail-Closed Guard: In production, GOOGLE_FORMS_WEBHOOK_SECRET must be explicitly set!
  // Silent fallback to ORGANIZER_SECRET is strictly forbidden in production.
  if (isProd && !configuredWebhookSecret) {
    console.error("[SECURITY] GOOGLE_FORMS_WEBHOOK_SECRET is not configured in production. Webhook endpoint failed closed.");
    return { valid: false, error: "WEBHOOK_CONFIGURATION_MISSING" };
  }

  // Active secret selection:
  // 1. Primary: GOOGLE_FORMS_WEBHOOK_SECRET
  // 2. Reconcile mode only: allows ORGANIZER_SECRET for administrative batch backfills
  // 3. Non-production / Test mode: allows fallback to ORGANIZER_SECRET if GOOGLE_FORMS_WEBHOOK_SECRET is omitted
  let activeSecret = configuredWebhookSecret;
  if (!activeSecret) {
    if (options?.isReconcile || !isProd) {
      activeSecret = process.env.ORGANIZER_SECRET;
    }
  }

  if (!activeSecret) {
    return { valid: false, error: "WEBHOOK_CONFIGURATION_MISSING" };
  }

  const cleanProvided = providedSecret.startsWith("Bearer ")
    ? providedSecret.slice(7).trim()
    : providedSecret.trim();

  const provBuf = Buffer.from(cleanProvided);
  const confBuf = Buffer.from(activeSecret.trim());
  if (provBuf.length !== confBuf.length) {
    return { valid: false, error: "UNAUTHORIZED" };
  }

  const matches = crypto.timingSafeEqual(provBuf, confBuf);
  return { valid: matches, error: matches ? undefined : "UNAUTHORIZED" };
}

/**
 * Validates request timestamp freshness to protect against replay attacks.
 * Rejects timestamps older than maxSkewMs (default 5 minutes) or skewed into future.
 */
export function validateSubmissionTimestamp(
  timestamp: string | number | undefined,
  maxSkewMs = 300000 // 5 minutes
): { valid: boolean; error?: string; timestampMs?: number } {
  if (!timestamp) {
    return { valid: false, error: "Missing submission timestamp." };
  }

  let tsMs: number;
  if (typeof timestamp === "number") {
    tsMs = timestamp;
  } else {
    tsMs = new Date(timestamp).getTime();
  }

  if (Number.isNaN(tsMs)) {
    return { valid: false, error: "Invalid timestamp format." };
  }

  const now = Date.now();
  const diff = Math.abs(now - tsMs);

  if (diff > maxSkewMs) {
    return {
      valid: false,
      error: `Submission timestamp is outside acceptable ${Math.round(maxSkewMs / 60000)}-minute window.`,
      timestampMs: tsMs,
    };
  }

  return { valid: true, timestampMs: tsMs };
}

/**
 * Sanitizes and normalizes an incoming Google Forms payload (single submission or namedValues from Sheets).
 */
export function validateAndNormalizeSubmission(
  raw: unknown
): { valid: boolean; error?: string; submission?: GoogleFormsSubmissionPayload } {
  if (!raw || typeof raw !== "object") {
    return { valid: false, error: "Payload must be a non-null object." };
  }

  const data = raw as Record<string, unknown>;

  // Extract responseId
  let rawResponseId = String(data.responseId || data.id || data.submissionId || "").trim();

  // If using Google Sheets namedValues structure
  let rawEmail = "";
  let rawName = "";
  let rawPhone = "";
  let rawTimestamp = data.timestamp ? String(data.timestamp).trim() : undefined;
  const answers: Record<string, unknown> = {};

  if (data.namedValues && typeof data.namedValues === "object") {
    const nv = data.namedValues as Record<string, unknown>;
    for (const [key, val] of Object.entries(nv)) {
      const stringVal = Array.isArray(val) ? val.join(", ") : String(val ?? "");
      answers[key] = sanitizeFormulaInjection(stringVal);
      const lower = key.toLowerCase();

      if (!rawEmail && (lower.includes("email") || lower.includes("mail"))) {
        rawEmail = stringVal;
      } else if (!rawName && (lower.includes("name") || lower.includes("full name"))) {
        rawName = stringVal;
      } else if (!rawPhone && (lower.includes("phone") || lower.includes("mobile") || lower.includes("whatsapp"))) {
        rawPhone = stringVal;
      } else if (!rawTimestamp && lower.includes("timestamp")) {
        rawTimestamp = stringVal;
      }
    }
  } else {
    rawEmail = String(data.email || "");
    rawName = String(data.fullName || data.name || data.registeredName || "");
    rawPhone = data.phone ? String(data.phone) : "";

    if (data.answers && typeof data.answers === "object") {
      for (const [k, v] of Object.entries(data.answers as Record<string, unknown>)) {
        answers[k] = typeof v === "string" ? sanitizeFormulaInjection(v) : v;
      }
    }
  }

  // Fallback responseId generation from timestamp + email if running from custom sheet script without explicit ID
  if (!rawResponseId) {
    if (rawEmail && rawTimestamp) {
      rawResponseId = `GF-${crypto.createHash("sha256").update(`${rawEmail}:${rawTimestamp}`).digest("hex").slice(0, 16)}`;
    } else {
      return { valid: false, error: "Missing required 'responseId'." };
    }
  }

  const cleanEmail = normalizeEmail(rawEmail);
  if (!cleanEmail) {
    return { valid: false, error: "Missing required 'email'." };
  }
  if (!EMAIL_REGEX.test(cleanEmail)) {
    return { valid: false, error: `Invalid email address format: '${cleanEmail}'.` };
  }

  const cleanName = normalizeName(sanitizeFormulaInjection(rawName));
  if (!cleanName || cleanName.length < 2) {
    return { valid: false, error: "Missing or invalid 'fullName'." };
  }

  const cleanPhone = rawPhone ? sanitizeFormulaInjection(rawPhone.trim()) : undefined;
  const eventId = data.eventId ? String(data.eventId).trim() : undefined;
  const formSubmittedAt = data.formSubmittedAt ? String(data.formSubmittedAt).trim() : rawTimestamp;
  const requestTimestamp = data.requestTimestamp ? String(data.requestTimestamp).trim() : undefined;

  return {
    valid: true,
    submission: {
      responseId: sanitizeFormulaInjection(rawResponseId),
      email: cleanEmail,
      fullName: cleanName,
      phone: cleanPhone,
      timestamp: rawTimestamp,
      formSubmittedAt,
      requestTimestamp,
      eventId,
      answers,
      metadata: data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : undefined,
    },
  };
}

/**
 * Checks whether PostgreSQL direct pool or local SQLite repository is active.
 */
function isPostgresActive(): boolean {
  return (
    isSupabaseConfigured() &&
    Boolean(
      process.env.DATABASE_URL ||
      process.env.DIRECT_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING
    )
  );
}

/**
 * Evaluates a set of submissions in STRICT DRY-RUN MODE (0 database writes, 0 emails).
 */
export async function evaluateGoogleFormsDryRun(
  submissions: GoogleFormsSubmissionPayload[],
  eventIdentifier = "ALGOTHON26"
): Promise<GoogleFormsDryRunResult> {
  const result: GoogleFormsDryRunResult = {
    total: submissions.length,
    wouldInsert: 0,
    alreadyProcessed: 0,
    wouldEdit: 0,
    wouldFlagConflict: 0,
    wouldReject: 0,
    results: [],
  };

  const usePg = isPostgresActive();

  if (usePg) {
    const pool = getPostgresPool();
    // Resolve event
    const evRes = await pool.query(
      "SELECT id, code, name FROM events WHERE code = $1 OR id = $1 LIMIT 1;",
      [eventIdentifier]
    );
    if (evRes.rows.length === 0) {
      throw new Error(`Target event '${eventIdentifier}' not found in database.`);
    }
    const event = evRes.rows[0];

    for (const sub of submissions) {
      const validation = validateAndNormalizeSubmission(sub);
      if (!validation.valid || !validation.submission) {
        result.wouldReject++;
        result.results.push({
          action: "REJECTED",
          responseId: sub.responseId || "unknown",
          notes: validation.error,
        });
        continue;
      }
      const item = validation.submission;

      // Check external registration ID
      const extRes = await pool.query(
        `SELECT r.id, r.registered_name, p.email, p.normalized_name
         FROM event_registrations r
         JOIN participants p ON r.participant_id = p.id
         WHERE r.event_id = $1 AND r.external_registration_id = $2 LIMIT 1;`,
        [event.id, item.responseId]
      );

      if (extRes.rows.length > 0) {
        const row = extRes.rows[0];
        if (row.registered_name === item.fullName) {
          result.alreadyProcessed++;
          result.results.push({
            action: "ALREADY_PROCESSED",
            responseId: item.responseId,
            email: item.email,
            fullName: item.fullName,
            notes: "Identical registration already exists.",
          });
        } else {
          result.wouldEdit++;
          result.results.push({
            action: "EDITED",
            responseId: item.responseId,
            email: item.email,
            fullName: item.fullName,
            notes: `Would update registered name from '${row.registered_name}' to '${item.fullName}'.`,
          });
        }
        continue;
      }

      // Check if participant already exists
      const partRes = await pool.query(
        "SELECT id, email, normalized_name FROM participants WHERE email = $1 LIMIT 1;",
        [item.email]
      );

      if (partRes.rows.length > 0) {
        const part = partRes.rows[0];
        // Check if registered for this event
        const regRes = await pool.query(
          "SELECT id, external_registration_id, registered_name FROM event_registrations WHERE event_id = $1 AND participant_id = $2 LIMIT 1;",
          [event.id, part.id]
        );
        if (regRes.rows.length > 0) {
          result.wouldFlagConflict++;
          result.results.push({
            action: "FLAGGED_CONFLICT",
            responseId: item.responseId,
            email: item.email,
            fullName: item.fullName,
            notes: `Participant already registered for ${event.code} with ID '${regRes.rows[0].external_registration_id}'.`,
          });
        } else {
          result.wouldInsert++;
          result.results.push({
            action: "CREATED",
            responseId: item.responseId,
            email: item.email,
            fullName: item.fullName,
            notes: "Would create registration for existing participant.",
          });
        }
      } else {
        result.wouldInsert++;
        result.results.push({
          action: "CREATED",
          responseId: item.responseId,
          email: item.email,
          fullName: item.fullName,
          notes: "Would create new participant and event registration.",
        });
      }
    }
  } else {
    // SQLite repository path
    const repo = getCertificateRepository();
    if (!(repo instanceof CertificateRepository)) {
      throw new Error("Local SQLite repository instance unavailable for dry-run.");
    }
    const db = repo.rawDb;

    const eventStmt = db.prepare("SELECT id, code, name FROM events WHERE code = ? OR id = ? LIMIT 1;");
    const event = eventStmt.get(eventIdentifier, eventIdentifier) as { id: string; code: string; name: string } | undefined;
    if (!event) {
      throw new Error(`Target event '${eventIdentifier}' not found in database.`);
    }

    const extStmt = db.prepare(`
      SELECT r.id, r.registered_name, p.email, p.normalized_name
      FROM event_registrations r
      JOIN participants p ON r.participant_id = p.id
      WHERE r.event_id = ? AND r.external_registration_id = ? LIMIT 1;
    `);
    const partStmt = db.prepare("SELECT id, email, normalized_name FROM participants WHERE email = ? LIMIT 1;");
    const regStmt = db.prepare("SELECT id, external_registration_id, registered_name FROM event_registrations WHERE event_id = ? AND participant_id = ? LIMIT 1;");

    for (const sub of submissions) {
      const validation = validateAndNormalizeSubmission(sub);
      if (!validation.valid || !validation.submission) {
        result.wouldReject++;
        result.results.push({
          action: "REJECTED",
          responseId: sub.responseId || "unknown",
          notes: validation.error,
        });
        continue;
      }
      const item = validation.submission;

      const extRow = extStmt.get(event.id, item.responseId) as { id: string; registered_name: string } | undefined;
      if (extRow) {
        if (extRow.registered_name === item.fullName) {
          result.alreadyProcessed++;
          result.results.push({
            action: "ALREADY_PROCESSED",
            responseId: item.responseId,
            email: item.email,
            fullName: item.fullName,
            notes: "Identical registration already exists.",
          });
        } else {
          result.wouldEdit++;
          result.results.push({
            action: "EDITED",
            responseId: item.responseId,
            email: item.email,
            fullName: item.fullName,
            notes: `Would update registered name from '${extRow.registered_name}' to '${item.fullName}'.`,
          });
        }
        continue;
      }

      const partRow = partStmt.get(item.email) as { id: string; email: string; normalized_name: string } | undefined;
      if (partRow) {
        const regRow = regStmt.get(event.id, partRow.id) as { id: string; external_registration_id?: string } | undefined;
        if (regRow) {
          result.wouldFlagConflict++;
          result.results.push({
            action: "FLAGGED_CONFLICT",
            responseId: item.responseId,
            email: item.email,
            fullName: item.fullName,
            notes: `Participant already registered with ID '${regRow.external_registration_id}'.`,
          });
        } else {
          result.wouldInsert++;
          result.results.push({
            action: "CREATED",
            responseId: item.responseId,
            email: item.email,
            fullName: item.fullName,
            notes: "Would create registration for existing participant.",
          });
        }
      } else {
        result.wouldInsert++;
        result.results.push({
          action: "CREATED",
          responseId: item.responseId,
          email: item.email,
          fullName: item.fullName,
          notes: "Would create new participant and event registration.",
        });
      }
    }
  }

  return result;
}

/**
 * Safely processes a single Google Forms submission inside a database transaction.
 * Enforces the core platform invariants:
 *  - Attendance is NEVER marked as confirmed (attendance_confirmed = 0)
 *  - Eligibility status is PENDING_ORGANIZER_APPROVAL
 *  - ZERO certificates are created
 *  - ZERO emails are dispatched
 *  - Audit logs record administrative operations without plaintext PII
 */
export async function processGoogleFormsSubmission(
  rawSubmission: unknown,
  actor: { id: string; role: string; ip?: string } = {
    id: "GOOGLE_APPS_SCRIPT",
    role: "SYSTEM",
  }
): Promise<GoogleFormsSyncResult> {
  const validation = validateAndNormalizeSubmission(rawSubmission);
  if (!validation.valid || !validation.submission) {
    return {
      action: "REJECTED",
      responseId: (rawSubmission as Record<string, unknown>)?.responseId ? String((rawSubmission as Record<string, unknown>).responseId) : "unknown",
      notes: validation.error,
    };
  }

  const sub = validation.submission;
  const targetEvent = sub.eventId || "ALGOTHON26";
  const now = new Date().toISOString();
  const formSubmittedAt = sub.formSubmittedAt || sub.timestamp || now;
  const rawMetadataPayload = {
    source: "GOOGLE_FORMS",
    responseId: sub.responseId,
    formSubmittedAt,
    submittedAt: formSubmittedAt,
    recordedAt: now,
    requestTimestamp: sub.requestTimestamp || null,
    phone: sub.phone || null,
    answers: sub.answers || {},
    ...(sub.metadata || {}),
  };

  const usePg = isPostgresActive();

  if (usePg) {
    const pool = getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN;");

      // 1. Resolve target event
      const eventRes = await client.query(
        "SELECT id, code, name, status FROM events WHERE code = $1 OR id = $1 LIMIT 1;",
        [targetEvent]
      );
      if (eventRes.rows.length === 0) {
        throw new Error(`Target event '${targetEvent}' not found in database.`);
      }
      const event = eventRes.rows[0];

      // 2. Check existing registration by external_registration_id (Idempotency / Edit Check)
      const existingExt = await client.query(
        `SELECT r.id, r.participant_id, r.registered_name, r.registration_status, p.email, p.normalized_name
         FROM event_registrations r
         JOIN participants p ON r.participant_id = p.id
         WHERE r.event_id = $1 AND r.external_registration_id = $2 LIMIT 1;`,
        [event.id, sub.responseId]
      );

      if (existingExt.rows.length > 0) {
        const reg = existingExt.rows[0];

        if (reg.registered_name === sub.fullName) {
          await client.query("COMMIT;");
          return {
            action: "ALREADY_PROCESSED",
            responseId: sub.responseId,
            registrationId: reg.id,
            participantId: reg.participant_id,
            email: sub.email,
            fullName: sub.fullName,
            notes: "Identical registration already processed.",
          };
        } else {
          // Response was edited in Google Forms
          await client.query(
            `UPDATE event_registrations
             SET registered_name = $1, raw_metadata = $2, updated_at = $3
             WHERE id = $4;`,
            [sub.fullName, JSON.stringify(rawMetadataPayload), now, reg.id]
          );

          await client.query(
            `UPDATE participants
             SET normalized_name = $1, updated_at = $2
             WHERE id = $3;`,
            [sub.fullName, now, reg.participant_id]
          );

          const auditId = crypto.randomUUID();
          await client.query(
            `INSERT INTO audit_logs (
               id, actor_id, actor_role, action, target_entity, target_id,
               previous_state, new_state, ip_address, timestamp
             ) VALUES ($1, $2, $3, 'REGISTRATION_EDITED', 'event_registrations', $4, $5, $6, $7, $8);`,
            [
              auditId,
              actor.id,
              actor.role,
              reg.id,
              JSON.stringify({ registered_name: reg.registered_name }),
              JSON.stringify({ registered_name: sub.fullName }),
              actor.ip || null,
              now,
            ]
          );

          await client.query("COMMIT;");
          return {
            action: "EDITED",
            responseId: sub.responseId,
            registrationId: reg.id,
            participantId: reg.participant_id,
            email: sub.email,
            fullName: sub.fullName,
            notes: `Updated registered name from '${reg.registered_name}' to '${sub.fullName}'.`,
          };
        }
      }

      // 3. Resolve participant
      let participantId: string;
      let isNewParticipant = false;
      const partRes = await client.query(
        "SELECT id, email, normalized_name, phone FROM participants WHERE email = $1 LIMIT 1;",
        [sub.email]
      );

      if (partRes.rows.length > 0) {
        participantId = partRes.rows[0].id;
        if (sub.phone && !partRes.rows[0].phone) {
          await client.query(
            "UPDATE participants SET phone = $1, updated_at = $2 WHERE id = $3;",
            [sub.phone, now, participantId]
          );
        }
      } else {
        isNewParticipant = true;
        participantId = crypto.randomUUID();
        await client.query(
          `INSERT INTO participants (id, email, normalized_name, phone, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5);`,
          [participantId, sub.email, sub.fullName, sub.phone || null, now]
        );
      }

      // 4. Check if participant already has a registration for this event
      const existingPartReg = await client.query(
        `SELECT id, external_registration_id, registered_name FROM event_registrations
         WHERE event_id = $1 AND participant_id = $2 LIMIT 1;`,
        [event.id, participantId]
      );

      if (existingPartReg.rows.length > 0) {
        const reg = existingPartReg.rows[0];
        if (!reg.external_registration_id) {
          // Link missing external_registration_id
          await client.query(
            "UPDATE event_registrations SET external_registration_id = $1, updated_at = $2 WHERE id = $3;",
            [sub.responseId, now, reg.id]
          );
          await client.query("COMMIT;");
          return {
            action: "ALREADY_PROCESSED",
            responseId: sub.responseId,
            registrationId: reg.id,
            participantId,
            email: sub.email,
            fullName: reg.registered_name,
            notes: "Linked external response ID to existing registration.",
          };
        } else {
          // Conflict: already registered with different responseId
          await client.query("COMMIT;");
          return {
            action: "FLAGGED_CONFLICT",
            responseId: sub.responseId,
            registrationId: reg.id,
            participantId,
            email: sub.email,
            fullName: sub.fullName,
            notes: `Participant already registered for this event with response ID '${reg.external_registration_id}'.`,
          };
        }
      }

      // 5. Insert new registration
      const registrationId = crypto.randomUUID();
      await client.query(
        `INSERT INTO event_registrations (
           id, event_id, participant_id, external_registration_id,
           registration_source, registered_name, registration_status, raw_metadata,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'GOOGLE_FORMS', $5, 'CONFIRMED', $6, $7, $7);`,
        [
          registrationId,
          event.id,
          participantId,
          sub.responseId,
          sub.fullName,
          JSON.stringify(rawMetadataPayload),
          now,
        ]
      );

      // 6. Insert eligibility record (NEVER attendance_confirmed=1, ALWAYS PENDING_ORGANIZER_APPROVAL)
      const eligId = crypto.randomUUID();
      await client.query(
        `INSERT INTO eligibility_records (
           id, registration_id, eligibility_status, attendance_confirmed,
           review_decision_by, review_notes, reviewed_at, created_at, updated_at
         ) VALUES ($1, $2, 'PENDING_ORGANIZER_APPROVAL', 0, $3, $4, NULL, $5, $5);`,
        [
          eligId,
          registrationId,
          actor.id,
          "Google Forms registration received. Pending organizer attendance verification.",
          now,
        ]
      );

      // 7. Write audit log entry (sanitized metadata, zero credentials or raw PII)
      const auditId = crypto.randomUUID();
      const emailHash = crypto.createHash("sha256").update(sub.email).digest("hex").slice(0, 12);
      await client.query(
        `INSERT INTO audit_logs (
           id, actor_id, actor_role, action, target_entity, target_id,
           previous_state, new_state, ip_address, timestamp
         ) VALUES ($1, $2, $3, 'GOOGLE_FORMS_REGISTRATION', 'event_registrations', $4, NULL, $5, $6, $7);`,
        [
          auditId,
          actor.id,
          actor.role,
          registrationId,
          JSON.stringify({
            responseId: sub.responseId,
            emailHash,
            eventId: event.id,
            eventCode: event.code,
            isNewParticipant,
          }),
          actor.ip || null,
          now,
        ]
      );

      await client.query("COMMIT;");
      return {
        action: "CREATED",
        responseId: sub.responseId,
        registrationId,
        participantId,
        email: sub.email,
        fullName: sub.fullName,
        notes: isNewParticipant
          ? "Created new participant and event registration."
          : "Created event registration for existing participant.",
      };
    } catch (err: unknown) {
      await client.query("ROLLBACK;");
      const pgErr = err as { code?: string; message?: string };
      if (pgErr?.code === "23505" || String(pgErr?.message).includes("duplicate key")) {
        // Concurrency race condition: Concurrent worker inserted the exact record.
        // Re-read existing registration to return ALREADY_PROCESSED safely.
        try {
          const raceRes = await pool.query(
            `SELECT r.id, r.participant_id, r.registered_name
             FROM event_registrations r
             JOIN events e ON r.event_id = e.id
             WHERE (e.code = $1 OR e.id = $1) AND r.external_registration_id = $2 LIMIT 1;`,
            [targetEvent, sub.responseId]
          );
          if (raceRes.rows.length > 0) {
            return {
              action: "ALREADY_PROCESSED",
              responseId: sub.responseId,
              registrationId: raceRes.rows[0].id,
              participantId: raceRes.rows[0].participant_id,
              email: sub.email,
              fullName: raceRes.rows[0].registered_name,
              notes: "Concurrent submission handled idempotently.",
            };
          }
        } catch {
          // ignore fallback error and rethrow original err
        }
      }
      throw err;
    } finally {
      client.release();
    }
  } else {
    // SQLite repository path
    const repo = getCertificateRepository();
    if (!(repo instanceof CertificateRepository)) {
      throw new Error("SQLite repository unavailable.");
    }
    const db = repo.rawDb;

    try {
      db.exec("BEGIN;");

      const eventStmt = db.prepare("SELECT id, code, name FROM events WHERE code = ? OR id = ? LIMIT 1;");
      const event = eventStmt.get(targetEvent, targetEvent) as { id: string; code: string; name: string } | undefined;
      if (!event) {
        throw new Error(`Target event '${targetEvent}' not found in database.`);
      }

      // Check external registration ID
      const extStmt = db.prepare(`
        SELECT r.id, r.participant_id, r.registered_name, r.registration_status, p.email, p.normalized_name
        FROM event_registrations r
        JOIN participants p ON r.participant_id = p.id
        WHERE r.event_id = ? AND r.external_registration_id = ? LIMIT 1;
      `);
      const existingExt = extStmt.get(event.id, sub.responseId) as
        | { id: string; participant_id: string; registered_name: string }
        | undefined;

      if (existingExt) {
        if (existingExt.registered_name === sub.fullName) {
          db.exec("COMMIT;");
          return {
            action: "ALREADY_PROCESSED",
            responseId: sub.responseId,
            registrationId: existingExt.id,
            participantId: existingExt.participant_id,
            email: sub.email,
            fullName: sub.fullName,
            notes: "Identical registration already processed.",
          };
        } else {
          db.prepare(`
            UPDATE event_registrations
            SET registered_name = ?, raw_metadata = ?, updated_at = ?
            WHERE id = ?;
          `).run(sub.fullName, JSON.stringify(rawMetadataPayload), now, existingExt.id);

          db.prepare(`
            UPDATE participants
            SET normalized_name = ?, updated_at = ?
            WHERE id = ?;
          `).run(sub.fullName, now, existingExt.participant_id);

          const auditId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO audit_logs (
              id, actor_id, actor_role, action, target_entity, target_id,
              previous_state, new_state, ip_address, timestamp
            ) VALUES (?, ?, ?, 'REGISTRATION_EDITED', 'event_registrations', ?, ?, ?, ?, ?);
          `).run(
            auditId,
            actor.id,
            actor.role,
            existingExt.id,
            JSON.stringify({ registered_name: existingExt.registered_name }),
            JSON.stringify({ registered_name: sub.fullName }),
            actor.ip || null,
            now
          );

          db.exec("COMMIT;");
          return {
            action: "EDITED",
            responseId: sub.responseId,
            registrationId: existingExt.id,
            participantId: existingExt.participant_id,
            email: sub.email,
            fullName: sub.fullName,
            notes: `Updated registered name from '${existingExt.registered_name}' to '${sub.fullName}'.`,
          };
        }
      }

      // Resolve participant
      let participantId: string;
      let isNewParticipant = false;
      const partStmt = db.prepare("SELECT id, email, normalized_name, phone FROM participants WHERE email = ? LIMIT 1;");
      const partRow = partStmt.get(sub.email) as { id: string; phone?: string } | undefined;

      if (partRow) {
        participantId = partRow.id;
        if (sub.phone && !partRow.phone) {
          db.prepare("UPDATE participants SET phone = ?, updated_at = ? WHERE id = ?;").run(sub.phone, now, participantId);
        }
      } else {
        isNewParticipant = true;
        participantId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO participants (id, email, normalized_name, phone, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?);
        `).run(participantId, sub.email, sub.fullName, sub.phone || null, now, now);
      }

      // Check if participant already has a registration for this event
      const partRegStmt = db.prepare(
        "SELECT id, external_registration_id, registered_name FROM event_registrations WHERE event_id = ? AND participant_id = ? LIMIT 1;"
      );
      const regRow = partRegStmt.get(event.id, participantId) as { id: string; external_registration_id?: string; registered_name: string } | undefined;

      if (regRow) {
        if (!regRow.external_registration_id) {
          db.prepare("UPDATE event_registrations SET external_registration_id = ?, updated_at = ? WHERE id = ?;").run(sub.responseId, now, regRow.id);
          db.exec("COMMIT;");
          return {
            action: "ALREADY_PROCESSED",
            responseId: sub.responseId,
            registrationId: regRow.id,
            participantId,
            email: sub.email,
            fullName: regRow.registered_name,
            notes: "Linked external response ID to existing registration.",
          };
        } else {
          db.exec("COMMIT;");
          return {
            action: "FLAGGED_CONFLICT",
            responseId: sub.responseId,
            registrationId: regRow.id,
            participantId,
            email: sub.email,
            fullName: sub.fullName,
            notes: `Participant already registered for this event with response ID '${regRow.external_registration_id}'.`,
          };
        }
      }

      // Insert new registration
      const registrationId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO event_registrations (
          id, event_id, participant_id, external_registration_id,
          registration_source, registered_name, registration_status, raw_metadata,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'GOOGLE_FORMS', ?, 'CONFIRMED', ?, ?, ?);
      `).run(
        registrationId,
        event.id,
        participantId,
        sub.responseId,
        sub.fullName,
        JSON.stringify(rawMetadataPayload),
        now,
        now
      );

      // Insert eligibility record
      const eligId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO eligibility_records (
          id, registration_id, eligibility_status, attendance_confirmed,
          review_decision_by, review_notes, reviewed_at, created_at, updated_at
        ) VALUES (?, ?, 'PENDING_ORGANIZER_APPROVAL', 0, ?, ?, NULL, ?, ?);
      `).run(
        eligId,
        registrationId,
        actor.id,
        "Google Forms registration received. Pending organizer attendance verification.",
        now,
        now
      );

      // Write audit log
      const auditId = crypto.randomUUID();
      const emailHash = crypto.createHash("sha256").update(sub.email).digest("hex").slice(0, 12);
      db.prepare(`
        INSERT INTO audit_logs (
          id, actor_id, actor_role, action, target_entity, target_id,
          previous_state, new_state, ip_address, timestamp
        ) VALUES (?, ?, ?, 'GOOGLE_FORMS_REGISTRATION', 'event_registrations', ?, NULL, ?, ?, ?);
      `).run(
        auditId,
        actor.id,
        actor.role,
        registrationId,
        JSON.stringify({
          responseId: sub.responseId,
          emailHash,
          eventId: event.id,
          eventCode: event.code,
          isNewParticipant,
        }),
        actor.ip || null,
        now
      );

      db.exec("COMMIT;");
      return {
        action: "CREATED",
        responseId: sub.responseId,
        registrationId,
        participantId,
        email: sub.email,
        fullName: sub.fullName,
        notes: isNewParticipant
          ? "Created new participant and event registration."
          : "Created event registration for existing participant.",
      };
    } catch (err: unknown) {
      db.exec("ROLLBACK;");
      const sqlErr = err as { code?: string; message?: string };
      if (
        String(sqlErr?.message).includes("UNIQUE constraint failed") ||
        String(sqlErr?.code).includes("SQLITE_CONSTRAINT")
      ) {
        try {
          const raceRow = db.prepare(`
            SELECT r.id, r.participant_id, r.registered_name
            FROM event_registrations r
            JOIN events e ON r.event_id = e.id
            WHERE (e.code = ? OR e.id = ?) AND r.external_registration_id = ? LIMIT 1;
          `).get(targetEvent, targetEvent, sub.responseId) as
            | { id: string; participant_id: string; registered_name: string }
            | undefined;
          if (raceRow) {
            return {
              action: "ALREADY_PROCESSED",
              responseId: sub.responseId,
              registrationId: raceRow.id,
              participantId: raceRow.participant_id,
              email: sub.email,
              fullName: raceRow.registered_name,
              notes: "Concurrent submission handled idempotently.",
            };
          }
        } catch {
          // ignore fallback error and rethrow original err
        }
      }
      throw err;
    }
  }
}

/**
 * Batch processes multiple Google Forms submissions (e.g. for bulk reconcile or backfill).
 */
export async function processGoogleFormsBatch(
  submissions: GoogleFormsSubmissionPayload[],
  actor: { id: string; role: string; ip?: string } = {
    id: "GOOGLE_APPS_SCRIPT_BATCH",
    role: "SYSTEM",
  }
): Promise<GoogleFormsDryRunResult> {
  const result: GoogleFormsDryRunResult = {
    total: submissions.length,
    wouldInsert: 0,
    alreadyProcessed: 0,
    wouldEdit: 0,
    wouldFlagConflict: 0,
    wouldReject: 0,
    results: [],
  };

  for (const rawSub of submissions) {
    const outcome = await processGoogleFormsSubmission(rawSub, actor);
    result.results.push(outcome);
    switch (outcome.action) {
      case "CREATED":
        result.wouldInsert++;
        break;
      case "ALREADY_PROCESSED":
        result.alreadyProcessed++;
        break;
      case "EDITED":
        result.wouldEdit++;
        break;
      case "FLAGGED_CONFLICT":
        result.wouldFlagConflict++;
        break;
      case "REJECTED":
        result.wouldReject++;
        break;
    }
  }

  return result;
}

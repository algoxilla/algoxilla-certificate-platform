// Algoxilla Certificate Platform - Google Forms Webhook Synchronization Endpoint
// Handles authenticated form submission payloads from Google Apps Script.
// Enforces timing-safe authentication, replay prevention, rate limiting, and idempotent persistence.

import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSecret,
  validateSubmissionTimestamp,
  processGoogleFormsSubmission,
  processGoogleFormsBatch,
  GoogleFormsSubmissionPayload,
} from "@/lib/integrations/googleForms";
import { checkWebhookRateLimit } from "@/lib/auth/rateLimit";

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown-ip";
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);

  // 1. Sliding Window Rate Limiter
  const rateLimitCheck = checkWebhookRateLimit(clientIp);
  if (!rateLimitCheck.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: "Too many webhook requests from this client. Please slow down.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitCheck.retryAfterSeconds || 60),
        },
      }
    );
  }

  const isReconcile = request.headers.get("x-reconcile") === "true";

  // 2. Timing-Safe Secret Verification
  const authHeader =
    request.headers.get("x-integration-secret") ||
    request.headers.get("authorization");

  const secretResult = verifyWebhookSecret(authHeader, { isReconcile });

  if (!secretResult.valid) {
    if (secretResult.error === "WEBHOOK_CONFIGURATION_MISSING") {
      return NextResponse.json(
        {
          error: "CONFIGURATION_ERROR",
          message: "GOOGLE_FORMS_WEBHOOK_SECRET is not configured on server. Fail-closed safety active.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        error: "UNAUTHORIZED",
        message: "Invalid or missing integration secret.",
      },
      { status: 401 }
    );
  }

  // 3. Parse JSON Body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "MALFORMED_JSON",
        message: "Request body must be valid JSON.",
      },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "Payload must be a non-null object or array.",
      },
      { status: 400 }
    );
  }

  // 4. Batch Reconcile Mode vs Single Submission
  const rawObj = body as Record<string, unknown>;
  const isBatch = Array.isArray(body) || Array.isArray(rawObj.submissions);

  if (isBatch) {
    const rawList = Array.isArray(body)
      ? (body as GoogleFormsSubmissionPayload[])
      : (rawObj.submissions as GoogleFormsSubmissionPayload[]);

    if (!isReconcile) {
      // For batch, verify header timestamp if provided, otherwise require x-reconcile: true
      const headerTs = request.headers.get("x-submission-timestamp");
      if (headerTs) {
        const tsCheck = validateSubmissionTimestamp(headerTs);
        if (!tsCheck.valid) {
          return NextResponse.json(
            { error: "TIMESTAMP_OUT_OF_BOUNDS", message: tsCheck.error },
            { status: 400 }
          );
        }
      }
    }

    try {
      const batchResult = await processGoogleFormsBatch(rawList, {
        id: "GOOGLE_APPS_SCRIPT_BATCH",
        role: "ORGANIZER",
        ip: clientIp,
      });

      return NextResponse.json({
        success: true,
        mode: isReconcile ? "RECONCILE" : "BATCH",
        summary: {
          total: batchResult.total,
          created: batchResult.wouldInsert,
          alreadyProcessed: batchResult.alreadyProcessed,
          edited: batchResult.wouldEdit,
          flaggedConflicts: batchResult.wouldFlagConflict,
          rejected: batchResult.wouldReject,
        },
        results: batchResult.results,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Internal processing error";
      console.error("[GOOGLE_FORMS_WEBHOOK] Batch processing error:", errorMsg);
      return NextResponse.json(
        { error: "PROCESSING_FAILED", message: "Failed to process batch registrations." },
        { status: 500 }
      );
    }
  }

  // 5. Single Submission Handling
  // Validate request timestamp freshness (replay attack prevention)
  if (!isReconcile) {
    const rawRequestTs =
      request.headers.get("x-request-timestamp") ||
      request.headers.get("x-submission-timestamp") ||
      (rawObj.requestTimestamp ? String(rawObj.requestTimestamp) : undefined);

    const tsCheck = validateSubmissionTimestamp(rawRequestTs);
    if (!tsCheck.valid) {
      return NextResponse.json(
        {
          error: "TIMESTAMP_OUT_OF_BOUNDS",
          message: tsCheck.error || "Request timestamp is outside acceptable window.",
        },
        { status: 400 }
      );
    }
  }

  try {
    const outcome = await processGoogleFormsSubmission(body, {
      id: "GOOGLE_APPS_SCRIPT",
      role: "SYSTEM",
      ip: clientIp,
    });

    // Safe logging without PII or secrets
    console.log(
      `[GOOGLE_FORMS_WEBHOOK] Processed responseId: ${outcome.responseId} => action: ${outcome.action}`
    );

    if (outcome.action === "REJECTED") {
      return NextResponse.json(
        {
          error: "VALIDATION_FAILED",
          message: outcome.notes || "Submission failed validation.",
          responseId: outcome.responseId,
        },
        { status: 400 }
      );
    }

    const statusCode = outcome.action === "CREATED" ? 201 : 200;
    return NextResponse.json(
      {
        success: true,
        action: outcome.action,
        responseId: outcome.responseId,
        registrationId: outcome.registrationId,
        notes: outcome.notes,
      },
      { status: statusCode }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("[GOOGLE_FORMS_WEBHOOK] Submission error:", errorMsg);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "An internal database error occurred while processing registration.",
      },
      { status: 500 }
    );
  }
}

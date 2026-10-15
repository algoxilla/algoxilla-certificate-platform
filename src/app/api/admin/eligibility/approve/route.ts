// Algoxilla Certificate Platform - Organizer Eligibility Approval Route
// Strict Organizer Authentication via x-organizer-secret.
// Supports approving participant eligibility while preserving attendance confirmation boundaries.

import { NextResponse } from "next/server";
import { getCertificateRepository } from "@/lib/db/client";

export async function POST(request: Request) {
  try {
    const organizerSecretHeader = request.headers.get("x-organizer-secret");
    const configuredSecret = process.env.ORGANIZER_SECRET;

    if (!configuredSecret || organizerSecretHeader !== configuredSecret) {
      return NextResponse.json(
        { error: "Unauthorized. A valid organizer secret is required." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || (typeof body !== "object")) {
      return NextResponse.json(
        { error: "Invalid request payload. Expected JSON body." },
        { status: 400 }
      );
    }

    const { registrationId, eligibilityId, actorId, reviewNotes, attendanceConfirmed } = body;

    if (!registrationId && !eligibilityId) {
      return NextResponse.json(
        { error: "Must specify either registrationId or eligibilityId to approve." },
        { status: 400 }
      );
    }

    const repo = getCertificateRepository();
    const result = await repo.approveEligibility({
      registrationId,
      eligibilityId,
      actorId: typeof actorId === "string" && actorId.trim() ? actorId.trim() : "ORGANIZER",
      actorRole: "ORGANIZER",
      reviewNotes: typeof reviewNotes === "string" && reviewNotes.trim() ? reviewNotes.trim() : "Organizer approved eligibility",
      attendanceConfirmed: typeof attendanceConfirmed === "boolean" ? attendanceConfirmed : undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Participant eligibility approved successfully.",
      eligibility: result,
      issuanceGated: !result.attendanceConfirmed,
      issuanceBlockReason: !result.attendanceConfirmed
        ? "Attendance has not been confirmed. Certificate issuance remains blocked pending organizer attendance verification."
        : null,
    });
  } catch (error: unknown) {
    console.error("Organizer eligibility approval error:", error);
    const message = error instanceof Error ? error.message : "Internal server error during eligibility approval.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

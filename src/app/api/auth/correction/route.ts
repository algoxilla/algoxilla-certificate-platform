// Algoxilla Certificate Platform - Participant Name Correction Request Endpoint
// Route Handler: POST /api/auth/correction
// Accepts correction appeals from authenticated certificate holders and logs them for organizer review.

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getCertificateRepository } from "@/lib/db/client";

export async function POST(request: Request): Promise<NextResponse> {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required to submit a correction request." },
      { status: 401 }
    );
  }

  let body: {
    certificateId?: string;
    requestedName?: string;
    reason?: string;
    supportingEvidence?: string;
  };

  try {
    body = (await request.json()) as {
      certificateId?: string;
      requestedName?: string;
      reason?: string;
      supportingEvidence?: string;
    };
  } catch {
    return NextResponse.json(
      { error: "Invalid or malformed JSON request body." },
      { status: 400 }
    );
  }

  try {
    const certId = body?.certificateId?.trim();
    const reqName = body?.requestedName?.trim();
    const reason = body?.reason?.trim();

    if (!certId || !reqName || !reason) {
      return NextResponse.json(
        { error: "certificateId, requestedName, and reason are required." },
        { status: 400 }
      );
    }

    if (reqName.length < 3 || reqName.length > 100) {
      return NextResponse.json(
        { error: "Requested name must be between 3 and 100 characters." },
        { status: 400 }
      );
    }

    if (reason.length < 5 || reason.length > 500) {
      return NextResponse.json(
        { error: "Correction reason must be between 5 and 500 characters." },
        { status: 400 }
      );
    }

    const repo = getCertificateRepository();

    // Verify participant owns this certificate
    const portalData = await repo.getParticipantPortalData(session.email);
    if (!portalData || !portalData.certificate || portalData.certificate.id !== certId) {
      return NextResponse.json(
        { error: "Certificate ownership mismatch. You can only request corrections for your own certificate." },
        { status: 403 }
      );
    }

    const correction = await repo.submitCorrectionRequest({
      certificateId: certId,
      requestedName: reqName,
      reason,
      supportingEvidence: body.supportingEvidence?.trim(),
    });

    return NextResponse.json({
      success: true,
      message: "Correction request submitted successfully. Organizer review is pending.",
      correction,
    });
  } catch (err: unknown) {
    console.error("Error submitting correction request:", err);
    return NextResponse.json(
      { error: "Failed to submit correction request. Please retry." },
      { status: 500 }
    );
  }
}

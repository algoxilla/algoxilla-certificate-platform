// Algoxilla Certificate Platform - Session Status Endpoint
// Route Handler: GET /api/auth/session
// Validates caller's session cookie and returns authenticated participant and certificate data.

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getCertificateRepository, isProductionMode } from "@/lib/db/client";
import { findMockParticipantByEmail } from "@/lib/mockData";

export async function GET(request: Request): Promise<NextResponse> {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json(
      { authenticated: false },
      { status: 200 }
    );
  }

  try {
    const repo = getCertificateRepository();
    const portalData = await repo.getParticipantPortalData(session.email);

    if (!portalData || !portalData.participant) {
      if (!isProductionMode()) {
        const mock = findMockParticipantByEmail(session.email);
        if (mock) {
          return NextResponse.json({
            authenticated: true,
            participant: {
              id: mock.id,
              email: mock.email,
              fullName: mock.fullName,
              registrationStatus: "ACCEPTED",
              eligibilityStatus: mock.certificateStatus === "ISSUED" ? "ELIGIBLE" : "PENDING_ORGANIZER_APPROVAL",
              attendanceConfirmed: true,
            },
            certificate: mock.certificateId ? {
              id: mock.certificateId,
              certificateCode: mock.certificateId,
              recipientName: mock.fullName,
              certificateType: "PARTICIPATION",
              status: mock.certificateStatus,
              issuedAt: mock.issueDate || "4 October 2026",
              verificationHash: mock.verificationHash || "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
            } : null,
            correction: null,
          });
        }
      }

      return NextResponse.json(
        { authenticated: false, error: "Participant record not found." },
        { status: 200 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      participant: {
        id: portalData.participant.id,
        email: portalData.participant.email,
        fullName: portalData.participant.normalizedName,
        registrationStatus: portalData.registration.registrationStatus,
        eligibilityStatus: portalData.eligibility.eligibilityStatus,
        attendanceConfirmed: portalData.eligibility.attendanceConfirmed,
      },
      certificate: portalData.certificate ? {
        id: portalData.certificate.id,
        certificateCode: portalData.certificate.certificateCode,
        recipientName: portalData.certificate.recipientName,
        certificateType: portalData.certificate.certificateType,
        status: portalData.certificate.status,
        issuedAt: portalData.certificate.issuedAt,
        verificationHash: portalData.certificate.verificationHash,
      } : null,
      correction: portalData.correction ? {
        id: portalData.correction.id,
        requestedName: portalData.correction.requestedName,
        reason: portalData.correction.reason,
        status: portalData.correction.status,
      } : null,
    });
  } catch (err: unknown) {
    console.error("Session lookup error:", err);
    return NextResponse.json(
      { authenticated: false, error: "Database error during session lookup." },
      { status: 500 }
    );
  }
}

// Algoxilla Certificate Platform - Consume Claim Link Endpoint
// Route Handler: GET /api/auth/consume-claim-link
// Validates single-use claim tokens, enforces expiry, issues certificates, and sets HTTP-only session cookies.

import { NextResponse } from "next/server";
import { getCertificateRepository, isProductionMode } from "@/lib/db/client";
import { hashClaimToken, isTokenExpired } from "@/lib/auth/token";
import { createSignedSessionToken, serializeSessionCookie } from "@/lib/auth/session";
import { findMockParticipantByEmail } from "@/lib/mockData";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token")?.trim();

  const redirectError = (errorMsg: string, errorCode: string) => {
    const errorUrl = new URL("/portal", request.url);
    errorUrl.searchParams.set("error", errorCode);
    errorUrl.searchParams.set("message", errorMsg);
    return NextResponse.redirect(errorUrl);
  };

  if (!rawToken || rawToken.length < 32) {
    return redirectError("Invalid or missing claim token.", "TOKEN_INVALID");
  }

  try {
    const repo = getCertificateRepository();
    const tokenHash = hashClaimToken(rawToken);
    const tokenRecord = await repo.getClaimTokenByHash(tokenHash);

    if (!tokenRecord) {
      return redirectError("The verification link is invalid or has expired.", "TOKEN_NOT_FOUND");
    }

    if (tokenRecord.consumedAt) {
      return redirectError("This verification link has already been used. Please request a new link.", "TOKEN_ALREADY_USED");
    }

    if (tokenRecord.attempts >= tokenRecord.maxAttempts) {
      return redirectError("Maximum verification attempts exceeded. Please request a new link.", "TOKEN_ATTEMPTS_EXCEEDED");
    }

    if (isTokenExpired(tokenRecord.expiresAt)) {
      await repo.incrementTokenAttempts(tokenRecord.id);
      return redirectError("This verification link has expired (15-minute validity). Please request a new link.", "TOKEN_EXPIRED");
    }

    // Mark token as consumed immediately to prevent replay / concurrent reuse
    const wasConsumed = await repo.consumeClaimToken(tokenRecord.id);
    if (!wasConsumed) {
      return redirectError("This verification link has already been used. Please request a new link.", "TOKEN_ALREADY_USED");
    }

    // Fetch participant portal data
    const portalData = await repo.getParticipantPortalData(tokenRecord.email);
    let participantId = "";
    let email = tokenRecord.email;

    if (portalData && portalData.participant) {
      // Enforce eligibility safeguard
      if (
        portalData.eligibility.eligibilityStatus !== "ELIGIBLE" ||
        !portalData.eligibility.attendanceConfirmed
      ) {
        return redirectError("Your registration is pending organizer review or is not marked eligible for certificate issuance.", "INELIGIBLE");
      }
      participantId = portalData.participant.id;
      email = portalData.participant.email;

      // Atomically claim/generate certificate if not already generated
      if (!portalData.certificate) {
        await repo.claimCertificate({
          registrationId: portalData.registration.id,
          recipientName: portalData.participant.normalizedName,
          actorId: portalData.participant.id,
        });
      }
    } else if (!isProductionMode()) {
      const mock = findMockParticipantByEmail(tokenRecord.email);
      if (mock && mock.certificateStatus === "ISSUED") {
        participantId = mock.id;
        email = mock.email;
      } else {
        return redirectError("No participant registration was found for this email address.", "PARTICIPANT_NOT_FOUND");
      }
    } else {
      return redirectError("No participant registration was found for this email address.", "PARTICIPANT_NOT_FOUND");
    }

    // Create secure signed session token
    const sessionToken = createSignedSessionToken({
      participantId,
      email,
      role: "PARTICIPANT",
    });

    const cookieHeader = serializeSessionCookie(sessionToken);

    // Successful authentication: redirect to /portal with success indicator
    const successUrl = new URL("/portal", request.url);
    successUrl.searchParams.set("verified", "true");

    const response = NextResponse.redirect(successUrl);
    response.headers.set("Set-Cookie", cookieHeader);
    return response;
  } catch (error: unknown) {
    console.error("Error consuming claim link:", error);
    return redirectError("An unexpected server error occurred while verifying your link.", "INTERNAL_ERROR");
  }
}

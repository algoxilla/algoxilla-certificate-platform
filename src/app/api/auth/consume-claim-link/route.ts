// Algoxilla Certificate Platform - Consume Claim Link Endpoint
// Route Handlers:
//   GET  /api/auth/consume-claim-link -> Safe, read-only validation. Redirects to /portal/claim without burning the token.
//   POST /api/auth/consume-claim-link -> Atomic token consumption, eligibility validation, and session issuance.
// Architectural Safety:
//   Email security scanners (Google Workspace, Microsoft Defender, Apple Mail Privacy) and browser prefetchers
//   issue automated GET requests to links in emails. By strictly requiring POST for state-changing token consumption,
//   automated crawlers can never prematurely burn or invalidate single-use claim tokens.

import { NextResponse } from "next/server";
import { getCertificateRepository, isProductionMode } from "@/lib/db/client";
import { hashClaimToken, isTokenExpired } from "@/lib/auth/token";
import { createSignedSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { findMockParticipantByEmail } from "@/lib/mockData";
import { getPublicAppUrl } from "@/lib/config";

function isJsonRequest(request: Request): boolean {
  const accept = request.headers.get("accept") || "";
  const contentType = request.headers.get("content-type") || "";
  return accept.includes("application/json") || contentType.includes("application/json");
}

/**
 * Safe, read-only GET handler.
 * Validates the token and redirects the user to the interactive claim confirmation page (/portal/claim).
 * Strictly does NOT consume or mutate the token.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token")?.trim();
  const baseUrl = getPublicAppUrl();
  const wantsJson = isJsonRequest(request);

  const redirectError = (errorMsg: string, errorCode: string) => {
    if (wantsJson) {
      return NextResponse.json({ error: errorMsg, code: errorCode }, { status: 400 });
    }
    const errorUrl = new URL("/portal", baseUrl);
    errorUrl.searchParams.set("error", errorCode);
    errorUrl.searchParams.set("message", errorMsg);
    return NextResponse.redirect(errorUrl, { status: 307 });
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

    if (isTokenExpired(tokenRecord.expiresAt)) {
      return redirectError("This verification link has expired (15-minute validity). Please request a new link.", "TOKEN_EXPIRED");
    }

    // If client requested JSON metadata (e.g. claim page pre-flight validation):
    if (wantsJson) {
      const portalData = await repo.getParticipantPortalData(tokenRecord.email);
      let recipientName = tokenRecord.email;
      if (portalData?.participant?.normalizedName) {
        recipientName = portalData.participant.normalizedName;
      } else if (!isProductionMode()) {
        const mock = findMockParticipantByEmail(tokenRecord.email);
        if (mock) recipientName = mock.fullName;
      }

      return NextResponse.json({
        valid: true,
        email: tokenRecord.email,
        recipientName,
        expiresAt: tokenRecord.expiresAt,
      }, { status: 200 });
    }

    // Default browser / scanner GET request: Redirect to interactive claim confirmation page WITHOUT consuming token
    const claimPageUrl = new URL("/portal/claim", baseUrl);
    claimPageUrl.searchParams.set("token", rawToken);
    return NextResponse.redirect(claimPageUrl, { status: 307 });
  } catch (error: unknown) {
    console.error("Error validating claim link (GET):", error);
    return redirectError("An unexpected server error occurred while verifying your link.", "INTERNAL_ERROR");
  }
}

/**
 * State-changing POST handler.
 * Atomically consumes the single-use token, validates eligibility, and establishes the authenticated session cookie.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const baseUrl = getPublicAppUrl();
  const wantsJson = isJsonRequest(request);

  // Extract rawToken from JSON body, form data, or URL query parameter
  let rawToken = url.searchParams.get("token")?.trim() || "";

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const json = await request.json();
      if (json && typeof json.token === "string") {
        rawToken = json.token.trim();
      }
    } catch {
      // ignore json parse error, fall back to query token
    }
  } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const formToken = formData.get("token");
      if (typeof formToken === "string") {
        rawToken = formToken.trim();
      }
    } catch {
      // ignore form parse error, fall back to query token
    }
  }

  const handleFailure = (errorMsg: string, errorCode: string, status = 400) => {
    if (wantsJson) {
      return NextResponse.json({ error: errorMsg, code: errorCode }, { status });
    }
    const errorUrl = new URL("/portal", baseUrl);
    errorUrl.searchParams.set("error", errorCode);
    errorUrl.searchParams.set("message", errorMsg);
    return NextResponse.redirect(errorUrl, { status: 303 });
  };

  if (!rawToken || rawToken.length < 32) {
    return handleFailure("Invalid or missing claim token.", "TOKEN_INVALID", 400);
  }

  try {
    const repo = getCertificateRepository();
    const tokenHash = hashClaimToken(rawToken);
    const tokenRecord = await repo.getClaimTokenByHash(tokenHash);

    if (!tokenRecord) {
      return handleFailure("The verification link is invalid or has expired.", "TOKEN_NOT_FOUND", 404);
    }

    if (tokenRecord.consumedAt) {
      return handleFailure("This verification link has already been used. Please request a new link.", "TOKEN_ALREADY_USED", 409);
    }

    if (tokenRecord.attempts >= tokenRecord.maxAttempts) {
      return handleFailure("Maximum verification attempts exceeded. Please request a new link.", "TOKEN_ATTEMPTS_EXCEEDED", 429);
    }

    if (isTokenExpired(tokenRecord.expiresAt)) {
      await repo.incrementTokenAttempts(tokenRecord.id);
      return handleFailure("This verification link has expired (15-minute validity). Please request a new link.", "TOKEN_EXPIRED", 410);
    }

    // Atomically consume token immediately to prevent race conditions or concurrent reuse
    const wasConsumed = await repo.consumeClaimToken(tokenRecord.id);
    if (!wasConsumed) {
      return handleFailure("This verification link has already been used. Please request a new link.", "TOKEN_ALREADY_USED", 409);
    }

    // Fetch participant portal data and enforce eligibility safeguards
    const portalData = await repo.getParticipantPortalData(tokenRecord.email);
    let participantId = "";
    let email = tokenRecord.email;

    if (portalData && portalData.participant) {
      // Enforce strict eligibility and attendance safeguards
      if (
        portalData.eligibility.eligibilityStatus !== "ELIGIBLE" ||
        !portalData.eligibility.attendanceConfirmed
      ) {
        return handleFailure(
          "Your registration is pending organizer review or is not marked eligible for certificate issuance.",
          "INELIGIBLE",
          403
        );
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
        return handleFailure("No participant registration was found for this email address.", "PARTICIPANT_NOT_FOUND", 404);
      }
    } else {
      return handleFailure("No participant registration was found for this email address.", "PARTICIPANT_NOT_FOUND", 404);
    }

    // Create secure signed session token
    const sessionToken = createSignedSessionToken({
      participantId,
      email,
      role: "PARTICIPANT",
    });

    const isProd = isProductionMode();
    const successRedirectUrl = `${baseUrl}/portal?verified=true`;

    let response: NextResponse;
    if (wantsJson) {
      response = NextResponse.json({
        success: true,
        redirectUrl: successRedirectUrl,
        participant: {
          id: participantId,
          email,
          fullName: portalData?.participant?.normalizedName || email,
        },
      });
    } else {
      // 303 See Other is the HTTP standard for redirecting after a successful POST
      response = NextResponse.redirect(successRedirectUrl, { status: 303 });
    }

    // Establish authenticated HTTP-only session cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      path: "/",
      maxAge: 7200,
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
    });

    return response;
  } catch (error: unknown) {
    console.error("Error consuming claim link (POST):", error);
    return handleFailure("An unexpected server error occurred while verifying your link.", "INTERNAL_ERROR", 500);
  }
}

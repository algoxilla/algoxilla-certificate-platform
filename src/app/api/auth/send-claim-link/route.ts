// Algoxilla Certificate Platform - Send Claim Link Endpoint
// Route Handler: POST /api/auth/send-claim-link
// Generates secure single-use claim tokens, enforces rate limits, and dispatches Brevo emails.
// Privacy Protection: Returns generic success response to prevent email enumeration.

import { NextResponse } from "next/server";
import { getCertificateRepository, isProductionMode } from "@/lib/db/client";
import { generateRawClaimToken, hashClaimToken, calculateTokenExpiry } from "@/lib/auth/token";
import { checkClaimRateLimit } from "@/lib/auth/rateLimit";
import { brevoService } from "@/lib/email/brevo";
import { getAppBaseUrl } from "@/lib/config";
import { findMockParticipantByEmail } from "@/lib/mockData";

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { email?: string };
    const rawEmail = body.email?.trim() || "";

    if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
      return NextResponse.json(
        { error: "Please provide a valid participant email address." },
        { status: 400 }
      );
    }

    const email = rawEmail.toLowerCase();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";

    // 1. Rate Limiting Check
    const rateCheck = checkClaimRateLimit(ip, email);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.reason || "Rate limit exceeded. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": (rateCheck.retryAfterSeconds || 60).toString(),
          },
        }
      );
    }

    // Generic response message to protect against user enumeration
    const genericResponse = {
      success: true,
      message: "If this email address is registered and eligible for an Algothon’26 certificate, a secure claim link has been dispatched to your inbox.",
      expiresInMinutes: 15,
    };

    // 2. Query Repository
    const repo = getCertificateRepository();
    const portalData = await repo.getParticipantPortalData(email);

    let recipientName = "";
    if (portalData && portalData.participant) {
      if (
        portalData.eligibility.eligibilityStatus !== "ELIGIBLE" ||
        !portalData.eligibility.attendanceConfirmed
      ) {
        // Ineligible or pending: do not generate a certificate token
        return NextResponse.json(genericResponse, { status: 200 });
      }
      recipientName = portalData.participant.normalizedName;
    } else if (!isProductionMode()) {
      // Dev / testing fallback for synthetic demo participants
      const mock = findMockParticipantByEmail(email);
      if (mock && mock.certificateStatus === "ISSUED") {
        recipientName = mock.fullName;
      } else {
        return NextResponse.json(genericResponse, { status: 200 });
      }
    } else {
      return NextResponse.json(genericResponse, { status: 200 });
    }

    // 3. Generate Secure Claim Token
    const rawToken = generateRawClaimToken();
    const tokenHash = hashClaimToken(rawToken);
    const expiresAt = calculateTokenExpiry(15); // 15 mins

    // Store in Database
    await repo.createClaimToken({
      email,
      tokenHash,
      expiresAt,
      tokenType: "CLAIM_LINK",
      ipAddress: ip,
    });

    // 4. Construct Secure Claim URL
    const baseUrl = getAppBaseUrl(false);
    const claimUrl = `${baseUrl}/api/auth/consume-claim-link?token=${encodeURIComponent(rawToken)}`;

    // 5. Dispatch via Brevo
    await brevoService.sendClaimLink({
      toEmail: email,
      recipientName,
      claimUrl,
      expiresMinutes: 15,
    });

    return NextResponse.json(genericResponse, { status: 200 });
  } catch (error: unknown) {
    console.error("Error processing send-claim-link request:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while processing your request. Please try again." },
      { status: 500 }
    );
  }
}

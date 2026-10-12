// Algoxilla Certificate Platform - Authenticated Session Management
// Stateless, tamper-resistant HMAC-signed session cookies (HttpOnly, Secure, SameSite=Lax).

import crypto from "node:crypto";

export interface SessionPayload {
  participantId: string;
  email: string;
  role: "PARTICIPANT" | "ORGANIZER";
  iat: number;
  exp: number;
}

export const SESSION_COOKIE_NAME = "algo_claim_session";
const SESSION_DURATION_SECONDS = 7200; // 2 hours

function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    "algoxilla_auth_session_fallback_secret_key_at_least_32bytes_long"
  );
}

/**
 * Creates a signed session token string: `${base64Payload}.${hmacSignature}`
 */
export function createSignedSessionToken(payload: Omit<SessionPayload, "iat" | "exp">): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const secret = getAuthSecret();
  const signature = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Validates the HMAC signature and expiration of a session token.
 * Returns null if missing, tampered, or expired.
 */
export function verifySessionToken(rawToken: string | null | undefined): SessionPayload | null {
  if (!rawToken || typeof rawToken !== "string") return null;

  const parts = rawToken.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const secret = getAuthSecret();
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadJson) as SessionPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null; // Expired session
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Generates the Set-Cookie string for establishing an authenticated session.
 */
export function serializeSessionCookie(token: string): string {
  const isProd = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_APP_LIVE === "true";
  const secureFlag = isProd ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_DURATION_SECONDS}; HttpOnly; SameSite=Lax${secureFlag}`;
}

/**
 * Generates the Set-Cookie string for clearing/logging out a session.
 */
export function serializeLogoutCookie(): string {
  const isProd = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_APP_LIVE === "true";
  const secureFlag = isProd ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag}`;
}

/**
 * Helper to extract and verify session from an incoming HTTP Request.
 */
export function getSessionFromRequest(request: Request): SessionPayload | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  return verifySessionToken(match[1]);
}

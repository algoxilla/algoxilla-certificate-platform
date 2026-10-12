// Algoxilla Certificate Platform - Cryptographic Claim Token Utilities
// Enforces single-use, HMAC-protected tokens with strict 15-minute expiry.

import crypto from "node:crypto";

function getTokenSecret(): string {
  return (
    process.env.CLAIM_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    "algoxilla_dev_claim_token_secret_32bytes_min_fallback_key"
  );
}

/**
 * Generates an unguessable 256-bit cryptographically secure random token (64 hex characters).
 */
export function generateRawClaimToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Derives a keyed HMAC-SHA256 representation of the raw token for safe database storage.
 * The raw token is NEVER stored in plaintext in the database or server logs.
 */
export function hashClaimToken(rawToken: string): string {
  const secret = getTokenSecret();
  return crypto.createHmac("sha256", secret).update(rawToken.trim()).digest("hex");
}

/**
 * Verifies a raw token against a stored HMAC hash using constant-time comparison.
 */
export function verifyClaimToken(rawToken: string, storedHash: string): boolean {
  try {
    const computedHash = hashClaimToken(rawToken);
    const a = Buffer.from(computedHash, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Returns an ISO timestamp for token expiration (default: 15 minutes).
 */
export function calculateTokenExpiry(minutes = 15): string {
  const date = new Date(Date.now() + minutes * 60 * 1000);
  return date.toISOString();
}

/**
 * Checks if an ISO timestamp has passed.
 */
export function isTokenExpired(expiresAtIso: string): boolean {
  const expiryTime = new Date(expiresAtIso).getTime();
  return Date.now() > expiryTime;
}

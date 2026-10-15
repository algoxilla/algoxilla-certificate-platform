// Algoxilla Certificate Platform - Sliding Window Rate Limiter
// Protects claim endpoints from brute force and resource exhaustion without external Redis dependencies.

interface RateLimitEntry {
  timestamps: number[];
}

const ipMap = new Map<string, RateLimitEntry>();
const emailMap = new Map<string, RateLimitEntry>();
const downloadMap = new Map<string, RateLimitEntry>();
const webhookMap = new Map<string, RateLimitEntry>();

// Maximum limits
const IP_CLAIM_LIMIT = 5; // 5 claim requests
const IP_CLAIM_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes

const EMAIL_CLAIM_LIMIT = 3; // 3 claim requests
const EMAIL_CLAIM_WINDOW_MS = 15 * 60 * 1000; // per 15 minutes

const IP_DOWNLOAD_LIMIT = 10; // 10 PDF downloads
const IP_DOWNLOAD_WINDOW_MS = 60 * 1000; // per minute

const WEBHOOK_LIMIT = 60; // 60 webhook submissions
const WEBHOOK_WINDOW_MS = 60 * 1000; // per 1 minute

function checkSlidingWindow(
  map: Map<string, RateLimitEntry>,
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = map.get(key) || { timestamps: [] };

  // Filter out timestamps outside the active window
  const activeTimestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (activeTimestamps.length >= limit) {
    const oldest = activeTimestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  activeTimestamps.push(now);
  map.set(key, { timestamps: activeTimestamps });

  // Cleanup: prevent unbounded memory growth
  if (map.size > 5000) {
    for (const [k, v] of map.entries()) {
      if (v.timestamps.every((ts) => now - ts >= windowMs)) {
        map.delete(k);
      }
    }
  }

  return { allowed: true };
}

/**
 * Checks rate limits for sending claim links by IP and Email.
 */
export function checkClaimRateLimit(
  ip: string,
  email: string
): { allowed: boolean; retryAfterSeconds?: number; reason?: string } {
  const ipCheck = checkSlidingWindow(ipMap, ip || "unknown_ip", IP_CLAIM_LIMIT, IP_CLAIM_WINDOW_MS);
  if (!ipCheck.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: ipCheck.retryAfterSeconds,
      reason: `Too many requests from this IP. Please wait ${ipCheck.retryAfterSeconds} seconds.`,
    };
  }

  const emailCheck = checkSlidingWindow(emailMap, email.toLowerCase().trim(), EMAIL_CLAIM_LIMIT, EMAIL_CLAIM_WINDOW_MS);
  if (!emailCheck.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: emailCheck.retryAfterSeconds,
      reason: `Too many claim links requested for this email. Please wait ${emailCheck.retryAfterSeconds} seconds.`,
    };
  }

  return { allowed: true };
}

/**
 * Checks rate limits for downloading official PDFs by IP.
 */
export function checkDownloadRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  return checkSlidingWindow(downloadMap, ip || "unknown_ip", IP_DOWNLOAD_LIMIT, IP_DOWNLOAD_WINDOW_MS);
}

/**
 * Checks rate limits for incoming Google Forms webhook submissions by IP.
 */
export function checkWebhookRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  return checkSlidingWindow(webhookMap, ip || "unknown_ip", WEBHOOK_LIMIT, WEBHOOK_WINDOW_MS);
}

/**
 * Clears in-memory rate limit maps (used for test environments).
 */
export function resetRateLimitsForTesting(): void {
  ipMap.clear();
  emailMap.clear();
  downloadMap.clear();
  webhookMap.clear();
}

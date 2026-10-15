// Algoxilla Certificate Platform - Environment & Configuration Helper
// Supports environment-based canonical URLs, configurable public verification base URLs,
// and safe fallbacks without assuming unverified DNS hostnames.

export function canonicalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  // Canonicalize ephemeral Vercel preview deployment hashes for this project to stable canonical production URL
  if (/^https:\/\/algoxilla-certificate-platform-1-[a-z0-9]+(-[a-z0-9]+)?\.vercel\.app$/i.test(trimmed)) {
    return "https://algoxilla-certificate-platform-1.vercel.app";
  }
  // Canonicalize legacy or unverified verify.algoxilla.com (which lacks DNS records) to active production URL
  if (/^https?:\/\/verify\.algoxilla\.com$/i.test(trimmed)) {
    return "https://algoxilla-certificate-platform-1.vercel.app";
  }
  return trimmed;
}

export function getAppBaseUrl(preferPublicDomain = false): string {
  // 1. Explicit verification URL configuration takes highest precedence for QR codes
  if (process.env.NEXT_PUBLIC_VERIFY_BASE_URL) {
    return canonicalizeUrl(process.env.NEXT_PUBLIC_VERIFY_BASE_URL);
  }

  // 2. Configured public application URL (e.g. staging or production origin)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return canonicalizeUrl(process.env.NEXT_PUBLIC_APP_URL);
  }

  // 3. Browser-side runtime window origin (if executed on client)
  if (!preferPublicDomain && typeof window !== "undefined" && window.location.origin) {
    return canonicalizeUrl(window.location.origin);
  }

  // 4. Default public canonical domain when preferPublicDomain is true
  if (preferPublicDomain) {
    return "https://algoxilla-certificate-platform-1.vercel.app";
  }

  // 5. Safe local development / staging fallback
  return "http://localhost:3000";
}

export function isLocalDevUrl(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0");
}

export function getVerificationUrl(
  certificateId: string, 
  preferPublicDomain = false,
  customBaseUrl?: string
): string {
  const base = customBaseUrl ? canonicalizeUrl(customBaseUrl) : getAppBaseUrl(preferPublicDomain);
  return `${base}/verify/${encodeURIComponent(certificateId)}`;
}

/**
 * Server-only live production guard switch.
 * Evaluates whether the application is running in live production mode.
 * Defaults strictly to false unless APP_LIVE is explicitly 'true'.
 * Backwards-compatible with legacy NEXT_PUBLIC_APP_LIVE if APP_LIVE is not defined.
 */
export function isAppLive(): boolean {
  if (process.env.APP_LIVE !== undefined) {
    return process.env.APP_LIVE === "true";
  }
  return process.env.NEXT_PUBLIC_APP_LIVE === "true";
}


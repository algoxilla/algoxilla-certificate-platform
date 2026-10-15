// Algoxilla Certificate Platform - Environment & Configuration Helper
// Supports environment-based canonical URLs, configurable public verification base URLs,
// and safe fallbacks without assuming unverified DNS hostnames.

export function canonicalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  // Canonicalize any ephemeral Vercel deployment hashes or preview aliases for this platform to stable canonical production URL
  if (/^https:\/\/(?:www\.)?algoxilla-certificate-platform(?:-[a-z0-9]+)*\.vercel\.app$/i.test(trimmed)) {
    return "https://algoxilla-certificate-platform-1.vercel.app";
  }
  // Canonicalize legacy or unverified verify.algoxilla.com (which lacks DNS records) to active production URL
  if (/^https?:\/\/verify\.algoxilla\.com$/i.test(trimmed)) {
    return "https://algoxilla-certificate-platform-1.vercel.app";
  }
  return trimmed;
}

/**
 * Server and client production environment detector.
 */
export function isProductionEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.APP_LIVE === "true" ||
    process.env.NEXT_PUBLIC_APP_LIVE === "true"
  );
}

/**
 * Returns the public application base URL for application routes, claim links, and auth redirects.
 * Strictly decoupled from NEXT_PUBLIC_VERIFY_BASE_URL (which is reserved for public QR code verification).
 */
export function getPublicAppUrl(): string {
  // 1. Configured public application URL (e.g. staging or production origin)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return canonicalizeUrl(process.env.NEXT_PUBLIC_APP_URL);
  }

  // 2. Browser-side runtime window origin (if executed on client)
  if (typeof window !== "undefined" && window.location.origin) {
    return canonicalizeUrl(window.location.origin);
  }

  // 3. Fallback to canonical production URL in production mode
  if (isProductionEnvironment()) {
    return "https://algoxilla-certificate-platform-1.vercel.app";
  }

  // 4. Safe local development fallback
  return "http://localhost:3000";
}

export function getAppBaseUrl(preferPublicDomain = false): string {
  // If public domain is preferred (e.g. for QR codes / verification links):
  if (preferPublicDomain) {
    if (process.env.NEXT_PUBLIC_VERIFY_BASE_URL) {
      return canonicalizeUrl(process.env.NEXT_PUBLIC_VERIFY_BASE_URL);
    }
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return canonicalizeUrl(process.env.NEXT_PUBLIC_APP_URL);
    }
    return "https://algoxilla-certificate-platform-1.vercel.app";
  }

  // Application routes default to public application base URL
  return getPublicAppUrl();
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


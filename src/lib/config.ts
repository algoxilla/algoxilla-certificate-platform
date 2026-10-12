// Algoxilla Certificate Platform - Environment & Configuration Helper
// Supports environment-based canonical URLs, configurable public verification base URLs,
// and safe fallbacks without assuming unverified DNS hostnames.

export function getAppBaseUrl(preferPublicDomain = false): string {
  // 1. Explicit verification URL configuration takes highest precedence for QR codes
  if (process.env.NEXT_PUBLIC_VERIFY_BASE_URL) {
    return process.env.NEXT_PUBLIC_VERIFY_BASE_URL.replace(/\/+$/, "");
  }

  // 2. Configured public application URL (e.g. staging or production origin)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }

  // 3. Browser-side runtime window origin (if executed on client)
  if (!preferPublicDomain && typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }

  // 4. Default public canonical domain when preferPublicDomain is true
  if (preferPublicDomain) {
    return "https://verify.algoxilla.com";
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
  const base = customBaseUrl ? customBaseUrl.replace(/\/+$/, "") : getAppBaseUrl(preferPublicDomain);
  return `${base}/verify/${encodeURIComponent(certificateId)}`;
}

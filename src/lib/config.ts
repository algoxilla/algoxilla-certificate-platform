// Algoxilla Certificate Platform - Environment & Configuration Helper
// Phase 1: Environment-based URLs ensuring no hardcoded domains are used.

export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

export function getVerificationUrl(certificateId: string): string {
  const base = getAppBaseUrl();
  return `${base}/verify/${encodeURIComponent(certificateId)}`;
}

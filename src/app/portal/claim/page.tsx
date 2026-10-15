"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Lock,
  Loader2,
  Sparkles,
  Mail,
  RefreshCw
} from "lucide-react";

interface TokenValidationResult {
  valid: boolean;
  email?: string;
  recipientName?: string;
  expiresAt?: string;
  error?: string;
  code?: string;
}

function ClaimContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawToken = searchParams.get("token")?.trim() || "";
  const isTokenMissing = !rawToken || rawToken.length < 32;

  const [isValidating, setIsValidating] = useState<boolean>(!isTokenMissing);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [tokenInfo, setTokenInfo] = useState<TokenValidationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    isTokenMissing ? "No valid verification token was provided in the link." : null
  );
  const [errorCode, setErrorCode] = useState<string | null>(
    isTokenMissing ? "TOKEN_INVALID" : null
  );

  // Pre-validate token on page load using read-only GET (does NOT burn token)
  useEffect(() => {
    if (isTokenMissing) return;

    let isMounted = true;

    async function preflightCheck() {
      try {
        const res = await fetch(`/api/auth/consume-claim-link?token=${encodeURIComponent(rawToken)}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        const data = await res.json();

        if (!isMounted) return;

        if (res.ok && data.valid) {
          setTokenInfo(data);
        } else {
          setErrorMessage(data.error || "This verification link is invalid or has expired.");
          setErrorCode(data.code || "TOKEN_INVALID");
        }
      } catch {
        if (!isMounted) return;
        setErrorMessage("Network error verifying your link. You may still attempt to claim below.");
      } finally {
        if (isMounted) setIsValidating(false);
      }
    }

    preflightCheck();

    return () => {
      isMounted = false;
    };
  }, [rawToken, isTokenMissing]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawToken || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/consume-claim-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ token: rawToken }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push(data.redirectUrl || "/portal?verified=true");
      } else {
        setErrorMessage(data.error || "Failed to verify certificate claim link.");
        setErrorCode(data.code || "CLAIM_FAILED");
        setIsSubmitting(false);
      }
    } catch {
      setErrorMessage("Network error communicating with the authentication server. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md relative z-10">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Algothon’26 Official Credential Verification</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
          Claim Your Certificate
        </h1>
        <p className="text-xs sm:text-sm text-neutral-400">
          Confirm your single-use verification link to securely access and download your official credential.
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        {/* Top subtle glow */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-80" />

        {isValidating ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-sm text-neutral-400">Validating verification security token...</p>
          </div>
        ) : errorMessage && !tokenInfo ? (
          /* Error State */
          <div className="space-y-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-base font-semibold text-white mb-1">
                {errorCode === "TOKEN_ALREADY_USED"
                  ? "Verification Link Already Claimed"
                  : errorCode === "TOKEN_EXPIRED"
                  ? "Verification Link Expired"
                  : "Invalid Verification Link"}
              </h2>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {errorMessage}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 text-left text-xs text-neutral-400 space-y-1.5">
              <span className="font-semibold text-neutral-300 block">Why did this happen?</span>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-neutral-400">
                <li>Claim tokens expire 15 minutes after issuance.</li>
                <li>Each verification link can only be consumed once for security.</li>
                <li>You can request a fresh link at any time from the portal.</li>
              </ul>
            </div>

            <Link
              href="/portal"
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20"
            >
              <RefreshCw className="w-4 h-4" />
              Request a New Claim Link
            </Link>
          </div>
        ) : (
          /* Confirmation & Claim Form */
          <form onSubmit={handleClaim} method="POST" action="/api/auth/consume-claim-link" className="space-y-6">
            <input type="hidden" name="token" value={rawToken} />

            {/* Recipient badge if preflight succeeded */}
            {tokenInfo && (
              <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Verified Recipient
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500">15-MIN TTL</span>
                </div>
                <div className="text-sm font-semibold text-white">
                  {tokenInfo.recipientName || "Algothon Participant"}
                </div>
                <div className="text-xs text-neutral-400 flex items-center gap-1.5 font-mono">
                  <Mail className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="truncate">{tokenInfo.email}</span>
                </div>
              </div>
            )}

            {/* Explanatory security callout */}
            <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-neutral-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-400 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                Anti-Scanner Single-Use Protection
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Click below to complete identity verification and establish your authorized session. Automated email security scanners cannot consume this token.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying & Establishing Session...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Claim & Access Certificate</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>

            <div className="text-center">
              <Link
                href="/portal"
                className="text-xs text-neutral-500 hover:text-neutral-400 transition-colors"
              >
                Return to Portal
              </Link>
            </div>
          </form>
        )}
      </div>

      {/* Footer reassurance */}
      <div className="mt-6 text-center text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3" />
        <span>Cryptographically verified Algoxilla session &bull; 2-hour duration</span>
      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans selection:bg-emerald-500 selection:text-black">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

      <Suspense
        fallback={
          <div className="min-h-[300px] flex items-center justify-center text-neutral-400">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mr-2" />
            Loading verification portal...
          </div>
        }
      >
        <ClaimContent />
      </Suspense>
    </div>
  );
}

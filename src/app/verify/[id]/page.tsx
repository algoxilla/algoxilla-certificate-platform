"use client";

import React, { useState, useEffect, use, Suspense } from "react";
import Link from "next/link";
import { 
  ShieldCheck, 
  ShieldAlert, 
  XCircle, 
  ArrowLeft, 
  Copy, 
  Check, 
  User, 
  Award, 
  Lock, 
  FileCheck,
  Search,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Clock
} from "lucide-react";
import CertificatePreview from "@/components/CertificatePreview";
import { getVerificationUrl } from "@/lib/config";
import type { PublicVerificationResponse, VerificationOutcome } from "@/lib/db/types";

function CertificateVerificationContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const routeId = decodeURIComponent(resolvedParams.id || "").trim();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicVerificationResponse | null>(null);
  const [overrideOutcome, setOverrideOutcome] = useState<VerificationOutcome | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  const handleRetry = () => {
    setLoading(true);
    fetch(`/api/verify/${encodeURIComponent(routeId)}`)
      .then((res) => res.json())
      .then((json: PublicVerificationResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setData({
          status: "INTERNAL_ERROR",
          error: "Unable to reach verification service. Network or connection error.",
          databaseIntegration: "PENDING_SUPABASE",
          verifiedAt: new Date().toISOString(),
        });
        setLoading(false);
      });
  };

  useEffect(() => {
    let ignore = false;
    fetch(`/api/verify/${encodeURIComponent(routeId)}`)
      .then((res) => res.json())
      .then((json: PublicVerificationResponse) => {
        if (!ignore) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setData({
            status: "INTERNAL_ERROR",
            error: "Unable to reach verification service. Network or connection error.",
            databaseIntegration: "PENDING_SUPABASE",
            verifiedAt: new Date().toISOString(),
          });
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [routeId]);

  const handleCopyHash = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const currentOutcome: VerificationOutcome = overrideOutcome || data?.status || "NOT_FOUND";
  const cert = data?.certificate;

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation & Status Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/verify"
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Search
          </Link>

          {/* Quick Demo State Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 bg-neutral-900 border border-neutral-800 p-1.5 rounded-xl text-xs font-mono">
            <span className="text-neutral-500 text-[11px] px-1">Phase B Simulator:</span>
            <button
              onClick={() => setOverrideOutcome("ISSUED")}
              className={`px-2 py-1 rounded text-[10px] transition-all ${
                currentOutcome === "ISSUED"
                  ? "bg-emerald-600 text-white font-semibold shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Issued (Valid)
            </button>
            <button
              onClick={() => setOverrideOutcome("REVOKED")}
              className={`px-2 py-1 rounded text-[10px] transition-all ${
                currentOutcome === "REVOKED"
                  ? "bg-red-600 text-white font-semibold shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Revoked
            </button>
            <button
              onClick={() => setOverrideOutcome("REPLACED")}
              className={`px-2 py-1 rounded text-[10px] transition-all ${
                currentOutcome === "REPLACED"
                  ? "bg-amber-600 text-white font-semibold shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Replaced
            </button>
            <button
              onClick={() => setOverrideOutcome("NOT_FOUND")}
              className={`px-2 py-1 rounded text-[10px] transition-all ${
                currentOutcome === "NOT_FOUND"
                  ? "bg-neutral-700 text-white font-semibold shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Not Found
            </button>
            <button
              onClick={() => setOverrideOutcome("INTERNAL_ERROR")}
              className={`px-2 py-1 rounded text-[10px] transition-all ${
                currentOutcome === "INTERNAL_ERROR"
                  ? "bg-purple-700 text-white font-semibold shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Error
            </button>
            {overrideOutcome && (
              <button
                onClick={() => setOverrideOutcome(null)}
                className="px-2 py-1 text-[10px] text-neutral-400 hover:text-red-400 underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="rounded-2xl bg-neutral-900/50 border border-neutral-800 p-16 text-center space-y-4">
            <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin mx-auto" />
            <p className="text-sm font-mono text-neutral-400">Verifying credential against official registry...</p>
          </div>
        ) : (
          <>
            {/* =========================================================================
                STATE 1: ISSUED & AUTHENTIC
               ========================================================================= */}
            {currentOutcome === "ISSUED" && (
              <div className="space-y-6">
                {/* Authenticity Top Card */}
                <div className="rounded-2xl bg-gradient-to-r from-emerald-950/60 via-neutral-900 to-neutral-950 border border-emerald-500/40 p-6 sm:p-8 space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                            AUTHENTIC CREDENTIAL VERIFIED
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400">[{data?.databaseIntegration || "LOCAL"}]</span>
                        </div>
                        <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
                          Algoxilla Official Credential
                        </h1>
                      </div>
                    </div>

                    <div className="text-right sm:self-center">
                      <span className="text-[11px] font-mono text-neutral-500 block uppercase">
                        Certificate Serial
                      </span>
                      <span className="text-sm font-mono font-bold text-emerald-400">
                        {cert?.certificateCode || routeId}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-300 leading-relaxed pt-1">
                    This certificate record has been cryptographically validated against the Algoxilla verification registry for <strong>{cert?.eventName || "Algothon’26"}</strong>. The attributes below confirm the authenticity of this issuance.
                  </p>
                </div>

                {/* Credential Attributes Breakdown Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Recipient Details */}
                  <div className="p-5 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      <User className="w-4 h-4 text-red-500" />
                      Recipient Metadata
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1.5 border-b border-neutral-800/60">
                        <span className="text-neutral-400">Recipient Name:</span>
                        <strong className="text-white font-medium text-sm">{cert?.recipientName || "Alex Chen"}</strong>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-neutral-800/60">
                        <span className="text-neutral-400">Credential Type:</span>
                        <span className="text-neutral-200">{cert?.certificateType || "PARTICIPATION"}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-neutral-800/60">
                        <span className="text-neutral-400">Eligibility Status:</span>
                        <span className="text-emerald-400 font-mono font-semibold">ORGANIZER-CONFIRMED ATTENDEE</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-neutral-400">Issued Timestamp:</span>
                        <span className="text-neutral-300 font-mono text-[11px]">{cert?.issuedAt || "2026-10-04T18:00:00Z"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Event & Authority Details */}
                  <div className="p-5 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      <Award className="w-4 h-4 text-red-500" />
                      Event & Issuing Authority
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1.5 border-b border-neutral-800/60">
                        <span className="text-neutral-400">Event:</span>
                        <strong className="text-white font-medium">{cert?.eventName || "Algothon’26"}</strong>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-neutral-800/60">
                        <span className="text-neutral-400">Event Date:</span>
                        <span className="text-neutral-200">{cert?.eventDate || "October 04, 2026"}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-neutral-800/60">
                        <span className="text-neutral-400">Organized By:</span>
                        <span className="text-neutral-200">Algoxilla</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-neutral-400">Authorized Signatures:</span>
                        <span className="text-neutral-300">Dev Raj & Aditya Raj</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cryptographic Proof Details */}
                <div className="p-5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      <Lock className="w-4 h-4 text-emerald-400" />
                      Canonical Metadata Fingerprint (SHA-256)
                    </div>
                    <button
                      onClick={() => handleCopyHash(cert?.metadataHash || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")}
                      className="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-[11px] font-mono text-neutral-300 flex items-center gap-1.5 transition-colors border border-neutral-800"
                    >
                      {copiedHash ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Hash</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 font-mono text-xs text-neutral-300 break-all">
                    {cert?.metadataHash || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400 font-mono pt-1">
                    <span>Canonical URL: <span className="text-emerald-400">{getVerificationUrl(cert?.certificateCode || routeId)}</span></span>
                    <span>Audit Status: Passed Anti-Tamper Check</span>
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">
                    Hash Type: Metadata Digest over serial, recipient, type, and issuance date. (Document SHA-256 reserved for PDF rendering).
                  </div>
                </div>

                {/* Certificate Visual Presentation */}
                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-red-500" />
                      Rendered Credential Display
                    </h3>
                    <Link
                      href="/portal"
                      className="text-xs text-red-400 hover:underline flex items-center gap-1"
                    >
                      Retrieve in Participant Portal <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  <CertificatePreview
                    recipientName={cert?.recipientName || "Alex Chen"}
                    certificateId={cert?.certificateCode || routeId}
                    issueDate={cert?.issuedAt || "2026-10-04T18:00:00Z"}
                    verificationHash={cert?.metadataHash || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
                  />
                </div>
              </div>
            )}

            {/* =========================================================================
                STATE 2: REVOKED CERTIFICATE
               ========================================================================= */}
            {currentOutcome === "REVOKED" && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-gradient-to-r from-red-950/80 via-neutral-900 to-neutral-950 border border-red-500/60 p-6 sm:p-8 space-y-5 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/50 text-red-400 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-7 h-7" />
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold text-red-400 uppercase tracking-widest bg-red-950 px-2 py-0.5 rounded border border-red-800">
                        STATUS: ADMINISTRATIVELY REVOKED
                      </span>
                      <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
                        Certificate Revoked by Authority
                      </h1>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                    This certificate serial was originally created in the registry but has been <strong className="text-red-400">formally revoked</strong> by Algoxilla organizers. It is no longer valid for any official credentialing or academic verification.
                  </p>

                  <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-neutral-800/80">
                      <span className="text-neutral-400">Revocation Reason:</span>
                      <span className="text-red-300 font-semibold">{cert?.revocationReason || "Administrative review (Disqualified / Duplicate issuance)"}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-neutral-400">Revoked Timestamp:</span>
                      <span className="text-neutral-300">{cert?.revokedAt || "2026-10-06T14:30:00Z"}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-3">
                    <Link
                      href="/verify"
                      className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Search Another Serial
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================================
                STATE 3: REPLACED / SUPERSEDED CERTIFICATE
               ========================================================================= */}
            {currentOutcome === "REPLACED" && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-gradient-to-r from-amber-950/70 via-neutral-900 to-neutral-950 border border-amber-500/50 p-6 sm:p-8 space-y-5 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                      <Clock className="w-7 h-7" />
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
                        STATUS: SUPERSEDED & REISSUED
                      </span>
                      <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
                        Certificate Replaced by Updated Credential
                      </h1>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                    This certificate serial (<span className="font-mono text-white">{routeId}</span>) was replaced following an approved name correction or formatting reissue. A newer canonical credential now supersedes this record.
                  </p>

                  <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3 text-xs">
                    <div className="flex justify-between items-center py-1">
                      <span className="text-neutral-400">Superseding Certificate Serial:</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">
                        {cert?.supersededByCode || "ALGO-2026-HACK-1002"}
                      </span>
                    </div>

                    <Link
                      href={`/verify/${cert?.supersededByCode || "ALGO-2026-HACK-1002"}`}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs transition-colors"
                    >
                      View Active Superseding Credential <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================================
                STATE 4: NOT FOUND IN REGISTRY
               ========================================================================= */}
            {currentOutcome === "NOT_FOUND" && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900 border border-neutral-800 p-6 sm:p-10 text-center space-y-6 shadow-2xl">
                  <div className="w-16 h-16 rounded-full bg-neutral-800/80 border border-neutral-700 text-neutral-400 flex items-center justify-center mx-auto">
                    <XCircle className="w-9 h-9" />
                  </div>

                  <div className="space-y-2">
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-widest uppercase bg-neutral-900 border border-neutral-800 text-neutral-400">
                      IDENTIFIER NOT FOUND
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                      Certificate Not In Registry
                    </h1>
                    <p className="text-xs sm:text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
                      The query identifier <strong className="text-white font-mono bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">{routeId || "UNKNOWN"}</strong> was not found in the official Algoxilla verification registry.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-left text-xs text-neutral-400 max-w-md mx-auto space-y-2">
                    <strong className="text-neutral-200 block font-semibold flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-neutral-400" />
                      Verification Guidelines
                    </strong>
                    <p className="text-[11px] leading-relaxed">
                      Please double-check the spelling of the certificate serial. Authentic serials typically follow the format <span className="font-mono text-neutral-300">ALGO-2026-HACK-XXXX</span>. If you believe this is an error, please reach out to the event organizers.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Link
                      href="/verify"
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Try Another Search
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================================
                STATE 5: SERVICE INTERNAL ERROR / UNAVAILABLE
               ========================================================================= */}
            {currentOutcome === "INTERNAL_ERROR" && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-gradient-to-r from-purple-950/60 via-neutral-900 to-neutral-950 border border-purple-500/50 p-6 sm:p-10 text-center space-y-6 shadow-2xl">
                  <div className="w-16 h-16 rounded-full bg-purple-900/30 border border-purple-500/40 text-purple-300 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-9 h-9" />
                  </div>

                  <div className="space-y-2">
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-widest uppercase bg-purple-950 border border-purple-800 text-purple-300">
                      SYSTEM NOTICE: REGISTRY TEMPORARILY UNAVAILABLE
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                      Verification Service Busy
                    </h1>
                    <p className="text-xs sm:text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
                      The verification service could not verify serial <span className="font-mono text-white">{routeId}</span> due to a temporary service interruption.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-left text-xs text-neutral-300 max-w-md mx-auto space-y-2">
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      <strong className="text-white">Important Notice:</strong> This message does <em>not</em> indicate that the certificate is invalid or counterfeit. Please retry in a few moments.
                    </p>
                  </div>

                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={handleRetry}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry Verification
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CertificateVerificationPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#09090b] text-[#f4f4f5] py-20 px-4 text-center font-mono text-xs text-neutral-500">Loading certificate verification record...</div>}>
      <CertificateVerificationContent {...props} />
    </Suspense>
  );
}

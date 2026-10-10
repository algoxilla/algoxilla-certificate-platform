"use client";

import React, { useState, use, Suspense } from "react";
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
  ExternalLink
} from "lucide-react";
import CertificatePreview from "@/components/CertificatePreview";
import { findMockCertificateById } from "@/lib/mockData";
import { getVerificationUrl } from "@/lib/config";

function CertificateVerificationContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const routeId = decodeURIComponent(resolvedParams.id || "");

  // Toggle state to test valid vs invalid states directly
  const [forceInvalid, setForceInvalid] = useState(
    routeId.toLowerCase() === "invalid" || routeId.toUpperCase().includes("REVOKED")
  );
  const [copiedHash, setCopiedHash] = useState(false);

  // Match against mock database
  const matched = findMockCertificateById(routeId);
  const isValid = !forceInvalid && !!matched && matched.certificateStatus === "ISSUED";

  const handleCopyHash = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

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

          {/* Quick Demo State Toggle */}
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 p-1 rounded-lg text-xs font-mono">
            <span className="text-neutral-500 text-[11px] px-1">Phase 1 Demo Switcher:</span>
            <button
              onClick={() => setForceInvalid(false)}
              className={`px-2.5 py-1 rounded text-[11px] transition-all ${
                !forceInvalid && isValid
                  ? "bg-emerald-600 text-white font-semibold shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Simulate Valid State
            </button>
            <button
              onClick={() => setForceInvalid(true)}
              className={`px-2.5 py-1 rounded text-[11px] transition-all ${
                forceInvalid || !isValid
                  ? "bg-red-600 text-white font-semibold shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Simulate Invalid / Revoked State
            </button>
          </div>
        </div>

        {/* =========================================================================
            STATE A: VALID & AUTHENTIC CERTIFICATE
           ========================================================================= */}
        {isValid && matched ? (
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
                        VERIFIED AUTHENTIC & TAMPER-PROOF
                      </span>
                      <span className="text-[10px] font-mono text-neutral-400">[MOCK DATA]</span>
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
                    {matched.certificateId}
                  </span>
                </div>
              </div>

              {/* Notice text */}
              <p className="text-xs text-neutral-300 leading-relaxed pt-1">
                This certificate record has been cryptographically validated against the Algoxilla verification registry for <strong>{matched.event}</strong>. The attributes below confirm the authenticity of this issuance.
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
                    <strong className="text-white font-medium text-sm">{matched.fullName}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-neutral-800/60">
                    <span className="text-neutral-400">Designation:</span>
                    <span className="text-neutral-200">Official Participant</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-neutral-800/60">
                    <span className="text-neutral-400">Eligibility Status:</span>
                    <span className="text-emerald-400 font-mono font-semibold">CONFIRMED ATTENDEE</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-neutral-400">Registration Proof:</span>
                    <span className="text-neutral-300 font-mono text-[11px]">[MOCK-REG-2026-CONFIRMED]</span>
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
                    <strong className="text-white font-medium">Algothon&apos;26</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-neutral-800/60">
                    <span className="text-neutral-400">Event Date:</span>
                    <span className="text-neutral-200">{matched.eventDate}</span>
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
                  Cryptographic Verification Fingerprint
                </div>
                <button
                  onClick={() => handleCopyHash(matched.verificationHash || "")}
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
                {matched.verificationHash}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400 font-mono pt-1">
                <span>Canonical URL: <span className="text-emerald-400">{getVerificationUrl(matched.certificateId || "")}</span></span>
                <span>Audit Status: Passed Anti-Tamper Check</span>
              </div>
              <div className="text-[10px] text-neutral-500 font-mono">
                Protocol: SHA-256 Dual-Key Verification v1.0 • Environment-based registry
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
                recipientName={matched.fullName}
                certificateId={matched.certificateId}
                issueDate={matched.issueDate}
                verificationHash={matched.verificationHash}
              />
            </div>
          </div>
        ) : (
          /* =========================================================================
              STATE B: UNRECOGNIZED / REVOKED / INVALID CERTIFICATE
             ========================================================================= */
          <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-r from-red-950/80 via-neutral-900 to-neutral-950 border border-red-500/50 p-6 sm:p-10 text-center space-y-6 shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-red-600/10 border-2 border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
                <XCircle className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-widest uppercase bg-red-950 border border-red-800 text-red-300">
                  VERIFICATION FAILED: UNRECOGNIZED OR REVOKED
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                  Certificate Not Found in Registry
                </h1>
                <p className="text-xs sm:text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
                  The query identifier <strong className="text-white font-mono bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">{routeId || "UNKNOWN"}</strong> does not correspond to any authenticated certificate issued by Algoxilla.
                </p>
              </div>

              {/* Advisory warning */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-left text-xs text-neutral-400 max-w-md mx-auto space-y-2">
                <strong className="text-neutral-200 block font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  Integrity Advisory
                </strong>
                <p className="text-[11px] leading-relaxed">
                  Authentic Algoxilla credentials are cryptographically signed at issuance. If you were presented with a printed or PDF document carrying this identifier, it may be counterfeit, revoked by the event organizers, or miskeyed.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/verify"
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Search className="w-3.5 h-3.5" />
                  Try Another Search
                </Link>

                <button
                  type="button"
                  onClick={() => setForceInvalid(false)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium text-xs transition-colors"
                >
                  Reset to Sample Valid Credential
                </button>
              </div>
            </div>
          </div>
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

"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { 
  Mail, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Info, 
  Clock,
  Send,
  LogOut
} from "lucide-react";
import CertificatePreview from "@/components/CertificatePreview";
import CorrectionModal from "@/components/CorrectionModal";
import { 
  findMockParticipantByEmail, 
  MockParticipant 
} from "@/lib/mockData";


function PortalContent() {
  const searchParams = useSearchParams();

  const errorParam = searchParams.get("error");
  const messageParam = searchParams.get("message");
  const verifiedParam = searchParams.get("verified");

  const initialEmailError = errorParam && messageParam ? decodeURIComponent(messageParam) : null;
  const initialNotification = verifiedParam === "true" 
    ? "Your secure claim link has been verified! Welcome to your credential portal." 
    : null;

  // Wizard state: 1 = Email Input, 2 = Claim Link Dispatched, 3 = Certificate View, 0 = Ineligible/Error
  const [step, setStep] = useState<number>(1);
  const [email, setEmail] = useState<string>("alex.chen@example.com");
  const [emailError, setEmailError] = useState<string | null>(initialEmailError);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [notification, setNotification] = useState<string | null>(initialNotification);

  // Active participant matched from session or demo fallback
  const [participant, setParticipant] = useState<MockParticipant | null>(null);

  // Correction Modal state
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState<boolean>(false);
  const [correctionBanner, setCorrectionBanner] = useState<string | null>(null);

  // 15-minute validity timer countdown
  const [timerSeconds, setTimerSeconds] = useState<number>(900);

  // Check for active authenticated session
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.participant) {
          const nameParts = (data.participant.fullName || "").split(" ");
          const firstName = nameParts[0] || "";
          const lastName = nameParts.slice(1).join(" ") || "";
          const mappedParticipant: MockParticipant = {
            id: data.participant.id,
            firstName,
            lastName,
            fullName: data.participant.fullName,
            email: data.participant.email,
            certificateId: data.certificate?.certificateCode || "ALGO-2026-HACK-7892",
            event: "Algothon’26",
            eventDate: "October 04, 2026",
            confirmationStatus: data.participant.attendanceConfirmed ? "CONFIRMED" : "PENDING_ORGANIZER_APPROVAL",
            certificateStatus: data.certificate ? "ISSUED" : "PENDING_ISSUANCE",
            issueDate: data.certificate?.issuedAt || "4 October 2026",
            verificationHash: data.certificate?.verificationHash || "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
            hasCorrectionPending: Boolean(data.correction),
            correctionNote: data.correction ? `Requested change to "${data.correction.requestedName}" is under organizer review.` : undefined,
            isMock: true,
          };
          setParticipant(mappedParticipant);
          setStep(3); // Authenticated -> View Certificate
        }
      })
      .catch(() => {
        // Fallback to local state if offline
      });
  }, []);

  // Timer countdowns
  useEffect(() => {
    if (step === 2 && timerSeconds > 0) {
      const interval = setInterval(() => {
        setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, timerSeconds]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const interval = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [resendCooldown]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Step 1: Submit Email for Secure Claim Link
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setEmailError("Please provide a valid participant email address.");
      return;
    }

    setEmailError(null);
    setIsSending(true);

    try {
      const res = await fetch("/api/auth/send-claim-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEmailError(data.error || "Failed to dispatch claim link. Please try again.");
        setIsSending(false);
        return;
      }

      // Check synthetic mock fallback for offline dev demo
      const matched = findMockParticipantByEmail(cleanEmail);
      if (matched) {
        setParticipant(matched);
      }

      setStep(2); // Proceed to "Check Your Inbox"
      setTimerSeconds(900);
      setResendCooldown(60);
      setNotification(data.message || "A secure, single-use claim link has been dispatched to your inbox.");
    } catch {
      // In purely local development without network, allow demo progression
      const matched = findMockParticipantByEmail(cleanEmail);
      if (matched) {
        setParticipant(matched);
        setStep(2);
        setTimerSeconds(900);
      } else {
        setStep(0);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleResendLink = async () => {
    if (resendCooldown > 0) return;
    setResendCooldown(60);
    setNotification("A fresh secure claim link has been dispatched to your inbox.");
    try {
      await fetch("/api/auth/send-claim-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setParticipant(null);
    setStep(1);
    setNotification(null);
  };

  const handleCorrectionSuccess = (requestedName: string) => {
    setCorrectionBanner(
      `Name correction request submitted to change name to "${requestedName}". Organizer review is pending.`
    );
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-300">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
            <span>PARTICIPANT SELF-SERVICE PORTAL</span>
            <span className="text-neutral-600">•</span>
            <span className="text-red-400 font-semibold">Algothon’26</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Claim Your Algothon&apos;26 Certificate
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mx-auto">
            Enter the registered email you used for Algothon’26. We will send a secure single-use link to access, download, or submit correction requests for your certificate.
          </p>
        </div>

        {/* Global Error Notification */}
        {emailError && (
          <div className="max-w-xl mx-auto p-4 rounded-xl bg-red-950/60 border border-red-800/80 flex items-start gap-3 text-xs text-red-200 shadow-lg">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block text-red-300">Notice</strong>
              <p>{emailError}</p>
            </div>
          </div>
        )}

        {/* Global Success Notification */}
        {notification && (
          <div className="max-w-xl mx-auto p-4 rounded-xl bg-emerald-950/50 border border-emerald-800/60 flex items-start gap-3 text-xs text-emerald-200 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block text-emerald-300">Status</strong>
              <p>{notification}</p>
            </div>
          </div>
        )}

        {/* Step Progress Tracker */}
        <div className="max-w-xl mx-auto">
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className={`p-2.5 rounded-lg border text-center transition-all ${
              step === 1 
                ? "bg-red-950/50 border-red-500/50 text-white font-semibold" 
                : step > 1 
                ? "bg-neutral-900 border-neutral-800 text-emerald-400" 
                : "bg-neutral-900/40 border-neutral-800/40 text-neutral-500"
            }`}>
              <div className="text-[10px] text-neutral-500">STEP 1</div>
              <div className="truncate">1. Email Lookup</div>
            </div>

            <div className={`p-2.5 rounded-lg border text-center transition-all ${
              step === 2 
                ? "bg-red-950/50 border-red-500/50 text-white font-semibold" 
                : step > 2 
                ? "bg-neutral-900 border-neutral-800 text-emerald-400" 
                : "bg-neutral-900/40 border-neutral-800/40 text-neutral-500"
            }`}>
              <div className="text-[10px] text-neutral-500">STEP 2</div>
              <div className="truncate">2. Inbox Link</div>
            </div>

            <div className={`p-2.5 rounded-lg border text-center transition-all ${
              step === 3 
                ? "bg-emerald-950/50 border-emerald-500/50 text-white font-semibold" 
                : "bg-neutral-900/40 border-neutral-800/40 text-neutral-500"
            }`}>
              <div className="text-[10px] text-neutral-500">STEP 3</div>
              <div className="truncate">3. Certificate</div>
            </div>
          </div>
        </div>

        {/* STEP 1: Email Form */}
        {step === 1 && (
          <div className="max-w-lg mx-auto bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-red-500" />
                Participant Verification
              </h2>
              <p className="text-xs text-neutral-400">
                Enter your registered email address to receive your passwordless claim link.
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label htmlFor="participant-email" className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Registration Email Address:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="participant-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError(null);
                    }}
                    placeholder="e.g. participant@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-sm text-white placeholder-neutral-600 transition-colors font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSending}
                className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm transition-all shadow-md shadow-red-950/50 flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>{isSending ? "Dispatching Secure Link..." : "Send Verification Link"}</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </form>

            {/* Quick Demo Pre-fills for Development & Staging */}
            <div className="pt-2 border-t border-neutral-800/80 space-y-2">
              <span className="text-[11px] font-mono text-neutral-500 block">
                Quick-fill demo profiles (Development & Testing):
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEmail("alex.chen@example.com")}
                  className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:border-red-500/50 text-[11px]"
                >
                  ✓ Alex Chen (Eligible)
                </button>
                <button
                  type="button"
                  onClick={() => setEmail("priya.sharma@example.com")}
                  className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:border-red-500/50 text-[11px]"
                >
                  ✓ Priya Sharma (Correction Pending)
                </button>
                <button
                  type="button"
                  onClick={() => setEmail("david.kim@example.com")}
                  className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-amber-300 hover:border-amber-500/50 text-[11px]"
                >
                  ⏳ David Kim (Pending Review)
                </button>
                <button
                  type="button"
                  onClick={() => setEmail("unregistered@example.com")}
                  className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 hover:border-red-500/50 text-[11px]"
                >
                  ✗ Unregistered (Test)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Check Your Inbox */}
        {step === 2 && (
          <div className="max-w-lg mx-auto bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-red-500" />
                Check Your Inbox
              </h2>
              <p className="text-xs text-neutral-400">
                A single-use, secure certificate claim link has been dispatched to:
              </p>
              <div className="text-xs font-mono text-red-400 font-semibold bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800 inline-block">
                {email}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-neutral-300 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Next steps:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-neutral-400 text-[11px] leading-relaxed">
                <li>Open your email client and find the message from <strong>Algoxilla Certifications</strong>.</li>
                <li>Click the <strong>&ldquo;Claim Your Official Certificate&rdquo;</strong> button.</li>
                <li>Your identity will be verified and you will be returned directly to this screen to download your A4 certificate.</li>
              </ol>
            </div>

            {/* Timer and Resend */}
            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono px-1">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-neutral-500" />
                <span>Link expires in: <strong>{formatTimer(timerSeconds)}</strong></span>
              </div>
              <button
                type="button"
                onClick={handleResendLink}
                disabled={resendCooldown > 0}
                className="text-red-400 hover:text-red-300 disabled:opacity-50 disabled:hover:text-red-400 underline font-medium cursor-pointer"
              >
                {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend Link"}
              </button>
            </div>

            {/* Development / Staging Quick Action Button */}
            <div className="pt-2 border-t border-neutral-800 space-y-2">
              <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-400 flex items-center justify-between">
                <span>[Dev Mode / Test Shortcut]:</span>
                <button
                  type="button"
                  onClick={() => {
                    // Simulate instant unlock for Alex Chen in development
                    if (participant) {
                      setStep(3);
                    } else {
                      const matched = findMockParticipantByEmail("alex.chen@example.com");
                      if (matched) {
                        setParticipant(matched);
                        setStep(3);
                      }
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-sans text-xs font-medium cursor-pointer"
                >
                  Instant Unlock (Simulate Click)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change Email
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Certificate View & Download */}
        {step === 3 && participant && (
          <div className="space-y-6">
            {/* Authenticated Identity Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-neutral-900 to-neutral-950 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                      Identity Authenticated
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">[AUTHORIZED SESSION]</span>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    Eligible Record Confirmed for {participant.fullName}
                  </p>
                  <p className="text-xs text-neutral-400">
                    Registered Email: <span className="font-mono text-neutral-300">{participant.email}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <Link
                  href={`/verify/${participant.certificateId || "MOCK-ALGO26-8942"}`}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 transition-colors flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  View Public Verification
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition-colors flex items-center gap-1"
                  title="Log out session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>

            {/* Active Correction Pending Warning if applicable */}
            {(participant.hasCorrectionPending || correctionBanner) && (
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-2.5 text-xs text-amber-200">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">Notice: Correction Request on File</strong>
                  <p className="text-amber-300/90 mt-0.5">
                    {correctionBanner || participant.correctionNote || "An adjustment request for this certificate is currently in the organizer review queue."}
                  </p>
                </div>
              </div>
            )}

            {/* Certificate Component */}
            <div className="pt-2">
              <CertificatePreview
                recipientName={participant.fullName}
                certificateId={participant.certificateId || "MOCK-ALGO26-8942"}
                issueDate={participant.issueDate || "4 October 2026"}
                verificationHash={participant.verificationHash}
                defaultViewMode="reference"
                onRequestCorrection={() => setIsCorrectionModalOpen(true)}
              />
            </div>
          </div>
        )}

        {/* STEP 0: Ineligible or Unregistered State */}
        {step === 0 && (
          <div className="max-w-lg mx-auto bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl text-center">
            <div className="w-12 h-12 rounded-full bg-red-950/80 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-white">Record Not Eligible for Certificate</h2>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto">
                No verified attendee record matching <span className="font-mono text-red-400 font-semibold">{email}</span> was found in the official Algothon’26 attendee roster.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-left text-xs text-neutral-400 space-y-2">
              <span className="font-semibold text-neutral-300 block">Common reasons:</span>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>Different email address used during hackathon registration.</li>
                <li>Registration was not confirmed by event organizers.</li>
                <li>In-person attendance was not verified during check-in.</li>
              </ul>
            </div>

            <button
              onClick={() => {
                setStep(1);
                setEmailError(null);
              }}
              className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Try Another Email
            </button>
          </div>
        )}

        {/* Name Correction Request Modal */}
        {participant && (
          <CorrectionModal
            isOpen={isCorrectionModalOpen}
            onClose={() => setIsCorrectionModalOpen(false)}
            currentName={participant.fullName}
            email={participant.email}
            onSuccess={handleCorrectionSuccess}
          />
        )}
      </div>
    </div>
  );
}

export default function ParticipantPortalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#09090b] text-neutral-400 flex items-center justify-center">Loading portal...</div>}>
      <PortalContent />
    </Suspense>
  );
}

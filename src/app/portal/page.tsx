"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { 
  Mail, 
  KeyRound, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  RotateCcw, 
  Info, 
  Clock 
} from "lucide-react";
import CertificatePreview from "@/components/CertificatePreview";
import CorrectionModal from "@/components/CorrectionModal";
import { 
  findMockParticipantByEmail, 
  MockParticipant 
} from "@/lib/mockData";

export default function ParticipantPortalPage() {
  // Wizard state: 1 = Email, 2 = OTP, 3 = Certificate View, 0 = Ineligible/Error
  const [step, setStep] = useState<number>(1);
  const [email, setEmail] = useState<string>("alex.chen@example.com");
  const [emailError, setEmailError] = useState<string | null>(null);
  
  // OTP segmented inputs (6 digits)
  const [otp, setOtp] = useState<string[]>(["1", "2", "3", "4", "5", "6"]);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState<boolean>(false);
  const [timerSeconds, setTimerSeconds] = useState<number>(900); // 15 mins
  const [resendNotification, setResendNotification] = useState<string | null>(null);

  // Active participant matched from mock database
  const [participant, setParticipant] = useState<MockParticipant | null>(null);

  // Correction Modal state
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState<boolean>(false);
  const [correctionBanner, setCorrectionBanner] = useState<string | null>(null);

  // OTP input refs for autofocus navigation
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Timer countdown simulation
  useEffect(() => {
    if (step === 2 && timerSeconds > 0) {
      const interval = setInterval(() => {
        setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, timerSeconds]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Step 1: Submit Email
  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setEmailError("Please provide a valid participant email address.");
      return;
    }

    setEmailError(null);
    const matched = findMockParticipantByEmail(email);

    if (!matched) {
      // Ineligible or not in registration list
      setParticipant(null);
      setStep(0); // Error state
    } else if (matched.certificateStatus === "INELIGIBLE") {
      setParticipant(matched);
      setStep(0); // Ineligible
    } else {
      setParticipant(matched);
      setStep(2); // Proceed to OTP
      setTimerSeconds(900);
    }
  };

  // Step 2: Handle OTP input changes with auto-focus
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      const newOtp = [...otp];
      digits.forEach((digit, i) => {
        if (i < 6) newOtp[i] = digit;
      });
      setOtp(newOtp);
      const nextFocus = Math.min(digits.length, 5);
      otpInputRefs.current[nextFocus]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value.replace(/\D/g, "");
    setOtp(newOtp);

    // Auto-advance
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const enteredCode = otp.join("");
    if (enteredCode.length !== 6) {
      setOtpError("Please enter all 6 digits of the verification code.");
      return;
    }

    setOtpError(null);
    setIsVerifyingOtp(true);

    setTimeout(() => {
      setIsVerifyingOtp(false);
      setStep(3); // Success: View Certificate
    }, 700);
  };

  const handleResendOtp = () => {
    setResendNotification("A fresh 6-digit mock code has been dispatched.");
    setTimerSeconds(900);
    setTimeout(() => setResendNotification(null), 3500);
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
            <span className="w-2 h-2 rounded-full bg-red-600"></span>
            <span>PARTICIPANT SELF-SERVICE PORTAL</span>
            <span className="text-neutral-600">•</span>
            <span className="text-red-400 font-semibold">[MOCK INTERFACE]</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Retrieve Algothon&apos;26 Certificate
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mx-auto">
            Verify your official registration email to access, download, or submit correction requests for your participation certificate.
          </p>
        </div>

        {/* Step Progress Tracker */}
        <div className="max-w-xl mx-auto">
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className={`p-2.5 rounded-lg border text-center transition-all ${
              step === 1 
                ? "bg-red-950/50 border-red-500/50 text-white" 
                : step > 1 
                ? "bg-neutral-900 border-neutral-800 text-emerald-400" 
                : "bg-neutral-900/40 border-neutral-800/40 text-neutral-500"
            }`}>
              <div className="text-[10px] text-neutral-500">STEP 1</div>
              <div className="font-semibold truncate">1. Email Lookup</div>
            </div>

            <div className={`p-2.5 rounded-lg border text-center transition-all ${
              step === 2 
                ? "bg-red-950/50 border-red-500/50 text-white" 
                : step > 2 
                ? "bg-neutral-900 border-neutral-800 text-emerald-400" 
                : "bg-neutral-900/40 border-neutral-800/40 text-neutral-500"
            }`}>
              <div className="text-[10px] text-neutral-500">STEP 2</div>
              <div className="font-semibold truncate">2. 6-Digit OTP</div>
            </div>

            <div className={`p-2.5 rounded-lg border text-center transition-all ${
              step === 3 
                ? "bg-red-950/50 border-red-500/50 text-white" 
                : "bg-neutral-900/40 border-neutral-800/40 text-neutral-500"
            }`}>
              <div className="text-[10px] text-neutral-500">STEP 3</div>
              <div className="font-semibold truncate">3. View & Claim</div>
            </div>
          </div>
        </div>

        {/* STEP 1: Email Lookup */}
        {step === 1 && (
          <div className="max-w-lg mx-auto bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-red-500" />
                Enter Registered Email
              </h2>
              <p className="text-xs text-neutral-400">
                Provide the email address associated with your approved Algothon&apos;26 registration.
              </p>
            </div>

            {emailError && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/60 flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{emailError}</span>
              </div>
            )}

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label htmlFor="portal-email" className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Participant Email Address:
                </label>
                <div className="relative">
                  <input
                    id="portal-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. participant@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-sm text-white placeholder-neutral-600 transition-colors"
                  />
                </div>
              </div>

              {/* Security Rule Explainer */}
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80 text-[11px] text-neutral-400 space-y-1">
                <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                  <Info className="w-3.5 h-3.5 text-red-400" />
                  Eligibility Guarantee Rule
                </div>
                <p>
                  A verified email alone never authorizes certificate issuance. The email must strictly match an organizer-approved registration on the official Algothon&apos;26 roster.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs sm:text-sm transition-all shadow-md shadow-red-950/50 flex items-center justify-center gap-2 group"
              >
                <span>Send Verification Code</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </form>

            {/* Quick Demo Pre-fills */}
            <div className="pt-2 border-t border-neutral-800/80 space-y-2">
              <span className="text-[11px] font-mono text-neutral-500 block">
                Quick-fill demo profiles:
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEmail("alex.chen@example.com")}
                  className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:border-red-500/50 text-[11px]"
                >
                  ✓ Alex Chen (Issued)
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
                  ⏳ David Kim (Issuance Pending)
                </button>
                <button
                  type="button"
                  onClick={() => setEmail("unregistered@example.com")}
                  className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 hover:border-red-500/50 text-[11px]"
                >
                  ✗ Unregistered Email (Test Rejection)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: 6-Digit OTP */}
        {step === 2 && (
          <div className="max-w-lg mx-auto bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-red-500" />
                Security Code Verification
              </h2>
              <p className="text-xs text-neutral-400">
                A 6-digit one-time passcode has been dispatched to:
              </p>
              <div className="text-xs font-mono text-red-400 font-semibold bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800 inline-block">
                {email}
              </div>
            </div>

            {resendNotification && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/50 flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{resendNotification}</span>
              </div>
            )}

            {otpError && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/60 flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{otpError}</span>
              </div>
            )}

            <form onSubmit={handleOtpVerify} className="space-y-5">
              {/* Segmented 6-digit OTP boxes */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-2 text-center">
                  Enter 6-Digit Passcode:
                </label>
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      className="w-10 h-12 sm:w-12 sm:h-14 text-center font-mono text-xl font-bold rounded-xl bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 text-white transition-all shadow-inner"
                      aria-label={`Digit ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>

              {/* Timer and Resend */}
              <div className="flex items-center justify-between text-xs text-neutral-400 font-mono px-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Code expires in: <strong>{formatTimer(timerSeconds)}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  className="text-red-400 hover:text-red-300 underline font-medium"
                >
                  Resend Code
                </button>
              </div>

              <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-400 text-center">
                [Phase 1 Demo]: You can enter any 6 digits (e.g. 123456) to proceed.
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-1/3 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Change Email
                </button>

                <button
                  type="submit"
                  disabled={isVerifyingOtp}
                  className="w-2/3 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm transition-all shadow-md shadow-red-950/50 flex items-center justify-center gap-2"
                >
                  {isVerifyingOtp ? "Verifying Token..." : "Verify & Unlock Certificate"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: Certificate View & Claim */}
        {step === 3 && participant && (
          <div className="space-y-6">
            {/* Success and Eligibility Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-neutral-900 to-neutral-950 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                      Identity Verified
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">[MOCK DATA]</span>
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
                  onClick={() => setStep(1)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-neutral-400 hover:text-white transition-colors"
                  title="Switch participant"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
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

            {/* Certificate Component OR Pending Issuance Safeguard */}
            {participant.certificateStatus === "ISSUED" ? (
              <div className="pt-2">
                <CertificatePreview
                  recipientName={participant.fullName}
                  certificateId={participant.certificateId || "MOCK-ALGO26-8942"}
                  issueDate={participant.issueDate || "4 October 2026"}
                  verificationHash={participant.verificationHash || "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"}
                  onRequestCorrection={() => setIsCorrectionModalOpen(true)}
                />
              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-neutral-900 border border-amber-500/40 text-center space-y-4 shadow-xl">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
                  <Clock className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-amber-950 border border-amber-800 text-amber-300 font-semibold">
                    REGISTRATION CONFIRMED • ISSUANCE IN PROGRESS
                  </span>
                  <h3 className="text-xl font-bold text-white">Certificate Pending Organizer Finalization</h3>
                  <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
                    Your attendance for <strong className="text-neutral-200">Algothon&apos;26</strong> has been verified. However, official digital certificate issuance is currently being processed by the organizers.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-left text-xs text-neutral-400 max-w-md mx-auto space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span>Participant:</span>
                    <span className="text-neutral-200">{participant.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Event Roster Status:</span>
                    <span className="text-emerald-400">CONFIRMED</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Issuance Status:</span>
                    <span className="text-amber-400">PENDING_BATCH_STAMP</span>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
                  [Eligibility Safeguard] Certificates cannot be downloaded until batch cryptography and signatures are finalized.
                </p>
              </div>
            )}
          </div>
        )}

        {/* STEP 0: Rejection / Unregistered / Ineligible Error State */}
        {step === 0 && (
          <div className="max-w-lg mx-auto bg-neutral-900/90 border border-red-500/40 rounded-2xl p-6 sm:p-8 space-y-6 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-red-600/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <div className="inline-block px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-red-950/70 border border-red-800 text-red-300">
                Eligibility Check Failed
              </div>
              <h2 className="text-xl font-bold text-white">
                Email Not Found in Approved Roster
              </h2>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                The address <strong className="text-neutral-200 font-mono">{email}</strong> was not found in the organizer-confirmed Algothon&apos;26 attendee records.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-left text-xs text-neutral-400 space-y-2">
              <strong className="text-neutral-300 block font-medium">Why did this happen?</strong>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-neutral-400">
                <li>You may have registered under a different personal or institutional email.</li>
                <li>Your event confirmation was not confirmed on the official registration sheet.</li>
                <li>Possession of an email alone does not grant access without organizer authorization.</li>
              </ul>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-colors"
              >
                Try Another Email Address
              </button>
              <Link
                href="/admin"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
              >
                Inspect Organizer Roster (Admin Demo)
              </Link>
            </div>
          </div>
        )}

        {/* Correction Modal */}
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

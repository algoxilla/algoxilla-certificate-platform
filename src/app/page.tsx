"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  ShieldCheck, 
  UserCheck, 
  Search, 
  ArrowRight, 
  Layers, 
  Lock, 
  FileCheck, 
  QrCode, 
  Calendar, 
  Users,
  ExternalLink
} from "lucide-react";
import CertificatePreview from "@/components/CertificatePreview";

export default function LandingPage() {
  const [searchId, setSearchId] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) {
      router.push(`/verify/${encodeURIComponent(searchId.trim().toUpperCase())}`);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#09090b] text-[#f4f4f5] overflow-hidden">
      {/* Subtle Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[450px] bg-gradient-to-b from-red-600/10 via-red-950/5 to-transparent blur-3xl pointer-events-none -z-10"></div>
      <div className="absolute top-1/3 -right-48 w-96 h-96 bg-red-600/5 rounded-full blur-3xl pointer-events-none -z-10"></div>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-16">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/90 border border-neutral-800 text-xs font-mono text-neutral-300 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
            <span className="text-red-400 font-semibold">ALGOXILLA CREDENTIALS</span>
            <span className="text-neutral-600">|</span>
            <span className="text-neutral-400">Algothon&apos;26 Reissuance</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight sm:leading-none">
            Tamper-Proof Digital Credentials for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-600 to-rose-400">
              Algoxilla
            </span>
          </h1>

          {/* Subhead */}
          <p className="text-base sm:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Minimalist, cryptographically verifiable certificates for national hackathons and developer competitions. Claim your verified credential or authenticate an existing award in seconds.
          </p>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/portal"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-all shadow-lg shadow-red-950/50 flex items-center justify-center gap-2 group"
            >
              <UserCheck className="w-4 h-4" />
              <span>Retrieve Participant Certificate</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>

            <Link
              href="/verify"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 hover:border-neutral-700 font-semibold text-sm transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Verify Credential Authenticity</span>
            </Link>
          </div>

          {/* Quick Certificate Search Bar */}
          <div className="pt-6 max-w-xl mx-auto">
            <form onSubmit={handleSearch} className="relative flex items-center">
              <div className="absolute left-4 pointer-events-none text-neutral-500">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Direct certificate lookup (e.g. MOCK-ALGO26-8942)..."
                className="w-full pl-11 pr-24 py-3 rounded-xl bg-neutral-900/80 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-sm text-white placeholder-neutral-500 transition-all font-mono"
              />
              <button
                type="submit"
                className="absolute right-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition-colors"
              >
                Verify ID
              </button>
            </form>
            <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-neutral-500 font-mono">
              <span>Try sample mock IDs:</span>
              <button
                type="button"
                onClick={() => setSearchId("MOCK-ALGO26-8942")}
                className="text-red-400 hover:underline"
              >
                MOCK-ALGO26-8942
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setSearchId("MOCK-INVALID-0000")}
                className="text-neutral-400 hover:underline"
              >
                MOCK-INVALID-0000
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Event Section: Algothon'26 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="relative rounded-2xl bg-neutral-900/70 border border-neutral-800/90 p-6 sm:p-8 overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-center">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-mono font-semibold">
                  FEATURED EVENT
                </span>
                <span className="text-xs text-neutral-400 flex items-center gap-1 font-mono">
                  <Calendar className="w-3.5 h-3.5" /> 4 October 2026
                </span>
                <span className="text-xs text-neutral-400 flex items-center gap-1 font-mono">
                  <Users className="w-3.5 h-3.5" /> 170 Participants [MOCK]
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Algothon&apos;26 — A National Level Hackathon
              </h2>

              <p className="text-sm text-neutral-400 leading-relaxed">
                Celebrating innovation, software architecture, technical skills, collaboration, and high-impact problem solving. Organized by Algoxilla under co-founders Dev Raj and Aditya Raj. All eligible attendees can now claim their official participation credentials.
              </p>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 text-center">
                  <div className="text-lg sm:text-xl font-bold font-mono text-white">170</div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                    Registrations [MOCK]
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 text-center">
                  <div className="text-lg sm:text-xl font-bold font-mono text-red-400">150</div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                    Certificates Issued [MOCK]
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 text-center">
                  <div className="text-lg sm:text-xl font-bold font-mono text-emerald-400">100%</div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                    SHA-256 Verifiable
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-1 flex flex-col justify-center space-y-3 p-4 rounded-xl bg-neutral-950/80 border border-neutral-800">
              <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Quick Action Links
              </span>
              <Link
                href="/portal"
                className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs transition-colors flex items-center justify-between"
              >
                <span>Participant Retrieval Portal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/verify/MOCK-ALGO26-8942"
                className="w-full py-2.5 px-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 text-xs transition-colors flex items-center justify-between"
              >
                <span>View Sample Authenticated Credential</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/admin"
                className="w-full py-2.5 px-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 text-xs transition-colors flex items-center justify-between"
              >
                <span>Organizer Dashboard (Mock Roster)</span>
                <Layers className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Live Interactive Certificate Preview Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-8">
          <span className="text-xs font-mono uppercase tracking-widest text-red-500 font-semibold">
            Visual Credential Engine
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Algothon’26 Certificate Standard
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400">
            Faithfully recreated using Algoxilla’s minimalist black, white, and red design system with authentic Co-Founder signatures and tamper-resistant serializing.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <CertificatePreview 
            recipientName="Dev Participant"
            certificateId="MOCK-ALGO26-TEST"
            issueDate="4 October 2026"
            verificationHash="sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"
          />
        </div>
      </section>

      {/* Architectural Pillars / Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-neutral-900">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-12">
          <span className="text-xs font-mono uppercase tracking-widest text-neutral-400">
            Platform Capabilities
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Engineered for Security, Trust, and Ease of Use
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 transition-all space-y-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-500/20 text-red-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Passwordless Verification</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              No account creation required. Participants authenticate using secure 6-digit one-time passcodes sent to their registered email.
            </p>
            <div className="text-[10px] font-mono text-neutral-500">Spec: Phase 3 Ready</div>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 transition-all space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Cryptographic Anti-Tamper</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Every certificate carries an immutable SHA-256 hash verified directly against our open public verification registry.
            </p>
            <div className="text-[10px] font-mono text-emerald-500">Live in Prototype</div>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 transition-all space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Typo & Name Corrections</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Self-service correction request workflow allows participants to flag name typos, casing issues, or middle initials for review.
            </p>
            <div className="text-[10px] font-mono text-neutral-500">Interactive in Portal</div>
          </div>

          {/* Card 4 */}
          <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 transition-all space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Direct PDF Download</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Certificates are generated on-demand for local download. Strict policy: certificates are never sent as email attachments.
            </p>
            <div className="text-[10px] font-mono text-neutral-500">Spec: Privacy-First</div>
          </div>
        </div>
      </section>

      {/* Phased Roadmap Progress Indicator */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 mb-8 border-t border-neutral-900">
        <div className="p-6 rounded-2xl bg-neutral-950 border border-neutral-800/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">Implementation Lifecycle Roadmap</h3>
              <p className="text-xs text-neutral-400">
                Tracking execution phases aligned with the Master Product Specification.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-[11px] font-mono text-red-400 self-start sm:self-auto">
              Current: Phase 1 Approved
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-400">
              <div className="text-[10px] text-neutral-500">PHASE 0</div>
              <div className="font-semibold text-xs">Planning</div>
              <div className="text-[9px] text-emerald-500">✓ Completed</div>
            </div>
            <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/50 text-white">
              <div className="text-[10px] text-red-400">PHASE 1</div>
              <div className="font-semibold text-xs">Frontend UI</div>
              <div className="text-[9px] text-red-300">● Active</div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-neutral-400">
              <div className="text-[10px] text-neutral-500">PHASE 2</div>
              <div className="font-semibold text-xs">Database</div>
              <div className="text-[9px] text-neutral-600">Pending</div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-neutral-400">
              <div className="text-[10px] text-neutral-500">PHASE 3</div>
              <div className="font-semibold text-xs">Auth & OTP</div>
              <div className="text-[9px] text-neutral-600">Pending</div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-neutral-400">
              <div className="text-[10px] text-neutral-500">PHASE 4</div>
              <div className="font-semibold text-xs">PDF Engine</div>
              <div className="text-[9px] text-neutral-600">Pending</div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-neutral-400">
              <div className="text-[10px] text-neutral-500">PHASE 5</div>
              <div className="font-semibold text-xs">Self-Service</div>
              <div className="text-[9px] text-neutral-600">Pending</div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-neutral-400">
              <div className="text-[10px] text-neutral-500">PHASE 6</div>
              <div className="font-semibold text-xs">CSV Import</div>
              <div className="text-[9px] text-neutral-600">Pending</div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-neutral-400">
              <div className="text-[10px] text-neutral-500">PHASE 7/8</div>
              <div className="font-semibold text-xs">E2E & Launch</div>
              <div className="text-[9px] text-neutral-600">Pending</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

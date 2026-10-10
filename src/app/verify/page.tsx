"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  ShieldCheck, 
  Search, 
  CheckCircle2, 
  XCircle, 
  QrCode, 
  Lock
} from "lucide-react";

export default function VerifySearchPage() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/verify/${encodeURIComponent(query.trim().toUpperCase())}`);
    }
  };

  const sampleValidIds = [
    { id: "MOCK-ALGO26-8942", name: "Alex Chen" },
    { id: "MOCK-ALGO26-3104", name: "Priya Sharma" },
    { id: "MOCK-ALGO26-7251", name: "Michael O'Connor" },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>PUBLIC CREDENTIAL VERIFIER</span>
            <span className="text-neutral-600">•</span>
            <span className="text-red-400 font-semibold">[PHASE 1 MOCK ENGINE]</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Verify Certificate Authenticity
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mx-auto leading-relaxed">
            Verify the cryptographic integrity and validity of any Algoxilla-issued credential. Enter the unique Certificate ID printed on the bottom of the document or scan its QR code.
          </p>
        </div>

        {/* Search Input Box */}
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label htmlFor="verify-id" className="block text-xs font-medium text-neutral-300 mb-2">
                Enter Certificate Identifier or Hash:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <QrCode className="w-5 h-5" />
                </div>
                <input
                  id="verify-id"
                  type="text"
                  required
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. MOCK-ALGO26-8942"
                  className="w-full pl-11 pr-28 py-3 rounded-xl bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-sm text-white placeholder-neutral-600 transition-colors font-mono"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-2 bottom-2 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs transition-colors flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  Verify Now
                </button>
              </div>
            </div>
          </form>

          {/* Test Buttons */}
          <div className="pt-2 border-t border-neutral-800 space-y-3">
            <span className="text-[11px] font-mono text-neutral-500 block">
              Quick verification presets to test both outcomes:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-neutral-950 border border-emerald-900/40 space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Valid Authenticated Records:
                </div>
                <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                  {sampleValidIds.map((item) => (
                    <Link
                      key={item.id}
                      href={`/verify/${item.id}`}
                      className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/50 text-neutral-300 flex items-center justify-between"
                    >
                      <span>{item.id}</span>
                      <span className="text-neutral-500 text-[10px]">{item.name}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-neutral-950 border border-red-900/40 space-y-2">
                <div className="flex items-center gap-1.5 text-red-400 font-semibold text-[11px]">
                  <XCircle className="w-3.5 h-3.5" />
                  Invalid / Revoked Simulation:
                </div>
                <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                  <Link
                    href="/verify/invalid"
                    className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-red-500/50 text-neutral-300 flex items-center justify-between"
                  >
                    <span>/verify/invalid</span>
                    <span className="text-red-400 text-[10px]">Test Invalid State</span>
                  </Link>
                  <Link
                    href="/verify/MOCK-REVOKED-9999"
                    className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-red-500/50 text-neutral-300 flex items-center justify-between"
                  >
                    <span>MOCK-REVOKED-9999</span>
                    <span className="text-red-400 text-[10px]">Test Revoked State</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Security Architecture Explainer */}
        <div className="p-5 rounded-2xl bg-neutral-950 border border-neutral-800/80 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-red-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              How Algoxilla Verification Works
            </h3>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            During certificate issuance, an immutable SHA-256 fingerprint is calculated across the event metadata, organizer secret, and participant credentials. Third parties (colleges, employers, or hackathon sponsors) can authenticate any credential on this public route without requiring login credentials.
          </p>
        </div>
      </div>
    </div>
  );
}

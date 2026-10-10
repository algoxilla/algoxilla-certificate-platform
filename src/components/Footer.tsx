import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full border-t border-neutral-800/80 bg-neutral-950 text-neutral-400 py-12 px-4 sm:px-6 lg:px-8 mt-auto">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
        {/* Brand & Motto */}
        <div className="space-y-3 md:col-span-1">
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-24 rounded bg-white p-1 overflow-hidden shadow-sm">
              <Image
                src="/brand/algoxilla-logo.jpg"
                alt="Algoxilla Official Logo"
                fill
                sizes="96px"
                className="object-contain"
              />
            </div>
          </div>
          <p className="text-xs tracking-wider text-neutral-300 font-mono font-medium">
            BUILD • COLLABORATE • SOLVE • GROW
          </p>
          <p className="text-xs text-neutral-500 leading-relaxed">
            The official credentials verification platform for Algoxilla events, hackathons, and community initiatives.
          </p>
        </div>

        {/* Platform Links */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-200 mb-3">
            Platform Pages
          </h3>
          <ul className="space-y-2 text-xs">
            <li>
              <Link href="/portal" className="hover:text-red-400 transition-colors">
                Participant Retrieval Portal
              </Link>
            </li>
            <li>
              <Link href="/verify" className="hover:text-red-400 transition-colors">
                Public Certificate Verification
              </Link>
            </li>
            <li>
              <Link href="/admin" className="hover:text-red-400 transition-colors">
                Organizer Dashboard
              </Link>
            </li>
            <li>
              <Link href="/verify/MOCK-ALGO26-8942" className="hover:text-red-400 transition-colors">
                Sample Verified Credential
              </Link>
            </li>
          </ul>
        </div>

        {/* Event Reference */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-200 mb-3">
            Target Event
          </h3>
          <ul className="space-y-2 text-xs text-neutral-400">
            <li className="font-medium text-neutral-300">Algothon’26</li>
            <li>National Level Hackathon</li>
            <li>Held 4 October 2026</li>
            <li className="text-[11px] text-neutral-500">
              Co-Founders: Dev Raj & Aditya Raj
            </li>
          </ul>
        </div>

        {/* Phase 1 Specification Notice */}
        <div className="space-y-2 text-xs">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Phase 1 Isolation Notice
          </h3>
          <p className="text-neutral-500 leading-relaxed">
            This deployment runs under strict Phase 1 specifications. No real participant databases, SMTP mailers, or live certificate signing keys are active. All data presented is labelled mock data.
          </p>
          <div className="inline-block px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-[10px] font-mono text-neutral-400">
            Next.js App Router • Tailwind v4 • TS
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-6 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
        <p>© 2026 Algoxilla Certificate Platform. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-mono text-neutral-600">
            SPEC: Master Product Spec v1.0
          </span>
          <span className="text-neutral-600">•</span>
          <span className="text-[11px] font-mono text-emerald-500">
            Status: Phase 1 Ready
          </span>
        </div>
      </div>
    </footer>
  );
}

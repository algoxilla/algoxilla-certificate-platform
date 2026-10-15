"use client";

import React, { useState } from "react";
import { X, ShieldAlert } from "lucide-react";

export default function MockDataBanner() {
  const [visible, setVisible] = useState(true);

  // Strictly suppressed in production builds
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  if (!visible) return null;

  return (
    <div className="bg-gradient-to-r from-red-950/70 via-neutral-900/90 to-red-950/70 border-b border-red-500/30 text-xs text-neutral-300 py-2 px-4 transition-all z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-red-600 text-white shadow-sm">
            <ShieldAlert className="w-3 h-3" />
            Phase 1 Demo Mode
          </span>
          <span className="text-neutral-200 font-medium">
            Strict Mock Data Prototype:
          </span>
          <span className="text-neutral-400">
            All participants, certificates, issuance metrics, and verification states are simulated demo data. Real participant databases and issuance services are isolated from this phase.
          </span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-neutral-400 hover:text-white p-1 rounded-md transition-colors"
          title="Dismiss banner"
          aria-label="Dismiss demo banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

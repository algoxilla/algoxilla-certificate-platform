"use client";

import React, { useState } from "react";
import Image from "next/image";
import { 
  Calendar, 
  Globe, 
  ShieldCheck, 
  QrCode, 
  Download, 
  Layers, 
  Sparkles, 
  FileText 
} from "lucide-react";

interface CertificatePreviewProps {
  recipientName?: string;
  certificateId?: string;
  issueDate?: string;
  verificationHash?: string;
  onDownloadMock?: () => void;
  onRequestCorrection?: () => void;
}

export default function CertificatePreview({
  recipientName = "Alex Chen",
  certificateId = "MOCK-ALGO26-8942",
  issueDate = "4 October 2026",
  verificationHash = "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  onDownloadMock,
  onRequestCorrection,
}: CertificatePreviewProps) {
  const [viewMode, setViewMode] = useState<"rendered" | "reference">("rendered");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStep, setDownloadStep] = useState<string | null>(null);

  const handleDownload = () => {
    setIsDownloading(true);
    setDownloadStep("Validating mock cryptographic hash...");
    setTimeout(() => {
      setDownloadStep("Compiling PDF vector layout...");
      setTimeout(() => {
        setDownloadStep("Complete! Triggering mock download.");
        setTimeout(() => {
          setIsDownloading(false);
          setDownloadStep(null);
          if (onDownloadMock) {
            onDownloadMock();
          } else {
            // Trigger sample mock file download
            const element = document.createElement("a");
            const file = new Blob([
              `ALGOXILLA CERTIFICATE OF PARTICIPATION (MOCK DEMO)
Recipient: ${recipientName}
Event: ALGOTHON'26 — A NATIONAL LEVEL HACKATHON
Date: ${issueDate}
Certificate ID: ${certificateId}
Verification Hash: ${verificationHash}
Verification URL: https://certificates.algoxilla.com/verify/${certificateId}
Notice: This is a synthetic mock record generated for Phase 1 UI validation.`
            ], { type: "text/plain" });
            element.href = URL.createObjectURL(file);
            element.download = `${certificateId}_Mock_Certificate.txt`;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
          }
        }, 800);
      }, 700);
    }, 600);
  };

  return (
    <div className="w-full space-y-4">
      {/* View Switcher & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900/90 border border-neutral-800 p-2.5 rounded-xl">
        <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-lg border border-neutral-800/80">
          <button
            onClick={() => setViewMode("rendered")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              viewMode === "rendered"
                ? "bg-red-600 text-white shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Interactive Mock Preview
          </button>
          <button
            onClick={() => setViewMode("reference")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              viewMode === "reference"
                ? "bg-red-600 text-white shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Authentic Template Master
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onRequestCorrection && (
            <button
              onClick={onRequestCorrection}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 transition-colors flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              Request Correction
            </button>
          )}

          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition-all shadow-md shadow-red-950/40 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {isDownloading ? (downloadStep || "Generating PDF...") : "Download Certificate (Mock PDF)"}
          </button>
        </div>
      </div>

      {/* Mode 1: Interactive Rendered Certificate */}
      {viewMode === "rendered" ? (
        <div className="relative w-full overflow-hidden rounded-xl border-2 border-neutral-800 shadow-2xl bg-white text-neutral-900 select-none">
          {/* Top Mock Watermark Ribbon */}
          <div className="bg-red-600 text-white text-[11px] font-mono font-bold tracking-widest uppercase text-center py-1">
            [MOCK PREVIEW] • SYNTHETIC DEMONSTRATION RECORD • NOT AN OFFICIAL ISSUANCE
          </div>

          <div className="p-6 sm:p-10 md:p-12 relative flex flex-col justify-between min-h-[540px] md:min-h-[640px]">
            {/* Geometric Corner Accents */}
            <div className="absolute top-2 left-2 w-16 h-16 border-t-4 border-l-4 border-black pointer-events-none">
              <div className="w-3 h-3 bg-red-600 absolute -top-1 -left-1"></div>
            </div>
            <div className="absolute top-2 right-2 w-16 h-16 border-t-4 border-r-4 border-black pointer-events-none">
              <div className="w-3 h-3 bg-red-600 absolute -top-1 -right-1"></div>
            </div>
            <div className="absolute bottom-2 left-2 w-16 h-16 border-b-4 border-l-4 border-black pointer-events-none">
              <div className="w-3 h-3 bg-red-600 absolute -bottom-1 -left-1"></div>
            </div>
            <div className="absolute bottom-2 right-2 w-16 h-16 border-b-4 border-r-4 border-black pointer-events-none">
              <div className="w-3 h-3 bg-red-600 absolute -bottom-1 -right-1"></div>
            </div>

            {/* Inner Border Line */}
            <div className="absolute inset-4 sm:inset-6 border border-neutral-300 pointer-events-none"></div>

            {/* Certificate Header Row */}
            <div className="relative z-10 flex items-center justify-between pb-4 border-b border-neutral-200">
              {/* Algoxilla Logo Asset */}
              <div className="relative h-10 w-32 sm:h-12 sm:w-40">
                <Image
                  src="/brand/algoxilla-logo.jpg"
                  alt="Algoxilla Official Logo"
                  fill
                  sizes="160px"
                  className="object-contain object-left"
                />
              </div>

              {/* Tagline */}
              <div className="text-right">
                <span className="text-[10px] sm:text-xs tracking-[0.25em] text-neutral-600 font-mono font-semibold">
                  BUILD • COLLABORATE • SOLVE • GROW
                </span>
              </div>
            </div>

            {/* Event Name & Hackathon Designation */}
            <div className="relative z-10 text-center py-4 sm:py-6 space-y-1">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-neutral-900">
                ALGOTHON<span className="text-red-600">&apos;26</span>
              </h2>
              <div className="flex items-center justify-center gap-3">
                <div className="h-px w-12 sm:w-20 bg-neutral-400"></div>
                <p className="text-[11px] sm:text-xs tracking-[0.2em] font-semibold text-neutral-600 uppercase">
                  A National Level Hackathon
                </p>
                <div className="h-px w-12 sm:w-20 bg-neutral-400"></div>
              </div>
            </div>

            {/* Certificate Title */}
            <div className="relative z-10 text-center space-y-2 py-2">
              <h1 className="font-serif-classic text-3xl sm:text-5xl md:text-6xl tracking-widest uppercase font-bold text-neutral-950">
                CERTIFICATE
              </h1>
              <div className="flex items-center justify-center gap-3">
                <div className="h-0.5 w-16 sm:w-28 bg-red-600"></div>
                <p className="text-xs sm:text-sm tracking-[0.3em] font-bold text-red-600 uppercase">
                  OF PARTICIPATION
                </p>
                <div className="h-0.5 w-16 sm:w-28 bg-red-600"></div>
              </div>
            </div>

            {/* Recipient Presentation */}
            <div className="relative z-10 text-center space-y-2 sm:space-y-3 py-4">
              <p className="text-[11px] sm:text-xs tracking-[0.25em] text-neutral-500 font-semibold uppercase">
                THIS CERTIFICATE IS PROUDLY PRESENTED TO
              </p>
              
              {/* Recipient Name Field */}
              <div className="inline-block border-b-2 border-neutral-900 pb-1 px-8 min-w-[280px]">
                <span className="font-serif-classic text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 tracking-wide">
                  {recipientName}
                </span>
              </div>
            </div>

            {/* Central Diamond Star Decal */}
            <div className="relative z-10 flex justify-center py-1">
              <div className="text-red-600 text-lg">✦</div>
            </div>

            {/* Citation Text */}
            <div className="relative z-10 text-center max-w-2xl mx-auto px-4">
              <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed font-sans">
                for actively participating in <strong className="text-neutral-900 font-semibold">ALGOTHON&apos;26</strong>, organized by <strong className="text-neutral-900 font-semibold">Algoxilla</strong>, celebrating innovation, technical skills, collaboration and problem solving. Your enthusiasm, creativity and contribution made the event a meaningful and inspiring experience.
              </p>
            </div>

            {/* Signatures & Seal Row */}
            <div className="relative z-10 grid grid-cols-3 items-end pt-6 sm:pt-8 text-center">
              {/* Dev Raj - Left Signature */}
              <div className="space-y-1">
                <div className="font-serif italic text-lg sm:text-xl text-neutral-800 tracking-wider">
                  Dev Raj
                </div>
                <div className="w-28 sm:w-36 h-px bg-neutral-800 mx-auto"></div>
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  DEV RAJ
                </p>
                <p className="text-[10px] text-neutral-600 font-medium">
                  Co-Founder, Algoxilla
                </p>
              </div>

              {/* Central Seal / Rosette Badge */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-neutral-950 border-2 border-red-600 flex items-center justify-center shadow-lg relative">
                  <div className="w-10 h-10 rounded-full border border-neutral-700 flex items-center justify-center">
                    <span className="text-red-500 text-lg">✦</span>
                  </div>
                  {/* Rosette Ribbon tails */}
                  <div className="absolute -bottom-2 w-3 h-5 bg-red-600 transform -rotate-12 rounded-b"></div>
                  <div className="absolute -bottom-2 w-3 h-5 bg-red-600 transform rotate-12 rounded-b"></div>
                </div>
                <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-500 mt-2">
                  Official Seal
                </span>
              </div>

              {/* Aditya Raj - Right Signature */}
              <div className="space-y-1">
                <div className="font-serif italic text-lg sm:text-xl text-neutral-800 tracking-wider">
                  Aditya Raj
                </div>
                <div className="w-28 sm:w-36 h-px bg-neutral-800 mx-auto"></div>
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  ADITYA RAJ
                </p>
                <p className="text-[10px] text-neutral-600 font-medium">
                  Co-Founder, Algoxilla
                </p>
              </div>
            </div>

            {/* Bottom Metadata & Verification Info */}
            <div className="relative z-10 flex items-center justify-between pt-6 border-t border-neutral-200 mt-4 text-[10px] sm:text-xs text-neutral-600">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-neutral-800" />
                <div>
                  <span className="font-bold text-neutral-900 uppercase">Event Date: </span>
                  <span>{issueDate}</span>
                </div>
              </div>

              {/* Certificate Verification Stamp */}
              <div className="flex items-center gap-2 bg-neutral-100 px-2.5 py-1 rounded border border-neutral-300 font-mono text-[10px]">
                <QrCode className="w-3.5 h-3.5 text-neutral-700" />
                <span className="font-semibold text-neutral-900">{certificateId}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-neutral-800" />
                <div>
                  <span className="font-bold text-neutral-900 uppercase">Organized By: </span>
                  <span>ALGOXILLA</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Mode 2: Authentic Master Reference Image View */
        <div className="relative w-full overflow-hidden rounded-xl border-2 border-red-500/40 shadow-2xl bg-neutral-950 p-2">
          <div className="bg-neutral-900 text-neutral-300 text-xs px-4 py-2 rounded-t-lg flex items-center justify-between">
            <span className="font-mono flex items-center gap-1.5 text-red-400">
              <Layers className="w-4 h-4" />
              Algothon’26 Master Template Reference (Authentic Artwork & Signatures)
            </span>
            <span className="text-[11px] text-neutral-400">
              Original Dimensions: 1491 × 1055 px
            </span>
          </div>
          <div className="relative w-full aspect-[1491/1055] overflow-hidden rounded-b-lg">
            <Image
              src="/brand/algothon26-certificate-reference.png"
              alt="Authentic Algothon'26 Participation Certificate Reference"
              fill
              sizes="(max-width: 1200px) 100vw, 1200px"
              className="object-contain"
              priority
            />
          </div>
          <div className="p-3 text-[11px] text-neutral-400 font-mono text-center">
            Source: Organizer Master Vector Render (`Minimalist Algothon’26 Participation Certificate.png`)
          </div>
        </div>
      )}

      {/* Simulated Verification Hash Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 bg-neutral-950/70 border border-neutral-800/80 rounded-lg text-xs font-mono text-neutral-400">
        <div className="flex items-center gap-2 truncate max-w-full">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">
            <strong className="text-neutral-300">Mock Cryptographic Hash:</strong> {verificationHash}
          </span>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded">
          Verifiable State: Authentic
        </span>
      </div>
    </div>
  );
}

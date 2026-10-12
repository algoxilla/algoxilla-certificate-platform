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
  FileText,
  CheckCircle2,
  Lock
} from "lucide-react";
import { generateMockCertificatePdf } from "@/lib/generateMockPdf";
import { calculateParticipantNameLayout } from "@/lib/certificateLayout";

interface CertificatePreviewProps {
  recipientName?: string;
  certificateId?: string;
  issueDate?: string;
  verificationHash?: string;
  defaultViewMode?: "rendered" | "reference";
  onDownloadMock?: () => void;
  onDownloadOfficial?: (docHash: string) => void;
  onRequestCorrection?: () => void;
}

export default function CertificatePreview({
  recipientName = "Alex Chen",
  certificateId = "ALGO-2026-HACK-7892",
  issueDate = "4 October 2026",
  verificationHash = "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  defaultViewMode = "reference",
  onDownloadMock,
  onDownloadOfficial,
  onRequestCorrection,
}: CertificatePreviewProps) {
  const [viewMode, setViewMode] = useState<"rendered" | "reference">(defaultViewMode);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStep, setDownloadStep] = useState<string | null>(null);
  const [lastDocumentHash, setLastDocumentHash] = useState<string | null>(null);
  const nameLayout = calculateParticipantNameLayout(recipientName);

  // Dedicated Handler: Download Official Personalized PDF via server download route
  const handleDownloadOfficial = async () => {
    setIsDownloading(true);
    setDownloadStep("Requesting official certificate from registry...");
    try {
      const response = await fetch(`/api/certificate/${encodeURIComponent(certificateId)}/download`);

      if (!response.ok) {
        let errorMsg = "Failed to generate official certificate PDF.";
        try {
          const errorData = await response.json();
          if (errorData.error) errorMsg = errorData.error;
        } catch {
          // ignore parsing error if response is not JSON
        }
        throw new Error(errorMsg);
      }

      setDownloadStep("Validating cryptographic signature & hashes...");
      const docHash = response.headers.get("x-document-hash");
      if (docHash) {
        setLastDocumentHash(docHash);
        if (onDownloadOfficial) {
          onDownloadOfficial(docHash);
        }
      }

      setDownloadStep("Downloading A4 Landscape PDF...");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const element = document.createElement("a");
      element.href = url;
      element.download = `${certificateId}_Official_Algothon26_Certificate.pdf`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: unknown) {
      console.error("Official PDF download error:", err);
      const message = err instanceof Error ? err.message : "Failed to generate official certificate PDF. Please retry or contact support.";
      alert(message);
    } finally {
      setIsDownloading(false);
      setDownloadStep(null);
    }
  };

  // Dedicated Handler: Download Mock Demo PDF
  const handleDownloadMock = async () => {
    setIsDownloading(true);
    setDownloadStep("Compiling mock vector layout...");
    try {
      await new Promise((r) => setTimeout(r, 300));
      const pdfBlob = await generateMockCertificatePdf({
        recipientName,
        certificateId,
        issueDate,
        verificationHash,
      });

      if (onDownloadMock) {
        onDownloadMock();
      }

      const url = URL.createObjectURL(pdfBlob);
      const element = document.createElement("a");
      element.href = url;
      element.download = `${certificateId}_Mock_Demo_Certificate.pdf`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Mock PDF generation error:", err);
    } finally {
      setIsDownloading(false);
      setDownloadStep(null);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* View Switcher & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900/90 border border-neutral-800 p-2.5 rounded-xl">
        <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-lg border border-neutral-800/80">
          <button
            onClick={() => setViewMode("reference")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              viewMode === "reference"
                ? "bg-red-600 text-white shadow-sm font-semibold"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Authentic Master Certificate
          </button>
          <button
            onClick={() => setViewMode("rendered")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              viewMode === "rendered"
                ? "bg-neutral-800 text-white shadow-sm font-semibold"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Interactive Mock Preview [Demo]
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

          {/* Differentiated Download Action based on View Mode */}
          {viewMode === "reference" ? (
            <button
              onClick={handleDownloadOfficial}
              disabled={isDownloading}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all shadow-md shadow-emerald-950/40 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? (downloadStep || "Generating Official PDF...") : "Download Official Certificate (A4 PDF)"}
            </button>
          ) : (
            <button
              onClick={handleDownloadMock}
              disabled={isDownloading}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 disabled:opacity-50 text-neutral-300 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {isDownloading ? (downloadStep || "Generating...") : "Download Mock Preview (Demo PDF)"}
            </button>
          )}
        </div>
      </div>

      {/* Mode 1: Authentic Master Reference Image with Personalized Overlay */}
      {viewMode === "reference" ? (
        <div className="relative w-full overflow-hidden rounded-xl border-2 border-emerald-500/40 shadow-2xl bg-neutral-950 p-2">
          <div className="bg-neutral-900 text-neutral-300 text-xs px-4 py-2.5 rounded-t-lg flex items-center justify-between">
            <span className="font-mono flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Official Algothon’26 Master Artwork (Authorized Signatures: Dev Raj & Aditya Raj)
            </span>
            <span className="text-[11px] font-mono text-neutral-400">
              A4 Landscape (297 × 210 mm)
            </span>
          </div>

          <div className="relative w-full aspect-[1491/1055] overflow-hidden rounded-b-lg bg-[#FAF9F6]">
            {/* Master Artwork Base */}
            <Image
              src="/brand/algothon26-certificate-reference.png?v=20261011-auth"
              alt="Authentic Algothon'26 Participation Certificate Reference"
              fill
              sizes="(max-width: 1200px) 100vw, 1200px"
              className="object-contain"
              priority
              unoptimized
            />

            {/* Personalized Recipient Name Vector Overlay matching PDF typography & layout */}
            <svg 
              viewBox="0 0 1491 1055"
              className="absolute inset-0 w-full h-full pointer-events-none select-none"
              aria-label={`Certificate awarded to ${recipientName}`}
            >
              {nameLayout.lineDetails.map((line, idx) => (
                <text
                  key={idx}
                  x={line.svgX}
                  y={line.svgY}
                  textAnchor="middle"
                  fontFamily="Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                  fontWeight="bold"
                  fontSize={nameLayout.svgFontSize}
                  fill="#0d0d0d"
                  letterSpacing="0.015em"
                  className="drop-shadow-sm"
                >
                  {line.text}
                </text>
              ))}
            </svg>

            {/* Active Verification QR Code Stamp Overlay in designated open bottom region */}
            <div 
              className="absolute pointer-events-none"
              style={{
                bottom: "3.8%",
                left: "57.6%",
              }}
            >
              <div className="bg-white/95 border border-neutral-300 rounded px-2 py-1 shadow-sm flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-neutral-900" />
                <div className="text-[7px] font-mono leading-tight text-neutral-800">
                  <div className="font-bold text-red-600">OFFICIAL VERIFICATION</div>
                  <div className="font-semibold text-neutral-900">{certificateId}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 text-[11px] text-neutral-400 font-mono text-center flex flex-wrap items-center justify-center gap-4 border-t border-neutral-900">
            <span>Official Master Vector Stamped</span>
            <span>•</span>
            <span>Includes Canonical QR Code</span>
            <span>•</span>
            <span className="text-amber-400 font-semibold">Test Artifact (Public Domain Pending DNS)</span>
          </div>
        </div>
      ) : (
        /* Mode 2: Interactive Mock Rendered Certificate (Explicitly Labeled Demo) */
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

            {/* Header: Brand & Tagline */}
            <div className="flex justify-between items-start border-b border-neutral-200 pb-4">
              <div className="space-y-0.5">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-red-600">
                  ALGOXILLA
                </span>
                <span className="text-[10px] font-mono text-neutral-400 block tracking-widest uppercase">
                  Technical Innovation Lab
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-semibold tracking-wider text-neutral-500 uppercase">
                  BUILD • COLLABORATE • SOLVE • GROW
                </span>
              </div>
            </div>

            {/* Certificate Core Information */}
            <div className="text-center space-y-4 my-auto py-4">
              <div className="space-y-1">
                <span className="text-xl sm:text-2xl font-extrabold tracking-widest text-neutral-900 block font-sans">
                  ALGOTHON&apos;26
                </span>
                <span className="text-xs font-mono tracking-widest text-neutral-500 uppercase">
                  A National Level Hackathon
                </span>
              </div>

              <div className="space-y-1 pt-2">
                <h2 className="text-3xl sm:text-5xl font-black tracking-tight font-serif text-neutral-950">
                  CERTIFICATE
                </h2>
                <span className="text-xs sm:text-sm font-mono font-bold tracking-widest text-red-600 uppercase">
                  OF PARTICIPATION
                </span>
              </div>

              <div className="space-y-2 pt-3 max-w-2xl mx-auto">
                <p className="text-xs font-mono text-neutral-500 tracking-wider uppercase">
                  This Certificate is Proudly Presented to
                </p>
                <div className="border-b-2 border-neutral-900 pb-2 inline-block min-w-[280px] max-w-full">
                  <h3 className={`font-extrabold text-neutral-900 font-serif tracking-wide break-words ${
                    recipientName.length > 32
                      ? "text-lg sm:text-2xl"
                      : recipientName.length > 22
                      ? "text-xl sm:text-3xl"
                      : "text-2xl sm:text-4xl"
                  }`}>
                    {recipientName}
                  </h3>
                </div>
              </div>

              <div className="max-w-xl mx-auto pt-2">
                <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed font-sans">
                  for actively participating in <strong>ALGOTHON&apos;26</strong>, organized by Algoxilla, celebrating innovation, technical skills, collaboration and problem solving. Your enthusiasm, creativity and contribution made the event a meaningful and inspiring experience.
                </p>
              </div>
            </div>

            {/* Signatures & Seal Section */}
            <div className="pt-6 border-t border-neutral-200">
              <div className="grid grid-cols-3 items-end text-center gap-2">
                {/* Signatory 1: Dev Raj */}
                <div className="space-y-1">
                  <div className="h-10 flex items-center justify-center">
                    <Image 
                      src="/brand/signatures/dev_raj_signature.png" 
                      alt="Dev Raj Signature" 
                      width={140}
                      height={32}
                      className="h-8 max-w-[140px] w-auto object-contain select-none" 
                    />
                  </div>
                  <div className="w-32 h-0.5 bg-neutral-900 mx-auto"></div>
                  <span className="text-xs font-bold text-neutral-900 block uppercase tracking-wider">
                    DEV RAJ
                  </span>
                  <span className="text-[10px] text-neutral-500 block">
                    Co-Founder, Algoxilla
                  </span>
                </div>

                {/* Central Wax Seal */}
                <div className="flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-neutral-950 border-2 border-red-600 flex items-center justify-center shadow-lg relative">
                    <div className="w-10 h-10 rounded-full border border-neutral-700 flex items-center justify-center">
                      <span className="text-red-600 font-bold text-xs tracking-tighter">ALGO</span>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono text-neutral-400 mt-1 uppercase tracking-widest">
                    OFFICIAL SEAL
                  </span>
                </div>

                {/* Signatory 2: Aditya Raj */}
                <div className="space-y-1">
                  <div className="h-10 flex items-center justify-center">
                    <Image 
                      src="/brand/signatures/aditya_raj_signature.png" 
                      alt="Aditya Raj Signature" 
                      width={140}
                      height={32}
                      className="h-8 max-w-[140px] w-auto object-contain select-none" 
                    />
                  </div>
                  <div className="w-32 h-0.5 bg-neutral-900 mx-auto"></div>
                  <span className="text-xs font-bold text-neutral-900 block uppercase tracking-wider">
                    ADITYA RAJ
                  </span>
                  <span className="text-[10px] text-neutral-500 block">
                    Co-Founder, Algoxilla
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Metadata Bar */}
            <div className="pt-4 flex flex-wrap items-center justify-between text-[11px] font-mono text-neutral-600 border-t border-neutral-100 mt-4 gap-2">
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
      )}

      {/* Cryptographic & Verification Hash Footer */}
      <div className="space-y-2 p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-xl text-xs font-mono text-neutral-400">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate max-w-full">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">
              <strong className="text-neutral-300">Registry Metadata Digest (SHA-256):</strong> {verificationHash}
            </span>
          </div>
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded">
            State: Approved
          </span>
        </div>

        {lastDocumentHash && (
          <div className="flex items-center gap-2 pt-1 border-t border-neutral-800/60 text-emerald-300 text-[11px]">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">
              <strong className="text-white">Generated PDF Binary Document Hash (SHA-256):</strong> {lastDocumentHash}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

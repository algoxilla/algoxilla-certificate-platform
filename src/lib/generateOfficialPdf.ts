// Algoxilla Certificate Platform - Official Algothon'26 PDF Generator
// Generates genuine personalized A4 Landscape (297 x 210 mm) credentials
// based on the approved Algothon'26 master certificate artwork.
//
// Key Specifications:
// - A4 Landscape page dimensions: 842 x 595 points (297 x 210 mm).
// - Embeds genuine master artwork with authorized signatures of Dev Raj & Aditya Raj.
// - Supports Unicode characters, accents, non-English scripts, and dynamic long-name scaling.
// - Embeds high-contrast QR code resolving to canonical public verification URL.
// - Computes documentHash (SHA-256 over final PDF binary bytes).

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import crypto from "node:crypto";
import { getVerificationUrl, isLocalDevUrl } from "./config.ts";
import { calculateParticipantNameLayout } from "./certificateLayout.ts";

export interface GenerateOfficialPdfOptions {
  recipientName: string;
  certificateId: string;
  issueDate?: string; // Default: "4 October 2026"
  preferPublicDomain?: boolean; // Default: true for official credentials
  verificationBaseUrl?: string; // Optional custom verification base URL override
  artworkBytes?: Uint8Array; // Optional preloaded artwork buffer
  fontBytes?: Uint8Array; // Optional preloaded font buffer
}

export interface OfficialCertificatePdfResult {
  pdfBytes: Uint8Array;
  blob: Blob;
  documentHash: string; // SHA-256 of final PDF binary bytes
  metadataHash: string; // Canonical SHA-256 digest over certificate metadata
  certificateId: string;
  verificationUrl: string;
  recipientName: string;
}

/**
 * Isomorphically loads an asset buffer in either Node.js or browser environments.
 * Checks multiple candidate paths for robust execution across serverless/standalone runtimes.
 */
async function loadAssetBuffer(relativePath: string): Promise<Uint8Array> {
  const cleanPath = relativePath.replace(/^\//, "");
  if (typeof window === "undefined") {
    const fs = await import("node:fs");
    const path = await import("node:path");
    
    const candidatePaths = [
      path.join(process.cwd(), "public", cleanPath),
      path.join(process.cwd(), ".next", "standalone", "public", cleanPath),
      path.resolve("public", cleanPath),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return new Uint8Array(fs.readFileSync(p));
      }
    }

    throw new Error(`Master asset not found at any candidate path: ${candidatePaths.join(" | ")}`);
  } else {
    const res = await fetch(`/${cleanPath}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch master asset: /${cleanPath}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return new Uint8Array(arrayBuf);
  }
}

/**
 * Generates an authentic personalized Algothon'26 certificate PDF.
 */
export async function generateOfficialCertificatePdf({
  recipientName,
  certificateId,
  issueDate = "4 October 2026",
  preferPublicDomain = true,
  verificationBaseUrl,
  artworkBytes,
  fontBytes,
}: GenerateOfficialPdfOptions): Promise<OfficialCertificatePdfResult> {
  const trimmedName = recipientName.trim();
  if (!trimmedName) {
    throw new Error("Cannot generate certificate: recipientName is empty.");
  }
  if (!certificateId.trim()) {
    throw new Error("Cannot generate certificate: certificateId is empty.");
  }

  // 1. Initialize PDF Document & Register Fontkit
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // A4 Landscape dimensions in PDF points: 841.89 x 595.28 pt (842 x 595)
  const pageWidth = 842;
  const pageHeight = 595;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  // 2. Load and Embed Master Artwork Background
  const rawArtwork = artworkBytes || (await loadAssetBuffer("brand/algothon26-certificate-reference.png"));
  const backgroundPng = await pdfDoc.embedPng(rawArtwork);

  // Draw background across full A4 landscape page
  page.drawImage(backgroundPng, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });

  // 3. Load Fonts (Custom Unicode Arial Bold + Regular, with graceful standard font fallback)
  let titleFont;
  let regularFont;
  try {
    const rawFont = fontBytes || (await loadAssetBuffer("fonts/arialbd.ttf"));
    titleFont = await pdfDoc.embedFont(rawFont);
  } catch {
    titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  try {
    const rawRegFont = await loadAssetBuffer("fonts/arial.ttf");
    regularFont = await pdfDoc.embedFont(rawRegFont);
  } catch {
    regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  // 4. Position & Dynamically Scale Participant Name in Recipient Area
  const nameLayout = calculateParticipantNameLayout(trimmedName, (text, size) =>
    titleFont.widthOfTextAtSize(text, size)
  );

  for (const line of nameLayout.lineDetails) {
    page.drawText(line.text, {
      x: line.pdfX,
      y: line.pdfY,
      size: nameLayout.pdfFontSize,
      font: titleFont,
      color: rgb(0.05, 0.05, 0.05), // Rich carbon black
    });
  }

  // 5. Generate QR Code pointing to canonical public verification URL
  const verificationUrl = getVerificationUrl(certificateId, preferPublicDomain, verificationBaseUrl);
  const isDevUrl = isLocalDevUrl(verificationUrl);

  const qrPngBuffer = await QRCode.toBuffer(verificationUrl, {
    type: "png",
    width: 256,
    margin: 1,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });

  const qrImage = await pdfDoc.embedPng(new Uint8Array(qrPngBuffer));

  // 6. Draw Official Verification Badge in Open Region (x: 485, y: 24)
  // This area sits right above the bottom line, between the wax seal and "ORGANIZED BY ALGOXILLA"
  // Completely clear of signatures and seal ribbons.
  const badgeX = 485;
  const badgeY = 22;
  const badgeW = 175;
  const badgeH = 46;

  // Crisp white container card
  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeW,
    height: badgeH,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 0.75,
  });

  // Left red accent strip
  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: 2.5,
    height: badgeH,
    color: rgb(0.898, 0.035, 0.078), // Algoxilla Red
  });

  // Embed QR image inside badge
  const qrDisplaySize = 38;
  page.drawImage(qrImage, {
    x: badgeX + 6,
    y: badgeY + 4,
    width: qrDisplaySize,
    height: qrDisplaySize,
  });

  // Text inside verification badge
  page.drawText("OFFICIAL VERIFICATION", {
    x: badgeX + 48,
    y: badgeY + 34,
    size: 6.5,
    font: titleFont,
    color: rgb(0.898, 0.035, 0.078),
  });

  page.drawText(certificateId, {
    x: badgeX + 48,
    y: badgeY + 23,
    size: 7.5,
    font: titleFont,
    color: rgb(0.08, 0.08, 0.08),
  });

  page.drawText("Scan QR to verify credential", {
    x: badgeX + 48,
    y: badgeY + 14,
    size: 6,
    font: regularFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  const isDomainLive = process.env.NEXT_PUBLIC_APP_LIVE === "true";
  if (isDevUrl) {
    page.drawText("[DEV TEST ARTIFACT]", {
      x: badgeX + 48,
      y: badgeY + 5.5,
      size: 5,
      font: regularFont,
      color: rgb(0.7, 0.2, 0.2),
    });
  } else if (!isDomainLive) {
    page.drawText("[TEST ARTIFACT • DNS PENDING]", {
      x: badgeX + 48,
      y: badgeY + 5.5,
      size: 5,
      font: regularFont,
      color: rgb(0.7, 0.2, 0.2),
    });
  }

  // 7. Save PDF & Compute Hashes
  const pdfBytes = await pdfDoc.save();

  // documentHash: SHA-256 of the actual final binary PDF bytes
  const documentHash = crypto
    .createHash("sha256")
    .update(Buffer.from(pdfBytes))
    .digest("hex");

  // metadataHash: Canonical SHA-256 digest over certificate metadata attributes
  const metadataHash = crypto
    .createHash("sha256")
    .update(`${certificateId}:${trimmedName}:PARTICIPATION:${issueDate}`)
    .digest("hex");
  const arrayBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });

  return {
    pdfBytes,
    blob,
    documentHash,
    metadataHash,
    certificateId,
    verificationUrl,
    recipientName: trimmedName,
  };
}

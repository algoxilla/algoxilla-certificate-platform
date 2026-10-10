// Algoxilla Certificate Platform - Genuine Mock PDF Generator
// Creates valid vector-rendered A4 Landscape PDF certificates matching the Algothon'26 specification.
// Generates actual binary PDF files (MIME: application/pdf) using pdf-lib.

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { getVerificationUrl } from "./config";

export interface GeneratePdfOptions {
  recipientName: string;
  certificateId: string;
  issueDate?: string;
  verificationHash?: string;
}

export async function generateMockCertificatePdf({
  recipientName,
  certificateId,
  issueDate = "4 October 2026",
  verificationHash = "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
}: GeneratePdfOptions): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();

  // Standard A4 landscape dimensions in points: 841.89 x 595.28 pt
  const width = 842;
  const height = 595;
  const page = pdfDoc.addPage([width, height]);

  // Embed standard clean fonts
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  // Colors
  const black = rgb(0.05, 0.05, 0.05);
  const red = rgb(0.898, 0.035, 0.078); // Algoxilla Red #E50914
  const darkGray = rgb(0.3, 0.3, 0.3);
  const lightGray = rgb(0.85, 0.85, 0.85);

  // Background Fill
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(0.99, 0.99, 0.99),
  });

  // Top Mock Watermark Ribbon
  page.drawRectangle({
    x: 0,
    y: height - 20,
    width,
    height: 20,
    color: red,
  });
  const bannerText = "[MOCK CERTIFICATE] • SYNTHETIC DEMONSTRATION RECORD • PHASE 1 UI VALIDATION";
  const bannerWidth = courier.widthOfTextAtSize(bannerText, 9);
  page.drawText(bannerText, {
    x: (width - bannerWidth) / 2,
    y: height - 14,
    size: 9,
    font: courier,
    color: rgb(1, 1, 1),
  });

  // Outer Border
  page.drawRectangle({
    x: 25,
    y: 25,
    width: width - 50,
    height: height - 65,
    borderColor: black,
    borderWidth: 2,
  });

  // Inner Border
  page.drawRectangle({
    x: 32,
    y: 32,
    width: width - 64,
    height: height - 79,
    borderColor: lightGray,
    borderWidth: 1,
  });

  // Corner Accents (Red squares at 4 corners)
  const cornerSize = 8;
  page.drawRectangle({ x: 23, y: height - 42, width: cornerSize, height: cornerSize, color: red });
  page.drawRectangle({ x: width - 31, y: height - 42, width: cornerSize, height: cornerSize, color: red });
  page.drawRectangle({ x: 23, y: 23, width: cornerSize, height: cornerSize, color: red });
  page.drawRectangle({ x: width - 31, y: 23, width: cornerSize, height: cornerSize, color: red });

  // 1. Header: Brand Logo & Tagline
  page.drawText("ALGOXILLA", {
    x: 50,
    y: height - 70,
    size: 20,
    font: helveticaBold,
    color: red,
  });

  const tagline = "BUILD • COLLABORATE • SOLVE • GROW";
  const taglineWidth = helveticaBold.widthOfTextAtSize(tagline, 9);
  page.drawText(tagline, {
    x: width - 50 - taglineWidth,
    y: height - 68,
    size: 9,
    font: helveticaBold,
    color: darkGray,
  });

  // Header separator line
  page.drawLine({
    start: { x: 50, y: height - 85 },
    end: { x: width - 50, y: height - 85 },
    color: lightGray,
    thickness: 1,
  });

  // 2. Event Title: ALGOTHON'26
  const eventTitle = "ALGOTHON'26";
  const eventTitleWidth = helveticaBold.widthOfTextAtSize(eventTitle, 28);
  page.drawText(eventTitle, {
    x: (width - eventTitleWidth) / 2,
    y: height - 130,
    size: 28,
    font: helveticaBold,
    color: black,
  });

  const hackathonSub = "A NATIONAL LEVEL HACKATHON";
  const hackathonSubWidth = helvetica.widthOfTextAtSize(hackathonSub, 10);
  page.drawText(hackathonSub, {
    x: (width - hackathonSubWidth) / 2,
    y: height - 146,
    size: 10,
    font: helvetica,
    color: darkGray,
  });

  // 3. Certificate Title
  const certTitle = "CERTIFICATE";
  const certTitleWidth = timesBold.widthOfTextAtSize(certTitle, 40);
  page.drawText(certTitle, {
    x: (width - certTitleWidth) / 2,
    y: height - 205,
    size: 40,
    font: timesBold,
    color: black,
  });

  const certSub = "OF PARTICIPATION";
  const certSubWidth = helveticaBold.widthOfTextAtSize(certSub, 12);
  page.drawText(certSub, {
    x: (width - certSubWidth) / 2,
    y: height - 225,
    size: 12,
    font: helveticaBold,
    color: red,
  });

  // 4. Recipient Presentation
  const presText = "THIS CERTIFICATE IS PROUDLY PRESENTED TO";
  const presWidth = helvetica.widthOfTextAtSize(presText, 10);
  page.drawText(presText, {
    x: (width - presWidth) / 2,
    y: height - 265,
    size: 10,
    font: helvetica,
    color: darkGray,
  });

  // Recipient Name
  const nameWidth = timesBold.widthOfTextAtSize(recipientName, 26);
  page.drawText(recipientName, {
    x: (width - nameWidth) / 2,
    y: height - 305,
    size: 26,
    font: timesBold,
    color: black,
  });

  // Underline for recipient name
  page.drawLine({
    start: { x: Math.min((width - nameWidth) / 2 - 20, width / 2 - 140), y: height - 312 },
    end: { x: Math.max((width + nameWidth) / 2 + 20, width / 2 + 140), y: height - 312 },
    color: black,
    thickness: 1.5,
  });

  // Citation text (wrapped)
  const citationLine1 = "for actively participating in ALGOTHON'26, organized by Algoxilla, celebrating innovation,";
  const citationLine2 = "technical skills, collaboration and problem solving. Your enthusiasm, creativity and contribution made the";
  const citationLine3 = "event a meaningful and inspiring experience.";

  const c1Width = helvetica.widthOfTextAtSize(citationLine1, 10);
  const c2Width = helvetica.widthOfTextAtSize(citationLine2, 10);
  const c3Width = helvetica.widthOfTextAtSize(citationLine3, 10);

  page.drawText(citationLine1, { x: (width - c1Width) / 2, y: height - 345, size: 10, font: helvetica, color: darkGray });
  page.drawText(citationLine2, { x: (width - c2Width) / 2, y: height - 360, size: 10, font: helvetica, color: darkGray });
  page.drawText(citationLine3, { x: (width - c3Width) / 2, y: height - 375, size: 10, font: helvetica, color: darkGray });

  // 5. Signatories & Central Seal
  // Dev Raj
  page.drawText("Dev Raj", { x: 120, y: height - 440, size: 16, font: timesItalic, color: black });
  page.drawLine({ start: { x: 90, y: height - 446 }, end: { x: 210, y: height - 446 }, color: black, thickness: 1 });
  page.drawText("DEV RAJ", { x: 122, y: height - 460, size: 10, font: helveticaBold, color: black });
  page.drawText("Co-Founder, Algoxilla", { x: 102, y: height - 473, size: 8.5, font: helvetica, color: darkGray });

  // Central Seal
  page.drawCircle({ x: width / 2, y: height - 450, size: 24, color: black });
  page.drawCircle({ x: width / 2, y: height - 450, size: 21, borderColor: red, borderWidth: 1.5 });
  page.drawText("+", { x: width / 2 - 4, y: height - 454, size: 14, font: helveticaBold, color: red });

  // Aditya Raj
  page.drawText("Aditya Raj", { x: width - 200, y: height - 440, size: 16, font: timesItalic, color: black });
  page.drawLine({ start: { x: width - 230, y: height - 446 }, end: { x: width - 110, y: height - 446 }, color: black, thickness: 1 });
  page.drawText("ADITYA RAJ", { x: width - 192, y: height - 460, size: 10, font: helveticaBold, color: black });
  page.drawText("Co-Founder, Algoxilla", { x: width - 212, y: height - 473, size: 8.5, font: helvetica, color: darkGray });

  // 6. Bottom Metadata Row
  page.drawLine({
    start: { x: 50, y: 70 },
    end: { x: width - 50, y: 70 },
    color: lightGray,
    thickness: 1,
  });

  page.drawText(`EVENT DATE: ${issueDate.toUpperCase()}`, {
    x: 50,
    y: 52,
    size: 8.5,
    font: helveticaBold,
    color: black,
  });

  page.drawText(`CERTIFICATE ID: ${certificateId}`, {
    x: 270,
    y: 52,
    size: 8.5,
    font: courier,
    color: black,
  });

  const verificationUrl = getVerificationUrl(certificateId);
  page.drawText(`VERIFICATION: ${verificationUrl}`, {
    x: 50,
    y: 38,
    size: 7.5,
    font: courier,
    color: darkGray,
  });

  page.drawText("ORGANIZED BY ALGOXILLA", {
    x: width - 180,
    y: 52,
    size: 8.5,
    font: helveticaBold,
    color: black,
  });

  page.drawText(`HASH: ${verificationHash.slice(0, 48)}...`, {
    x: width - 360,
    y: 38,
    size: 7,
    font: courier,
    color: darkGray,
  });

  const pdfBytes = await pdfDoc.save();
  const arrayBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
  ) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "application/pdf" });
}

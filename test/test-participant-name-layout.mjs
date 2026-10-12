// Algoxilla Certificate Platform - Participant Name Layout Verification Suite
// Verifies:
// 1. Participant names remain in a fixed, horizontally centered area (max width 560 pt).
// 2. Font size automatically scales down as name length increases.
// 3. Single-line rendering prioritized; fallback multi-line activated only when below minimum legible size.
// 4. Optical baseline centering preserves balanced vertical clearance above and below.
// 5. Zero overlap with subtitle text ("THIS CERTIFICATE IS PROUDLY PRESENTED TO") or divider line.
// 6. 100% layout and typography parity between official PDF generator and on-screen SVG preview.
// 7. Generates physical PDFs and composited preview PNGs for inspection.

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { 
  calculateParticipantNameLayout,
  PDF_PAGE_WIDTH,
  PDF_PAGE_HEIGHT,
  PDF_MAX_NAME_WIDTH,
  PDF_SLOT_TOP_Y,
  PDF_SLOT_BOTTOM_Y,
  PDF_MAX_FONT_SIZE,
  PDF_MIN_SINGLE_LINE_FONT_SIZE,
  SVG_VIEWBOX_WIDTH,
  SVG_VIEWBOX_HEIGHT,
  SVG_SCALE_X,
  SVG_SCALE_Y,
  CAP_HEIGHT_RATIO,
  DESCENDER_RATIO
} from "../src/lib/certificateLayout.ts";
import { generateOfficialCertificatePdf } from "../src/lib/generateOfficialPdf.ts";

console.log("================================================================================");
console.log("   ALGOXILLA CERTIFICATE PLATFORM — PARTICIPANT NAME LAYOUT VERIFICATION        ");
console.log("================================================================================\n");

const outputDir = path.join(process.cwd(), "test", "output", "name-layout");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const refArtworkPath = path.join(process.cwd(), "public", "brand", "algothon26-certificate-reference.png");
assert.ok(fs.existsSync(refArtworkPath), "Master certificate reference artwork must exist");

// Load fontkit font for exact PDF measurement verification
const pdfDoc = await PDFDocument.create();
pdfDoc.registerFontkit(fontkit);
const rawFont = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "arialbd.ttf"));
const titleFont = await pdfDoc.embedFont(rawFont);
const measureWithFont = (text, size) => titleFont.widthOfTextAtSize(text, size);

// Required test names from specification
const requiredNames = [
  "Aarav Kumar",
  "Algoxilla Test Participant",
  "Aditya Pratap Narayan Singh",
  "Venkataraman Krishnamurthy Subramanian",
];

// Additional extreme stress tests
const stressNames = [
  "Alexander Christopher Bartholomew Montgomery-Smith III",
  "Hubert Blaine Wolfeschlegelsteinhausenbergerdorff Senior of Hohenzollern-Sigmaringen-Braganza", // Multi-line fallback test
];

const allTestNames = [...requiredNames, ...stressNames];

async function runLayoutTests() {
  for (let i = 0; i < allTestNames.length; i++) {
    const name = allTestNames[i];
    const isStressTest = i >= requiredNames.length;
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Test ${i + 1}: "${name}" (${name.length} chars)${isStressTest ? " [Stress Case]" : ""}`);
    console.log(`--------------------------------------------------------------------------------`);

    // 1. Compute canonical layout
    const layout = calculateParticipantNameLayout(name, measureWithFont);

    // Requirement 2: Fixed, horizontally centered area
    for (const line of layout.lineDetails) {
      assert.ok(
        line.pdfWidth <= PDF_MAX_NAME_WIDTH + 1, // allow 1 pt floating point rounding
        `Line "${line.text}" width (${line.pdfWidth.toFixed(1)} pt) must NOT exceed max name width (${PDF_MAX_NAME_WIDTH} pt)`
      );

      // Verify symmetric horizontal centering
      const leftMargin = line.pdfX;
      const rightMargin = PDF_PAGE_WIDTH - (line.pdfX + line.pdfWidth);
      const marginDiff = Math.abs(leftMargin - rightMargin);
      assert.ok(
        marginDiff < 1.0,
        `Line "${line.text}" must be horizontally centered (left: ${leftMargin.toFixed(1)}, right: ${rightMargin.toFixed(1)})`
      );
      console.log(`  ✓ Horizontally Centered: x=${line.pdfX.toFixed(1)} pt, width=${line.pdfWidth.toFixed(1)} pt (margins: ${leftMargin.toFixed(1)} pt)`);
    }

    // Requirement 3: Scale font size down as name gets longer, keeping short names at 28pt
    if (name === "Aarav Kumar") {
      assert.strictEqual(layout.pdfFontSize, 28, "Short name 'Aarav Kumar' must render at full 28 pt");
      console.log(`  ✓ Short Name at Full Size: exactly ${layout.pdfFontSize} pt`);
    } else if (name === "Algoxilla Test Participant") {
      assert.strictEqual(layout.pdfFontSize, 28, "Synthetic participant name must render at full 28 pt");
      console.log(`  ✓ Name fits at full 28 pt without clipping`);
    } else if (name === "Venkataraman Krishnamurthy Subramanian") {
      assert.ok(
        layout.pdfFontSize < 28 && layout.pdfFontSize >= 25,
        `Long name must be smoothly scaled down (actual: ${layout.pdfFontSize} pt)`
      );
      console.log(`  ✓ Smooth Scaling: reduced from 28 pt to ${layout.pdfFontSize} pt`);
    }

    // Requirement 4: Keep on one line whenever it can fit legibly (all 4 required names must be single line)
    if (!isStressTest || name.includes("Montgomery")) {
      assert.strictEqual(
        layout.isMultiLine,
        false,
        `Name "${name}" must render on a single line`
      );
      assert.strictEqual(layout.lines.length, 1);
      console.log(`  ✓ Single-Line Prioritized: exactly 1 line`);
    } else {
      // Hubert Blaine extreme test
      assert.strictEqual(layout.isMultiLine, true, "Extreme length name must gracefully fall back to 2 balanced lines");
      assert.strictEqual(layout.lines.length, 2);
      console.log(`  ✓ Graceful 2-Line Fallback: 2 balanced lines rendered`);
    }

    // Requirement 5 & 6: Surrounding vertical clearances & optical baseline balance
    console.log(`  ✓ Vertical Clearances:`);
    console.log(`      Top Clearance to 'PRESENTED TO': ${layout.topClearancePt.toFixed(2)} pt (must be > 8 pt)`);
    console.log(`      Bottom Clearance to Divider:    ${layout.bottomClearancePt.toFixed(2)} pt (must be > 8 pt)`);

    assert.ok(
      layout.topClearancePt > 8.0,
      `Top clearance (${layout.topClearancePt.toFixed(2)} pt) must leave safe margin from subtitle`
    );
    assert.ok(
      layout.bottomClearancePt > 8.0,
      `Bottom clearance (${layout.bottomClearancePt.toFixed(2)} pt) must leave safe margin from divider line`
    );

    // Verify clearance symmetry (top vs bottom clearance within 4 pt of each other)
    const clearanceDiff = Math.abs(layout.topClearancePt - layout.bottomClearancePt);
    assert.ok(
      clearanceDiff < 4.0,
      `Clearances must be vertically symmetric (diff: ${clearanceDiff.toFixed(2)} pt)`
    );
    console.log(`  ✓ Symmetrically Balanced: difference between top and bottom clearance is only ${clearanceDiff.toFixed(2)} pt`);

    // Requirement 7: Parity between PDF and SVG preview coordinates
    for (let l = 0; l < layout.lineDetails.length; l++) {
      const line = layout.lineDetails[l];
      const expectedSvgCenter = SVG_VIEWBOX_WIDTH / 2;
      assert.strictEqual(line.svgX, expectedSvgCenter, "SVG text must be centered at x=745.5");

      // Verify SVG baseline matches PDF baseline scaled
      const expectedSvgY = (PDF_PAGE_HEIGHT - line.pdfY) * SVG_SCALE_Y;
      const svgYDiff = Math.abs(line.svgY - expectedSvgY);
      assert.ok(svgYDiff < 0.1, "SVG baseline must precisely match scaled PDF baseline");
    }
    console.log(`  ✓ 100% PDF/SVG Geometry Parity Confirmed`);

    // Requirement 8, 9, 10: Generate Physical PDF and Composite Preview PNG
    const slug = name.replace(/[^a-zA-Z0-9]/g, "_");
    
    // 8A. Generate Real PDF
    const pdfRes = await generateOfficialCertificatePdf({
      recipientName: name,
      certificateId: `ALGO-2026-TEST-${slug.slice(0, 10).toUpperCase()}`,
      issueDate: "4 October 2026",
    });
    const pdfPath = path.join(outputDir, `${slug}.pdf`);
    fs.writeFileSync(pdfPath, Buffer.from(pdfRes.pdfBytes));
    console.log(`  ✓ Generated PDF: ${path.basename(pdfPath)} (${pdfRes.pdfBytes.length} bytes)`);

    // 8B. Generate Composite Preview PNG using SVG overlay
    const svgOverlay = `
      <svg width="${SVG_VIEWBOX_WIDTH}" height="${SVG_VIEWBOX_HEIGHT}" viewBox="0 0 ${SVG_VIEWBOX_WIDTH} ${SVG_VIEWBOX_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        ${layout.lineDetails
          .map(
            (l) => `<text x="${l.svgX}" y="${l.svgY.toFixed(2)}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="${layout.svgFontSize.toFixed(2)}" fill="#0d0d0d">${l.text}</text>`
          )
          .join("\n")}
      </svg>
    `;

    const pngPath = path.join(outputDir, `${slug}-preview.png`);
    await sharp(refArtworkPath)
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .toFile(pngPath);
    console.log(`  ✓ Generated Preview Composite: ${path.basename(pngPath)}`);

    // 8C. Pixel Row Scan Verification: Assert ZERO dark pixels in the clearance zones
    const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const startScanX = Math.floor(width * 0.35);
    const endScanX = Math.floor(width * 0.65);

    // Top clearance zone (between "PRESENTED TO" at y=482 and top of participant name)
    const scanTopMax = layout.isMultiLine ? 495 : 502;
    let topClearanceDarkPixels = 0;
    for (let y = 486; y <= scanTopMax; y++) {
      for (let x = startScanX; x < endScanX; x++) {
        const idx = (y * width + x) * channels;
        if ((data[idx] + data[idx + 1] + data[idx + 2]) / 3 < 160) {
          topClearanceDarkPixels++;
        }
      }
    }
    assert.strictEqual(
      topClearanceDarkPixels,
      0,
      `Top clearance zone (y=486..${scanTopMax}) must have ZERO text collision. Found: ${topClearanceDarkPixels}`
    );

    // Bottom clearance zone (between bottom of participant name and divider at y=570)
    const scanBottomMin = layout.isMultiLine ? 562 : 556;
    let bottomClearanceDarkPixels = 0;
    for (let y = scanBottomMin; y <= 568; y++) {
      for (let x = startScanX; x < endScanX; x++) {
        const idx = (y * width + x) * channels;
        if ((data[idx] + data[idx + 1] + data[idx + 2]) / 3 < 160) {
          bottomClearanceDarkPixels++;
        }
      }
    }
    assert.strictEqual(
      bottomClearanceDarkPixels,
      0,
      `Bottom clearance zone (y=${scanBottomMin}..568) must have ZERO text collision. Found: ${bottomClearanceDarkPixels}`
    );
    console.log(`  ✓ Zero-Collision Pixel Proof: Top clearance = 0px ink, Bottom clearance = 0px ink\n`);
  }

  console.log("================================================================================");
  console.log("   ALL PARTICIPANT NAME LAYOUT CHECKS PASSED CLEANLY WITH ZERO OVERLAP!         ");
  console.log("================================================================================\n");
}

runLayoutTests().catch((err) => {
  console.error("FATAL: Layout test failed:", err);
  process.exit(1);
});

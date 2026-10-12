// Algoxilla Certificate Platform - Canonical Participant Name Layout Engine
// Enforces mathematically centered, single-line prioritized, dynamically scaled typography
// matching across both the official A4 PDF generator and the on-screen preview.

export const PDF_PAGE_WIDTH = 842;
export const PDF_PAGE_HEIGHT = 595;

// Horizontal constraint: leaves 141 pt symmetric side margins on left and right
export const PDF_MAX_NAME_WIDTH = 560;

// Vertical slot boundaries in PDF points (origin at bottom-left):
// - Bottom boundary of "THIS CERTIFICATE IS PROUDLY PRESENTED TO": y = 323 pt
// - Top boundary of central star divider line: y = 268 pt
export const PDF_SLOT_TOP_Y = 323;
export const PDF_SLOT_BOTTOM_Y = 268;
export const PDF_SLOT_CENTER_Y = (PDF_SLOT_TOP_Y + PDF_SLOT_BOTTOM_Y) / 2; // 295.5 pt
export const PDF_SLOT_HEIGHT = PDF_SLOT_TOP_Y - PDF_SLOT_BOTTOM_Y; // 55 pt

// Typography bounds:
export const PDF_MAX_FONT_SIZE = 28; // Standard large font size for short/medium names
export const PDF_MIN_SINGLE_LINE_FONT_SIZE = 16; // Minimum font size before resorting to 2-line fallback
export const PDF_MIN_FALLBACK_FONT_SIZE = 12; // Absolute floor for 2-line fallback

// SVG Preview Coordinate Space (1491 x 1055 pixels matching reference master artwork):
export const SVG_VIEWBOX_WIDTH = 1491;
export const SVG_VIEWBOX_HEIGHT = 1055;
export const SVG_SCALE_X = SVG_VIEWBOX_WIDTH / PDF_PAGE_WIDTH; // ~1.7707838
export const SVG_SCALE_Y = SVG_VIEWBOX_HEIGHT / PDF_PAGE_HEIGHT; // ~1.7731092
export const SVG_MAX_NAME_WIDTH = PDF_MAX_NAME_WIDTH * SVG_SCALE_X; // ~991.64 px
export const SVG_SLOT_CENTER_Y = (PDF_PAGE_HEIGHT - PDF_SLOT_CENTER_Y) * SVG_SCALE_Y; // ~531.05 px

// Typographic metric coefficients for Arial Bold / Helvetica Bold:
// - Cap height: ~0.718 of font size
// - Descender depth: ~0.210 of font size
// - Optical visual center offset from baseline: ~0.254 of font size
export const CAP_HEIGHT_RATIO = 0.718;
export const DESCENDER_RATIO = 0.21;
export const CENTER_OFFSET_RATIO = 0.254; // (CAP_HEIGHT_RATIO - DESCENDER_RATIO) / 2

export interface LayoutLineInfo {
  text: string;
  pdfX: number;
  pdfY: number; // Baseline in PDF coordinates
  pdfWidth: number;
  svgX: number; // Center X in SVG viewBox
  svgY: number; // Baseline in SVG viewBox
  svgWidth: number;
}

export interface ParticipantNameLayout {
  recipientName: string;
  isMultiLine: boolean;
  lines: string[];
  pdfFontSize: number;
  svgFontSize: number;
  lineDetails: LayoutLineInfo[];
  topClearancePt: number;
  bottomClearancePt: number;
}

/**
 * Character width estimation for Arial Bold when fontkit is not loaded in browser runtime.
 * Tuned against arialbd.ttf glyph advance metrics.
 */
export function estimateArialBoldWidth(text: string, fontSize: number): number {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") {
      units += 0.278;
    } else if ("MW".includes(ch)) {
      units += 0.833;
    } else if ("mw".includes(ch)) {
      units += 0.778;
    } else if ("ABCDGHKNOQRUVXY".includes(ch)) {
      units += 0.667;
    } else if ("EFJLSTZ".includes(ch)) {
      units += 0.556;
    } else if ("abcdefghknopquvxyz".includes(ch)) {
      units += 0.556;
    } else if ("I".includes(ch)) {
      units += 0.278;
    } else if ("ijl".includes(ch)) {
      units += 0.278;
    } else if ("frt".includes(ch)) {
      units += 0.333;
    } else if ("0123456789".includes(ch)) {
      units += 0.556;
    } else if ("-–—'".includes(ch)) {
      units += 0.333;
    } else {
      units += 0.55;
    }
  }
  return units * fontSize;
}

/**
 * Splits an extraordinarily long name into two visually balanced lines at the optimal word boundary.
 */
function splitIntoTwoBalancedLines(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length <= 1) {
    // Cannot split a single unbroken word by spaces
    return [name, ""];
  }

  let bestSplit = 1;
  let minDiff = Infinity;

  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(" ");
    const line2 = words.slice(i).join(" ");
    const diff = Math.abs(line1.length - line2.length);
    if (diff < minDiff) {
      minDiff = diff;
      bestSplit = i;
    }
  }

  return [
    words.slice(0, bestSplit).join(" "),
    words.slice(bestSplit).join(" "),
  ];
}

/**
 * Computes exact typography sizing and coordinates for a participant name.
 * 
 * Guarantees:
 * 1. Fixed, horizontally centered alignment.
 * 2. Automatic scale-down as length increases, keeping short names at 28pt.
 * 3. Single-line prioritized: remains on one line whenever it can fit legibly (>= 16pt).
 * 4. Symmetric clearances: baseline is calculated so the optical text envelope is
 *    strictly equidistant between the top subtitle and the bottom divider line.
 * 5. Minimum readable font size floor with a balanced 2-line fallback for extreme lengths.
 */
export function calculateParticipantNameLayout(
  name: string,
  measureWidthFn?: (text: string, size: number) => number
): ParticipantNameLayout {
  const trimmed = name.trim();
  const measure = measureWidthFn || estimateArialBoldWidth;

  // 1. Measure at maximum default font size (28 pt)
  const fullWidthAtMax = measure(trimmed, PDF_MAX_FONT_SIZE);

  if (fullWidthAtMax <= PDF_MAX_NAME_WIDTH) {
    // Fits comfortably on 1 line at maximum 28 pt
    const fontSize = PDF_MAX_FONT_SIZE;
    const width = fullWidthAtMax;
    const pdfX = (PDF_PAGE_WIDTH - width) / 2;
    const pdfY = PDF_SLOT_CENTER_Y - CENTER_OFFSET_RATIO * fontSize;

    const topOfCaps = pdfY + CAP_HEIGHT_RATIO * fontSize;
    const bottomOfDescenders = pdfY - DESCENDER_RATIO * fontSize;

    const svgFontSize = fontSize * SVG_SCALE_Y;
    const svgWidth = width * SVG_SCALE_X;
    const svgX = SVG_VIEWBOX_WIDTH / 2;
    const svgY = (PDF_PAGE_HEIGHT - pdfY) * SVG_SCALE_Y;

    return {
      recipientName: trimmed,
      isMultiLine: false,
      lines: [trimmed],
      pdfFontSize: fontSize,
      svgFontSize,
      lineDetails: [
        {
          text: trimmed,
          pdfX,
          pdfY,
          pdfWidth: width,
          svgX,
          svgY,
          svgWidth,
        },
      ],
      topClearancePt: PDF_SLOT_TOP_Y - topOfCaps,
      bottomClearancePt: bottomOfDescenders - PDF_SLOT_BOTTOM_Y,
    };
  }

  // 2. Attempt single-line scale down
  const singleLineScaledSize = (PDF_MAX_NAME_WIDTH / fullWidthAtMax) * PDF_MAX_FONT_SIZE;

  if (singleLineScaledSize >= PDF_MIN_SINGLE_LINE_FONT_SIZE) {
    // Fits legibly on 1 line with scaled font size
    const fontSize = Math.round(singleLineScaledSize * 100) / 100;
    const width = measure(trimmed, fontSize);
    const pdfX = (PDF_PAGE_WIDTH - width) / 2;
    const pdfY = PDF_SLOT_CENTER_Y - CENTER_OFFSET_RATIO * fontSize;

    const topOfCaps = pdfY + CAP_HEIGHT_RATIO * fontSize;
    const bottomOfDescenders = pdfY - DESCENDER_RATIO * fontSize;

    const svgFontSize = fontSize * SVG_SCALE_Y;
    const svgWidth = width * SVG_SCALE_X;
    const svgX = SVG_VIEWBOX_WIDTH / 2;
    const svgY = (PDF_PAGE_HEIGHT - pdfY) * SVG_SCALE_Y;

    return {
      recipientName: trimmed,
      isMultiLine: false,
      lines: [trimmed],
      pdfFontSize: fontSize,
      svgFontSize,
      lineDetails: [
        {
          text: trimmed,
          pdfX,
          pdfY,
          pdfWidth: width,
          svgX,
          svgY,
          svgWidth,
        },
      ],
      topClearancePt: PDF_SLOT_TOP_Y - topOfCaps,
      bottomClearancePt: bottomOfDescenders - PDF_SLOT_BOTTOM_Y,
    };
  }

  // 3. Fallback: Split into 2 balanced lines for exceptionally long names
  const [line1, line2] = splitIntoTwoBalancedLines(trimmed);
  if (!line2) {
    // Single unbroken word that cannot be split: clamp to minimum single-line size
    const fontSize = PDF_MIN_SINGLE_LINE_FONT_SIZE;
    const width = measure(trimmed, fontSize);
    const pdfX = (PDF_PAGE_WIDTH - width) / 2;
    const pdfY = PDF_SLOT_CENTER_Y - CENTER_OFFSET_RATIO * fontSize;

    return {
      recipientName: trimmed,
      isMultiLine: false,
      lines: [trimmed],
      pdfFontSize: fontSize,
      svgFontSize: fontSize * SVG_SCALE_Y,
      lineDetails: [
        {
          text: trimmed,
          pdfX,
          pdfY,
          pdfWidth: width,
          svgX: SVG_VIEWBOX_WIDTH / 2,
          svgY: (PDF_PAGE_HEIGHT - pdfY) * SVG_SCALE_Y,
          svgWidth: width * SVG_SCALE_X,
        },
      ],
      topClearancePt: PDF_SLOT_TOP_Y - (pdfY + CAP_HEIGHT_RATIO * fontSize),
      bottomClearancePt: pdfY - DESCENDER_RATIO * fontSize - PDF_SLOT_BOTTOM_Y,
    };
  }

  // Calculate font size for 2-line layout
  const w1At16 = measure(line1, 16);
  const w2At16 = measure(line2, 16);
  const maxWAt16 = Math.max(w1At16, w2At16);

  let twoLineSize = 15;
  if (maxWAt16 > PDF_MAX_NAME_WIDTH) {
    twoLineSize = Math.max(PDF_MIN_FALLBACK_FONT_SIZE, (PDF_MAX_NAME_WIDTH / maxWAt16) * 16);
  }
  twoLineSize = Math.round(twoLineSize * 100) / 100;

  // Line spacing (leading): 1.25 * twoLineSize
  const leading = twoLineSize * 1.25;
  const halfLeading = leading / 2;

  // Line 1 sits halfLeading above optical center; Line 2 sits halfLeading below
  const pdfY1 = PDF_SLOT_CENTER_Y - CENTER_OFFSET_RATIO * twoLineSize + halfLeading;
  const pdfY2 = PDF_SLOT_CENTER_Y - CENTER_OFFSET_RATIO * twoLineSize - halfLeading;

  const w1 = measure(line1, twoLineSize);
  const w2 = measure(line2, twoLineSize);

  const pdfX1 = (PDF_PAGE_WIDTH - w1) / 2;
  const pdfX2 = (PDF_PAGE_WIDTH - w2) / 2;

  const svgFontSize = twoLineSize * SVG_SCALE_Y;
  const svgY1 = (PDF_PAGE_HEIGHT - pdfY1) * SVG_SCALE_Y;
  const svgY2 = (PDF_PAGE_HEIGHT - pdfY2) * SVG_SCALE_Y;

  const topOfCaps = pdfY1 + CAP_HEIGHT_RATIO * twoLineSize;
  const bottomOfDescenders = pdfY2 - DESCENDER_RATIO * twoLineSize;

  return {
    recipientName: trimmed,
    isMultiLine: true,
    lines: [line1, line2],
    pdfFontSize: twoLineSize,
    svgFontSize,
    lineDetails: [
      {
        text: line1,
        pdfX: pdfX1,
        pdfY: pdfY1,
        pdfWidth: w1,
        svgX: SVG_VIEWBOX_WIDTH / 2,
        svgY: svgY1,
        svgWidth: w1 * SVG_SCALE_X,
      },
      {
        text: line2,
        pdfX: pdfX2,
        pdfY: pdfY2,
        pdfWidth: w2,
        svgX: SVG_VIEWBOX_WIDTH / 2,
        svgY: svgY2,
        svgWidth: w2 * SVG_SCALE_X,
      },
    ],
    topClearancePt: PDF_SLOT_TOP_Y - topOfCaps,
    bottomClearancePt: bottomOfDescenders - PDF_SLOT_BOTTOM_Y,
  };
}

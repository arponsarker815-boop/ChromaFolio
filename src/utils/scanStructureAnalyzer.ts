import {
  ScanBoundingBox,
  ScanExtractedItem,
  ScanPageOcrResult,
  ScanPageRecord,
  ScanSequenceIssue,
  ScanTocEntry,
} from '../types/ebook';
import { cropNormalizedBox } from './scanImageProcessor';

function romanToInt(roman: string): number | null {
  const s = roman.trim().toLowerCase();
  if (!/^[ivxlcdm]+$/.test(s) || s.length > 7) return null;
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const curr = map[s[i]] ?? 0;
    const next = map[s[i + 1]] ?? 0;
    if (curr < next) total -= curr;
    else total += curr;
  }
  return total >= 1 && total <= 60 ? total : null;
}

function parseCandidatePageNumber(rawCandidate: string): number | null {
  const clean = rawCandidate
    .replace(/[|[\]()—–\-_.]/g, ' ')
    .replace(/\b(?:page|pg|p)\b\.?/gi, '')
    .trim();
  if (!clean) return null;
  if (/^\d{1,4}$/.test(clean)) {
    const n = Number(clean);
    if (n >= 1 && n <= 2500) return n;
  }
  const rom = romanToInt(clean);
  if (rom !== null) return rom;
  return null;
}

export function detectPrintedPageNumber(
  ocr: ScanPageOcrResult,
  fallbackText?: string
): number | null {
  // Prefer OCR layout-aware margin paragraphs/words (top 14% or bottom 16% of page)
  if (ocr.paragraphs.length > 0) {
    const marginParas = ocr.paragraphs.filter(
      (p) => p.box.y < 0.14 || p.box.y + p.box.height > 0.84
    );
    // Prefer bottom margin first, then top margin
    const ordered = [
      ...marginParas.filter((p) => p.box.y > 0.5),
      ...marginParas.filter((p) => p.box.y <= 0.5),
    ];
    for (const para of ordered) {
      const txt = para.text.trim();
      if (txt.length <= 28) {
        const direct = parseCandidatePageNumber(txt);
        if (direct !== null) return direct;
      }
      // Corner folio like "Chapter 3   14" or "14   Introduction"
      const tokens = txt.split(/\s+/);
      if (tokens.length <= 6) {
        const firstTry = parseCandidatePageNumber(tokens[0]);
        if (firstTry !== null) return firstTry;
        const lastTry = parseCandidatePageNumber(tokens[tokens.length - 1]);
        if (lastTry !== null) return lastTry;
      }
    }
  }

  // Fallback to first/last line of raw text
  const text = (fallbackText ?? ocr.correctedText ?? ocr.rawText ?? '').trim();
  if (!text) return null;
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const edgeLines = [lines[lines.length - 1], lines[0]];
  for (const line of edgeLines) {
    if (line.length <= 20) {
      const num = parseCandidatePageNumber(line);
      if (num !== null) return num;
    }
  }
  return null;
}

function fingerprintMse(a?: number[], b?: number[]): number | null {
  if (!a || !b || a.length === 0 || a.length !== b.length) return null;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum / a.length;
}

function textJaccard(aText: string, bText: string): number {
  const tokA = new Set(
    aText
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
  const tokB = new Set(
    bText
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
  if (tokA.size < 8 || tokB.size < 8) return 0;
  let intersection = 0;
  tokA.forEach((t) => {
    if (tokB.has(t)) intersection++;
  });
  const union = tokA.size + tokB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function analyzeScanSequence(pages: ScanPageRecord[]): ScanSequenceIssue[] {
  const issues: ScanSequenceIssue[] = [];
  if (pages.length === 0) return issues;

  // 1. Blank or almost-empty page checks
  pages.forEach((p, idx) => {
    const txt = (p.ocr.correctedText || p.ocr.rawText || '').trim();
    const looksLowEdge = p.quality.edgeClarity < 20;
    const ocrDoneEmpty = p.ocr.status === 'done' && txt.length < 8;
    const unocredBlank = p.ocr.status === 'idle' && p.quality.edgeClarity < 10;
    if (ocrDoneEmpty || (looksLowEdge && unocredBlank)) {
      issues.push({
        id: `issue-blank-${p.id}`,
        type: 'blank',
        severity: 'warning',
        message: `Scan ${idx + 1} (${p.sourceName}) appears blank or contains almost no readable text.`,
        suggestion: 'Review or remove this page if it was an accidental blank capture.',
        affectedPageIds: [p.id],
      });
    }
  });

  // 2. Duplicate scan detection (visual fingerprint + text similarity)
  const flaggedDuplicatePairs = new Set<string>();
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const pa = pages[i];
      const pb = pages[j];
      const mse = fingerprintMse(pa.visualFingerprint, pb.visualFingerprint);
      const jac = textJaccard(
        pa.ocr.correctedText || pa.ocr.rawText || '',
        pb.ocr.correctedText || pb.ocr.rawText || ''
      );
      const isDup = (mse !== null && mse < 140) || jac > 0.82;
      if (isDup) {
        const key = `${pa.id}::${pb.id}`;
        if (!flaggedDuplicatePairs.has(key)) {
          flaggedDuplicatePairs.add(key);
          issues.push({
            id: `issue-dup-${i}-${j}`,
            type: 'duplicate',
            severity: 'warning',
            message: `Scans ${i + 1} and ${j + 1} appear nearly identical (possible duplicate capture).`,
            suggestion: `Review Scan ${j + 1} and remove it if it duplicates Scan ${i + 1}.`,
            affectedPageIds: [pb.id, pa.id],
          });
        }
      }
    }
  }

  // 3. Printed page number ordering & missing gaps
  let prevNum: { index: number; num: number; id: string } | null = null;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const num = p.detectedPageNumber;
    if (typeof num !== 'number' || !Number.isFinite(num)) continue;

    if (prevNum !== null) {
      if (num < prevNum.num) {
        issues.push({
          id: `issue-order-${prevNum.id}-${p.id}`,
          type: 'out-of-order',
          severity: 'warning',
          message: `Scan ${i + 1} has printed page p.${num}, which is lower than Scan ${prevNum.index + 1} (p.${prevNum.num}).`,
          suggestion: 'Use "Sort by Printed Page Numbers" or reorder the pages manually below.',
          affectedPageIds: [prevNum.id, p.id],
        });
      } else if (num - prevNum.num > 1 && num - prevNum.num <= 20) {
        const missing: number[] = [];
        for (let m = prevNum.num + 1; m < num; m++) missing.push(m);
        issues.push({
          id: `issue-gap-${prevNum.id}-${p.id}`,
          type: 'missing-gap',
          severity: 'info',
          message: `Possible missing page${missing.length > 1 ? 's' : ''} (${missing
            .map((n) => `p.${n}`)
            .join(', ')}) between Scan ${prevNum.index + 1} (p.${prevNum.num}) and Scan ${i + 1} (p.${num}).`,
          suggestion: 'Scan or import the skipped page(s), or ignore if intentional.',
          affectedPageIds: [prevNum.id, p.id],
          missingPageNumbers: missing,
        });
      }
    }
    prevNum = { index: i, num, id: p.id };
  }

  return issues;
}

const FORMULA_PATTERN =
  /[=∑∫√±×÷≤≥≠≈∞∂∇∆πθλμσΩαβγ]|(?:\b[a-zA-Z]\s*\^\s*[0-9a-zA-Z]+\b)|(?:\d+\s*\/\s*\d+\s*=)/;

function boxContainsWordUncertain(
  box: ScanBoundingBox,
  page: ScanPageRecord
): { uncertain: boolean; confidence: number } {
  const wordsInside = page.ocr.words.filter((w) => {
    const cx = w.box.x + w.box.width / 2;
    const cy = w.box.y + w.box.height / 2;
    return (
      cx >= box.x - 0.02 &&
      cx <= box.x + box.width + 0.02 &&
      cy >= box.y - 0.02 &&
      cy <= box.y + box.height + 0.02
    );
  });
  if (wordsInside.length === 0) {
    return { uncertain: false, confidence: page.ocr.overallConfidence || 0.85 };
  }
  const hasUncertain = wordsInside.some((w) => w.isUncertain);
  const avgConf =
    wordsInside.reduce((s, w) => s + w.confidence, 0) / wordsInside.length;
  return { uncertain: hasUncertain, confidence: Number(avgConf.toFixed(3)) };
}

function parseTableRowsFromText(text: string): string[][] | undefined {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return undefined;

  if (lines.every((l) => l.includes('|'))) {
    const rows = lines
      .filter((l) => !/^\|?[-:\s|]+\|?$/.test(l))
      .map((l) =>
        l
          .split('|')
          .map((c) => c.trim())
          .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''))
      );
    if (rows.length >= 2 && rows.some((r) => r.length >= 2)) return rows;
  }

  const multiSpaceRows = lines.map((l) =>
    l
      .split(/\t|\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean)
  );
  const multiColCount = multiSpaceRows.filter((r) => r.length >= 2).length;
  if (multiColCount >= 2 && multiColCount >= Math.floor(lines.length * 0.6)) {
    return multiSpaceRows;
  }
  return undefined;
}

export async function extractItemsFromOcrPage(
  page: ScanPageRecord
): Promise<ScanExtractedItem[]> {
  const items: ScanExtractedItem[] = [];
  const imgSrc = page.enhancedDataUrl || page.originalDataUrl;

  // 1. Visual regions detected by Google Cloud Vision (TABLE, PICTURE/FIGURE)
  const regions = page.ocr.imageRegions ?? [];
  for (let i = 0; i < regions.length; i++) {
    const reg = regions[i];
    const kind: 'table' | 'diagram' = reg.kind === 'table' ? 'table' : 'diagram';
    const matchingText = page.ocr.paragraphs
      .filter((p) => {
        const cx = p.box.x + p.box.width / 2;
        const cy = p.box.y + p.box.height / 2;
        return (
          cx >= reg.box.x - 0.03 &&
          cx <= reg.box.x + reg.box.width + 0.03 &&
          cy >= reg.box.y - 0.03 &&
          cy <= reg.box.y + reg.box.height + 0.03
        );
      })
      .map((p) => p.text)
      .join('\n')
      .trim();

    let cropDataUrl = imgSrc;
    try {
      cropDataUrl = await cropNormalizedBox(imgSrc, reg.box, 0.025);
    } catch {
      // Keep fallback page image if crop fails
    }

    const { uncertain, confidence } = boxContainsWordUncertain(reg.box, page);
    const tableRows = kind === 'table' ? parseTableRowsFromText(matchingText) : undefined;

    items.push({
      id: `item-${page.id}-${reg.id}`,
      kind,
      title: kind === 'table' ? `Detected Table ${i + 1}` : `Detected Diagram / Figure ${i + 1}`,
      rawText: matchingText,
      tableRows,
      cropDataUrl,
      box: reg.box,
      confidence: reg.confidence ?? confidence,
      isUncertain: uncertain || (reg.confidence ?? confidence) < 0.78,
    });
  }

  // 2. Scan OCR paragraphs for tabular rows or mathematical formulas not yet captured
  for (let i = 0; i < page.ocr.paragraphs.length; i++) {
    const para = page.ocr.paragraphs[i];
    const txt = para.text.trim();
    if (!txt) continue;

    // Check if paragraph is an inline table (multi-column delimited)
    const tableRows = parseTableRowsFromText(txt);
    const alreadyCovered = items.some(
      (it) =>
        Math.abs(it.box.y - para.box.y) < 0.06 &&
        Math.abs(it.box.x - para.box.x) < 0.08
    );

    if (tableRows && !alreadyCovered) {
      let cropDataUrl = imgSrc;
      try {
        cropDataUrl = await cropNormalizedBox(imgSrc, para.box, 0.02);
      } catch {
        // Fallback
      }
      const { uncertain, confidence } = boxContainsWordUncertain(para.box, page);
      items.push({
        id: `item-${page.id}-tbl-${i}`,
        kind: 'table',
        title: `Structured Table (${tableRows.length} rows)`,
        rawText: txt,
        tableRows,
        cropDataUrl,
        box: para.box,
        confidence,
        isUncertain: uncertain || confidence < 0.78,
      });
      continue;
    }

    // Check if paragraph is a formula / equation
    const isShortish = txt.length <= 220;
    if (isShortish && FORMULA_PATTERN.test(txt) && !alreadyCovered) {
      let cropDataUrl = imgSrc;
      try {
        cropDataUrl = await cropNormalizedBox(imgSrc, para.box, 0.025);
      } catch {
        // Fallback
      }
      const { uncertain, confidence } = boxContainsWordUncertain(para.box, page);
      items.push({
        id: `item-${page.id}-eq-${i}`,
        kind: 'formula',
        title: 'Detected Formula / Equation',
        rawText: txt,
        cropDataUrl,
        box: para.box,
        confidence,
        isUncertain: uncertain || confidence < 0.82,
      });
    }
  }

  return items;
}

export function buildDefaultTocFromPages(pages: ScanPageRecord[]): ScanTocEntry[] {
  const entries: ScanTocEntry[] = [];
  pages.forEach((p, idx) => {
    const pageNumber = idx + 1;
    const text = (p.ocr.correctedText || p.ocr.rawText || '').trim();
    const lines = text
      .split(/\n{2,}|\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    let foundOnPage = false;
    for (let li = 0; li < Math.min(4, lines.length); li++) {
      const line = lines[li].replace(/^#+\s*/, '').trim();
      const words = line.split(/\s+/);
      const isChapterExplicit = /^(chapter|part|unit|module|lesson|অধ্যায়|পরিচ্ছেদ)\b/i.test(line);
      const isShortTitle =
        line.length >= 3 &&
        line.length <= 68 &&
        words.length <= 10 &&
        !/[.!?]$/.test(line) &&
        (li === 0 || line === line.toUpperCase() || p.ocr.paragraphs[li]?.isHeadingCandidate);

      if (isChapterExplicit || (li === 0 && isShortTitle)) {
        entries.push({
          id: `toc-${p.id}-${li}`,
          title: line,
          pageNumber,
          level: isChapterExplicit || li === 0 ? 'chapter' : 'section',
          sourceScanPageId: p.id,
        });
        foundOnPage = true;
        break;
      }
    }

    if (!foundOnPage && entries.length === 0) {
      entries.push({
        id: `toc-${p.id}-0`,
        title: `Page ${pageNumber}`,
        pageNumber,
        level: 'chapter',
        sourceScanPageId: p.id,
      });
    }
  });

  // Deduplicate adjacent identical titles
  return entries.filter(
    (entry, idx, arr) => idx === 0 || entry.title !== arr[idx - 1].title
  );
}

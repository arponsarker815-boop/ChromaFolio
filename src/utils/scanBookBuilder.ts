import {
  ChapterEntry,
  EbookBlock,
  EbookDocument,
  EbookPage,
  PaletteId,
  ScanOutputMode,
  ScanPageRecord,
  ScanTocEntry,
} from '../types/ebook';

const FORMULA_DETECT_RE =
  /[=∑∫√±×÷≤≥≠≈∞∂∇∆]|(?:\b[a-zA-Z]\s*\^\s*[0-9a-zA-Z]+\b)/;

function parsePipeOrTabTable(seg: string): string[][] | null {
  const lines = seg
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  if (lines.every((l) => l.includes('|'))) {
    const rows = lines
      .filter((l) => !/^\|?[-:\s|]+\|?$/.test(l))
      .map((l) =>
        l
          .split('|')
          .map((c) => c.trim())
          .filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''))
      );
    if (rows.length >= 2 && rows.some((r) => r.length >= 2)) return rows;
  }

  const splitRows = lines.map((l) =>
    l
      .split(/\t|\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean)
  );
  if (splitRows.filter((r) => r.length >= 2).length >= Math.max(2, Math.floor(lines.length * 0.7))) {
    return splitRows;
  }
  return null;
}

function buildBlocksFromScanPage(
  pageRec: ScanPageRecord,
  pageNumber: number
): {
  blocks: EbookBlock[];
  chapterTitle: string;
  rawText: string;
} {
  const text = (pageRec.ocr.correctedText || pageRec.ocr.rawText || '').trim();
  const extractedItems = pageRec.extractedItems ?? [];
  const blocks: EbookBlock[] = [];
  let chapterTitle = `Scanned Page ${pageNumber}`;

  if (text) {
    const segments = text
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);

    const footnoteBlocks: EbookBlock[] = [];

    segments.forEach((seg, idx) => {
      const cleanLine = seg.replace(/^#+\s*/, '');
      const singleLine = !seg.includes('\n');
      const words = cleanLine.split(/\s+/);
      const matchingPara = pageRec.ocr.paragraphs[idx];
      const isBottomFootnote =
        Boolean(matchingPara?.isFootnoteCandidate) ||
        (idx >= Math.max(1, segments.length - 2) &&
          /^(\[\d+\]|[*†‡§]\s|\d+\)\s)/.test(seg) &&
          seg.length < 280);

      const isMarkdownH1 = /^#\s+/.test(seg) && singleLine;
      const isMarkdownH2 = /^##+\s+/.test(seg) && singleLine;
      const isChapterExplicit = /^(chapter|part|unit|module|lesson|অধ্যায়)\b/i.test(cleanLine);

      const isFirstShortHeading =
        idx === 0 &&
        singleLine &&
        words.length <= 11 &&
        cleanLine.length <= 80 &&
        !/[.!?]$/.test(cleanLine);

      const isSubheading =
        idx > 0 &&
        singleLine &&
        words.length <= 9 &&
        cleanLine.length <= 70 &&
        !/[.!?]$/.test(cleanLine) &&
        (isMarkdownH2 ||
          Boolean(matchingPara?.isHeadingCandidate) ||
          cleanLine === cleanLine.toUpperCase());

      // Check table structure (either from extractedItems matching this text or pipe/tab parsing)
      const matchedExtractedTable = extractedItems.find(
        (it) => it.kind === 'table' && it.tableRows && it.rawText.trim() === seg.trim()
      );
      const parsedTableRows = matchedExtractedTable?.tableRows ?? parsePipeOrTabTable(seg);

      const matchedFormulaItem = extractedItems.find(
        (it) => it.kind === 'formula' && it.rawText.trim() === seg.trim()
      );
      const isFormulaSeg =
        Boolean(matchedFormulaItem) ||
        (seg.length <= 200 && FORMULA_DETECT_RE.test(seg) && words.length <= 24);

      if (isBottomFootnote) {
        footnoteBlocks.push({
          id: `scan-${pageNumber}-fn-${idx}`,
          type: 'footnote',
          text: seg.replace(/\n+/g, ' '),
          sourceScanPageId: pageRec.id,
          sourceBox: matchingPara?.box,
        });
      } else if (isMarkdownH1 || isFirstShortHeading || isChapterExplicit || (idx === 0 && matchingPara?.isHeadingCandidate)) {
        chapterTitle = cleanLine;
        blocks.push({
          id: `scan-${pageNumber}-b-${idx}`,
          type: 'heading',
          text: cleanLine,
          sourceScanPageId: pageRec.id,
          sourceBox: matchingPara?.box,
        });
      } else if (isSubheading) {
        blocks.push({
          id: `scan-${pageNumber}-b-${idx}`,
          type: 'subheading',
          text: cleanLine,
          sourceScanPageId: pageRec.id,
          sourceBox: matchingPara?.box,
        });
      } else if (parsedTableRows) {
        blocks.push({
          id: `scan-${pageNumber}-tbl-${idx}`,
          type: 'table',
          text: matchedExtractedTable?.title || `Table (${parsedTableRows.length} rows)`,
          tableRows: parsedTableRows,
          imageDataUrl: matchedExtractedTable?.cropDataUrl,
          uncertain: matchedExtractedTable?.isUncertain,
          sourceScanPageId: pageRec.id,
          sourceBox: matchedExtractedTable?.box ?? matchingPara?.box,
          aiExplanation: matchedExtractedTable?.aiExplanation,
        });
      } else if (isFormulaSeg) {
        blocks.push({
          id: `scan-${pageNumber}-eq-${idx}`,
          type: 'formula',
          text: seg,
          imageDataUrl: matchedFormulaItem?.cropDataUrl,
          uncertain: matchedFormulaItem?.isUncertain,
          sourceScanPageId: pageRec.id,
          sourceBox: matchedFormulaItem?.box ?? matchingPara?.box,
          aiExplanation: matchedFormulaItem?.aiExplanation,
        });
      } else if (/^[-•*]\s+/.test(seg)) {
        const lines = seg
          .split('\n')
          .map((l) => l.replace(/^[-•*]\s+/, '').trim())
          .filter(Boolean);
        lines.forEach((line, li) => {
          blocks.push({
            id: `scan-${pageNumber}-b-${idx}-${li}`,
            type: 'list-item',
            text: line,
            sourceScanPageId: pageRec.id,
            sourceBox: matchingPara?.box,
          });
        });
      } else {
        blocks.push({
          id: `scan-${pageNumber}-b-${idx}`,
          type: 'paragraph',
          text: seg.replace(/\n+/g, ' '),
          sourceScanPageId: pageRec.id,
          sourceBox: matchingPara?.box,
        });
      }
    });

    // Append extracted diagram/figure blocks and standalone extracted tables not already inserted inline
    extractedItems.forEach((item, ei) => {
      if (item.kind === 'diagram') {
        blocks.push({
          id: `scan-${pageNumber}-diag-${ei}`,
          type: 'diagram',
          text: item.rawText ? `${item.title}: ${item.rawText}` : item.title,
          imageDataUrl: item.cropDataUrl,
          uncertain: item.isUncertain,
          sourceScanPageId: pageRec.id,
          sourceBox: item.box,
          aiExplanation: item.aiExplanation,
        });
      } else if (
        item.kind === 'table' &&
        !blocks.some((b) => b.type === 'table' && b.sourceBox === item.box)
      ) {
        blocks.push({
          id: `scan-${pageNumber}-extbl-${ei}`,
          type: 'table',
          text: item.rawText || item.title,
          tableRows: item.tableRows,
          imageDataUrl: item.cropDataUrl,
          uncertain: item.isUncertain,
          sourceScanPageId: pageRec.id,
          sourceBox: item.box,
          aiExplanation: item.aiExplanation,
        });
      }
    });

    // Place footnotes cleanly at the bottom of the page
    blocks.push(...footnoteBlocks);
  } else if (extractedItems.length > 0) {
    // Diagram-only / table-only scanned page
    extractedItems.forEach((item, ei) => {
      blocks.push({
        id: `scan-${pageNumber}-item-${ei}`,
        type: item.kind === 'table' ? 'table' : item.kind === 'formula' ? 'formula' : 'diagram',
        text: item.rawText || item.title,
        tableRows: item.tableRows,
        imageDataUrl: item.cropDataUrl,
        uncertain: item.isUncertain,
        sourceScanPageId: pageRec.id,
        sourceBox: item.box,
        aiExplanation: item.aiExplanation,
      });
    });
  }

  return {
    blocks,
    chapterTitle,
    rawText: text,
  };
}

export function buildEbookFromScans(params: {
  title: string;
  author: string;
  paletteId: PaletteId;
  outputMode: ScanOutputMode;
  languageHint: string;
  pages: ScanPageRecord[];
  customToc?: ScanTocEntry[];
  existingBook?: EbookDocument | null;
}): EbookDocument {
  const {
    title,
    author,
    paletteId,
    outputMode,
    languageHint,
    pages,
    customToc,
    existingBook,
  } = params;

  const now = Date.now();
  const autoChapters: ChapterEntry[] = [];
  const tocByPage = new Map<number, ScanTocEntry>();
  if (Array.isArray(customToc)) {
    for (const entry of customToc) {
      if (!tocByPage.has(entry.pageNumber) || entry.level === 'chapter') {
        tocByPage.set(entry.pageNumber, entry);
      }
    }
  }

  let runningChapter = '';
  const ebookPages: EbookPage[] = pages.map((rec, index) => {
    const pageNumber = index + 1;
    const isOriginalOnly = outputMode === 'original-pdf';
    const parsed = isOriginalOnly
      ? {
          blocks: [] as EbookBlock[],
          chapterTitle: `Scanned Page ${pageNumber}`,
          rawText: rec.ocr.correctedText || rec.ocr.rawText || '',
        }
      : buildBlocksFromScanPage(rec, pageNumber);

    const tocMatch = tocByPage.get(pageNumber);
    if (tocMatch) {
      runningChapter = tocMatch.title;
    } else if (!runningChapter && parsed.chapterTitle !== `Scanned Page ${pageNumber}`) {
      runningChapter = parsed.chapterTitle;
    }

    const effectiveChapterTitle = tocMatch?.title || parsed.chapterTitle || runningChapter || `Page ${pageNumber}`;

    if (
      autoChapters.length === 0 ||
      autoChapters[autoChapters.length - 1].title !== effectiveChapterTitle
    ) {
      autoChapters.push({
        title: effectiveChapterTitle,
        pageNumber,
      });
    }

    const canvasImage =
      outputMode === 'original-pdf'
        ? rec.originalDataUrl
        : rec.enhancedDataUrl || rec.originalDataUrl;

    const wordCount = parsed.rawText
      ? parsed.rawText.split(/\s+/).filter(Boolean).length
      : 0;

    const isReflowable = outputMode === 'reflowable-ebook' || outputMode === 'reflowable-epub';

    return {
      pageNumber,
      chapterTitle: effectiveChapterTitle,
      blocks: parsed.blocks,
      rawText: parsed.rawText,
      wordCount,
      hasRichVisuals: !isReflowable,
      canvasDataUrl: canvasImage,
      thumbnailDataUrl: canvasImage,
      textDirection: rec.ocr.textDirection,
      scanPageId: rec.id,
    };
  });

  const finalChapters: ChapterEntry[] =
    Array.isArray(customToc) && customToc.length > 0
      ? customToc
          .filter((c) => c.title.trim().length > 0)
          .map((c) => ({
            title: c.level === 'section' ? `  · ${c.title.trim()}` : c.title.trim(),
            pageNumber: Math.min(Math.max(1, c.pageNumber), Math.max(1, ebookPages.length)),
          }))
      : autoChapters;

  const firstPage = pages[0];
  const coverDataUrl =
    outputMode === 'original-pdf'
      ? firstPage?.originalDataUrl
      : firstPage?.enhancedDataUrl || firstPage?.originalDataUrl;

  const cleanTitle = title.trim() || 'Scanned Book';
  const cleanAuthor = author.trim() || 'Scanned Capture';

  return {
    id: existingBook?.id ?? `scan-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: cleanTitle,
    author: cleanAuthor,
    coverDataUrl,
    totalPages: ebookPages.length,
    createdAt: existingBook?.createdAt ?? now,
    lastOpenedAt: now,
    currentPage: Math.min(existingBook?.currentPage ?? 1, Math.max(1, ebookPages.length)),
    chapters: finalChapters.length > 0 ? finalChapters : [{ title: 'Page 1', pageNumber: 1 }],
    pages: ebookPages,
    highlights: existingBook?.highlights ?? [],
    bookmarks: existingBook?.bookmarks ?? [],
    flashcards: existingBook?.flashcards ?? [],
    studyNotes: existingBook?.studyNotes ?? [],
    studyMinutes: existingBook?.studyMinutes ?? 0,
    paletteId,
    pageVisualStyle: existingBook?.pageVisualStyle ?? 'minimal',
    activeLanguage: existingBook?.activeLanguage ?? 'original',
    translations: existingBook?.translations,
    sourceFileName:
      existingBook?.sourceFileName ??
      `${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'scan'}.${
        outputMode === 'reflowable-epub' ? 'epub' : 'pdf'
      }`,
    scanData: {
      outputMode,
      languageHint,
      pages,
      customToc,
      createdAt: existingBook?.scanData?.createdAt ?? now,
      updatedAt: now,
    },
  };
}

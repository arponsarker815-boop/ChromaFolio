import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChapterEntry, EbookBlock, EbookDocument, EbookPage, PaletteId } from '../types/ebook';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ConversionProgress {
  currentPage: number;
  totalPages: number;
  stage: string;
}

interface TextItemLike {
  str: string;
  transform: number[];
  height: number;
  width: number;
  hasEOL?: boolean;
}

function classifyTextBlocks(items: TextItemLike[], pageNumber: number): {
  blocks: EbookBlock[];
  detectedHeading?: string;
} {
  if (!items.length) {
    return { blocks: [] };
  }

  // Group items into visual lines by Y coordinate (transform[5])
  interface LineGroup {
    y: number;
    fontSize: number;
    text: string;
  }

  const lines: LineGroup[] = [];
  const yTolerance = 4;

  for (const item of items) {
    const str = item.str;
    if (!str) continue;
    const y = item.transform?.[5] ?? 0;
    const fontSize = Math.abs(item.transform?.[3] || item.height || 12);

    const existing = lines.find((l) => Math.abs(l.y - y) <= yTolerance);
    if (existing) {
      const needsSpace =
        existing.text.length > 0 &&
        !existing.text.endsWith(' ') &&
        !str.startsWith(' ') &&
        !/^[.,;:!?)]/.test(str);
      existing.text += (needsSpace ? ' ' : '') + str;
      existing.fontSize = Math.max(existing.fontSize, fontSize);
    } else {
      lines.push({ y, fontSize, text: str });
    }
  }

  // Sort top-to-bottom (higher PDF Y is higher on page)
  lines.sort((a, b) => b.y - a.y);

  // Clean whitespace
  const cleanedLines = lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text.length > 0);

  if (cleanedLines.length === 0) {
    return { blocks: [] };
  }

  // Compute median font size for body text
  const sizes = cleanedLines.map((l) => l.fontSize).sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)] || 12;

  const blocks: EbookBlock[] = [];
  let paragraphBuffer = '';
  let prevY: number | null = null;
  let detectedHeading: string | undefined;
  let blockIndex = 0;

  const flushParagraph = () => {
    const trimmed = paragraphBuffer.trim();
    if (!trimmed) return;
    const isQuote =
      (trimmed.startsWith('“') && trimmed.endsWith('”')) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 40 && trimmed.length < 360);

    blocks.push({
      id: `p${pageNumber}-b${blockIndex++}`,
      type: isQuote ? 'quote' : 'paragraph',
      text: trimmed,
    });
    paragraphBuffer = '';
  };

  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];
    const lineText = line.text;

    // Skip isolated bare page numbers at top/bottom edge
    if (/^\d{1,4}$/.test(lineText) && (i === 0 || i === cleanedLines.length - 1)) {
      continue;
    }

    const isLargeHeading =
      line.fontSize >= medianSize * 1.32 && lineText.length <= 95 && !lineText.endsWith('.');
    const isChapterLabel =
      /^(chapter|part|section|unit|অধ্যায়|পর্ব)\s+[\dIVXivx]+/i.test(lineText) &&
      lineText.length <= 90;
    const isSubheading =
      !isLargeHeading &&
      line.fontSize >= medianSize * 1.14 &&
      lineText.length <= 80 &&
      !lineText.endsWith('.');
    const isBullet = /^[•●▪◦\-–—*]\s+/.test(lineText) || /^\d+\.\s+[A-Z]/.test(lineText);

    if (isLargeHeading || isChapterLabel) {
      flushParagraph();
      if (!detectedHeading) detectedHeading = lineText;
      blocks.push({
        id: `p${pageNumber}-b${blockIndex++}`,
        type: 'heading',
        text: lineText,
      });
      prevY = line.y;
      continue;
    }

    if (isSubheading) {
      flushParagraph();
      blocks.push({
        id: `p${pageNumber}-b${blockIndex++}`,
        type: 'subheading',
        text: lineText,
      });
      prevY = line.y;
      continue;
    }

    if (isBullet) {
      flushParagraph();
      blocks.push({
        id: `p${pageNumber}-b${blockIndex++}`,
        type: 'list-item',
        text: lineText.replace(/^[•●▪◦\-–—*]\s+/, ''),
      });
      prevY = line.y;
      continue;
    }

    const isStandaloneFormula =
      lineText.length >= 5 &&
      lineText.length <= 75 &&
      /[=≈≤≥∑√π∫]/.test(lineText) &&
      !/[.!?]$/.test(lineText) &&
      lineText.split(' ').length <= 10;

    if (isStandaloneFormula) {
      flushParagraph();
      blocks.push({
        id: `p${pageNumber}-b${blockIndex++}`,
        type: 'formula',
        text: lineText,
      });
      prevY = line.y;
      continue;
    }

    // Paragraph break detection via vertical gap
    const verticalGap = prevY !== null ? Math.abs(prevY - line.y) : 0;
    const isGapBreak = prevY !== null && verticalGap > medianSize * 1.85;

    if (isGapBreak) {
      flushParagraph();
    }

    if (paragraphBuffer.endsWith('-') && !paragraphBuffer.endsWith(' -')) {
      paragraphBuffer = paragraphBuffer.slice(0, -1) + lineText;
    } else {
      paragraphBuffer += (paragraphBuffer ? ' ' : '') + lineText;
    }

    prevY = line.y;
  }

  flushParagraph();
  return { blocks, detectedHeading };
}

export async function convertPdfToEbook(
  file: File,
  paletteId: PaletteId,
  onProgress?: (progress: ConversionProgress) => void
): Promise<EbookDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const totalPages = pdf.numPages;
  const meta = await pdf.getMetadata().catch(() => null);
  const info = (meta?.info ?? {}) as Record<string, unknown>;

  const fallbackTitle = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  const bookTitle =
    typeof info.Title === 'string' && info.Title.trim().length > 1
      ? info.Title.trim()
      : fallbackTitle || 'Converted Colourful Book';
  const bookAuthor =
    typeof info.Author === 'string' && info.Author.trim().length > 0
      ? info.Author.trim()
      : 'PDF Edition';

  // Extract PDF outline if present
  const outlineChapters = new Map<number, string>();
  try {
    const outline = await pdf.getOutline();
    if (outline && outline.length > 0) {
      for (const item of outline) {
        if (item.dest && item.title) {
          const dest =
            typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
          if (Array.isArray(dest) && dest[0]) {
            const pageIndex = await pdf.getPageIndex(dest[0] as Parameters<typeof pdf.getPageIndex>[0]);
            const pageNum = pageIndex + 1;
            if (!outlineChapters.has(pageNum)) {
              outlineChapters.set(pageNum, item.title.trim());
            }
          }
        }
      }
    }
  } catch {
    // Outline optional
  }

  const pages: EbookPage[] = [];
  const chapters: ChapterEntry[] = [];
  let activeChapter = 'Opening Pages';
  let coverDataUrl: string | undefined;

  // Render canvas snapshots cleanly (scale optimized for crispness & memory)
  const renderCanvasScale = totalPages > 60 ? 1.05 : 1.35;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      currentPage: pageNum,
      totalPages,
      stage:
        pageNum === 1
          ? 'Extracting cover & typography…'
          : `Colour-grading page ${pageNum} of ${totalPages}…`,
    });

    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const textItems = textContent.items as unknown as TextItemLike[];

    const { blocks, detectedHeading } = classifyTextBlocks(textItems, pageNum);
    const rawText = blocks.map((b) => b.text).join('\n\n');
    const wordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;

    // Determine chapter title
    const outlineTitle = outlineChapters.get(pageNum);
    if (outlineTitle) {
      activeChapter = outlineTitle;
      chapters.push({ title: outlineTitle, pageNumber: pageNum });
    } else if (detectedHeading) {
      activeChapter = detectedHeading;
      if (!chapters.some((c) => c.pageNumber === pageNum)) {
        chapters.push({ title: detectedHeading, pageNumber: pageNum });
      }
    } else if (pageNum === 1 && chapters.length === 0) {
      chapters.push({ title: 'Cover & Opening', pageNumber: 1 });
    }

    // Render page canvas for cover, thumbnails, and Colour-Graded Original Canvas view
    const viewport = page.getViewport({ scale: renderCanvasScale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    let canvasDataUrl: string | undefined;
    let thumbnailDataUrl: string | undefined;

    if (ctx) {
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      // Store full canvas snapshot for first 80 pages or pages with sparse text (diagrams/scans)
      if (pageNum <= 80 || wordCount < 35) {
        canvasDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      }

      if (pageNum === 1) {
        coverDataUrl = canvas.toDataURL('image/jpeg', 0.86);
      }

      // Small thumbnail for page navigator
      const thumbCanvas = document.createElement('canvas');
      const thumbScale = 160 / canvas.width;
      thumbCanvas.width = 160;
      thumbCanvas.height = Math.max(100, Math.floor(canvas.height * thumbScale));
      const thumbCtx = thumbCanvas.getContext('2d');
      if (thumbCtx) {
        thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.68);
      }
    }

    pages.push({
      pageNumber: pageNum,
      chapterTitle: activeChapter,
      blocks:
        blocks.length > 0
          ? blocks
          : [
              {
                id: `p${pageNum}-visual`,
                type: 'paragraph',
                text: 'Illustrated or scanned page rendered in Colour-Graded Canvas view.',
              },
            ],
      rawText,
      wordCount,
      hasRichVisuals: wordCount < 35,
      canvasDataUrl,
      thumbnailDataUrl,
    });
  }

  const now = Date.now();
  return {
    id: `ebook-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: bookTitle,
    author: bookAuthor,
    coverDataUrl,
    totalPages,
    createdAt: now,
    lastOpenedAt: now,
    currentPage: 1,
    chapters,
    pages,
    highlights: [],
    bookmarks: [],
    paletteId,
    sourceFileName: file.name,
  };
}

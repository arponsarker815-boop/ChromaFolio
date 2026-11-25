import { EbookDocument } from '../types/ebook';

export interface BookExcerptChunk {
  pageNumber: number;
  chapterTitle: string;
  text: string;
}

/**
 * Extracts passages strictly up to `maxPage` (when spoilerSafe is true) or across the full book,
 * prioritizing the beginning, evenly spaced checkpoints, and the pages leading right up to `currentPage`.
 */
export function buildBookExcerpts(
  book: EbookDocument,
  currentPage: number,
  spoilerSafe: boolean,
  maxTotalChars = 18000
): BookExcerptChunk[] {
  const limitPage = spoilerSafe ? Math.max(1, currentPage) : book.totalPages;
  const eligible = book.pages.filter(
    (p) => p.pageNumber <= limitPage && p.rawText.trim().length > 0
  );
  if (eligible.length === 0) return [];

  const totalEligibleChars = eligible.reduce((sum, p) => sum + p.rawText.length, 0);
  if (totalEligibleChars <= maxTotalChars) {
    return eligible.map((p) => ({
      pageNumber: p.pageNumber,
      chapterTitle: p.chapterTitle,
      text: p.rawText.trim(),
    }));
  }

  // Sample up to 14 pages: always include page 1 (if present), last 3 pages up to limitPage, and evenly spaced middle pages
  const selectedIndices = new Set<number>();
  selectedIndices.add(0);
  for (let i = Math.max(0, eligible.length - 3); i < eligible.length; i++) {
    selectedIndices.add(i);
  }
  const targetSampleCount = Math.min(eligible.length, 14);
  if (eligible.length > targetSampleCount) {
    const step = (eligible.length - 1) / Math.max(1, targetSampleCount - 1);
    for (let k = 0; k < targetSampleCount; k++) {
      selectedIndices.add(Math.min(eligible.length - 1, Math.round(k * step)));
    }
  }

  const ordered = Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .map((idx) => eligible[idx]);

  const perPageBudget = Math.max(650, Math.floor(maxTotalChars / Math.max(1, ordered.length)));
  return ordered.map((p) => ({
    pageNumber: p.pageNumber,
    chapterTitle: p.chapterTitle,
    text: p.rawText.trim().slice(0, perPageBudget),
  }));
}

/**
 * Extracts excerpts for Ask the Book, scoring pages by keyword relevance to the user's question
 * while always including the active reading neighborhood and strictly enforcing spoilerSafe bounds.
 */
export function buildAskBookExcerpts(
  book: EbookDocument,
  currentPage: number,
  spoilerSafe: boolean,
  question: string,
  scope: 'book' | 'chapter' | 'selection',
  selectedText?: string,
  maxTotalChars = 18000
): BookExcerptChunk[] {
  const activePage = book.pages.find((p) => p.pageNumber === currentPage) ?? book.pages[0];

  if (scope === 'selection' && selectedText && selectedText.trim().length > 0) {
    const chunks: BookExcerptChunk[] = [
      {
        pageNumber: activePage?.pageNumber ?? currentPage,
        chapterTitle: activePage?.chapterTitle ?? '',
        text: `[Selected Passage]\n${selectedText.trim().slice(0, 6000)}`,
      },
    ];
    if (activePage && activePage.rawText.trim().length > 0) {
      chunks.push({
        pageNumber: activePage.pageNumber,
        chapterTitle: activePage.chapterTitle,
        text: `[Surrounding Context on Page ${activePage.pageNumber}]\n${activePage.rawText
          .trim()
          .slice(0, 4500)}`,
      });
    }
    return chunks;
  }

  const limitPage = spoilerSafe ? Math.max(1, currentPage) : book.totalPages;
  let pool = book.pages.filter(
    (p) => p.pageNumber <= limitPage && p.rawText.trim().length > 0
  );

  if (scope === 'chapter' && activePage?.chapterTitle) {
    const sameChapter = pool.filter((p) => p.chapterTitle === activePage.chapterTitle);
    if (sameChapter.length > 0) {
      pool = sameChapter;
    }
  }

  if (pool.length === 0) return [];

  const totalChars = pool.reduce((s, p) => s + p.rawText.length, 0);
  if (totalChars <= maxTotalChars) {
    return pool.map((p) => ({
      pageNumber: p.pageNumber,
      chapterTitle: p.chapterTitle,
      text: p.rawText.trim(),
    }));
  }

  // Keyword relevance scoring + proximity boost to currentPage
  const keywords = question
    .toLowerCase()
    .split(/[^a-z0-9\u0980-\u09FF\u0900-\u097F\u0600-\u06FF]+/i)
    .filter((w) => w.length >= 3);

  const scored = pool.map((p) => {
    const lower = p.rawText.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 3;
    }
    const dist = Math.abs(p.pageNumber - currentPage);
    if (dist === 0) score += 10;
    else if (dist <= 2) score += 5;
    else if (p.pageNumber === 1) score += 2;
    return { page: p, score };
  });

  scored.sort((a, b) => b.score - a.score || a.page.pageNumber - b.page.pageNumber);
  const topPages = scored
    .slice(0, 12)
    .map((s) => s.page)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const perPageBudget = Math.max(800, Math.floor(maxTotalChars / Math.max(1, topPages.length)));
  return topPages.map((p) => ({
    pageNumber: p.pageNumber,
    chapterTitle: p.chapterTitle,
    text: p.rawText.trim().slice(0, perPageBudget),
  }));
}

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Loader2, Search, Sparkles } from 'lucide-react';
import { useAppAuth } from '../contexts/AppAuthContext';
import { CrossBookSearchResponse, EbookDocument } from '../types/ebook';

interface CrossBookSearchPanelProps {
  books: EbookDocument[];
  onOpenBookAtPage: (bookId: string, pageNumber: number) => void;
}

export const CrossBookSearchPanel: React.FC<CrossBookSearchPanelProps> = ({
  books,
  onOpenBookAtPage,
}) => {
  const { getAuthHeaders } = useAppAuth();
  const [expanded, setExpanded] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(() => {
    const scanned = books.filter((b) => Boolean(b.scanData));
    return new Set((scanned.length > 0 ? scanned : books).map((b) => b.id));
  });
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<CrossBookSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Automatically include newly added/scanned books into selection
  useEffect(() => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      for (const b of books) {
        if (b.scanData && !prev.has(b.id)) {
          next.add(b.id);
        }
      }
      return next;
    });
  }, [books]);

  const scannedBooksCount = useMemo(
    () => books.filter((b) => Boolean(b.scanData)).length,
    [books]
  );

  const toggleBook = (bookId: string) => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQ = query.trim();
    if (cleanQ.length < 2) return;

    const chosenBooks = books.filter((b) => selectedBookIds.has(b.id));
    if (chosenBooks.length === 0) {
      setError('Select at least one scanned or imported book to search.');
      return;
    }

    setSearching(true);
    setError(null);
    setResult(null);

    try {
      const tokens = cleanQ
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.replace(/[^a-z0-9\u0980-\u09ff\u0600-\u06ff]+/gi, ''))
        .filter((t) => t.length >= 2);

      // Score and collect the highest-matching page excerpts ONLY from selected books
      const scoredExcerpts: Array<{
        score: number;
        bookId: string;
        bookTitle: string;
        pageNumber: number;
        chapterTitle: string;
        text: string;
      }> = [];

      for (const book of chosenBooks) {
        for (const page of book.pages) {
          const tableOrFormulaText = page.blocks
            .filter((bl) => bl.type === 'table' || bl.type === 'formula' || bl.type === 'diagram')
            .map((bl) =>
              bl.tableRows
                ? bl.tableRows.map((r) => r.join(' | ')).join('\n')
                : bl.text
            )
            .join('\n');
          const combinedText = [page.rawText, tableOrFormulaText].filter(Boolean).join('\n').trim();
          if (combinedText.length < 10) continue;

          const lower = combinedText.toLowerCase();
          let score = 0;
          if (lower.includes(cleanQ.toLowerCase())) score += 8;
          for (const tok of tokens) {
            if (lower.includes(tok)) score += 2;
          }

          scoredExcerpts.push({
            score,
            bookId: book.id,
            bookTitle: book.title,
            pageNumber: page.pageNumber,
            chapterTitle: page.chapterTitle || `Page ${page.pageNumber}`,
            text: combinedText.slice(0, 1200),
          });
        }
      }

      // Ensure each selected book gets representation plus highest keyword hits
      scoredExcerpts.sort((a, b) => b.score - a.score);
      const topExcerpts = scoredExcerpts.slice(0, 24).map(({ score: _s, ...rest }) => rest);

      const authHeaders = await getAuthHeaders();
      const resp = await fetch('/api/ai/search-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          query: cleanQ,
          excerpts: topExcerpts,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || 'Cross-book search failed.');
      }

      setResult({
        answer: String(data.answer || ''),
        supportedByBooks: Boolean(data.supportedByBooks),
        citations: Array.isArray(data.citations) ? data.citations : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cross-book search failed.');
    } finally {
      setSearching(false);
    }
  };

  if (books.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <Search className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Search Across Your Scanned & Imported Books</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            Optional grounded AI search · Answers strictly from selected books ({selectedBookIds.size} of {books.length} selected)
          </p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
        >
          <span>{expanded ? 'Hide Search' : 'Open Multi-Book Search'}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
          {/* Book Checkboxes */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">
                Choose books to search:
              </span>
              <div className="flex items-center gap-3 text-amber-700 dark:text-amber-400 font-medium">
                <button
                  type="button"
                  onClick={() => setSelectedBookIds(new Set(books.map((b) => b.id)))}
                  className="hover:underline"
                >
                  Select All
                </button>
                {scannedBooksCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedBookIds(
                        new Set(books.filter((b) => Boolean(b.scanData)).map((b) => b.id))
                      )
                    }
                    className="hover:underline"
                  >
                    Scanned Only ({scannedBooksCount})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedBookIds(new Set())}
                  className="text-zinc-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {books.map((book) => {
                const checked = selectedBookIds.has(book.id);
                const sourceLabel = book.scanData
                  ? 'Scanned'
                  : book.isSample
                    ? 'Sample'
                    : 'Imported PDF';
                return (
                  <label
                    key={book.id}
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs cursor-pointer transition-colors ${
                      checked
                        ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/25'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBook(book.id)}
                      className="mt-0.5 w-3.5 h-3.5 accent-amber-500 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {book.title}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {sourceLabel} · {book.totalPages} pages
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Search Query Input */}
          <form onSubmit={(e) => void handleSearch(e)} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question across your chosen books (no web search, cited answers only)…"
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={searching || query.trim().length < 2}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 disabled:opacity-45 whitespace-nowrap"
            >
              {searching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{searching ? 'Searching Books…' : 'Search Selected Books'}</span>
            </button>
          </form>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

          {/* Grounded Result & Citations */}
          {result && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={`font-semibold ${
                    result.supportedByBooks
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {result.supportedByBooks
                    ? 'Grounded Answer from Selected Books'
                    : 'Not Supported in Selected Books'}
                </span>
                <span className="text-zinc-500">Web search disabled</span>
              </div>

              <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                {result.answer}
              </p>

              {result.citations.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Supporting Book Citations
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {result.citations.map((cit, idx) => (
                      <div
                        key={`${cit.bookId}-${cit.pageNumber}-${idx}`}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {cit.bookTitle} · Page {cit.pageNumber}
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenBookAtPage(cit.bookId, cit.pageNumber)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500 text-zinc-950 font-semibold text-[11px] hover:bg-amber-400 shrink-0"
                          >
                            <BookOpen className="w-3 h-3" />
                            <span>Open p.{cit.pageNumber}</span>
                          </button>
                        </div>
                        {cit.chapterTitle && (
                          <div className="text-[11px] text-zinc-500 truncate">
                            Section: {cit.chapterTitle}
                          </div>
                        )}
                        {cit.quote && (
                          <blockquote className="text-[11px] italic text-zinc-600 dark:text-zinc-300 border-l-2 border-amber-500 pl-2.5">
                            “{cit.quote}”
                          </blockquote>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useRef, useState } from 'react';
import {
  BookOpen,
  FileUp,
  Headphones,
  Layers,
  Loader2,
  LogIn,
  Moon,
  Palette,
  ScanLine,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { useAppAuth } from '../contexts/AppAuthContext';
import { PALETTE_PRESETS, getThemeForPage } from '../data/palettes';
import { EbookDocument, PaletteId, ShellTheme } from '../types/ebook';
import { ConversionProgress } from '../utils/pdfConverter';
import { CrossBookSearchPanel } from './CrossBookSearchPanel';
import { ReadingDashboardBand } from './ReadingDashboardBand';

interface LibraryStudioProps {
  books: EbookDocument[];
  selectedPalette: PaletteId;
  shellTheme: ShellTheme;
  isConverting: boolean;
  conversionProgress: ConversionProgress | null;
  conversionError: string | null;
  onSelectPalette: (paletteId: PaletteId) => void;
  onUploadPdf: (file: File) => void;
  onOpenScanToBook: () => void;
  onReviewBookScans: (book: EbookDocument) => void;
  onOpenBook: (book: EbookDocument) => void;
  onOpenBookAtPage?: (bookId: string, pageNumber: number) => void;
  onDeleteBook: (bookId: string) => void;
  onToggleTheme: () => void;
}

export const LibraryStudio: React.FC<LibraryStudioProps> = ({
  books,
  selectedPalette,
  shellTheme,
  isConverting,
  conversionProgress,
  conversionError,
  onSelectPalette,
  onUploadPdf,
  onOpenScanToBook,
  onReviewBookScans,
  onOpenBook,
  onOpenBookAtPage,
  onDeleteBook,
  onToggleTheme,
}) => {
  const { user, isSigningIn, signInWithGoogle, signOutGoogle } = useAppAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      onUploadPdf(file);
    }
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const previewThemes = [1, 2, 3, 4].map((n) => getThemeForPage(selectedPalette, n));

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F9F8] text-zinc-900 dark:bg-[#0B0D12] dark:text-zinc-100">
      {/* Hidden PDF Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 dark:border-zinc-800 bg-[#F9F9F8]/90 dark:bg-[#0B0D12]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Wordmark */}
          <a
            href="#top"
            className="font-serif text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap shrink-0"
          >
            ChromaFolio
          </a>

          {/* Zone 2: 4 Single-line Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            <a
              href="#converter"
              className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Converter
            </a>
            <a
              href="#palettes"
              className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Palette Studio
            </a>
            <a
              href="#library"
              className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Library
            </a>
            <a
              href="#capabilities"
              className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </a>
          </nav>

          {/* Zone 3: Google Account & Primary CTA */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void signOutGoogle()}
                title={`Signed in as ${user.displayName || user.email || 'Google user'} (click to sign out)`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    referrerPolicy="no-referrer"
                    className="w-4 h-4 rounded-full"
                  />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                )}
                <span className="hidden sm:inline max-w-[110px] truncate">
                  {user.displayName?.split(' ')[0] || 'Google'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{isSigningIn ? 'Signing in…' : 'Google Sign-In'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={triggerFilePicker}
              disabled={isConverting}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {isConverting ? 'Converting…' : 'Upload PDF'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Split-Screen Editorial Hero */}
        <section id="converter" className="max-w-7xl mx-auto px-6 pt-10 pb-12 lg:pt-14 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            {/* Left Column: Headline + PDF Dropzone */}
            <div className="lg:col-span-6 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  PDF to Colourful eBook Studio · Client-Side Engine + AI Companion
                </p>
                <h1 className="font-serif text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.08] text-zinc-900 dark:text-zinc-100 text-balance">
                  Turn any book PDF into a vivid, colourful eBook.
                </h1>
                <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl">
                  Drop any PDF book and instantly transform every single page into a luminous,
                  chromatic spread with drop caps, 5-ink highlights, audio narration, EPUB export,
                  and AI study tools.
                </p>
              </div>

              {/* Interactive Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  handleFiles(e.dataTransfer.files);
                }}
                className={`rounded-2xl border-2 border-dashed p-6 sm:p-7 transition-all ${
                  dragActive
                    ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/20'
                    : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#12151E]'
                }`}
              >
                {isConverting && conversionProgress ? (
                  <div className="space-y-3 py-2">
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span className="inline-flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                        <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                        {conversionProgress.stage}
                      </span>
                      <span className="font-mono tabular-nums text-xs text-zinc-500">
                        {conversionProgress.currentPage} / {conversionProgress.totalPages}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all duration-200"
                        style={{
                          width: `${Math.round(
                            (conversionProgress.currentPage /
                              Math.max(1, conversionProgress.totalPages)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        <FileUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>Drop a book PDF here or browse</span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Every page is colour-graded automatically · Saved locally in your browser
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={triggerFilePicker}
                        className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
                      >
                        Choose PDF
                      </button>
                      <button
                        type="button"
                        onClick={onOpenScanToBook}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
                      >
                        <ScanLine className="w-3.5 h-3.5" />
                        <span>Scan to Book</span>
                      </button>
                      {books[0] && (
                        <button
                          type="button"
                          onClick={() => onOpenBook(books[0])}
                          className="px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
                        >
                          Open Sample
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {conversionError && (
                  <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">
                    {conversionError}
                  </p>
                )}
              </div>
            </div>

            {/* Right Column: Full-height Visual Anchor */}
            <div className="lg:col-span-6">
              <div className="relative h-72 sm:h-96 lg:h-full min-h-[340px] rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-200 dark:bg-zinc-900">
                <img
                  src="/src/assets/images/hero_ebook_studio_1795396763148.jpg"
                  alt="Colourful open art books and digital e-reader showing vibrant illustrated spreads"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-Column Feature Strip Below Hero */}
          <div
            id="capabilities"
            className="mt-10 pt-8 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-2 lg:grid-cols-4 gap-6"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <Palette className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>8 Chromatic Palettes</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Prismatic auto-cycle gives every consecutive page its own vivid editorial hue.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>2-Page Spread & Canvas</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Switch between reflowed serif spreads, single-page focus, or colour-graded PDF pages.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <Headphones className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Voice Narrator & Ambience</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Read-aloud narration with auto-page turn plus synthesized rain and hearth soundscapes.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span>AI Study & EPUB Export</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Instant page summaries, Bengali/multilingual translation, quizzes, and real .EPUB export.
              </p>
            </div>
          </div>
        </section>

        {/* Daily Reading Goal Progress Ring, Weekly Schedule & Google/AI Connection */}
        <ReadingDashboardBand />

        {/* Interactive Palette Studio Preview */}
        <section
          id="palettes"
          className="border-y border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#10131C] py-12"
        >
          <div className="max-w-7xl mx-auto px-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
                  Interactive Page Colour Studio
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  Pick a colour palette before uploading—or change palettes anytime inside the reader.
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleTheme}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 self-start whitespace-nowrap shrink-0"
              >
                {shellTheme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Light Studio</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5" />
                    <span>Dark Studio</span>
                  </>
                )}
              </button>
            </div>

            {/* Segmented Palette Buttons */}
            <div className="flex flex-wrap gap-2">
              {PALETTE_PRESETS.map((preset) => {
                const active = selectedPalette === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectPalette(preset.id)}
                    className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                      active
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-zinc-950 dark:text-amber-200'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <span className="flex items-center -space-x-1">
                      {preset.swatches.map((hex, i) => (
                        <span
                          key={i}
                          className="w-3.5 h-3.5 rounded-full border border-black/15"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </span>
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 4-Page Live Chromatic Preview Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {previewThemes.map((t, i) => (
                <div
                  key={`${t.id}-${i}`}
                  className="rounded-xl border p-5 flex flex-col justify-between min-h-[180px] ebook-paper-grain transition-all"
                  style={{
                    background: t.paperGradient,
                    color: t.inkColor,
                    borderColor: t.borderColor,
                  }}
                >
                  <div>
                    <div
                      className="text-[11px] font-mono tabular-nums pb-2 mb-3 border-b flex justify-between"
                      style={{ borderColor: t.borderColor, color: t.mutedInk }}
                    >
                      <span>{t.name}</span>
                      <span>p.{i + 1}</span>
                    </div>
                    <div
                      className="font-serif font-semibold text-base mb-1.5"
                      style={{ color: t.accentColor }}
                    >
                      Chapter {i + 1} Spread
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">
                      Vivid editorial typography paired with balanced ink contrast and warm paper gradients.
                    </p>
                  </div>
                  <div
                    className="mt-4 h-1 w-12 rounded-full"
                    style={{ backgroundColor: t.ornamentColor }}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Your Colourful eBook Library */}
        <section id="library" className="max-w-7xl mx-auto px-6 py-12 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
                Your eBook Library
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                Converted PDFs and sample editions · Reading progress, highlights, and bookmarks stay saved.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onOpenScanToBook}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
              >
                <ScanLine className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Scan to Book</span>
              </button>
              <span className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                {books.length} {books.length === 1 ? 'book' : 'books'}
              </span>
            </div>
          </div>

          <CrossBookSearchPanel
            books={books}
            onOpenBookAtPage={(bookId, pageNumber) => {
              if (onOpenBookAtPage) {
                onOpenBookAtPage(bookId, pageNumber);
              } else {
                const target = books.find((b) => b.id === bookId);
                if (target) {
                  onOpenBook({
                    ...target,
                    currentPage: Math.min(Math.max(1, pageNumber), target.totalPages),
                  });
                }
              }
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {books.map((book) => {
              const progressPct = Math.round((book.currentPage / Math.max(1, book.totalPages)) * 100);
              const firstTheme = getThemeForPage(book.paletteId, 1);

              return (
                <article
                  key={book.id}
                  className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] overflow-hidden flex flex-col transition-shadow hover:shadow-md"
                >
                  {/* Cover Thumbnail */}
                  <button
                    type="button"
                    onClick={() => onOpenBook(book)}
                    className="relative h-56 w-full overflow-hidden text-left focus:outline-none"
                    style={{ background: firstTheme.paperGradient }}
                  >
                    {book.coverDataUrl ? (
                      <img
                        src={book.coverDataUrl}
                        alt={book.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="w-full h-full p-6 flex flex-col justify-between">
                        <span className="text-xs font-mono uppercase tracking-wider opacity-70" style={{ color: firstTheme.mutedInk }}>
                          Colourful Edition
                        </span>
                        <h3 className="font-serif text-2xl font-semibold" style={{ color: firstTheme.accentColor }}>
                          {book.title}
                        </h3>
                      </div>
                    )}
                  </button>

                  {/* Card Body — Zero-Pill Unboxed Metadata */}
                  <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <h3 className="font-serif text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                        {book.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                        <span>{book.author}</span>
                        <span aria-hidden="true">·</span>
                        <span>{book.totalPages} pages</span>
                        <span aria-hidden="true">·</span>
                        <span>{progressPct}% read</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenBook(book)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>{book.currentPage > 1 ? `Continue (p.${book.currentPage})` : 'Read eBook'}</span>
                        </button>

                        {book.scanData && (
                          <button
                            type="button"
                            onClick={() => onReviewBookScans(book)}
                            title="Review & correct original scans or OCR"
                            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-amber-600 hover:border-amber-300 dark:hover:border-amber-800 transition-colors"
                          >
                            <ScanLine className="w-4 h-4" />
                          </button>
                        )}

                        {!book.isSample && (
                          <button
                            type="button"
                            onClick={() => onDeleteBook(book.id)}
                            title="Delete book from library"
                            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-900 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6 px-6 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>ChromaFolio — PDF to Colourful eBook Studio</span>
          <span>Local IndexedDB storage · EPUB 3.0 & Standalone HTML Export</span>
        </div>
      </footer>
    </div>
  );
};

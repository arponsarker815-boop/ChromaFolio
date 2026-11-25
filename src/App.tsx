import { useCallback, useEffect, useState } from 'react';
import { EbookReader } from './components/EbookReader';
import { LibraryStudio } from './components/LibraryStudio';
import { ScanToBookModal } from './components/ScanToBookModal';
import { AppAuthProvider, FirebaseErrorBoundary } from './contexts/AppAuthContext';
import { SAMPLE_EBOOKS } from './data/sampleBooks';
import { EbookDocument, PaletteId, ReaderSettings } from './types/ebook';
import { ConversionProgress, convertPdfToEbook } from './utils/pdfConverter';
import {
  deleteBookFromStore,
  getAllStoredBooks,
  loadReaderSettings,
  saveBookToStore,
  saveReaderSettings,
} from './utils/storage';

export default function App() {
  const [books, setBooks] = useState<EbookDocument[]>(SAMPLE_EBOOKS);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [selectedPalette, setSelectedPalette] = useState<PaletteId>('prismatic');
  const [settings, setSettings] = useState<ReaderSettings>(() => loadReaderSettings());

  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<ConversionProgress | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanReviewBook, setScanReviewBook] = useState<EbookDocument | null>(null);

  // Sync Tailwind v4 .dark class on <html>
  useEffect(() => {
    const isDark = settings.shellTheme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
  }, [settings.shellTheme]);

  // Load persisted books from IndexedDB & ensure sample editions exist
  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await getAllStoredBooks();
      if (!mounted) return;
      const storedIds = new Set(stored.map((b) => b.id));
      const missingSamples = SAMPLE_EBOOKS.filter((s) => !storedIds.has(s.id));
      const merged = [...stored, ...missingSamples].sort(
        (a, b) => b.lastOpenedAt - a.lastOpenedAt
      );
      setBooks(merged);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveReaderSettings(next);
      return next;
    });
  }, []);

  const handleUploadPdf = async (file: File) => {
    setIsConverting(true);
    setConversionError(null);
    setConversionProgress({
      currentPage: 1,
      totalPages: 1,
      stage: 'Reading PDF structure…',
    });

    try {
      const ebook = await convertPdfToEbook(file, selectedPalette, (progress) => {
        setConversionProgress(progress);
      });
      await saveBookToStore(ebook);
      setBooks((prev) => [ebook, ...prev]);
      setActiveBookId(ebook.id);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not convert this PDF. Please verify it is a valid, unencrypted PDF file.';
      setConversionError(msg);
    } finally {
      setIsConverting(false);
      setConversionProgress(null);
    }
  };

  const handleUpdateBook = useCallback((updated: EbookDocument) => {
    setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    void saveBookToStore(updated);
  }, []);

  const handleSaveScannedBook = useCallback(
    async (scannedBook: EbookDocument, openInReader: boolean) => {
      await saveBookToStore(scannedBook);
      setBooks((prev) => {
        const exists = prev.some((b) => b.id === scannedBook.id);
        return exists
          ? prev.map((b) => (b.id === scannedBook.id ? scannedBook : b))
          : [scannedBook, ...prev];
      });
      if (openInReader) {
        setActiveBookId(scannedBook.id);
      }
    },
    []
  );

  const handleDeleteBook = useCallback(
    (bookId: string) => {
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
      if (activeBookId === bookId) setActiveBookId(null);
      void deleteBookFromStore(bookId);
    },
    [activeBookId]
  );

  const activeBook = books.find((b) => b.id === activeBookId) ?? null;

  return (
    <FirebaseErrorBoundary>
      <AppAuthProvider
        initialAiProvider={settings.aiProvider ?? 'gemini'}
        initialVoiceEngine={settings.voiceEngine ?? 'google-ai'}
        initialGoogleVoice={settings.googleVoiceName ?? 'Kore'}
        onSyncReaderPrefs={handleUpdateSettings}
      >
        {activeBook ? (
          <EbookReader
            key={activeBook.id}
            book={activeBook}
            settings={settings}
            onBackToLibrary={() => setActiveBookId(null)}
            onUpdateBook={handleUpdateBook}
            onUpdateSettings={handleUpdateSettings}
            onReviewBookScans={
              activeBook.scanData
                ? () => {
                    setScanReviewBook(activeBook);
                    setScanModalOpen(true);
                  }
                : undefined
            }
          />
        ) : (
          <LibraryStudio
            books={books}
            selectedPalette={selectedPalette}
            shellTheme={settings.shellTheme}
            isConverting={isConverting}
            conversionProgress={conversionProgress}
            conversionError={conversionError}
            onSelectPalette={setSelectedPalette}
            onUploadPdf={handleUploadPdf}
            onOpenScanToBook={() => {
              setScanReviewBook(null);
              setScanModalOpen(true);
            }}
            onReviewBookScans={(book) => {
              setScanReviewBook(book);
              setScanModalOpen(true);
            }}
            onOpenBook={(book) => {
              const opened = { ...book, lastOpenedAt: Date.now() };
              handleUpdateBook(opened);
              setActiveBookId(book.id);
            }}
            onOpenBookAtPage={(bookId, pageNumber) => {
              const target = books.find((b) => b.id === bookId);
              if (!target) return;
              const clampedPage = Math.min(Math.max(1, pageNumber), Math.max(1, target.totalPages));
              const updated = {
                ...target,
                currentPage: clampedPage,
                lastOpenedAt: Date.now(),
              };
              handleUpdateBook(updated);
              setActiveBookId(target.id);
            }}
            onDeleteBook={handleDeleteBook}
            onToggleTheme={() =>
              handleUpdateSettings({
                shellTheme: settings.shellTheme === 'dark' ? 'light' : 'dark',
              })
            }
          />
        )}

        <ScanToBookModal
          open={scanModalOpen}
          defaultPalette={selectedPalette}
          initialBook={scanReviewBook}
          onClose={() => {
            setScanModalOpen(false);
            setScanReviewBook(null);
          }}
          onSaveBook={handleSaveScannedBook}
        />
      </AppAuthProvider>
    </FirebaseErrorBoundary>
  );
}

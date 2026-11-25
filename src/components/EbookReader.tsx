import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileCode2,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Headphones,
  Highlighter,
  Languages,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  Palette,
  Pin,
  PinOff,
  Printer,
  RefreshCw,
  ScanLine,
  Search,
  Sparkles,
  StickyNote,
  Type,
  X,
} from 'lucide-react';
import { useAppAuth } from '../contexts/AppAuthContext';
import { HIGHLIGHT_STYLES, getThemeForPage } from '../data/palettes';
import {
  AiSelectionRequest,
  BookLanguageCode,
  BookTopicId,
  EbookBlock,
  EbookDocument,
  FlashcardItem,
  GoogleVoiceName,
  HighlightColor,
  PageVisualStyle,
  PaletteId,
  ReaderSettings,
  ScanPageRecord,
  StudyNoteItem,
  TranslatedBookEdition,
} from '../types/ebook';
import { ambientAudio } from '../utils/ambientAudio';
import {
  exportAsEpub,
  exportAsStandaloneHtml,
  exportFlashcardsAsCsv,
  exportNotesAsMarkdown,
} from '../utils/exporters';
import {
  buildOriginalScanPdf,
  buildSearchableScanPdf,
  triggerPdfDownload,
} from '../utils/scanPdfBuilder';
import { BOOK_LANGUAGE_OPTIONS, resolveLanguageMeta } from '../utils/languages';
import {
  mountGoogleTranslateWidget,
  openInGoogleTranslateTab,
  setGoogleLiveWidgetLanguage,
  translateBookPageWithGoogleGtx,
} from '../utils/googleTranslate';
import { detectPageTopic } from '../utils/topicGraphics';
import { ColourfulPage } from './ColourfulPage';
import { ActiveDrawer, ReaderDrawers } from './ReaderDrawers';
import { StudyToolsDrawer } from './StudyToolsDrawer';
import { TypographyStudioPopover } from './TypographyStudioPopover';

interface EbookReaderProps {
  book: EbookDocument;
  settings: ReaderSettings;
  onBackToLibrary: () => void;
  onUpdateBook: (updated: EbookDocument) => void;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  onReviewBookScans?: () => void;
}

export const EbookReader: React.FC<EbookReaderProps> = ({
  book,
  settings,
  onBackToLibrary,
  onUpdateBook,
  onUpdateSettings,
  onReviewBookScans,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(
    Math.min(Math.max(1, book.currentPage || 1), book.totalPages)
  );
  const [flipDirection, setFlipDirection] = useState<1 | -1>(1);
  const [drawer, setDrawer] = useState<ActiveDrawer>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [fontStudioOpen, setFontStudioOpen] = useState(false);
  const [penMenuOpen, setPenMenuOpen] = useState(false);
  const [activeHighlighterPen, setActiveHighlighterPen] = useState<HighlightColor | null>(null);
  const [customLangInput, setCustomLangInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chromeOpen, setChromeOpen] = useState(false);
  const [chromePinned, setChromePinned] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeTtsBlockIndex, setActiveTtsBlockIndex] = useState<number | null>(null);
  const [exportingEpub, setExportingEpub] = useState(false);
  const [translatingBook, setTranslatingBook] = useState<{
    target: string;
    label: string;
    current: number;
    total: number;
  } | null>(null);
  const [bookTranslateError, setBookTranslateError] = useState<string | null>(null);
  const [pendingAiSelection, setPendingAiSelection] = useState<AiSelectionRequest | null>(null);
  const [pendingAskSelection, setPendingAskSelection] = useState<{
    text: string;
    pageNumber: number;
    chapterTitle: string;
    triggerId: number;
  } | null>(null);
  const [pendingStudySelection, setPendingStudySelection] = useState<{
    text: string;
    pageNumber: number;
    chapterTitle: string;
    triggerId: number;
  } | null>(null);
  const [itemInspector, setItemInspector] = useState<{
    kind: 'table' | 'formula' | 'diagram';
    pageNumber: number;
    block?: EbookBlock;
    scanPage?: ScanPageRecord;
    showOriginalPhoto: boolean;
    question: string;
    loading: boolean;
    explanation?: string;
    error?: string;
  } | null>(null);

  // Student Pomodoro Focus Timer
  const [timerPresetMinutes, setTimerPresetMinutes] = useState(25);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerBellEnabled, setTimerBellEnabled] = useState(true);
  const [scrollState, setScrollState] = useState<{
    fraction: number;
    hasOverflow: boolean;
    withinPageFraction: number;
  }>({ fraction: 0, hasOverflow: false, withinPageFraction: 1 });
  const [dragFlip, setDragFlip] = useState<{
    deltaX: number;
    progress: number;
    direction: 1 | -1;
    side: 'left' | 'right' | 'swipe';
    anchorY: number;
    willTurn: boolean;
  } | null>(null);

  const readerRootRef = useRef<HTMLDivElement>(null);
  const scrollListRef = useRef<HTMLDivElement>(null);
  const bookSurfaceRef = useRef<HTMLDivElement>(null);
  const chromeHideTimerRef = useRef<number | null>(null);
  const pointerGestureRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startTime: number;
    side: 'left' | 'right' | 'swipe';
    isEdgeZone: boolean;
    cornerDir: 1 | -1 | null;
    anchorY: number;
    containerWidth: number;
    pointerType: string;
    moved: boolean;
  } | null>(null);
  const { getAuthHeaders, logReadingProgress } = useAppAuth();
  const lastDragTurnAtRef = useRef<number>(0);
  const ttsCancelledRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const speakingPageRef = useRef<number | null>(null);
  const ttsSessionIdRef = useRef(0);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioCacheRef = useRef<
    Map<string, Promise<{ audioBase64: string; mimeType: string } | null>>
  >(new Map());
  const visitedPagesRef = useRef<Set<number>>(new Set([Math.min(Math.max(1, book.currentPage || 1), book.totalPages)]));
  const bookRef = useRef(book);
  bookRef.current = book;

  const activeLanguage: BookLanguageCode = book.activeLanguage ?? 'original';
  const activeLangMeta = useMemo(
    () =>
      resolveLanguageMeta(
        activeLanguage !== 'original'
          ? book.translations?.[activeLanguage]?.label || activeLanguage
          : 'original'
      ),
    [activeLanguage, book.translations]
  );

  // Project active language (Original / বাংলা / हिन्दी) cleanly over the book
  const displayBook: EbookDocument = useMemo(() => {
    if (activeLanguage === 'original') return book;
    const edition = book.translations?.[activeLanguage];
    if (!edition) return book;
    return {
      ...book,
      title: edition.title || book.title,
      chapters: edition.chapters.length > 0 ? edition.chapters : book.chapters,
      pages: book.pages.map((p) => {
        const tp = edition.pages[p.pageNumber];
        if (!tp) return p;
        return {
          ...p,
          chapterTitle: tp.chapterTitle || p.chapterTitle,
          blocks: tp.blocks.length > 0 ? tp.blocks : p.blocks,
          rawText: tp.rawText || p.rawText,
        };
      }),
    };
  }, [book, activeLanguage]);

  // Sync currentPage back to persisted book + track daily pages read
  useEffect(() => {
    if (!visitedPagesRef.current.has(currentPage)) {
      visitedPagesRef.current.add(currentPage);
      logReadingProgress({ deltaPages: 1 });
    }
    if (book.currentPage !== currentPage) {
      onUpdateBook({
        ...book,
        currentPage,
        lastOpenedAt: Date.now(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Track active reading minutes automatically toward daily reading goal
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        logReadingProgress({ deltaMinutes: 1 });
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [logReadingProgress]);

  // Cleanup speech, audio element & ambient audio on unmount
  useEffect(() => {
    return () => {
      ttsCancelledRef.current = true;
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = '';
        activeAudioRef.current = null;
      }
      window.speechSynthesis?.cancel();
      ambientAudio.stop();
    };
  }, []);

  // Mount official Google Translate 130+ language widget when Language Menu opens
  useEffect(() => {
    if (!langMenuOpen) return;
    const mountId = isFullscreen
      ? 'google_translate_book_fs'
      : 'google_translate_book_main';
    const timer = window.setTimeout(() => {
      void mountGoogleTranslateWidget(mountId);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [langMenuOpen, isFullscreen]);

  // Pomodoro timer countdown + log real elapsed study minutes
  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => {
      setTimerSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          if (timerBellEnabled) {
            ambientAudio.playTimerChime();
          }
          const latest = bookRef.current;
          onUpdateBook({
            ...latest,
            studyMinutes: (latest.studyMinutes ?? 0) + timerPresetMinutes,
          });
          return 0;
        }
        // Increment logged study minute every 60 seconds elapsed
        const next = prev - 1;
        if (next > 0 && (timerPresetMinutes * 60 - next) % 60 === 0) {
          const latest = bookRef.current;
          onUpdateBook({
            ...latest,
            studyMinutes: (latest.studyMinutes ?? 0) + 1,
          });
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, timerBellEnabled, timerPresetMinutes, onUpdateBook]);

  // Track window scroll position and active scroll page for real-time completion %
  useEffect(() => {
    let rafId = 0;
    const measureScroll = () => {
      const docEl = document.documentElement;
      const scrollable = Math.max(0, docEl.scrollHeight - window.innerHeight);
      const hasOverflow = scrollable > 16;
      const fraction = hasOverflow
        ? Math.min(1, Math.max(0, window.scrollY / scrollable))
        : 1;

      let withinPageFraction = fraction;

      if (settings.layoutMode === 'scroll' && scrollListRef.current) {
        const pageEls = Array.from(
          scrollListRef.current.querySelectorAll<HTMLElement>('[data-scroll-page]')
        );
        if (pageEls.length > 0) {
          const probeY = window.innerHeight * 0.38;
          let activeEl = pageEls[0];
          for (const el of pageEls) {
            const rect = el.getBoundingClientRect();
            if (rect.top <= probeY) {
              activeEl = el;
            }
          }
          const detectedPage = Number(activeEl.dataset.scrollPage);
          if (Number.isFinite(detectedPage) && detectedPage >= 1) {
            setCurrentPage((prev) => (prev === detectedPage ? prev : detectedPage));
          }
          const activeRect = activeEl.getBoundingClientRect();
          const elHeight = Math.max(1, activeRect.height);
          withinPageFraction = Math.min(
            1,
            Math.max(0, (probeY - activeRect.top) / elHeight)
          );
        }
      }

      setScrollState({ fraction, hasOverflow, withinPageFraction });
    };

    const onScrollOrResize = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        measureScroll();
      });
    };

    measureScroll();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [settings.layoutMode, currentPage, displayBook.totalPages]);

  const stepSize = settings.layoutMode === 'spread' ? 2 : 1;

  const triggerTurnSound = useCallback(
    (direction: 1 | -1) => {
      ambientAudio.playPageTurnSound(
        settings.pageSoundStyle ?? 'paper',
        direction,
        settings.pageSoundVolume ?? 0.65
      );
    },
    [settings.pageSoundStyle, settings.pageSoundVolume]
  );

  const goToPage = useCallback(
    (target: number) => {
      const clamped = Math.min(Math.max(1, target), book.totalPages);
      if (clamped !== currentPage) {
        const dir: 1 | -1 = clamped > currentPage ? 1 : -1;
        setFlipDirection(dir);
        triggerTurnSound(dir);
      }
      setCurrentPage(clamped);
      if (settings.layoutMode === 'scroll' && scrollListRef.current) {
        const targetEl = scrollListRef.current.querySelector<HTMLElement>(
          `[data-scroll-page="${clamped}"]`
        );
        targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [book.totalPages, currentPage, settings.layoutMode, triggerTurnSound]
  );

  const goNext = useCallback(() => {
    if (settings.layoutMode === 'spread') {
      const left = currentPage % 2 === 1 ? currentPage : currentPage - 1;
      const next = Math.min(book.totalPages, left + 2);
      if (next !== left) {
        setFlipDirection(1);
        triggerTurnSound(1);
        setCurrentPage(next);
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    } else if (currentPage < book.totalPages) {
      goToPage(currentPage + 1);
    }
  }, [book.totalPages, currentPage, goToPage, settings.layoutMode, triggerTurnSound]);

  const goPrev = useCallback(() => {
    if (settings.layoutMode === 'spread') {
      const left = currentPage % 2 === 1 ? currentPage : currentPage - 1;
      const prev = Math.max(1, left - 2);
      if (prev !== left) {
        setFlipDirection(-1);
        triggerTurnSound(-1);
        setCurrentPage(prev);
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    } else if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, goToPage, settings.layoutMode, triggerTurnSound]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void readerRootRef.current?.requestFullscreen?.().catch(() => {
        setIsFullscreen(true);
      });
    } else {
      void document.exitFullscreen?.().catch(() => {
        setIsFullscreen(false);
      });
    }
  }, []);

  const toggleBookmark = useCallback(
    (pageNum: number) => {
      const exists = book.bookmarks.some((b) => b.pageNumber === pageNum);
      const pageObj = book.pages.find((p) => p.pageNumber === pageNum);
      const nextBookmarks = exists
        ? book.bookmarks.filter((b) => b.pageNumber !== pageNum)
        : [
            ...book.bookmarks,
            {
              pageNumber: pageNum,
              label: pageObj?.chapterTitle || `Page ${pageNum}`,
              createdAt: Date.now(),
            },
          ].sort((a, b) => a.pageNumber - b.pageNumber);

      onUpdateBook({ ...book, bookmarks: nextBookmarks });
    },
    [book, onUpdateBook]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        setDrawer(null);
        setExportOpen(false);
        setFontStudioOpen(false);
        setPenMenuOpen(false);
        setLangMenuOpen(false);
        setChromeOpen(false);
      } else if (e.key.toLowerCase() === 'm') {
        setChromeOpen((v) => !v);
      } else if (e.key.toLowerCase() === 'b') {
        toggleBookmark(currentPage);
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPage, goNext, goPrev, toggleBookmark, toggleFullscreen]);

  const stopTts = useCallback(() => {
    ttsCancelledRef.current = true;
    ttsSessionIdRef.current += 1;
    isSpeakingRef.current = false;
    speakingPageRef.current = null;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = '';
      activeAudioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setActiveTtsBlockIndex(null);
  }, []);

  const pickSmoothGoogleVoice = useCallback((langTag: string): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const shortLang = langTag.split('-')[0].toLowerCase();
    return (
      voices.find(
        (v) => /google/i.test(v.name) && v.lang.toLowerCase().startsWith(shortLang)
      ) ||
      voices.find((v) => /natural|neural|wavenet|samantha|aria/i.test(v.name) && v.lang.toLowerCase().startsWith(shortLang)) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(shortLang)) ||
      voices.find((v) => /google/i.test(v.name)) ||
      null
    );
  }, []);

  const fetchGoogleTtsAudio = useCallback(
    (
      text: string,
      voiceName: GoogleVoiceName,
      langLabel: string
    ): Promise<{ audioBase64: string; mimeType: string } | null> => {
      const cleaned = text.trim().slice(0, 1400);
      if (!cleaned) return Promise.resolve(null);
      const cacheKey = `${voiceName}::${langLabel}::${cleaned}`;
      const cached = ttsAudioCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const reqPromise = (async () => {
        try {
          const authHeaders = await getAuthHeaders();
          const res = await fetch('/api/ai/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders,
            },
            body: JSON.stringify({
              text: cleaned,
              voiceName,
              languageLabel: langLabel,
            }),
          });
          if (!res.ok) return null;
          const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
          if (!data.audioBase64) return null;
          return {
            audioBase64: data.audioBase64,
            mimeType: data.mimeType || 'audio/wav',
          };
        } catch {
          return null;
        }
      })();

      if (ttsAudioCacheRef.current.size > 40) {
        const oldestKey = ttsAudioCacheRef.current.keys().next().value;
        if (oldestKey) ttsAudioCacheRef.current.delete(oldestKey);
      }
      ttsAudioCacheRef.current.set(cacheKey, reqPromise);
      return reqPromise;
    },
    [getAuthHeaders]
  );

  const speakPage = useCallback(
    (pageNum: number) => {
      const pageObj = displayBook.pages.find((p) => p.pageNumber === pageNum);
      if (!pageObj) return;

      ttsSessionIdRef.current += 1;
      const sessionId = ttsSessionIdRef.current;
      speakingPageRef.current = pageNum;
      isSpeakingRef.current = true;
      ttsCancelledRef.current = false;

      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = '';
        activeAudioRef.current = null;
      }
      window.speechSynthesis?.cancel();
      setIsSpeaking(true);

      const blocks = pageObj.blocks;
      const voiceName: GoogleVoiceName = settings.googleVoiceName ?? 'Kore';
      const useGoogleAiVoice = (settings.voiceEngine ?? 'google-ai') === 'google-ai';
      const langLabel = activeLanguage !== 'original' ? activeLangMeta.promptName : 'original';
      const browserLang = activeLanguage !== 'original' ? activeLangMeta.ttsLang : 'en-US';
      let idx = 0;

      const isStale = () => ttsCancelledRef.current || ttsSessionIdRef.current !== sessionId;

      const speakWithBrowserFallback = (text: string, onDone: () => void) => {
        if (isStale() || !('speechSynthesis' in window)) {
          if (ttsSessionIdRef.current === sessionId) {
            isSpeakingRef.current = false;
            speakingPageRef.current = null;
            setIsSpeaking(false);
            setActiveTtsBlockIndex(null);
          }
          return;
        }
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = settings.ttsRate;
        utter.pitch = 1.0;
        utter.lang = browserLang;
        const preferredVoice = pickSmoothGoogleVoice(browserLang);
        if (preferredVoice) utter.voice = preferredVoice;
        utter.onend = () => {
          if (!isStale()) onDone();
        };
        utter.onerror = () => {
          if (ttsSessionIdRef.current === sessionId) {
            isSpeakingRef.current = false;
            speakingPageRef.current = null;
            setIsSpeaking(false);
            setActiveTtsBlockIndex(null);
          }
        };
        window.speechSynthesis.speak(utter);
      };

      const speakNextBlock = async () => {
        while (idx < blocks.length && !blocks[idx].text.trim()) {
          idx += 1;
        }
        if (isStale()) return;
        if (idx >= blocks.length) {
          setActiveTtsBlockIndex(null);
          if (settings.autoReadTurn && pageNum < displayBook.totalPages) {
            const nextP = pageNum + 1;
            setFlipDirection(1);
            triggerTurnSound(1);
            setCurrentPage(nextP);
            if (settings.layoutMode === 'scroll' && scrollListRef.current) {
              const targetEl = scrollListRef.current.querySelector<HTMLElement>(
                `[data-scroll-page="${nextP}"]`
              );
              targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              window.scrollTo({ top: 0, behavior: 'auto' });
            }
            // The [currentPage] sync effect automatically starts audio on nextP
          } else {
            isSpeakingRef.current = false;
            speakingPageRef.current = null;
            setIsSpeaking(false);
          }
          return;
        }

        const block = blocks[idx];
        setActiveTtsBlockIndex(idx);

        // Prefetch next non-empty block in parallel so transitions feel smooth and uninterrupted
        if (useGoogleAiVoice) {
          let nextNonEmptyIdx = idx + 1;
          while (nextNonEmptyIdx < blocks.length && !blocks[nextNonEmptyIdx].text.trim()) {
            nextNonEmptyIdx += 1;
          }
          if (nextNonEmptyIdx < blocks.length) {
            void fetchGoogleTtsAudio(blocks[nextNonEmptyIdx].text, voiceName, langLabel);
          }
        }

        if (useGoogleAiVoice) {
          const audioResult = await fetchGoogleTtsAudio(block.text, voiceName, langLabel);
          if (isStale()) return;
          if (audioResult?.audioBase64) {
            try {
              const audio = new Audio(`data:${audioResult.mimeType};base64,${audioResult.audioBase64}`);
              audio.playbackRate = Math.min(2, Math.max(0.65, settings.ttsRate));
              activeAudioRef.current = audio;
              audio.onended = () => {
                if (activeAudioRef.current === audio) activeAudioRef.current = null;
                if (!isStale()) {
                  idx += 1;
                  void speakNextBlock();
                }
              };
              audio.onerror = () => {
                if (activeAudioRef.current === audio) activeAudioRef.current = null;
                if (isStale()) return;
                speakWithBrowserFallback(block.text, () => {
                  idx += 1;
                  void speakNextBlock();
                });
              };
              await audio.play();
              return;
            } catch {
              activeAudioRef.current = null;
            }
          }
        }

        if (isStale()) return;
        speakWithBrowserFallback(block.text, () => {
          idx += 1;
          void speakNextBlock();
        });
      };

      void speakNextBlock();
    },
    [
      displayBook.pages,
      displayBook.totalPages,
      activeLanguage,
      activeLangMeta.promptName,
      activeLangMeta.ttsLang,
      settings.autoReadTurn,
      settings.layoutMode,
      settings.ttsRate,
      settings.voiceEngine,
      settings.googleVoiceName,
      fetchGoogleTtsAudio,
      pickSmoothGoogleVoice,
      triggerTurnSound,
    ]
  );

  // Whenever page changes while audio is actively playing, immediately switch audio to the page now in front
  useEffect(() => {
    if (!isSpeakingRef.current || ttsCancelledRef.current) return;
    if (speakingPageRef.current === currentPage) return;

    ttsSessionIdRef.current += 1;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = '';
      activeAudioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setActiveTtsBlockIndex(null);

    const timer = window.setTimeout(() => {
      if (
        isSpeakingRef.current &&
        !ttsCancelledRef.current &&
        speakingPageRef.current !== currentPage
      ) {
        speakPage(currentPage);
      }
    }, 140);

    return () => window.clearTimeout(timer);
  }, [currentPage, speakPage]);

  const handleAddHighlight = (
    pageNumber: number,
    text: string,
    color: HighlightColor,
    note?: string
  ) => {
    const latest = bookRef.current;
    const newItem = {
      id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pageNumber,
      text,
      color,
      note,
      createdAt: Date.now(),
    };
    const updated = { ...latest, highlights: [newItem, ...latest.highlights] };
    bookRef.current = updated;
    onUpdateBook(updated);
  };

  const handleRemoveHighlightByText = (pageNumber: number, text: string) => {
    const latest = bookRef.current;
    const norm = text.replace(/\s+/g, ' ').trim();
    const updated = {
      ...latest,
      highlights: latest.highlights.filter(
        (h) => !(h.pageNumber === pageNumber && h.text.replace(/\s+/g, ' ').trim() === norm)
      ),
    };
    bookRef.current = updated;
    onUpdateBook(updated);
  };

  const handleDeleteHighlight = (id: string) => {
    const latest = bookRef.current;
    const updated = {
      ...latest,
      highlights: latest.highlights.filter((h) => h.id !== id),
    };
    bookRef.current = updated;
    onUpdateBook(updated);
  };

  const handleCyclePageTheme = (pageNumber: number) => {
    const nextPages = book.pages.map((p) => {
      if (p.pageNumber !== pageNumber) return p;
      const base = p.customThemeIndex ?? pageNumber - 1;
      return { ...p, customThemeIndex: base + 1 };
    });
    onUpdateBook({ ...book, pages: nextPages });
  };

  const handleChangePalette = (paletteId: PaletteId) => {
    // Clear per-page overrides so the new global palette applies cleanly across all pages
    const resetPages = book.pages.map((p) => ({ ...p, customThemeIndex: undefined }));
    onUpdateBook({ ...book, paletteId, pages: resetPages });
  };

  const handleChangeBookVisualStyle = (style: PageVisualStyle) => {
    const resetPages = book.pages.map((p) => ({ ...p, customVisualStyle: undefined }));
    onUpdateBook({ ...book, pageVisualStyle: style, pages: resetPages });
  };

  const handleCyclePageVisualStyle = (pageNumber: number) => {
    const order: Array<Exclude<PageVisualStyle, 'auto'>> = [
      'cartoon',
      'infographic',
      'editorial',
      'minimal',
    ];
    const nextPages = book.pages.map((p) => {
      if (p.pageNumber !== pageNumber) return p;
      const currentStyle =
        p.customVisualStyle ??
        (book.pageVisualStyle && book.pageVisualStyle !== 'auto'
          ? book.pageVisualStyle
          : p.pageNumber % 2 === 1
            ? 'cartoon'
            : 'infographic');
      const idx = order.indexOf(currentStyle);
      const nextStyle = order[(idx + 1) % order.length];
      return { ...p, customVisualStyle: nextStyle };
    });
    onUpdateBook({ ...book, pages: nextPages });
  };

  const handleCyclePageTopic = (pageNumber: number) => {
    const topics: BookTopicId[] = ['science', 'nature', 'math', 'art', 'history', 'tech'];
    const nextPages = book.pages.map((p) => {
      if (p.pageNumber !== pageNumber) return p;
      const current = detectPageTopic(p);
      const next = topics[(topics.indexOf(current) + 1) % topics.length];
      return { ...p, customTopic: next };
    });
    onUpdateBook({ ...book, pages: nextPages });
  };

  const handleSwitchBookLanguage = (lang: BookLanguageCode) => {
    if (lang === 'original') {
      setGoogleLiveWidgetLanguage('original');
    }
    onUpdateBook({ ...bookRef.current, activeLanguage: lang });
    setLangMenuOpen(false);
  };

  const handleTranslateFullBook = async (
    targetLangOrName: string,
    forceRetranslate = false
  ) => {
    const meta = resolveLanguageMeta(targetLangOrName);
    const sourceBook = bookRef.current;
    const existingEdition = forceRetranslate ? undefined : sourceBook.translations?.[meta.code];

    setBookTranslateError(null);
    setLangMenuOpen(false);

    // Prioritize current page first, then remaining pages not yet translated
    const remainingPages = sourceBook.pages.filter((p) => !existingEdition?.pages?.[p.pageNumber]);
    const orderedPages =
      forceRetranslate || remainingPages.length === 0 ? [...sourceBook.pages] : remainingPages;

    orderedPages.sort((a, b) => {
      if (a.pageNumber === currentPage) return -1;
      if (b.pageNumber === currentPage) return 1;
      return a.pageNumber - b.pageNumber;
    });

    const translatedPages: TranslatedBookEdition['pages'] = {
      ...(existingEdition?.pages ?? {}),
    };
    let translatedTitle = existingEdition?.title || sourceBook.title;
    const translatedChaptersMap = new Map<number, string>();
    if (existingEdition) {
      for (const ch of existingEdition.chapters) {
        translatedChaptersMap.set(ch.pageNumber, ch.title);
      }
    }

    let completedCount = forceRetranslate ? 0 : Object.keys(translatedPages).length;
    if (remainingPages.length === 0) {
      completedCount = 0;
    }

    setTranslatingBook({
      target: meta.code,
      label: meta.shortLabel,
      current: completedCount,
      total: sourceBook.totalPages,
    });

    const persistProgress = () => {
      const latest = bookRef.current;
      const translatedChapters = latest.chapters.map((ch) => ({
        pageNumber: ch.pageNumber,
        title: translatedChaptersMap.get(ch.pageNumber) ?? ch.title,
      }));
      const edition: TranslatedBookEdition = {
        language: meta.code,
        label: meta.shortLabel,
        title: translatedTitle,
        chapters: translatedChapters,
        pages: { ...translatedPages },
        translatedAt: Date.now(),
      };
      const updated: EbookDocument = {
        ...latest,
        activeLanguage: meta.code,
        translations: {
          ...(latest.translations ?? {}),
          [meta.code]: edition,
        },
      };
      bookRef.current = updated;
      onUpdateBook(updated);
    };

    const translateSinglePage = async (page: EbookDocument['pages'][number], includeTitle: boolean) => {
      const nonEmptyBlocks = page.blocks.filter((b) => b.text.trim().length > 0);
      if (nonEmptyBlocks.length === 0) {
        translatedPages[page.pageNumber] = {
          chapterTitle: page.chapterTitle,
          blocks: page.blocks,
          rawText: page.rawText,
        };
        return;
      }

      let data: {
        translatedBookTitle?: string;
        translatedChapterTitle?: string;
        translatedBlocks?: Array<{ id?: string; text?: string }>;
      } | null = null;

      // Primary: Direct Google Translate GTX from user's browser (zero quota, instant, any language)
      try {
        data = await translateBookPageWithGoogleGtx({
          bookTitle: includeTitle ? sourceBook.title : undefined,
          chapterTitle: page.chapterTitle,
          blocks: nonEmptyBlocks.map((b) => ({ id: b.id, type: b.type, text: b.text })),
          targetLanguage: meta.code,
        });
      } catch {
        // Fallback: Server-side translator (Gemini -> Google Cloud / MyMemory fallback)
        const res = await fetch('/api/ai/translate-book-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookTitle: includeTitle ? sourceBook.title : undefined,
            chapterTitle: page.chapterTitle,
            blocks: nonEmptyBlocks.map((b) => ({ id: b.id, type: b.type, text: b.text })),
            targetLanguage: meta.code,
            targetLanguageName: meta.promptName,
          }),
        });
        const serverJson = await res.json();
        if (!res.ok) {
          throw new Error(serverJson.error || `Failed translating page ${page.pageNumber}`);
        }
        data = serverJson;
      }

      if (
        includeTitle &&
        typeof data?.translatedBookTitle === 'string' &&
        data.translatedBookTitle.trim()
      ) {
        translatedTitle = data.translatedBookTitle.trim();
      }

      const chapTitle =
        typeof data?.translatedChapterTitle === 'string' && data.translatedChapterTitle.trim()
          ? data.translatedChapterTitle.trim()
          : page.chapterTitle;

      const blockTextById = new Map<string, string>(
        Array.isArray(data?.translatedBlocks)
          ? data.translatedBlocks
              .filter(
                (tb): tb is { id: string; text: string } =>
                  typeof tb?.id === 'string' && typeof tb?.text === 'string' && tb.text.trim().length > 0
              )
              .map((tb) => [tb.id, tb.text])
          : []
      );

      const nextBlocks = page.blocks.map((b) => ({
        ...b,
        text: blockTextById.get(b.id) ?? b.text,
      }));

      translatedPages[page.pageNumber] = {
        chapterTitle: chapTitle,
        blocks: nextBlocks,
        rawText: nextBlocks.map((b) => b.text).join('\n\n'),
      };

      if (!translatedChaptersMap.has(page.pageNumber)) {
        translatedChaptersMap.set(page.pageNumber, chapTitle);
      }
    };

    try {
      // Translate the first (active) page immediately so the reader updates right away
      if (orderedPages.length > 0) {
        await translateSinglePage(orderedPages[0], true);
        completedCount += 1;
        setTranslatingBook({
          target: meta.code,
          label: meta.shortLabel,
          current: Math.min(completedCount, sourceBook.totalPages),
          total: sourceBook.totalPages,
        });
        persistProgress();
      }

      // Translate remaining pages in parallel batches of 3 for speed
      const BATCH_SIZE = 3;
      for (let i = 1; i < orderedPages.length; i += BATCH_SIZE) {
        const chunk = orderedPages.slice(i, i + BATCH_SIZE);
        await Promise.all(
          chunk.map(async (page) => {
            await translateSinglePage(page, false);
            completedCount += 1;
            setTranslatingBook({
              target: meta.code,
              label: meta.shortLabel,
              current: Math.min(completedCount, sourceBook.totalPages),
              total: sourceBook.totalPages,
            });
          })
        );
        persistProgress();
      }
    } catch (err) {
      setBookTranslateError(
        err instanceof Error ? err.message : 'Full-book translation failed.'
      );
    } finally {
      setTranslatingBook(null);
    }
  };

  // Student Flashcards & Study Notes handlers
  const handleAddFlashcard = (pageNumber: number, front: string, back: string) => {
    const item: FlashcardItem = {
      id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pageNumber,
      front,
      back,
      mastered: false,
      createdAt: Date.now(),
    };
    onUpdateBook({ ...book, flashcards: [item, ...(book.flashcards ?? [])] });
  };

  const handleAddFlashcardsBulk = (
    cards: Array<{
      front: string;
      back: string;
      concept?: string;
      hint?: string;
      pageNumber?: number;
    }>,
    fallbackPageNumber: number
  ) => {
    const now = Date.now();
    const created: FlashcardItem[] = cards.map((c, idx) => {
      const pNum =
        typeof c.pageNumber === 'number' && Number.isFinite(c.pageNumber)
          ? Math.min(Math.max(1, Math.round(c.pageNumber)), book.totalPages)
          : fallbackPageNumber;
      return {
        id: `fc-${now}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        pageNumber: pNum,
        front: c.front,
        back: c.back,
        concept: c.concept?.trim() || undefined,
        hint: c.hint?.trim() || undefined,
        mastered: false,
        createdAt: now + idx,
      };
    });
    onUpdateBook({ ...book, flashcards: [...created, ...(book.flashcards ?? [])] });
  };

  const handleToggleMastered = (id: string) => {
    const next = (book.flashcards ?? []).map((fc) =>
      fc.id === id
        ? {
            ...fc,
            mastered: !fc.mastered,
            confidence: !fc.mastered ? ('mastered' as const) : ('again' as const),
          }
        : fc
    );
    onUpdateBook({ ...book, flashcards: next });
  };

  const handleRateFlashcard = (id: string, rating: 'again' | 'good' | 'mastered') => {
    const next = (book.flashcards ?? []).map((fc) =>
      fc.id === id
        ? {
            ...fc,
            confidence: rating,
            mastered: rating === 'mastered',
          }
        : fc
    );
    onUpdateBook({ ...book, flashcards: next });
  };

  const handleDeleteFlashcard = (id: string) => {
    onUpdateBook({
      ...book,
      flashcards: (book.flashcards ?? []).filter((fc) => fc.id !== id),
    });
  };

  const handleSaveStudyNote = (pageNumber: number, title: string, content: string) => {
    const item: StudyNoteItem = {
      id: `sn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pageNumber,
      title,
      content,
      createdAt: Date.now(),
    };
    onUpdateBook({ ...book, studyNotes: [item, ...(book.studyNotes ?? [])] });
  };

  const handleDeleteStudyNote = (id: string) => {
    onUpdateBook({
      ...book,
      studyNotes: (book.studyNotes ?? []).filter((sn) => sn.id !== id),
    });
  };

  // Compute visible pages for current layout using active translated edition if selected
  const visiblePages = useMemo(() => {
    if (settings.layoutMode === 'scroll') {
      return displayBook.pages;
    }
    if (settings.layoutMode === 'spread') {
      const leftNum = currentPage % 2 === 1 ? currentPage : currentPage - 1;
      const left = displayBook.pages.find((p) => p.pageNumber === leftNum);
      const right = displayBook.pages.find((p) => p.pageNumber === leftNum + 1);
      return [left, right].filter((p): p is NonNullable<typeof p> => Boolean(p));
    }
    const single = displayBook.pages.find((p) => p.pageNumber === currentPage);
    return single ? [single] : [];
  }, [displayBook.pages, currentPage, settings.layoutMode]);

  const activePageObj =
    displayBook.pages.find((p) => p.pageNumber === currentPage) ?? displayBook.pages[0];

  const totalBookWords = useMemo(
    () => displayBook.pages.reduce((acc, p) => acc + p.wordCount, 0),
    [displayBook.pages]
  );

  const completionFraction = useMemo(() => {
    const total = Math.max(1, displayBook.totalPages);
    if (settings.layoutMode === 'scroll') {
      if (!scrollState.hasOverflow) return 1;
      const pageProgress = (currentPage - 1 + scrollState.withinPageFraction) / total;
      // Blend page-level position with full document scroll ratio so 0% -> 100% stays smooth
      return Math.min(1, Math.max(0, pageProgress * 0.4 + scrollState.fraction * 0.6));
    }
    const startPage = visiblePages[0]?.pageNumber ?? currentPage;
    const endPage = visiblePages[visiblePages.length - 1]?.pageNumber ?? currentPage;
    const span = Math.max(1, endPage - startPage + 1);
    const pageFrac = scrollState.hasOverflow ? scrollState.fraction : 1;
    return Math.min(1, Math.max(0, (startPage - 1 + span * pageFrac) / total));
  }, [
    displayBook.totalPages,
    settings.layoutMode,
    scrollState.hasOverflow,
    scrollState.fraction,
    scrollState.withinPageFraction,
    currentPage,
    visiblePages,
  ]);

  const percent = Math.round(completionFraction * 100);
  const wordsLeft = Math.max(0, Math.round(totalBookWords * (1 - completionFraction)));
  const minutesLeft = Math.ceil(wordsLeft / 210);
  const timeToFinishLabel = useMemo(() => {
    if (percent >= 100 || wordsLeft === 0) return 'Finished';
    if (minutesLeft <= 1 && wordsLeft < 130) return '< 1 min';
    if (minutesLeft >= 60) {
      const hrs = Math.floor(minutesLeft / 60);
      const mins = minutesLeft % 60;
      return mins > 0 ? `~${hrs}h ${mins}m` : `~${hrs}h`;
    }
    return `~${Math.max(1, minutesLeft)} min`;
  }, [percent, wordsLeft, minutesLeft]);

  const shellClasses =
    settings.shellTheme === 'dark'
      ? 'bg-[#0B0D12] text-zinc-100'
      : settings.shellTheme === 'sepia'
        ? 'bg-[#F1EAE0] text-zinc-900'
        : 'bg-[#F4F4F1] text-zinc-900';

  const handleDownloadEpub = async () => {
    setExportingEpub(true);
    try {
      await exportAsEpub(displayBook);
    } finally {
      setExportingEpub(false);
      setExportOpen(false);
    }
  };

  const handleAiSelectionAction = useCallback((req: AiSelectionRequest) => {
    setPendingAiSelection(req);
    setDrawer('ai');
  }, []);

  const handleAskSelection = useCallback(
    (text: string, pageNumber: number, chapterTitle: string) => {
      setPendingAskSelection({ text, pageNumber, chapterTitle, triggerId: Date.now() });
      setDrawer('ai');
    },
    []
  );

  const handleStudySelection = useCallback(
    (text: string, pageNumber: number, chapterTitle: string) => {
      setPendingStudySelection({ text, pageNumber, chapterTitle, triggerId: Date.now() });
      setDrawer('study');
    },
    []
  );

  const runInspectorExplain = useCallback(
    async (
      target: {
        kind: 'table' | 'formula' | 'diagram';
        pageNumber: number;
        block?: EbookBlock;
        scanPage?: ScanPageRecord;
      },
      customQuestion?: string
    ) => {
      setItemInspector((prev) =>
        prev ? { ...prev, loading: true, error: undefined } : null
      );
      try {
        const authHeaders = await getAuthHeaders();
        const rawText = target.block?.tableRows
          ? target.block.tableRows.map((r) => r.join(' | ')).join('\n')
          : target.block?.text || '';
        const imgUrl =
          target.block?.imageDataUrl ||
          target.scanPage?.enhancedDataUrl ||
          target.scanPage?.originalDataUrl;
        const resp = await fetch('/api/ai/explain-scan-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            kind: target.kind,
            rawText,
            imageDataUrl: imgUrl,
            bookTitle: bookRef.current.title,
            pageNumber: target.pageNumber,
            question: customQuestion,
            isUncertain: target.block?.uncertain,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || 'Could not explain this item.');
        setItemInspector((prev) =>
          prev
            ? {
                ...prev,
                loading: false,
                explanation: String(data.explanation || ''),
              }
            : null
        );
      } catch (err) {
        setItemInspector((prev) =>
          prev
            ? {
                ...prev,
                loading: false,
                error: err instanceof Error ? err.message : 'Explanation request failed.',
              }
            : null
        );
      }
    },
    [getAuthHeaders]
  );

  const handleExplainBlockItem = useCallback(
    (block: EbookBlock, pageNumber: number) => {
      const kind: 'table' | 'formula' | 'diagram' =
        block.type === 'table' ? 'table' : block.type === 'formula' ? 'formula' : 'diagram';
      const scanPage = block.sourceScanPageId
        ? bookRef.current.scanData?.pages.find((sp) => sp.id === block.sourceScanPageId)
        : undefined;
      setItemInspector({
        kind,
        pageNumber,
        block,
        scanPage,
        showOriginalPhoto: false,
        question: '',
        loading: !block.aiExplanation,
        explanation: block.aiExplanation,
      });
      if (!block.aiExplanation) {
        void runInspectorExplain({ kind, pageNumber, block, scanPage });
      }
    },
    [runInspectorExplain]
  );

  const handleInspectOriginalScan = useCallback(
    (scanPageId: string, pageNumber: number, block?: EbookBlock) => {
      const kind: 'table' | 'formula' | 'diagram' =
        block?.type === 'table' ? 'table' : block?.type === 'formula' ? 'formula' : 'diagram';
      const scanPage = bookRef.current.scanData?.pages.find((sp) => sp.id === scanPageId);
      setItemInspector({
        kind,
        pageNumber,
        block,
        scanPage,
        showOriginalPhoto: true,
        question: '',
        loading: false,
        explanation: block?.aiExplanation,
      });
    },
    []
  );

  const aiEnabled = settings.aiEnabled !== false;

  const toolbarButtons: Array<{
    id: Exclude<ActiveDrawer, null>;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'pages', label: 'Pages', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'search', label: 'Search', icon: <Search className="w-4 h-4" /> },
    { id: 'appearance', label: 'Colour', icon: <Palette className="w-4 h-4" /> },
    { id: 'audio', label: 'Listen', icon: <Headphones className="w-4 h-4" /> },
    { id: 'notes', label: 'Notes', icon: <StickyNote className="w-4 h-4" /> },
    { id: 'study', label: 'Study Studio', icon: <GraduationCap className="w-4 h-4" /> },
    {
      id: 'ai',
      label: aiEnabled ? 'AI Studio' : 'AI (Off)',
      icon: <Sparkles className="w-4 h-4" />,
    },
  ];

  const handleSurfacePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (settings.layoutMode === 'scroll') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const targetEl = e.target as HTMLElement | null;
    const cornerEl = targetEl?.closest<HTMLElement>('[data-page-corner]');
    const cornerAttr = cornerEl?.getAttribute('data-page-corner');
    const cornerDir: 1 | -1 | null =
      cornerAttr === 'next' ? 1 : cornerAttr === 'prev' ? -1 : null;

    if (!cornerDir && targetEl?.closest('button, a, input, textarea, select, [role="button"]')) {
      return;
    }

    const container = bookSurfaceRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const edgeThreshold = Math.min(130, Math.max(64, rect.width * 0.16));
    const isEdgeLeft = cornerDir === -1 || relX <= edgeThreshold;
    const isEdgeRight = cornerDir === 1 || rect.width - relX <= edgeThreshold;
    const isEdgeZone = isEdgeLeft || isEdgeRight;

    // Allow dragging from outer edges/corners on any pointer, OR anywhere on touch screens
    if (!isEdgeZone && e.pointerType !== 'touch') {
      return;
    }

    // Prevent native text selection when grabbing the edge or corner with mouse/pen
    if (isEdgeZone && e.pointerType !== 'touch') {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
    }

    pointerGestureRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      side: cornerDir === 1 ? 'right' : cornerDir === -1 ? 'left' : isEdgeRight ? 'right' : isEdgeLeft ? 'left' : 'swipe',
      isEdgeZone,
      cornerDir,
      anchorY: Math.min(1, Math.max(0, relY / Math.max(1, rect.height))),
      containerWidth: Math.max(280, rect.width),
      pointerType: e.pointerType,
      moved: false,
    };
  };

  const handleSurfacePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = pointerGestureRef.current;
    if (!g || !g.active) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    // On touch inside middle text, abort horizontal drag if user is scrolling vertically
    if (!g.isEdgeZone && !g.moved && Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      pointerGestureRef.current = null;
      setDragFlip(null);
      return;
    }

    if (Math.abs(dx) > 5 && (g.isEdgeZone || Math.abs(dx) > Math.abs(dy) * 0.85)) {
      if (!g.moved) {
        if (g.isEdgeZone) {
          window.getSelection()?.removeAllRanges();
        }
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Ignore if synthetic/unsupported pointer
        }
      }
      g.moved = true;

      const direction: 1 | -1 = dx < 0 ? 1 : -1;
      const canTurn =
        direction === 1
          ? settings.layoutMode === 'spread'
            ? (currentPage % 2 === 1 ? currentPage : currentPage - 1) + 2 <= displayBook.totalPages
            : currentPage < displayBook.totalPages
          : currentPage > 1;

      const effectiveDx = canTurn ? dx : dx * 0.22;
      const clampedDx = Math.max(-280, Math.min(280, effectiveDx));
      const progress = Math.min(1, Math.abs(clampedDx) / Math.max(160, g.containerWidth * 0.4));

      setDragFlip({
        deltaX: clampedDx,
        progress,
        direction,
        side: g.side,
        anchorY: g.anchorY,
        willTurn: canTurn && Math.abs(dx) >= 46,
      });
    }
  };

  const handleSurfacePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = pointerGestureRef.current;
    pointerGestureRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors
      }
    }
    if (!g || !g.active) {
      setDragFlip(null);
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const elapsed = Math.max(1, performance.now() - g.startTime);
    const velocity = Math.abs(dx) / elapsed;
    setDragFlip(null);

    if (g.isEdgeZone) {
      window.getSelection()?.removeAllRanges();
    } else {
      const hasSelection = Boolean(window.getSelection()?.toString().trim());
      if (hasSelection) return;
    }

    // Pulled / dragged edge or corner past threshold or fast flick
    if (g.moved && (Math.abs(dx) >= 46 || (velocity > 0.28 && Math.abs(dx) >= 22))) {
      lastDragTurnAtRef.current = performance.now();
      if (dx < 0) {
        goNext();
      } else {
        goPrev();
      }
      return;
    }

    // Quick tap/click on the left or right outer edge or dog-ear corner
    if (g.isEdgeZone && !g.moved && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      lastDragTurnAtRef.current = performance.now();
      if (g.side === 'right' || g.cornerDir === 1) {
        goNext();
      } else if (g.side === 'left' || g.cornerDir === -1) {
        goPrev();
      }
    }
  };

  const hasActiveOverlay = Boolean(
    drawer || fontStudioOpen || penMenuOpen || langMenuOpen || exportOpen
  );
  const showChrome = chromeOpen || chromePinned || hasActiveOverlay;

  const revealChromeTemporarily = useCallback(() => {
    if (chromeHideTimerRef.current) {
      window.clearTimeout(chromeHideTimerRef.current);
      chromeHideTimerRef.current = null;
    }
    setChromeOpen(true);
  }, []);

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (chromePinned || hasActiveOverlay) return;
    const inTopZone = e.clientY <= 68;
    const inBottomZone = window.innerHeight - e.clientY <= 60;
    if (inTopZone || inBottomZone) {
      revealChromeTemporarily();
    } else if (chromeOpen && !chromeHideTimerRef.current) {
      chromeHideTimerRef.current = window.setTimeout(() => {
        chromeHideTimerRef.current = null;
        setChromeOpen(false);
      }, 650);
    }
  };

  const handleSurfaceTapReveal = (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
    if (chromePinned || hasActiveOverlay || activeHighlighterPen) return;
    if (performance.now() - lastDragTurnAtRef.current < 350) return;
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('button, a, input, textarea, select, [role="button"]')) {
      return;
    }
    if (window.getSelection()?.toString().trim()) {
      return;
    }
    // Ignore taps in left/right edge page-turn zones when not in scroll mode
    if (settings.layoutMode !== 'scroll' && bookSurfaceRef.current && 'clientX' in e) {
      const rect = bookSurfaceRef.current.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const edgeThreshold = Math.min(130, Math.max(64, rect.width * 0.16));
      if (relX <= edgeThreshold || rect.width - relX <= edgeThreshold) {
        return;
      }
    }
    if (chromeHideTimerRef.current) {
      window.clearTimeout(chromeHideTimerRef.current);
      chromeHideTimerRef.current = null;
    }
    setChromeOpen((prev) => !prev);
  };

  return (
    <div
      ref={readerRootRef}
      onMouseMove={handleStageMouseMove}
      onMouseLeave={() => {
        if (!chromePinned && !hasActiveOverlay) {
          setChromeOpen(false);
        }
      }}
      className={`${
        isFullscreen ? 'h-screen overflow-y-auto' : 'min-h-screen'
      } relative flex flex-col ${shellClasses}`}
    >
      {/* Invisible Top Edge Hover / Touch Reveal Zone (0 visual clutter when reading) */}
      {!showChrome && (
        <div
          aria-hidden="true"
          onMouseEnter={revealChromeTemporarily}
          onTouchStart={revealChromeTemporarily}
          onClick={revealChromeTemporarily}
          className="no-print fixed top-0 inset-x-0 h-10 z-20 cursor-pointer"
        />
      )}

      {/* Top Reader Toolbar: Completely hidden until cursor hovers top/bottom edge or user touches */}
      {isFullscreen ? (
        <div
          onMouseEnter={revealChromeTemporarily}
          className={`no-print notranslate fixed top-2 inset-x-0 z-30 flex justify-between items-center px-3 sm:px-6 transition-all duration-200 ${
            showChrome
              ? 'opacity-100 translate-y-0 pointer-events-none'
              : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}
        >
          <div className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-[#10131C]/90 backdrop-blur-md shadow-sm text-xs">
            <button
              type="button"
              onClick={() => {
                stopTts();
                ambientAudio.stop();
                onBackToLibrary();
              }}
              title="Back to Library"
              className="p-0.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[140px] sm:max-w-[240px]">
              {displayBook.title}
            </span>
            <span className="text-zinc-400" aria-hidden="true">
              ·
            </span>
            <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
              {currentPage}/{displayBook.totalPages}
            </span>
          </div>

          <div className="pointer-events-auto inline-flex items-center gap-1 px-2 py-1 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-[#10131C]/90 backdrop-blur-md shadow-sm relative">
            {/* Quick Aa Font & Ink Trigger in Fullscreen */}
            <div className="relative">
              <button
                type="button"
                title="Font & Word Colour"
                onClick={() => {
                  setPenMenuOpen(false);
                  setLangMenuOpen(false);
                  setFontStudioOpen((v) => !v);
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition-colors ${
                  fontStudioOpen
                    ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                    : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="font-serif">Aa</span>
              </button>
              {fontStudioOpen && (
                <div className="absolute right-0 mt-2 z-50">
                  <TypographyStudioPopover
                    settings={settings}
                    pageTheme={getThemeForPage(
                      displayBook.paletteId,
                      currentPage,
                      activePageObj?.customThemeIndex
                    )}
                    onUpdateSettings={onUpdateSettings}
                    onOpenFullAppearance={() => setDrawer('appearance')}
                    onClose={() => setFontStudioOpen(false)}
                  />
                </div>
              )}
            </div>

            {/* Quick Highlighter Pen in Fullscreen */}
            <div className="relative">
              <button
                type="button"
                title="Highlighter Pen"
                onClick={() => {
                  setFontStudioOpen(false);
                  setLangMenuOpen(false);
                  setPenMenuOpen((v) => !v);
                }}
                className={`p-1.5 rounded-full transition-colors ${
                  activeHighlighterPen
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5" />
              </button>
              {penMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-2.5 z-50 space-y-2">
                  <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                    One-Tap Highlighter Pen
                  </div>
                  <div className="flex items-center gap-2">
                    {(Object.keys(HIGHLIGHT_STYLES) as HighlightColor[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setActiveHighlighterPen((prev) => (prev === c ? null : c));
                          setPenMenuOpen(false);
                        }}
                        title={HIGHLIGHT_STYLES[c].label}
                        className={`w-6 h-6 rounded-full border transition-transform ${
                          activeHighlighterPen === c
                            ? 'ring-2 ring-zinc-900 dark:ring-white scale-110'
                            : 'border-black/20 hover:scale-105'
                        }`}
                        style={{ backgroundColor: HIGHLIGHT_STYLES[c].swatch }}
                      />
                    ))}
                    {activeHighlighterPen && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveHighlighterPen(null);
                          setPenMenuOpen(false);
                        }}
                        className="ml-auto text-[10px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                      >
                        Off
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {toolbarButtons.map((btn) => {
              const active = drawer === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  title={btn.label}
                  onClick={() => setDrawer(active ? null : btn.id)}
                  className={`p-1.5 rounded-full transition-colors ${
                    active
                      ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {btn.icon}
                </button>
              );
            })}

            {/* Language Switcher in Fullscreen */}
            <div className="relative">
              <button
                type="button"
                title="Convert Book Language"
                onClick={() => {
                  setFontStudioOpen(false);
                  setPenMenuOpen(false);
                  setLangMenuOpen((v) => !v);
                }}
                className={`p-1.5 rounded-full transition-colors ${
                  activeLanguage !== 'original' || translatingBook
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {translatingBook ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Languages className="w-3.5 h-3.5" />
                )}
              </button>
              {langMenuOpen && (
                <div className="notranslate absolute right-0 mt-2 w-72 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-2.5 z-50 space-y-2 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                      Google Translate Book ({book.totalPages}p)
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      Google
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSwitchBookLanguage('original')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-left ${
                      activeLanguage === 'original'
                        ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                        : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span>Original Edition</span>
                    {activeLanguage === 'original' && <span className="text-[10px]">Active</span>}
                  </button>
                  <div className="grid grid-cols-1 gap-1">
                    {BOOK_LANGUAGE_OPTIONS.map((opt) => {
                      const readyEdition = book.translations?.[opt.code];
                      const isFullyReady =
                        readyEdition && Object.keys(readyEdition.pages).length >= book.totalPages;
                      const isActive = activeLanguage === opt.code;
                      return (
                        <div key={opt.code} className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={Boolean(translatingBook)}
                            onClick={() =>
                              isFullyReady
                                ? handleSwitchBookLanguage(opt.code)
                                : void handleTranslateFullBook(opt.code)
                            }
                            className={`flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-left ${
                              isActive
                                ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                                : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            <span className="text-[10px] opacity-80 shrink-0">
                              {isActive ? 'Active' : isFullyReady ? 'Ready' : 'Convert'}
                            </span>
                          </button>
                          {isFullyReady && (
                            <button
                              type="button"
                              disabled={Boolean(translatingBook)}
                              title={`Re-translate to ${opt.shortLabel}`}
                              onClick={() => void handleTranslateFullBook(opt.code, true)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const val = customLangInput.trim();
                      if (!val || translatingBook) return;
                      setCustomLangInput('');
                      void handleTranslateFullBook(val);
                    }}
                    className="flex items-center gap-1.5 pt-1 border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <input
                      type="text"
                      value={customLangInput}
                      onChange={(e) => setCustomLangInput(e.target.value)}
                      placeholder="Any language (e.g. Korean, Tamil)..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={Boolean(translatingBook) || !customLangInput.trim()}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold disabled:opacity-45 shrink-0"
                    >
                      Go
                    </button>
                  </form>
                  <div className="pt-1.5 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 px-0.5">
                      <span>Google Translate Live (130+ Languages)</span>
                    </div>
                    <div id="google_translate_book_fs" className="chroma-gt-box text-zinc-900 dark:text-zinc-100" />
                    <a
                      href={openInGoogleTranslateTab(
                        activePageObj?.rawText || '',
                        activeLanguage === 'original' ? 'bn' : activeLanguage
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:underline pt-0.5"
                    >
                      Open Page {currentPage} in Google Translate ↗
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
            <button
              type="button"
              onClick={toggleFullscreen}
              title="Exit Fullscreen (F / Esc)"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 hover:opacity-90"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      ) : (
        <header
          onMouseEnter={revealChromeTemporarily}
          className={`no-print notranslate ${
            chromePinned ? 'sticky top-0' : 'fixed top-0 inset-x-0'
          } z-30 border-b border-zinc-200/80 dark:border-zinc-800 bg-white/92 dark:bg-[#10131C]/92 backdrop-blur-xl px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4 transition-all duration-200 shadow-sm ${
            showChrome
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 -translate-y-full pointer-events-none'
          }`}
        >
        {/* Left: Back + Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              stopTts();
              ambientAudio.stop();
              onBackToLibrary();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Library</span>
          </button>
          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[130px] sm:max-w-[230px]">
              {displayBook.title}
            </h1>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate hidden md:block">
              {activePageObj?.chapterTitle} · Page {currentPage} of {displayBook.totalPages}
            </div>
          </div>
        </div>

        {/* Center/Right Tool Triggers */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Prominent Aa Font & Word Colour Studio Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setLangMenuOpen(false);
                setExportOpen(false);
                setPenMenuOpen(false);
                setFontStudioOpen((v) => !v);
              }}
              title="Change Book Font & Word Ink Colour"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                fontStudioOpen ||
                (settings.textColorId && settings.textColorId !== 'auto') ||
                settings.font !== 'serif'
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Aa</span>
              <span className="hidden sm:inline">Font & Ink</span>
            </button>

            {fontStudioOpen && (
              <div className="absolute right-0 mt-2 z-50">
                <TypographyStudioPopover
                  settings={settings}
                  pageTheme={getThemeForPage(
                    displayBook.paletteId,
                    currentPage,
                    activePageObj?.customThemeIndex
                  )}
                  onUpdateSettings={onUpdateSettings}
                  onOpenFullAppearance={() => setDrawer('appearance')}
                  onClose={() => setFontStudioOpen(false)}
                />
              </div>
            )}
          </div>

          {/* One-Tap Highlighter Pen Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setFontStudioOpen(false);
                setLangMenuOpen(false);
                setExportOpen(false);
                setPenMenuOpen((v) => !v);
              }}
              title="Highlighter Pen (or select any text to highlight)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                activeHighlighterPen
                  ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                  : 'border-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Highlighter className="w-4 h-4" />
              {activeHighlighterPen && (
                <span
                  className="w-2.5 h-2.5 rounded-full border border-black/20"
                  style={{ backgroundColor: HIGHLIGHT_STYLES[activeHighlighterPen].swatch }}
                />
              )}
              <span className="hidden xl:inline">
                {activeHighlighterPen ? 'Pen On' : 'Highlight'}
              </span>
            </button>

            {penMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-3 z-50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Highlighter Pen Mode
                  </span>
                  {activeHighlighterPen && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveHighlighterPen(null);
                        setPenMenuOpen(false);
                      }}
                      className="text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline"
                    >
                      Turn Off
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                  Pick a colour below to highlight any paragraph with 1 tap, or drag-select any word anytime.
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  {(Object.keys(HIGHLIGHT_STYLES) as HighlightColor[]).map((colorKey) => (
                    <button
                      key={colorKey}
                      type="button"
                      title={`Use ${HIGHLIGHT_STYLES[colorKey].label} pen`}
                      onClick={() => {
                        setActiveHighlighterPen((prev) => (prev === colorKey ? null : colorKey));
                        setPenMenuOpen(false);
                      }}
                      className={`w-7 h-7 rounded-full border transition-transform ${
                        activeHighlighterPen === colorKey
                          ? 'ring-2 ring-zinc-900 dark:ring-white ring-offset-2 dark:ring-offset-zinc-900 scale-110'
                          : 'border-black/15 hover:scale-105'
                      }`}
                      style={{ backgroundColor: HIGHLIGHT_STYLES[colorKey].swatch }}
                    />
                  ))}
                </div>
                {settings.renderMode === 'canvas' && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSettings({ renderMode: 'reflow' });
                      setPenMenuOpen(false);
                    }}
                    className="w-full text-[11px] font-medium py-1.5 px-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                  >
                    Switch to Reflow Mode to highlight PDF text
                  </button>
                )}
              </div>
            )}
          </div>

          {toolbarButtons.map((btn) => {
            const active = drawer === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                title={btn.label}
                onClick={() => setDrawer(active ? null : btn.id)}
                className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {btn.icon}
                <span className="hidden xl:inline">{btn.label}</span>
              </button>
            );
          })}

          {/* Book Language Switcher / Whole-Book Converter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setExportOpen(false);
                setFontStudioOpen(false);
                setPenMenuOpen(false);
                setLangMenuOpen((v) => !v);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                activeLanguage !== 'original' || translatingBook
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {translatingBook ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Languages className="w-4 h-4" />
              )}
              <span className="hidden md:inline">
                {activeLanguage === 'original' ? 'Language' : activeLangMeta.shortLabel}
              </span>
            </button>

            {langMenuOpen && (
              <div className="notranslate absolute right-0 mt-2 w-76 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-2.5 z-50 space-y-2 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                    Convert Entire Book ({book.totalPages} pages)
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    Google Translate
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSwitchBookLanguage('original')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-left ${
                    activeLanguage === 'original'
                      ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                      : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span>Original Edition</span>
                  {activeLanguage === 'original' && <span className="text-[10px]">Active</span>}
                </button>

                <div className="grid grid-cols-1 gap-1">
                  {BOOK_LANGUAGE_OPTIONS.map((opt) => {
                    const readyEdition = book.translations?.[opt.code];
                    const isFullyReady =
                      readyEdition && Object.keys(readyEdition.pages).length >= book.totalPages;
                    const isActive = activeLanguage === opt.code;
                    return (
                      <div key={opt.code} className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={Boolean(translatingBook)}
                          onClick={() =>
                            isFullyReady
                              ? handleSwitchBookLanguage(opt.code)
                              : void handleTranslateFullBook(opt.code)
                          }
                          className={`flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-left ${
                            isActive
                              ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                              : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <span className="truncate">{opt.label}</span>
                          <span className="text-[10px] opacity-80 shrink-0">
                            {isActive ? 'Active' : isFullyReady ? 'Ready' : 'Convert'}
                          </span>
                        </button>
                        {isFullyReady && (
                          <button
                            type="button"
                            disabled={Boolean(translatingBook)}
                            title={`Re-translate to ${opt.shortLabel}`}
                            onClick={() => void handleTranslateFullBook(opt.code, true)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {Object.entries(book.translations ?? {})
                    .filter(([code]) => !BOOK_LANGUAGE_OPTIONS.some((o) => o.code === code))
                    .map(([code, ed]) => {
                      const isActive = activeLanguage === code;
                      const isFullyReady = Object.keys(ed.pages).length >= book.totalPages;
                      return (
                        <div key={code} className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={Boolean(translatingBook)}
                            onClick={() =>
                              isFullyReady
                                ? handleSwitchBookLanguage(code)
                                : void handleTranslateFullBook(ed.label || code)
                            }
                            className={`flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-left ${
                              isActive
                                ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                                : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <span className="truncate">{ed.label || code}</span>
                            <span className="text-[10px] opacity-80 shrink-0">
                              {isActive ? 'Active' : isFullyReady ? 'Ready' : 'Resume'}
                            </span>
                          </button>
                          {isFullyReady && (
                            <button
                              type="button"
                              disabled={Boolean(translatingBook)}
                              title={`Re-translate to ${ed.label || code}`}
                              onClick={() => void handleTranslateFullBook(ed.label || code, true)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const val = customLangInput.trim();
                    if (!val || translatingBook) return;
                    setCustomLangInput('');
                    void handleTranslateFullBook(val);
                  }}
                  className="flex items-center gap-1.5 pt-1 border-t border-zinc-200 dark:border-zinc-800"
                >
                  <input
                    type="text"
                    value={customLangInput}
                    onChange={(e) => setCustomLangInput(e.target.value)}
                    placeholder="Other language (e.g. Korean, Tamil)..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={Boolean(translatingBook) || !customLangInput.trim()}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold disabled:opacity-45 shrink-0"
                  >
                    Go
                  </button>
                </form>

                {/* Official Google Translate 130+ Language Live Selector */}
                <div className="pt-1.5 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
                  <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 px-0.5">
                    Google Translate Live (130+ Languages)
                  </div>
                  <div id="google_translate_book_main" className="chroma-gt-box text-zinc-900 dark:text-zinc-100" />
                  <a
                    href={openInGoogleTranslateTab(
                      activePageObj?.rawText || '',
                      activeLanguage === 'original' ? 'bn' : activeLanguage
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:underline pt-0.5"
                  >
                    Open Page {currentPage} in Google Translate ↗
                  </a>
                </div>

                {translatingBook && (
                  <div className="pt-1 space-y-1">
                    <div className="flex justify-between text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      <span>Translating to {translatingBook.label}…</span>
                      <span>
                        {translatingBook.current}/{translatingBook.total}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all"
                        style={{
                          width: `${Math.round(
                            (translatingBook.current / Math.max(1, translatingBook.total)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {bookTranslateError && (
                  <div className="text-[11px] text-rose-600 dark:text-rose-400 px-1">
                    {bookTranslateError}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setLangMenuOpen(false);
                setExportOpen((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span className="hidden lg:inline">Export</span>
            </button>

            {exportOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-1.5 z-50">
                <button
                  type="button"
                  disabled={exportingEpub}
                  onClick={handleDownloadEpub}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                >
                  <Download className="w-3.5 h-3.5 text-amber-500" />
                  <span>{exportingEpub ? 'Building EPUB…' : 'Download Colourful .EPUB'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportAsStandaloneHtml(displayBook);
                    setExportOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Interactive .HTML eBook</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    setTimeout(() => window.print(), 100);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-500" />
                  <span>Print Colourful PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportNotesAsMarkdown(displayBook);
                    setExportOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-violet-500" />
                  <span>Export Study Notes (.MD)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportFlashcardsAsCsv(displayBook);
                    setExportOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-rose-500" />
                  <span>Flashcards Anki (.CSV)</span>
                </button>
                {book.scanData && (
                  <div className="mt-1 pt-1 border-t border-zinc-200 dark:border-zinc-800 space-y-0.5">
                    {onReviewBookScans && (
                      <button
                        type="button"
                        onClick={() => {
                          setExportOpen(false);
                          onReviewBookScans();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-left"
                      >
                        <ScanLine className="w-3.5 h-3.5" />
                        <span>Review Scans & OCR</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        setExportOpen(false);
                        const slug =
                          book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 42) ||
                          'scanned-book';
                        const res = await buildSearchableScanPdf(book.scanData!.pages, {
                          title: book.title,
                          author: book.author,
                        });
                        triggerPdfDownload(res.blob, `${slug}-searchable.pdf`);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Searchable Scan .PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setExportOpen(false);
                        const slug =
                          book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 42) ||
                          'scanned-book';
                        const blob = await buildOriginalScanPdf(book.scanData!.pages, {
                          title: book.title,
                          author: book.author,
                        });
                        triggerPdfDownload(blob, `${slug}-original-scans.pdf`);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-500" />
                      <span>Original Scan .PDF</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => toggleBookmark(currentPage)}
            title="Toggle Bookmark (B)"
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              book.bookmarks.some((b) => b.pageNumber === currentPage)
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Bookmark className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setChromePinned((p) => !p);
              if (chromePinned) setChromeOpen(false);
            }}
            title={chromePinned ? 'Auto-hide bar for Book-Only Focus' : 'Pin Toolbar open'}
            className={`hidden sm:inline-flex p-1.5 rounded-lg transition-colors shrink-0 ${
              chromePinned
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            {chromePinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen (F)"
            className="inline-flex p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>
      )}

      {/* Non-blocking live translation status / error bar */}
      {(translatingBook || bookTranslateError) && (
        <div className="no-print border-b border-amber-200/80 dark:border-amber-900/50 bg-amber-50/90 dark:bg-amber-950/30 px-4 sm:px-6 py-2">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 text-xs">
            {translatingBook ? (
              <>
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>
                    Converting book to {translatingBook.label} ({translatingBook.current} of{' '}
                    {translatingBook.total} pages)…
                  </span>
                </div>
                <div className="w-36 h-1.5 rounded-full bg-amber-200 dark:bg-zinc-800 overflow-hidden shrink-0">
                  <div
                    className="h-full bg-amber-600 transition-all duration-200"
                    style={{
                      width: `${Math.round(
                        (translatingBook.current / Math.max(1, translatingBook.total)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between w-full gap-3 text-rose-700 dark:text-rose-300">
                <span>Translation notice: {bookTranslateError}</span>
                <button
                  type="button"
                  onClick={() => setBookTranslateError(null)}
                  className="text-[11px] underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Book-Focused Full-Screen Reading Stage */}
      <main
        onClick={handleSurfaceTapReveal}
        className={`flex-1 flex flex-col items-center justify-center w-full ${
          settings.layoutMode === 'scroll'
            ? 'px-2 sm:px-4 py-4'
            : 'px-1.5 sm:px-3 py-1.5 sm:py-2'
        }`}
      >
        {settings.layoutMode === 'scroll' ? (
          <div ref={scrollListRef} className="w-full max-w-[920px] space-y-5">
            {visiblePages.map((page) => (
              <div
                key={page.pageNumber}
                data-scroll-page={page.pageNumber}
                className="print-page-break"
              >
                <ColourfulPage
                  page={page}
                  totalPages={displayBook.totalPages}
                  bookTitle={displayBook.title}
                  paletteId={displayBook.paletteId}
                  bookVisualStyle={displayBook.pageVisualStyle ?? 'auto'}
                  settings={settings}
                  highlights={displayBook.highlights}
                  isBookmarked={displayBook.bookmarks.some((b) => b.pageNumber === page.pageNumber)}
                  searchQuery={searchQuery}
                  activeTtsBlockIndex={
                    isSpeaking && page.pageNumber === currentPage ? activeTtsBlockIndex : null
                  }
                  activeHighlighterPen={activeHighlighterPen}
                  isTranslated={activeLanguage !== 'original'}
                  isRtl={Boolean(activeLangMeta.isRtl)}
                  isFullscreen={isFullscreen}
                  onToggleBookmark={toggleBookmark}
                  onAddHighlight={handleAddHighlight}
                  onRemoveHighlightByText={handleRemoveHighlightByText}
                  onCyclePageTheme={handleCyclePageTheme}
                  onCyclePageVisualStyle={handleCyclePageVisualStyle}
                  onCyclePageTopic={handleCyclePageTopic}
                  onCreateFlashcard={handleAddFlashcard}
                  aiEnabled={aiEnabled}
                  onAiSelectionAction={handleAiSelectionAction}
                  onAskSelection={handleAskSelection}
                  onStudySelection={handleStudySelection}
                  onExplainBlockItem={handleExplainBlockItem}
                  onInspectOriginalScan={handleInspectOriginalScan}
                />
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`group/stage relative w-full flex items-center justify-center ${
              settings.layoutMode === 'spread' ? 'max-w-[98.5vw]' : 'max-w-[1060px]'
            }`}
          >
            {/* Hover-only Left Page Turn Arrow (zero side margin stolen from the book) */}
            <button
              type="button"
              onClick={goPrev}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              className="no-print hidden md:flex items-center justify-center absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full border border-zinc-300/80 dark:border-zinc-700 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md text-zinc-700 dark:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-0 opacity-0 group-hover/stage:opacity-90 transition-all shadow-md"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Physical Book Binding Wrapper + Edge Drag & Touch Gesture Surface */}
            <div
              ref={bookSurfaceRef}
              onPointerDown={handleSurfacePointerDown}
              onPointerMove={handleSurfacePointerMove}
              onPointerUp={handleSurfacePointerEnd}
              onPointerCancel={() => {
                pointerGestureRef.current = null;
                setDragFlip(null);
              }}
              className="relative flex-1 min-w-0 [perspective:1600px] touch-pan-y"
            >
              {(() => {
                const phys = settings.physicalBookStyle ?? 'hardcover';
                const flipStyle = settings.pageFlipStyle ?? 'book3d';
                const isTwoUp = settings.layoutMode === 'spread' && visiblePages.length > 1;

                const bindingWrapperClass =
                  phys === 'hardcover'
                    ? 'relative p-2.5 sm:p-3.5 rounded-[18px] bg-[#2D2A27] dark:bg-[#1A1817] shadow-[0_28px_60px_-15px_rgba(0,0,0,0.45)] ring-1 ring-black/25'
                    : phys === 'leather'
                      ? 'relative p-3 sm:p-4 rounded-[20px] bg-[#3A2016] dark:bg-[#22120C] border-2 border-amber-700/45 shadow-[0_30px_65px_-14px_rgba(0,0,0,0.55)]'
                      : phys === 'paperback'
                        ? 'relative p-1.5 sm:p-2 rounded-[15px] bg-zinc-300/80 dark:bg-zinc-800/85 shadow-[0_20px_45px_-12px_rgba(0,0,0,0.3)]'
                        : phys === 'notebook'
                          ? 'relative p-2.5 sm:p-3 rounded-[16px] bg-[#223042] dark:bg-[#131C27] shadow-[0_22px_50px_-12px_rgba(0,0,0,0.4)]'
                          : 'relative';

                const animConfig =
                  flipStyle === 'book3d'
                    ? {
                        initial: {
                          opacity: 0.28,
                          rotateY: flipDirection * 24,
                          scale: 0.97,
                        },
                        animate: { opacity: 1, rotateY: 0, scale: 1 },
                        exit: {
                          opacity: 0.2,
                          rotateY: flipDirection * -26,
                          scale: 0.96,
                        },
                        transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const },
                      }
                    : flipStyle === 'curl'
                      ? {
                          initial: {
                            opacity: 0,
                            rotateY: flipDirection * 18,
                            rotateZ: flipDirection * -1.4,
                            x: flipDirection * 32,
                            scale: 0.97,
                          },
                          animate: { opacity: 1, rotateY: 0, rotateZ: 0, x: 0, scale: 1 },
                          exit: {
                            opacity: 0,
                            rotateY: flipDirection * -20,
                            rotateZ: flipDirection * 1.4,
                            x: flipDirection * -32,
                            scale: 0.97,
                          },
                          transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const },
                        }
                      : flipStyle === 'snap'
                        ? {
                            initial: { opacity: 0.4, x: flipDirection * 24, scale: 0.985 },
                            animate: { opacity: 1, x: 0, scale: 1 },
                            exit: { opacity: 0.3, x: flipDirection * -24, scale: 0.985 },
                            transition: { type: 'spring' as const, stiffness: 420, damping: 32 },
                          }
                        : flipStyle === 'fade'
                          ? {
                              initial: { opacity: 0 },
                              animate: { opacity: 1 },
                              exit: { opacity: 0 },
                              transition: { duration: 0.22 },
                            }
                          : {
                              initial: { opacity: 0, x: flipDirection * 42 },
                              animate: { opacity: 1, x: 0 },
                              exit: { opacity: 0, x: flipDirection * -42 },
                              transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const },
                            };

                const showStackEdges = phys !== 'flat';

                return (
                  <div className={bindingWrapperClass}>
                    {/* Brass Corner Accents for Vintage Leather Binding */}
                    {phys === 'leather' && (
                      <>
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-amber-500/60 rounded-tl-xl"
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-amber-500/60 rounded-tr-xl"
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-amber-500/60 rounded-bl-xl"
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-amber-500/60 rounded-br-xl"
                        />
                      </>
                    )}

                    <div className="relative flex items-stretch">
                      {/* Left Stacked Page Thickness Edge */}
                      {showStackEdges && isTwoUp && currentPage > 1 && (
                        <div
                          aria-hidden="true"
                          className="hidden lg:block w-2 shrink-0 rounded-l-lg ebook-page-edges-left border-y border-l border-black/10"
                        />
                      )}

                      <div
                        className="flex-1 min-w-0 relative"
                        style={
                          dragFlip && Math.abs(dragFlip.deltaX) > 4
                            ? {
                                transform: `perspective(1600px) rotateY(${
                                  (dragFlip.deltaX / 280) * 10
                                }deg)`,
                                transformOrigin:
                                  dragFlip.direction === 1 ? 'left center' : 'right center',
                                transition: 'none',
                              }
                            : undefined
                        }
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.div
                            key={`${settings.layoutMode}-${flipStyle}-${visiblePages
                              .map((p) => p.pageNumber)
                              .join('-')}`}
                            initial={animConfig.initial}
                            animate={animConfig.animate}
                            exit={animConfig.exit}
                            transition={animConfig.transition}
                            style={{
                              transformOrigin:
                                flipDirection > 0 ? 'left center' : 'right center',
                            }}
                            className={`grid ${
                              isTwoUp
                                ? phys === 'flat'
                                  ? 'grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 relative'
                                  : 'grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-0 relative'
                                : 'grid-cols-1'
                            }`}
                          >
                            {visiblePages.map((page, idx) => {
                              const spineSide =
                                phys === 'flat'
                                  ? 'none'
                                  : isTwoUp
                                    ? idx === 0
                                      ? 'left'
                                      : 'right'
                                    : 'single';
                              return (
                                <ColourfulPage
                                  key={page.pageNumber}
                                  page={page}
                                  totalPages={displayBook.totalPages}
                                  bookTitle={displayBook.title}
                                  paletteId={displayBook.paletteId}
                                  bookVisualStyle={displayBook.pageVisualStyle ?? 'auto'}
                                  settings={settings}
                                  highlights={displayBook.highlights}
                                  isBookmarked={displayBook.bookmarks.some(
                                    (b) => b.pageNumber === page.pageNumber
                                  )}
                                  searchQuery={searchQuery}
                                  activeTtsBlockIndex={
                                    isSpeaking && page.pageNumber === currentPage
                                      ? activeTtsBlockIndex
                                      : null
                                  }
                                  activeHighlighterPen={activeHighlighterPen}
                                  isTranslated={activeLanguage !== 'original'}
                                  isRtl={Boolean(activeLangMeta.isRtl || page.textDirection === 'rtl')}
                                  isFullscreen={isFullscreen}
                                  spineSide={spineSide}
                                  onCornerTurn={(dir) => {
                                    if (performance.now() - lastDragTurnAtRef.current < 400) return;
                                    if (dir > 0) goNext();
                                    else goPrev();
                                  }}
                                  onToggleBookmark={toggleBookmark}
                                  onAddHighlight={handleAddHighlight}
                                  onRemoveHighlightByText={handleRemoveHighlightByText}
                                  onCyclePageTheme={handleCyclePageTheme}
                                  onCyclePageVisualStyle={handleCyclePageVisualStyle}
                                  onCyclePageTopic={handleCyclePageTopic}
                                  onCreateFlashcard={handleAddFlashcard}
                                  aiEnabled={aiEnabled}
                                  onAiSelectionAction={handleAiSelectionAction}
                                  onAskSelection={handleAskSelection}
                                  onStudySelection={handleStudySelection}
                                  onExplainBlockItem={handleExplainBlockItem}
                                  onInspectOriginalScan={handleInspectOriginalScan}
                                />
                              );
                            })}

                            {/* Center Book Spine Shadow Seam in Physical Spread */}
                            {isTwoUp && phys !== 'flat' && (
                              <div
                                aria-hidden="true"
                                className="hidden lg:block pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 z-20 bg-gradient-to-r from-black/25 via-black/40 to-black/25"
                              />
                            )}
                          </motion.div>
                        </AnimatePresence>

                        {/* Live Natural 3D Paper Peel & Corner Fold Overlay while dragging */}
                        {dragFlip && Math.abs(dragFlip.deltaX) > 4 && (() => {
                          const pullPx = Math.min(340, Math.abs(dragFlip.deltaX) * 1.15);
                          const isNextPull = dragFlip.direction === 1;
                          const skewAngle =
                            dragFlip.anchorY > 0.62
                              ? isNextPull
                                ? -3.5 * dragFlip.progress
                                : 3.5 * dragFlip.progress
                              : dragFlip.anchorY < 0.38
                                ? isNextPull
                                  ? 3.5 * dragFlip.progress
                                  : -3.5 * dragFlip.progress
                                : 0;

                          return (
                            <div
                              aria-hidden="true"
                              className="no-print pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-xl"
                            >
                              {/* Cast page shadow across the underlying sheet */}
                              <div
                                className={`absolute inset-y-0 ${isNextPull ? 'right-0' : 'left-0'}`}
                                style={{
                                  width: `${pullPx + 42}px`,
                                  background: isNextPull
                                    ? `linear-gradient(to left, rgba(15,23,42,${0.26 * dragFlip.progress}) 0%, rgba(15,23,42,${0.1 * dragFlip.progress}) 65%, transparent 100%)`
                                    : `linear-gradient(to right, rgba(15,23,42,${0.26 * dragFlip.progress}) 0%, rgba(15,23,42,${0.1 * dragFlip.progress}) 65%, transparent 100%)`,
                                }}
                              />

                              {/* Turned / Peeling Back-of-Page Sheet */}
                              <div
                                className={`absolute inset-y-0 ${
                                  isNextPull ? 'right-0 rounded-l-lg' : 'left-0 rounded-r-lg'
                                } flex items-center justify-center`}
                                style={{
                                  width: `${Math.max(18, pullPx)}px`,
                                  transform: `skewY(${skewAngle}deg)`,
                                  transformOrigin: isNextPull ? 'right center' : 'left center',
                                  background: isNextPull
                                    ? 'linear-gradient(to left, rgba(226,232,240,0.92) 0%, rgba(248,250,252,0.96) 38%, rgba(203,213,225,0.85) 88%, rgba(15,23,42,0.22) 100%)'
                                    : 'linear-gradient(to right, rgba(226,232,240,0.92) 0%, rgba(248,250,252,0.96) 38%, rgba(203,213,225,0.85) 88%, rgba(15,23,42,0.22) 100%)',
                                  boxShadow: isNextPull
                                    ? '-10px 0 26px rgba(15,23,42,0.22)'
                                    : '10px 0 26px rgba(15,23,42,0.22)',
                                }}
                              >
                                {dragFlip.willTurn && pullPx >= 64 && (
                                  <span className="px-2 py-1 rounded-full bg-zinc-900/75 text-white text-[10px] font-semibold tracking-wide whitespace-nowrap shadow-sm">
                                    {isNextPull ? 'Release → Next' : '← Release Prev'}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Interactive Outer Edge Grab / Pull Margin Zones (Left & Right) */}
                        {currentPage > 1 && (
                          <div
                            aria-hidden="true"
                            title="Grab & pull right from left edge, or tap for previous page"
                            className="no-print absolute inset-y-6 left-0 w-8 sm:w-12 z-20 cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 transition-opacity flex items-center justify-start pl-1"
                          >
                            <span className="w-6 h-14 rounded-r-full bg-black/10 dark:bg-white/10 backdrop-blur-[2px] flex items-center justify-center text-zinc-700 dark:text-zinc-200 pointer-events-none">
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        )}
                        {currentPage < displayBook.totalPages && (
                          <div
                            aria-hidden="true"
                            title="Grab & pull left from right edge, or tap for next page"
                            className="no-print absolute inset-y-6 right-0 w-8 sm:w-12 z-20 cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 transition-opacity flex items-center justify-end pr-1"
                          >
                            <span className="w-6 h-14 rounded-l-full bg-black/10 dark:bg-white/10 backdrop-blur-[2px] flex items-center justify-center text-zinc-700 dark:text-zinc-200 pointer-events-none">
                              <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right Stacked Page Thickness Edge */}
                      {showStackEdges && currentPage < displayBook.totalPages && (
                        <div
                          aria-hidden="true"
                          className="hidden sm:block w-2 shrink-0 rounded-r-lg ebook-page-edges-right border-y border-r border-black/10"
                        />
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Hover-only Right Page Turn Arrow (zero side margin stolen from the book) */}
            <button
              type="button"
              onClick={goNext}
              disabled={
                settings.layoutMode === 'spread'
                  ? (currentPage % 2 === 1 ? currentPage : currentPage - 1) + stepSize >
                    book.totalPages
                  : currentPage >= book.totalPages
              }
              aria-label="Next page"
              className="no-print hidden md:flex items-center justify-center absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full border border-zinc-300/80 dark:border-zinc-700 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md text-zinc-700 dark:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-0 opacity-0 group-hover/stage:opacity-90 transition-all shadow-md"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </main>

      {/* Invisible Bottom Edge Hover / Touch Reveal Zone (0 visual clutter when reading) */}
      {!showChrome && (
        <div
          aria-hidden="true"
          onMouseEnter={revealChromeTemporarily}
          onTouchStart={revealChromeTemporarily}
          onClick={revealChromeTemporarily}
          className="no-print fixed bottom-0 inset-x-0 h-10 z-20 cursor-pointer"
        />
      )}

      {/* Subtle Bottom Reading Progress Bar & Time-to-Finish Footer (auto-hides until hover/touch) */}
      <footer
        onMouseEnter={revealChromeTemporarily}
        className={`no-print notranslate ${
          chromePinned ? 'sticky bottom-0' : 'fixed bottom-0 inset-x-0'
        } z-20 border-t border-zinc-200/70 dark:border-zinc-800/80 bg-white/90 dark:bg-[#10131C]/90 backdrop-blur-xl transition-all duration-200 ${
          showChrome
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-full pointer-events-none'
        }`}
      >
        {/* Continuous Hairline Progress Track */}
        <div
          role="progressbar"
          aria-label="Reading completion"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-[3px] w-full bg-zinc-200/70 dark:bg-zinc-800/80 overflow-hidden"
        >
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 transition-[width] duration-150 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        {settings.layoutMode === 'scroll' ? (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-1.5 flex items-center justify-between gap-4 text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
            <span className="truncate">
              Page {currentPage} of {displayBook.totalPages}
              {activePageObj?.chapterTitle ? ` · ${activePageObj.chapterTitle}` : ''}
            </span>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-zinc-700 dark:text-zinc-200 font-semibold">{percent}%</span>
              <span aria-hidden="true">·</span>
              <span>Time to finish: {timeToFinishLabel}</span>
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-4">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentPage <= 1}
              className="md:hidden p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-35"
              aria-label="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-400 shrink-0">
              Page {currentPage}/{displayBook.totalPages}
            </span>

            <input
              type="range"
              min={1}
              max={displayBook.totalPages}
              value={currentPage}
              onChange={(e) => goToPage(Number(e.target.value))}
              aria-label="Jump to page"
              className="flex-1 accent-amber-500 cursor-pointer"
            />

            <div className="flex items-center gap-2 text-[11px] sm:text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
              <span className="text-zinc-700 dark:text-zinc-200 font-semibold">{percent}%</span>
              <span className="hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline">Time to finish: {timeToFinishLabel}</span>
            </div>

            <button
              type="button"
              onClick={goNext}
              disabled={currentPage >= book.totalPages}
              className="md:hidden p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-35"
              aria-label="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </footer>

      {/* Side Drawers */}
      <ReaderDrawers
        drawer={drawer}
        book={displayBook}
        activeLanguage={activeLanguage}
        translatingBook={translatingBook}
        bookTranslateError={bookTranslateError}
        currentPage={currentPage}
        settings={settings}
        searchQuery={searchQuery}
        isSpeaking={isSpeaking}
        onClose={() => setDrawer(null)}
        onJumpToPage={(p) => {
          goToPage(p);
          if (window.innerWidth < 640) setDrawer(null);
        }}
        onSearchChange={setSearchQuery}
        onUpdateSettings={onUpdateSettings}
        onChangePalette={handleChangePalette}
        onChangeBookVisualStyle={handleChangeBookVisualStyle}
        onSwitchBookLanguage={handleSwitchBookLanguage}
        onTranslateFullBook={handleTranslateFullBook}
        onStartTts={() => speakPage(currentPage)}
        onPauseTts={stopTts}
        onStopTts={stopTts}
        onDeleteHighlight={handleDeleteHighlight}
        onRemoveBookmark={(p) => toggleBookmark(p)}
        onSaveStudyNote={handleSaveStudyNote}
        pendingAiSelection={pendingAiSelection}
        pendingAskSelection={pendingAskSelection}
        onOpenStudyStudio={(text, pageNum, chap) => {
          if (text && pageNum) {
            setPendingStudySelection({
              text,
              pageNumber: pageNum,
              chapterTitle: chap || '',
              triggerId: Date.now(),
            });
          }
          setDrawer('study');
        }}
      />

      {drawer === 'study' && (
        <StudyToolsDrawer
          book={displayBook}
          currentPage={currentPage}
          activeLanguageLabel={activeLanguage === 'original' ? 'original' : activeLangMeta.promptName}
          timerSecondsLeft={timerSecondsLeft}
          timerPresetMinutes={timerPresetMinutes}
          timerRunning={timerRunning}
          timerBellEnabled={timerBellEnabled}
          onClose={() => setDrawer(null)}
          onJumpToPage={(p) => {
            goToPage(p);
            if (window.innerWidth < 640) setDrawer(null);
          }}
          onAddFlashcard={(front, back, p) => handleAddFlashcard(p, front, back)}
          onAddFlashcardsBulk={handleAddFlashcardsBulk}
          onToggleMastered={handleToggleMastered}
          onRateFlashcard={handleRateFlashcard}
          onDeleteFlashcard={handleDeleteFlashcard}
          onDeleteStudyNote={handleDeleteStudyNote}
          onSaveStudyNote={handleSaveStudyNote}
          selectedPassage={pendingStudySelection}
          aiEnabled={aiEnabled}
          onToggleTimer={() => {
            if (timerSecondsLeft === 0) {
              setTimerSecondsLeft(timerPresetMinutes * 60);
            }
            setTimerRunning((r) => !r);
          }}
          onResetTimer={(mins) => {
            setTimerRunning(false);
            setTimerPresetMinutes(mins);
            setTimerSecondsLeft(mins * 60);
          }}
          onToggleBell={() => setTimerBellEnabled((b) => !b)}
        />
      )}

      {/* Side-by-Side Original Scan & AI Table / Formula / Diagram Inspector */}
      {itemInspector && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Original Scan and Item Explanation"
        >
          <div className="w-full max-w-4xl max-h-[88vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] text-zinc-900 dark:text-zinc-100 shadow-2xl flex flex-col overflow-hidden">
            <header className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="capitalize">
                  {itemInspector.kind} Inspector · Page {itemInspector.pageNumber}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setItemInspector(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close Inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left: Original Image / Crop & Verbatim Recognized Content */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">Original Capture / Crop</span>
                  {itemInspector.scanPage && (
                    <button
                      type="button"
                      onClick={() =>
                        setItemInspector((prev) =>
                          prev ? { ...prev, showOriginalPhoto: !prev.showOriginalPhoto } : null
                        )
                      }
                      className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 underline font-medium"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>
                        {itemInspector.showOriginalPhoto ? 'Show Item Crop' : 'Show Full Original Scan'}
                      </span>
                    </button>
                  )}
                </div>

                {(itemInspector.showOriginalPhoto && itemInspector.scanPage
                  ? itemInspector.scanPage.originalDataUrl
                  : itemInspector.block?.imageDataUrl ||
                    itemInspector.scanPage?.enhancedDataUrl ||
                    itemInspector.scanPage?.originalDataUrl) ? (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 p-2 flex justify-center">
                    <img
                      src={
                        itemInspector.showOriginalPhoto && itemInspector.scanPage
                          ? itemInspector.scanPage.originalDataUrl
                          : itemInspector.block?.imageDataUrl ||
                            itemInspector.scanPage?.enhancedDataUrl ||
                            itemInspector.scanPage?.originalDataUrl
                      }
                      alt="Original scanned item"
                      referrerPolicy="no-referrer"
                      className="max-h-72 w-auto object-contain rounded"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-xs text-zinc-500">
                    No original image crop attached to this block.
                  </div>
                )}

                {itemInspector.block && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        Extracted Text / Values (Preserved Verbatim)
                      </span>
                      {itemInspector.block.uncertain && (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Uncertain OCR — verify carefully</span>
                        </span>
                      )}
                    </div>
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-200">
                      {itemInspector.block.tableRows
                        ? itemInspector.block.tableRows.map((r) => r.join(' | ')).join('\n')
                        : itemInspector.block.text}
                    </pre>
                  </div>
                )}
              </div>

              {/* Right: AI Explanation */}
              <div className="space-y-3 flex flex-col">
                <div className="text-xs font-semibold">AI Explanation (Read-Only · Never Alters Values)</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={itemInspector.question}
                    onChange={(e) =>
                      setItemInspector((prev) =>
                        prev ? { ...prev, question: e.target.value } : null
                      )
                    }
                    placeholder={`Ask about this ${itemInspector.kind}...`}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    disabled={itemInspector.loading}
                    onClick={() =>
                      void runInspectorExplain(
                        {
                          kind: itemInspector.kind,
                          pageNumber: itemInspector.pageNumber,
                          block: itemInspector.block,
                          scanPage: itemInspector.scanPage,
                        },
                        itemInspector.question
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-semibold hover:bg-amber-400 disabled:opacity-50 whitespace-nowrap"
                  >
                    {itemInspector.loading ? 'Explaining…' : 'Explain'}
                  </button>
                </div>

                <div className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 text-xs leading-relaxed overflow-y-auto min-h-[180px]">
                  {itemInspector.loading ? (
                    <div className="flex items-center gap-2 text-zinc-500">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                      <span>Inspecting original visual & extracted notation…</span>
                    </div>
                  ) : itemInspector.error ? (
                    <p className="text-rose-600 dark:text-rose-400">{itemInspector.error}</p>
                  ) : itemInspector.explanation ? (
                    <div className="whitespace-pre-wrap">{itemInspector.explanation}</div>
                  ) : (
                    <p className="text-zinc-500">
                      Click Explain to analyze this {itemInspector.kind} alongside the original image.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

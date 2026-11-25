import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkCheck,
  BookOpen,
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  GraduationCap,
  Headphones,
  History,
  ImageOff,
  Languages,
  Loader2,
  LogIn,
  MessageCircleQuestion,
  Palette,
  Pause,
  Play,
  Power,
  Search,
  Send,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Square,
  Trash2,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { useAppAuth } from '../contexts/AppAuthContext';
import {
  BOOK_FONT_OPTIONS,
  HEADING_COLOR_PRESETS,
  HIGHLIGHT_STYLES,
  PALETTE_PRESETS,
  WORD_COLOR_PRESETS,
  getThemeForPage,
} from '../data/palettes';
import {
  AiAskMessage,
  AiCharacterTimelineResponse,
  AiPageInsight,
  AiPdfPageExplanation,
  AiQuizQuestion,
  AiRecapResponse,
  AiSelectionActionMode,
  AiSelectionRequest,
  BookLanguageCode,
  EbookDocument,
  GoogleVoiceName,
  LayoutMode,
  PageFlipStyle,
  PageTurnSoundStyle,
  PageVisualStyle,
  PaletteId,
  PhysicalBookStyle,
  ReaderFont,
  ReaderSettings,
  RenderMode,
  ShellTheme,
  VoiceEngine,
} from '../types/ebook';
import { AmbientSoundType, ambientAudio } from '../utils/ambientAudio';
import { buildAskBookExcerpts, buildBookExcerpts } from '../utils/bookExcerpts';
import { exportNotesAsMarkdown } from '../utils/exporters';
import { BOOK_LANGUAGE_OPTIONS, resolveLanguageMeta } from '../utils/languages';
import { translateTextWithGoogleGtx } from '../utils/googleTranslate';

export type ActiveDrawer =
  | null
  | 'pages'
  | 'search'
  | 'appearance'
  | 'audio'
  | 'notes'
  | 'ai'
  | 'study';

interface ReaderDrawersProps {
  drawer: ActiveDrawer;
  book: EbookDocument;
  activeLanguage: BookLanguageCode;
  translatingBook: { target: string; label: string; current: number; total: number } | null;
  bookTranslateError: string | null;
  currentPage: number;
  settings: ReaderSettings;
  searchQuery: string;
  isSpeaking: boolean;
  onClose: () => void;
  onJumpToPage: (pageNumber: number) => void;
  onSearchChange: (q: string) => void;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  onChangePalette: (paletteId: PaletteId) => void;
  onChangeBookVisualStyle: (style: PageVisualStyle) => void;
  onSwitchBookLanguage: (lang: BookLanguageCode) => void;
  onTranslateFullBook: (langCodeOrName: string) => void;
  onStartTts: () => void;
  onPauseTts: () => void;
  onStopTts: () => void;
  onDeleteHighlight: (id: string) => void;
  onRemoveBookmark: (pageNumber: number) => void;
  onSaveStudyNote: (pageNumber: number, title: string, content: string) => void;
  pendingAiSelection?: AiSelectionRequest | null;
  pendingAskSelection?: {
    text: string;
    pageNumber: number;
    chapterTitle: string;
    triggerId: number;
  } | null;
  onOpenStudyStudio?: (
    selectionText?: string,
    pageNumber?: number,
    chapterTitle?: string
  ) => void;
}

const LANGUAGES = [
  'Bengali (বাংলা)',
  'Hindi (हिन्दी)',
  'English',
  'Arabic (العربية)',
  'Urdu (اردو)',
  'Spanish (Español)',
  'French (Français)',
  'Japanese (日本語)',
  'German (Deutsch)',
  'Korean (한국어)',
  'Chinese (中文)',
  'Portuguese (Português)',
  'Russian (Русский)',
  'Italian (Italiano)',
  'Turkish (Türkçe)',
  'Tamil (தமிழ்)',
  'Telugu (తెలుగు)',
  'Marathi (मराठी)',
  'Gujarati (ગુજરાતી)',
  'Punjabi (ਪੰਜਾਬੀ)',
  'Nepali (नेपाली)',
  'Indonesian (Bahasa Indonesia)',
  'Vietnamese (Tiếng Việt)',
  'Thai (ไทย)',
  'Persian (فارسی)',
];

type AiStudioTab =
  | 'recap'
  | 'ask'
  | 'explain'
  | 'characters'
  | 'study'
  | 'pdf'
  | 'translate'
  | 'insights';

export const ReaderDrawers: React.FC<ReaderDrawersProps> = ({
  drawer,
  book,
  activeLanguage,
  translatingBook,
  bookTranslateError,
  currentPage,
  settings,
  searchQuery,
  isSpeaking,
  onClose,
  onJumpToPage,
  onSearchChange,
  onUpdateSettings,
  onChangePalette,
  onChangeBookVisualStyle,
  onSwitchBookLanguage,
  onTranslateFullBook,
  onStartTts,
  onPauseTts,
  onStopTts,
  onDeleteHighlight,
  onRemoveBookmark,
  onSaveStudyNote,
  pendingAiSelection = null,
  pendingAskSelection = null,
  onOpenStudyStudio,
}) => {
  const {
    user,
    isSigningIn,
    signInWithGoogle,
    getAuthHeaders,
    aiStatus,
    syncVoicePreferences,
  } = useAppAuth();

  const [ambientType, setAmbientType] = useState<AmbientSoundType>('off');
  const [ambientVol, setAmbientVol] = useState(0.25);

  const aiEnabled = settings.aiEnabled !== false;

  // AI Studio state
  const [aiTab, setAiTab] = useState<AiStudioTab>('recap');
  const [spoilerSafe, setSpoilerSafe] = useState<boolean>(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastAiEngine, setLastAiEngine] = useState<string | null>(null);

  // 1. Spoiler-safe Recap
  const [recapDepth, setRecapDepth] = useState<'short' | 'detailed'>('short');
  const [recapResult, setRecapResult] = useState<AiRecapResponse | null>(null);

  // 2. Ask the Book (Multi-turn grounded chat)
  const [askScope, setAskScope] = useState<'book' | 'chapter' | 'selection'>('book');
  const [askQuestion, setAskQuestion] = useState('');
  const [askMessages, setAskMessages] = useState<AiAskMessage[]>([]);
  const askThreadRef = useRef<HTMLDivElement | null>(null);

  // 3. Explain, Simplify & Translate Selected Text
  const [selectedPassageText, setSelectedPassageText] = useState('');
  const [selectedPassagePage, setSelectedPassagePage] = useState<number>(currentPage);
  const [selectedPassageChapter, setSelectedPassageChapter] = useState<string>('');
  const [explainMode, setExplainMode] = useState<AiSelectionActionMode>('simple');
  const [explainLang, setExplainLang] = useState<string>('English');
  const [explainResult, setExplainResult] = useState<{
    originalText: string;
    resultText: string;
    mode: AiSelectionActionMode;
    targetLanguage: string;
    reference: string;
  } | null>(null);

  // 4. Characters, Terms & Timeline
  const [charQueryType, setCharQueryType] = useState<
    'overview' | 'lookup' | 'relationships' | 'timeline'
  >('overview');
  const [charQueryTerm, setCharQueryTerm] = useState('');
  const [charResult, setCharResult] = useState<AiCharacterTimelineResponse | null>(null);

  // 5. AI Study Mode (Quiz from Selection / Highlights / Page) + Insights & Cheat-Sheet
  const [studySource, setStudySource] = useState<'selection' | 'highlights' | 'page'>('page');
  const [insightCache, setInsightCache] = useState<Record<number, AiPageInsight>>({});
  const [cheatCache, setCheatCache] = useState<
    Record<number, { title: string; simpleExplanation: string; examFacts: string[] }>
  >({});
  const [cheatSavedPage, setCheatSavedPage] = useState<number | null>(null);
  const [cheatLang, setCheatLang] = useState('English');
  const [quizCache, setQuizCache] = useState<Record<string, AiQuizQuestion[]>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSavedKey, setQuizSavedKey] = useState<string | null>(null);

  // 6. Explain a PDF Page
  const [pdfFocusType, setPdfFocusType] = useState<'auto' | 'table' | 'chart' | 'diagram'>('auto');
  const [pdfPrompt, setPdfPrompt] = useState('');
  const [pdfExplanation, setPdfExplanation] = useState<Record<number, AiPdfPageExplanation>>({});

  // Page Translation state
  const [targetLang, setTargetLang] = useState('Bengali (বাংলা)');
  const [customFullBookLang, setCustomFullBookLang] = useState('');
  const [translatedText, setTranslatedText] = useState<string | null>(null);

  const activePageData = useMemo(
    () => book.pages.find((p) => p.pageNumber === currentPage) ?? book.pages[0],
    [book.pages, currentPage]
  );

  // Reset per-page transient translation when page changes
  useEffect(() => {
    setTranslatedText(null);
    setAiError(null);
  }, [currentPage]);

  // Handle incoming selection AI action (Explain simply / Example / Translate) from ColourfulPage
  const executeExplainSelection = async (
    text: string,
    mode: AiSelectionActionMode,
    lang: string,
    pageNum: number,
    chapterTitle: string
  ) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setAiError('Select or enter a passage from the book to explain or translate.');
      return;
    }
    if (!aiEnabled) {
      setAiError('AI assistance is currently disabled.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const pageObj = book.pages.find((p) => p.pageNumber === pageNum) ?? activePageData;
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/ai/explain-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          selectedText: trimmed,
          mode,
          targetLanguage: lang,
          bookTitle: book.title,
          pageNumber: pageNum,
          chapterTitle: chapterTitle || pageObj?.chapterTitle || '',
          surroundingContext: pageObj?.rawText?.slice(0, 3500) || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not process selection');
      if (data.engine) setLastAiEngine(data.engine);
      setExplainResult({
        originalText: data.originalText || trimmed,
        resultText: data.resultText || '',
        mode,
        targetLanguage: lang,
        reference: data.reference || `Page ${pageNum}`,
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Selection request failed');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (!pendingAiSelection || !pendingAiSelection.text.trim()) return;
    setSelectedPassageText(pendingAiSelection.text);
    setSelectedPassagePage(pendingAiSelection.pageNumber);
    setSelectedPassageChapter(pendingAiSelection.chapterTitle);
    setExplainMode(pendingAiSelection.mode);
    setStudySource('selection');
    setAiTab('explain');
    setAiError(null);
    if (settings.aiEnabled !== false) {
      void executeExplainSelection(
        pendingAiSelection.text,
        pendingAiSelection.mode,
        explainLang,
        pendingAiSelection.pageNumber,
        pendingAiSelection.chapterTitle
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAiSelection?.triggerId]);

  useEffect(() => {
    if (!pendingAskSelection || !pendingAskSelection.text.trim()) return;
    setSelectedPassageText(pendingAskSelection.text);
    setSelectedPassagePage(pendingAskSelection.pageNumber);
    setSelectedPassageChapter(pendingAskSelection.chapterTitle);
    setAskScope('selection');
    setStudySource('selection');
    setAiTab('ask');
    setAiError(null);
  }, [pendingAskSelection?.triggerId, pendingAskSelection?.text, pendingAskSelection?.pageNumber, pendingAskSelection?.chapterTitle]);

  useEffect(() => {
    if (askThreadRef.current) {
      askThreadRef.current.scrollTop = askThreadRef.current.scrollHeight;
    }
  }, [askMessages, aiLoading]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits: Array<{ pageNumber: number; chapterTitle: string; snippet: string }> = [];
    for (const p of book.pages) {
      const idx = p.rawText.toLowerCase().indexOf(q);
      if (idx !== -1) {
        const start = Math.max(0, idx - 45);
        const end = Math.min(p.rawText.length, idx + q.length + 75);
        const snippet = (start > 0 ? '…' : '') + p.rawText.slice(start, end) + (end < p.rawText.length ? '…' : '');
        hits.push({ pageNumber: p.pageNumber, chapterTitle: p.chapterTitle, snippet });
      }
    }
    return hits;
  }, [book.pages, searchQuery]);

  if (!drawer || drawer === 'study') return null;

  const handleAmbientChange = (type: AmbientSoundType) => {
    setAmbientType(type);
    ambientAudio.start(type, ambientVol);
  };

  const ensureAiEnabled = (): boolean => {
    if (!aiEnabled) {
      setAiError('AI assistance is currently disabled. Turn it back on above to use AI features.');
      return false;
    }
    return true;
  };

  const runRecap = async (depth: 'short' | 'detailed' = recapDepth) => {
    if (!ensureAiEnabled()) return;
    setRecapDepth(depth);
    const excerpts = buildBookExcerpts(book, currentPage, spoilerSafe, 18000);
    if (excerpts.length === 0) {
      setAiError('Not enough book text up to this page to generate a recap.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/ai/recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          bookTitle: book.title,
          currentPage,
          totalPages: book.totalPages,
          depth,
          spoilerSafe,
          excerpts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate recap');
      if (data.engine) setLastAiEngine(data.engine);
      setRecapResult({
        summary: data.summary || '',
        keyEvents: Array.isArray(data.keyEvents) ? data.keyEvents : [],
        upToPage: data.upToPage ?? currentPage,
        spoilerSafe: Boolean(data.spoilerSafe ?? spoilerSafe),
        depth,
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Recap generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const runPageInsights = async () => {
    if (!activePageData || !ensureAiEnabled()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/ai/analyze-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          pageText: activePageData.rawText,
          bookTitle: book.title,
          pageNumber: activePageData.pageNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not analyze page');
      if (data.engine) setLastAiEngine(data.engine);
      setInsightCache((prev) => ({ ...prev, [activePageData.pageNumber]: data }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  };

  const runTranslate = async () => {
    if (!activePageData) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const meta = resolveLanguageMeta(targetLang);
      try {
        const gtxResult = await translateTextWithGoogleGtx(activePageData.rawText, meta.code);
        if (gtxResult.trim()) {
          setTranslatedText(gtxResult);
          return;
        }
      } catch {
        // Fall through to backend translation endpoint
      }

      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          pageText: activePageData.rawText,
          targetLanguage: meta.promptName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Translation failed');
      setTranslatedText(data.translatedText);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const quizActiveKey = `${studySource}-${currentPage}`;

  const runStudyQuiz = async () => {
    if (!ensureAiEnabled()) return;
    if (studySource === 'selection' && selectedPassageText.trim().length < 15) {
      setAiError('Select a passage on a page first, or switch source to Highlights or Current Page.');
      return;
    }
    if (studySource === 'highlights' && book.highlights.length === 0) {
      setAiError('No saved highlights yet. Highlight sentences in the book or switch to Current Page.');
      return;
    }
    if (studySource === 'page' && (!activePageData || activePageData.rawText.trim().length < 20)) {
      setAiError('Not enough text on this page to build a study quiz.');
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setQuizSavedKey(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/ai/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          sourceType: studySource,
          selectedText: selectedPassageText,
          highlights: book.highlights.map((h) => ({
            pageNumber: h.pageNumber,
            text: h.text,
            note: h.note,
          })),
          pageText: activePageData?.rawText || '',
          bookTitle: book.title,
          pageNumber: studySource === 'selection' ? selectedPassagePage : currentPage,
          questionCount: 3,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Quiz generation failed');
      if (data.engine) setLastAiEngine(data.engine);
      setQuizCache((prev) => ({ ...prev, [quizActiveKey]: data.questions ?? [] }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Quiz generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const runAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuestion.trim() || !activePageData || !ensureAiEnabled()) return;
    if (askScope === 'selection' && !selectedPassageText.trim()) {
      setAiError('Select text on a page first, or switch Ask scope to Current Chapter or Whole Book.');
      return;
    }

    const q = askQuestion.trim();
    const excerpts = buildAskBookExcerpts(
      book,
      currentPage,
      spoilerSafe,
      q,
      askScope,
      selectedPassageText,
      18000
    );
    if (excerpts.length === 0) {
      setAiError('No readable book passages are available in this scope.');
      return;
    }

    setAskQuestion('');
    setAiLoading(true);
    setAiError(null);
    const scopeLabel =
      askScope === 'selection'
        ? `Selected text (p.${selectedPassagePage})`
        : askScope === 'chapter'
          ? activePageData.chapterTitle || 'Current Chapter'
          : spoilerSafe
            ? `Book up to p.${currentPage}`
            : 'Full Book';

    const nextHistory = [
      ...askMessages,
      { role: 'user' as const, text: q, scopeLabel, spoilerSafe },
    ];
    setAskMessages(nextHistory);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          question: q,
          scope: askScope,
          selectedText: selectedPassageText,
          excerpts,
          history: askMessages.map((m) => ({ role: m.role, text: m.text })),
          bookTitle: book.title,
          pageNumber: askScope === 'selection' ? selectedPassagePage : currentPage,
          spoilerSafe,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Q&A failed');
      if (data.engine) setLastAiEngine(data.engine);
      setAskMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.answer || '',
          citations: Array.isArray(data.citations) ? data.citations : [],
          supportedByBook: typeof data.supportedByBook === 'boolean' ? data.supportedByBook : true,
          scopeLabel,
          spoilerSafe,
        },
      ]);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Q&A failed');
    } finally {
      setAiLoading(false);
    }
  };

  const runCharactersTimeline = async (
    queryType: 'overview' | 'lookup' | 'relationships' | 'timeline' = charQueryType
  ) => {
    if (!ensureAiEnabled()) return;
    if (queryType === 'lookup' && !charQueryTerm.trim()) {
      setAiError('Enter a character, person, or key term name to look up.');
      return;
    }
    setCharQueryType(queryType);
    const excerpts = buildBookExcerpts(book, currentPage, spoilerSafe, 18000);
    if (excerpts.length === 0) {
      setAiError('Not enough book text up to this page to analyze characters or timeline.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/ai/characters-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          queryType,
          queryTerm: charQueryTerm.trim(),
          spoilerSafe,
          currentPage,
          bookTitle: book.title,
          excerpts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Character & timeline analysis failed');
      if (data.engine) setLastAiEngine(data.engine);
      setCharResult({
        summary: data.summary || '',
        supportedByBook: typeof data.supportedByBook === 'boolean' ? data.supportedByBook : true,
        items: Array.isArray(data.items) ? data.items : [],
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Character lookup failed');
    } finally {
      setAiLoading(false);
    }
  };

  const runExplainPdfPage = async (
    focus: 'auto' | 'table' | 'chart' | 'diagram' = pdfFocusType
  ) => {
    if (!ensureAiEnabled()) return;
    if (!activePageData?.canvasDataUrl) {
      setAiError(
        'No rendered PDF page snapshot is available on this page for visual inspection.'
      );
      return;
    }
    setPdfFocusType(focus);
    setAiLoading(true);
    setAiError(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/ai/explain-pdf-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          imageDataUrl: activePageData.canvasDataUrl,
          focusType: focus,
          focusPrompt: pdfPrompt.trim(),
          pageNumber: activePageData.pageNumber,
          chapterTitle: activePageData.chapterTitle,
          bookTitle: book.title,
          pageText: activePageData.rawText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not explain PDF page');
      if (data.engine) setLastAiEngine(data.engine);
      setPdfExplanation((prev) => ({
        ...prev,
        [activePageData.pageNumber]: {
          visualTypeDetected: data.visualTypeDetected || 'PDF Page Visual',
          explanation: data.explanation || '',
          keyTakeaways: Array.isArray(data.keyTakeaways) ? data.keyTakeaways : [],
          reference: data.reference || `Page ${activePageData.pageNumber}`,
        },
      }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'PDF page explanation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const runCheatSheet = async () => {
    if (!activePageData || !ensureAiEnabled()) return;
    setAiLoading(true);
    setAiError(null);
    setCheatSavedPage(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/ai/study-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          pageText: activePageData.rawText,
          bookTitle: book.title,
          pageNumber: activePageData.pageNumber,
          language: cheatLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Study sheet generation failed');
      if (data.engine) setLastAiEngine(data.engine);
      setCheatCache((prev) => ({ ...prev, [activePageData.pageNumber]: data }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Study sheet generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const extractFirstPageNumber = (refStr: string): number | null => {
    const m = refStr.match(/(?:page|p\.?)\s*(\d+)/i);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n >= 1 && n <= book.totalPages ? n : null;
  };

  const titles: Record<Exclude<ActiveDrawer, null | 'study'>, string> = {
    pages: 'Contents & Colourful Pages',
    search: 'Search Inside Book',
    appearance: 'Colour & Typography Studio',
    audio: 'Audio Narrator & Soundscape',
    notes: 'Highlights & Bookmarks',
    ai: 'AI Reading Companion',
  };

  return (
    <aside
      className={`no-print notranslate fixed inset-y-0 right-0 z-40 w-full ${
        drawer === 'ai' ? 'sm:w-[440px]' : 'sm:w-[390px]'
      } bg-white dark:bg-[#12151E] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col`}
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {titles[drawer]}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto studio-scroll p-5 space-y-6">
        {/* 1. PAGES & TOC */}
        {drawer === 'pages' && (
          <>
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3">
                Chapters ({book.chapters.length})
              </h3>
              <div className="space-y-1">
                {book.chapters.map((ch, i) => (
                  <button
                    key={`${ch.pageNumber}-${i}`}
                    type="button"
                    onClick={() => onJumpToPage(ch.pageNumber)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
                  >
                    <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                      {ch.title}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-zinc-500 shrink-0">
                      p.{ch.pageNumber}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3">
                All Colourful Pages ({book.totalPages})
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {book.pages.map((p) => {
                  const pTheme = getThemeForPage(book.paletteId, p.pageNumber, p.customThemeIndex);
                  const isActive = p.pageNumber === currentPage;
                  return (
                    <button
                      key={p.pageNumber}
                      type="button"
                      onClick={() => onJumpToPage(p.pageNumber)}
                      className={`group rounded-xl border p-2.5 text-left transition-all ${
                        isActive
                          ? 'ring-2 ring-amber-500 border-amber-500'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400'
                      }`}
                      style={{ background: pTheme.paperGradient, color: pTheme.inkColor }}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums mb-1.5">
                        <span style={{ color: pTheme.accentColor }} className="font-semibold">
                          Page {p.pageNumber}
                        </span>
                        <span className="opacity-70">{p.wordCount}w</span>
                      </div>
                      {p.thumbnailDataUrl ? (
                        <img
                          src={p.thumbnailDataUrl}
                          alt={`Page ${p.pageNumber} thumbnail`}
                          referrerPolicy="no-referrer"
                          className="w-full h-24 object-cover rounded border border-black/10 mb-1.5 mix-blend-multiply dark:mix-blend-normal"
                        />
                      ) : (
                        <p className="text-[11px] leading-snug line-clamp-4 opacity-85 min-h-[58px]">
                          {p.rawText || p.chapterTitle}
                        </p>
                      )}
                      <div className="text-[10px] truncate opacity-75">{pTheme.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* 2. SEARCH */}
        {drawer === 'search' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search words, chapters, quotes..."
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {searchQuery.trim().length < 2 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Type at least 2 characters to search across all {book.totalPages} colourful pages.
              </p>
            ) : searchResults.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                No matches found for “{searchQuery}”.
              </p>
            ) : (
              <div className="space-y-2.5">
                <div className="text-xs font-medium text-zinc-500 tabular-nums">
                  {searchResults.length} page match{searchResults.length === 1 ? '' : 'es'}
                </div>
                {searchResults.map((hit) => (
                  <button
                    key={hit.pageNumber}
                    type="button"
                    onClick={() => onJumpToPage(hit.pageNumber)}
                    className="w-full text-left p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                      <span className="truncate">{hit.chapterTitle}</span>
                      <span>Page {hit.pageNumber}</span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                      {hit.snippet}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. APPEARANCE & COLOUR STUDIO */}
        {drawer === 'appearance' && (
          <div className="space-y-6">
            {/* Page Colour Palettes */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                <Palette className="w-3.5 h-3.5" />
                <span>Book Page Colour Palette</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {PALETTE_PRESETS.map((preset) => {
                  const active = book.paletteId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onChangePalette(preset.id)}
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border text-left transition-all ${
                        active
                          ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {preset.label}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {preset.description}
                        </div>
                      </div>
                      <div className="flex items-center -space-x-1 shrink-0">
                        {preset.swatches.map((hex, i) => (
                          <span
                            key={i}
                            className="w-4 h-4 rounded-full border border-black/15"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vividness Slider */}
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-zinc-700 dark:text-zinc-300">Page Colour Vividness</span>
                <span className="font-mono tabular-nums text-zinc-500">{settings.vividness}%</span>
              </div>
              <input
                type="range"
                min={70}
                max={135}
                value={settings.vividness}
                onChange={(e) => onUpdateSettings({ vividness: Number(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>

            {/* Layout Mode */}
            <div>
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Page Layout
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                {(
                  [
                    { id: 'spread', label: '2-Page' },
                    { id: 'single', label: 'Single' },
                    { id: 'scroll', label: 'Scroll' },
                  ] as Array<{ id: LayoutMode; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUpdateSettings({ layoutMode: item.id })}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      settings.layoutMode === item.id
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Render Mode (Reflow vs Original PDF Canvas) */}
            <div>
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Page Rendering Mode
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                {(
                  [
                    { id: 'reflow', label: 'Colourful Reflow' },
                    { id: 'canvas', label: 'Colour PDF Canvas' },
                  ] as Array<{ id: RenderMode; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUpdateSettings({ renderMode: item.id })}
                    className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      settings.renderMode === item.id
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic-Based Page Design / Cartoon / Graphics Style */}
            <div>
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Page Topic Graphics & Design
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                {(
                  [
                    { id: 'auto', label: 'Topic Auto' },
                    { id: 'cartoon', label: 'Cartoon' },
                    { id: 'infographic', label: 'Diagrams' },
                    { id: 'editorial', label: 'Editorial' },
                    { id: 'minimal', label: 'Minimal' },
                  ] as Array<{ id: PageVisualStyle; label: string }>
                ).map((item) => {
                  const active = (book.pageVisualStyle ?? 'auto') === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChangeBookVisualStyle(item.id)}
                      className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Physical Book Reading Style */}
            <div>
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Physical Book Reading Style
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                {(
                  [
                    { id: 'hardcover', label: 'Hardcover' },
                    { id: 'leather', label: 'Leather' },
                    { id: 'paperback', label: 'Paperback' },
                    { id: 'notebook', label: 'Notebook' },
                    { id: 'flat', label: 'Clean Flat' },
                  ] as Array<{ id: PhysicalBookStyle; label: string }>
                ).map((item) => {
                  const active = (settings.physicalBookStyle ?? 'hardcover') === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onUpdateSettings({ physicalBookStyle: item.id })}
                      className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Page-Turning Animation Style */}
            <div>
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Page-Turn Flip Style
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                {(
                  [
                    { id: 'book3d', label: '3D Book' },
                    { id: 'curl', label: 'Page Curl' },
                    { id: 'slide', label: 'Slide' },
                    { id: 'snap', label: 'Paper Snap' },
                    { id: 'fade', label: 'Soft Fade' },
                  ] as Array<{ id: PageFlipStyle; label: string }>
                ).map((item) => {
                  const active = (settings.pageFlipStyle ?? 'book3d') === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onUpdateSettings({ pageFlipStyle: item.id });
                        ambientAudio.playPageTurnSound(
                          settings.pageSoundStyle ?? 'paper',
                          1,
                          settings.pageSoundVolume ?? 0.65
                        );
                      }}
                      className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font Family, Word Ink Colour & Sizing */}
            <div className="space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 bg-zinc-50/70 dark:bg-zinc-900/40">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Book Typography & Word Colour
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      font: 'serif',
                      fontSize: 17,
                      lineHeight: 1.72,
                      letterSpacing: 'normal',
                      textColorId: 'auto',
                      headingColorId: 'auto',
                    })
                  }
                  className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Reset Auto
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {BOOK_FONT_OPTIONS.map((item) => {
                  const active = settings.font === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onUpdateSettings({ font: item.id })}
                      className={`flex items-center justify-between gap-2 py-2 px-2.5 rounded-xl border text-left transition-all ${
                        active
                          ? 'border-amber-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-amber-500/40'
                          : 'border-zinc-200/80 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`text-xs font-semibold truncate ${item.className}`}>
                          {item.label}
                        </div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                          {item.tag}
                        </div>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 opacity-80 ${item.className}`}>
                        {item.sample}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Word / Ink Colour */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    Book Word / Ink Colour
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {WORD_COLOR_PRESETS.find((c) => c.id === (settings.textColorId ?? 'auto'))?.label ??
                      'Custom Ink'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {WORD_COLOR_PRESETS.map((preset) => {
                    const active = (settings.textColorId ?? 'auto') === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.label}
                        onClick={() => onUpdateSettings({ textColorId: preset.id })}
                        className={`w-6 h-6 rounded-full border transition-transform ${
                          active
                            ? 'ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-zinc-900 scale-110 border-zinc-900 dark:border-white'
                            : 'border-black/20 dark:border-white/25 hover:scale-105'
                        }`}
                        style={{ background: preset.swatch }}
                      />
                    );
                  })}
                  <label
                    title="Pick any custom word colour"
                    className={`relative w-6 h-6 rounded-full border cursor-pointer overflow-hidden flex items-center justify-center text-[10px] font-bold ${
                      settings.textColorId === 'custom'
                        ? 'ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-zinc-900 border-amber-500'
                        : 'border-dashed border-zinc-400 dark:border-zinc-600'
                    }`}
                    style={{
                      backgroundColor:
                        settings.textColorId === 'custom'
                          ? settings.customTextColor || '#1E293B'
                          : 'transparent',
                    }}
                  >
                    {settings.textColorId !== 'custom' && <span>+</span>}
                    <input
                      type="color"
                      value={settings.customTextColor || '#1E293B'}
                      onChange={(e) =>
                        onUpdateSettings({
                          textColorId: 'custom',
                          customTextColor: e.target.value,
                        })
                      }
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              {/* Heading & Accent Colour */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    Heading & Drop-Cap Colour
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {HEADING_COLOR_PRESETS.find((c) => c.id === (settings.headingColorId ?? 'auto'))
                      ?.label ?? 'Custom Accent'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {HEADING_COLOR_PRESETS.map((preset) => {
                    const active = (settings.headingColorId ?? 'auto') === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.label}
                        onClick={() => onUpdateSettings({ headingColorId: preset.id })}
                        className={`w-6 h-6 rounded-full border transition-transform ${
                          active
                            ? 'ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-zinc-900 scale-110 border-zinc-900 dark:border-white'
                            : 'border-black/20 dark:border-white/25 hover:scale-105'
                        }`}
                        style={{ background: preset.swatch }}
                      />
                    );
                  })}
                  <label
                    title="Pick any custom heading colour"
                    className={`relative w-6 h-6 rounded-full border cursor-pointer overflow-hidden flex items-center justify-center text-[10px] font-bold ${
                      settings.headingColorId === 'custom'
                        ? 'ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-zinc-900 border-amber-500'
                        : 'border-dashed border-zinc-400 dark:border-zinc-600'
                    }`}
                    style={{
                      backgroundColor:
                        settings.headingColorId === 'custom'
                          ? settings.customHeadingColor || '#B45309'
                          : 'transparent',
                    }}
                  >
                    {settings.headingColorId !== 'custom' && <span>+</span>}
                    <input
                      type="color"
                      value={settings.customHeadingColor || '#B45309'}
                      onChange={(e) =>
                        onUpdateSettings({
                          headingColorId: 'custom',
                          customHeadingColor: e.target.value,
                        })
                      }
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-600 dark:text-zinc-400">Font Size</span>
                  <span className="font-mono tabular-nums text-zinc-500">{settings.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={26}
                  value={settings.fontSize}
                  onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-600 dark:text-zinc-400">Line Spacing</span>
                  <span className="font-mono tabular-nums text-zinc-500">
                    {settings.lineHeight.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={1.4}
                  max={2.15}
                  step={0.05}
                  value={settings.lineHeight}
                  onChange={(e) => onUpdateSettings({ lineHeight: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Word Letter Spacing
                </div>
                <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-zinc-200/70 dark:bg-zinc-800">
                  {(
                    [
                      { id: 'tight', label: 'Tight' },
                      { id: 'normal', label: 'Normal' },
                      { id: 'relaxed', label: 'Airy' },
                      { id: 'wide', label: 'Wide' },
                    ] as const
                  ).map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => onUpdateSettings({ letterSpacing: sp.id })}
                      className={`py-1 text-[11px] font-medium rounded-md transition-colors ${
                        (settings.letterSpacing ?? 'normal') === sp.id
                          ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Desk Shell Theme */}
            <div>
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Workspace Backdrop
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                {(
                  [
                    { id: 'light', label: 'Studio Light' },
                    { id: 'sepia', label: 'Warm Paper' },
                    { id: 'dark', label: 'Midnight' },
                  ] as Array<{ id: ShellTheme; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUpdateSettings({ shellTheme: item.id })}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      settings.shellTheme === item.id
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Student Focus Reading Aids */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-3">
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Student Highlight & Focus Aids
              </div>
              <label className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <span>Auto-Highlight Formulas & Key Concepts</span>
                <input
                  type="checkbox"
                  checked={settings.autoHighlightImportant}
                  onChange={(e) => onUpdateSettings({ autoHighlightImportant: e.target.checked })}
                  className="rounded accent-amber-500 w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <span>Bionic Focus Reading (bold word stems)</span>
                <input
                  type="checkbox"
                  checked={settings.bionicReading}
                  onChange={(e) => onUpdateSettings({ bionicReading: e.target.checked })}
                  className="rounded accent-amber-500 w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <span>Focus Reading Ruler (line spotlight)</span>
                <input
                  type="checkbox"
                  checked={settings.readingRuler}
                  onChange={(e) => onUpdateSettings({ readingRuler: e.target.checked })}
                  className="rounded accent-amber-500 w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <span>AI Reading Assistant (optional)</span>
                <input
                  type="checkbox"
                  checked={settings.aiEnabled !== false}
                  onChange={(e) => onUpdateSettings({ aiEnabled: e.target.checked })}
                  className="rounded accent-amber-500 w-4 h-4"
                />
              </label>
            </div>
          </div>
        )}

        {/* 4. AUDIO NARRATOR & AMBIENT SOUNDSCAPE */}
        {drawer === 'audio' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <Volume2 className="w-4 h-4 text-amber-500" />
                  <span>Google Smooth Voice (Page {currentPage})</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  {(settings.voiceEngine ?? 'google-ai') === 'google-ai'
                    ? 'Google AI'
                    : 'Google Browser'}
                </span>
              </div>

              {/* Google Voice Engine Switcher */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Voice Engine
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                  {(
                    [
                      { id: 'google-ai', label: 'Google Smooth AI' },
                      { id: 'browser', label: 'Google Fast Local' },
                    ] as Array<{ id: VoiceEngine; label: string }>
                  ).map((eng) => {
                    const active = (settings.voiceEngine ?? 'google-ai') === eng.id;
                    return (
                      <button
                        key={eng.id}
                        type="button"
                        onClick={() => {
                          onUpdateSettings({ voiceEngine: eng.id });
                          syncVoicePreferences(eng.id, settings.googleVoiceName ?? 'Kore');
                        }}
                        className={`py-1.5 px-2 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {eng.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Google Voice Persona Picker */}
              {(settings.voiceEngine ?? 'google-ai') === 'google-ai' && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                    Google Smooth Narrator Persona
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'Kore', desc: 'Warm' },
                        { id: 'Zephyr', desc: 'Bright' },
                        { id: 'Puck', desc: 'Natural' },
                        { id: 'Charon', desc: 'Calm Deep' },
                        { id: 'Fenrir', desc: 'Story' },
                      ] as Array<{ id: GoogleVoiceName; desc: string }>
                    ).map((voice) => {
                      const active = (settings.googleVoiceName ?? 'Kore') === voice.id;
                      return (
                        <button
                          key={voice.id}
                          type="button"
                          onClick={() => {
                            onUpdateSettings({ googleVoiceName: voice.id });
                            syncVoicePreferences(settings.voiceEngine ?? 'google-ai', voice.id);
                          }}
                          className={`px-2 py-1.5 rounded-xl border text-left transition-colors ${
                            active
                              ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
                              : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          <div className="text-[11px] font-semibold leading-tight">{voice.id}</div>
                          <div className="text-[10px] opacity-70">{voice.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={isSpeaking ? onPauseTts : onStartTts}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  {isSpeaking ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {isSpeaking ? 'Pause Reading' : 'Read Page Aloud'}
                </button>
                <button
                  type="button"
                  onClick={onStopTts}
                  title="Stop Narration"
                  className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-600 dark:text-zinc-400">Narration Speed</span>
                  <span className="font-mono tabular-nums text-zinc-500">{settings.ttsRate.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.8}
                  step={0.05}
                  value={settings.ttsRate}
                  onChange={(e) => onUpdateSettings({ ttsRate: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>

              <label className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <span>Auto-turn page when finished</span>
                <input
                  type="checkbox"
                  checked={settings.autoReadTurn}
                  onChange={(e) => onUpdateSettings({ autoReadTurn: e.target.checked })}
                  className="rounded accent-amber-500 w-4 h-4"
                />
              </label>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <Headphones className="w-4 h-4 text-emerald-500" />
                <span>Ambient Reading Soundscape</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'off', label: 'Silent' },
                    { id: 'rain', label: 'Soft Rain' },
                    { id: 'hearth', label: 'Warm Hearth' },
                    { id: 'drone', label: 'Calm Focus' },
                  ] as Array<{ id: AmbientSoundType; label: string }>
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleAmbientChange(s.id)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${
                      ambientType === s.id
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {ambientType !== 'off' && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-600 dark:text-zinc-400">Ambience Volume</span>
                    <span className="font-mono tabular-nums text-zinc-500">
                      {Math.round(ambientVol * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.9}
                    step={0.05}
                    value={ambientVol}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setAmbientVol(v);
                      ambientAudio.setVolume(v);
                    }}
                    className="w-full accent-emerald-500"
                  />
                </div>
              )}
            </div>

            {/* Real-Life Page-Turn Sound Effects */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <BookOpen className="w-4 h-4 text-amber-500" />
                  <span>Real-Life Page-Turn Sound</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    ambientAudio.playPageTurnSound(
                      settings.pageSoundStyle === 'off' ? 'paper' : settings.pageSoundStyle,
                      1,
                      settings.pageSoundVolume ?? 0.65
                    )
                  }
                  className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Preview
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'paper', label: 'Crisp Paper' },
                    { id: 'soft', label: 'Soft Silk' },
                    { id: 'hardcover', label: 'Hardcover' },
                    { id: 'vintage', label: 'Vintage Parchment' },
                    { id: 'off', label: 'Muted' },
                  ] as Array<{ id: PageTurnSoundStyle; label: string }>
                ).map((s) => {
                  const active = (settings.pageSoundStyle ?? 'paper') === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onUpdateSettings({ pageSoundStyle: s.id });
                        ambientAudio.playPageTurnSound(s.id, 1, settings.pageSoundVolume ?? 0.65);
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${
                        active
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {(settings.pageSoundStyle ?? 'paper') !== 'off' && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-600 dark:text-zinc-400">Page Sound Volume</span>
                    <span className="font-mono tabular-nums text-zinc-500">
                      {Math.round((settings.pageSoundVolume ?? 0.65) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={settings.pageSoundVolume ?? 0.65}
                    onChange={(e) => {
                      const vol = Number(e.target.value);
                      onUpdateSettings({ pageSoundVolume: vol });
                    }}
                    className="w-full accent-amber-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. HIGHLIGHTS & BOOKMARKS */}
        {drawer === 'notes' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 tabular-nums">
                {book.bookmarks.length} bookmarks · {book.highlights.length} highlights
              </span>
              <button
                type="button"
                onClick={() => exportNotesAsMarkdown(book)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Download className="w-3.5 h-3.5" />
                Export .MD
              </button>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2.5">
                Bookmarks
              </h3>
              {book.bookmarks.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No bookmarks yet. Click the bookmark icon on any colourful page.
                </p>
              ) : (
                <div className="space-y-2">
                  {book.bookmarks.map((bm) => (
                    <div
                      key={bm.pageNumber}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800"
                    >
                      <button
                        type="button"
                        onClick={() => onJumpToPage(bm.pageNumber)}
                        className="text-left min-w-0 flex-1"
                      >
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {bm.label}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-zinc-500">
                          Page {bm.pageNumber}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveBookmark(bm.pageNumber)}
                        className="p-1 text-zinc-400 hover:text-rose-500"
                        title="Remove bookmark"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2.5">
                Highlights & Margin Notes
              </h3>
              {book.highlights.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Select any sentence on a page to highlight it in 5 ink colours or attach a note.
                </p>
              ) : (
                <div className="space-y-3">
                  {book.highlights.map((hl) => (
                    <div
                      key={hl.id}
                      className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <button
                          type="button"
                          onClick={() => onJumpToPage(hl.pageNumber)}
                          className="font-mono font-semibold text-amber-600 dark:text-amber-400 hover:underline tabular-nums"
                        >
                          Page {hl.pageNumber}
                        </button>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: HIGHLIGHT_STYLES[hl.color].swatch }}
                          />
                          <button
                            type="button"
                            onClick={() => onDeleteHighlight(hl.id)}
                            className="text-zinc-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
                        “{hl.text}”
                      </p>
                      {hl.note && (
                        <div className="text-xs text-zinc-600 dark:text-zinc-400 pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                          Note: {hl.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6. AI READING COMPANION */}
        {drawer === 'ai' && (
          <div className="space-y-4">
            {/* Connection + Privacy / AI On-Off + Spoiler-Safe Controls */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-900/70 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                {user ? (
                  <div className="flex items-center gap-2 min-w-0">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'Google'}
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-full shrink-0"
                      />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {user.displayName || 'Google Connected'}
                      </div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {aiStatus.geminiConfigured
                          ? lastAiEngine
                            ? 'Gemini Active'
                            : 'Google Gemini Ready'
                          : 'Google Sync Connected'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        AI Reading Companion
                      </div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                        {aiStatus.geminiConfigured
                          ? 'Grounded in book excerpts'
                          : 'Requires server GEMINI_API_KEY'}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1.5 shrink-0">
                  {!user && (
                    <button
                      type="button"
                      disabled={isSigningIn}
                      onClick={() => void signInWithGoogle()}
                      title="Sign in with Google to sync library"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[10px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-60"
                    >
                      <LogIn className="w-3 h-3" />
                      <span>{isSigningIn ? '…' : 'Sign In'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ aiEnabled: !aiEnabled })}
                    title={aiEnabled ? 'Disable AI assistance' : 'Enable AI assistance'}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                      aiEnabled
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-zinc-300 dark:border-zinc-700 bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    <span>{aiEnabled ? 'AI On' : 'AI Off'}</span>
                  </button>
                </div>
              </div>

              {aiEnabled && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-200/70 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setSpoilerSafe((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      spoilerSafe
                        ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {spoilerSafe ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <ShieldOff className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                    <span>
                      {spoilerSafe
                        ? `Spoiler-safe: Up to Page ${currentPage}`
                        : 'Spoiler-safe Off (Full Book)'}
                    </span>
                  </button>

                  <span className="text-[10px] font-mono tabular-nums text-zinc-500">
                    p.{currentPage}/{book.totalPages}
                  </span>
                </div>
              )}
            </div>

            {!aiEnabled ? (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 text-center space-y-3">
                <Power className="w-7 h-7 mx-auto text-zinc-400" />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    AI Assistance Disabled
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Book passages are not sent to AI while disabled. All highlighting, notes,
                    bookmarks, offline reading, and flashcards remain active.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ aiEnabled: true })}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold"
                  >
                    Enable AI Assistance
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300"
                  >
                    Close Panel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* 8-Tab AI Feature Switcher */}
                <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                  {(
                    [
                      { id: 'recap', label: 'Catch Up', icon: <History className="w-3 h-3" /> },
                      {
                        id: 'ask',
                        label: 'Ask Book',
                        icon: <MessageCircleQuestion className="w-3 h-3" />,
                      },
                      { id: 'explain', label: 'Explain', icon: <Sparkles className="w-3 h-3" /> },
                      { id: 'characters', label: 'Story/Terms', icon: <Users className="w-3 h-3" /> },
                      { id: 'study', label: 'Study Quiz', icon: <GraduationCap className="w-3 h-3" /> },
                      { id: 'pdf', label: 'PDF Visual', icon: <FileImage className="w-3 h-3" /> },
                      { id: 'translate', label: 'Translate', icon: <Languages className="w-3 h-3" /> },
                      { id: 'insights', label: 'Page Notes', icon: <FileText className="w-3 h-3" /> },
                    ] as Array<{ id: AiStudioTab; label: string; icon: React.ReactNode }>
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setAiTab(t.id);
                        setAiError(null);
                      }}
                      className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap ${
                        aiTab === t.id
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      {t.icon}
                      <span className="truncate">{t.label}</span>
                    </button>
                  ))}
                </div>

                {aiError && (
                  <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300">
                    {aiError}
                  </div>
                )}

                {/* 1. SPOILER-SAFE RECAP ("Catch me up") */}
                {aiTab === 'recap' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                      {(
                        [
                          { id: 'short', label: 'Short Recap' },
                          { id: 'detailed', label: 'Detailed Recap' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setRecapDepth(opt.id)}
                          className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                            recapDepth === opt.id
                              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                              : 'text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => void runRecap(recapDepth)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <History className="w-4 h-4" />
                      )}
                      Catch me up ({spoilerSafe ? `Pages 1–${currentPage}` : 'Full Book'})
                    </button>

                    {recapResult && (
                      <div className="space-y-3 text-xs leading-relaxed">
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {recapResult.depth === 'detailed' ? 'Detailed Recap' : 'Quick Recap'}
                            </span>
                            <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400">
                              {recapResult.spoilerSafe
                                ? `Spoiler-safe ≤ p.${recapResult.upToPage}`
                                : 'Full book scope'}
                            </span>
                          </div>
                          <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                            {recapResult.summary}
                          </p>
                        </div>

                        {recapResult.keyEvents.length > 0 && (
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2.5">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              Key Events & Milestones
                            </div>
                            <div className="space-y-2">
                              {recapResult.keyEvents.map((ev, idx) => {
                                const pageNum = ev.reference
                                  ? extractFirstPageNumber(ev.reference)
                                  : null;
                                return (
                                  <div
                                    key={idx}
                                    className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 flex items-start justify-between gap-2"
                                  >
                                    <p className="text-zinc-700 dark:text-zinc-200 leading-relaxed">
                                      {ev.event}
                                    </p>
                                    {ev.reference && (
                                      <button
                                        type="button"
                                        disabled={!pageNum}
                                        onClick={() => pageNum && onJumpToPage(pageNum)}
                                        className={`text-[10px] font-mono shrink-0 mt-0.5 ${
                                          pageNum
                                            ? 'text-amber-600 dark:text-amber-400 hover:underline'
                                            : 'text-zinc-500'
                                        }`}
                                      >
                                        {ev.reference}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. ASK THE BOOK (Grounded Multi-Turn Q&A) */}
                {aiTab === 'ask' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Answer strictly from:
                      </div>
                      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                        {(
                          [
                            {
                              id: 'book',
                              label: spoilerSafe ? `Book (1–${currentPage})` : 'Full Book',
                            },
                            { id: 'chapter', label: 'Chapter' },
                            { id: 'selection', label: 'Selection' },
                          ] as const
                        ).map((sc) => (
                          <button
                            key={sc.id}
                            type="button"
                            onClick={() => setAskScope(sc.id)}
                            className={`py-1.5 px-1 text-[11px] font-medium rounded-lg transition-colors truncate ${
                              askScope === sc.id
                                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            {sc.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {askScope === 'selection' && (
                      <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 text-[11px]">
                        {selectedPassageText.trim() ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-amber-800 dark:text-amber-300 font-semibold">
                              <span>Selected Passage (Page {selectedPassagePage})</span>
                              <button
                                type="button"
                                onClick={() => setSelectedPassageText('')}
                                className="text-[10px] underline"
                              >
                                Clear
                              </button>
                            </div>
                            <p className="text-zinc-700 dark:text-zinc-300 line-clamp-3 italic">
                              “{selectedPassageText}”
                            </p>
                          </div>
                        ) : (
                          <span className="text-zinc-600 dark:text-zinc-400">
                            Select any text in the book and click <strong>Ask</strong>, or switch
                            scope to Chapter / Book.
                          </span>
                        )}
                      </div>
                    )}

                    <form onSubmit={runAsk} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={askQuestion}
                        onChange={(e) => setAskQuestion(e.target.value)}
                        placeholder={
                          askScope === 'selection'
                            ? 'Ask about the selected passage…'
                            : 'Ask anything grounded in this book…'
                        }
                        className="flex-1 px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="submit"
                        disabled={aiLoading || !askQuestion.trim()}
                        className="p-2 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 disabled:opacity-50"
                      >
                        {aiLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </button>
                    </form>

                    {askMessages.length === 0 ? (
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        Answers are strictly grounded in the book’s text—no web search or outside
                        facts. If a question isn’t supported up to your position, it will say so
                        clearly.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-zinc-500">
                            Conversation ({Math.ceil(askMessages.length / 2)})
                          </span>
                          <button
                            type="button"
                            onClick={() => setAskMessages([])}
                            className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                          >
                            Clear conversation
                          </button>
                        </div>
                        <div ref={askThreadRef} className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-1">
                          {askMessages.map((msg, idx) => (
                            <div
                              key={idx}
                              className={`rounded-xl border p-3 text-xs space-y-2 ${
                                msg.role === 'user'
                                  ? 'border-amber-200/80 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20'
                                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 text-[10px]">
                                <span
                                  className={`font-semibold ${
                                    msg.role === 'user'
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-zinc-700 dark:text-zinc-300'
                                  }`}
                                >
                                  {msg.role === 'user' ? 'You' : 'Book Answer'}
                                </span>
                                {msg.scopeLabel && (
                                  <span className="font-mono text-zinc-500">{msg.scopeLabel}</span>
                                )}
                              </div>

                              {msg.role === 'assistant' && msg.supportedByBook === false && (
                                <div className="inline-block px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                                  Not supported in current book excerpt
                                </div>
                              )}

                              <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                {msg.text}
                              </p>

                              {msg.citations && msg.citations.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                                  {msg.citations.map((cit, cIdx) => {
                                    const targetPg = extractFirstPageNumber(cit);
                                    return (
                                      <button
                                        key={cIdx}
                                        type="button"
                                        disabled={!targetPg}
                                        onClick={() => targetPg && onJumpToPage(targetPg)}
                                        className={`text-left px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] transition-colors ${
                                          targetPg
                                            ? 'text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50 cursor-pointer'
                                            : 'text-zinc-600 dark:text-zinc-300'
                                        }`}
                                      >
                                        <span className="font-mono font-medium">{cit}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. EXPLAIN, SIMPLIFY & TRANSLATE SELECTED TEXT */}
                {aiTab === 'explain' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Selected Passage {selectedPassagePage ? `(p.${selectedPassagePage})` : ''}
                        </label>
                        {activePageData && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPassageText(activePageData.rawText.slice(0, 800));
                              setSelectedPassagePage(activePageData.pageNumber);
                              setSelectedPassageChapter(activePageData.chapterTitle);
                            }}
                            className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
                          >
                            Use Page {currentPage} excerpt
                          </button>
                        )}
                      </div>
                      <textarea
                        rows={3}
                        value={selectedPassageText}
                        onChange={(e) => setSelectedPassageText(e.target.value)}
                        placeholder="Select text on a page and tap Explain / Example / Translate, or paste a passage here…"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Answer Language
                      </label>
                      <select
                        value={explainLang}
                        onChange={(e) => setExplainLang(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                      >
                        {LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'simple', label: 'Explain simply' },
                          { id: 'example', label: 'With example' },
                          { id: 'translate', label: 'Translate' },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          disabled={aiLoading || !selectedPassageText.trim()}
                          onClick={() => {
                            setExplainMode(m.id);
                            void executeExplainSelection(
                              selectedPassageText,
                              m.id,
                              explainLang,
                              selectedPassagePage || currentPage,
                              selectedPassageChapter || activePageData?.chapterTitle || ''
                            );
                          }}
                          className={`py-2 px-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${
                            explainMode === m.id
                              ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                              : 'border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {aiLoading && explainMode === m.id ? 'Working…' : m.label}
                        </button>
                      ))}
                    </div>

                    {explainResult && (
                      <div className="space-y-3 text-xs">
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                            <span>Original Passage</span>
                            <span className="font-mono">{explainResult.reference}</span>
                          </div>
                          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed italic whitespace-pre-wrap">
                            “{explainResult.originalText}”
                          </p>
                        </div>

                        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                            <span>
                              {explainResult.mode === 'simple'
                                ? 'Simple Explanation'
                                : explainResult.mode === 'example'
                                  ? 'Explanation with Example'
                                  : 'Translation'}
                            </span>
                            <span>{explainResult.targetLanguage}</span>
                          </div>
                          <p className="text-zinc-900 dark:text-zinc-100 leading-relaxed whitespace-pre-wrap">
                            {explainResult.resultText}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. CHARACTERS, TERMS & TIMELINE */}
                {aiTab === 'characters' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'overview', label: 'Characters & Terms' },
                          { id: 'relationships', label: 'Relationships' },
                          { id: 'timeline', label: 'Timeline' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={aiLoading}
                          onClick={() => void runCharactersTimeline(opt.id)}
                          className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition-colors disabled:opacity-50 ${
                            charQueryType === opt.id && charResult
                              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-zinc-950'
                              : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void runCharactersTimeline('lookup');
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={charQueryTerm}
                        onChange={(e) => setCharQueryTerm(e.target.value)}
                        placeholder="Who or what is… (character or key term)"
                        className="flex-1 px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="submit"
                        disabled={aiLoading || !charQueryTerm.trim()}
                        className="px-3 py-2 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold disabled:opacity-50"
                      >
                        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Look up'}
                      </button>
                    </form>

                    {charResult && (
                      <div className="space-y-3 text-xs leading-relaxed">
                        {!charResult.supportedByBook && (
                          <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                            Not found in the book content{' '}
                            {spoilerSafe ? `up to Page ${currentPage}` : 'available here'}.
                          </div>
                        )}

                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] text-zinc-500">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                              Summary
                            </span>
                            <span className="font-mono">
                              {spoilerSafe ? `Spoiler-safe ≤ p.${currentPage}` : 'Full Book'}
                            </span>
                          </div>
                          <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                            {charResult.summary}
                          </p>
                        </div>

                        {charResult.items.map((item, idx) => {
                          const targetPg = item.citation
                            ? extractFirstPageNumber(item.citation)
                            : null;
                          return (
                            <div
                              key={idx}
                              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  {item.nameOrEvent}
                                </span>
                                {item.citation && (
                                  <button
                                    type="button"
                                    disabled={!targetPg}
                                    onClick={() => targetPg && onJumpToPage(targetPg)}
                                    className={`text-[10px] font-mono shrink-0 ${
                                      targetPg
                                        ? 'text-amber-600 dark:text-amber-400 hover:underline'
                                        : 'text-zinc-500'
                                    }`}
                                  >
                                    {item.citation}
                                  </button>
                                )}
                              </div>
                              {item.roleOrSummary && (
                                <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                  {item.roleOrSummary}
                                </div>
                              )}
                              {item.relationshipOrDetail && (
                                <p className="text-zinc-600 dark:text-zinc-300">
                                  {item.relationshipOrDetail}
                                </p>
                              )}
                              {item.quote && (
                                <p className="text-[11px] italic text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                                  “{item.quote}”
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 5. AI STUDY MODE (Grounded Quizzes + Shortcut to Flashcard Deck) */}
                {aiTab === 'study' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Study Source (grounded strictly in selected book text)
                      </div>
                      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                        {(
                          [
                            { id: 'selection', label: 'Selection' },
                            { id: 'highlights', label: `Highlights (${book.highlights.length})` },
                            { id: 'page', label: `Page ${currentPage}` },
                          ] as const
                        ).map((src) => (
                          <button
                            key={src.id}
                            type="button"
                            onClick={() => setStudySource(src.id)}
                            className={`py-1.5 px-1 text-[11px] font-medium rounded-lg transition-colors truncate ${
                              studySource === src.id
                                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            {src.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {studySource === 'selection' && (
                      <textarea
                        rows={2}
                        value={selectedPassageText}
                        onChange={(e) => setSelectedPassageText(e.target.value)}
                        placeholder="Select text in the book or paste a passage to quiz yourself on…"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                      />
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={aiLoading}
                        onClick={() => void runStudyQuiz()}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                      >
                        {aiLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <GraduationCap className="w-4 h-4" />
                        )}
                        Generate Quiz
                      </button>

                      {onOpenStudyStudio && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenStudyStudio(
                              studySource === 'selection' ? selectedPassageText : undefined,
                              studySource === 'selection' ? selectedPassagePage : currentPage,
                              studySource === 'selection'
                                ? selectedPassageChapter
                                : activePageData?.chapterTitle
                            )
                          }
                          className="px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
                        >
                          Flashcards Deck →
                        </button>
                      )}
                    </div>

                    {(quizCache[quizActiveKey] ?? []).length > 0 && (
                      <div className="space-y-3">
                        {(quizCache[quizActiveKey] ?? []).map((q, qIdx) => {
                          const key = `${quizActiveKey}-${qIdx}`;
                          const chosen = quizAnswers[key];
                          const refPage = q.reference ? extractFirstPageNumber(q.reference) : null;
                          return (
                            <div
                              key={key}
                              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2.5 text-xs"
                            >
                              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {qIdx + 1}. {q.question}
                              </div>
                              <div className="space-y-1.5">
                                {q.options.map((opt, oIdx) => {
                                  const isChosen = chosen === oIdx;
                                  const isCorrect = q.correctIndex === oIdx;
                                  let cls =
                                    'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/70';
                                  if (chosen !== undefined) {
                                    if (isCorrect) {
                                      cls =
                                        'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200';
                                    } else if (isChosen) {
                                      cls =
                                        'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200';
                                    }
                                  }
                                  return (
                                    <button
                                      key={oIdx}
                                      type="button"
                                      onClick={() =>
                                        setQuizAnswers((prev) => ({ ...prev, [key]: oIdx }))
                                      }
                                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${cls}`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                              {chosen !== undefined && (
                                <div className="space-y-1 pt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                                  <div className="flex items-start gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                    <span>{q.explanation}</span>
                                  </div>
                                  {q.reference && (
                                    <button
                                      type="button"
                                      disabled={!refPage}
                                      onClick={() => refPage && onJumpToPage(refPage)}
                                      className="font-mono text-[10px] text-amber-600 dark:text-amber-400 hover:underline pl-5"
                                    >
                                      Ref: {q.reference}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => {
                            const qs = quizCache[quizActiveKey] ?? [];
                            const formatted = qs
                              .map(
                                (item, idx) =>
                                  `${idx + 1}. ${item.question}\nAnswer: ${item.options[item.correctIndex] ?? ''}\nWhy: ${item.explanation}${item.reference ? `\nReference: ${item.reference}` : ''}`
                              )
                              .join('\n\n');
                            onSaveStudyNote(
                              studySource === 'selection' ? selectedPassagePage : currentPage,
                              `Study Quiz (${studySource === 'highlights' ? 'Highlights' : `Page ${currentPage}`})`,
                              formatted
                            );
                            setQuizSavedKey(quizActiveKey);
                          }}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-emerald-500 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5" />
                          <span>
                            {quizSavedKey === quizActiveKey
                              ? 'Saved Quiz to Study Notes!'
                              : 'Save Quiz & Answers to Study Notes'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 6. EXPLAIN A PDF PAGE (Tables, Charts, Diagrams) */}
                {aiTab === 'pdf' && (
                  <div className="space-y-4">
                    {activePageData?.canvasDataUrl ? (
                      <>
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2.5 bg-zinc-50 dark:bg-zinc-900/60 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                            <span>PDF Page {activePageData.pageNumber} Snapshot Ready</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400">
                              Visual Input
                            </span>
                          </div>
                          <img
                            src={activePageData.canvasDataUrl}
                            alt={`PDF page ${activePageData.pageNumber}`}
                            className="w-full max-h-48 object-contain rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white"
                          />
                        </div>

                        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                          {(
                            [
                              { id: 'auto', label: 'All Visuals' },
                              { id: 'table', label: 'Table' },
                              { id: 'chart', label: 'Chart' },
                              { id: 'diagram', label: 'Diagram' },
                            ] as const
                          ).map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setPdfFocusType(f.id)}
                              className={`py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
                                pdfFocusType === f.id
                                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                  : 'text-zinc-600 dark:text-zinc-400'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>

                        <input
                          type="text"
                          value={pdfPrompt}
                          onChange={(e) => setPdfPrompt(e.target.value)}
                          placeholder="Optional question (e.g., What does the axis or table show?)"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />

                        <button
                          type="button"
                          disabled={aiLoading}
                          onClick={() => void runExplainPdfPage(pdfFocusType)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                        >
                          {aiLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileImage className="w-4 h-4" />
                          )}
                          Explain PDF Page {activePageData.pageNumber} Visuals
                        </button>

                        {pdfExplanation[activePageData.pageNumber] && (
                          <div className="space-y-3 text-xs leading-relaxed">
                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-amber-700 dark:text-amber-400">
                                  {pdfExplanation[activePageData.pageNumber].visualTypeDetected}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-500">
                                  {pdfExplanation[activePageData.pageNumber].reference}
                                </span>
                              </div>
                              <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                                {pdfExplanation[activePageData.pageNumber].explanation}
                              </p>
                            </div>

                            {pdfExplanation[activePageData.pageNumber].keyTakeaways.length > 0 && (
                              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-1.5">
                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  Key Visual Details
                                </div>
                                <ul className="space-y-1 text-zinc-600 dark:text-zinc-300">
                                  {pdfExplanation[activePageData.pageNumber].keyTakeaways.map(
                                    (pt, idx) => (
                                      <li key={idx} className="flex items-start gap-2">
                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                        <span>{pt}</span>
                                      </li>
                                    )
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-4 space-y-2.5 text-xs">
                        <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
                          <ImageOff className="w-4 h-4 text-zinc-500 shrink-0" />
                          <span>No Rendered PDF Page Image on Page {currentPage}</span>
                        </div>
                        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          Visual explanation of tables, charts, or diagrams requires a rendered PDF
                          page snapshot. Page {currentPage} of “{book.title}” only has extracted
                          text (common for built-in sample books, EPUB/TXT files, or text-dense PDF
                          pages beyond page 80).
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          Use <strong>Ask Book</strong> or <strong>Explain</strong> to analyze the
                          text on this page instead, or open an imported PDF page with a rendered
                          visual snapshot.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 7. FULL-BOOK & QUICK PAGE TRANSLATION */}
                {aiTab === 'translate' && (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-3.5 space-y-3">
                      <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        Convert Entire Book Language
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        Convert all {book.totalPages} pages into any language and switch between
                        editions anytime.
                      </p>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSwitchBookLanguage('original')}
                          className={`py-2 px-2.5 rounded-lg border text-xs font-medium transition-colors text-left flex items-center justify-between ${
                            activeLanguage === 'original'
                              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-zinc-950'
                              : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                          }`}
                        >
                          <span className="truncate">Original</span>
                          {activeLanguage === 'original' && (
                            <span className="text-[10px]">Active</span>
                          )}
                        </button>
                        {BOOK_LANGUAGE_OPTIONS.map((opt) => {
                          const readyEdition = book.translations?.[opt.code];
                          const isFullyReady =
                            readyEdition && Object.keys(readyEdition.pages).length >= book.totalPages;
                          const isActive = activeLanguage === opt.code;
                          return (
                            <button
                              key={opt.code}
                              type="button"
                              disabled={Boolean(translatingBook)}
                              onClick={() =>
                                isFullyReady
                                  ? onSwitchBookLanguage(opt.code)
                                  : onTranslateFullBook(opt.code)
                              }
                              className={`py-2 px-2.5 rounded-lg border text-xs font-medium transition-colors text-left flex items-center justify-between gap-1 ${
                                isActive
                                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-zinc-950'
                                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                              }`}
                            >
                              <span className="truncate">{opt.shortLabel}</span>
                              <span className="text-[10px] opacity-75 shrink-0">
                                {isActive ? 'Active' : isFullyReady ? 'Ready' : 'Convert'}
                              </span>
                            </button>
                          );
                        })}
                        {Object.entries(book.translations ?? {})
                          .filter(([code]) => !BOOK_LANGUAGE_OPTIONS.some((o) => o.code === code))
                          .map(([code, ed]) => {
                            const meta = resolveLanguageMeta(ed.label || code);
                            const isActive = activeLanguage === code;
                            const isFullyReady = Object.keys(ed.pages).length >= book.totalPages;
                            return (
                              <button
                                key={code}
                                type="button"
                                disabled={Boolean(translatingBook)}
                                onClick={() =>
                                  isFullyReady
                                    ? onSwitchBookLanguage(code)
                                    : onTranslateFullBook(ed.label || code)
                                }
                                className={`py-2 px-2.5 rounded-lg border text-xs font-medium transition-colors text-left flex items-center justify-between gap-1 ${
                                  isActive
                                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-zinc-950'
                                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                                }`}
                              >
                                <span className="truncate">{ed.label || meta.shortLabel}</span>
                                <span className="text-[10px] opacity-75 shrink-0">
                                  {isActive ? 'Active' : isFullyReady ? 'Ready' : 'Resume'}
                                </span>
                              </button>
                            );
                          })}
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const val = customFullBookLang.trim();
                          if (!val || translatingBook) return;
                          onTranslateFullBook(val);
                          setCustomFullBookLang('');
                        }}
                        className="flex items-center gap-1.5 pt-1"
                      >
                        <input
                          type="text"
                          value={customFullBookLang}
                          onChange={(e) => setCustomFullBookLang(e.target.value)}
                          placeholder="Any other language (e.g. Italian, Korean)..."
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <button
                          type="submit"
                          disabled={Boolean(translatingBook) || !customFullBookLang.trim()}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold disabled:opacity-45 shrink-0"
                        >
                          Convert
                        </button>
                      </form>

                      {translatingBook && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex justify-between text-[11px] font-mono tabular-nums text-amber-800 dark:text-amber-300">
                            <span>Converting to {translatingBook.label}…</span>
                            <span>
                              {translatingBook.current} / {translatingBook.total}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-amber-200 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full bg-amber-600 transition-all duration-200"
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
                        <div className="text-[11px] text-rose-600 dark:text-rose-400">
                          {bookTranslateError}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Quick Translate Page {currentPage} Only
                      </label>
                      <select
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                      >
                        {LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={runTranslate}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Languages className="w-4 h-4" />
                      )}
                      Translate Page
                    </button>

                    {translatedText && (
                      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                        {translatedText}
                      </div>
                    )}
                  </div>
                )}

                {/* 8. PAGE NOTES (Insights & Exam Cheat-Sheet) */}
                {aiTab === 'insights' && (
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <button
                        type="button"
                        disabled={aiLoading}
                        onClick={runPageInsights}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                      >
                        {aiLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        Analyze Page {currentPage}
                      </button>

                      {insightCache[currentPage] && (
                        <div className="space-y-3 text-xs leading-relaxed">
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-1.5">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              Summary
                            </div>
                            <p className="text-zinc-600 dark:text-zinc-300">
                              {insightCache[currentPage].summary}
                            </p>
                          </div>

                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              Key Takeaways
                            </div>
                            <ul className="space-y-1.5 text-zinc-600 dark:text-zinc-300">
                              {insightCache[currentPage].takeaways.map((item, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {insightCache[currentPage].glossary.length > 0 && (
                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2">
                              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                Key Terms
                              </div>
                              {insightCache[currentPage].glossary.map((g, i) => (
                                <div key={i} className="text-zinc-600 dark:text-zinc-300">
                                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                    {g.term}:{' '}
                                  </span>
                                  {g.definition}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                      <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        Exam Cheat-Sheet (Page {currentPage})
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                        {['English', 'Bengali (বাংলা)'].map((lang) => (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => setCheatLang(lang)}
                            className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                              cheatLang === lang
                                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        disabled={aiLoading}
                        onClick={runCheatSheet}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                      >
                        <FileText className="w-4 h-4" />
                        Build Cheat-Sheet (Page {currentPage})
                      </button>

                      {cheatCache[currentPage] && (
                        <div className="space-y-3 text-xs leading-relaxed">
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-1.5">
                            <div className="font-semibold text-amber-700 dark:text-amber-400">
                              {cheatCache[currentPage].title}
                            </div>
                            <p className="text-zinc-700 dark:text-zinc-300">
                              {cheatCache[currentPage].simpleExplanation}
                            </p>
                          </div>

                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              Exam Facts & Formulas
                            </div>
                            <ul className="space-y-1.5 text-zinc-600 dark:text-zinc-300">
                              {cheatCache[currentPage].examFacts.map((fact, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  <span>{fact}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const c = cheatCache[currentPage];
                              const body = `${c.simpleExplanation}\n\nKey Exam Facts:\n${c.examFacts
                                .map((f) => `- ${f}`)
                                .join('\n')}`;
                              onSaveStudyNote(currentPage, c.title, body);
                              setCheatSavedPage(currentPage);
                            }}
                            className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          >
                            <BookmarkCheck className="w-3.5 h-3.5" />
                            <span>
                              {cheatSavedPage === currentPage
                                ? 'Saved to Study Hub!'
                                : 'Save to Study Hub Cheat-Sheets'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

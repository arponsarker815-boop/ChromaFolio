import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  BookmarkCheck,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  HelpCircle,
  Layers,
  Loader2,
  LogIn,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { useAppAuth } from '../contexts/AppAuthContext';
import { AiQuizQuestion, EbookDocument, FlashcardItem } from '../types/ebook';
import { ambientAudio } from '../utils/ambientAudio';
import { exportFlashcardsAsCsv, exportNotesAsMarkdown } from '../utils/exporters';

interface StudyToolsDrawerProps {
  book: EbookDocument;
  currentPage: number;
  activeLanguageLabel?: string;
  timerSecondsLeft: number;
  timerPresetMinutes: number;
  timerRunning: boolean;
  timerBellEnabled: boolean;
  onClose: () => void;
  onJumpToPage: (pageNumber: number) => void;
  onAddFlashcard: (front: string, back: string, pageNumber: number) => void;
  onAddFlashcardsBulk: (
    cards: Array<{
      front: string;
      back: string;
      concept?: string;
      hint?: string;
      pageNumber?: number;
    }>,
    fallbackPageNumber: number
  ) => void;
  onToggleMastered: (id: string) => void;
  onRateFlashcard: (id: string, rating: 'again' | 'good' | 'mastered') => void;
  onDeleteFlashcard: (id: string) => void;
  onDeleteStudyNote: (id: string) => void;
  onSaveStudyNote?: (pageNumber: number, title: string, content: string) => void;
  selectedPassage?: {
    text: string;
    pageNumber: number;
    chapterTitle: string;
    triggerId: number;
  } | null;
  aiEnabled?: boolean;
  onToggleTimer: () => void;
  onResetTimer: (minutes: number) => void;
  onToggleBell: () => void;
}

type GeneratorScope = 'selection' | 'highlights' | 'page' | 'chapter' | 'book';
type GeneratorFocus = 'concepts' | 'formulas' | 'exam';

export const StudyToolsDrawer: React.FC<StudyToolsDrawerProps> = ({
  book,
  currentPage,
  activeLanguageLabel = 'original',
  timerSecondsLeft,
  timerPresetMinutes,
  timerRunning,
  timerBellEnabled,
  onClose,
  onJumpToPage,
  onAddFlashcard,
  onAddFlashcardsBulk,
  onToggleMastered,
  onRateFlashcard,
  onDeleteFlashcard,
  onDeleteStudyNote,
  onSaveStudyNote,
  selectedPassage = null,
  aiEnabled = true,
  onToggleTimer,
  onResetTimer,
  onToggleBell,
}) => {
  const {
    user,
    isSigningIn,
    signInWithGoogle,
    getAuthHeaders,
  } = useAppAuth();
  const [tab, setTab] = useState<'flashcards' | 'timer' | 'sheets'>('flashcards');
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'review'>('all');
  const [addingCard, setAddingCard] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');

  // AI Study Mode configuration (Flashcards + Short Quizzes from Selected Passage / Highlights / Book)
  const [studyModeType, setStudyModeType] = useState<'flashcards' | 'quiz'>('flashcards');
  const [scope, setScope] = useState<GeneratorScope>(() =>
    selectedPassage?.text ? 'selection' : (book.highlights?.length ?? 0) > 0 ? 'highlights' : 'page'
  );
  const [focusMode, setFocusMode] = useState<GeneratorFocus>('concepts');
  const [cardCount, setCardCount] = useState<5 | 8 | 12>(5);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [lastGeneratedSummary, setLastGeneratedSummary] = useState<string | null>(null);
  const [shuffledOrder, setShuffledOrder] = useState<string[] | null>(null);
  const [studyQuiz, setStudyQuiz] = useState<AiQuizQuestion[]>([]);
  const [studyQuizAnswers, setStudyQuizAnswers] = useState<Record<number, number>>({});
  const [quizSaved, setQuizSaved] = useState(false);

  useEffect(() => {
    if (selectedPassage?.text) {
      setScope('selection');
      setTab('flashcards');
    }
  }, [selectedPassage?.triggerId, selectedPassage?.text]);

  const flashcards = book.flashcards ?? [];
  const studyNotes = book.studyNotes ?? [];

  const deck = useMemo(() => {
    let items: FlashcardItem[] =
      filterMode === 'review' ? flashcards.filter((f) => !f.mastered) : flashcards;
    if (shuffledOrder && shuffledOrder.length > 0) {
      const orderMap = new Map(shuffledOrder.map((id, i) => [id, i]));
      items = [...items].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
    }
    return items;
  }, [flashcards, filterMode, shuffledOrder]);

  const safeIndex = deck.length > 0 ? Math.min(cardIndex, deck.length - 1) : 0;
  const activeCard = deck[safeIndex] ?? null;
  const masteredCount = flashcards.filter((f) => f.mastered).length;

  const activePageData = useMemo(
    () => book.pages.find((p) => p.pageNumber === currentPage) ?? book.pages[0],
    [book.pages, currentPage]
  );

  const buildBookExcerpts = (selectedScope: GeneratorScope) => {
    const pagesWithText = book.pages.filter((p) => p.rawText.trim().length >= 20);
    if (selectedScope === 'page') {
      const target = activePageData && activePageData.rawText.trim().length >= 15 ? [activePageData] : [];
      return target.map((p) => ({
        pageNumber: p.pageNumber,
        chapterTitle: p.chapterTitle,
        text: p.rawText.slice(0, 6000),
      }));
    }

    if (selectedScope === 'chapter') {
      const currentChapter = activePageData?.chapterTitle;
      const chapterPages = pagesWithText.filter((p) => p.chapterTitle === currentChapter);
      const source = chapterPages.length > 0 ? chapterPages : pagesWithText.slice(0, 5);
      const perPageCap = Math.max(900, Math.floor(16000 / Math.max(1, source.length)));
      return source.slice(0, 12).map((p) => ({
        pageNumber: p.pageNumber,
        chapterTitle: p.chapterTitle,
        text: p.rawText.slice(0, perPageCap),
      }));
    }

    // Whole Book: sample evenly across all chapters/pages so every part of the book is represented
    const totalAvailable = pagesWithText.length;
    if (totalAvailable === 0) return [];
    const maxSamplePages = 12;
    let sampled = pagesWithText;
    if (totalAvailable > maxSamplePages) {
      const step = totalAvailable / maxSamplePages;
      sampled = Array.from({ length: maxSamplePages }, (_, i) =>
        pagesWithText[Math.min(totalAvailable - 1, Math.floor(i * step))]
      );
    }
    const perPageCap = Math.max(800, Math.floor(16500 / sampled.length));
    return sampled.map((p) => ({
      pageNumber: p.pageNumber,
      chapterTitle: p.chapterTitle,
      text: p.rawText.slice(0, perPageCap),
    }));
  };

  const handleGenerateAiFlashcards = async () => {
    if (!aiEnabled) {
      setCardError('AI assistance is currently disabled in Reader settings.');
      return;
    }

    if (scope === 'selection' && (!selectedPassage?.text || selectedPassage.text.trim().length < 15)) {
      setCardError('Select a passage on any book page first, or choose Highlights / Page / Chapter.');
      return;
    }
    if (scope === 'highlights' && book.highlights.length === 0) {
      setCardError('You have no saved highlights yet. Highlight sentences in the book or choose Page / Selection.');
      return;
    }

    const excerpts =
      scope === 'selection' || scope === 'highlights' ? [] : buildBookExcerpts(scope);
    if (scope !== 'selection' && scope !== 'highlights' && excerpts.length === 0) {
      setCardError('Not enough text in this selection to extract flashcards.');
      return;
    }

    setGeneratingCards(true);
    setCardError(null);
    setLastGeneratedSummary(null);

    try {
      const authHeaders = await getAuthHeaders();
      const targetPageNum =
        scope === 'selection' && selectedPassage ? selectedPassage.pageNumber : currentPage;

      if (studyModeType === 'quiz') {
        const res = await fetch('/api/ai/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            sourceType:
              scope === 'selection'
                ? 'selection'
                : scope === 'highlights'
                  ? 'highlights'
                  : 'page',
            selectedText: selectedPassage?.text,
            highlights: book.highlights.map((h) => ({
              pageNumber: h.pageNumber,
              text: h.text,
              note: h.note,
            })),
            pageText: excerpts.map((e) => `[Page ${e.pageNumber} — ${e.chapterTitle}]\n${e.text}`).join('\n\n'),
            bookTitle: book.title,
            pageNumber: targetPageNum,
            questionCount: Math.min(cardCount, 5),
            targetLanguage: activeLanguageLabel,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not generate study quiz');
        const qs: AiQuizQuestion[] = Array.isArray(data.questions) ? data.questions : [];
        setStudyQuiz(qs);
        setStudyQuizAnswers({});
        setQuizSaved(false);
        setLastGeneratedSummary(
          `Created a ${qs.length}-question grounded quiz from ${
            scope === 'selection'
              ? `selected text (Page ${targetPageNum})`
              : scope === 'highlights'
                ? 'your saved highlights'
                : `Page ${currentPage}`
          }.`
        );
        return;
      }

      const res = await fetch('/api/ai/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          excerpts,
          selectedText: selectedPassage?.text,
          highlights: book.highlights.map((h) => ({
            pageNumber: h.pageNumber,
            text: h.text,
            note: h.note,
          })),
          bookTitle: book.title,
          pageNumber: targetPageNum,
          scope,
          cardCount,
          focusMode,
          targetLanguage: activeLanguageLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate flashcards');
      if (Array.isArray(data.cards) && data.cards.length > 0) {
        onAddFlashcardsBulk(data.cards, targetPageNum);
        setFilterMode('all');
        setShuffledOrder(null);
        setCardIndex(0);
        setFlipped(false);
        setHintShown(false);
        setLastGeneratedSummary(
          `Saved ${data.cards.length} ${focusMode} flashcards from ${
            scope === 'selection'
              ? `selected passage (Page ${targetPageNum})`
              : scope === 'highlights'
                ? 'your saved highlights'
                : scope === 'book'
                  ? 'the entire book'
                  : scope === 'chapter'
                    ? 'this chapter'
                    : `Page ${currentPage}`
          }.`
        );
      } else {
        setCardError('No flashcards could be extracted from this passage.');
      }
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Study generation failed');
    } finally {
      setGeneratingCards(false);
    }
  };

  const handleCreateCustomCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFront.trim() || !newBack.trim()) return;
    onAddFlashcard(newFront.trim(), newBack.trim(), currentPage);
    setNewFront('');
    setNewBack('');
    setAddingCard(false);
  };

  const handleShuffle = () => {
    const ids = [...flashcards.map((f) => f.id)].sort(() => Math.random() - 0.5);
    setShuffledOrder(ids);
    setCardIndex(0);
    setFlipped(false);
    setHintShown(false);
  };

  const advanceCard = () => {
    setFlipped(false);
    setHintShown(false);
    if (deck.length > 0) {
      setCardIndex((i) => (i + 1) % deck.length);
    }
  };

  const formatClock = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const timerPct = Math.round(
    ((timerPresetMinutes * 60 - timerSecondsLeft) / Math.max(1, timerPresetMinutes * 60)) * 100
  );

  return (
    <aside className="no-print fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-white dark:bg-[#12151E] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <GraduationCap className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              Study Studio
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close study studio"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-4 shrink-0">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setTab('flashcards')}
            className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              tab === 'flashcards'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Flashcards ({flashcards.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('timer')}
            className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap tabular-nums ${
              tab === 'timer'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Timer · {formatClock(timerSecondsLeft)}
          </button>
          <button
            type="button"
            onClick={() => setTab('sheets')}
            className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              tab === 'sheets'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Cheat-Sheets ({studyNotes.length})
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto studio-scroll p-5 space-y-5">
        {/* TAB 1: AI FLASHCARD GENERATOR & ACTIVE RECALL DECK */}
        {tab === 'flashcards' && (
          <div className="space-y-4">
            {/* AI Key-Concept Extractor Box */}
            <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>AI Key-Concept Generator</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddingCard((v) => !v)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  <span>Manual</span>
                </button>
              </div>

              {/* Google Sign-In & Google Gemini AI Status */}
              <div className="flex items-center justify-between gap-2 rounded-xl bg-white/85 dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 p-2">
                {user ? (
                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 truncate">
                    {user.displayName?.split(' ')[0] || 'Google'} · Connected
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={isSigningIn}
                    onClick={() => void signInWithGoogle()}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-60"
                  >
                    <LogIn className="w-3 h-3" />
                    <span>{isSigningIn ? 'Signing in…' : 'Sign in with Google'}</span>
                  </button>
                )}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-[10px] font-semibold shrink-0">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Google Gemini</span>
                </span>
              </div>

              {/* Mode Toggle: Flashcards vs Short Quiz */}
              <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-white/85 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setStudyModeType('flashcards')}
                  className={`py-1 text-[11px] font-semibold rounded-md transition-colors ${
                    studyModeType === 'flashcards'
                      ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Flashcards
                </button>
                <button
                  type="button"
                  onClick={() => setStudyModeType('quiz')}
                  className={`py-1 text-[11px] font-semibold rounded-md transition-colors ${
                    studyModeType === 'quiz'
                      ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Short Quiz
                </button>
              </div>

              {/* Extraction Scope */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Study Content Source
                </div>
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-white/80 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setScope('selection')}
                    className={`py-1 px-2 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                      scope === 'selection'
                        ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    Selected Text {selectedPassage?.text ? '✓' : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('highlights')}
                    className={`py-1 px-2 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                      scope === 'highlights'
                        ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    Highlights ({book.highlights.length})
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-white/80 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800">
                  {(
                    [
                      { id: 'page', label: `Page ${currentPage}` },
                      { id: 'chapter', label: 'Chapter' },
                      { id: 'book', label: 'Whole Book' },
                    ] as Array<{ id: GeneratorScope; label: string }>
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setScope(item.id)}
                      className={`py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                        scope === item.id
                          ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {scope === 'selection' && selectedPassage?.text && (
                  <div className="rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-300 line-clamp-2">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      p.{selectedPassage.pageNumber}:
                    </span>{' '}
                    “{selectedPassage.text}”
                  </div>
                )}
              </div>

              {/* Recall Focus & Count */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                    Focus
                  </div>
                  <select
                    value={focusMode}
                    onChange={(e) => setFocusMode(e.target.value as GeneratorFocus)}
                    className="w-full px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="concepts">Key Concepts</option>
                    <option value="formulas">Formulas & Rules</option>
                    <option value="exam">Exam Q&A</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                    {studyModeType === 'quiz' ? 'Questions' : 'Cards'}
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-white/80 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800">
                    {([5, 8, 12] as const).map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setCardCount(cnt)}
                        className={`py-1 text-[11px] font-mono tabular-nums font-medium rounded-md transition-colors ${
                          cardCount === cnt
                            ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {studyModeType === 'quiz' ? Math.min(cnt, 5) : cnt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={generatingCards || !aiEnabled}
                onClick={handleGenerateAiFlashcards}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {generatingCards ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>
                  {generatingCards
                    ? 'Generating from book text…'
                    : studyModeType === 'quiz'
                      ? `Generate ${Math.min(cardCount, 5)}-Question Quiz`
                      : `Generate ${cardCount} Active-Recall Cards`}
                </span>
              </button>

              {lastGeneratedSummary && (
                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                  {lastGeneratedSummary}
                </div>
              )}
            </div>

            {studyModeType === 'quiz' && studyQuiz.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Study Quiz ({studyQuiz.length} Questions)
                  </span>
                  {onSaveStudyNote && (
                    <button
                      type="button"
                      onClick={() => {
                        const md = studyQuiz
                          .map(
                            (q, i) =>
                              `${i + 1}. ${q.question}\nAnswer: ${q.options[q.correctIndex]}\nWhy: ${
                                q.explanation
                              }${q.reference ? `\nRef: ${q.reference}` : ''}`
                          )
                          .join('\n\n');
                        onSaveStudyNote(
                          selectedPassage?.pageNumber ?? currentPage,
                          `Study Quiz (${scope})`,
                          md
                        );
                        setQuizSaved(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      <BookmarkCheck className="w-3.5 h-3.5" />
                      <span>{quizSaved ? 'Saved to Notes' : 'Save Quiz'}</span>
                    </button>
                  )}
                </div>

                {studyQuiz.map((q, qIdx) => {
                  const chosen = studyQuizAnswers[qIdx];
                  return (
                    <div
                      key={qIdx}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-2 text-xs"
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
                                setStudyQuizAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                              }
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-colors ${cls}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {chosen !== undefined && (
                        <div className="pt-1 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                          <div className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{q.explanation}</span>
                          </div>
                          {q.reference && (
                            <div className="text-[10px] font-mono text-amber-700 dark:text-amber-400">
                              Ref: {q.reference}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {cardError && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300">
                {cardError}
              </div>
            )}

            {addingCard && (
              <form
                onSubmit={handleCreateCustomCard}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2.5 bg-zinc-50 dark:bg-zinc-900/60"
              >
                <input
                  type="text"
                  value={newFront}
                  onChange={(e) => setNewFront(e.target.value)}
                  placeholder="Question or Term (Front)..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <textarea
                  rows={2}
                  value={newBack}
                  onChange={(e) => setNewBack(e.target.value)}
                  placeholder="Answer or Definition (Back)..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAddingCard(false)}
                    className="px-3 py-1.5 text-xs text-zinc-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold"
                  >
                    Save Card
                  </button>
                </div>
              </form>
            )}

            {flashcards.length > 0 && (
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="tabular-nums">
                  {masteredCount} of {flashcards.length} mastered
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode(filterMode === 'all' ? 'review' : 'all');
                      setCardIndex(0);
                      setFlipped(false);
                      setHintShown(false);
                    }}
                    className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px]"
                  >
                    {filterMode === 'all' ? 'All Cards' : 'Needs Review'}
                  </button>
                  <button
                    type="button"
                    onClick={handleShuffle}
                    title="Shuffle deck"
                    className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <Shuffle className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => exportFlashcardsAsCsv(book)}
                    title="Export Anki / Quizlet CSV"
                    className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Active Flip Card */}
            {activeCard ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-zinc-900 dark:to-zinc-800/80 p-5 flex flex-col justify-between min-h-[210px] transition-all">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-amber-700 dark:text-amber-400 w-full">
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <span>{flipped ? 'ANSWER' : 'RECALL'}</span>
                      {activeCard.concept && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans font-semibold truncate">
                            {activeCard.concept}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onJumpToPage(activeCard.pageNumber)}
                        title={`Jump to Page ${activeCard.pageNumber}`}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <span>p.{activeCard.pageNumber}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                      <span>
                        {safeIndex + 1}/{deck.length}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFlipped((f) => !f)}
                    className="my-4 text-left text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed focus:outline-none"
                  >
                    {flipped ? activeCard.back : activeCard.front}
                  </button>

                  {!flipped && activeCard.hint && (
                    <div className="mb-2">
                      {hintShown ? (
                        <div className="text-xs text-amber-800 dark:text-amber-300 bg-white/70 dark:bg-zinc-950/50 rounded-lg px-2.5 py-1.5 border border-amber-200/70 dark:border-amber-900/50">
                          Hint: {activeCard.hint}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setHintShown(true)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:underline"
                        >
                          <HelpCircle className="w-3 h-3" />
                          <span>Need a hint?</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                    <button
                      type="button"
                      onClick={() => setFlipped((f) => !f)}
                      className="hover:text-zinc-900 dark:hover:text-zinc-100 font-medium"
                    >
                      {flipped ? 'Show question' : 'Reveal answer'}
                    </button>
                    <span>{activeCard.mastered ? 'Mastered' : 'In Review'}</span>
                  </div>
                </div>

                {/* Active Recall Self-Rating Controls */}
                {flipped ? (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onRateFlashcard(activeCard.id, 'again');
                        advanceCard();
                      }}
                      className="py-2 px-2 rounded-xl border border-rose-300 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:opacity-90"
                    >
                      Again
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRateFlashcard(activeCard.id, 'good');
                        advanceCard();
                      }}
                      className="py-2 px-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:opacity-90"
                    >
                      Good
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRateFlashcard(activeCard.id, 'mastered');
                        advanceCard();
                      }}
                      className="inline-flex items-center justify-center gap-1 py-2 px-2 rounded-xl border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:opacity-90"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mastered</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onToggleMastered(activeCard.id);
                        advanceCard();
                      }}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                        activeCard.mastered
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{activeCard.mastered ? 'Mastered' : 'Mark Mastered'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlipped(true)}
                      className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold"
                    >
                      Flip Card
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center space-y-2">
                <Layers className="w-6 h-6 text-zinc-400 mx-auto" />
                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {filterMode === 'review' && flashcards.length > 0
                    ? 'All cards mastered!'
                    : 'No flashcards yet'}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Choose Whole Book, Chapter, or Page above to automatically extract key-concept flashcards for active recall.
                </p>
              </div>
            )}

            {/* Deck List */}
            {flashcards.length > 0 && (
              <div className="pt-2 space-y-2">
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Saved Recall Deck ({flashcards.length})
                </div>
                {flashcards.map((fc, idx) => (
                  <div
                    key={fc.id}
                    className="flex items-start justify-between gap-2 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFilterMode('all');
                        setShuffledOrder(null);
                        setCardIndex(idx);
                        setFlipped(false);
                        setHintShown(false);
                      }}
                      className="text-left min-w-0 flex-1 space-y-0.5"
                    >
                      <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {fc.front}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums truncate">
                        {fc.concept ? `${fc.concept} · ` : ''}Page {fc.pageNumber} ·{' '}
                        {fc.mastered ? 'Mastered' : 'Learning'}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteFlashcard(fc.id)}
                      className="p-1 text-zinc-400 hover:text-rose-500 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: POMODORO STUDY TIMER */}
        {tab === 'timer' && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 text-center space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Timer className="w-3.5 h-3.5 text-amber-500" />
                  Focus Sprint
                </span>
                <button
                  type="button"
                  onClick={onToggleBell}
                  className="inline-flex items-center gap-1 text-[11px] hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  {timerBellEnabled ? (
                    <>
                      <Bell className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Chime On</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-3.5 h-3.5" />
                      <span>Muted</span>
                    </>
                  )}
                </button>
              </div>

              <div className="font-mono tabular-nums text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {formatClock(timerSecondsLeft)}
              </div>

              <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, timerPct))}%` }}
                />
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onToggleTimer}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold"
                >
                  {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{timerRunning ? 'Pause Sprint' : 'Start Focus'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onResetTimer(timerPresetMinutes)}
                  title="Reset timer"
                  className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">
                Sprint Presets
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { mins: 25, label: '25m Focus' },
                  { mins: 50, label: '50m Deep' },
                  { mins: 5, label: '5m Break' },
                ].map((p) => (
                  <button
                    key={p.mins}
                    type="button"
                    onClick={() => onResetTimer(p.mins)}
                    className={`py-2 rounded-xl border text-xs font-medium transition-colors tabular-nums ${
                      timerPresetMinutes === p.mins
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 text-xs">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                Book Study Progress
              </div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 tabular-nums">
                <span>Logged Study Time</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                  {book.studyMinutes ?? 0} mins
                </span>
              </div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 tabular-nums">
                <span>Flashcards Mastered</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                  {masteredCount} / {flashcards.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => ambientAudio.playTimerChime()}
                className="w-full mt-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Test Completion Chime
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: SAVED CHEAT-SHEETS */}
        {tab === 'sheets' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Saved exam cheat-sheets & simplified notes
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

            {studyNotes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center space-y-2">
                <FileText className="w-6 h-6 text-zinc-400 mx-auto" />
                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  No cheat-sheets saved yet
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Open AI Studio → Cheat-Sheet to extract exam formulas, dates, and simple explanations and save them here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {studyNotes.map((sn) => (
                  <div
                    key={sn.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onJumpToPage(sn.pageNumber)}
                        className="font-semibold text-amber-600 dark:text-amber-400 hover:underline text-left truncate"
                      >
                        {sn.title} · p.{sn.pageNumber}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteStudyNote(sn.id)}
                        className="text-zinc-400 hover:text-rose-500 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      {sn.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

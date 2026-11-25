import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Eye,
  GraduationCap,
  Highlighter,
  Languages,
  Layers,
  MessageCircleQuestion,
  MessageSquarePlus,
  Palette,
  Shapes,
  Sparkles,
} from 'lucide-react';
import {
  HEADING_COLOR_PRESETS,
  HIGHLIGHT_STYLES,
  WORD_COLOR_PRESETS,
  getThemeForPage,
} from '../data/palettes';
import {
  AiSelectionActionMode,
  AiSelectionRequest,
  EbookBlock,
  EbookPage,
  HighlightColor,
  HighlightItem,
  PageVisualStyle,
  PaletteId,
  ReaderFont,
  ReaderSettings,
} from '../types/ebook';
import { TOPIC_CATALOG, detectPageTopic, findAutoHighlights } from '../utils/topicGraphics';
import { TopicIllustration } from './TopicIllustration';

interface ColourfulPageProps {
  page: EbookPage;
  totalPages: number;
  bookTitle: string;
  paletteId: PaletteId;
  bookVisualStyle: PageVisualStyle;
  settings: ReaderSettings;
  highlights: HighlightItem[];
  isBookmarked: boolean;
  searchQuery?: string;
  activeTtsBlockIndex?: number | null;
  activeHighlighterPen?: HighlightColor | null;
  isTranslated?: boolean;
  isRtl?: boolean;
  isFullscreen?: boolean;
  spineSide?: 'left' | 'right' | 'single' | 'none';
  onCornerTurn?: (direction: 1 | -1) => void;
  onToggleBookmark: (pageNumber: number) => void;
  onAddHighlight: (pageNumber: number, text: string, color: HighlightColor, note?: string) => void;
  onRemoveHighlightByText?: (pageNumber: number, text: string) => void;
  onCyclePageTheme: (pageNumber: number) => void;
  onCyclePageVisualStyle: (pageNumber: number) => void;
  onCyclePageTopic: (pageNumber: number) => void;
  onCreateFlashcard: (pageNumber: number, front: string, back: string) => void;
  aiEnabled?: boolean;
  onAiSelectionAction?: (req: AiSelectionRequest) => void;
  onAskSelection?: (text: string, pageNumber: number, chapterTitle: string) => void;
  onStudySelection?: (text: string, pageNumber: number, chapterTitle: string) => void;
  onExplainBlockItem?: (block: EbookBlock, pageNumber: number) => void;
  onInspectOriginalScan?: (scanPageId: string, pageNumber: number, block?: EbookBlock) => void;
}

interface SelectionMenuState {
  text: string;
  x: number;
  y: number;
  placeBelow?: boolean;
}

export const ColourfulPage: React.FC<ColourfulPageProps> = ({
  page,
  totalPages,
  bookTitle,
  paletteId,
  bookVisualStyle,
  settings,
  highlights,
  isBookmarked,
  searchQuery,
  activeTtsBlockIndex,
  activeHighlighterPen = null,
  isTranslated = false,
  isRtl = false,
  isFullscreen = false,
  spineSide = 'none',
  onCornerTurn,
  onToggleBookmark,
  onAddHighlight,
  onRemoveHighlightByText,
  onCyclePageTheme,
  onCyclePageVisualStyle,
  onCyclePageTopic,
  onCreateFlashcard,
  aiEnabled = true,
  onAiSelectionAction,
  onAskSelection,
  onStudySelection,
  onExplainBlockItem,
  onInspectOriginalScan,
}) => {
  const theme = useMemo(
    () => getThemeForPage(paletteId, page.pageNumber, page.customThemeIndex),
    [paletteId, page.pageNumber, page.customThemeIndex]
  );

  // Resolve user-customized word (ink) colour and heading/accent colour
  const resolvedInkColor = useMemo(() => {
    const id = settings.textColorId ?? 'auto';
    if (id === 'custom' && settings.customTextColor) return settings.customTextColor;
    const preset = WORD_COLOR_PRESETS.find((p) => p.id === id);
    return preset?.hex ?? theme.inkColor;
  }, [settings.textColorId, settings.customTextColor, theme.inkColor]);

  const resolvedAccentColor = useMemo(() => {
    const id = settings.headingColorId ?? 'auto';
    if (id === 'custom' && settings.customHeadingColor) return settings.customHeadingColor;
    const preset = HEADING_COLOR_PRESETS.find((p) => p.id === id);
    return preset?.hex ?? theme.accentColor;
  }, [settings.headingColorId, settings.customHeadingColor, theme.accentColor]);

  const detectedTopic = useMemo(() => detectPageTopic(page), [page]);

  const resolvedVisualStyle: Exclude<PageVisualStyle, 'auto'> = useMemo(() => {
    if (page.customVisualStyle) return page.customVisualStyle;
    if (bookVisualStyle !== 'auto') return bookVisualStyle;
    // In 'auto' mode, alternate Cartoon and Infographic across pages based on topic
    return page.pageNumber % 2 === 1 ? 'cartoon' : 'infographic';
  }, [page.customVisualStyle, page.pageNumber, bookVisualStyle]);

  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState | null>(null);
  const [noteInputOpen, setNoteInputOpen] = useState(false);
  const [cardInputOpen, setCardInputOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [cardFrontDraft, setCardFrontDraft] = useState('');
  const [pendingColor, setPendingColor] = useState<HighlightColor>('amber');
  const [rulerY, setRulerY] = useState<number | null>(null);

  const pageHighlights = useMemo(
    () => highlights.filter((h) => h.pageNumber === page.pageNumber),
    [highlights, page.pageNumber]
  );

  const fontClassMap: Record<ReaderFont, string> = {
    serif: 'font-book-serif',
    classic: 'font-book-classic',
    literary: 'font-book-literary',
    editorial: 'font-book-editorial',
    sans: 'font-book-sans',
    humanist: 'font-book-humanist',
    mono: 'font-book-mono text-[0.94em]',
    indic: 'font-book-indic',
    'indic-serif': 'font-book-indic-serif',
    dyslexic: 'font-book-sans tracking-[0.03em] word-spacing-[0.08em]',
  };
  const fontClass = fontClassMap[settings.font] ?? 'font-book-serif';

  const letterSpacingValue =
    settings.letterSpacing === 'tight'
      ? '-0.015em'
      : settings.letterSpacing === 'relaxed'
        ? '0.02em'
        : settings.letterSpacing === 'wide'
          ? '0.045em'
          : undefined;

  const inspectSelection = (containerEl: HTMLElement) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    if (selectedText.length >= 2 && selection && selection.rangeCount > 0) {
      const containerRect = containerEl.getBoundingClientRect();
      const range = selection.getRangeAt(0);
      if (!containerEl.contains(range.commonAncestorContainer)) {
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect && (rect.width > 0 || rect.height > 0)) {
        const minHalf = Math.min(135, Math.max(90, containerRect.width / 2 - 8));
        const relX = Math.min(
          Math.max(minHalf, rect.left - containerRect.left + rect.width / 2),
          Math.max(minHalf, containerRect.width - minHalf)
        );
        const topOffset = rect.top - containerRect.top;
        const placeBelow = topOffset < 96;
        const relY = placeBelow
          ? Math.min(containerRect.height - 64, rect.bottom - containerRect.top + 10)
          : Math.max(54, topOffset - 10);
        setSelectionMenu({ text: selectedText, x: relX, y: relY, placeBelow });
        setNoteInputOpen(false);
        setCardInputOpen(false);
      }
    } else if (!noteInputOpen && !cardInputOpen) {
      setSelectionMenu(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    inspectSelection(e.currentTarget);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    window.setTimeout(() => inspectSelection(el), 70);
  };

  const applyHighlight = (color: HighlightColor, withNote = false) => {
    if (!selectionMenu) return;
    if (withNote) {
      setPendingColor(color);
      setCardInputOpen(false);
      setNoteInputOpen(true);
      return;
    }
    onAddHighlight(page.pageNumber, selectionMenu.text, color);
    window.getSelection()?.removeAllRanges();
    setSelectionMenu(null);
  };

  const saveHighlightWithNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectionMenu) return;
    onAddHighlight(page.pageNumber, selectionMenu.text, pendingColor, noteDraft.trim() || undefined);
    setNoteDraft('');
    setNoteInputOpen(false);
    setSelectionMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const saveSelectionFlashcard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectionMenu) return;
    const prompt = cardFrontDraft.trim() || `Key idea from Page ${page.pageNumber}`;
    onCreateFlashcard(page.pageNumber, prompt, selectionMenu.text);
    setCardFrontDraft('');
    setCardInputOpen(false);
    setSelectionMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const triggerAiSelection = (mode: AiSelectionActionMode) => {
    if (!selectionMenu || !onAiSelectionAction) return;
    onAiSelectionAction({
      text: selectionMenu.text,
      pageNumber: page.pageNumber,
      chapterTitle: page.chapterTitle,
      mode,
      triggerId: Date.now(),
    });
    setSelectionMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const findHighlightColorForBlock = (blockText: string): string | null => {
    const normBlock = blockText.replace(/\s+/g, ' ').trim().toLowerCase();
    for (const hl of pageHighlights) {
      const normHl = hl.text.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normHl && (normHl === normBlock || (normHl.length >= 12 && normBlock.startsWith(normHl)))) {
        const style = HIGHLIGHT_STYLES[hl.color];
        return paletteId === 'midnight' ? style.darkBg : style.bg;
      }
    }
    return null;
  };

  const handleQuickBlockTap = (blockText: string) => {
    if (!activeHighlighterPen) return;
    const sel = window.getSelection()?.toString().trim() ?? '';
    if (sel.length >= 2) return; // User dragged a specific word/phrase selection
    const normalizedBlock = blockText.trim();
    if (!normalizedBlock) return;
    const existing = pageHighlights.find(
      (h) => h.text.replace(/\s+/g, ' ').trim() === normalizedBlock.replace(/\s+/g, ' ').trim()
    );
    if (existing && existing.color === activeHighlighterPen && onRemoveHighlightByText) {
      onRemoveHighlightByText(page.pageNumber, existing.text);
    } else {
      onAddHighlight(page.pageNumber, normalizedBlock, activeHighlighterPen);
    }
  };

  const renderAnnotatedText = (text: string, dropCapPrefixChar?: string) => {
    const trimmedSearch = searchQuery?.trim() ?? '';
    const terms: Array<{
      match: string;
      bg: string;
      isSearch?: boolean;
      isFormula?: boolean;
      note?: string;
    }> = [];

    const normalizedBlockText = text.replace(/\s+/g, ' ');

    for (const hl of pageHighlights) {
      if (!hl.text) continue;
      const style = HIGHLIGHT_STYLES[hl.color];
      const bg = paletteId === 'midnight' ? style.darkBg : style.bg;
      // Split multi-paragraph / multi-line selections so every part highlights cleanly
      const fragments = hl.text
        .split(/\n+/)
        .map((f) => f.replace(/\s+/g, ' ').trim())
        .filter((f) => f.length >= 2);

      for (const frag of fragments) {
        if (normalizedBlockText.toLowerCase().includes(frag.toLowerCase())) {
          terms.push({ match: frag, bg, note: hl.note });
        } else if (
          dropCapPrefixChar &&
          frag.toLowerCase().startsWith(dropCapPrefixChar.toLowerCase()) &&
          frag.length > 2
        ) {
          const tail = frag.slice(dropCapPrefixChar.length).trimStart();
          if (tail.length >= 1 && normalizedBlockText.toLowerCase().includes(tail.toLowerCase())) {
            terms.push({ match: tail, bg, note: hl.note });
          }
        }
      }
    }

    if (trimmedSearch.length >= 2) {
      terms.push({
        match: trimmedSearch,
        bg: '#FDE047',
        isSearch: true,
      });
    }

    if (settings.autoHighlightImportant) {
      const autoHits = findAutoHighlights(text);
      for (const hit of autoHits) {
        terms.push({
          match: hit.phrase,
          bg: hit.kind === 'formula' ? theme.badgeBg : theme.accentSoft,
          isFormula: hit.kind === 'formula',
          note: hit.kind === 'formula' ? 'Auto-detected formula / value' : 'Key concept',
        });
      }
    }

    const renderBionicString = (str: string) => {
      if (!settings.bionicReading) return str;
      return str.split(/(\s+)/).map((token, idx) => {
        if (!token.trim() || token.length < 2) {
          return <React.Fragment key={idx}>{token}</React.Fragment>;
        }
        const splitAt = Math.max(1, Math.ceil(token.length * 0.45));
        return (
          <React.Fragment key={idx}>
            <strong className="font-semibold">{token.slice(0, splitAt)}</strong>
            {token.slice(splitAt)}
          </React.Fragment>
        );
      });
    };

    if (terms.length === 0) return renderBionicString(text);

    // Highlight matching occurrences cleanly (whitespace-flexible matching)
    let segments: Array<{
      str: string;
      bg?: string;
      isSearch?: boolean;
      isFormula?: boolean;
      note?: string;
    }> = [{ str: text }];

    for (const term of terms) {
      const nextSegments: typeof segments = [];
      const escapedTokens = term.match
        .trim()
        .split(/\s+/)
        .map((tok) => tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (escapedTokens.length === 0) continue;
      const matcher = new RegExp(escapedTokens.join('\\s+'), 'gi');

      for (const seg of segments) {
        if (seg.bg) {
          nextSegments.push(seg);
          continue;
        }
        let cursor = 0;
        let hasHit = false;
        matcher.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = matcher.exec(seg.str)) !== null) {
          if (match[0].length === 0) break;
          hasHit = true;
          if (match.index > cursor) {
            nextSegments.push({ str: seg.str.slice(cursor, match.index) });
          }
          nextSegments.push({
            str: match[0],
            bg: term.bg,
            isSearch: term.isSearch,
            isFormula: term.isFormula,
            note: term.note,
          });
          cursor = match.index + match[0].length;
        }
        if (!hasHit) {
          nextSegments.push(seg);
        } else if (cursor < seg.str.length) {
          nextSegments.push({ str: seg.str.slice(cursor) });
        }
      }
      segments = nextSegments;
    }

    return segments.map((seg, i) =>
      seg.bg ? (
        <mark
          key={i}
          title={seg.note}
          className={`rounded px-1 py-0.5 transition-colors ${
            seg.isFormula ? 'font-mono text-[0.92em] font-semibold' : ''
          }`}
          style={{
            backgroundColor: seg.bg,
            color: seg.isSearch ? '#111827' : seg.isFormula ? resolvedAccentColor : 'inherit',
            textDecoration:
              seg.note && !seg.isFormula ? `underline dotted ${resolvedAccentColor}` : undefined,
          }}
        >
          {renderBionicString(seg.str)}
        </mark>
      ) : (
        <React.Fragment key={i}>{renderBionicString(seg.str)}</React.Fragment>
      )
    );
  };

  const showCanvasView =
    !isTranslated &&
    (settings.renderMode === 'canvas' || page.hasRichVisuals) &&
    Boolean(page.canvasDataUrl);

  // Track first paragraph index for drop-cap styling
  const firstParagraphIdx = page.blocks.findIndex((b) => b.type === 'paragraph');

  const physicalStyle = settings.physicalBookStyle ?? 'hardcover';
  const isNotebook = physicalStyle === 'notebook';
  const showPhysicalSpine = physicalStyle !== 'flat' && spineSide !== 'none';

  const cornerRoundingClass =
    physicalStyle === 'flat'
      ? 'rounded-xl'
      : spineSide === 'left'
        ? 'rounded-l-xl lg:rounded-r-[2px]'
        : spineSide === 'right'
          ? 'rounded-r-xl lg:rounded-l-[2px]'
          : 'rounded-r-xl rounded-l-[4px]';

  return (
    <article
      dir={isRtl ? 'rtl' : 'ltr'}
      onMouseUp={handleMouseUp}
      onTouchEnd={handleTouchEnd}
      onMouseMove={(e) => {
        if (!settings.readingRuler) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setRulerY(e.clientY - rect.top);
      }}
      onMouseLeave={() => setRulerY(null)}
      className={`group relative flex flex-col justify-between ${cornerRoundingClass} border transition-all duration-300 ebook-paper-grain overflow-hidden select-text`}
      style={{
        background: theme.paperGradient,
        color: resolvedInkColor,
        borderColor: theme.borderColor,
        filter: `saturate(${settings.vividness}%)`,
        minHeight:
          settings.layoutMode === 'scroll'
            ? 'auto'
            : isFullscreen
              ? 'calc(100vh - 1.75rem)'
              : 'calc(100vh - 2.5rem)',
        boxShadow:
          physicalStyle === 'flat'
            ? undefined
            : 'inset 0 0 24px rgba(15, 23, 42, 0.045)',
      }}
    >
      {/* Ruled Notebook Paper Texture & Margin Line */}
      {isNotebook && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 ebook-notebook-lines opacity-75"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-9 sm:left-12 w-px bg-rose-400/35"
          />
        </>
      )}

      {/* Physical Book Center Spine Valley Crease Shadow */}
      {showPhysicalSpine && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 z-10 w-8 sm:w-10 ${
            spineSide === 'left' ? 'right-0' : 'left-0'
          }`}
          style={{
            background:
              spineSide === 'left'
                ? 'linear-gradient(to left, rgba(15,23,42,0.18), rgba(15,23,42,0.06) 38%, transparent)'
                : 'linear-gradient(to right, rgba(15,23,42,0.18), rgba(15,23,42,0.06) 38%, transparent)',
          }}
        />
      )}

      {/* Spiral Rings Accent for Notebook Mode */}
      {isNotebook && spineSide !== 'none' && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-6 z-20 flex flex-col justify-between ${
            spineSide === 'left' ? 'right-1' : 'left-1'
          }`}
        >
          {Array.from({ length: 12 }).map((_, idx) => (
            <span
              key={idx}
              className="w-2.5 h-2.5 rounded-full border border-zinc-400/70 bg-zinc-200/80 dark:bg-zinc-700/80 shadow-inner"
            />
          ))}
        </div>
      )}

      {/* Silk Ribbon Bookmark Peek when bookmarked in Physical Modes */}
      {isBookmarked && physicalStyle !== 'flat' && (
        <div
          aria-hidden="true"
          className="no-print pointer-events-none absolute top-0 right-6 z-20 w-4 h-9 shadow-sm"
          style={{
            background:
              physicalStyle === 'leather'
                ? 'linear-gradient(180deg, #B45309, #F59E0B)'
                : 'linear-gradient(180deg, #BE123C, #E11D48)',
            clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)',
          }}
        />
      )}

      {/* Focus Reading Ruler Guide */}
      {settings.readingRuler && rulerY !== null && (
        <div
          aria-hidden="true"
          className="no-print pointer-events-none absolute inset-x-0 z-10 h-11 -translate-y-1/2 border-y transition-[top] duration-75"
          style={{
            top: `${rulerY}px`,
            backgroundColor: theme.accentSoft,
            borderColor: theme.borderColor,
          }}
        />
      )}

      {/* Subtle top chromatic ribbon */}
      <div
        className="h-1.5 w-full shrink-0"
        style={{
          background: `linear-gradient(90deg, ${theme.accentColor}, ${theme.ornamentColor}, ${theme.badgeBg})`,
        }}
      />

      {/* Corner geometric motif */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute top-4 right-4 opacity-20"
        width="54"
        height="54"
        viewBox="0 0 54 54"
        fill="none"
      >
        <circle cx="27" cy="27" r="24" stroke={theme.ornamentColor} strokeWidth="1" strokeDasharray="3 4" />
        <circle cx="27" cy="27" r="14" stroke={theme.accentColor} strokeWidth="1" />
        <path d="M27 3V51M3 27H51" stroke={theme.ornamentColor} strokeWidth="0.75" />
      </svg>

      {/* Selection Floating Highlighter Toolbar */}
      {selectionMenu && (
        <div
          className={`no-print absolute z-30 -translate-x-1/2 ${
            selectionMenu.placeBelow ? '' : '-translate-y-full'
          } rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl px-2.5 py-2 flex flex-col gap-2`}
          style={{ left: `${selectionMenu.x}px`, top: `${selectionMenu.y}px` }}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5">
            <Highlighter className="w-3.5 h-3.5 text-zinc-500 mr-0.5" />
            {(Object.keys(HIGHLIGHT_STYLES) as HighlightColor[]).map((colorKey) => (
              <button
                key={colorKey}
                type="button"
                title={`Highlight ${HIGHLIGHT_STYLES[colorKey].label}`}
                onClick={() => applyHighlight(colorKey)}
                className="w-5 h-5 rounded-full border border-black/15 transition-transform hover:scale-110"
                style={{ backgroundColor: HIGHLIGHT_STYLES[colorKey].swatch }}
              />
            ))}
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
            <button
              type="button"
              onClick={() => applyHighlight('amber', true)}
              className="flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 px-1.5 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Note
            </button>
            <button
              type="button"
              onClick={() => {
                setNoteInputOpen(false);
                setCardInputOpen(true);
              }}
              className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950/50 whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5" />
              Card
            </button>
          </div>
          {noteInputOpen && (
            <form onSubmit={saveHighlightWithNote} className="flex items-center gap-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <input
                type="text"
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Write margin note..."
                className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 w-44 focus:outline-none"
              />
              <button
                type="submit"
                className="text-xs font-medium px-2 py-1 rounded bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 whitespace-nowrap"
              >
                Save
              </button>
            </form>
          )}
          {cardInputOpen && (
            <form onSubmit={saveSelectionFlashcard} className="flex items-center gap-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <input
                type="text"
                autoFocus
                value={cardFrontDraft}
                onChange={(e) => setCardFrontDraft(e.target.value)}
                placeholder="Question / term for this card..."
                className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 w-48 focus:outline-none"
              />
              <button
                type="submit"
                className="text-xs font-medium px-2 py-1 rounded bg-amber-500 text-zinc-950 whitespace-nowrap"
              >
                Add Card
              </button>
            </form>
          )}
          {aiEnabled && (onAiSelectionAction || onAskSelection || onStudySelection) && (
            <div className="flex flex-wrap items-center gap-1 pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
              {onAiSelectionAction && (
                <>
                  <button
                    type="button"
                    onClick={() => triggerAiSelection('simple')}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 hover:opacity-90 whitespace-nowrap"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Explain simply</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerAiSelection('example')}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap"
                  >
                    <span>Example</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerAiSelection('translate')}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap"
                  >
                    <Languages className="w-3 h-3" />
                    <span>Translate</span>
                  </button>
                </>
              )}
              {onAskSelection && (
                <button
                  type="button"
                  onClick={() => {
                    const txt = selectionMenu.text;
                    setSelectionMenu(null);
                    window.getSelection()?.removeAllRanges();
                    onAskSelection(txt, page.pageNumber, page.chapterTitle);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  <MessageCircleQuestion className="w-3 h-3" />
                  <span>Ask</span>
                </button>
              )}
              {onStudySelection && (
                <button
                  type="button"
                  onClick={() => {
                    const txt = selectionMenu.text;
                    setSelectionMenu(null);
                    window.getSelection()?.removeAllRanges();
                    onStudySelection(txt, page.pageNumber, page.chapterTitle);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 whitespace-nowrap"
                >
                  <GraduationCap className="w-3 h-3" />
                  <span>Study</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Page Content Area */}
      <div className="flex-1 px-7 py-6 sm:px-10 sm:py-8">
        {/* Top Page Folio */}
        <header
          className="flex items-center justify-between gap-4 pb-3 mb-6 border-b text-xs"
          style={{ borderColor: theme.borderColor, color: theme.mutedInk }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">{page.chapterTitle}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate hidden sm:inline opacity-80">{bookTitle}</span>
          </div>

          <div className="no-print flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
            <button
              type="button"
              onClick={() => onCyclePageTopic(page.pageNumber)}
              title={`Topic: ${TOPIC_CATALOG[detectedTopic].label} (click to switch topic graphic)`}
              className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors hover:opacity-85 whitespace-nowrap shrink-0"
              style={{ backgroundColor: theme.calloutBg, color: theme.mutedInk }}
            >
              <span>{TOPIC_CATALOG[detectedTopic].label.split(' ')[0]}</span>
            </button>
            <button
              type="button"
              onClick={() => onCyclePageVisualStyle(page.pageNumber)}
              title={`Page design: ${resolvedVisualStyle} (click to switch Cartoon / Diagram / Editorial / Minimal)`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors hover:opacity-85 whitespace-nowrap shrink-0 capitalize"
              style={{ backgroundColor: theme.accentSoft, color: theme.accentColor }}
            >
              <Shapes className="w-3 h-3" />
              <span>{resolvedVisualStyle}</span>
            </button>
            <button
              type="button"
              onClick={() => onCyclePageTheme(page.pageNumber)}
              title={`Page theme: ${theme.name} (click to shift page colour)`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors hover:opacity-85 whitespace-nowrap shrink-0"
              style={{ backgroundColor: theme.accentSoft, color: theme.accentColor }}
            >
              <Palette className="w-3 h-3" />
              <span className="hidden sm:inline">{theme.name}</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleBookmark(page.pageNumber)}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
              className="p-1.5 rounded-md transition-colors hover:opacity-80"
              style={{
                backgroundColor: isBookmarked ? theme.accentColor : theme.accentSoft,
                color: isBookmarked ? '#FFFFFF' : theme.accentColor,
              }}
            >
              {isBookmarked ? (
                <BookmarkCheck className="w-3.5 h-3.5" />
              ) : (
                <Bookmark className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </header>

        {/* Topic-Adaptive Cartoon / Infographic Banner */}
        <TopicIllustration
          topic={detectedTopic}
          styleMode={resolvedVisualStyle}
          theme={theme}
          pageNumber={page.pageNumber}
        />

        {/* Render Mode: Colour-Graded PDF Canvas OR Colourful Editorial Reflow */}
        {showCanvasView && page.canvasDataUrl ? (
          <div className="flex flex-col items-center gap-4">
            <div
              className="relative rounded-lg overflow-hidden border shadow-sm w-full"
              style={{ borderColor: theme.borderColor, backgroundColor: theme.paperBg }}
            >
              <img
                src={page.canvasDataUrl}
                alt={`${bookTitle} page ${page.pageNumber}`}
                referrerPolicy="no-referrer"
                className={`block mix-blend-multiply dark:mix-blend-normal ${
                  settings.layoutMode !== 'scroll'
                    ? 'max-h-[calc(100vh-10.5rem)] w-auto mx-auto object-contain'
                    : 'w-full h-auto'
                }`}
                style={{
                  filter: paletteId === 'midnight' ? 'invert(0.92) hue-rotate(180deg) contrast(1.04)' : 'contrast(1.04) saturate(1.15)',
                }}
              />
              {/* Chromatic paper tint overlay */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{ background: theme.paperGradient }}
              />
            </div>
            {page.hasRichVisuals && page.rawText.trim().length > 0 && (
              <p className="text-xs leading-relaxed opacity-75 w-full">
                {page.rawText.slice(0, 240)}
              </p>
            )}
          </div>
        ) : (
          <div
            className={`${fontClass} space-y-4`}
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              letterSpacing: letterSpacingValue,
              color: resolvedInkColor,
            }}
          >
            {page.blocks.map((block, bIdx) => {
              const isSpoken = activeTtsBlockIndex === bIdx;
              const blockHlBg = findHighlightColorForBlock(block.text);
              const spokenHighlightStyle = isSpoken
                ? {
                    backgroundColor: theme.accentSoft,
                    borderRadius: '8px',
                    padding: '6px 10px',
                    marginLeft: '-10px',
                    marginRight: '-10px',
                  }
                : undefined;

              const penInteractiveProps = activeHighlighterPen
                ? {
                    onClick: () => handleQuickBlockTap(block.text),
                    title: blockHlBg
                      ? 'Click to toggle highlight off'
                      : `Click to highlight in ${HIGHLIGHT_STYLES[activeHighlighterPen].label}`,
                  }
                : {};

              const penHoverClass = activeHighlighterPen
                ? 'cursor-pointer rounded-lg transition-colors hover:bg-amber-400/15 px-1.5 -mx-1.5'
                : '';

              if (block.type === 'heading') {
                return (
                  <div
                    key={block.id}
                    {...penInteractiveProps}
                    className={`pt-1 pb-2 ${penHoverClass}`}
                    style={spokenHighlightStyle}
                  >
                    <h2
                      className="font-semibold tracking-tight text-2xl sm:text-[26px] leading-snug text-balance"
                      style={{ color: resolvedAccentColor }}
                    >
                      {renderAnnotatedText(block.text)}
                    </h2>
                    <div
                      className="mt-3 h-0.5 w-16 rounded-full"
                      style={{ backgroundColor: resolvedAccentColor }}
                    />
                  </div>
                );
              }

              if (block.type === 'subheading') {
                return (
                  <h3
                    key={block.id}
                    {...penInteractiveProps}
                    className={`font-semibold text-lg sm:text-xl pt-2 leading-snug ${penHoverClass}`}
                    style={{ color: resolvedAccentColor, ...spokenHighlightStyle }}
                  >
                    {renderAnnotatedText(block.text)}
                  </h3>
                );
              }

              if (block.type === 'formula') {
                return (
                  <div
                    key={block.id}
                    {...penInteractiveProps}
                    className={`my-4 rounded-xl border px-4 py-3 font-mono text-sm sm:text-base font-semibold space-y-2 ${penHoverClass}`}
                    style={{
                      backgroundColor: blockHlBg || theme.badgeBg,
                      borderColor: theme.borderColor,
                      color: resolvedInkColor,
                      ...spokenHighlightStyle,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="break-words">{renderAnnotatedText(block.text)}</span>
                      <span
                        className="text-[10px] uppercase tracking-wider shrink-0 opacity-75"
                        style={{ color: resolvedAccentColor }}
                      >
                        Formula
                      </span>
                    </div>
                    {(block.uncertain || (aiEnabled && onExplainBlockItem) || (block.sourceScanPageId && onInspectOriginalScan)) && (
                      <div className="no-print flex flex-wrap items-center gap-2 pt-1 font-sans text-[11px] font-medium">
                        {block.uncertain && (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Verify OCR symbols</span>
                          </span>
                        )}
                        {block.sourceScanPageId && onInspectOriginalScan && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectOriginalScan(block.sourceScanPageId!, page.pageNumber, block);
                            }}
                            className="inline-flex items-center gap-1 opacity-80 hover:opacity-100 underline"
                            style={{ color: resolvedAccentColor }}
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Original Scan</span>
                          </button>
                        )}
                        {aiEnabled && onExplainBlockItem && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onExplainBlockItem(block, page.pageNumber);
                            }}
                            className="inline-flex items-center gap-1 opacity-85 hover:opacity-100 underline ml-auto"
                            style={{ color: resolvedAccentColor }}
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Explain Formula</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              if (block.type === 'table') {
                return (
                  <div
                    key={block.id}
                    {...penInteractiveProps}
                    className={`my-5 rounded-xl border p-3.5 space-y-2.5 overflow-x-auto ${penHoverClass}`}
                    style={{
                      backgroundColor: blockHlBg || theme.calloutBg,
                      borderColor: theme.borderColor,
                      color: resolvedInkColor,
                      ...spokenHighlightStyle,
                    }}
                  >
                    <div className="no-print flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span
                        className="font-semibold uppercase tracking-wider"
                        style={{ color: resolvedAccentColor }}
                      >
                        Table
                      </span>
                      <div className="flex items-center gap-3">
                        {block.uncertain && (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Check numbers</span>
                          </span>
                        )}
                        {block.sourceScanPageId && onInspectOriginalScan && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectOriginalScan(block.sourceScanPageId!, page.pageNumber, block);
                            }}
                            className="inline-flex items-center gap-1 underline opacity-85 hover:opacity-100"
                            style={{ color: resolvedAccentColor }}
                          >
                            <Eye className="w-3 h-3" />
                            <span>Original</span>
                          </button>
                        )}
                        {aiEnabled && onExplainBlockItem && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onExplainBlockItem(block, page.pageNumber);
                            }}
                            className="inline-flex items-center gap-1 underline font-medium"
                            style={{ color: resolvedAccentColor }}
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Explain Table</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {block.tableRows && block.tableRows.length > 0 ? (
                      <table className="w-full border-collapse text-xs sm:text-sm tabular-nums">
                        <thead>
                          <tr>
                            {block.tableRows[0].map((cell, ci) => (
                              <th
                                key={ci}
                                className="border px-2.5 py-1.5 text-left font-semibold"
                                style={{ borderColor: theme.borderColor, backgroundColor: theme.badgeBg }}
                              >
                                {cell}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        {block.tableRows.length > 1 && (
                          <tbody>
                            {block.tableRows.slice(1).map((row, ri) => (
                              <tr key={ri}>
                                {row.map((cell, ci) => (
                                  <td
                                    key={ci}
                                    className="border px-2.5 py-1.5 align-top"
                                    style={{ borderColor: theme.borderColor }}
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        )}
                      </table>
                    ) : (
                      <pre className="text-xs whitespace-pre-wrap font-mono">{block.text}</pre>
                    )}
                  </div>
                );
              }

              if (block.type === 'diagram') {
                return (
                  <figure
                    key={block.id}
                    className="my-5 rounded-xl border p-3.5 space-y-2.5"
                    style={{
                      backgroundColor: theme.calloutBg,
                      borderColor: theme.borderColor,
                      color: resolvedInkColor,
                    }}
                  >
                    {block.imageDataUrl && (
                      <div className="rounded-lg overflow-hidden bg-white dark:bg-zinc-950 border border-black/10 flex justify-center">
                        <img
                          src={block.imageDataUrl}
                          alt={block.text || 'Scanned diagram'}
                          referrerPolicy="no-referrer"
                          className="max-h-72 w-auto object-contain"
                        />
                      </div>
                    )}
                    <figcaption className="text-xs opacity-85 flex flex-wrap items-center justify-between gap-2">
                      <span>{block.text}</span>
                      <div className="no-print flex items-center gap-3">
                        {block.uncertain && (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Verify labels</span>
                          </span>
                        )}
                        {block.sourceScanPageId && onInspectOriginalScan && (
                          <button
                            type="button"
                            onClick={() =>
                              onInspectOriginalScan(block.sourceScanPageId!, page.pageNumber, block)
                            }
                            className="inline-flex items-center gap-1 underline"
                            style={{ color: resolvedAccentColor }}
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Original Scan</span>
                          </button>
                        )}
                        {aiEnabled && onExplainBlockItem && (
                          <button
                            type="button"
                            onClick={() => onExplainBlockItem(block, page.pageNumber)}
                            className="inline-flex items-center gap-1 underline font-medium"
                            style={{ color: resolvedAccentColor }}
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Explain Diagram</span>
                          </button>
                        )}
                      </div>
                    </figcaption>
                    {block.aiExplanation && (
                      <div
                        className="rounded-lg border px-3 py-2 text-xs leading-relaxed"
                        style={{ borderColor: theme.borderColor, backgroundColor: theme.paperBg }}
                      >
                        {block.aiExplanation}
                      </div>
                    )}
                  </figure>
                );
              }

              if (block.type === 'footnote') {
                return (
                  <aside
                    key={block.id}
                    {...penInteractiveProps}
                    className={`mt-4 pt-2.5 border-t text-[0.84em] leading-snug opacity-85 ${penHoverClass}`}
                    style={{
                      borderColor: theme.borderColor,
                      color: theme.mutedInk,
                      ...spokenHighlightStyle,
                    }}
                  >
                    {renderAnnotatedText(block.text)}
                  </aside>
                );
              }

              if (block.type === 'quote') {
                return (
                  <blockquote
                    key={block.id}
                    {...penInteractiveProps}
                    className={`my-5 rounded-xl border px-5 py-4 italic text-[1.03em] ${penHoverClass}`}
                    style={{
                      backgroundColor: blockHlBg || theme.calloutBg,
                      borderColor: theme.borderColor,
                      color: resolvedInkColor,
                      ...spokenHighlightStyle,
                    }}
                  >
                    “{renderAnnotatedText(block.text.replace(/^[“"]|[”"]$/g, ''))}”
                  </blockquote>
                );
              }

              if (block.type === 'list-item') {
                return (
                  <div
                    key={block.id}
                    {...penInteractiveProps}
                    className={`flex items-start gap-3 pl-1 ${penHoverClass}`}
                    style={spokenHighlightStyle}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2.5 h-2 w-2 rounded-sm shrink-0"
                      style={{ backgroundColor: resolvedAccentColor }}
                    />
                    <p className="flex-1">{renderAnnotatedText(block.text)}</p>
                  </div>
                );
              }

              const isDropCap = bIdx === firstParagraphIdx && block.text.length > 60;
              if (isDropCap) {
                const firstChar = block.text.charAt(0);
                const rest = block.text.slice(1);
                const dropCapHl = pageHighlights.find((hl) => {
                  const normHl = hl.text.replace(/\s+/g, ' ').trim().toLowerCase();
                  const normBlock = block.text.replace(/\s+/g, ' ').trim().toLowerCase();
                  return normHl.length >= 2 && normBlock.startsWith(normHl);
                });
                const dropCapBg = dropCapHl
                  ? paletteId === 'midnight'
                    ? HIGHLIGHT_STYLES[dropCapHl.color].darkBg
                    : HIGHLIGHT_STYLES[dropCapHl.color].bg
                  : undefined;

                return (
                  <p
                    key={block.id}
                    {...penInteractiveProps}
                    className={`leading-relaxed ${penHoverClass}`}
                    style={spokenHighlightStyle}
                  >
                    <span
                      className="float-left font-bold text-5xl leading-[0.82] mr-3 mt-1.5 select-none rounded px-1"
                      style={{ color: resolvedAccentColor, backgroundColor: dropCapBg }}
                    >
                      {firstChar}
                    </span>
                    {renderAnnotatedText(rest, firstChar)}
                  </p>
                );
              }

              return (
                <p
                  key={block.id}
                  {...penInteractiveProps}
                  className={`leading-relaxed ${penHoverClass}`}
                  style={spokenHighlightStyle}
                >
                  {renderAnnotatedText(block.text)}
                </p>
              );
            })}
          </div>
        )}

        {/* Inline Page Margin Notes Preview (if highlights with notes exist on this page) */}
        {pageHighlights.some((h) => h.note) && (
          <aside
            className="mt-8 pt-4 border-t space-y-2 text-xs"
            style={{ borderColor: theme.borderColor }}
          >
            <div className="font-semibold" style={{ color: theme.accentColor }}>
              Margin Notes on Page {page.pageNumber}
            </div>
            {pageHighlights
              .filter((h) => h.note)
              .map((h) => (
                <div
                  key={h.id}
                  className="rounded-lg border px-3 py-2"
                  style={{
                    backgroundColor: theme.calloutBg,
                    borderColor: theme.borderColor,
                  }}
                >
                  <span className="font-medium opacity-80">“{h.text.slice(0, 64)}…”</span>
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  <span>{h.note}</span>
                </div>
              ))}
          </aside>
        )}
      </div>

      {/* Bottom Page Footer */}
      <footer
        className="relative px-7 py-2.5 sm:px-10 border-t flex items-center justify-between text-xs tabular-nums"
        style={{ borderColor: theme.borderColor, color: theme.mutedInk }}
      >
        <span className="opacity-0 group-hover:opacity-85 transition-opacity duration-200">
          {page.wordCount} words · {theme.name}
        </span>
        <span className="font-mono font-medium" style={{ color: resolvedAccentColor }}>
          {page.pageNumber} / {totalPages}
        </span>
      </footer>

      {/* Tactile Draggable & Clickable Page-Turn Dog-Ear Corners */}
      {onCornerTurn && settings.layoutMode !== 'scroll' && (
        <>
          {(spineSide === 'right' || spineSide === 'single' || spineSide === 'none') &&
            page.pageNumber < totalPages && (
              <div
                role="button"
                tabIndex={0}
                data-page-corner="next"
                onClick={(e) => {
                  if (e.defaultPrevented) return;
                  e.stopPropagation();
                  onCornerTurn(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onCornerTurn(1);
                  }
                }}
                title="Grab & drag or tap corner for next page"
                aria-label="Turn corner to next page"
                className="no-print absolute bottom-0 right-0 z-20 w-12 h-12 sm:w-14 sm:h-14 opacity-45 group-hover:opacity-100 hover:w-16 hover:h-16 focus-visible:opacity-100 transition-all duration-200 cursor-grab active:cursor-grabbing touch-none select-none"
                style={{
                  background:
                    'linear-gradient(135deg, transparent 50%, rgba(15,23,42,0.18) 50%, rgba(255,255,255,0.92) 58%, rgba(226,232,240,0.98) 100%)',
                  borderTopLeftRadius: '10px',
                  boxShadow: '-2px -2px 6px rgba(15,23,42,0.08)',
                }}
              />
            )}
          {(spineSide === 'left' || spineSide === 'single' || spineSide === 'none') &&
            page.pageNumber > 1 && (
              <div
                role="button"
                tabIndex={0}
                data-page-corner="prev"
                onClick={(e) => {
                  if (e.defaultPrevented) return;
                  e.stopPropagation();
                  onCornerTurn(-1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onCornerTurn(-1);
                  }
                }}
                title="Grab & drag or tap corner for previous page"
                aria-label="Turn corner to previous page"
                className="no-print absolute bottom-0 left-0 z-20 w-12 h-12 sm:w-14 sm:h-14 opacity-45 group-hover:opacity-100 hover:w-16 hover:h-16 focus-visible:opacity-100 transition-all duration-200 cursor-grab active:cursor-grabbing touch-none select-none"
                style={{
                  background:
                    'linear-gradient(225deg, transparent 50%, rgba(15,23,42,0.18) 50%, rgba(255,255,255,0.92) 58%, rgba(226,232,240,0.98) 100%)',
                  borderTopRightRadius: '10px',
                  boxShadow: '2px -2px 6px rgba(15,23,42,0.08)',
                }}
              />
            )}
        </>
      )}
    </article>
  );
};

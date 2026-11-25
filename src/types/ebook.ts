export type PaletteId =
  | 'prismatic'
  | 'botanical'
  | 'marigold'
  | 'cobalt'
  | 'coral'
  | 'lavender'
  | 'terracotta'
  | 'midnight';

export type LayoutMode = 'spread' | 'single' | 'scroll';
export type RenderMode = 'reflow' | 'canvas';
export type ReaderFont =
  | 'serif'
  | 'classic'
  | 'literary'
  | 'editorial'
  | 'sans'
  | 'humanist'
  | 'mono'
  | 'indic'
  | 'indic-serif'
  | 'dyslexic';
export type ShellTheme = 'light' | 'sepia' | 'dark';
export type HighlightColor = 'amber' | 'rose' | 'mint' | 'sky' | 'violet';

export type PageVisualStyle = 'auto' | 'editorial' | 'cartoon' | 'infographic' | 'minimal';
export type PhysicalBookStyle = 'hardcover' | 'leather' | 'paperback' | 'notebook' | 'flat';
export type PageFlipStyle = 'book3d' | 'curl' | 'slide' | 'snap' | 'fade';
export type PageTurnSoundStyle = 'paper' | 'soft' | 'hardcover' | 'vintage' | 'off';
export type BookTopicId = 'science' | 'nature' | 'math' | 'history' | 'tech' | 'art';
export type BookLanguageCode = 'original' | string;

export interface PageColorTheme {
  id: string;
  name: string;
  paperBg: string;
  paperGradient: string;
  inkColor: string;
  mutedInk: string;
  accentColor: string;
  accentSoft: string;
  borderColor: string;
  calloutBg: string;
  ornamentColor: string;
  badgeBg: string;
}

export type BlockType =
  | 'heading'
  | 'subheading'
  | 'paragraph'
  | 'quote'
  | 'list-item'
  | 'formula'
  | 'footnote'
  | 'table'
  | 'diagram';

export interface EbookBlock {
  id: string;
  type: BlockType;
  text: string;
  tableRows?: string[][];
  imageDataUrl?: string;
  uncertain?: boolean;
  sourceScanPageId?: string;
  sourceBox?: ScanBoundingBox;
  aiExplanation?: string;
}

export interface EbookPage {
  pageNumber: number;
  chapterTitle: string;
  blocks: EbookBlock[];
  rawText: string;
  wordCount: number;
  hasRichVisuals: boolean;
  canvasDataUrl?: string;
  thumbnailDataUrl?: string;
  customThemeIndex?: number;
  customTopic?: BookTopicId;
  customVisualStyle?: Exclude<PageVisualStyle, 'auto'>;
  textDirection?: 'ltr' | 'rtl';
  scanPageId?: string;
}

export interface ChapterEntry {
  title: string;
  pageNumber: number;
}

export interface HighlightItem {
  id: string;
  pageNumber: number;
  text: string;
  color: HighlightColor;
  note?: string;
  createdAt: number;
}

export interface BookmarkItem {
  pageNumber: number;
  label: string;
  createdAt: number;
}

export interface FlashcardItem {
  id: string;
  pageNumber: number;
  front: string;
  back: string;
  concept?: string;
  hint?: string;
  confidence?: 'again' | 'good' | 'mastered';
  mastered: boolean;
  createdAt: number;
}

export interface StudyNoteItem {
  id: string;
  pageNumber: number;
  title: string;
  content: string;
  createdAt: number;
}

export interface TranslatedBookEdition {
  language: string;
  label?: string;
  title: string;
  chapters: ChapterEntry[];
  pages: Record<
    number,
    {
      chapterTitle: string;
      blocks: EbookBlock[];
      rawText: string;
    }
  >;
  translatedAt: number;
}

export interface ScanCornerPoint {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface ScanCleanupSettings {
  autoPerspective: boolean;
  autoDeskew: boolean;
  fineAngleDeg: number; // -10 .. +10
  deshadowStrength: number; // 0 .. 100
  gutterShadowReduction?: number; // 0 .. 100
  curvatureCorrection?: number; // 0 .. 100
  glareReduction: number; // 0 .. 100
  denoiseStrength: number; // 0 .. 100
  contrast: number; // -30 .. +60
  sharpen: number; // 0 .. 100
}

export interface ScanQualityMetrics {
  blurScore: number; // 0..100 (higher = sharper)
  glareRatio: number; // 0..1
  brightness: number; // 0..255
  edgeClarity: number; // 0..100
  widthPx?: number;
  heightPx?: number;
  resolutionOk?: boolean;
  cutOffEdges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  unreadableZones?: number;
  coachSummary?: string;
  overall: 'good' | 'fair' | 'poor';
  warnings: string[];
}

export interface ScanBoundingBox {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  width: number; // normalized 0..1
  height: number; // normalized 0..1
}

export interface ScanOcrWord {
  id: string;
  text: string;
  confidence: number; // 0..1
  isUncertain: boolean;
  box: ScanBoundingBox;
  blockIndex: number;
  paragraphIndex: number;
}

export interface ScanOcrParagraph {
  id: string;
  text: string;
  confidence: number;
  box: ScanBoundingBox;
  isHeadingCandidate?: boolean;
  isFootnoteCandidate?: boolean;
  avgLineHeight?: number;
  wordIds: string[];
}

export interface ScanImageRegion {
  id: string;
  kind: 'diagram' | 'table' | 'figure';
  box: ScanBoundingBox;
  confidence?: number;
}

export interface ScanExtractedItem {
  id: string;
  kind: 'table' | 'formula' | 'diagram';
  title: string;
  rawText: string;
  tableRows?: string[][];
  cropDataUrl?: string;
  box: ScanBoundingBox;
  confidence: number;
  isUncertain: boolean;
  aiExplanation?: string;
}

export interface ScanPageOcrResult {
  status: 'idle' | 'processing' | 'done' | 'error';
  errorMessage?: string;
  rawText: string;
  correctedText: string;
  detectedLanguage?: string;
  textDirection: 'ltr' | 'rtl';
  overallConfidence: number; // 0..1
  words: ScanOcrWord[];
  paragraphs: ScanOcrParagraph[];
  imageRegions?: ScanImageRegion[];
  processedAt?: number;
}

export interface ScanPageRecord {
  id: string;
  sourceName: string;
  originalDataUrl: string;
  enhancedDataUrl: string;
  width: number;
  height: number;
  rotationDeg: 0 | 90 | 180 | 270;
  corners: [ScanCornerPoint, ScanCornerPoint, ScanCornerPoint, ScanCornerPoint];
  cleanup: ScanCleanupSettings;
  appliedDeskewDeg: number;
  quality: ScanQualityMetrics;
  ocr: ScanPageOcrResult;
  createdAt: number;
  // Additive Book Mode, Completeness & Structure fields
  spreadId?: string;
  spreadSide?: 'left' | 'right';
  spreadOriginalDataUrl?: string;
  spreadSplitRatio?: number;
  detectedPageNumber?: number | null;
  originalCaptureIndex?: number;
  visualFingerprint?: number[];
  extractedItems?: ScanExtractedItem[];
  keepAnyway?: boolean;
}

export interface ScanTocEntry {
  id: string;
  title: string;
  pageNumber: number;
  level: 'chapter' | 'section';
  sourceScanPageId?: string;
}

export type ScanSequenceIssueType =
  | 'duplicate'
  | 'blank'
  | 'out-of-order'
  | 'missing-gap';

export interface ScanSequenceIssue {
  id: string;
  type: ScanSequenceIssueType;
  severity: 'warning' | 'info';
  message: string;
  suggestion: string;
  affectedPageIds: string[];
  missingPageNumbers?: number[];
}

export type ScanOutputMode =
  | 'reflowable-ebook'
  | 'reflowable-epub'
  | 'searchable-pdf'
  | 'original-pdf';

export interface ScanBookMetadata {
  outputMode: ScanOutputMode;
  languageHint: string; // 'auto' or BCP-47 code like 'en', 'bn', 'ar'
  pages: ScanPageRecord[];
  customToc?: ScanTocEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface CrossBookSearchCitation {
  bookId: string;
  bookTitle: string;
  pageNumber: number;
  chapterTitle: string;
  quote: string;
}

export interface CrossBookSearchResponse {
  answer: string;
  supportedByBooks: boolean;
  citations: CrossBookSearchCitation[];
}

export interface EbookDocument {
  id: string;
  title: string;
  author: string;
  coverDataUrl?: string;
  totalPages: number;
  createdAt: number;
  lastOpenedAt: number;
  currentPage: number;
  chapters: ChapterEntry[];
  pages: EbookPage[];
  highlights: HighlightItem[];
  bookmarks: BookmarkItem[];
  flashcards?: FlashcardItem[];
  studyNotes?: StudyNoteItem[];
  studyMinutes?: number;
  paletteId: PaletteId;
  pageVisualStyle?: PageVisualStyle;
  activeLanguage?: BookLanguageCode;
  translations?: Record<string, TranslatedBookEdition>;
  sourceFileName?: string;
  isSample?: boolean;
  scanData?: ScanBookMetadata;
}

export type AiProvider = 'gemini';
export type VoiceEngine = 'google-ai' | 'browser';
export type GoogleVoiceName = 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';
export type DailyGoalType = 'minutes' | 'pages';
export type WeekDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DailyReadingGoalState {
  goalType: DailyGoalType;
  target: number;
  dateKey: string;
  minutesCompleted: number;
  pagesCompleted: number;
  streakDays: number;
}

export interface WeeklyScheduleSlot {
  dayKey: WeekDayKey;
  enabled: boolean;
  timeOfDay: string; // HH:MM (24h)
  notificationsEnabled: boolean;
}

export interface ReaderSettings {
  layoutMode: LayoutMode;
  renderMode: RenderMode;
  font: ReaderFont;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: 'tight' | 'normal' | 'relaxed' | 'wide';
  textColorId?: string;
  customTextColor?: string;
  headingColorId?: string;
  customHeadingColor?: string;
  vividness: number; // 70 - 130 (%)
  shellTheme: ShellTheme;
  autoReadTurn: boolean;
  ttsRate: number;
  voiceEngine?: VoiceEngine;
  googleVoiceName?: GoogleVoiceName;
  aiProvider?: AiProvider;
  bionicReading: boolean;
  readingRuler: boolean;
  autoHighlightImportant: boolean;
  physicalBookStyle: PhysicalBookStyle;
  pageFlipStyle: PageFlipStyle;
  pageSoundStyle: PageTurnSoundStyle;
  pageSoundVolume: number;
  aiEnabled?: boolean;
}

export interface AiPageInsight {
  summary: string;
  takeaways: string[];
  glossary: Array<{ term: string; definition: string }>;
  highlightQuote: string;
}

export interface AiQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  reference?: string;
}

export type AiSelectionActionMode = 'simple' | 'example' | 'translate';

export interface AiSelectionRequest {
  text: string;
  pageNumber: number;
  chapterTitle: string;
  mode: AiSelectionActionMode;
  triggerId: number;
}

export interface AiAskMessage {
  role: 'user' | 'assistant';
  text: string;
  citations?: string[];
  supportedByBook?: boolean;
  scopeLabel?: string;
  spoilerSafe?: boolean;
}

export interface AiRecapResponse {
  summary: string;
  keyEvents: Array<{ event: string; reference: string }>;
  upToPage: number;
  spoilerSafe: boolean;
  depth: 'short' | 'detailed';
}

export interface AiCharacterTimelineResponse {
  summary: string;
  supportedByBook: boolean;
  items: Array<{
    nameOrEvent: string;
    roleOrSummary: string;
    relationshipOrDetail: string;
    citation: string;
    quote?: string;
  }>;
}

export interface AiPdfPageExplanation {
  visualTypeDetected: string;
  explanation: string;
  keyTakeaways: string[];
  reference: string;
}

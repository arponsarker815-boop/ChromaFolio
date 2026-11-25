export interface BookLanguageOption {
  code: string;
  label: string;
  shortLabel: string;
  promptName: string;
  ttsLang: string;
  isRtl?: boolean;
}

export const BOOK_LANGUAGE_OPTIONS: BookLanguageOption[] = [
  {
    code: 'bn',
    label: 'বাংলা (Bengali)',
    shortLabel: 'বাংলা',
    promptName: 'Bengali (বাংলা)',
    ttsLang: 'bn-IN',
  },
  {
    code: 'hi',
    label: 'हिन्दी (Hindi)',
    shortLabel: 'हिन्दी',
    promptName: 'Hindi (हिन्दी)',
    ttsLang: 'hi-IN',
  },
  {
    code: 'en',
    label: 'English',
    shortLabel: 'English',
    promptName: 'English',
    ttsLang: 'en-US',
  },
  {
    code: 'ar',
    label: 'العربية (Arabic)',
    shortLabel: 'العربية',
    promptName: 'Arabic (العربية)',
    ttsLang: 'ar-SA',
    isRtl: true,
  },
  {
    code: 'es',
    label: 'Español (Spanish)',
    shortLabel: 'Español',
    promptName: 'Spanish (Español)',
    ttsLang: 'es-ES',
  },
  {
    code: 'fr',
    label: 'Français (French)',
    shortLabel: 'Français',
    promptName: 'French (Français)',
    ttsLang: 'fr-FR',
  },
  {
    code: 'ja',
    label: '日本語 (Japanese)',
    shortLabel: '日本語',
    promptName: 'Japanese (日本語)',
    ttsLang: 'ja-JP',
  },
  {
    code: 'de',
    label: 'Deutsch (German)',
    shortLabel: 'Deutsch',
    promptName: 'German (Deutsch)',
    ttsLang: 'de-DE',
  },
  {
    code: 'ur',
    label: 'اردو (Urdu)',
    shortLabel: 'اردو',
    promptName: 'Urdu (اردو)',
    ttsLang: 'ur-PK',
    isRtl: true,
  },
];

// Comprehensive Google Translate language aliases -> official ISO / BCP-47 tl codes
export const GOOGLE_TRANSLATE_ALIASES: Record<string, { code: string; label: string; ttsLang: string; isRtl?: boolean }> = {
  bn: { code: 'bn', label: 'বাংলা (Bengali)', ttsLang: 'bn-IN' },
  bangla: { code: 'bn', label: 'বাংলা (Bengali)', ttsLang: 'bn-IN' },
  bengali: { code: 'bn', label: 'বাংলা (Bengali)', ttsLang: 'bn-IN' },
  hi: { code: 'hi', label: 'हिन्दी (Hindi)', ttsLang: 'hi-IN' },
  hindi: { code: 'hi', label: 'हिन्दी (Hindi)', ttsLang: 'hi-IN' },
  en: { code: 'en', label: 'English', ttsLang: 'en-US' },
  english: { code: 'en', label: 'English', ttsLang: 'en-US' },
  ar: { code: 'ar', label: 'العربية (Arabic)', ttsLang: 'ar-SA', isRtl: true },
  arabic: { code: 'ar', label: 'العربية (Arabic)', ttsLang: 'ar-SA', isRtl: true },
  es: { code: 'es', label: 'Español (Spanish)', ttsLang: 'es-ES' },
  spanish: { code: 'es', label: 'Español (Spanish)', ttsLang: 'es-ES' },
  fr: { code: 'fr', label: 'Français (French)', ttsLang: 'fr-FR' },
  french: { code: 'fr', label: 'Français (French)', ttsLang: 'fr-FR' },
  ja: { code: 'ja', label: '日本語 (Japanese)', ttsLang: 'ja-JP' },
  japanese: { code: 'ja', label: '日本語 (Japanese)', ttsLang: 'ja-JP' },
  de: { code: 'de', label: 'Deutsch (German)', ttsLang: 'de-DE' },
  german: { code: 'de', label: 'Deutsch (German)', ttsLang: 'de-DE' },
  ur: { code: 'ur', label: 'اردو (Urdu)', ttsLang: 'ur-PK', isRtl: true },
  urdu: { code: 'ur', label: 'اردو (Urdu)', ttsLang: 'ur-PK', isRtl: true },
  ko: { code: 'ko', label: '한국어 (Korean)', ttsLang: 'ko-KR' },
  korean: { code: 'ko', label: '한국어 (Korean)', ttsLang: 'ko-KR' },
  zh: { code: 'zh-CN', label: '中文 (Chinese)', ttsLang: 'zh-CN' },
  'zh-cn': { code: 'zh-CN', label: '中文 (Chinese Simplified)', ttsLang: 'zh-CN' },
  'zh-tw': { code: 'zh-TW', label: '繁體中文 (Chinese Traditional)', ttsLang: 'zh-TW' },
  chinese: { code: 'zh-CN', label: '中文 (Chinese)', ttsLang: 'zh-CN' },
  mandarin: { code: 'zh-CN', label: '中文 (Chinese)', ttsLang: 'zh-CN' },
  pt: { code: 'pt', label: 'Português (Portuguese)', ttsLang: 'pt-BR' },
  portuguese: { code: 'pt', label: 'Português (Portuguese)', ttsLang: 'pt-BR' },
  ru: { code: 'ru', label: 'Русский (Russian)', ttsLang: 'ru-RU' },
  russian: { code: 'ru', label: 'Русский (Russian)', ttsLang: 'ru-RU' },
  it: { code: 'it', label: 'Italiano (Italian)', ttsLang: 'it-IT' },
  italian: { code: 'it', label: 'Italiano (Italian)', ttsLang: 'it-IT' },
  tr: { code: 'tr', label: 'Türkçe (Turkish)', ttsLang: 'tr-TR' },
  turkish: { code: 'tr', label: 'Türkçe (Turkish)', ttsLang: 'tr-TR' },
  id: { code: 'id', label: 'Bahasa Indonesia', ttsLang: 'id-ID' },
  indonesian: { code: 'id', label: 'Bahasa Indonesia', ttsLang: 'id-ID' },
  ms: { code: 'ms', label: 'Bahasa Melayu (Malay)', ttsLang: 'ms-MY' },
  malay: { code: 'ms', label: 'Bahasa Melayu (Malay)', ttsLang: 'ms-MY' },
  vi: { code: 'vi', label: 'Tiếng Việt (Vietnamese)', ttsLang: 'vi-VN' },
  vietnamese: { code: 'vi', label: 'Tiếng Việt (Vietnamese)', ttsLang: 'vi-VN' },
  th: { code: 'th', label: 'ไทย (Thai)', ttsLang: 'th-TH' },
  thai: { code: 'th', label: 'ไทย (Thai)', ttsLang: 'th-TH' },
  fa: { code: 'fa', label: 'فارسی (Persian)', ttsLang: 'fa-IR', isRtl: true },
  persian: { code: 'fa', label: 'فارسی (Persian)', ttsLang: 'fa-IR', isRtl: true },
  farsi: { code: 'fa', label: 'فارسی (Persian)', ttsLang: 'fa-IR', isRtl: true },
  ta: { code: 'ta', label: 'தமிழ் (Tamil)', ttsLang: 'ta-IN' },
  tamil: { code: 'ta', label: 'தமிழ் (Tamil)', ttsLang: 'ta-IN' },
  te: { code: 'te', label: 'తెలుగు (Telugu)', ttsLang: 'te-IN' },
  telugu: { code: 'te', label: 'తెలుగు (Telugu)', ttsLang: 'te-IN' },
  mr: { code: 'mr', label: 'मराठी (Marathi)', ttsLang: 'mr-IN' },
  marathi: { code: 'mr', label: 'मराठी (Marathi)', ttsLang: 'mr-IN' },
  gu: { code: 'gu', label: 'ગુજરાતી (Gujarati)', ttsLang: 'gu-IN' },
  gujarati: { code: 'gu', label: 'ગુજરાતી (Gujarati)', ttsLang: 'gu-IN' },
  kn: { code: 'kn', label: 'ಕನ್ನಡ (Kannada)', ttsLang: 'kn-IN' },
  kannada: { code: 'kn', label: 'ಕನ್ನಡ (Kannada)', ttsLang: 'kn-IN' },
  ml: { code: 'ml', label: 'മലയാളം (Malayalam)', ttsLang: 'ml-IN' },
  malayalam: { code: 'ml', label: 'മലയാളം (Malayalam)', ttsLang: 'ml-IN' },
  pa: { code: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)', ttsLang: 'pa-IN' },
  punjabi: { code: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)', ttsLang: 'pa-IN' },
  ne: { code: 'ne', label: 'नेपाली (Nepali)', ttsLang: 'ne-NP' },
  nepali: { code: 'ne', label: 'नेपाली (Nepali)', ttsLang: 'ne-NP' },
  si: { code: 'si', label: 'සිංහල (Sinhala)', ttsLang: 'si-LK' },
  sinhala: { code: 'si', label: 'සිංහල (Sinhala)', ttsLang: 'si-LK' },
  as: { code: 'as', label: 'অসমীয়া (Assamese)', ttsLang: 'as-IN' },
  assamese: { code: 'as', label: 'অসমীয়া (Assamese)', ttsLang: 'as-IN' },
  or: { code: 'or', label: 'ଓଡ଼ିଆ (Odia)', ttsLang: 'or-IN' },
  odia: { code: 'or', label: 'ଓଡ଼ିଆ (Odia)', ttsLang: 'or-IN' },
  oriya: { code: 'or', label: 'ଓଡ଼ିଆ (Odia)', ttsLang: 'or-IN' },
  nl: { code: 'nl', label: 'Nederlands (Dutch)', ttsLang: 'nl-NL' },
  dutch: { code: 'nl', label: 'Nederlands (Dutch)', ttsLang: 'nl-NL' },
  pl: { code: 'pl', label: 'Polski (Polish)', ttsLang: 'pl-PL' },
  polish: { code: 'pl', label: 'Polski (Polish)', ttsLang: 'pl-PL' },
  sv: { code: 'sv', label: 'Svenska (Swedish)', ttsLang: 'sv-SE' },
  swedish: { code: 'sv', label: 'Svenska (Swedish)', ttsLang: 'sv-SE' },
  el: { code: 'el', label: 'Ελληνικά (Greek)', ttsLang: 'el-GR' },
  greek: { code: 'el', label: 'Ελληνικά (Greek)', ttsLang: 'el-GR' },
  he: { code: 'iw', label: 'עברית (Hebrew)', ttsLang: 'he-IL', isRtl: true },
  iw: { code: 'iw', label: 'עברית (Hebrew)', ttsLang: 'he-IL', isRtl: true },
  hebrew: { code: 'iw', label: 'עברית (Hebrew)', ttsLang: 'he-IL', isRtl: true },
  uk: { code: 'uk', label: 'Українська (Ukrainian)', ttsLang: 'uk-UA' },
  ukrainian: { code: 'uk', label: 'Українська (Ukrainian)', ttsLang: 'uk-UA' },
  sw: { code: 'sw', label: 'Kiswahili (Swahili)', ttsLang: 'sw-KE' },
  swahili: { code: 'sw', label: 'Kiswahili (Swahili)', ttsLang: 'sw-KE' },
  la: { code: 'la', label: 'Latina (Latin)', ttsLang: 'en-US' },
  latin: { code: 'la', label: 'Latina (Latin)', ttsLang: 'en-US' },
  sa: { code: 'sa', label: 'संस्कृतम् (Sanskrit)', ttsLang: 'sa-IN' },
  sanskrit: { code: 'sa', label: 'संस्कृतम् (Sanskrit)', ttsLang: 'sa-IN' },
};

export function normalizeLanguageCode(input: string): string {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const alias = GOOGLE_TRANSLATE_ALIASES[lower];
  if (alias) return alias.code;

  const match = BOOK_LANGUAGE_OPTIONS.find(
    (opt) =>
      opt.code.toLowerCase() === lower ||
      opt.shortLabel.toLowerCase() === lower ||
      opt.label.toLowerCase() === lower ||
      opt.promptName.toLowerCase().includes(lower)
  );
  if (match) return match.code;

  // Match words inside e.g. "Korean (한국어)"
  const firstWord = lower.split(/[\s(]+/)[0];
  if (firstWord && GOOGLE_TRANSLATE_ALIASES[firstWord]) {
    return GOOGLE_TRANSLATE_ALIASES[firstWord].code;
  }

  return lower.replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'custom';
}

export function resolveLanguageMeta(codeOrName: string): BookLanguageOption {
  if (codeOrName === 'original') {
    return {
      code: 'original',
      label: 'Original Edition',
      shortLabel: 'Language',
      promptName: 'Original',
      ttsLang: 'en-US',
    };
  }
  const lower = codeOrName.trim().toLowerCase();
  const exact = BOOK_LANGUAGE_OPTIONS.find((opt) => opt.code.toLowerCase() === lower);
  if (exact) return exact;

  const alias =
    GOOGLE_TRANSLATE_ALIASES[lower] || GOOGLE_TRANSLATE_ALIASES[lower.split(/[\s(]+/)[0]];
  if (alias) {
    return {
      code: alias.code,
      label: alias.label,
      shortLabel: alias.label.split(' (')[0],
      promptName: alias.label,
      ttsLang: alias.ttsLang,
      isRtl: alias.isRtl,
    };
  }

  const fuzzy = BOOK_LANGUAGE_OPTIONS.find(
    (opt) =>
      opt.label.toLowerCase() === lower ||
      opt.shortLabel.toLowerCase() === lower ||
      opt.promptName.toLowerCase().includes(lower)
  );
  if (fuzzy) return fuzzy;

  const cleanLabel = codeOrName.trim();
  return {
    code: normalizeLanguageCode(cleanLabel),
    label: cleanLabel,
    shortLabel: cleanLabel,
    promptName: cleanLabel,
    ttsLang: 'en-US',
    isRtl: /arabic|urdu|persian|farsi|hebrew|عرب|اردو|فارسی/i.test(cleanLabel),
  };
}

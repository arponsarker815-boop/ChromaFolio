import { HighlightColor, PageColorTheme, PaletteId } from '../types/ebook';

export const PAGE_SPECTRUM_THEMES: PageColorTheme[] = [
  {
    id: 'marigold-sun',
    name: 'Marigold Sun',
    paperBg: '#FFF8E8',
    paperGradient: 'linear-gradient(155deg, #FFFBF0 0%, #FFF2D1 55%, #FFE8B6 100%)',
    inkColor: '#2B2110',
    mutedInk: '#785E2B',
    accentColor: '#C25E00',
    accentSoft: 'rgba(217, 119, 6, 0.14)',
    borderColor: '#F3D89B',
    calloutBg: 'rgba(245, 158, 11, 0.12)',
    ornamentColor: '#D97706',
    badgeBg: '#FDE68A',
  },
  {
    id: 'botanical-mint',
    name: 'Botanical Mint',
    paperBg: '#ECFDF5',
    paperGradient: 'linear-gradient(155deg, #F4FEF9 0%, #E3FAEE 55%, #D1F5E3 100%)',
    inkColor: '#122B22',
    mutedInk: '#2E6B53',
    accentColor: '#047857',
    accentSoft: 'rgba(5, 150, 105, 0.14)',
    borderColor: '#A7E8CC',
    calloutBg: 'rgba(16, 185, 129, 0.11)',
    ornamentColor: '#059669',
    badgeBg: '#A7F3D0',
  },
  {
    id: 'cobalt-sky',
    name: 'Cobalt Sky',
    paperBg: '#EFF6FF',
    paperGradient: 'linear-gradient(155deg, #F6FAFF 0%, #E4F0FF 55%, #D5E6FF 100%)',
    inkColor: '#10213D',
    mutedInk: '#365685',
    accentColor: '#1D4ED8',
    accentSoft: 'rgba(37, 99, 235, 0.13)',
    borderColor: '#B8D4FE',
    calloutBg: 'rgba(59, 130, 246, 0.10)',
    ornamentColor: '#2563EB',
    badgeBg: '#BFDBFE',
  },
  {
    id: 'coral-blossom',
    name: 'Coral Blossom',
    paperBg: '#FFF1F2',
    paperGradient: 'linear-gradient(155deg, #FFF7F8 0%, #FFE6E9 55%, #FFD7DC 100%)',
    inkColor: '#35141C',
    mutedInk: '#8A3B4C',
    accentColor: '#BE123C',
    accentSoft: 'rgba(225, 29, 72, 0.13)',
    borderColor: '#FECDD3',
    calloutBg: 'rgba(244, 63, 94, 0.10)',
    ornamentColor: '#E11D48',
    badgeBg: '#FECDD3',
  },
  {
    id: 'lavender-mist',
    name: 'Lavender Mist',
    paperBg: '#F5F3FF',
    paperGradient: 'linear-gradient(155deg, #FAF8FF 0%, #EDE9FE 55%, #E0D9FE 100%)',
    inkColor: '#21183D',
    mutedInk: '#59478C',
    accentColor: '#6D28D9',
    accentSoft: 'rgba(124, 58, 237, 0.13)',
    borderColor: '#D4C7FC',
    calloutBg: 'rgba(139, 92, 246, 0.10)',
    ornamentColor: '#7C3AED',
    badgeBg: '#DDD6FE',
  },
  {
    id: 'terracotta-warm',
    name: 'Terracotta Dawn',
    paperBg: '#FFF4ED',
    paperGradient: 'linear-gradient(155deg, #FFF9F5 0%, #FFE8D9 55%, #FFD8BF 100%)',
    inkColor: '#361B11',
    mutedInk: '#87452C',
    accentColor: '#C2410C',
    accentSoft: 'rgba(234, 88, 12, 0.13)',
    borderColor: '#FED7AA',
    calloutBg: 'rgba(249, 115, 22, 0.11)',
    ornamentColor: '#EA580C',
    badgeBg: '#FED7AA',
  },
  {
    id: 'cyan-lagoon',
    name: 'Cyan Lagoon',
    paperBg: '#ECFEFF',
    paperGradient: 'linear-gradient(155deg, #F5FEFF 0%, #DCF9FD 55%, #C8F3FA 100%)',
    inkColor: '#0F2A33',
    mutedInk: '#23687A',
    accentColor: '#0E7490',
    accentSoft: 'rgba(8, 145, 178, 0.13)',
    borderColor: '#A5EBF7',
    calloutBg: 'rgba(6, 182, 212, 0.10)',
    ornamentColor: '#0891B2',
    badgeBg: '#A5F3FC',
  },
  {
    id: 'fuchsia-orchid',
    name: 'Orchid Bloom',
    paperBg: '#FDF4FF',
    paperGradient: 'linear-gradient(155deg, #FEF9FF 0%, #FAE8FF 55%, #F5D5FE 100%)',
    inkColor: '#32143B',
    mutedInk: '#7A358E',
    accentColor: '#A21CAF',
    accentSoft: 'rgba(192, 38, 211, 0.13)',
    borderColor: '#F0ABFC',
    calloutBg: 'rgba(217, 70, 239, 0.10)',
    ornamentColor: '#C026D3',
    badgeBg: '#F5D0FE',
  },
];

export const MIDNIGHT_SPECTRUM_THEMES: PageColorTheme[] = [
  {
    id: 'midnight-indigo',
    name: 'Midnight Indigo',
    paperBg: '#12182B',
    paperGradient: 'linear-gradient(155deg, #161E36 0%, #11172B 60%, #0D1222 100%)',
    inkColor: '#E9EEF9',
    mutedInk: '#93A7D1',
    accentColor: '#60A5FA',
    accentSoft: 'rgba(96, 165, 250, 0.18)',
    borderColor: '#253358',
    calloutBg: 'rgba(59, 130, 246, 0.14)',
    ornamentColor: '#60A5FA',
    badgeBg: '#1E3A8A',
  },
  {
    id: 'midnight-emerald',
    name: 'Deep Emerald',
    paperBg: '#0E201B',
    paperGradient: 'linear-gradient(155deg, #122923 0%, #0D1E19 60%, #091713 100%)',
    inkColor: '#E5F7F0',
    mutedInk: '#85C4AC',
    accentColor: '#34D399',
    accentSoft: 'rgba(52, 211, 153, 0.18)',
    borderColor: '#1E463A',
    calloutBg: 'rgba(16, 185, 129, 0.13)',
    ornamentColor: '#34D399',
    badgeBg: '#065F46',
  },
  {
    id: 'midnight-amber',
    name: 'Obsidian Amber',
    paperBg: '#1F1810',
    paperGradient: 'linear-gradient(155deg, #271E14 0%, #1D160E 60%, #16100A 100%)',
    inkColor: '#FBF1E3',
    mutedInk: '#D1B085',
    accentColor: '#FBBF24',
    accentSoft: 'rgba(251, 191, 36, 0.18)',
    borderColor: '#45341F',
    calloutBg: 'rgba(245, 158, 11, 0.14)',
    ornamentColor: '#FBBF24',
    badgeBg: '#78350F',
  },
  {
    id: 'midnight-plum',
    name: 'Velvet Plum',
    paperBg: '#1D142B',
    paperGradient: 'linear-gradient(155deg, #241936 0%, #1A1127 60%, #130C1D 100%)',
    inkColor: '#F3EBFF',
    mutedInk: '#B69CD9',
    accentColor: '#C084FC',
    accentSoft: 'rgba(192, 132, 252, 0.18)',
    borderColor: '#3A2657',
    calloutBg: 'rgba(168, 85, 247, 0.14)',
    ornamentColor: '#C084FC',
    badgeBg: '#581C87',
  },
];

export interface PalettePresetMeta {
  id: PaletteId;
  label: string;
  description: string;
  swatches: [string, string, string, string];
}

export const PALETTE_PRESETS: PalettePresetMeta[] = [
  {
    id: 'prismatic',
    label: 'Prismatic Auto-Cycle',
    description: 'Every page shifts through 8 luminous editorial hues',
    swatches: ['#FFF2D1', '#E3FAEE', '#E4F0FF', '#FFE6E9'],
  },
  {
    id: 'botanical',
    label: 'Botanical Sage',
    description: 'Fresh mint, lagoon teal, and organic emerald',
    swatches: ['#ECFDF5', '#D1F5E3', '#DCF9FD', '#047857'],
  },
  {
    id: 'marigold',
    label: 'Marigold & Ochre',
    description: 'Sunlit amber paper with warm terracotta accents',
    swatches: ['#FFF8E8', '#FFE8B6', '#FFE8D9', '#C25E00'],
  },
  {
    id: 'cobalt',
    label: 'Cobalt Blueprint',
    description: 'Crisp azure spreads with cyan technical highlights',
    swatches: ['#EFF6FF', '#D5E6FF', '#ECFEFF', '#1D4ED8'],
  },
  {
    id: 'coral',
    label: 'Coral Editorial',
    description: 'Rose-tinted pages with orchid & vermilion ink',
    swatches: ['#FFF1F2', '#FFD7DC', '#FAE8FF', '#BE123C'],
  },
  {
    id: 'lavender',
    label: 'Lavender Dusk',
    description: 'Soft violet mist paired with deep amethyst accents',
    swatches: ['#F5F3FF', '#E0D9FE', '#FDF4FF', '#6D28D9'],
  },
  {
    id: 'terracotta',
    label: 'Terracotta Dawn',
    description: 'Warm peach parchment with rich burnt-sienna headings',
    swatches: ['#FFF4ED', '#FFD8BF', '#FFF2D1', '#C2410C'],
  },
  {
    id: 'midnight',
    label: 'Midnight Prism',
    description: 'Jewel-toned dark pages with glowing pastel accents',
    swatches: ['#12182B', '#0E201B', '#1F1810', '#60A5FA'],
  },
];

export function getThemeForPage(
  paletteId: PaletteId,
  pageNumber: number,
  customThemeIndex?: number
): PageColorTheme {
  if (typeof customThemeIndex === 'number') {
    if (paletteId === 'midnight') {
      return MIDNIGHT_SPECTRUM_THEMES[
        ((customThemeIndex % MIDNIGHT_SPECTRUM_THEMES.length) + MIDNIGHT_SPECTRUM_THEMES.length) %
          MIDNIGHT_SPECTRUM_THEMES.length
      ];
    }
    return PAGE_SPECTRUM_THEMES[
      ((customThemeIndex % PAGE_SPECTRUM_THEMES.length) + PAGE_SPECTRUM_THEMES.length) %
        PAGE_SPECTRUM_THEMES.length
    ];
  }

  const idx = Math.max(0, pageNumber - 1);

  switch (paletteId) {
    case 'prismatic':
      return PAGE_SPECTRUM_THEMES[idx % PAGE_SPECTRUM_THEMES.length];
    case 'botanical':
      return idx % 2 === 0 ? PAGE_SPECTRUM_THEMES[1] : PAGE_SPECTRUM_THEMES[6];
    case 'marigold':
      return idx % 2 === 0 ? PAGE_SPECTRUM_THEMES[0] : PAGE_SPECTRUM_THEMES[5];
    case 'cobalt':
      return idx % 2 === 0 ? PAGE_SPECTRUM_THEMES[2] : PAGE_SPECTRUM_THEMES[6];
    case 'coral':
      return idx % 2 === 0 ? PAGE_SPECTRUM_THEMES[3] : PAGE_SPECTRUM_THEMES[7];
    case 'lavender':
      return idx % 2 === 0 ? PAGE_SPECTRUM_THEMES[4] : PAGE_SPECTRUM_THEMES[7];
    case 'terracotta':
      return idx % 2 === 0 ? PAGE_SPECTRUM_THEMES[5] : PAGE_SPECTRUM_THEMES[0];
    case 'midnight':
      return MIDNIGHT_SPECTRUM_THEMES[idx % MIDNIGHT_SPECTRUM_THEMES.length];
    default:
      return PAGE_SPECTRUM_THEMES[idx % PAGE_SPECTRUM_THEMES.length];
  }
}

export const HIGHLIGHT_STYLES: Record<
  HighlightColor,
  { label: string; bg: string; darkBg: string; swatch: string }
> = {
  amber: {
    label: 'Marigold',
    bg: 'rgba(251, 191, 36, 0.38)',
    darkBg: 'rgba(251, 191, 36, 0.30)',
    swatch: '#F59E0B',
  },
  rose: {
    label: 'Coral',
    bg: 'rgba(251, 113, 133, 0.36)',
    darkBg: 'rgba(251, 113, 133, 0.28)',
    swatch: '#F43F5E',
  },
  mint: {
    label: 'Mint',
    bg: 'rgba(52, 211, 153, 0.36)',
    darkBg: 'rgba(52, 211, 153, 0.28)',
    swatch: '#10B981',
  },
  sky: {
    label: 'Cobalt',
    bg: 'rgba(96, 165, 250, 0.36)',
    darkBg: 'rgba(96, 165, 250, 0.28)',
    swatch: '#3B82F6',
  },
  violet: {
    label: 'Orchid',
    bg: 'rgba(192, 132, 252, 0.36)',
    darkBg: 'rgba(192, 132, 252, 0.28)',
    swatch: '#8B5CF6',
  },
};

export interface BookFontOption {
  id: import('../types/ebook').ReaderFont;
  label: string;
  sample: string;
  className: string;
  tag: string;
}

export const BOOK_FONT_OPTIONS: BookFontOption[] = [
  { id: 'serif', label: 'Fraunces', sample: 'Aa', className: 'font-book-serif', tag: 'Display Serif' },
  { id: 'classic', label: 'Lora Classic', sample: 'Aa', className: 'font-book-classic', tag: 'Book Serif' },
  { id: 'literary', label: 'Playfair', sample: 'Aa', className: 'font-book-literary', tag: 'Editorial' },
  { id: 'editorial', label: 'Merriweather', sample: 'Aa', className: 'font-book-editorial', tag: 'Long-Form' },
  { id: 'sans', label: 'Jakarta Sans', sample: 'Aa', className: 'font-book-sans', tag: 'Modern Clean' },
  { id: 'humanist', label: 'Outfit', sample: 'Aa', className: 'font-book-humanist', tag: 'Geometric' },
  { id: 'indic-serif', label: 'বাংলা · সাহিত্য', sample: 'অ আ', className: 'font-book-indic-serif', tag: 'Indic Serif' },
  { id: 'indic', label: 'বাংলা · हिन्दी', sample: 'ক ख', className: 'font-book-indic', tag: 'Indic Clean' },
  { id: 'mono', label: 'JetBrains', sample: 'f(x)', className: 'font-book-mono', tag: 'Formula Mono' },
  { id: 'dyslexic', label: 'Focus Wide', sample: 'Aa', className: 'font-book-sans tracking-[0.03em]', tag: 'Dyslexia Aid' },
];

export interface WordColorPreset {
  id: string;
  label: string;
  hex: string | null;
  swatch: string;
  ring?: string;
}

export const WORD_COLOR_PRESETS: WordColorPreset[] = [
  { id: 'auto', label: 'Theme Auto', hex: null, swatch: 'conic-gradient(#1F2937, #C25E00, #047857, #1D4ED8, #1F2937)' },
  { id: 'obsidian', label: 'Obsidian Ink', hex: '#111827', swatch: '#111827' },
  { id: 'espresso', label: 'Espresso Sepia', hex: '#3D2314', swatch: '#3D2314' },
  { id: 'indigo', label: 'Royal Indigo', hex: '#1E1B4B', swatch: '#1E1B4B' },
  { id: 'sapphire', label: 'Deep Sapphire', hex: '#0F3A68', swatch: '#0F3A68' },
  { id: 'emerald', label: 'Forest Emerald', hex: '#064E3B', swatch: '#064E3B' },
  { id: 'burgundy', label: 'Burgundy Wine', hex: '#681129', swatch: '#681129' },
  { id: 'plum', label: 'Imperial Plum', hex: '#43145B', swatch: '#43145B' },
  { id: 'ivory', label: 'Crisp Ivory', hex: '#F8FAFC', swatch: '#F8FAFC' },
];

export const HEADING_COLOR_PRESETS: WordColorPreset[] = [
  { id: 'auto', label: 'Theme Auto', hex: null, swatch: 'conic-gradient(#D97706, #E11D48, #2563EB, #059669, #D97706)' },
  { id: 'gold', label: 'Burnished Gold', hex: '#B45309', swatch: '#B45309' },
  { id: 'royal', label: 'Cobalt Royal', hex: '#1D4ED8', swatch: '#1D4ED8' },
  { id: 'jade', label: 'Emerald Jewel', hex: '#047857', swatch: '#047857' },
  { id: 'crimson', label: 'Crimson Ruby', hex: '#BE123C', swatch: '#BE123C' },
  { id: 'amethyst', label: 'Orchid Crown', hex: '#7E22CE', swatch: '#7E22CE' },
  { id: 'amber-glow', label: 'Luminous Gold', hex: '#FBBF24', swatch: '#FBBF24' },
];


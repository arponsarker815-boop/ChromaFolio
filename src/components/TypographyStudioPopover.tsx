import React from 'react';
import { Check, Minus, Plus, RotateCcw, Sparkles, Type, X } from 'lucide-react';
import {
  BOOK_FONT_OPTIONS,
  HEADING_COLOR_PRESETS,
  WORD_COLOR_PRESETS,
} from '../data/palettes';
import { PageColorTheme, ReaderFont, ReaderSettings } from '../types/ebook';

interface TypographyStudioPopoverProps {
  settings: ReaderSettings;
  pageTheme: PageColorTheme;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  onOpenFullAppearance: () => void;
  onClose: () => void;
}

export const TypographyStudioPopover: React.FC<TypographyStudioPopoverProps> = ({
  settings,
  pageTheme,
  onUpdateSettings,
  onOpenFullAppearance,
  onClose,
}) => {
  const activeFontMeta =
    BOOK_FONT_OPTIONS.find((f) => f.id === settings.font) ?? BOOK_FONT_OPTIONS[0];

  const resolvedInk =
    settings.textColorId === 'custom' && settings.customTextColor
      ? settings.customTextColor
      : WORD_COLOR_PRESETS.find((c) => c.id === (settings.textColorId ?? 'auto'))?.hex ??
        pageTheme.inkColor;

  const resolvedHeading =
    settings.headingColorId === 'custom' && settings.customHeadingColor
      ? settings.customHeadingColor
      : HEADING_COLOR_PRESETS.find((c) => c.id === (settings.headingColorId ?? 'auto'))?.hex ??
        pageTheme.accentColor;

  const activeWordLabel =
    settings.textColorId === 'custom'
      ? settings.customTextColor || 'Custom Ink'
      : WORD_COLOR_PRESETS.find((c) => c.id === (settings.textColorId ?? 'auto'))?.label ??
        'Theme Auto';

  const activeHeadingLabel =
    settings.headingColorId === 'custom'
      ? settings.customHeadingColor || 'Custom Accent'
      : HEADING_COLOR_PRESETS.find((c) => c.id === (settings.headingColorId ?? 'auto'))?.label ??
        'Theme Auto';

  const fontClassMap: Record<ReaderFont, string> = {
    serif: 'font-book-serif',
    classic: 'font-book-classic',
    literary: 'font-book-literary',
    editorial: 'font-book-editorial',
    sans: 'font-book-sans',
    humanist: 'font-book-humanist',
    mono: 'font-book-mono',
    indic: 'font-book-indic',
    'indic-serif': 'font-book-indic-serif',
    dyslexic: 'font-book-sans tracking-[0.03em]',
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="w-[330px] sm:w-[400px] max-h-[82vh] overflow-y-auto studio-scroll rounded-2xl border border-zinc-200/90 dark:border-zinc-700/90 bg-white/95 dark:bg-[#121621]/95 backdrop-blur-xl shadow-2xl p-4 space-y-4 text-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Type className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              Font & Word Colour Studio
            </h3>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Live editorial typography & custom ink
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Reset typography & colour to page theme auto"
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
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Auto</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close font studio"
            className="p-1 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live Ink & Font Preview Card */}
      <div
        className={`rounded-xl border px-3.5 py-2.5 shadow-inner ${fontClassMap[settings.font] ?? 'font-book-serif'}`}
        style={{
          background: pageTheme.paperGradient,
          borderColor: pageTheme.borderColor,
          color: resolvedInk,
          letterSpacing:
            settings.letterSpacing === 'tight'
              ? '-0.015em'
              : settings.letterSpacing === 'relaxed'
                ? '0.02em'
                : settings.letterSpacing === 'wide'
                  ? '0.045em'
                  : undefined,
        }}
      >
        <div className="text-sm font-bold leading-snug" style={{ color: resolvedHeading }}>
          Chapter Style · {activeFontMeta.label}
        </div>
        <p className="text-xs mt-0.5 leading-relaxed opacity-95">
          Every luminous word flows smoothly · জ্ঞানই আলোকিত পথ
        </p>
      </div>

      {/* Font Size & Line Height Quick Stepper */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2 bg-zinc-50/70 dark:bg-zinc-900/50">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
            Text Size
          </div>
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })
              }
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              aria-label="Decrease font size"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              {settings.fontSize}px
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ fontSize: Math.min(26, settings.fontSize + 1) })
              }
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              aria-label="Increase font size"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2 bg-zinc-50/70 dark:bg-zinc-900/50">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
            Word Spacing
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                { id: 'tight', label: 'T' },
                { id: 'normal', label: 'N' },
                { id: 'relaxed', label: 'R' },
                { id: 'wide', label: 'W' },
              ] as const
            ).map((sp) => (
              <button
                key={sp.id}
                type="button"
                title={`Letter spacing: ${sp.id}`}
                onClick={() => onUpdateSettings({ letterSpacing: sp.id })}
                className={`py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  (settings.letterSpacing ?? 'normal') === sp.id
                    ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
                }`}
              >
                {sp.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Book Font Family Cards */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
          Book Text Font Family
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {BOOK_FONT_OPTIONS.map((fontOpt) => {
            const active = settings.font === fontOpt.id;
            return (
              <button
                key={fontOpt.id}
                type="button"
                onClick={() => onUpdateSettings({ font: fontOpt.id })}
                className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border text-left transition-all ${
                  active
                    ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/30 text-zinc-900 dark:text-zinc-100 ring-1 ring-amber-500/40'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                <div className="min-w-0">
                  <div className={`text-xs font-semibold truncate ${fontOpt.className}`}>
                    {fontOpt.label}
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {fontOpt.tag}
                  </div>
                </div>
                <span className={`text-sm font-semibold shrink-0 ${fontOpt.className}`}>
                  {fontOpt.sample}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Word / Ink Colour Swatches */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            Book Word / Ink Colour
          </span>
          <span className="font-medium text-amber-600 dark:text-amber-400">
            {activeWordLabel}
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
                className={`relative w-7 h-7 rounded-full border transition-transform flex items-center justify-center ${
                  active
                    ? 'ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-[#121621] scale-110 border-zinc-900 dark:border-white'
                    : 'border-black/20 dark:border-white/25 hover:scale-105'
                }`}
                style={{ background: preset.swatch }}
              >
                {active && (
                  <Check
                    className={`w-3.5 h-3.5 ${
                      preset.id === 'ivory' || preset.id === 'auto'
                        ? 'text-zinc-900'
                        : 'text-white'
                    }`}
                  />
                )}
              </button>
            );
          })}

          <label
            title="Choose custom word ink colour"
            className={`relative w-7 h-7 rounded-full border cursor-pointer flex items-center justify-center text-xs font-bold transition-transform hover:scale-105 ${
              settings.textColorId === 'custom'
                ? 'ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-[#121621] border-amber-500 text-white'
                : 'border-dashed border-zinc-400 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300'
            }`}
            style={{
              backgroundColor:
                settings.textColorId === 'custom'
                  ? settings.customTextColor || '#1E293B'
                  : 'transparent',
            }}
          >
            {settings.textColorId === 'custom' ? <Check className="w-3.5 h-3.5" /> : '+'}
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

      {/* Heading & Drop-Cap Accent Colour */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            Heading & Accent Colour
          </span>
          <span className="font-medium text-amber-600 dark:text-amber-400">
            {activeHeadingLabel}
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
                className={`relative w-7 h-7 rounded-full border transition-transform flex items-center justify-center ${
                  active
                    ? 'ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-[#121621] scale-110 border-zinc-900 dark:border-white'
                    : 'border-black/20 dark:border-white/25 hover:scale-105'
                }`}
                style={{ background: preset.swatch }}
              >
                {active && <Check className="w-3.5 h-3.5 text-white" />}
              </button>
            );
          })}

          <label
            title="Choose custom heading colour"
            className={`relative w-7 h-7 rounded-full border cursor-pointer flex items-center justify-center text-xs font-bold transition-transform hover:scale-105 ${
              settings.headingColorId === 'custom'
                ? 'ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-[#121621] border-amber-500 text-white'
                : 'border-dashed border-zinc-400 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300'
            }`}
            style={{
              backgroundColor:
                settings.headingColorId === 'custom'
                  ? settings.customHeadingColor || '#B45309'
                  : 'transparent',
            }}
          >
            {settings.headingColorId === 'custom' ? <Check className="w-3.5 h-3.5" /> : '+'}
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

      <button
        type="button"
        onClick={() => {
          onClose();
          onOpenFullAppearance();
        }}
        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
        <span>More Paper Colours & Binding Styles</span>
      </button>
    </div>
  );
};

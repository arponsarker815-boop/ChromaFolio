import React from 'react';
import { BookTopicId, PageColorTheme, PageVisualStyle } from '../types/ebook';
import { TOPIC_CATALOG } from '../utils/topicGraphics';

interface TopicIllustrationProps {
  topic: BookTopicId;
  styleMode: Exclude<PageVisualStyle, 'auto'>;
  theme: PageColorTheme;
  pageNumber: number;
}

export const TopicIllustration: React.FC<TopicIllustrationProps> = ({
  topic,
  styleMode,
  theme,
  pageNumber,
}) => {
  if (styleMode === 'minimal' || styleMode === 'editorial') {
    return null;
  }

  const meta = TOPIC_CATALOG[topic];

  // CARTOON MODE: Friendly expressive character illustrations tuned to each topic & page colour!
  if (styleMode === 'cartoon') {
    return (
      <div
        className="mb-5 rounded-2xl border p-3.5 sm:p-4 flex items-center gap-4"
        style={{
          backgroundColor: theme.calloutBg,
          borderColor: theme.borderColor,
        }}
      >
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 border"
          style={{ backgroundColor: theme.paperBg, borderColor: theme.borderColor }}
        >
          {topic === 'science' && (
            <svg viewBox="0 0 64 64" className="w-12 h-12" fill="none">
              <ellipse cx="32" cy="32" rx="24" ry="10" transform="rotate(-28 32 32)" stroke={theme.accentColor} strokeWidth="2.5" />
              <ellipse cx="32" cy="32" rx="24" ry="10" transform="rotate(28 32 32)" stroke={theme.ornamentColor} strokeWidth="2.5" />
              <circle cx="32" cy="32" r="11" fill={theme.badgeBg} stroke={theme.accentColor} strokeWidth="2" />
              <circle cx="28.5" cy="30" r="1.6" fill={theme.inkColor} />
              <circle cx="35.5" cy="30" r="1.6" fill={theme.inkColor} />
              <path d="M28.5 34.5c1.5 2 5.5 2 7 0" stroke={theme.inkColor} strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="51" cy="19" r="3" fill={theme.ornamentColor} />
            </svg>
          )}
          {topic === 'nature' && (
            <svg viewBox="0 0 64 64" className="w-12 h-12" fill="none">
              <path d="M16 46C16 24 32 12 50 14C50 34 38 48 16 46Z" fill={theme.badgeBg} stroke={theme.accentColor} strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M14 48C22 40 31 31 44 20" stroke={theme.accentColor} strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="30" cy="29" r="1.7" fill={theme.inkColor} />
              <circle cx="38" cy="29" r="1.7" fill={theme.inkColor} />
              <path d="M31 34c1.8 1.8 4.2 1.8 6 0" stroke={theme.inkColor} strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="20" cy="20" r="3" fill={theme.ornamentColor} />
            </svg>
          )}
          {topic === 'math' && (
            <svg viewBox="0 0 64 64" className="w-12 h-12" fill="none">
              <polygon points="32,10 54,50 10,50" fill={theme.badgeBg} stroke={theme.accentColor} strokeWidth="2.5" strokeLinejoin="round" />
              <circle cx="27" cy="35" r="1.8" fill={theme.inkColor} />
              <circle cx="37" cy="35" r="1.8" fill={theme.inkColor} />
              <path d="M28 40c2 2.2 6 2.2 8 0" stroke={theme.inkColor} strokeWidth="1.8" strokeLinecap="round" />
              <text x="45" y="20" fill={theme.accentColor} fontSize="11" fontWeight="bold">π</text>
            </svg>
          )}
          {topic === 'art' && (
            <svg viewBox="0 0 64 64" className="w-12 h-12" fill="none">
              <path d="M32 12C19 12 10 21 10 32C10 43 19 52 30 52C34 52 36 49 36 46C36 44 35 42 37 40C39 38 43 39 46 39C51 39 54 35 54 30C54 20 44 12 32 12Z" fill={theme.badgeBg} stroke={theme.accentColor} strokeWidth="2.3" />
              <circle cx="22" cy="25" r="3" fill={theme.accentColor} />
              <circle cx="32" cy="20" r="3" fill={theme.ornamentColor} />
              <circle cx="42" cy="25" r="3" fill={theme.inkColor} opacity="0.7" />
              <circle cx="24" cy="35" r="1.5" fill={theme.inkColor} />
              <circle cx="31" cy="35" r="1.5" fill={theme.inkColor} />
              <path d="M25 39c1.5 1.5 4 1.5 5.5 0" stroke={theme.inkColor} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
          {topic === 'tech' && (
            <svg viewBox="0 0 64 64" className="w-12 h-12" fill="none">
              <rect x="14" y="18" width="36" height="30" rx="8" fill={theme.badgeBg} stroke={theme.accentColor} strokeWidth="2.4" />
              <line x1="32" y1="10" x2="32" y2="18" stroke={theme.accentColor} strokeWidth="2.4" />
              <circle cx="32" cy="9" r="3" fill={theme.ornamentColor} />
              <circle cx="25" cy="31" r="2.5" fill={theme.inkColor} />
              <circle cx="39" cy="31" r="2.5" fill={theme.inkColor} />
              <path d="M26 39h12" stroke={theme.accentColor} strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          )}
          {topic === 'history' && (
            <svg viewBox="0 0 64 64" className="w-12 h-12" fill="none">
              <path d="M14 18C22 14 28 16 32 20C36 16 42 14 50 18V48C42 44 36 46 32 50C28 46 22 44 14 48V18Z" fill={theme.badgeBg} stroke={theme.accentColor} strokeWidth="2.3" strokeLinejoin="round" />
              <line x1="32" y1="20" x2="32" y2="50" stroke={theme.accentColor} strokeWidth="2" />
              <circle cx="22" cy="30" r="1.6" fill={theme.inkColor} />
              <circle cx="42" cy="30" r="1.6" fill={theme.inkColor} />
              <path d="M21 36c2 1.5 4 1.5 6 0" stroke={theme.inkColor} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold" style={{ color: theme.accentColor }}>
            Cartoon Guide · {meta.label}
          </div>
          <div className="text-xs opacity-80 leading-snug mt-0.5">
            {meta.tagline} — illustrated spread for Page {pageNumber}.
          </div>
        </div>
      </div>
    );
  }

  // INFOGRAPHIC MODE: Crisp technical/editorial vector diagram header matching the page topic
  return (
    <div
      className="mb-5 rounded-xl border p-3.5 flex items-center justify-between gap-4"
      style={{
        backgroundColor: theme.calloutBg,
        borderColor: theme.borderColor,
      }}
    >
      <div className="min-w-0">
        <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: theme.accentColor }}>
          Visual Diagram · {meta.label}
        </div>
        <div className="text-xs opacity-80 mt-0.5 truncate">{meta.tagline}</div>
      </div>

      <svg viewBox="0 0 120 44" className="w-28 h-10 shrink-0" fill="none">
        {topic === 'science' && (
          <>
            <ellipse cx="60" cy="22" rx="46" ry="15" stroke={theme.accentColor} strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx="60" cy="22" r="7" fill={theme.ornamentColor} />
            <circle cx="22" cy="14" r="3.5" fill={theme.accentColor} />
            <circle cx="96" cy="29" r="3" fill={theme.accentColor} />
          </>
        )}
        {topic === 'nature' && (
          <>
            <path d="M12 34C32 34 48 10 108 10" stroke={theme.accentColor} strokeWidth="1.8" />
            <path d="M36 28C42 18 52 14 60 18C52 24 44 28 36 28Z" fill={theme.badgeBg} stroke={theme.accentColor} strokeWidth="1.4" />
            <path d="M68 20C74 10 86 8 92 14C84 20 74 22 68 20Z" fill={theme.badgeBg} stroke={theme.ornamentColor} strokeWidth="1.4" />
          </>
        )}
        {topic === 'math' && (
          <>
            <line x1="12" y1="36" x2="108" y2="36" stroke={theme.mutedInk} strokeWidth="1.2" />
            <line x1="20" y1="6" x2="20" y2="40" stroke={theme.mutedInk} strokeWidth="1.2" />
            <path d="M20 34Q58 6 102 18" stroke={theme.accentColor} strokeWidth="2" />
            <circle cx="62" cy="17" r="3" fill={theme.ornamentColor} />
          </>
        )}
        {topic === 'art' && (
          <>
            <rect x="10" y="10" width="20" height="24" rx="4" fill={theme.badgeBg} stroke={theme.accentColor} strokeWidth="1.4" />
            <rect x="36" y="10" width="20" height="24" rx="4" fill={theme.accentSoft} stroke={theme.ornamentColor} strokeWidth="1.4" />
            <circle cx="84" cy="22" r="11" stroke={theme.accentColor} strokeWidth="1.6" />
            <circle cx="96" cy="22" r="11" stroke={theme.ornamentColor} strokeWidth="1.6" />
          </>
        )}
        {topic === 'tech' && (
          <>
            <rect x="10" y="14" width="20" height="16" rx="3" stroke={theme.accentColor} strokeWidth="1.5" fill={theme.badgeBg} />
            <line x1="30" y1="22" x2="48" y2="22" stroke={theme.accentColor} strokeWidth="1.5" />
            <rect x="48" y="14" width="20" height="16" rx="3" stroke={theme.ornamentColor} strokeWidth="1.5" />
            <line x1="68" y1="22" x2="88" y2="22" stroke={theme.ornamentColor} strokeWidth="1.5" />
            <circle cx="98" cy="22" r="7" fill={theme.accentColor} />
          </>
        )}
        {topic === 'history' && (
          <>
            <line x1="12" y1="22" x2="108" y2="22" stroke={theme.borderColor} strokeWidth="2" />
            <circle cx="24" cy="22" r="5" fill={theme.accentColor} />
            <circle cx="60" cy="22" r="6" fill={theme.ornamentColor} />
            <circle cx="96" cy="22" r="5" fill={theme.badgeBg} stroke={theme.accentColor} strokeWidth="1.8" />
          </>
        )}
      </svg>
    </div>
  );
};

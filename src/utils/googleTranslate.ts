import { normalizeLanguageCode } from './languages';

declare global {
  interface Window {
    google?: {
      translate?: {
        TranslateElement?: new (
          options: {
            pageLanguage: string;
            autoDisplay?: boolean;
            layout?: number;
          },
          elementId: string
        ) => unknown;
      };
    };
    __chromaGoogleTranslateInit?: () => void;
  }
}

const GTX_CHUNK_LIMIT = 1400;

function splitTextIntoChunks(text: string, maxLen = GTX_CHUNK_LIMIT): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  const paragraphs = trimmed.split(/\n{2,}/);
  const chunks: string[] = [];
  let buffer = '';

  const pushBuffer = () => {
    if (buffer.trim()) {
      chunks.push(buffer.trim());
      buffer = '';
    }
  };

  for (const para of paragraphs) {
    if ((buffer + '\n\n' + para).length <= maxLen) {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
      continue;
    }
    pushBuffer();

    if (para.length <= maxLen) {
      buffer = para;
      continue;
    }

    // Split overly long paragraph by sentences
    const sentences = para.split(/(?<=[.!?।॥])\s+/);
    for (const s of sentences) {
      if ((buffer + ' ' + s).length <= maxLen) {
        buffer = buffer ? `${buffer} ${s}` : s;
      } else {
        pushBuffer();
        if (s.length <= maxLen) {
          buffer = s;
        } else {
          for (let i = 0; i < s.length; i += maxLen) {
            chunks.push(s.slice(i, i + maxLen));
          }
        }
      }
    }
  }
  pushBuffer();
  return chunks;
}

async function fetchGoogleGtxChunk(text: string, targetLangCode: string): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6500);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      targetLangCode
    )}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Google Translate HTTP ${res.status}`);
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('Unexpected Google Translate response');
    }
    const translated = (data[0] as Array<unknown>)
      .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
      .join('');
    if (!translated.trim()) {
      throw new Error('Empty Google Translate output');
    }
    return translated;
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Translate arbitrary text using Google Translate directly from the user's browser.
 * Preserves paragraph structure across chunks.
 */
export async function translateTextWithGoogleGtx(
  text: string,
  targetLangOrCode: string
): Promise<string> {
  const tl = normalizeLanguageCode(targetLangOrCode);
  const chunks = splitTextIntoChunks(text);
  if (chunks.length === 0) return '';

  const translatedChunks: string[] = [];
  for (const chunk of chunks) {
    const out = await fetchGoogleGtxChunk(chunk, tl);
    translatedChunks.push(out);
  }
  return translatedChunks.join('\n\n');
}

/**
 * Translate a structured book page directly through Google Translate GTX.
 * Uses a single batched request when total page length fits, then splits reliably if needed.
 */
export async function translateBookPageWithGoogleGtx(payload: {
  bookTitle?: string;
  chapterTitle?: string;
  blocks: Array<{ id: string; type: string; text: string }>;
  targetLanguage: string;
}): Promise<{
  translatedBookTitle: string;
  translatedChapterTitle: string;
  translatedBlocks: Array<{ id: string; text: string }>;
}> {
  const tl = normalizeLanguageCode(payload.targetLanguage);
  const safeBlocks = payload.blocks.filter((b) => b.text.trim().length > 0);

  const translatedBookTitle = payload.bookTitle?.trim()
    ? await translateTextWithGoogleGtx(payload.bookTitle, tl)
    : '';
  const translatedChapterTitle = payload.chapterTitle?.trim()
    ? await translateTextWithGoogleGtx(payload.chapterTitle, tl)
    : '';

  const translatedBlocks: Array<{ id: string; text: string }> = [];
  // Translate blocks in small concurrent groups of 3 for speed and clean block boundaries
  for (let i = 0; i < safeBlocks.length; i += 3) {
    const slice = safeBlocks.slice(i, i + 3);
    const results = await Promise.all(
      slice.map(async (blk) => {
        const text = await translateTextWithGoogleGtx(blk.text, tl);
        return { id: blk.id, text };
      })
    );
    translatedBlocks.push(...results);
  }

  return {
    translatedBookTitle,
    translatedChapterTitle,
    translatedBlocks,
  };
}

// --- Official Google Website Translator Widget Bridge (130+ Languages) ---
let googleScriptPromise: Promise<boolean> | null = null;
let widgetMountedId: string | null = null;

export function mountGoogleTranslateWidget(containerId: string): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  const mountNow = () => {
    const el = document.getElementById(containerId);
    const TranslateElement = window.google?.translate?.TranslateElement;
    if (!el || !TranslateElement) return false;
    if (widgetMountedId === containerId && el.querySelector('.goog-te-combo')) {
      return true;
    }
    el.innerHTML = '';
    new TranslateElement(
      {
        pageLanguage: 'auto',
        autoDisplay: false,
      },
      containerId
    );
    widgetMountedId = containerId;
    return true;
  };

  if (window.google?.translate?.TranslateElement) {
    return Promise.resolve(mountNow());
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise<boolean>((resolve) => {
      window.__chromaGoogleTranslateInit = () => {
        resolve(mountNow());
      };
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-chroma-google-translate="true"]'
      );
      if (existing) {
        window.setTimeout(() => resolve(mountNow()), 300);
        return;
      }
      const script = document.createElement('script');
      script.src =
        'https://translate.google.com/translate_a/element.js?cb=__chromaGoogleTranslateInit';
      script.async = true;
      script.dataset.chromaGoogleTranslate = 'true';
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  } else {
    return googleScriptPromise.then(() => mountNow());
  }

  return googleScriptPromise;
}

export function setGoogleLiveWidgetLanguage(langCode: string): boolean {
  const select = document.querySelector<HTMLSelectElement>('.goog-te-combo');
  if (!select) return false;
  const targetVal = langCode === 'original' ? '' : normalizeLanguageCode(langCode);
  select.value = targetVal;
  select.dispatchEvent(new Event('change'));
  return true;
}

export function openInGoogleTranslateTab(text: string, targetLangCode: string): string {
  const tl = normalizeLanguageCode(targetLangCode);
  return `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(tl)}&text=${encodeURIComponent(
    text.slice(0, 3000)
  )}&op=translate`;
}

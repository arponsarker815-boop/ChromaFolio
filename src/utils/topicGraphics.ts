import { BookTopicId, EbookPage } from '../types/ebook';

export interface TopicMeta {
  id: BookTopicId;
  label: string;
  tagline: string;
}

export const TOPIC_CATALOG: Record<BookTopicId, TopicMeta> = {
  science: {
    id: 'science',
    label: 'Science & Cosmos',
    tagline: 'Physics, light, optics & celestial mechanics',
  },
  nature: {
    id: 'nature',
    label: 'Nature & Biology',
    tagline: 'Living cells, botanical forms & ecosystems',
  },
  math: {
    id: 'math',
    label: 'Math & Formulas',
    tagline: 'Equations, ratios, geometry & proofs',
  },
  art: {
    id: 'art',
    label: 'Art & Design',
    tagline: 'Colour theory, typography & visual rhythm',
  },
  history: {
    id: 'history',
    label: 'Literature & History',
    tagline: 'Narratives, manuscripts & human ideas',
  },
  tech: {
    id: 'tech',
    label: 'Tech & Systems',
    tagline: 'Algorithms, circuits & structured logic',
  },
};

const TOPIC_KEYWORDS: Record<BookTopicId, string[]> = {
  science: [
    'light', 'prism', 'wavelength', 'photon', 'orbit', 'planet', 'kepler', 'galaxy',
    'atom', 'energy', 'physics', 'force', 'spectrum', 'rayleigh', 'gravity', 'solar',
    'বিজ্ঞান', 'আলো', 'মহাকাশ', 'শক্তি', 'विज्ञान', 'प्रकाश', 'ऊर्जा',
  ],
  nature: [
    'leaf', 'leaves', 'fern', 'plant', 'botanical', 'cell', 'chlorophyll', 'stoma',
    'dew', 'moisture', 'biology', 'species', 'tree', 'root', 'water', 'ecology',
    'প্রকৃতি', 'পাতা', 'কোষ', 'উদ্ভিদ', 'प्रकृति', 'पत्ता', 'जीव',
  ],
  math: [
    'formula', 'equation', 'geometry', 'angle', 'ratio', 'fibonacci', 'logarithm',
    'theorem', 'proof', 'hexagon', 'spiral', '137.5', 'percent', 'resonance', 'calculate',
    'সূত্র', 'গণিত', 'কোণ', 'অনুপাত', 'सूत्र', 'गणित', 'समीकरण',
  ],
  art: [
    'colour', 'color', 'design', 'grid', 'typography', 'pigment', 'parchment', 'margin',
    'ink', 'aesthetic', 'brush', 'canvas', 'illustration', 'sunset', 'crimson', 'cobalt',
    'রঙ', 'নকশা', 'শিল্প', 'रंग', 'डिज़ाइन', 'कला',
  ],
  tech: [
    'computer', 'algorithm', 'data', 'digital', 'code', 'software', 'network', 'circuit',
    'system', 'engineering', 'vessel', 'machine', 'program', 'server',
    'প্রযুক্তি', 'কম্পিউটার', 'তথ্য', 'तकनीक', 'कंप्यूटर', 'डेटा',
  ],
  history: [
    'century', 'ancient', 'manuscript', 'navigator', 'desert', 'memory', 'story',
    'history', 'king', 'empire', 'philosopher', 'book', 'reader', 'prose',
    'ইতিহাস', 'গল্প', 'সাহিত্য', 'বই', 'इतिहास', 'कहानी', 'साहित्य',
  ],
};

export function detectPageTopic(page: EbookPage): BookTopicId {
  if (page.customTopic) return page.customTopic;
  const corpus = `${page.chapterTitle} ${page.rawText}`.toLowerCase();

  let bestTopic: BookTopicId = 'history';
  let bestScore = 0;

  (Object.keys(TOPIC_KEYWORDS) as BookTopicId[]).forEach((topic) => {
    let score = 0;
    for (const kw of TOPIC_KEYWORDS[topic]) {
      if (corpus.includes(kw)) {
        score += page.chapterTitle.toLowerCase().includes(kw) ? 3 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  });

  if (bestScore === 0) {
    const order: BookTopicId[] = ['art', 'science', 'nature', 'math', 'history', 'tech'];
    return order[(page.pageNumber - 1) % order.length];
  }
  return bestTopic;
}

export interface AutoHighlightMatch {
  phrase: string;
  kind: 'formula' | 'important';
}

/**
 * Extracts formulas, quantitative laws, ratios, and high-signal key phrases
 * from any paragraph/sentence so students can spot critical concepts at a glance.
 */
export function findAutoHighlights(text: string): AutoHighlightMatch[] {
  const matches: AutoHighlightMatch[] = [];
  const seen = new Set<string>();

  const add = (phrase: string, kind: 'formula' | 'important') => {
    const clean = phrase.trim();
    if (clean.length < 3 || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());
    matches.push({ phrase: clean, kind });
  };

  // 1. Equations & mathematical / chemical formulas (e.g. E = mc^2, a + b = c, 137.5°, 3:2, H2O)
  const formulaRegex =
    /(?:[A-Za-z0-9α-ωΑ-Ω²³₀-₉]+\s*[=≈≤≥]\s*[A-Za-z0-9α-ωΑ-Ω²³₀-₉+\-*/^().\s]{1,24})|(?:\b\d+(?:\.\d+)?\s*(?:°|%|km\/s|m\/s|Hz|nm)\b)|(?:\b\d+:\d+\b)/g;
  const formulaHits = text.match(formulaRegex) ?? [];
  for (const hit of formulaHits) {
    add(hit, 'formula');
  }

  // 2. Important conceptual terms / laws / key definitions
  const keyTermRegex =
    /\b(?:Golden Angle|Murray’s Law|Rayleigh scattering|Fibonacci|Kepler|Surface tension|Structural colour|Hexagonal packing|Chromatic memory|logarithmic spirals|photonic lattices|orbital resonance|electromagnetic energy)\b/gi;
  const termHits = text.match(keyTermRegex) ?? [];
  for (const hit of termHits) {
    add(hit, 'important');
  }

  // 3. Sentences starting or containing "Rule:", "Formula:", "Law:", "Note:", "Key:", "Important:", "সূত্র", "গুরুত্বপূর্ণ"
  const sentenceRegex = /[^.!?।]+[.!?।]?/g;
  const sentences = text.match(sentenceRegex) ?? [];
  for (const s of sentences) {
    const lower = s.toLowerCase();
    if (
      /\b(formula|law|theorem|principle|definition|important|key takeaway|remember|rule|in summary|therefore|সূত্র|সংজ্ঞা|গুরুত্বপূর্ণ|अर्थात|महत्वपूर्ण)\b/i.test(
        lower
      ) &&
      s.trim().length > 18 &&
      s.trim().length < 180
    ) {
      add(s.trim(), 'important');
    }
  }

  return matches.slice(0, 8);
}

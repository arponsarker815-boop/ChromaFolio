import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getGeminiTtsClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isDailyQuota = /Quota exceeded|GenerateRequestsPerDay|retryDelay/i.test(msg);
      const isTransient =
        !isDailyQuota && /503|429|UNAVAILABLE|overloaded|high demand/i.test(msg);
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
  throw lastErr;
}

function formatAiError(err: unknown, fallback: string): { status: number; message: string } {
  const rawMsg = err instanceof Error ? err.message : String(err || fallback);
  let extracted = rawMsg;
  let code = 500;

  try {
    const parsed = JSON.parse(rawMsg);
    if (parsed?.error?.message) {
      extracted = String(parsed.error.message);
      if (typeof parsed.error.code === 'number') {
        code = parsed.error.code;
      }
    }
  } catch {
    // Keep raw message if not JSON
  }

  if (code === 429 || /RESOURCE_EXHAUSTED|quota|rate[- ]limit/i.test(extracted)) {
    const retryMatch = extracted.match(/retry in\s*([\d.]+)s/i);
    const waitHint = retryMatch ? ` Please retry in ${Math.ceil(Number(retryMatch[1]))} seconds.` : '';
    return {
      status: 429,
      message: `Gemini API rate limit reached.${waitHint} You can check your plan or key in Settings > Secrets.`,
    };
  }
  if (code === 503 || /UNAVAILABLE|high demand|overloaded/i.test(extracted)) {
    return {
      status: 503,
      message: 'Gemini AI is temporarily experiencing high demand. Please retry in a moment.',
    };
  }
  if (code === 403 || code === 400 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(extracted)) {
    return {
      status: 400,
      message: 'Please check your Gemini API key in Settings > Secrets.',
    };
  }
  return { status: 500, message: extracted || fallback };
}

const SERVER_LANG_ALIAS_TO_ISO: Record<string, string> = {
  bn: 'bn',
  bangla: 'bn',
  bengali: 'bn',
  hi: 'hi',
  hindi: 'hi',
  en: 'en',
  english: 'en',
  ar: 'ar',
  arabic: 'ar',
  es: 'es',
  spanish: 'es',
  fr: 'fr',
  french: 'fr',
  ja: 'ja',
  japanese: 'ja',
  de: 'de',
  german: 'de',
  ur: 'ur',
  urdu: 'ur',
  ko: 'ko',
  korean: 'ko',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  chinese: 'zh-CN',
  pt: 'pt',
  portuguese: 'pt',
  ru: 'ru',
  russian: 'ru',
  it: 'it',
  italian: 'it',
  tr: 'tr',
  turkish: 'tr',
  id: 'id',
  indonesian: 'id',
  ms: 'ms',
  malay: 'ms',
  vi: 'vi',
  vietnamese: 'vi',
  th: 'th',
  thai: 'th',
  fa: 'fa',
  persian: 'fa',
  ta: 'ta',
  tamil: 'ta',
  te: 'te',
  telugu: 'te',
  mr: 'mr',
  marathi: 'mr',
  gu: 'gu',
  gujarati: 'gu',
  kn: 'kn',
  kannada: 'kn',
  ml: 'ml',
  malayalam: 'ml',
  pa: 'pa',
  punjabi: 'pa',
  ne: 'ne',
  nepali: 'ne',
  si: 'si',
  sinhala: 'si',
  nl: 'nl',
  dutch: 'nl',
  pl: 'pl',
  polish: 'pl',
  sv: 'sv',
  swedish: 'sv',
  el: 'el',
  greek: 'el',
  he: 'he',
  iw: 'he',
  hebrew: 'he',
  uk: 'uk',
  ukrainian: 'uk',
  sw: 'sw',
  swahili: 'sw',
  as: 'as',
  assamese: 'as',
  or: 'or',
  odia: 'or',
};

function resolveTargetIsoCode(codeOrName: string): string {
  const lower = codeOrName.trim().toLowerCase();
  if (SERVER_LANG_ALIAS_TO_ISO[lower]) return SERVER_LANG_ALIAS_TO_ISO[lower];
  const firstWord = lower.split(/[\s(]+/)[0];
  if (firstWord && SERVER_LANG_ALIAS_TO_ISO[firstWord]) {
    return SERVER_LANG_ALIAS_TO_ISO[firstWord];
  }
  return lower.length <= 5 ? lower : 'en';
}

function detectSourceIsoScript(text: string): string {
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[\u3040-\u30FF]/.test(text)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh-CN';
  if (/[\u0400-\u04FF]/.test(text)) return 'ru';
  return 'en';
}

function splitForTranslateApi(text: string, maxChars = 440): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  const paragraphs = trimmed.split(/\n{2,}/);
  let buf = '';
  const flush = () => {
    if (buf.trim()) {
      chunks.push(buf.trim());
      buf = '';
    }
  };

  for (const para of paragraphs) {
    if ((buf + '\n' + para).length <= maxChars) {
      buf = buf ? `${buf}\n${para}` : para;
      continue;
    }
    flush();
    if (para.length <= maxChars) {
      buf = para;
      continue;
    }
    const sentences = para.split(/(?<=[.!?।॥])\s+/);
    for (const s of sentences) {
      if ((buf + ' ' + s).length <= maxChars) {
        buf = buf ? `${buf} ${s}` : s;
      } else {
        flush();
        if (s.length <= maxChars) {
          buf = s;
        } else {
          for (let i = 0; i < s.length; i += maxChars) {
            chunks.push(s.slice(i, i + maxChars));
          }
        }
      }
    }
  }
  flush();
  return chunks;
}

async function translateTextViaFallback(text: string, targetLangInput: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const targetIso = resolveTargetIsoCode(targetLangInput);

  // 1. Optional Google Cloud Translation API v2 if configured
  const googleApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (googleApiKey) {
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(googleApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: trimmed, target: targetIso, format: 'text' }),
      }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { translations?: Array<{ translatedText?: string }> };
      };
      const out = json.data?.translations?.[0]?.translatedText;
      if (out?.trim()) return out.trim();
    }
  }

  // 2. Reliable MyMemory Neural MT fallback (supports any ISO language pair)
  const sourceIso = detectSourceIsoScript(trimmed);
  if (sourceIso === targetIso) return trimmed;

  const chunks = splitForTranslateApi(trimmed, 440);
  const results: string[] = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      chunk
    )}&langpair=${encodeURIComponent(`${sourceIso}|${targetIso}`)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Translate fallback HTTP ${res.status}`);
      const json = (await res.json()) as {
        responseStatus?: number;
        responseData?: { translatedText?: string };
      };
      const translated = json.responseData?.translatedText?.trim();
      results.push(translated || chunk);
    } finally {
      clearTimeout(timer);
    }
  }
  return results.join(' ');
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// AI backend readiness status (without exposing keys)
app.get('/api/ai/status', (_req, res) => {
  res.json({
    geminiConfigured: Boolean(getGeminiClient()),
  });
});

// Smooth Google AI Narrator TTS (gemini-3.8-flash-lite-tts)
const ALLOWED_TTS_VOICES = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);

app.post('/api/ai/tts', async (req, res) => {
  const ai = getGeminiTtsClient();
  if (!ai) {
    res.status(503).json({
      error: 'Google AI voice service is not configured on this server.',
    });
    return;
  }

  try {
    const { text, voiceName, languageLabel } = req.body as {
      text?: string;
      voiceName?: string;
      languageLabel?: string;
    };

    const trimmed = (text ?? '').trim();
    if (!trimmed) {
      res.status(400).json({ error: 'Text is required for speech synthesis.' });
      return;
    }

    const safeVoice =
      voiceName && ALLOWED_TTS_VOICES.has(voiceName) ? voiceName : 'Kore';
    const langHint =
      languageLabel && languageLabel !== 'original'
        ? ` Speak naturally in ${languageLabel}.`
        : '';

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: trimmed.slice(0, 1400),
                speechMetadata: {
                  style: `Warm, smooth, calm, natural audiobook narrator with crystal-clear pacing and gentle expression.${langHint}`,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoice },
            },
          },
        },
      })
    );

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      res.status(502).json({ error: 'No audio returned by Google TTS model.' });
      return;
    }

    res.json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
      voiceName: safeVoice,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Speech generation failed';
    const isQuota = /429|RESOURCE_EXHAUSTED|Quota exceeded/i.test(message);
    console.error('Error in /api/ai/tts:', message);
    res.status(isQuota ? 429 : 500).json({ error: message });
  }
});

// 1. Smart Page Insights: Summary, Key Takeaways, Colour Mood & Callout Extraction
app.post('/api/ai/analyze-page', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured in Settings > Secrets.',
    });
    return;
  }

  try {
    const { pageText, bookTitle, pageNumber } = req.body as {
      pageText?: string;
      bookTitle?: string;
      pageNumber?: number;
    };

    if (!pageText || pageText.trim().length < 15) {
      res.status(400).json({ error: 'Not enough text on this page to analyze.' });
      return;
    }

    const trimmed = pageText.slice(0, 7500);
    const userPrompt = `Analyze Page ${pageNumber ?? 1} of the book "${bookTitle ?? 'Untitled Book'}".\n\nPage Content:\n${trimmed}`;

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction:
            'You are an expert literary editor and educator. Provide a crisp summary, 3–4 clear bullet takeaways, 3 key glossary terms with concise definitions, and one memorable quote or core insight from the text.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'A 2-3 sentence clear summary of this page.',
              },
              takeaways: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 4 crisp bullet takeaways.',
              },
              glossary: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    definition: { type: Type.STRING },
                  },
                },
                description: 'Up to 3 important terms and short definitions.',
              },
              highlightQuote: {
                type: Type.STRING,
                description: 'One memorable insight or quote from this page.',
              },
            },
          },
        },
      })
    );

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json({
      ...parsed,
      engine: 'gemini',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI analysis failed';
    console.error('Error in /api/ai/analyze-page:', message);
    res.status(500).json({ error: message });
  }
});

// 2. Smart Quiz Generator from selected passage, saved highlights, or current page
app.post('/api/ai/quiz', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured in Settings > Secrets.',
    });
    return;
  }

  try {
    const {
      pageText,
      selectedText,
      highlights,
      sourceType,
      bookTitle,
      pageNumber,
      questionCount,
      targetLanguage,
    } = req.body as {
      pageText?: string;
      selectedText?: string;
      highlights?: Array<{ pageNumber: number; text: string; note?: string }>;
      sourceType?: 'page' | 'selection' | 'highlights';
      bookTitle?: string;
      pageNumber?: number;
      questionCount?: number;
      targetLanguage?: string;
    };

    let sourceLabel = `Page ${pageNumber ?? 1}`;
    let combinedSource = '';

    if (sourceType === 'selection' && selectedText?.trim()) {
      sourceLabel = `Selected passage on Page ${pageNumber ?? 1}`;
      combinedSource = `[Page ${pageNumber ?? 1}]\n${selectedText.trim()}`;
    } else if (sourceType === 'highlights' && Array.isArray(highlights) && highlights.length > 0) {
      sourceLabel = 'Saved Highlights';
      combinedSource = highlights
        .filter((h) => typeof h?.text === 'string' && h.text.trim().length > 0)
        .slice(0, 25)
        .map(
          (h) =>
            `[Highlight from Page ${h.pageNumber}] ${h.text.trim()}${
              h.note ? ` (Note: ${h.note.trim()})` : ''
            }`
        )
        .join('\n\n');
    } else if (pageText?.trim()) {
      combinedSource = `[Page ${pageNumber ?? 1}]\n${pageText.trim()}`;
    }

    if (!combinedSource || combinedSource.trim().length < 20) {
      res.status(400).json({ error: 'Not enough selected or page text to generate quiz questions.' });
      return;
    }

    const desiredCount = Math.min(Math.max(Number(questionCount) || 3, 2), 6);
    const langNote =
      targetLanguage && targetLanguage !== 'original'
        ? ` Write the questions, options, and explanations in ${targetLanguage}.`
        : '';

    const userPrompt = `Create ${desiredCount} interactive comprehension questions based strictly on this content (${sourceLabel}) from "${bookTitle ?? 'the book'}":\n\n${combinedSource.slice(0, 14000)}`;

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction: `Generate ${desiredCount} accurate multiple-choice questions grounded ONLY in the provided book text. Do NOT add facts absent from the text. Each question must have 4 options, the 0-based index of the correct answer, a short explanation, and "reference" citing the exact Page number or passage provided (never invent a page number).${langNote}`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                    reference: { type: Type.STRING },
                  },
                  required: ['question', 'options', 'correctIndex', 'explanation', 'reference'],
                },
              },
            },
          },
        },
      })
    );

    const raw = (response.text ?? '{"questions":[]}')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(raw || '{"questions":[]}');
    res.json({
      ...parsed,
      engine: 'gemini',
    });
  } catch (err) {
    const { status, message } = formatAiError(err, 'Quiz generation failed');
    console.error('Error in /api/ai/quiz:', message);
    res.status(status).json({ error: message });
  }
});

// 3. Bilingual Page Translator (supports any language with Gemini + Google/MyMemory fallback)
app.post('/api/ai/translate', async (req, res) => {
  try {
    const { pageText, targetLanguage } = req.body as {
      pageText?: string;
      targetLanguage?: string;
    };

    if (!pageText || !targetLanguage) {
      res.status(400).json({ error: 'Missing text or target language.' });
      return;
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await withGeminiRetry(() =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Translate the following book page cleanly and naturally into ${targetLanguage}, preserving paragraph breaks:\n\n${pageText.slice(0, 6500)}`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              systemInstruction:
                'You are an accomplished literary translator. Translate faithfully with natural rhythm, preserving paragraph breaks. Return only the translated text.',
            },
          })
        );
        const textOut = (response.text ?? '').trim();
        if (textOut) {
          res.json({ translatedText: textOut, engine: 'gemini' });
          return;
        }
      } catch (geminiErr) {
        console.warn(
          'Gemini translate unavailable, switching to fallback translator:',
          geminiErr instanceof Error ? geminiErr.message.slice(0, 140) : String(geminiErr)
        );
      }
    }

    const fallbackOut = await translateTextViaFallback(pageText.slice(0, 6500), targetLanguage);
    res.json({ translatedText: fallbackOut, engine: 'google-fallback' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Translation failed';
    console.error('Error in /api/ai/translate:', message);
    res.status(500).json({ error: message });
  }
});

// 4. Ask the Book (Multi-turn Q&A grounded strictly in book passages, spoiler-safe by default)
app.post('/api/ai/ask', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured in Settings > Secrets.',
    });
    return;
  }

  try {
    const {
      question,
      contextText,
      excerpts,
      history,
      scope,
      selectedText,
      bookTitle,
      pageNumber,
      spoilerSafe = true,
    } = req.body as {
      question?: string;
      contextText?: string;
      excerpts?: Array<{ pageNumber: number; chapterTitle?: string; text: string }>;
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
      scope?: 'book' | 'chapter' | 'selection';
      selectedText?: string;
      bookTitle?: string;
      pageNumber?: number;
      spoilerSafe?: boolean;
    };

    const currentPos = Math.max(1, Number(pageNumber) || 1);

    const filteredExcerpts = Array.isArray(excerpts)
      ? excerpts
          .filter((ex) => typeof ex?.text === 'string' && ex.text.trim().length > 0)
          .filter((ex) => (spoilerSafe ? Number(ex.pageNumber) <= currentPos : true))
          .map(
            (ex) =>
              `[Page ${ex.pageNumber}${ex.chapterTitle ? ` — ${ex.chapterTitle}` : ''}]\n${ex.text.trim()}`
          )
          .join('\n\n---\n\n')
      : '';

    const combinedContext = (
      filteredExcerpts ||
      (selectedText?.trim() ? `[Selected Text — Page ${currentPos}]\n${selectedText.trim()}` : '') ||
      contextText ||
      ''
    ).trim();

    if (!question?.trim() || !combinedContext) {
      res.status(400).json({ error: 'Question and book content are required.' });
      return;
    }

    const scopeNote =
      scope === 'selection'
        ? 'the selected passage'
        : scope === 'chapter'
          ? 'the current chapter'
          : spoilerSafe
            ? `the book up to Page ${currentPos}`
            : 'the provided book passages';

    const systemInstruction = `You are a strict, honest reading companion for "${bookTitle ?? 'this book'}".
RULES:
1. Answer ONLY using the provided book excerpts below. Do NOT use external knowledge, web search, or invent facts.
2. ${
      spoilerSafe
        ? `Spoiler-safe mode is ENABLED at Page ${currentPos}. NEVER reveal, hint at, or reference anything beyond the provided passages up to Page ${currentPos}.`
        : 'Answer using the provided passages.'
    }
3. Include specific chapter, page, or brief passage references in "citations" ONLY from pages/chapters present in the provided excerpts. Never invent a page number.
4. If the provided book excerpts do NOT contain enough information to answer the question, set "supportedByBook" to false and clearly state in "answer" that the provided book passages do not support or mention the answer.
5. Return valid JSON with { "answer": string, "citations": string[], "supportedByBook": boolean }.`;

    const historyTurns = Array.isArray(history)
      ? history
          .slice(-8)
          .filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
          .map((m) => ({
            role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
            parts: [{ text: m.text.trim().slice(0, 1500) }],
          }))
      : [];

    const chat = ai.chats.create({
      model: 'gemini-4-hydrogen',
      history: historyTurns,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
            citations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            supportedByBook: { type: Type.BOOLEAN },
          },
          required: ['answer', 'citations', 'supportedByBook'],
        },
      },
    });

    const userMessage = `Book Scope: ${scopeNote}\n\nProvided Book Passages:\n${combinedContext.slice(
      0,
      19000
    )}\n\nReader Question: ${question.trim()}`;

    const response = await withGeminiRetry(() => chat.sendMessage({ message: userMessage }));
    const raw = (response.text ?? '{}')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(raw || '{}') as {
      answer?: string;
      citations?: string[];
      supportedByBook?: boolean;
    };

    res.json({
      answer: parsed.answer?.trim() || 'The provided book passages do not contain enough detail to answer this.',
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      supportedByBook: typeof parsed.supportedByBook === 'boolean' ? parsed.supportedByBook : true,
      engine: 'gemini',
    });
  } catch (err) {
    const { status, message } = formatAiError(err, 'Q&A failed');
    console.error('Error in /api/ai/ask:', message);
    res.status(status).json({ error: message });
  }
});

// 5. Student Active-Recall Key-Concept Flashcard Generator (Selection / Highlights / Page / Chapter / Full Book)
app.post('/api/ai/flashcards', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured in Settings > Secrets.',
    });
    return;
  }

  try {
    const {
      pageText,
      selectedText,
      highlights,
      excerpts,
      bookTitle,
      pageNumber,
      scope,
      cardCount,
      focusMode,
      targetLanguage,
    } = req.body as {
      pageText?: string;
      selectedText?: string;
      highlights?: Array<{ pageNumber: number; text: string; note?: string }>;
      excerpts?: Array<{ pageNumber: number; chapterTitle?: string; text: string }>;
      bookTitle?: string;
      pageNumber?: number;
      scope?: 'selection' | 'highlights' | 'page' | 'chapter' | 'book';
      cardCount?: number;
      focusMode?: 'concepts' | 'formulas' | 'exam';
      targetLanguage?: string;
    };

    const structuredExcerpts =
      scope === 'selection' && selectedText?.trim()
        ? `[Selected Passage — Page ${pageNumber ?? 1}]\n${selectedText.trim()}`
        : scope === 'highlights' && Array.isArray(highlights) && highlights.length > 0
          ? highlights
              .filter((h) => typeof h?.text === 'string' && h.text.trim().length > 0)
              .slice(0, 25)
              .map(
                (h) =>
                  `[Saved Highlight — Page ${h.pageNumber}] ${h.text.trim()}${
                    h.note ? ` (Note: ${h.note.trim()})` : ''
                  }`
              )
              .join('\n\n---\n\n')
          : Array.isArray(excerpts) && excerpts.length > 0
            ? excerpts
                .filter((ex) => typeof ex?.text === 'string' && ex.text.trim().length > 0)
                .map(
                  (ex) =>
                    `[Page ${ex.pageNumber}${ex.chapterTitle ? ` — ${ex.chapterTitle}` : ''}]\n${ex.text.trim()}`
                )
                .join('\n\n---\n\n')
            : '';

    const combinedSource = (structuredExcerpts || pageText || '').trim();
    if (combinedSource.length < 20) {
      res.status(400).json({ error: 'Not enough text in this book selection to generate flashcards.' });
      return;
    }

    const desiredCount = Math.min(Math.max(Number(cardCount) || 6, 3), 15);
    const scopeLabel =
      scope === 'selection'
        ? `the selected passage on Page ${pageNumber ?? 1}`
        : scope === 'highlights'
          ? 'the reader’s saved highlights'
          : scope === 'book'
            ? 'the entire book'
            : scope === 'chapter'
              ? 'the current chapter'
              : `Page ${pageNumber ?? 1}`;

    const focusInstruction =
      focusMode === 'formulas'
        ? 'Prioritize formulas, equations, laws, ratios, scientific rules, and exact quantitative relationships.'
        : focusMode === 'exam'
          ? 'Prioritize high-yield exam questions, compare-and-contrast prompts, cause-and-effect reasoning, and common pitfalls.'
          : 'Prioritize core mental models, key definitions, foundational concepts, and why each concept matters.';

    const langInstruction =
      targetLanguage && targetLanguage !== 'original'
        ? `Write every flashcard (concept, front, hint, back) in ${targetLanguage}.`
        : 'Write the flashcards in the same language as the provided book text.';

    const systemInstruction = `You are an expert cognitive-science study coach. Extract exactly ${desiredCount} distinct, high-yield active-recall flashcards strictly grounded in the provided book text. ${focusInstruction} ${langInstruction}
Return JSON with "cards": array of { "concept": 2-4 word label, "front": active-recall question, "hint": short memory cue, "back": concise accurate answer, "pageNumber": integer (default ${pageNumber ?? 1}) }.`;
    const userPrompt = `Extract ${desiredCount} high-yield active-recall flashcards from ${scopeLabel} of "${bookTitle ?? 'this book'}":\n\n${combinedSource.slice(0, 18000)}`;

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    concept: { type: Type.STRING },
                    front: { type: Type.STRING },
                    hint: { type: Type.STRING },
                    back: { type: Type.STRING },
                    pageNumber: { type: Type.INTEGER },
                  },
                  required: ['concept', 'front', 'hint', 'back', 'pageNumber'],
                },
              },
            },
          },
        },
      })
    );

    const raw = (response.text ?? '{"cards":[]}')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(raw || '{"cards":[]}');
    res.json({
      ...parsed,
      engine: 'gemini',
    });
  } catch (err) {
    const { status, message } = formatAiError(err, 'Flashcard generation failed');
    console.error('Error in /api/ai/flashcards:', message);
    res.status(status).json({ error: message });
  }
});

// 6. Exam Cheat-Sheet & Intuitive Explanation Generator
app.post('/api/ai/study-sheet', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured in Settings > Secrets.',
    });
    return;
  }

  try {
    const { pageText, bookTitle, pageNumber, language } = req.body as {
      pageText?: string;
      bookTitle?: string;
      pageNumber?: number;
      language?: string;
    };

    if (!pageText || pageText.trim().length < 20) {
      res.status(400).json({ error: 'Not enough text on this page to build a study sheet.' });
      return;
    }

    const targetLang = language || 'English';
    const systemInstruction = `You are a patient, crystal-clear tutor. Write entirely in ${targetLang}. Return JSON with: title (string), simpleExplanation (plain-language intuitive explanation), and examFacts (array of strings with key formulas, dates, definitions, or exam-worthy facts).`;
    const userPrompt = `Build a student exam cheat-sheet and simple intuitive explanation in ${targetLang} for Page ${pageNumber ?? 1} of "${bookTitle ?? 'this book'}":\n\n${pageText.slice(0, 7500)}`;

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              simpleExplanation: { type: Type.STRING },
              examFacts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
        },
      })
    );

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json({
      ...parsed,
      engine: 'gemini',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Study sheet generation failed';
    console.error('Error in /api/ai/study-sheet:', message);
    res.status(500).json({ error: message });
  }
});

// 7. Full-Book Structured Page Translator (supports any target language with instant fallback)
const BOOK_LANG_PROMPT_MAP: Record<string, string> = {
  bn: 'Bengali (বাংলা)',
  hi: 'Hindi (हिन्दी)',
  en: 'English',
  ar: 'Arabic (العربية)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  ja: 'Japanese (日本語)',
  de: 'German (Deutsch)',
  ur: 'Urdu (اردو)',
  ko: 'Korean (한국어)',
  'zh-cn': 'Chinese Simplified (中文)',
  pt: 'Portuguese (Português)',
  ru: 'Russian (Русский)',
  it: 'Italian (Italiano)',
  ta: 'Tamil (தமிழ்)',
  te: 'Telugu (తెలుగు)',
  mr: 'Marathi (मराठी)',
  tr: 'Turkish (Türkçe)',
};

app.post('/api/ai/translate-book-page', async (req, res) => {
  try {
    const { bookTitle, chapterTitle, blocks, targetLanguage, targetLanguageName } = req.body as {
      bookTitle?: string;
      chapterTitle?: string;
      blocks?: Array<{ id: string; type: string; text: string }>;
      targetLanguage?: string;
      targetLanguageName?: string;
    };

    if (!targetLanguage && !targetLanguageName) {
      res.status(400).json({ error: 'targetLanguage is required.' });
      return;
    }

    const safeBlocks = Array.isArray(blocks)
      ? blocks.filter((b) => typeof b?.text === 'string' && b.text.trim().length > 0)
      : [];

    if (safeBlocks.length === 0 && !bookTitle?.trim() && !chapterTitle?.trim()) {
      res.json({
        translatedBookTitle: bookTitle ?? '',
        translatedChapterTitle: chapterTitle ?? '',
        translatedBlocks: [],
      });
      return;
    }

    const codeKey = (targetLanguage ?? '').trim().toLowerCase();
    const langName =
      targetLanguageName?.trim() ||
      BOOK_LANG_PROMPT_MAP[codeKey] ||
      targetLanguage?.trim() ||
      'English';
    const targetIso = resolveTargetIsoCode(targetLanguage || langName);

    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await withGeminiRetry(() =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: JSON.stringify({
              bookTitle: bookTitle ?? '',
              chapterTitle: chapterTitle ?? '',
              blocks: safeBlocks.map((b) => ({
                id: b.id,
                type: b.type,
                text: b.text.slice(0, 3500),
              })),
            }),
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              systemInstruction: `You are a master literary and academic book translator. Translate the bookTitle (if non-empty), chapterTitle (if non-empty), and EVERY item in "blocks" cleanly and naturally into ${langName}.
CRITICAL: You MUST include "translatedBlocks" with one { "id", "text" } entry for EVERY input block in "blocks", keeping the exact original "id". Preserve mathematical formulas, equations, numbers, and symbols. Never omit translatedBlocks.`,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  translatedBookTitle: { type: Type.STRING },
                  translatedChapterTitle: { type: Type.STRING },
                  translatedBlocks: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        text: { type: Type.STRING },
                      },
                      required: ['id', 'text'],
                    },
                  },
                },
                required: ['translatedBookTitle', 'translatedChapterTitle', 'translatedBlocks'],
              },
            },
          })
        );

        const raw = (response.text ?? '{}')
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/```$/i, '')
          .trim();
        const parsed = JSON.parse(raw || '{}') as {
          translatedBookTitle?: string;
          translatedChapterTitle?: string;
          translatedBlocks?: Array<{ id?: string; text?: string }>;
        };

        const validTranslatedBlocks = Array.isArray(parsed.translatedBlocks)
          ? parsed.translatedBlocks.filter(
              (b): b is { id: string; text: string } =>
                typeof b?.id === 'string' && typeof b?.text === 'string' && b.text.trim().length > 0
            )
          : [];

        if (safeBlocks.length === 0 || validTranslatedBlocks.length > 0) {
          res.json({
            translatedBookTitle: parsed.translatedBookTitle ?? bookTitle ?? '',
            translatedChapterTitle: parsed.translatedChapterTitle ?? chapterTitle ?? '',
            translatedBlocks: validTranslatedBlocks,
            engine: 'gemini',
          });
          return;
        }
      } catch (geminiErr) {
        console.warn(
          'Gemini book-page translate unavailable, using fallback translator:',
          geminiErr instanceof Error ? geminiErr.message.slice(0, 140) : String(geminiErr)
        );
      }
    }

    // Fast reliable fallback translation (Google Cloud v2 if configured or MyMemory Neural MT)
    const [translatedBookTitle, translatedChapterTitle] = await Promise.all([
      bookTitle?.trim() ? translateTextViaFallback(bookTitle, targetIso) : Promise.resolve(''),
      chapterTitle?.trim()
        ? translateTextViaFallback(chapterTitle, targetIso)
        : Promise.resolve(''),
    ]);

    const translatedBlocks: Array<{ id: string; text: string }> = [];
    for (let i = 0; i < safeBlocks.length; i += 3) {
      const slice = safeBlocks.slice(i, i + 3);
      const batch = await Promise.all(
        slice.map(async (b) => ({
          id: b.id,
          text: await translateTextViaFallback(b.text.slice(0, 3500), targetIso),
        }))
      );
      translatedBlocks.push(...batch);
    }

    res.json({
      translatedBookTitle: translatedBookTitle || bookTitle || '',
      translatedChapterTitle: translatedChapterTitle || chapterTitle || '',
      translatedBlocks,
      engine: 'google-fallback',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Book page translation failed';
    console.error('Error in /api/ai/translate-book-page:', message);
    res.status(500).json({ error: message });
  }
});

// 8. Spoiler-Safe Recap ("Catch me up" — Short or Detailed, strictly up to current position when spoilerSafe=true)
app.post('/api/ai/recap', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured in Settings > Secrets.',
    });
    return;
  }

  try {
    const {
      bookTitle,
      currentPage,
      totalPages,
      depth = 'short',
      spoilerSafe = true,
      excerpts,
    } = req.body as {
      bookTitle?: string;
      currentPage?: number;
      totalPages?: number;
      depth?: 'short' | 'detailed';
      spoilerSafe?: boolean;
      excerpts?: Array<{ pageNumber: number; chapterTitle?: string; text: string }>;
    };

    const currentPos = Math.max(1, Number(currentPage) || 1);
    const filtered = Array.isArray(excerpts)
      ? excerpts
          .filter((ex) => typeof ex?.text === 'string' && ex.text.trim().length > 0)
          .filter((ex) => (spoilerSafe ? Number(ex.pageNumber) <= currentPos : true))
      : [];

    if (filtered.length === 0) {
      res.status(400).json({ error: 'Not enough readable text up to your current page for a recap.' });
      return;
    }

    const contextText = filtered
      .map(
        (ex) =>
          `[Page ${ex.pageNumber}${ex.chapterTitle ? ` — ${ex.chapterTitle}` : ''}]\n${ex.text.trim()}`
      )
      .join('\n\n---\n\n')
      .slice(0, 19000);

    const depthInstruction =
      depth === 'detailed'
        ? 'Provide a thorough, well-structured detailed recap (2-3 clear paragraphs in "summary") and 5-8 key events/ideas in "keyEvents".'
        : 'Provide a concise, easy-to-scan short recap (3-4 crisp sentences in "summary") and 3-4 key events/ideas in "keyEvents".';

    const systemInstruction = `You are a careful reading assistant creating a "Catch me up" recap for "${
      bookTitle ?? 'this book'
    }" (reader is on Page ${currentPos}${totalPages ? ` of ${totalPages}` : ''}).
${depthInstruction}
STRICT RULES:
- Base your recap ONLY on the provided book passages. Do NOT invent events or use external knowledge.
- ${
      spoilerSafe
        ? `Spoiler-safe mode is ON. NEVER reveal or speculate about anything after Page ${currentPos}.`
        : 'Summarize only what is present in the provided passages.'
    }
- Each entry in "keyEvents" must include an honest "reference" (e.g., "Page 3 · Chapter 1") matching ONLY pages present in the provided passages.`;

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Book Passages:\n${contextText}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              keyEvents: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    event: { type: Type.STRING },
                    reference: { type: Type.STRING },
                  },
                  required: ['event', 'reference'],
                },
              },
            },
            required: ['summary', 'keyEvents'],
          },
        },
      })
    );

    const raw = (response.text ?? '{}')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(raw || '{}') as {
      summary?: string;
      keyEvents?: Array<{ event: string; reference: string }>;
    };

    res.json({
      summary: parsed.summary || '',
      keyEvents: Array.isArray(parsed.keyEvents) ? parsed.keyEvents : [],
      upToPage: currentPos,
      spoilerSafe: Boolean(spoilerSafe),
      depth: depth === 'detailed' ? 'detailed' : 'short',
      engine: 'gemini',
    });
  } catch (err) {
    const { status, message } = formatAiError(err, 'Recap generation failed');
    console.error('Error in /api/ai/recap:', message);
    res.status(status).json({ error: message });
  }
});

// 9. Explain Simply, Explain with Example, or Translate Selected Passage
app.post('/api/ai/explain-selection', async (req, res) => {
  try {
    const {
      selectedText,
      mode = 'simple',
      targetLanguage = 'English',
      bookTitle,
      pageNumber,
      chapterTitle,
      surroundingContext,
    } = req.body as {
      selectedText?: string;
      mode?: 'simple' | 'example' | 'translate';
      targetLanguage?: string;
      bookTitle?: string;
      pageNumber?: number;
      chapterTitle?: string;
      surroundingContext?: string;
    };

    const cleanSelected = (selectedText ?? '').trim();
    if (cleanSelected.length < 2) {
      res.status(400).json({ error: 'Select or enter a passage to explain or translate.' });
      return;
    }

    const lang = targetLanguage.trim() || 'English';
    const refLabel = `Page ${pageNumber ?? 1}${chapterTitle ? ` · ${chapterTitle}` : ''}`;

    const ai = getGeminiClient();
    if (!ai) {
      if (mode === 'translate') {
        const fallback = await translateTextViaFallback(cleanSelected.slice(0, 6000), lang);
        res.json({
          originalText: cleanSelected,
          resultText: fallback,
          mode,
          targetLanguage: lang,
          reference: refLabel,
          engine: 'google-fallback',
        });
        return;
      }
      res.status(503).json({
        error: 'Gemini API key is not configured in Settings > Secrets.',
      });
      return;
    }

    if (mode === 'translate') {
      try {
        const response = await withGeminiRetry(() =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Translate this selected passage into ${lang}. Preserve paragraph breaks and faithful tone:\n\n${cleanSelected.slice(
              0,
              6000
            )}`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              systemInstruction: `You are an expert literary translator. Translate the passage faithfully into ${lang}. Return only the translated text.`,
            },
          })
        );
        const textOut = (response.text ?? '').trim();
        if (textOut) {
          res.json({
            originalText: cleanSelected,
            resultText: textOut,
            mode,
            targetLanguage: lang,
            reference: refLabel,
            engine: 'gemini',
          });
          return;
        }
      } catch {
        const fallback = await translateTextViaFallback(cleanSelected.slice(0, 6000), lang);
        res.json({
          originalText: cleanSelected,
          resultText: fallback,
          mode,
          targetLanguage: lang,
          reference: refLabel,
          engine: 'google-fallback',
        });
        return;
      }
    }

    const modePrompt =
      mode === 'example'
        ? `Explain the selected passage clearly in ${lang} using a concrete, relatable real-world or narrative example that illuminates what the passage means.`
        : `Explain the selected passage simply and clearly in ${lang} using plain, accessible everyday language so any reader grasps it immediately.`;

    const contextSnippet = surroundingContext?.trim()
      ? `\n\nSurrounding Book Context (${refLabel} of "${bookTitle ?? 'Book'}"):\n${surroundingContext
          .trim()
          .slice(0, 3500)}`
      : '';

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Selected Passage (${refLabel}):\n"${cleanSelected.slice(
          0,
          4500
        )}"${contextSnippet}`,
        config: {
          systemInstruction: `${modePrompt} Stay faithful to the passage and surrounding context without inventing external plot facts.`,
        },
      })
    );

    res.json({
      originalText: cleanSelected,
      resultText: (response.text ?? '').trim(),
      mode,
      targetLanguage: lang,
      reference: refLabel,
      engine: 'gemini',
    });
  } catch (err) {
    const { status, message } = formatAiError(err, 'Selection AI action failed');
    console.error('Error in /api/ai/explain-selection:', message);
    res.status(status).json({ error: message });
  }
});

// 10. Characters, Terms & Timeline (Spoiler-Safe up to current reading position)
app.post('/api/ai/characters-timeline', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured in Settings > Secrets.',
    });
    return;
  }

  try {
    const {
      queryType = 'overview',
      queryTerm = '',
      spoilerSafe = true,
      currentPage = 1,
      bookTitle,
      excerpts,
    } = req.body as {
      queryType?: 'lookup' | 'relationships' | 'timeline' | 'overview';
      queryTerm?: string;
      spoilerSafe?: boolean;
      currentPage?: number;
      bookTitle?: string;
      excerpts?: Array<{ pageNumber: number; chapterTitle?: string; text: string }>;
    };

    const currentPos = Math.max(1, Number(currentPage) || 1);
    const filtered = Array.isArray(excerpts)
      ? excerpts
          .filter((ex) => typeof ex?.text === 'string' && ex.text.trim().length > 0)
          .filter((ex) => (spoilerSafe ? Number(ex.pageNumber) <= currentPos : true))
      : [];

    if (filtered.length === 0) {
      res.status(400).json({ error: 'Not enough book text available for character/timeline analysis.' });
      return;
    }

    const contextText = filtered
      .map(
        (ex) =>
          `[Page ${ex.pageNumber}${ex.chapterTitle ? ` — ${ex.chapterTitle}` : ''}]\n${ex.text.trim()}`
      )
      .join('\n\n---\n\n')
      .slice(0, 19000);

    const taskGuide =
      queryType === 'lookup' && queryTerm.trim()
        ? `Explain who or what "${queryTerm.trim()}" is based strictly on the provided passages, including any known relationships or significance so far.`
        : queryType === 'relationships'
          ? 'Identify how the key characters, figures, or core concepts in these passages are related to each other.'
          : queryType === 'timeline'
            ? 'Construct a chronological timeline of the key events or developments that have happened so far in these passages.'
            : 'List the key characters, figures, or important terms introduced in these passages along with their roles/meanings and relationships.';

    const systemInstruction = `You are a careful literary & study analyst for "${bookTitle ?? 'this book'}".
${taskGuide}
STRICT RULES:
1. Rely ONLY on the provided book passages. Do NOT invent facts or use external knowledge.
2. ${
      spoilerSafe
        ? `Spoiler-safe mode is ON at Page ${currentPos}. NEVER reveal character fates, twists, or events after Page ${currentPos}.`
        : 'Analyze only the provided passages.'
    }
3. If the queried character/term does not appear in the provided passages, set "supportedByBook" to false and explain clearly in "summary".
4. Cite exact Page/Chapter references ONLY from the provided excerpts, plus a short supporting quote when helpful.
Return JSON: { "summary": string, "supportedByBook": boolean, "items": [{ "nameOrEvent": string, "roleOrSummary": string, "relationshipOrDetail": string, "citation": string, "quote": string }] }.`;

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Book Passages:\n${contextText}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              supportedByBook: { type: Type.BOOLEAN },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    nameOrEvent: { type: Type.STRING },
                    roleOrSummary: { type: Type.STRING },
                    relationshipOrDetail: { type: Type.STRING },
                    citation: { type: Type.STRING },
                    quote: { type: Type.STRING },
                  },
                  required: ['nameOrEvent', 'roleOrSummary', 'relationshipOrDetail', 'citation'],
                },
              },
            },
            required: ['summary', 'supportedByBook', 'items'],
          },
        },
      })
    );

    const raw = (response.text ?? '{}')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(raw || '{}');

    res.json({
      summary: parsed.summary || '',
      supportedByBook: typeof parsed.supportedByBook === 'boolean' ? parsed.supportedByBook : true,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      engine: 'gemini',
    });
  } catch (err) {
    const { status, message } = formatAiError(err, 'Character/timeline lookup failed');
    console.error('Error in /api/ai/characters-timeline:', message);
    res.status(status).json({ error: message });
  }
});

// 11. Explain a PDF Page (Tables, Charts, Diagrams via Multimodal Gemini)
app.post('/api/ai/explain-pdf-page', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured in Settings > Secrets.',
    });
    return;
  }

  try {
    const {
      imageDataUrl,
      focusPrompt,
      focusType = 'auto',
      pageNumber,
      chapterTitle,
      bookTitle,
      pageText,
    } = req.body as {
      imageDataUrl?: string;
      focusPrompt?: string;
      focusType?: 'auto' | 'table' | 'chart' | 'diagram';
      pageNumber?: number;
      chapterTitle?: string;
      bookTitle?: string;
      pageText?: string;
    };

    const match = typeof imageDataUrl === 'string'
      ? imageDataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i)
      : null;

    if (!match) {
      res.status(400).json({
        error:
          'No rendered PDF page image is available for this page. Import a PDF or navigate to a page with a rendered snapshot.',
      });
      return;
    }

    const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    const base64Data = match[2];
    const refLabel = `Page ${pageNumber ?? 1}${chapterTitle ? ` · ${chapterTitle}` : ''}`;

    const focusInstruction =
      focusType === 'table'
        ? 'Focus specifically on any tables on this PDF page: explain columns, rows, units, notable numbers, and comparisons.'
        : focusType === 'chart'
          ? 'Focus specifically on any charts or graphs on this PDF page: explain axes, series, trends, peaks, and takeaways.'
          : focusType === 'diagram'
            ? 'Focus specifically on any diagrams, schematics, or figures on this PDF page: explain components, labels, flow, and meaning.'
            : 'Inspect this PDF page for any table, chart, graph, or diagram and explain what it shows clearly.';

    const userQuestion = focusPrompt?.trim()
      ? `\nReader Question: ${focusPrompt.trim()}`
      : '';
    const extractedNote = pageText?.trim()
      ? `\nExtracted text on ${refLabel}:\n${pageText.trim().slice(0, 2500)}`
      : '';

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: `${focusInstruction}\nBook: "${bookTitle ?? 'PDF Document'}" (${refLabel}).${userQuestion}${extractedNote}`,
            },
          ],
        },
        config: {
          systemInstruction:
            'You are a careful visual PDF reading tutor. Explain ONLY what is visibly present in the PDF page image (tables, charts, diagrams, labels, axes, values) and accompanying text. If the page contains no table/chart/diagram or a label is illegible, state that honestly instead of guessing. Return JSON: { "visualTypeDetected": string, "explanation": string, "keyTakeaways": string[], "reference": string }.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visualTypeDetected: { type: Type.STRING },
              explanation: { type: Type.STRING },
              keyTakeaways: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              reference: { type: Type.STRING },
            },
            required: ['visualTypeDetected', 'explanation', 'keyTakeaways', 'reference'],
          },
        },
      })
    );

    const raw = (response.text ?? '{}')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(raw || '{}') as {
      visualTypeDetected?: string;
      explanation?: string;
      keyTakeaways?: string[];
      reference?: string;
    };

    res.json({
      visualTypeDetected: parsed.visualTypeDetected || 'PDF Page Visual',
      explanation: parsed.explanation || '',
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      reference: parsed.reference || refLabel,
      engine: 'gemini',
    });
  } catch (err) {
    const { status, message } = formatAiError(err, 'PDF page explanation failed');
    console.error('Error in /api/ai/explain-pdf-page:', message);
    res.status(status).json({ error: message });
  }
});

// 12. Google Cloud Vision Handwriting & Print OCR (Server-Side Only)
interface VisionServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedVisionToken: { token: string; expiresAt: number } | null = null;

function resolveVisionAuthConfig():
  | { mode: 'api-key'; apiKey: string }
  | { mode: 'service-account'; sa: VisionServiceAccount }
  | { mode: 'none' } {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  if (apiKey && apiKey !== 'MY_CLOUD_VISION_API_KEY') {
    return { mode: 'api-key', apiKey };
  }

  const rawSaJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  if (rawSaJson) {
    try {
      const parsed = JSON.parse(rawSaJson) as Partial<VisionServiceAccount>;
      if (parsed.client_email && parsed.private_key) {
        return {
          mode: 'service-account',
          sa: {
            client_email: parsed.client_email,
            private_key: parsed.private_key.replace(/\\n/g, '\n'),
            token_uri: parsed.token_uri || 'https://oauth2.googleapis.com/token',
          },
        };
      }
    } catch {
      // Ignore malformed env JSON and fall through
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credPath && fs.existsSync(credPath)) {
    try {
      const fileRaw = fs.readFileSync(credPath, 'utf8');
      const parsed = JSON.parse(fileRaw) as Partial<VisionServiceAccount>;
      if (parsed.client_email && parsed.private_key) {
        return {
          mode: 'service-account',
          sa: {
            client_email: parsed.client_email,
            private_key: parsed.private_key.replace(/\\n/g, '\n'),
            token_uri: parsed.token_uri || 'https://oauth2.googleapis.com/token',
          },
        };
      }
    } catch {
      // Ignore unreadable credentials file
    }
  }

  return { mode: 'none' };
}

async function mintVisionServiceAccountToken(sa: VisionServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedVisionToken && cachedVisionToken.expiresAt > nowSec + 60) {
    return cachedVisionToken.token;
  }

  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claimB64 = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: tokenUri,
      iat: nowSec,
      exp: nowSec + 3600,
    })
  ).toString('base64url');

  const unsignedJwt = `${headerB64}.${claimB64}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  const signatureB64 = signer.sign(sa.private_key).toString('base64url');
  const assertion = `${unsignedJwt}.${signatureB64}`;

  const tokenResp = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    throw new Error(`Service account OAuth exchange failed (${tokenResp.status}): ${errText}`);
  }

  const tokenJson = (await tokenResp.json()) as { access_token?: string; expires_in?: number };
  if (!tokenJson.access_token) {
    throw new Error('OAuth token response did not contain an access_token.');
  }

  cachedVisionToken = {
    token: tokenJson.access_token,
    expiresAt: nowSec + (tokenJson.expires_in ?? 3600),
  };
  return cachedVisionToken.token;
}

const VISION_SETUP_INSTRUCTIONS = [
  'Create or select a Google Cloud project with Billing enabled.',
  'Enable the Cloud Vision API (vision.googleapis.com).',
  'Create an API key restricted to Cloud Vision API OR a Service Account JSON key.',
  'Add GOOGLE_CLOUD_VISION_API_KEY (or GOOGLE_APPLICATION_CREDENTIALS_JSON) in Settings > Secrets and restart the server.',
];

const RTL_LANG_CODES = new Set(['ar', 'fa', 'he', 'iw', 'ur', 'yi', 'ps', 'sd', 'dv']);

function verticesToNormBox(
  vertices: Array<{ x?: number; y?: number }> | undefined,
  pageW: number,
  pageH: number
): { x: number; y: number; width: number; height: number } {
  if (!Array.isArray(vertices) || vertices.length === 0 || pageW <= 0 || pageH <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    const vx = Number(v?.x ?? 0);
    const vy = Number(v?.y ?? 0);
    if (vx < minX) minX = vx;
    if (vy < minY) minY = vy;
    if (vx > maxX) maxX = vx;
    if (vy > maxY) maxY = vy;
  }
  const x = Math.max(0, Math.min(1, minX / pageW));
  const y = Math.max(0, Math.min(1, minY / pageH));
  const width = Math.max(0.005, Math.min(1 - x, (maxX - minX) / pageW));
  const height = Math.max(0.005, Math.min(1 - y, (maxY - minY) / pageH));
  return { x, y, width, height };
}

app.get('/api/ocr/status', (_req, res) => {
  const auth = resolveVisionAuthConfig();
  res.json({
    visionConfigured: auth.mode !== 'none',
    authMode: auth.mode,
    provider: 'Google Cloud Vision DOCUMENT_TEXT_DETECTION',
    handwritingSupported: true,
    setupInstructions: VISION_SETUP_INSTRUCTIONS,
  });
});

app.post('/api/ocr/vision', async (req, res) => {
  const auth = resolveVisionAuthConfig();
  if (auth.mode === 'none') {
    res.status(503).json({
      setupRequired: true,
      error:
        'Google Cloud Vision handwriting OCR is not configured on the server yet. Add GOOGLE_CLOUD_VISION_API_KEY or GOOGLE_APPLICATION_CREDENTIALS_JSON in Settings > Secrets.',
      setupInstructions: VISION_SETUP_INSTRUCTIONS,
    });
    return;
  }

  try {
    const {
      imageDataUrl,
      languageHint,
      userConsented,
    } = req.body as {
      imageDataUrl?: string;
      languageHint?: string;
      userConsented?: boolean;
    };

    if (userConsented !== true) {
      res.status(400).json({
        error: 'Explicit user consent is required before sending scanned page images to Cloud OCR.',
      });
      return;
    }

    const match =
      typeof imageDataUrl === 'string'
        ? imageDataUrl.match(/^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/i)
        : null;
    if (!match) {
      res.status(400).json({
        error: 'Invalid image payload. Expected a base64-encoded PNG, JPEG, or WebP data URL.',
      });
      return;
    }

    const cleanHint = typeof languageHint === 'string' ? languageHint.trim() : '';
    const imageContext =
      cleanHint && cleanHint !== 'auto'
        ? { languageHints: [cleanHint] }
        : undefined;

    const visionRequestBody = {
      requests: [
        {
          image: { content: match[1] },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          ...(imageContext ? { imageContext } : {}),
        },
      ],
    };

    let endpoint = 'https://vision.googleapis.com/v1/images:annotate';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (auth.mode === 'api-key') {
      endpoint = `${endpoint}?key=${encodeURIComponent(auth.apiKey)}`;
    } else {
      const accessToken = await mintVisionServiceAccountToken(auth.sa);
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const visionResp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(visionRequestBody),
    });

    const payload = (await visionResp.json()) as {
      error?: { code?: number; message?: string; status?: string };
      responses?: Array<{
        error?: { code?: number; message?: string };
        fullTextAnnotation?: {
          text?: string;
          pages?: Array<{
            width?: number;
            height?: number;
            confidence?: number;
            property?: {
              detectedLanguages?: Array<{ languageCode?: string; confidence?: number }>;
            };
            blocks?: Array<{
              blockType?: string;
              confidence?: number;
              paragraphs?: Array<{
                confidence?: number;
                boundingBox?: { vertices?: Array<{ x?: number; y?: number }> };
                words?: Array<{
                  confidence?: number;
                  boundingBox?: { vertices?: Array<{ x?: number; y?: number }> };
                  symbols?: Array<{
                    text?: string;
                    confidence?: number;
                    property?: {
                      detectedBreak?: { type?: string; isPrefix?: boolean };
                    };
                  }>;
                }>;
              }>;
            }>;
          }>;
        };
      }>;
    };

    if (!visionResp.ok || payload.error) {
      const msg = payload.error?.message || `Google Cloud Vision error (${visionResp.status}).`;
      const isSetupOrBilling =
        visionResp.status === 401 ||
        visionResp.status === 403 ||
        /billing|disabled|PERMISSION_DENIED|API_KEY_INVALID/i.test(msg);
      res.status(visionResp.status >= 400 ? visionResp.status : 502).json({
        setupRequired: isSetupOrBilling,
        error: msg,
        ...(isSetupOrBilling ? { setupInstructions: VISION_SETUP_INSTRUCTIONS } : {}),
      });
      return;
    }

    const first = payload.responses?.[0];
    if (first?.error) {
      res.status(400).json({
        error: first.error.message || 'Cloud Vision could not process this page image.',
      });
      return;
    }

    const annotation = first?.fullTextAnnotation;
    const visionPage = annotation?.pages?.[0];
    const pageW = Math.max(1, Number(visionPage?.width ?? 1000));
    const pageH = Math.max(1, Number(visionPage?.height ?? 1400));

    const detectedLang =
      visionPage?.property?.detectedLanguages?.[0]?.languageCode ||
      (cleanHint && cleanHint !== 'auto' ? cleanHint : undefined);

    const words: Array<{
      id: string;
      text: string;
      confidence: number;
      isUncertain: boolean;
      box: { x: number; y: number; width: number; height: number };
      blockIndex: number;
      paragraphIndex: number;
    }> = [];

    const paragraphs: Array<{
      id: string;
      text: string;
      confidence: number;
      box: { x: number; y: number; width: number; height: number };
      isHeadingCandidate?: boolean;
      isFootnoteCandidate?: boolean;
      avgLineHeight?: number;
      wordIds: string[];
    }> = [];

    const imageRegions: Array<{
      id: string;
      kind: 'diagram' | 'table' | 'figure';
      box: { x: number; y: number; width: number; height: number };
      confidence?: number;
    }> = [];

    let confidenceSum = 0;
    let confidenceCount = 0;

    const blocks = visionPage?.blocks ?? [];
    blocks.forEach((block, blockIdx) => {
      if (block.blockType && block.blockType !== 'TEXT') {
        const bBox = verticesToNormBox((block as { boundingBox?: { vertices?: Array<{ x?: number; y?: number }> } }).boundingBox?.vertices, pageW, pageH);
        if (bBox.width >= 0.08 && bBox.height >= 0.05) {
          imageRegions.push({
            id: `img-region-${blockIdx}`,
            kind: block.blockType === 'TABLE' ? 'table' : 'diagram',
            box: bBox,
            confidence: typeof block.confidence === 'number' ? Number(block.confidence.toFixed(3)) : undefined,
          });
        }
        return;
      }
      (block.paragraphs ?? []).forEach((para, paraIdx) => {
        const paraWordIds: string[] = [];
        let paraText = '';
        let paraConfSum = 0;
        let paraWordCount = 0;

        (para.words ?? []).forEach((word, wordIdx) => {
          let wordStr = '';
          let trailingSpace = '';
          let symbolConfSum = 0;
          let symbolCount = 0;

          for (const sym of word.symbols ?? []) {
            wordStr += sym.text ?? '';
            if (typeof sym.confidence === 'number') {
              symbolConfSum += sym.confidence;
              symbolCount++;
            }
            const breakType = sym.property?.detectedBreak?.type;
            if (breakType === 'SPACE' || breakType === 'SURE_SPACE') {
              trailingSpace = ' ';
            } else if (breakType === 'EOL_SURE_SPACE' || breakType === 'LINE_BREAK') {
              trailingSpace = '\n';
            } else if (breakType === 'HYPHEN') {
              trailingSpace = '-';
            }
          }

          if (!wordStr.trim()) return;

          const wordConf =
            typeof word.confidence === 'number'
              ? word.confidence
              : symbolCount > 0
                ? symbolConfSum / symbolCount
                : typeof para.confidence === 'number'
                  ? para.confidence
                  : 0.85;

          const clampedConf = Math.max(0, Math.min(1, Number(wordConf.toFixed(3))));
          const wordId = `w-${blockIdx}-${paraIdx}-${wordIdx}`;
          const box = verticesToNormBox(word.boundingBox?.vertices, pageW, pageH);

          words.push({
            id: wordId,
            text: wordStr,
            confidence: clampedConf,
            isUncertain: clampedConf < 0.78,
            box,
            blockIndex: blockIdx,
            paragraphIndex: paraIdx,
          });
          paraWordIds.push(wordId);
          paraText += wordStr + trailingSpace;
          paraConfSum += clampedConf;
          paraWordCount++;
          confidenceSum += clampedConf;
          confidenceCount++;
        });

        const normalizedParaText = paraText
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{2,}/g, '\n')
          .trim();

        if (normalizedParaText) {
          const paraConf =
            paraWordCount > 0
              ? Number((paraConfSum / paraWordCount).toFixed(3))
              : Number((para.confidence ?? 0.85).toFixed(3));
          const paraBox = verticesToNormBox(para.boundingBox?.vertices, pageW, pageH);
          const wordHeights = paraWordIds
            .map((wid) => words.find((w) => w.id === wid)?.box.height ?? 0)
            .filter((h) => h > 0);
          const avgLineHeight =
            wordHeights.length > 0
              ? Number((wordHeights.reduce((a, b) => a + b, 0) / wordHeights.length).toFixed(4))
              : undefined;
          const isShortHeading =
            normalizedParaText.length <= 75 &&
            !normalizedParaText.endsWith('.') &&
            normalizedParaText.split(/\s+/).length <= 10 &&
            (paraIdx === 0 || normalizedParaText === normalizedParaText.toUpperCase());
          const isFootnoteCandidate =
            paraBox.y > 0.76 &&
            /^(\[\d+\]|\d+[.)]\s|[*†‡§])/.test(normalizedParaText);

          paragraphs.push({
            id: `p-${blockIdx}-${paraIdx}`,
            text: normalizedParaText,
            confidence: paraConf,
            box: paraBox,
            isHeadingCandidate: isShortHeading,
            isFootnoteCandidate,
            avgLineHeight,
            wordIds: paraWordIds,
          });
        }
      });
    });

    const reconstructedText =
      paragraphs.length > 0
        ? paragraphs.map((p) => p.text).join('\n\n')
        : (annotation?.text ?? '').trim();

    const overallConfidence =
      confidenceCount > 0
        ? Number((confidenceSum / confidenceCount).toFixed(3))
        : typeof visionPage?.confidence === 'number'
          ? Number(visionPage.confidence.toFixed(3))
          : reconstructedText
            ? 0.85
            : 0;

    const baseLang = detectedLang?.split(/[-_]/)[0]?.toLowerCase() ?? '';
    const textDirection: 'ltr' | 'rtl' = RTL_LANG_CODES.has(baseLang) ? 'rtl' : 'ltr';

    res.json({
      rawText: reconstructedText,
      detectedLanguage: detectedLang,
      textDirection,
      overallConfidence,
      words,
      paragraphs,
      imageRegions,
      uncertainCount: words.filter((w) => w.isUncertain).length,
      provider: 'google-cloud-vision',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cloud Vision OCR request failed.';
    console.error('Error in /api/ocr/vision:', message);
    res.status(500).json({ error: message });
  }
});

// 13. Explain a Scanned Table, Formula, or Diagram without altering source values
app.post('/api/ai/explain-scan-item', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured in Settings > Secrets.',
    });
    return;
  }

  try {
    const {
      kind = 'diagram',
      rawText = '',
      imageDataUrl,
      bookTitle,
      pageNumber,
      question,
      isUncertain = false,
    } = req.body as {
      kind?: 'table' | 'formula' | 'diagram';
      rawText?: string;
      imageDataUrl?: string;
      bookTitle?: string;
      pageNumber?: number;
      question?: string;
      isUncertain?: boolean;
    };

    const match =
      typeof imageDataUrl === 'string'
        ? imageDataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i)
        : null;

    if (!match && !rawText.trim()) {
      res.status(400).json({
        error: 'Provide an image crop or extracted text for this table, formula, or diagram.',
      });
      return;
    }

    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
          data: match[2],
        },
      });
    }

    const refLabel = `Page ${pageNumber ?? 1}${bookTitle ? ` of "${bookTitle}"` : ''}`;
    const promptLines = [
      `Item type: ${kind.toUpperCase()} (${refLabel})`,
      rawText.trim() ? `Extracted OCR text (preserve verbatim — do NOT silently alter numbers or symbols):\n${rawText.trim().slice(0, 3000)}` : '',
      isUncertain ? 'Note: OCR flagged parts of this extraction as uncertain. Explicitly mention any unclear symbols/labels rather than guessing.' : '',
      question?.trim() ? `Reader question: ${question.trim()}` : `Explain what this ${kind} shows, its variables/columns/parts, and key meaning step-by-step.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    parts.push({ text: promptLines });

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction:
            'You are a careful scientific and study explainer. Explain ONLY what is visibly present in the scanned image and/or provided extracted text. NEVER silently alter numbers, formula terms, table values, or diagram labels; if a symbol or digit is illegible or ambiguous, point that out clearly for the user to verify.',
        },
      })
    );

    res.json({
      explanation: (response.text ?? '').trim(),
      reference: refLabel,
      engine: 'gemini',
    });
  } catch (err) {
    const { status, message } = formatAiError(err, 'Item explanation failed');
    console.error('Error in /api/ai/explain-scan-item:', message);
    res.status(status).json({ error: message });
  }
});

// 14. Search Across Selected Scanned & Imported Books (Grounded Only)
app.post('/api/ai/search-books', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured in Settings > Secrets.',
    });
    return;
  }

  try {
    const { query, excerpts } = req.body as {
      query?: string;
      excerpts?: Array<{
        bookId: string;
        bookTitle: string;
        pageNumber: number;
        chapterTitle?: string;
        text: string;
      }>;
    };

    const cleanQuery = (query ?? '').trim();
    if (cleanQuery.length < 2) {
      res.status(400).json({ error: 'Enter a question or topic to search across your books.' });
      return;
    }

    const validExcerpts = Array.isArray(excerpts)
      ? excerpts.filter((ex) => ex && typeof ex.text === 'string' && ex.text.trim().length > 0)
      : [];

    if (validExcerpts.length === 0) {
      res.json({
        answer: 'No text passages were found in the selected books to search.',
        supportedByBooks: false,
        citations: [],
      });
      return;
    }

    const contextPayload = validExcerpts
      .slice(0, 26)
      .map(
        (ex, i) =>
          `[EXCERPT ${i + 1} | bookId="${ex.bookId}" | bookTitle="${ex.bookTitle}" | page=${ex.pageNumber} | section="${ex.chapterTitle || `Page ${ex.pageNumber}`}"]\n${ex.text.trim().slice(0, 1200)}`
      )
      .join('\n\n---\n\n')
      .slice(0, 22000);

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Question: ${cleanQuery}\n\nSelected Book Excerpts:\n${contextPayload}`,
        config: {
          systemInstruction: `You are a strictly grounded multi-book research assistant.
RULES:
1. Answer using ONLY the provided book excerpts. Do NOT use web search or outside knowledge.
2. If the provided excerpts do NOT support answering the question, set "supportedByBooks" to false and clearly state that the selected books do not contain a supported answer.
3. For every claim you make, include exact citations with "bookId", "bookTitle", numeric "pageNumber", "chapterTitle", and a short verbatim "quote" copied strictly from the excerpts.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              supportedByBooks: { type: Type.BOOLEAN },
              citations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    bookId: { type: Type.STRING },
                    bookTitle: { type: Type.STRING },
                    pageNumber: { type: Type.INTEGER },
                    chapterTitle: { type: Type.STRING },
                    quote: { type: Type.STRING },
                  },
                  required: ['bookId', 'bookTitle', 'pageNumber', 'chapterTitle', 'quote'],
                },
              },
            },
            required: ['answer', 'supportedByBooks', 'citations'],
          },
        },
      })
    );

    const raw = (response.text ?? '{}')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(raw || '{}') as {
      answer?: string;
      supportedByBooks?: boolean;
      citations?: Array<{
        bookId: string;
        bookTitle: string;
        pageNumber: number;
        chapterTitle: string;
        quote: string;
      }>;
    };

    res.json({
      answer: parsed.answer || '',
      supportedByBooks: Boolean(parsed.supportedByBooks),
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
    });
  } catch (err) {
    const { status, message } = formatAiError(err, 'Cross-book search failed');
    console.error('Error in /api/ai/search-books:', message);
    res.status(status).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ChromaFolio server listening on http://localhost:${PORT}`);
  });
}

startServer();

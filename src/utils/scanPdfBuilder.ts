import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ScanPageRecord } from '../types/ebook';

function dataUrlToUint8Array(dataUrl: string): {
  bytes: Uint8Array;
  isPng: boolean;
} {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!match) {
    throw new Error('Unsupported scan image format for PDF embedding.');
  }
  const isPng = match[1].toLowerCase().includes('png');
  const binStr = atob(match[2]);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return { bytes, isPng };
}

function toWinAnsiSafe(text: string): string {
  const normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ');

  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      out += normalized[i];
    }
  }
  return out.trim();
}

async function rotateDataUrlIfNeeded(
  dataUrl: string,
  rotationDeg: 0 | 90 | 180 | 270
): Promise<string> {
  if (rotationDeg === 0) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const swap = rotationDeg === 90 || rotationDeg === 270;
      const w = swap ? img.naturalHeight : img.naturalWidth;
      const h = swap ? img.naturalWidth : img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function buildOriginalScanPdf(
  pages: ScanPageRecord[],
  meta: { title: string; author: string }
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(meta.title || 'Scanned Book');
  pdfDoc.setAuthor(meta.author || 'ChromaFolio Scanner');
  pdfDoc.setCreator('ChromaFolio Scan to Book');

  for (const pageRec of pages) {
    const uprightUrl = await rotateDataUrlIfNeeded(
      pageRec.originalDataUrl,
      pageRec.rotationDeg
    );
    const { bytes, isPng } = dataUrlToUint8Array(uprightUrl);
    const embedded = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

    // Scale to ~595pt width (A4 width) preserving exact original image aspect ratio
    const pdfWidth = 595;
    const pdfHeight = Math.max(200, Math.round((embedded.height / Math.max(1, embedded.width)) * pdfWidth));
    const page = pdfDoc.addPage([pdfWidth, pdfHeight]);

    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pdfWidth,
      height: pdfHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
}

export async function buildSearchableScanPdf(
  pages: ScanPageRecord[],
  meta: { title: string; author: string }
): Promise<{
  blob: Blob;
  embeddedWords: number;
  skippedNonLatinPages: number;
}> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(meta.title || 'Scanned Book (Searchable)');
  pdfDoc.setAuthor(meta.author || 'ChromaFolio Scanner');
  pdfDoc.setCreator('ChromaFolio Scan to Book');

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let embeddedWords = 0;
  let skippedNonLatinPages = 0;

  for (const pageRec of pages) {
    const imageUrl = pageRec.enhancedDataUrl || pageRec.originalDataUrl;
    const { bytes, isPng } = dataUrlToUint8Array(imageUrl);
    const embedded = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

    const pdfWidth = 595;
    const pdfHeight = Math.max(200, Math.round((embedded.height / Math.max(1, embedded.width)) * pdfWidth));
    const page = pdfDoc.addPage([pdfWidth, pdfHeight]);

    // 1. Draw the enhanced scanned page image visibly
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pdfWidth,
      height: pdfHeight,
    });

    // 2. Overlay invisible selectable/searchable OCR text layer
    const corrected = pageRec.ocr.correctedText.trim();
    const raw = pageRec.ocr.rawText.trim();
    const textWasEdited = Boolean(corrected && corrected !== raw);

    if (!textWasEdited && pageRec.ocr.words.length > 0) {
      let pageLatinWords = 0;
      let pageHasNonLatin = false;
      for (const word of pageRec.ocr.words) {
        const safe = toWinAnsiSafe(word.text);
        if (!safe) {
          if (word.text.trim()) pageHasNonLatin = true;
          continue;
        }
        const x = word.box.x * pdfWidth;
        const boxH = Math.max(6, word.box.height * pdfHeight);
        // PDF y=0 is bottom-left, Vision box y=0 is top-left
        const y = Math.max(4, pdfHeight - (word.box.y + word.box.height) * pdfHeight);
        const fontSize = Math.max(6, Math.min(36, boxH * 0.85));
        page.drawText(safe, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
          opacity: 0,
        });
        pageLatinWords++;
        embeddedWords++;
      }
      if (pageHasNonLatin && pageLatinWords === 0) {
        skippedNonLatinPages++;
      }
    } else if (corrected) {
      // User edited OCR text manually — embed corrected lines cleanly as searchable layer
      const lines = corrected
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);
      const lineStep = Math.max(12, Math.min(22, (pdfHeight - 48) / Math.max(1, lines.length)));
      let hasAnyNonLatin = false;
      let drewAny = false;

      lines.forEach((line, idx) => {
        const safe = toWinAnsiSafe(line);
        if (!safe) {
          hasAnyNonLatin = true;
          return;
        }
        const y = Math.max(16, pdfHeight - 36 - idx * lineStep);
        page.drawText(safe.slice(0, 140), {
          x: 28,
          y,
          size: 10,
          font,
          color: rgb(0, 0, 0),
          opacity: 0,
        });
        drewAny = true;
        embeddedWords += safe.split(/\s+/).length;
      });
      if (hasAnyNonLatin && !drewAny) {
        skippedNonLatinPages++;
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return {
    blob: new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }),
    embeddedWords,
    skippedNonLatinPages,
  };
}

export function triggerPdfDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

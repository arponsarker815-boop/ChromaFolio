import {
  ScanBoundingBox,
  ScanCleanupSettings,
  ScanCornerPoint,
  ScanQualityMetrics,
} from '../types/ebook';

export const DEFAULT_SCAN_CORNERS: [
  ScanCornerPoint,
  ScanCornerPoint,
  ScanCornerPoint,
  ScanCornerPoint,
] = [
  { x: 0.04, y: 0.04 },
  { x: 0.96, y: 0.04 },
  { x: 0.96, y: 0.96 },
  { x: 0.04, y: 0.96 },
];

export const DEFAULT_CLEANUP_SETTINGS: ScanCleanupSettings = {
  autoPerspective: true,
  autoDeskew: true,
  fineAngleDeg: 0,
  deshadowStrength: 58,
  gutterShadowReduction: 65,
  curvatureCorrection: 45,
  glareReduction: 35,
  denoiseStrength: 28,
  contrast: 18,
  sharpen: 38,
};

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image data.'));
    img.src = src;
  });
}

export async function normalizeImportedImage(
  file: File,
  maxDim = 1800
): Promise<{ dataUrl: string; width: number; height: number }> {
  // Prefer createImageBitmap with EXIF orientation honored when supported
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        throw new Error('Canvas 2D context unavailable.');
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return {
        dataUrl: canvas.toDataURL('image/jpeg', 0.88),
        width,
        height,
      };
    } catch {
      // Fallback below via FileReader + Image
    }
  }

  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  const img = await loadImageElement(rawUrl);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.drawImage(img, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.88),
    width,
    height,
  };
}

export function analyzeImageDataQuality(
  imgData: ImageData,
  sourceWidthPx?: number,
  sourceHeightPx?: number
): ScanQualityMetrics {
  const { width, height, data } = imgData;
  const total = width * height;
  if (total === 0) {
    return {
      blurScore: 0,
      glareRatio: 0,
      brightness: 0,
      edgeClarity: 0,
      widthPx: sourceWidthPx,
      heightPx: sourceHeightPx,
      resolutionOk: false,
      cutOffEdges: [],
      unreadableZones: 16,
      coachSummary: 'Retake: empty or unreadable camera frame.',
      overall: 'poor',
      warnings: ['Empty image frame'],
    };
  }

  const lum = new Float32Array(total);
  let sumLum = 0;
  let glareCount = 0;
  let darkCount = 0;

  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = y;
    sumLum += y;
    if (r >= 248 && g >= 248 && b >= 248) glareCount++;
    if (y < 42) darkCount++;
  }

  const meanBrightness = sumLum / total;
  const glareRatio = glareCount / total;
  const darkRatio = darkCount / total;

  // Compute Laplacian variance for focus/sharpness and Sobel energy for edge clarity
  let lapSum = 0;
  let lapSqSum = 0;
  let lapSamples = 0;
  let edgeStrongCount = 0;

  // Border cut-off ink detection (outer 3.5% edges)
  const marginX = Math.max(3, Math.round(width * 0.035));
  const marginY = Math.max(3, Math.round(height * 0.035));
  let topInkHits = 0;
  let botInkHits = 0;
  let leftInkHits = 0;
  let rightInkHits = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        4 * lum[idx] -
        lum[idx - 1] -
        lum[idx + 1] -
        lum[idx - width] -
        lum[idx + width];
      lapSum += lap;
      lapSqSum += lap * lap;
      lapSamples++;

      const gx = Math.abs(lum[idx + 1] - lum[idx - 1]);
      const gy = Math.abs(lum[idx + width] - lum[idx - width]);
      const grad = gx + gy;
      if (grad > 34) {
        edgeStrongCount++;
        if (lum[idx] < meanBrightness * 0.85) {
          if (y <= marginY) topInkHits++;
          if (y >= height - 1 - marginY) botInkHits++;
          if (x <= marginX) leftInkHits++;
          if (x >= width - 1 - marginX) rightInkHits++;
        }
      }
    }
  }

  // 4x4 grid unreadable zone check (very dark shadow or blown-out zero-detail glare)
  let unreadableZones = 0;
  const cellW = Math.max(8, Math.floor(width / 4));
  const cellH = Math.max(8, Math.floor(height / 4));
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      let cLum = 0;
      let cDark = 0;
      let cGlare = 0;
      let cN = 0;
      const y0 = gy * cellH;
      const x0 = gx * cellW;
      for (let y = y0; y < Math.min(height, y0 + cellH); y += 2) {
        for (let x = x0; x < Math.min(width, x0 + cellW); x += 2) {
          const v = lum[y * width + x];
          cLum += v;
          if (v < 36) cDark++;
          if (v > 248) cGlare++;
          cN++;
        }
      }
      if (cN > 0) {
        const avg = cLum / cN;
        if (avg < 44 || cDark / cN > 0.65 || cGlare / cN > 0.72) {
          unreadableZones++;
        }
      }
    }
  }

  const lapMean = lapSamples > 0 ? lapSum / lapSamples : 0;
  const lapVar =
    lapSamples > 0 ? Math.max(0, lapSqSum / lapSamples - lapMean * lapMean) : 0;

  const blurScore = Math.max(0, Math.min(100, Math.round((Math.sqrt(lapVar) / 26) * 100)));
  const edgeRatio = lapSamples > 0 ? edgeStrongCount / lapSamples : 0;
  const edgeClarity = Math.max(0, Math.min(100, Math.round(edgeRatio * 480)));

  const resW = sourceWidthPx ?? width;
  const resH = sourceHeightPx ?? height;
  const resolutionOk = Math.max(resW, resH) >= 820 && Math.min(resW, resH) >= 540;

  const topThresh = Math.max(18, Math.round(width * marginY * 0.14));
  const sideThresh = Math.max(18, Math.round(height * marginX * 0.14));
  const cutOffEdges: Array<'top' | 'bottom' | 'left' | 'right'> = [];
  if (topInkHits > topThresh) cutOffEdges.push('top');
  if (botInkHits > topThresh) cutOffEdges.push('bottom');
  if (leftInkHits > sideThresh) cutOffEdges.push('left');
  if (rightInkHits > sideThresh) cutOffEdges.push('right');

  const warnings: string[] = [];
  if (blurScore < 26) {
    warnings.push('Retake: image looks blurry or out of focus — hold steady and tap to focus.');
  }
  if (!resolutionOk && sourceWidthPx && sourceHeightPx) {
    warnings.push(
      `Low resolution (${sourceWidthPx}×${sourceHeightPx}px) — move closer or use higher resolution for small print.`
    );
  }
  if (cutOffEdges.length > 0) {
    warnings.push(
      `Retake: text near the ${cutOffEdges.join(' / ')} edge appears cut off or too close to the frame.`
    );
  }
  if (glareRatio > 0.14) {
    warnings.push('Strong glare reflection detected — tilt page slightly away from direct light.');
  }
  if (meanBrightness < 68 || darkRatio > 0.45) {
    warnings.push('Lighting is too dark or shadowed — move near brighter diffused light.');
  } else if (meanBrightness > 236 && edgeClarity < 18) {
    warnings.push('Overexposed / washed-out page — reduce direct flash or lamp glare.');
  }
  if (unreadableZones >= 4) {
    warnings.push(
      `${unreadableZones} page areas look too dark or washed out to read reliably.`
    );
  }
  if (edgeClarity < 14 && blurScore >= 26) {
    warnings.push('Low text contrast or unclear page borders — frame the full page flatly.');
  }

  let overall: 'good' | 'fair' | 'poor' = 'good';
  if (
    warnings.length >= 2 ||
    blurScore < 18 ||
    meanBrightness < 48 ||
    glareRatio > 0.25 ||
    unreadableZones >= 6
  ) {
    overall = 'poor';
  } else if (
    warnings.length === 1 ||
    blurScore < 38 ||
    glareRatio > 0.09 ||
    cutOffEdges.length > 0 ||
    !resolutionOk
  ) {
    overall = 'fair';
  }

  const coachSummary =
    overall === 'poor'
      ? warnings[0] || 'Poor quality — retake recommended before running OCR.'
      : overall === 'fair'
        ? warnings[0] || 'Usable with caution — verify edges and uncertain words.'
        : 'Clear focus, framing, and lighting — ready for OCR.';

  return {
    blurScore,
    glareRatio: Number(glareRatio.toFixed(3)),
    brightness: Math.round(meanBrightness),
    edgeClarity,
    widthPx: sourceWidthPx,
    heightPx: sourceHeightPx,
    resolutionOk,
    cutOffEdges,
    unreadableZones,
    coachSummary,
    overall,
    warnings,
  };
}

export async function assessCaptureQuality(dataUrl: string): Promise<ScanQualityMetrics> {
  const img = await loadImageElement(dataUrl);
  const targetW = 320;
  const targetH = Math.max(
    120,
    Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * targetW)
  );
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      blurScore: 50,
      glareRatio: 0,
      brightness: 140,
      edgeClarity: 50,
      widthPx: img.naturalWidth,
      heightPx: img.naturalHeight,
      resolutionOk: true,
      cutOffEdges: [],
      unreadableZones: 0,
      coachSummary: 'Ready for review.',
      overall: 'fair',
      warnings: [],
    };
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return analyzeImageDataQuality(
    ctx.getImageData(0, 0, targetW, targetH),
    img.naturalWidth,
    img.naturalHeight
  );
}

export function assessVideoFrameQuality(video: HTMLVideoElement): ScanQualityMetrics | null {
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }
  const targetW = 240;
  const targetH = Math.max(
    90,
    Math.round((video.videoHeight / video.videoWidth) * targetW)
  );
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, targetW, targetH);
  return analyzeImageDataQuality(
    ctx.getImageData(0, 0, targetW, targetH),
    video.videoWidth,
    video.videoHeight
  );
}

function drawRotatedToCanvas(
  img: HTMLImageElement,
  rotationDeg: 0 | 90 | 180 | 270
): HTMLCanvasElement {
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const swap = rotationDeg === 90 || rotationDeg === 270;
  const outW = swap ? srcH : srcW;
  const outH = swap ? srcW : srcH;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);
  ctx.restore();
  return canvas;
}

/**
 * Heuristic page quadrilateral detector:
 * Estimates paper region by finding bright/neutral foreground mass vs border background
 * and tracing extreme boundary points in each quadrant.
 */
export async function detectPageCorners(
  dataUrl: string,
  rotationDeg: 0 | 90 | 180 | 270 = 0
): Promise<[ScanCornerPoint, ScanCornerPoint, ScanCornerPoint, ScanCornerPoint]> {
  const img = await loadImageElement(dataUrl);
  const rotated = drawRotatedToCanvas(img, rotationDeg);

  const w = 180;
  const h = Math.max(80, Math.round((rotated.height / Math.max(1, rotated.width)) * w));
  const sample = document.createElement('canvas');
  sample.width = w;
  sample.height = h;
  const ctx = sample.getContext('2d');
  if (!ctx) return DEFAULT_SCAN_CORNERS;

  ctx.drawImage(rotated, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Measure outer border brightness vs center paper brightness
  let borderSum = 0;
  let borderN = 0;
  let centerSum = 0;
  let centerN = 0;

  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const p = idx * 4;
      const yVal = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      lum[idx] = yVal;

      const isBorder = x < 8 || x >= w - 8 || y < 8 || y >= h - 8;
      const isCenter = x > w * 0.28 && x < w * 0.72 && y > h * 0.28 && y < h * 0.72;
      if (isBorder) {
        borderSum += yVal;
        borderN++;
      }
      if (isCenter) {
        centerSum += yVal;
        centerN++;
      }
    }
  }

  const borderMean = borderSum / Math.max(1, borderN);
  const centerMean = centerSum / Math.max(1, centerN);

  // If the page already fills the frame (border nearly as bright as center), keep modest 2% trim
  if (centerMean - borderMean < 24) {
    return [
      { x: 0.02, y: 0.02 },
      { x: 0.98, y: 0.02 },
      { x: 0.98, y: 0.98 },
      { x: 0.02, y: 0.98 },
    ];
  }

  const threshold = borderMean + (centerMean - borderMean) * 0.45;
  let tl = { x: w * 0.04, y: h * 0.04, score: Infinity };
  let tr = { x: w * 0.96, y: h * 0.04, score: -Infinity };
  let br = { x: w * 0.96, y: h * 0.96, score: -Infinity };
  let bl = { x: w * 0.04, y: h * 0.96, score: -Infinity };

  let fgCount = 0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const idx = y * w + x;
      const p = idx * 4;
      const maxCh = Math.max(data[p], data[p + 1], data[p + 2]);
      const minCh = Math.min(data[p], data[p + 1], data[p + 2]);
      const sat = maxCh - minCh;
      // Paper tends to be brighter than threshold and relatively low saturation
      if (lum[idx] > threshold && sat < 75) {
        fgCount++;
        const sTl = x + y;
        const sTr = x - y;
        const sBr = x + y;
        const sBl = y - x;
        if (sTl < tl.score) tl = { x, y, score: sTl };
        if (sTr > tr.score) tr = { x, y, score: sTr };
        if (sBr > br.score) br = { x, y, score: sBr };
        if (sBl > bl.score) bl = { x, y, score: sBl };
      }
    }
  }

  if (fgCount < w * h * 0.15) {
    return DEFAULT_SCAN_CORNERS;
  }

  const clamp01 = (v: number) => Math.max(0.01, Math.min(0.99, Number(v.toFixed(3))));
  const corners: [ScanCornerPoint, ScanCornerPoint, ScanCornerPoint, ScanCornerPoint] = [
    { x: clamp01(tl.x / w), y: clamp01(tl.y / h) },
    { x: clamp01(tr.x / w), y: clamp01(tr.y / h) },
    { x: clamp01(br.x / w), y: clamp01(br.y / h) },
    { x: clamp01(bl.x / w), y: clamp01(bl.y / h) },
  ];

  // Validate non-degenerate convex quad area
  const quadWidthTop = corners[1].x - corners[0].x;
  const quadWidthBot = corners[2].x - corners[3].x;
  const quadHeightLeft = corners[3].y - corners[0].y;
  const quadHeightRight = corners[2].y - corners[1].y;
  if (quadWidthTop < 0.25 || quadWidthBot < 0.25 || quadHeightLeft < 0.25 || quadHeightRight < 0.25) {
    return DEFAULT_SCAN_CORNERS;
  }

  return corners;
}

/**
 * Solves 8x8 linear system for planar homography H mapping (dx, dy) -> (sx, sy).
 */
function solveHomography(
  dstPts: [ScanCornerPoint, ScanCornerPoint, ScanCornerPoint, ScanCornerPoint],
  srcPts: [ScanCornerPoint, ScanCornerPoint, ScanCornerPoint, ScanCornerPoint]
): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const x = dstPts[i].x;
    const y = dstPts[i].y;
    const u = srcPts[i].x;
    const v = srcPts[i].y;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > maxVal) {
        maxVal = Math.abs(A[r][col]);
        pivotRow = r;
      }
    }
    if (maxVal < 1e-9) return null;
    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }

    const pivot = A[col][col];
    for (let c = col; c < n; c++) A[col][c] /= pivot;
    b[col] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      for (let c = col; c < n; c++) A[r][c] -= factor * A[col][c];
      b[r] -= factor * b[col];
    }
  }

  return [...b, 1];
}

function warpPerspectiveCanvas(
  srcCanvas: HTMLCanvasElement,
  cornersNorm: [ScanCornerPoint, ScanCornerPoint, ScanCornerPoint, ScanCornerPoint]
): HTMLCanvasElement {
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  const srcPts: [ScanCornerPoint, ScanCornerPoint, ScanCornerPoint, ScanCornerPoint] = [
    { x: cornersNorm[0].x * sw, y: cornersNorm[0].y * sh },
    { x: cornersNorm[1].x * sw, y: cornersNorm[1].y * sh },
    { x: cornersNorm[2].x * sw, y: cornersNorm[2].y * sh },
    { x: cornersNorm[3].x * sw, y: cornersNorm[3].y * sh },
  ];

  const topW = Math.hypot(srcPts[1].x - srcPts[0].x, srcPts[1].y - srcPts[0].y);
  const botW = Math.hypot(srcPts[2].x - srcPts[3].x, srcPts[2].y - srcPts[3].y);
  const leftH = Math.hypot(srcPts[3].x - srcPts[0].x, srcPts[3].y - srcPts[0].y);
  const rightH = Math.hypot(srcPts[2].x - srcPts[1].x, srcPts[2].y - srcPts[1].y);

  const outW = Math.max(120, Math.min(1800, Math.round(Math.max(topW, botW))));
  const outH = Math.max(120, Math.min(2400, Math.round(Math.max(leftH, rightH))));

  const dstPts: [ScanCornerPoint, ScanCornerPoint, ScanCornerPoint, ScanCornerPoint] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];

  const H = solveHomography(dstPts, srcPts);
  if (!H) return srcCanvas;

  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return srcCanvas;
  const srcData = srcCtx.getImageData(0, 0, sw, sh).data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return srcCanvas;

  const outImg = outCtx.createImageData(outW, outH);
  const dst = outImg.data;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = H;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = h6 * x + h7 * y + 1;
      const sx = (h0 * x + h1 * y + h2) / denom;
      const sy = (h3 * x + h4 * y + h5) / denom;

      const dIdx = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        const cx = Math.max(0, Math.min(sw - 1, Math.round(sx)));
        const cy = Math.max(0, Math.min(sh - 1, Math.round(sy)));
        const sIdx = (cy * sw + cx) * 4;
        dst[dIdx] = srcData[sIdx];
        dst[dIdx + 1] = srcData[sIdx + 1];
        dst[dIdx + 2] = srcData[sIdx + 2];
        dst[dIdx + 3] = 255;
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      dst[dIdx] = srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
      dst[dIdx + 1] =
        srcData[i00 + 1] * w00 +
        srcData[i10 + 1] * w10 +
        srcData[i01 + 1] * w01 +
        srcData[i11 + 1] * w11;
      dst[dIdx + 2] =
        srcData[i00 + 2] * w00 +
        srcData[i10 + 2] * w10 +
        srcData[i01 + 2] * w01 +
        srcData[i11 + 2] * w11;
      dst[dIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return outCanvas;
}

/**
 * Estimates small text skew (-5.0 to +5.0 degrees) via horizontal dark-pixel projection variance.
 */
function estimateFineDeskewDeg(canvas: HTMLCanvasElement): number {
  const sw = 200;
  const sh = Math.max(100, Math.round((canvas.height / Math.max(1, canvas.width)) * sw));
  const tmp = document.createElement('canvas');
  tmp.width = sw;
  tmp.height = sh;
  const ctx = tmp.getContext('2d');
  if (!ctx) return 0;

  ctx.drawImage(canvas, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  // Adaptive dark text mask
  let sum = 0;
  const lum = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    const p = i * 4;
    const y = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    lum[i] = y;
    sum += y;
  }
  const thresh = (sum / (sw * sh)) * 0.84;

  let bestAngle = 0;
  let bestVariance = -1;
  const cx = sw / 2;
  const cy = sh / 2;

  for (let deg = -5; deg <= 5; deg += 0.5) {
    const rad = (deg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const rowSums = new Float32Array(sh);

    for (let y = 10; y < sh - 10; y++) {
      for (let x = 10; x < sw - 10; x++) {
        if (lum[y * sw + x] < thresh) {
          const ry = Math.round(-(x - cx) * sinA + (y - cy) * cosA + cy);
          if (ry >= 0 && ry < sh) rowSums[ry]++;
        }
      }
    }

    let mean = 0;
    for (let r = 0; r < sh; r++) mean += rowSums[r];
    mean /= sh;

    let variance = 0;
    for (let r = 0; r < sh; r++) {
      const diff = rowSums[r] - mean;
      variance += diff * diff;
    }

    if (variance > bestVariance) {
      bestVariance = variance;
      bestAngle = deg;
    }
  }

  return Math.abs(bestAngle) < 0.5 ? 0 : bestAngle;
}

function rotateFineAngle(canvas: HTMLCanvasElement, angleDeg: number): HTMLCanvasElement {
  if (Math.abs(angleDeg) < 0.15) return canvas;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.save();
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  ctx.restore();
  return out;
}

/**
 * Deterministic pixel enhancement:
 * - Page flattening / de-shadowing via coarse local background illumination estimation
 * - Specular glare compression
 * - 3x3 edge-preserving smoothing (denoise)
 * - Contrast adjustment
 * - Unsharp mask sharpening
 * Never uses generative AI or invents characters.
 */
function applyDeterministicEnhancements(
  canvas: HTMLCanvasElement,
  cleanup: ScanCleanupSettings
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;
  const total = w * h;

  // 1. De-shadowing & illumination normalization on coarse grid
  const deshadow = Math.max(0, Math.min(1, cleanup.deshadowStrength / 100));
  let bgField: Float32Array | null = null;

  if (deshadow > 0.02) {
    const gw = 64;
    const gh = Math.max(32, Math.round((h / w) * gw));
    const coarse = new Float32Array(gw * gh);

    // Estimate local maximum luminance (paper background) in each coarse cell
    for (let gy = 0; gy < gh; gy++) {
      const yStart = Math.floor((gy / gh) * h);
      const yEnd = Math.min(h, Math.floor(((gy + 1) / gh) * h));
      for (let gx = 0; gx < gw; gx++) {
        const xStart = Math.floor((gx / gw) * w);
        const xEnd = Math.min(w, Math.floor(((gx + 1) / gw) * w));
        let maxLum = 120;
        const stepX = Math.max(1, Math.floor((xEnd - xStart) / 4));
        const stepY = Math.max(1, Math.floor((yEnd - yStart) / 4));
        for (let y = yStart; y < yEnd; y += stepY) {
          for (let x = xStart; x < xEnd; x += stepX) {
            const i = (y * w + x) * 4;
            const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            if (l > maxLum) maxLum = l;
          }
        }
        coarse[gy * gw + gx] = maxLum;
      }
    }

    // 2-pass box blur on coarse illumination field
    const blurred = new Float32Array(gw * gh);
    for (let pass = 0; pass < 2; pass++) {
      const src = pass === 0 ? coarse : blurred;
      const dst = pass === 0 ? blurred : coarse;
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          let sum = 0;
          let cnt = 0;
          for (let dy = -2; dy <= 2; dy++) {
            const yy = Math.max(0, Math.min(gh - 1, y + dy));
            for (let dx = -2; dx <= 2; dx++) {
              const xx = Math.max(0, Math.min(gw - 1, x + dx));
              sum += src[yy * gw + xx];
              cnt++;
            }
          }
          dst[y * gw + x] = sum / cnt;
        }
      }
    }

    bgField = new Float32Array(total);
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * (gh - 1);
      const y0 = Math.floor(fy);
      const y1 = Math.min(gh - 1, y0 + 1);
      const wy = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * (gw - 1);
        const x0 = Math.floor(fx);
        const x1 = Math.min(gw - 1, x0 + 1);
        const wx = fx - x0;
        const v00 = coarse[y0 * gw + x0];
        const v10 = coarse[y0 * gw + x1];
        const v01 = coarse[y1 * gw + x0];
        const v11 = coarse[y1 * gw + x1];
        bgField[y * w + x] =
          (v00 * (1 - wx) + v10 * wx) * (1 - wy) +
          (v01 * (1 - wx) + v11 * wx) * wy;
      }
    }
  }

  const glareStrength = Math.max(0, Math.min(1, cleanup.glareReduction / 100));
  const contrastFactor = 1 + Math.max(-0.35, Math.min(0.75, cleanup.contrast / 85));

  for (let i = 0; i < total; i++) {
    const p = i * 4;
    let r = px[p];
    let g = px[p + 1];
    let b = px[p + 2];

    // Apply illumination flattening / shadow lift
    if (bgField) {
      const localBg = Math.max(75, bgField[i]);
      const gain = 1 + (246 / localBg - 1) * deshadow;
      r *= gain;
      g *= gain;
      b *= gain;
    }

    // Gentle glare shoulder compression for bright specular highlights
    if (glareStrength > 0.02) {
      const maxC = Math.max(r, g, b);
      if (maxC > 224) {
        const excess = maxC - 224;
        const compressed = 224 + excess * (1 - glareStrength * 0.45);
        const scale = compressed / Math.max(1, maxC);
        r *= scale;
        g *= scale;
        b *= scale;
      }
    }

    // Contrast around mid-paper balance
    if (Math.abs(contrastFactor - 1) > 0.01) {
      r = (r - 138) * contrastFactor + 138;
      g = (g - 138) * contrastFactor + 138;
      b = (b - 138) * contrastFactor + 138;
    }

    px[p] = Math.max(0, Math.min(255, r));
    px[p + 1] = Math.max(0, Math.min(255, g));
    px[p + 2] = Math.max(0, Math.min(255, b));
  }

  // 2. Denoise (3x3 edge-preserving bilateral blend)
  const denoise = Math.max(0, Math.min(1, cleanup.denoiseStrength / 100));
  if (denoise > 0.04) {
    const srcCopy = new Uint8ClampedArray(px);
    const edgeTol = 32;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const cr = srcCopy[idx];
        const cg = srcCopy[idx + 1];
        const cb = srcCopy[idx + 2];
        let sumR = cr;
        let sumG = cg;
        let sumB = cb;
        let wSum = 1;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = ((y + dy) * w + (x + dx)) * 4;
            const nr = srcCopy[nIdx];
            const ng = srcCopy[nIdx + 1];
            const nb = srcCopy[nIdx + 2];
            const diff = Math.abs(nr - cr) + Math.abs(ng - cg) + Math.abs(nb - cb);
            if (diff < edgeTol * 3) {
              sumR += nr;
              sumG += ng;
              sumB += nb;
              wSum++;
            }
          }
        }

        px[idx] = cr * (1 - denoise * 0.7) + (sumR / wSum) * (denoise * 0.7);
        px[idx + 1] = cg * (1 - denoise * 0.7) + (sumG / wSum) * (denoise * 0.7);
        px[idx + 2] = cb * (1 - denoise * 0.7) + (sumB / wSum) * (denoise * 0.7);
      }
    }
  }

  // 3. Unsharp mask sharpening for crisp ink & handwriting strokes
  const sharpenAmt = Math.max(0, Math.min(1.1, (cleanup.sharpen / 100) * 0.95));
  if (sharpenAmt > 0.03) {
    const srcCopy = new Uint8ClampedArray(px);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const up = idx - w * 4;
        const dn = idx + w * 4;
        const lf = idx - 4;
        const rt = idx + 4;

        for (let c = 0; c < 3; c++) {
          const blur =
            (srcCopy[up + c] + srcCopy[dn + c] + srcCopy[lf + c] + srcCopy[rt + c] + srcCopy[idx + c]) /
            5;
          const val = srcCopy[idx + c] + (srcCopy[idx + c] - blur) * sharpenAmt;
          px[idx + c] = Math.max(0, Math.min(255, val));
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Deterministic cylindrical spine un-warp & binding gutter shadow lift for Book Mode spreads.
 */
function applySpreadGutterAndCurvature(
  canvas: HTMLCanvasElement,
  spreadSide: 'left' | 'right' | undefined,
  cleanup: ScanCleanupSettings
): void {
  if (!spreadSide) return;
  const gutterLift = Math.max(0, Math.min(1, (cleanup.gutterShadowReduction ?? 65) / 100));
  const curveAmt = Math.max(0, Math.min(1, (cleanup.curvatureCorrection ?? 45) / 100));
  if (gutterLift < 0.02 && curveAmt < 0.02) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const srcImg = ctx.getImageData(0, 0, w, h);
  const src = srcImg.data;
  const dstImg = ctx.createImageData(w, h);
  const dst = dstImg.data;

  // Compute column average brightness to lift dark gutter shadow column-by-column
  const colMeans = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let cnt = 0;
    for (let y = Math.floor(h * 0.1); y < Math.floor(h * 0.9); y += 4) {
      const idx = (y * w + x) * 4;
      sum += 0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];
      cnt++;
    }
    colMeans[x] = cnt > 0 ? sum / cnt : 220;
  }

  // Reference brightness from outer clean half of the page
  let refSum = 0;
  let refN = 0;
  const refStart = spreadSide === 'left' ? Math.floor(w * 0.15) : Math.floor(w * 0.45);
  const refEnd = spreadSide === 'left' ? Math.floor(w * 0.55) : Math.floor(w * 0.85);
  for (let x = refStart; x < refEnd; x++) {
    refSum += colMeans[x];
    refN++;
  }
  const refMean = Math.max(130, refN > 0 ? refSum / refN : 220);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Distance from spine edge (0 at spine, 1 at outer fore-edge)
      const distFromSpine = spreadSide === 'left' ? (w - 1 - x) / w : x / w;

      // Subtle vertical curvature compensation near the binding curve (first 24% from spine)
      let sy = y;
      if (curveAmt > 0.02 && distFromSpine < 0.24) {
        const t = 1 - distFromSpine / 0.24; // 1 at spine, 0 at 24%
        const yCentered = (y - h / 2) / (h / 2);
        const shift = yCentered * t * t * curveAmt * (h * 0.024);
        sy = Math.max(0, Math.min(h - 1, Math.round(y - shift)));
      }

      const sIdx = (sy * w + x) * 4;
      const dIdx = (y * w + x) * 4;

      let r = src[sIdx];
      let g = src[sIdx + 1];
      let b = src[sIdx + 2];

      if (gutterLift > 0.02 && distFromSpine < 0.28) {
        const weight = Math.pow(1 - distFromSpine / 0.28, 1.35) * gutterLift;
        const localCol = Math.max(60, colMeans[x]);
        const targetGain = Math.min(2.1, Math.max(1, refMean / localCol));
        const gain = 1 + (targetGain - 1) * weight;
        r *= gain;
        g *= gain;
        b *= gain;
      }

      dst[dIdx] = Math.max(0, Math.min(255, r));
      dst[dIdx + 1] = Math.max(0, Math.min(255, g));
      dst[dIdx + 2] = Math.max(0, Math.min(255, b));
      dst[dIdx + 3] = 255;
    }
  }

  ctx.putImageData(dstImg, 0, 0);
}

export async function processScannedPage(
  originalDataUrl: string,
  rotationDeg: 0 | 90 | 180 | 270,
  corners: [ScanCornerPoint, ScanCornerPoint, ScanCornerPoint, ScanCornerPoint],
  cleanup: ScanCleanupSettings,
  spreadSide?: 'left' | 'right'
): Promise<{
  enhancedDataUrl: string;
  width: number;
  height: number;
  appliedDeskewDeg: number;
}> {
  const img = await loadImageElement(originalDataUrl);
  let working = drawRotatedToCanvas(img, rotationDeg);

  if (cleanup.autoPerspective) {
    working = warpPerspectiveCanvas(working, corners);
  }

  applySpreadGutterAndCurvature(working, spreadSide, cleanup);

  let appliedDeskewDeg = cleanup.fineAngleDeg;
  if (cleanup.autoDeskew && Math.abs(cleanup.fineAngleDeg) < 0.1) {
    appliedDeskewDeg = estimateFineDeskewDeg(working);
  }
  if (Math.abs(appliedDeskewDeg) >= 0.15) {
    working = rotateFineAngle(working, appliedDeskewDeg);
  }

  applyDeterministicEnhancements(working, cleanup);

  return {
    enhancedDataUrl: working.toDataURL('image/jpeg', 0.88),
    width: working.width,
    height: working.height,
    appliedDeskewDeg,
  };
}

/**
 * Estimates the book spine / gutter split X-coordinate (0.38..0.62) in an open 2-page spread photo.
 */
export async function detectSpreadSplitRatio(dataUrl: string): Promise<number> {
  const img = await loadImageElement(dataUrl);
  const w = 240;
  const h = Math.max(100, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0.5;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const minX = Math.floor(w * 0.38);
  const maxX = Math.ceil(w * 0.62);
  let bestX = Math.round(w * 0.5);
  let lowestLum = Infinity;

  for (let x = minX; x <= maxX; x++) {
    let colSum = 0;
    for (let y = Math.floor(h * 0.12); y < Math.floor(h * 0.88); y += 2) {
      const idx = (y * w + x) * 4;
      colSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
    // Slight prior favoring center 0.5 when page has no deep shadow
    const centerPenalty = Math.abs(x / w - 0.5) * 450;
    const score = colSum + centerPenalty;
    if (score < lowestLum) {
      lowestLum = score;
      bestX = x;
    }
  }

  return Number(Math.max(0.36, Math.min(0.64, bestX / w)).toFixed(3));
}

export async function splitBookSpreadDataUrl(
  spreadDataUrl: string,
  customSplitRatio?: number
): Promise<{
  splitRatio: number;
  leftDataUrl: string;
  leftWidth: number;
  leftHeight: number;
  rightDataUrl: string;
  rightWidth: number;
  rightHeight: number;
}> {
  const img = await loadImageElement(spreadDataUrl);
  const splitRatio =
    typeof customSplitRatio === 'number'
      ? Math.max(0.32, Math.min(0.68, customSplitRatio))
      : await detectSpreadSplitRatio(spreadDataUrl);

  const fullW = img.naturalWidth;
  const fullH = img.naturalHeight;
  // Add small 1.2% overlap so gutter margins aren't sliced too tightly
  const overlapPx = Math.round(fullW * 0.012);
  const splitPx = Math.round(fullW * splitRatio);

  const leftW = Math.max(60, Math.min(fullW, splitPx + overlapPx));
  const leftCanvas = document.createElement('canvas');
  leftCanvas.width = leftW;
  leftCanvas.height = fullH;
  const lCtx = leftCanvas.getContext('2d');
  if (lCtx) {
    lCtx.drawImage(img, 0, 0, leftW, fullH, 0, 0, leftW, fullH);
  }

  const rightStartX = Math.max(0, splitPx - overlapPx);
  const rightW = Math.max(60, fullW - rightStartX);
  const rightCanvas = document.createElement('canvas');
  rightCanvas.width = rightW;
  rightCanvas.height = fullH;
  const rCtx = rightCanvas.getContext('2d');
  if (rCtx) {
    rCtx.drawImage(img, rightStartX, 0, rightW, fullH, 0, 0, rightW, fullH);
  }

  return {
    splitRatio,
    leftDataUrl: leftCanvas.toDataURL('image/jpeg', 0.9),
    leftWidth: leftW,
    leftHeight: fullH,
    rightDataUrl: rightCanvas.toDataURL('image/jpeg', 0.9),
    rightWidth: rightW,
    rightHeight: fullH,
  };
}

export async function computeVisualFingerprint(dataUrl: string): Promise<number[]> {
  try {
    const img = await loadImageElement(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, 8, 8);
    const { data } = ctx.getImageData(0, 0, 8, 8);
    const fp: number[] = [];
    for (let i = 0; i < 64; i++) {
      const p = i * 4;
      fp.push(Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]));
    }
    return fp;
  } catch {
    return [];
  }
}

export async function cropNormalizedBox(
  dataUrl: string,
  box: ScanBoundingBox,
  pad = 0.02
): Promise<string> {
  const img = await loadImageElement(dataUrl);
  const sx = Math.max(0, box.x - pad) * img.naturalWidth;
  const sy = Math.max(0, box.y - pad) * img.naturalHeight;
  const ex = Math.min(1, box.x + box.width + pad) * img.naturalWidth;
  const ey = Math.min(1, box.y + box.height + pad) * img.naturalHeight;
  const sw = Math.max(24, Math.round(ex - sx));
  const sh = Math.max(24, Math.round(ey - sy));

  const maxCrop = 960;
  const scale = Math.min(1, maxCrop / Math.max(sw, sh));
  const dw = Math.max(16, Math.round(sw * scale));
  const dh = Math.max(16, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvas.toDataURL('image/jpeg', 0.9);
}


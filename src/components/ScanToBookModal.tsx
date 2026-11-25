import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  Columns2,
  Download,
  Eye,
  FileCheck2,
  FileImage,
  FileSearch,
  FileText,
  ImagePlus,
  Languages,
  ListOrdered,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { PALETTE_PRESETS } from '../data/palettes';
import {
  EbookDocument,
  PaletteId,
  ScanCleanupSettings,
  ScanCornerPoint,
  ScanExtractedItem,
  ScanOcrWord,
  ScanOutputMode,
  ScanPageOcrResult,
  ScanPageRecord,
  ScanTocEntry,
} from '../types/ebook';
import { exportAsEpub } from '../utils/exporters';
import { buildEbookFromScans } from '../utils/scanBookBuilder';
import {
  DEFAULT_CLEANUP_SETTINGS,
  DEFAULT_SCAN_CORNERS,
  assessCaptureQuality,
  assessVideoFrameQuality,
  computeVisualFingerprint,
  detectPageCorners,
  loadImageElement,
  normalizeImportedImage,
  processScannedPage,
  splitBookSpreadDataUrl,
} from '../utils/scanImageProcessor';
import {
  buildOriginalScanPdf,
  buildSearchableScanPdf,
  triggerPdfDownload,
} from '../utils/scanPdfBuilder';
import {
  analyzeScanSequence,
  buildDefaultTocFromPages,
  detectPrintedPageNumber,
  extractItemsFromOcrPage,
} from '../utils/scanStructureAnalyzer';

type ScanWizardStep = 'capture' | 'cleanup' | 'ocr' | 'order' | 'output';

interface OcrStatusInfo {
  visionConfigured: boolean;
  authMode: 'api-key' | 'service-account' | 'none';
  setupInstructions: string[];
}

interface ScanToBookModalProps {
  open: boolean;
  defaultPalette: PaletteId;
  initialBook?: EbookDocument | null;
  onClose: () => void;
  onSaveBook: (book: EbookDocument, openInReader: boolean) => Promise<void> | void;
}

const OCR_LANGUAGE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'auto', label: 'Auto-detect language' },
  { code: 'en', label: 'English (en)' },
  { code: 'bn', label: 'Bengali / Bangla (bn)' },
  { code: 'hi', label: 'Hindi (hi)' },
  { code: 'ar', label: 'Arabic (ar · RTL)' },
  { code: 'ur', label: 'Urdu (ur · RTL)' },
  { code: 'es', label: 'Spanish (es)' },
  { code: 'fr', label: 'French (fr)' },
  { code: 'de', label: 'German (de)' },
  { code: 'pt', label: 'Portuguese (pt)' },
  { code: 'ja', label: 'Japanese (ja)' },
  { code: 'zh', label: 'Chinese (zh)' },
  { code: 'ko', label: 'Korean (ko)' },
  { code: 'ta', label: 'Tamil (ta)' },
];

const EMPTY_OCR_RESULT: ScanPageOcrResult = {
  status: 'idle',
  rawText: '',
  correctedText: '',
  textDirection: 'ltr',
  overallConfidence: 0,
  words: [],
  paragraphs: [],
};

export const ScanToBookModal: React.FC<ScanToBookModalProps> = ({
  open,
  defaultPalette,
  initialBook = null,
  onClose,
  onSaveBook,
}) => {
  const [step, setStep] = useState<ScanWizardStep>('capture');
  const [pages, setPages] = useState<ScanPageRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [captureMode, setCaptureMode] = useState<'single' | 'spread'>('single');

  // Book metadata & output options
  const [title, setTitle] = useState('Scanned Book');
  const [author, setAuthor] = useState('Scanned Capture');
  const [paletteId, setPaletteId] = useState<PaletteId>(defaultPalette);
  const [outputMode, setOutputMode] = useState<ScanOutputMode>('reflowable-ebook');
  const [languageHint, setLanguageHint] = useState<string>('auto');
  const [customToc, setCustomToc] = useState<ScanTocEntry[]>([]);

  // Camera & gallery input state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveQuality, setLiveQuality] = useState<ReturnType<typeof assessVideoFrameQuality>>(null);
  const [retakeTargetId, setRetakeTargetId] = useState<string | null>(null);
  const [importingImages, setImportingImages] = useState(false);

  // Cleanup & Book Mode Spread Split UI state
  const [compareMode, setCompareMode] = useState<'enhanced' | 'original' | 'split'>('enhanced');
  const [splitPercent, setSplitPercent] = useState(50);
  const [spreadSplitDraft, setSpreadSplitDraft] = useState(50);
  const [editCornersMode, setEditCornersMode] = useState(false);
  const [processingCleanup, setProcessingCleanup] = useState(false);
  const [draggingCornerIdx, setDraggingCornerIdx] = useState<number | null>(null);

  // OCR & Cloud Vision + Extracted Tables/Formulas/Diagrams state
  const [ocrStatus, setOcrStatus] = useState<OcrStatusInfo | null>(null);
  const [userConsentedOcr, setUserConsentedOcr] = useState(false);
  const [runningOcrAll, setRunningOcrAll] = useState(false);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [wordEditDraft, setWordEditDraft] = useState('');
  const [ocrViewSource, setOcrViewSource] = useState<'original' | 'enhanced'>('original');
  const [explainingItemId, setExplainingItemId] = useState<string | null>(null);
  const [itemExplainError, setItemExplainError] = useState<string | null>(null);

  // Export & creation state
  const [creatingBook, setCreatingBook] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFallbackInputRef = useRef<HTMLInputElement | null>(null);
  const cornerStageRef = useRef<HTMLDivElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activePage = pages[selectedIndex] ?? null;

  useEffect(() => {
    if (activePage?.spreadSplitRatio) {
      setSpreadSplitDraft(Math.round(activePage.spreadSplitRatio * 100));
    } else {
      setSpreadSplitDraft(50);
    }
  }, [activePage?.id, activePage?.spreadSplitRatio]);

  // Hydrate when opening or switching book-to-review
  useEffect(() => {
    if (!open) return;
    if (initialBook?.scanData) {
      const hydrated = initialBook.scanData.pages.map((p, idx) => ({
        ...p,
        originalCaptureIndex: p.originalCaptureIndex ?? idx,
      }));
      setPages(hydrated);
      setSelectedIndex(0);
      setTitle(initialBook.title);
      setAuthor(initialBook.author);
      setPaletteId(initialBook.paletteId);
      setOutputMode(initialBook.scanData.outputMode);
      setLanguageHint(initialBook.scanData.languageHint || 'auto');
      setCustomToc(
        initialBook.scanData.customToc && initialBook.scanData.customToc.length > 0
          ? initialBook.scanData.customToc
          : buildDefaultTocFromPages(hydrated)
      );
      setStep(hydrated.some((p) => p.ocr.status === 'done') ? 'ocr' : 'cleanup');
    } else {
      setPages([]);
      setSelectedIndex(0);
      setTitle('Scanned Book');
      setAuthor('Scanned Capture');
      setPaletteId(defaultPalette);
      setOutputMode('reflowable-ebook');
      setLanguageHint('auto');
      setCustomToc([]);
      setStep('capture');
    }
    setCaptureMode('single');
    setRetakeTargetId(null);
    setSelectedWordId(null);
    setExportNotice(null);
    setExportError(null);
    setItemExplainError(null);
    setUserConsentedOcr(false);
  }, [open, initialBook, defaultPalette]);

  // Fetch Cloud Vision server availability when modal opens
  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch('/api/ocr/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data) setOcrStatus(data as OcrStatusInfo);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setLiveQuality(null);
  }, []);

  useEffect(() => {
    if (!open || step !== 'capture') {
      stopCamera();
    }
  }, [open, step, stopCamera]);

  useEffect(() => {
    if (!cameraActive) return;
    const timer = window.setInterval(() => {
      if (videoRef.current) {
        const metrics = assessVideoFrameQuality(videoRef.current);
        if (metrics) setLiveQuality(metrics);
      }
    }, 650);
    return () => window.clearInterval(timer);
  }, [cameraActive]);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Live camera preview is unavailable in this browser/frame. Use "Device Camera App" or "Import from Gallery" below.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      }, 40);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Camera access was denied or blocked by browser permissions.';
      setCameraError(
        `${msg} You can still capture using "Device Camera App" or import images from your gallery.`
      );
    }
  };

  const buildPageRecordFromDataUrl = async (
    originalDataUrl: string,
    width: number,
    height: number,
    sourceName: string,
    spreadInfo?: {
      spreadId: string;
      spreadSide: 'left' | 'right';
      spreadOriginalDataUrl: string;
      spreadSplitRatio: number;
    },
    captureIndex?: number
  ): Promise<ScanPageRecord> => {
    const [quality, corners, fingerprint] = await Promise.all([
      assessCaptureQuality(originalDataUrl),
      detectPageCorners(originalDataUrl, 0),
      computeVisualFingerprint(originalDataUrl),
    ]);
    const processed = await processScannedPage(
      originalDataUrl,
      0,
      corners,
      DEFAULT_CLEANUP_SETTINGS,
      spreadInfo?.spreadSide
    );
    return {
      id: `scan-pg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sourceName,
      originalDataUrl,
      enhancedDataUrl: processed.enhancedDataUrl,
      width: processed.width || width,
      height: processed.height || height,
      rotationDeg: 0,
      corners,
      cleanup: { ...DEFAULT_CLEANUP_SETTINGS },
      appliedDeskewDeg: processed.appliedDeskewDeg,
      quality,
      ocr: { ...EMPTY_OCR_RESULT },
      createdAt: Date.now(),
      originalCaptureIndex: captureIndex,
      visualFingerprint: fingerprint,
      ...(spreadInfo ?? {}),
    };
  };

  const ingestImageDataUrl = async (
    dataUrl: string,
    width: number,
    height: number,
    sourceName: string,
    startingSeqIndex: number
  ): Promise<ScanPageRecord[]> => {
    // When retaking an individual page, replace only that page even if book mode is active
    if (captureMode === 'spread' && !retakeTargetId) {
      const split = await splitBookSpreadDataUrl(dataUrl);
      const spreadId = `spread-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const leftRec = await buildPageRecordFromDataUrl(
        split.leftDataUrl,
        split.leftWidth,
        split.leftHeight,
        `${sourceName} (Left)`,
        {
          spreadId,
          spreadSide: 'left',
          spreadOriginalDataUrl: dataUrl,
          spreadSplitRatio: split.splitRatio,
        },
        startingSeqIndex
      );
      const rightRec = await buildPageRecordFromDataUrl(
        split.rightDataUrl,
        split.rightWidth,
        split.rightHeight,
        `${sourceName} (Right)`,
        {
          spreadId,
          spreadSide: 'right',
          spreadOriginalDataUrl: dataUrl,
          spreadSplitRatio: split.splitRatio,
        },
        startingSeqIndex + 1
      );
      return [leftRec, rightRec];
    }

    const existingTarget = retakeTargetId
      ? pages.find((p) => p.id === retakeTargetId)
      : undefined;
    const single = await buildPageRecordFromDataUrl(
      dataUrl,
      width,
      height,
      sourceName,
      existingTarget?.spreadSide && existingTarget?.spreadId
        ? {
            spreadId: existingTarget.spreadId,
            spreadSide: existingTarget.spreadSide,
            spreadOriginalDataUrl: existingTarget.spreadOriginalDataUrl || dataUrl,
            spreadSplitRatio: existingTarget.spreadSplitRatio ?? 0.5,
          }
        : undefined,
      startingSeqIndex
    );
    return [single];
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setImportingImages(true);
    setExportError(null);
    try {
      const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
      const newRecords: ScanPageRecord[] = [];
      let nextSeq = pages.length;
      const maxImportDim = captureMode === 'spread' && !retakeTargetId ? 2400 : 1800;

      for (const file of files) {
        const normalized = await normalizeImportedImage(file, maxImportDim);
        const created = await ingestImageDataUrl(
          normalized.dataUrl,
          normalized.width,
          normalized.height,
          file.name,
          nextSeq
        );
        newRecords.push(...created);
        nextSeq += created.length;
      }

      if (newRecords.length > 0) {
        if (retakeTargetId) {
          const replacement = newRecords[0];
          setPages((prev) =>
            prev.map((p) =>
              p.id === retakeTargetId
                ? { ...replacement, id: p.id, originalCaptureIndex: p.originalCaptureIndex }
                : p
            )
          );
          setRetakeTargetId(null);
        } else {
          setPages((prev) => {
            const combined = [...prev, ...newRecords];
            if (prev.length === 0) setSelectedIndex(0);
            else setSelectedIndex(prev.length);
            return combined;
          });
        }
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to import scanned image.');
    } finally {
      setImportingImages(false);
    }
  };

  const captureFromLiveCamera = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    setImportingImages(true);
    try {
      const maxDim = captureMode === 'spread' && !retakeTargetId ? 2400 : 1800;
      const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.max(1, Math.round(video.videoWidth * scale));
      const h = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const created = await ingestImageDataUrl(
        dataUrl,
        w,
        h,
        `Camera Scan ${new Date().toLocaleTimeString()}`,
        pages.length
      );
      if (retakeTargetId && created[0]) {
        const replacement = created[0];
        setPages((prev) =>
          prev.map((p) =>
            p.id === retakeTargetId
              ? { ...replacement, id: p.id, originalCaptureIndex: p.originalCaptureIndex }
              : p
          )
        );
        setRetakeTargetId(null);
      } else if (created.length > 0) {
        setPages((prev) => {
          const next = [...prev, ...created];
          setSelectedIndex(prev.length);
          return next;
        });
      }
    } finally {
      setImportingImages(false);
    }
  };

  const movePage = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= pages.length) return;
    setPages((prev) => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
    setSelectedIndex(target);
  };

  const deletePageById = (pageId: string) => {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === pageId);
      const next = prev.filter((p) => p.id !== pageId);
      if (selectedIndex >= next.length) {
        setSelectedIndex(Math.max(0, next.length - 1));
      } else if (idx !== -1 && idx < selectedIndex) {
        setSelectedIndex(Math.max(0, selectedIndex - 1));
      }
      return next;
    });
  };

  const deletePage = (idx: number) => {
    const target = pages[idx];
    if (target) deletePageById(target.id);
  };

  const reprocessPage = async (
    pageIndex: number,
    patch: {
      rotationDeg?: 0 | 90 | 180 | 270;
      corners?: [ScanCornerPoint, ScanCornerPoint, ScanCornerPoint, ScanCornerPoint];
      cleanup?: ScanCleanupSettings;
    }
  ) => {
    const target = pages[pageIndex];
    if (!target) return;
    setProcessingCleanup(true);
    try {
      const nextRot = patch.rotationDeg ?? target.rotationDeg;
      const nextCorners = patch.corners ?? target.corners;
      const nextCleanup = patch.cleanup ?? target.cleanup;
      const result = await processScannedPage(
        target.originalDataUrl,
        nextRot,
        nextCorners,
        nextCleanup,
        target.spreadSide
      );
      setPages((prev) =>
        prev.map((p, i) =>
          i === pageIndex
            ? {
                ...p,
                rotationDeg: nextRot,
                corners: nextCorners,
                cleanup: nextCleanup,
                enhancedDataUrl: result.enhancedDataUrl,
                width: result.width,
                height: result.height,
                appliedDeskewDeg: result.appliedDeskewDeg,
              }
            : p
        )
      );
    } finally {
      setProcessingCleanup(false);
    }
  };

  const handleResplitSpread = async () => {
    if (!activePage?.spreadOriginalDataUrl || !activePage.spreadId) return;
    setProcessingCleanup(true);
    try {
      const ratio = spreadSplitDraft / 100;
      const split = await splitBookSpreadDataUrl(activePage.spreadOriginalDataUrl, ratio);
      const [leftQ, leftC, rightQ, rightC] = await Promise.all([
        assessCaptureQuality(split.leftDataUrl),
        detectPageCorners(split.leftDataUrl, 0),
        assessCaptureQuality(split.rightDataUrl),
        detectPageCorners(split.rightDataUrl, 0),
      ]);
      const [leftProc, rightProc] = await Promise.all([
        processScannedPage(split.leftDataUrl, 0, leftC, activePage.cleanup, 'left'),
        processScannedPage(split.rightDataUrl, 0, rightC, activePage.cleanup, 'right'),
      ]);

      setPages((prev) =>
        prev.map((p) => {
          if (p.spreadId !== activePage.spreadId) return p;
          if (p.spreadSide === 'left') {
            return {
              ...p,
              originalDataUrl: split.leftDataUrl,
              enhancedDataUrl: leftProc.enhancedDataUrl,
              width: leftProc.width || split.leftWidth,
              height: leftProc.height || split.leftHeight,
              corners: leftC,
              quality: leftQ,
              appliedDeskewDeg: leftProc.appliedDeskewDeg,
              spreadSplitRatio: split.splitRatio,
            };
          }
          return {
            ...p,
            originalDataUrl: split.rightDataUrl,
            enhancedDataUrl: rightProc.enhancedDataUrl,
            width: rightProc.width || split.rightWidth,
            height: rightProc.height || split.rightHeight,
            corners: rightC,
            quality: rightQ,
            appliedDeskewDeg: rightProc.appliedDeskewDeg,
            spreadSplitRatio: split.splitRatio,
          };
        })
      );
    } finally {
      setProcessingCleanup(false);
    }
  };

  const rotatePage = async (idx: number) => {
    const target = pages[idx];
    if (!target) return;
    const nextRot = (((target.rotationDeg + 90) % 360) as 0 | 90 | 180 | 270);
    const freshCorners = await detectPageCorners(target.originalDataUrl, nextRot);
    await reprocessPage(idx, { rotationDeg: nextRot, corners: freshCorners });
  };

  const handleAutoDetectEdges = async () => {
    if (!activePage) return;
    setProcessingCleanup(true);
    try {
      const detected = await detectPageCorners(
        activePage.originalDataUrl,
        activePage.rotationDeg
      );
      await reprocessPage(selectedIndex, { corners: detected });
    } finally {
      setProcessingCleanup(false);
    }
  };

  const applyCleanupToAllPages = async () => {
    if (!activePage || pages.length === 0) return;
    setProcessingCleanup(true);
    try {
      const template = activePage.cleanup;
      const updated = [...pages];
      for (let i = 0; i < updated.length; i++) {
        const p = updated[i];
        const res = await processScannedPage(
          p.originalDataUrl,
          p.rotationDeg,
          p.corners,
          { ...template },
          p.spreadSide
        );
        updated[i] = {
          ...p,
          cleanup: { ...template },
          enhancedDataUrl: res.enhancedDataUrl,
          width: res.width,
          height: res.height,
          appliedDeskewDeg: res.appliedDeskewDeg,
        };
      }
      setPages(updated);
    } finally {
      setProcessingCleanup(false);
    }
  };

  const updateCornerFromPointer = (clientX: number, clientY: number) => {
    if (draggingCornerIdx === null || !cornerStageRef.current || !activePage) return;
    const rect = cornerStageRef.current.getBoundingClientRect();
    const x = Math.max(0.01, Math.min(0.99, Number(((clientX - rect.left) / rect.width).toFixed(3))));
    const y = Math.max(0.01, Math.min(0.99, Number(((clientY - rect.top) / rect.height).toFixed(3))));
    const nextCorners = [...activePage.corners] as [
      ScanCornerPoint,
      ScanCornerPoint,
      ScanCornerPoint,
      ScanCornerPoint,
    ];
    nextCorners[draggingCornerIdx] = { x, y };
    setPages((prev) =>
      prev.map((p, i) => (i === selectedIndex ? { ...p, corners: nextCorners } : p))
    );
  };

  // Run Cloud Vision OCR on a single page (explicit user click + consent required)
  const runOcrForPage = async (pageIdx: number): Promise<boolean> => {
    const target = pages[pageIdx];
    if (!target || !userConsentedOcr) return false;

    setPages((prev) =>
      prev.map((p, i) =>
        i === pageIdx
          ? { ...p, ocr: { ...p.ocr, status: 'processing', errorMessage: undefined } }
          : p
      )
    );

    try {
      const resp = await fetch('/api/ocr/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: target.enhancedDataUrl || target.originalDataUrl,
          languageHint,
          userConsented: true,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data?.setupRequired && Array.isArray(data?.setupInstructions)) {
          setOcrStatus({
            visionConfigured: false,
            authMode: 'none',
            setupInstructions: data.setupInstructions,
          });
        }
        throw new Error(data?.error || 'Google Cloud Vision OCR failed.');
      }

      const rawText = String(data.rawText || '');
      const result: ScanPageOcrResult = {
        status: 'done',
        rawText,
        correctedText: rawText,
        detectedLanguage: data.detectedLanguage,
        textDirection: data.textDirection === 'rtl' ? 'rtl' : 'ltr',
        overallConfidence: Number(data.overallConfidence ?? 0),
        words: Array.isArray(data.words) ? data.words : [],
        paragraphs: Array.isArray(data.paragraphs) ? data.paragraphs : [],
        imageRegions: Array.isArray(data.imageRegions) ? data.imageRegions : [],
        processedAt: Date.now(),
      };

      const printedPageNum = detectPrintedPageNumber(result, rawText);
      const updatedTarget: ScanPageRecord = {
        ...target,
        ocr: result,
        detectedPageNumber: target.detectedPageNumber ?? printedPageNum,
      };
      const extractedItems = await extractItemsFromOcrPage(updatedTarget);

      setPages((prev) =>
        prev.map((p, i) =>
          i === pageIdx
            ? {
                ...p,
                ocr: result,
                detectedPageNumber: p.detectedPageNumber ?? printedPageNum,
                extractedItems,
              }
            : p
        )
      );

      if (pageIdx === selectedIndex && result.words.length > 0) {
        const firstUncertain = result.words.find((w) => w.isUncertain);
        if (firstUncertain) {
          setSelectedWordId(firstUncertain.id);
          setWordEditDraft(firstUncertain.text);
        }
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cloud OCR failed.';
      setPages((prev) =>
        prev.map((p, i) =>
          i === pageIdx
            ? {
                ...p,
                ocr: {
                  ...p.ocr,
                  status: 'error',
                  errorMessage: msg,
                },
              }
            : p
        )
      );
      return false;
    }
  };

  const runOcrAllPages = async () => {
    if (!userConsentedOcr || pages.length === 0) return;
    setRunningOcrAll(true);
    try {
      for (let i = 0; i < pages.length; i++) {
        const ok = await runOcrForPage(i);
        if (!ok && i === 0) break;
      }
    } finally {
      setRunningOcrAll(false);
    }
  };

  const handleAddManualItem = async (kind: 'diagram' | 'table' | 'formula') => {
    if (!activePage) return;
    const imgUrl = activePage.enhancedDataUrl || activePage.originalDataUrl;
    const item: ScanExtractedItem = {
      id: `item-manual-${Date.now()}`,
      kind,
      title:
        kind === 'diagram'
          ? 'Annotated Diagram / Figure'
          : kind === 'table'
            ? 'Table Region'
            : 'Formula Region',
      rawText:
        kind === 'formula'
          ? ''
          : activePage.ocr.correctedText.split('\n').slice(0, 4).join('\n'),
      cropDataUrl: imgUrl,
      box: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
      confidence: activePage.ocr.overallConfidence || 0.9,
      isUncertain: activePage.ocr.words.some((w) => w.isUncertain),
    };
    setPages((prev) =>
      prev.map((p, i) =>
        i === selectedIndex
          ? { ...p, extractedItems: [...(p.extractedItems ?? []), item] }
          : p
      )
    );
  };

  const handleExplainItem = async (item: ScanExtractedItem) => {
    if (!activePage) return;
    setExplainingItemId(item.id);
    setItemExplainError(null);
    try {
      const resp = await fetch('/api/ai/explain-scan-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: item.kind,
          rawText: item.tableRows
            ? item.tableRows.map((r) => r.join(' | ')).join('\n')
            : item.rawText,
          imageDataUrl: item.cropDataUrl || activePage.enhancedDataUrl || activePage.originalDataUrl,
          bookTitle: title,
          pageNumber: selectedIndex + 1,
          isUncertain: item.isUncertain,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Could not explain item.');
      const explanation = String(data.explanation || '');
      setPages((prev) =>
        prev.map((p, i) =>
          i === selectedIndex
            ? {
                ...p,
                extractedItems: (p.extractedItems ?? []).map((it) =>
                  it.id === item.id ? { ...it, aiExplanation: explanation } : it
                ),
              }
            : p
        )
      );
    } catch (err) {
      setItemExplainError(err instanceof Error ? err.message : 'Item explanation failed.');
    } finally {
      setExplainingItemId(null);
    }
  };

  const selectedWord: ScanOcrWord | null = useMemo(() => {
    if (!activePage || !selectedWordId) return null;
    return activePage.ocr.words.find((w) => w.id === selectedWordId) ?? null;
  }, [activePage, selectedWordId]);

  useEffect(() => {
    if (!selectedWord || !activePage || !loupeCanvasRef.current) return;
    const canvas = loupeCanvasRef.current;
    const imgUrl = activePage.enhancedDataUrl || activePage.originalDataUrl;
    let cancelled = false;

    loadImageElement(imgUrl)
      .then((img) => {
        if (cancelled || !loupeCanvasRef.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const padX = Math.max(0.05, selectedWord.box.width * 1.4);
        const padY = Math.max(0.035, selectedWord.box.height * 2.0);
        const sxNorm = Math.max(0, selectedWord.box.x - padX);
        const syNorm = Math.max(0, selectedWord.box.y - padY);
        const exNorm = Math.min(1, selectedWord.box.x + selectedWord.box.width + padX);
        const eyNorm = Math.min(1, selectedWord.box.y + selectedWord.box.height + padY);

        const sx = sxNorm * img.naturalWidth;
        const sy = syNorm * img.naturalHeight;
        const sw = Math.max(20, (exNorm - sxNorm) * img.naturalWidth);
        const sh = Math.max(16, (eyNorm - syNorm) * img.naturalHeight);

        canvas.width = 420;
        canvas.height = 140;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const scale = Math.min(canvas.width / sw, canvas.height / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);

        const wx = dx + (selectedWord.box.x - sxNorm) * img.naturalWidth * scale;
        const wy = dy + (selectedWord.box.y - syNorm) * img.naturalHeight * scale;
        const ww = selectedWord.box.width * img.naturalWidth * scale;
        const wh = selectedWord.box.height * img.naturalHeight * scale;
        ctx.strokeStyle = selectedWord.isUncertain ? '#d97706' : '#0284c7';
        ctx.lineWidth = 2;
        ctx.strokeRect(wx, wy, ww, wh);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedWord, activePage]);

  const applyWordCorrection = () => {
    if (!activePage || !selectedWord) return;
    const oldToken = selectedWord.text;
    const nextToken = wordEditDraft.trim();
    if (!nextToken || nextToken === oldToken) return;

    const escaped = oldToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const updatedText = activePage.ocr.correctedText.replace(new RegExp(escaped), nextToken);

    setPages((prev) =>
      prev.map((p, i) =>
        i === selectedIndex
          ? {
              ...p,
              ocr: {
                ...p.ocr,
                correctedText: updatedText,
                words: p.ocr.words.map((w) =>
                  w.id === selectedWord.id
                    ? { ...w, text: nextToken, confidence: 1, isUncertain: false }
                    : w
                ),
              },
            }
          : p
      )
    );
  };

  // Sequence & Completeness coach analysis + TOC auto-seed when entering Order & TOC step
  const sequenceIssues = useMemo(() => analyzeScanSequence(pages), [pages]);

  useEffect(() => {
    if (step === 'order' && customToc.length === 0 && pages.length > 0) {
      setCustomToc(buildDefaultTocFromPages(pages));
    }
  }, [step, customToc.length, pages]);

  const sortByDetectedPageNumbers = () => {
    setPages((prev) => {
      const sorted = [...prev].sort((a, b) => {
        const na = typeof a.detectedPageNumber === 'number' ? a.detectedPageNumber : Number.MAX_SAFE_INTEGER;
        const nb = typeof b.detectedPageNumber === 'number' ? b.detectedPageNumber : Number.MAX_SAFE_INTEGER;
        if (na !== nb) return na - nb;
        return (a.originalCaptureIndex ?? a.createdAt) - (b.originalCaptureIndex ?? b.createdAt);
      });
      return sorted;
    });
    setSelectedIndex(0);
  };

  const restoreOriginalSequence = () => {
    setPages((prev) =>
      [...prev].sort(
        (a, b) => (a.originalCaptureIndex ?? a.createdAt) - (b.originalCaptureIndex ?? b.createdAt)
      )
    );
    setSelectedIndex(0);
  };

  const handleDownloadSelectedPdf = async (mode: 'searchable-pdf' | 'original-pdf') => {
    if (pages.length === 0) return;
    setExportError(null);
    setExportNotice(null);
    setCreatingBook(true);
    try {
      const slug =
        title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 42) || 'scanned-book';
      if (mode === 'original-pdf') {
        const blob = await buildOriginalScanPdf(pages, { title, author });
        triggerPdfDownload(blob, `${slug}-original-scans.pdf`);
        setExportNotice('Downloaded Original Scan PDF (unmodified page images).');
      } else {
        const res = await buildSearchableScanPdf(pages, { title, author });
        triggerPdfDownload(res.blob, `${slug}-searchable.pdf`);
        setExportNotice(
          res.skippedNonLatinPages > 0
            ? `Downloaded Searchable PDF (${res.embeddedWords} Latin OCR words embedded). Note: ${res.skippedNonLatinPages} page(s) with non-Latin scripts preserve full searchable UTF-8 text in Reflowable eBook / EPUB.`
            : `Downloaded Searchable PDF with ${res.embeddedWords} selectable OCR words.`
        );
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'PDF export failed.');
    } finally {
      setCreatingBook(false);
    }
  };

  const handleFinalizeBook = async () => {
    if (pages.length === 0) return;
    setCreatingBook(true);
    setExportError(null);
    try {
      const effectiveToc =
        customToc.length > 0 ? customToc : buildDefaultTocFromPages(pages);

      const book = buildEbookFromScans({
        title,
        author,
        paletteId,
        outputMode,
        languageHint,
        pages,
        customToc: effectiveToc,
        existingBook: initialBook,
      });

      const slug =
        title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 42) || 'scanned-book';
      if (outputMode === 'original-pdf') {
        const blob = await buildOriginalScanPdf(pages, { title, author });
        triggerPdfDownload(blob, `${slug}-original-scans.pdf`);
      } else if (outputMode === 'searchable-pdf') {
        const res = await buildSearchableScanPdf(pages, { title, author });
        triggerPdfDownload(res.blob, `${slug}-searchable.pdf`);
      } else if (outputMode === 'reflowable-epub') {
        await exportAsEpub(book);
      }

      await onSaveBook(book, true);
      onClose();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not create scanned book.');
    } finally {
      setCreatingBook(false);
    }
  };

  if (!open) return null;

  const uncertainCountOnPage =
    activePage?.ocr.words.filter((w) => w.isUncertain).length ?? 0;
  const totalOcrDone = pages.filter((p) => p.ocr.status === 'done').length;

  const STEP_ORDER: ScanWizardStep[] = ['capture', 'cleanup', 'ocr', 'order', 'output'];
  const currentStepIdx = STEP_ORDER.indexOf(step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Scan to Book Studio"
    >
      <div className="w-full max-w-6xl h-[92vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#F9F9F8] dark:bg-[#0D1017] text-zinc-900 dark:text-zinc-100 shadow-2xl flex flex-col overflow-hidden">
        {/* Hidden Inputs */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple={!retakeTargetId}
          className="hidden"
          onChange={(e) => {
            void handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraFallbackInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Header */}
        <header className="px-4 sm:px-6 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <ScanLine className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-lg font-semibold leading-tight truncate">
                {initialBook ? `Review Scans — ${initialBook.title}` : 'Scan to Book Studio'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate tabular-nums">
                {pages.length} {pages.length === 1 ? 'page' : 'pages'} · Book Mode · Quality Coach · Handwriting OCR
              </p>
            </div>
          </div>

          {/* 5-Step Tabs */}
          <nav className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
            {(
              [
                { id: 'capture', label: '1. Capture' },
                { id: 'cleanup', label: '2. Clean & Split' },
                { id: 'ocr', label: '3. OCR & Items' },
                { id: 'order', label: '4. Order & TOC' },
                { id: 'output', label: '5. Create Book' },
              ] as Array<{ id: ScanWizardStep; label: string }>
            ).map((item) => {
              const active = step === item.id;
              const disabled = item.id !== 'capture' && pages.length === 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setStep(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
                    active
                      ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                      : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label="Close Scan to Book"
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Main Workspace */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* STEP 1: CAPTURE, BOOK MODE & QUALITY COACH */}
          {step === 'capture' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                {/* Single Page vs Book Mode (2-Page Spread) Selector */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      <Columns2 className="w-3.5 h-3.5 text-amber-500" />
                      <span>Capture Mode</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {captureMode === 'spread'
                        ? 'Book Mode splits each open 2-page spread into Left & Right pages automatically.'
                        : 'Single Page captures one page per shot or imported photo.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setCaptureMode('single')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                        captureMode === 'single'
                          ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                          : 'text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      Single Page
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaptureMode('spread')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                        captureMode === 'spread'
                          ? 'bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950'
                          : 'text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      Book Mode (2-Page Spread)
                    </button>
                  </div>
                </div>

                {retakeTargetId && (
                  <div className="rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-amber-900 dark:text-amber-200">
                      Retaking selected page — capture or choose a replacement image.
                    </span>
                    <button
                      type="button"
                      onClick={() => setRetakeTargetId(null)}
                      className="font-semibold underline text-amber-800 dark:text-amber-300"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {cameraActive ? (
                  <div className="rounded-2xl overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-black relative">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full max-h-[420px] object-contain mx-auto"
                    />
                    {/* Framing Guide (with spine guide in Book Mode) */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-6 border-2 border-dashed border-amber-400/75 rounded-xl flex justify-center"
                    >
                      {captureMode === 'spread' && !retakeTargetId && (
                        <div className="h-full w-px border-l-2 border-dashed border-amber-400/90 flex items-start justify-center">
                          <span className="mt-2 px-1.5 py-0.5 rounded bg-black/75 text-amber-300 text-[10px] font-medium whitespace-nowrap">
                            Book Spine
                          </span>
                        </div>
                      )}
                    </div>
                    {liveQuality && (
                      <div className="bg-zinc-950/85 text-zinc-100 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-3 tabular-nums">
                          <span>Focus: {liveQuality.blurScore}/100</span>
                          <span>·</span>
                          <span>Light: {liveQuality.brightness}/255</span>
                          <span>·</span>
                          <span>Glare: {Math.round(liveQuality.glareRatio * 100)}%</span>
                        </div>
                        <span
                          className={`font-medium ${
                            liveQuality.overall === 'good'
                              ? 'text-emerald-400'
                              : liveQuality.overall === 'fair'
                                ? 'text-amber-400'
                                : 'text-rose-400'
                          }`}
                        >
                          {liveQuality.coachSummary || liveQuality.warnings[0] || 'Ready'}
                        </span>
                      </div>
                    )}
                    <div className="p-3 bg-zinc-900 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="px-3 py-2 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                      >
                        Stop Camera
                      </button>
                      <button
                        type="button"
                        disabled={importingImages}
                        onClick={() => void captureFromLiveCamera()}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-zinc-950 text-xs font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60"
                      >
                        {importingImages ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4" />
                        )}
                        <span>
                          {captureMode === 'spread' && !retakeTargetId
                            ? 'Capture 2-Page Spread'
                            : 'Capture Page'}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void handleFilesSelected(e.dataTransfer.files);
                    }}
                    className="rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#12151E] p-7 text-center space-y-5"
                  >
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      {captureMode === 'spread' ? (
                        <Columns2 className="w-6 h-6" />
                      ) : (
                        <Camera className="w-6 h-6" />
                      )}
                    </div>
                    <div className="space-y-1.5 max-w-md mx-auto">
                      <h3 className="font-serif text-xl font-semibold">
                        {captureMode === 'spread'
                          ? 'Capture an open two-page book spread'
                          : 'Capture book pages or import photos'}
                      </h3>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {captureMode === 'spread'
                          ? 'Align the spine near the center. Left and right pages will be split, flattened, and de-shadowed automatically.'
                          : 'Scan printed or handwritten pages. Images stay on your device for quality coaching and cleanup before you consent to OCR.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => void startCamera()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Live Camera</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraFallbackInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                      >
                        <ImagePlus className="w-4 h-4" />
                        <span>Device Camera App</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Import from Gallery</span>
                      </button>
                    </div>

                    {importingImages && (
                      <div className="inline-flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>
                          {captureMode === 'spread'
                            ? 'Splitting spread, correcting curvature, and analyzing page quality…'
                            : 'Analyzing page edges and scan quality…'}
                        </span>
                      </div>
                    )}

                    {cameraError && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 max-w-lg mx-auto">
                        {cameraError}
                      </p>
                    )}
                  </div>
                )}

                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-4 space-y-2">
                  <h4 className="text-xs font-semibold">Scan Quality Coach Guidelines</h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <li>· Keep all margins and bottom lines inside the frame so text is not cut off.</li>
                    <li>· Hold steady with bright side lighting to prevent dark gutter shadows.</li>
                    <li>· Tilt slightly away from overhead lights if glossy pages glare.</li>
                    <li>· Fill the frame closely enough that small text stays crisp (&ge; 820px).</li>
                  </ul>
                </div>
              </div>

              {/* Right Column: Active Page Preview & Scan Quality Coach */}
              <div className="lg:col-span-5 space-y-3">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">
                      {activePage
                        ? `Page ${selectedIndex + 1} of ${pages.length}${
                            activePage.spreadSide ? ` · ${activePage.spreadSide.toUpperCase()} HALF` : ''
                          }`
                        : 'No pages captured yet'}
                    </span>
                    {activePage && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          activePage.quality.overall === 'good'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : activePage.quality.overall === 'fair'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {activePage.quality.overall === 'good' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                        <span className="capitalize">
                          {activePage.quality.overall === 'poor'
                            ? 'Poor — Retake Advised'
                            : activePage.quality.overall === 'fair'
                              ? 'Fair — Check Warnings'
                              : 'Good Quality'}
                        </span>
                      </span>
                    )}
                  </div>

                  {activePage ? (
                    <>
                      <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center max-h-[280px]">
                        <img
                          src={activePage.enhancedDataUrl || activePage.originalDataUrl}
                          alt={`Scanned page ${selectedIndex + 1}`}
                          referrerPolicy="no-referrer"
                          className="max-h-[280px] w-auto object-contain"
                        />
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] tabular-nums pt-1">
                        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-2">
                          <div className="text-zinc-500">Focus</div>
                          <div className="font-semibold">{activePage.quality.blurScore}/100</div>
                        </div>
                        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-2">
                          <div className="text-zinc-500">Light</div>
                          <div className="font-semibold">{activePage.quality.brightness}</div>
                        </div>
                        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-2">
                          <div className="text-zinc-500">Glare</div>
                          <div className="font-semibold">
                            {Math.round(activePage.quality.glareRatio * 100)}%
                          </div>
                        </div>
                        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-2">
                          <div className="text-zinc-500">Size</div>
                          <div className="font-semibold">
                            {activePage.width}×{activePage.height}
                          </div>
                        </div>
                      </div>

                      {/* Quality Coach Assessment & Retake/Keep actions */}
                      <div
                        className={`rounded-xl border p-3 space-y-2 text-xs ${
                          activePage.quality.overall === 'poor'
                            ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
                            : activePage.quality.overall === 'fair'
                              ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                              : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-200'
                        }`}
                      >
                        <p className="font-medium">
                          {activePage.quality.coachSummary ||
                            (activePage.quality.overall === 'good'
                              ? 'Clear focus, framing, and lighting — ready for OCR.'
                              : 'Image needs attention before OCR.')}
                        </p>
                        {activePage.quality.warnings.length > 0 && (
                          <ul className="space-y-0.5 opacity-90">
                            {activePage.quality.warnings.map((w, i) => (
                              <li key={i}>· {w}</li>
                            ))}
                          </ul>
                        )}
                        {activePage.quality.overall !== 'good' && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setRetakeTargetId(activePage.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 font-semibold text-[11px]"
                            >
                              <Camera className="w-3 h-3" />
                              <span>Retake This Page</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPages((prev) =>
                                  prev.map((p, i) =>
                                    i === selectedIndex
                                      ? { ...p, keepAnyway: !p.keepAnyway }
                                      : p
                                  )
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium ${
                                activePage.keepAnyway
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-current opacity-85'
                              }`}
                            >
                              {activePage.keepAnyway ? 'Kept by User' : 'Keep Page Anyway'}
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="h-56 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-xs text-zinc-500 px-6 text-center">
                      Captured pages appear here with sharpness, cut-off edge, glare, and readability coaching.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CLEANUP, CORNER CROP & BOOK SPREAD SPLIT ADJUSTER */}
          {step === 'cleanup' && activePage && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-900">
                    {(
                      [
                        { id: 'enhanced', label: 'Enhanced' },
                        { id: 'original', label: 'Original' },
                        { id: 'split', label: 'Split Compare' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setEditCornersMode(false);
                          setCompareMode(m.id);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                          !editCornersMode && compareMode === m.id
                            ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-sm'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditCornersMode((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap ${
                        editCornersMode
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                          : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {editCornersMode ? 'Editing 4 Corners' : 'Adjust Page Corners'}
                    </button>
                    <button
                      type="button"
                      disabled={processingCleanup}
                      onClick={() => void handleAutoDetectEdges()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${processingCleanup ? 'animate-spin' : ''}`} />
                      <span>Auto-Detect Edges</span>
                    </button>
                  </div>
                </div>

                {/* Image Stage */}
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 p-3 flex flex-col items-center justify-center min-h-[380px] relative select-none">
                  {editCornersMode ? (
                    <div
                      ref={cornerStageRef}
                      onPointerMove={(e) => {
                        if (draggingCornerIdx !== null) {
                          updateCornerFromPointer(e.clientX, e.clientY);
                        }
                      }}
                      onPointerUp={() => {
                        if (draggingCornerIdx !== null) {
                          setDraggingCornerIdx(null);
                          void reprocessPage(selectedIndex, {});
                        }
                      }}
                      className="relative inline-block max-h-[360px] touch-none"
                    >
                      <img
                        src={activePage.originalDataUrl}
                        alt="Original scan for corner adjustment"
                        referrerPolicy="no-referrer"
                        style={{ transform: `rotate(${activePage.rotationDeg}deg)` }}
                        className="max-h-[360px] w-auto block rounded-lg pointer-events-none"
                      />
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 w-full h-full pointer-events-none"
                      >
                        <polygon
                          points={activePage.corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ')}
                          fill="rgba(245, 158, 11, 0.14)"
                          stroke="#f59e0b"
                          strokeWidth="0.7"
                        />
                      </svg>
                      {activePage.corners.map((corner, idx) => (
                        <button
                          key={idx}
                          type="button"
                          aria-label={`Corner ${idx + 1}`}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setDraggingCornerIdx(idx);
                          }}
                          style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-amber-500 border-2 border-white shadow-lg cursor-grab active:cursor-grabbing"
                        />
                      ))}
                    </div>
                  ) : compareMode === 'split' ? (
                    <div className="space-y-3 w-full flex flex-col items-center">
                      <div className="relative inline-block max-h-[360px] overflow-hidden rounded-lg">
                        <img
                          src={activePage.enhancedDataUrl}
                          alt="Enhanced scan"
                          referrerPolicy="no-referrer"
                          className="max-h-[360px] w-auto block"
                        />
                        <div
                          className="absolute inset-0 overflow-hidden"
                          style={{ clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }}
                        >
                          <img
                            src={activePage.originalDataUrl}
                            alt="Original scan"
                            referrerPolicy="no-referrer"
                            className="max-h-[360px] w-auto block"
                          />
                        </div>
                        <div
                          aria-hidden="true"
                          className="absolute inset-y-0 w-0.5 bg-amber-400 shadow"
                          style={{ left: `${splitPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-3 w-full max-w-sm text-xs text-zinc-300">
                        <span>Original</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={splitPercent}
                          onChange={(e) => setSplitPercent(Number(e.target.value))}
                          className="flex-1 accent-amber-500"
                        />
                        <span>Enhanced</span>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={
                        compareMode === 'original'
                          ? activePage.originalDataUrl
                          : activePage.enhancedDataUrl
                      }
                      alt={compareMode === 'original' ? 'Original scan' : 'Enhanced scan'}
                      referrerPolicy="no-referrer"
                      className="max-h-[360px] w-auto object-contain rounded-lg"
                    />
                  )}
                </div>

                {/* Book Mode Spread Split Adjuster (preserved original spread photo) */}
                {activePage.spreadOriginalDataUrl && (
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold flex items-center gap-1.5">
                        <Columns2 className="w-4 h-4 text-amber-500" />
                        <span>Original 2-Page Spread & Spine Split Adjuster</span>
                      </span>
                      <span className="font-mono tabular-nums text-zinc-500">
                        Split at {spreadSplitDraft}%
                      </span>
                    </div>
                    <div className="relative inline-block max-h-40 mx-auto overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-950">
                      <img
                        src={activePage.spreadOriginalDataUrl}
                        alt="Original two-page spread"
                        referrerPolicy="no-referrer"
                        className="max-h-40 w-auto block"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-y-0 w-0.5 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]"
                        style={{ left: `${spreadSplitDraft}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={34}
                        max={66}
                        value={spreadSplitDraft}
                        onChange={(e) => setSpreadSplitDraft(Number(e.target.value))}
                        className="flex-1 accent-amber-500"
                      />
                      <button
                        type="button"
                        disabled={processingCleanup}
                        onClick={() => void handleResplitSpread()}
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        Re-Split Left & Right
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Deterministic non-generative pixel cleanup only: perspective warp, deskew (
                  {activePage.appliedDeskewDeg.toFixed(1)}°), gutter shadow lift, curvature flattening,
                  glare reduction, and sharpening. Original capture remains preserved.
                </p>
              </div>

              {/* Right: Cleanup Sliders */}
              <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <SlidersHorizontal className="w-4 h-4 text-amber-500" />
                    <span>Page Cleanup Controls</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void reprocessPage(selectedIndex, {
                        corners: DEFAULT_SCAN_CORNERS,
                        cleanup: { ...DEFAULT_CLEANUP_SETTINGS },
                      })
                    }
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white underline"
                  >
                    Undo / Reset
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs py-1">
                  <label className="font-medium">Auto Perspective Crop & Flatten</label>
                  <input
                    type="checkbox"
                    checked={activePage.cleanup.autoPerspective}
                    onChange={(e) =>
                      void reprocessPage(selectedIndex, {
                        cleanup: { ...activePage.cleanup, autoPerspective: e.target.checked },
                      })
                    }
                    className="w-4 h-4 accent-amber-500"
                  />
                </div>

                <div className="flex items-center justify-between text-xs py-1">
                  <label className="font-medium">Auto Deskew Alignment</label>
                  <input
                    type="checkbox"
                    checked={activePage.cleanup.autoDeskew}
                    onChange={(e) =>
                      void reprocessPage(selectedIndex, {
                        cleanup: { ...activePage.cleanup, autoDeskew: e.target.checked },
                      })
                    }
                    className="w-4 h-4 accent-amber-500"
                  />
                </div>

                {(
                  [
                    { key: 'deshadowStrength', label: 'De-shadow & Page Flattening', min: 0, max: 100, step: 2 },
                    ...(activePage.spreadSide
                      ? [
                          {
                            key: 'gutterShadowReduction' as const,
                            label: 'Book Binding Gutter Shadow Lift',
                            min: 0,
                            max: 100,
                            step: 2,
                          },
                          {
                            key: 'curvatureCorrection' as const,
                            label: 'Spine Curvature Flattening',
                            min: 0,
                            max: 100,
                            step: 2,
                          },
                        ]
                      : []),
                    { key: 'glareReduction', label: 'Glare Reduction', min: 0, max: 100, step: 2 },
                    { key: 'denoiseStrength', label: 'Denoise', min: 0, max: 100, step: 2 },
                    { key: 'contrast', label: 'Contrast', min: -30, max: 60, step: 2 },
                    { key: 'sharpen', label: 'Sharpen Ink', min: 0, max: 100, step: 2 },
                    { key: 'fineAngleDeg', label: 'Fine Rotation (°)', min: -8, max: 8, step: 0.5 },
                  ] as Array<{ key: keyof ScanCleanupSettings; label: string; min: number; max: number; step: number }>
                ).map((ctrl) => {
                  const rawVal = activePage.cleanup[ctrl.key];
                  const val = typeof rawVal === 'number' ? rawVal : 0;
                  return (
                    <div key={ctrl.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-700 dark:text-zinc-300">{ctrl.label}</span>
                        <span className="font-mono tabular-nums text-zinc-500">{val}</span>
                      </div>
                      <input
                        type="range"
                        min={ctrl.min}
                        max={ctrl.max}
                        step={ctrl.step}
                        value={val}
                        onChange={(e) => {
                          const nextVal = Number(e.target.value);
                          setPages((prev) =>
                            prev.map((p, i) =>
                              i === selectedIndex
                                ? { ...p, cleanup: { ...p.cleanup, [ctrl.key]: nextVal } }
                                : p
                            )
                          );
                        }}
                        onMouseUp={() => void reprocessPage(selectedIndex, {})}
                        onTouchEnd={() => void reprocessPage(selectedIndex, {})}
                        className="w-full accent-amber-500"
                      />
                    </div>
                  );
                })}

                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={processingCleanup}
                    onClick={() => void reprocessPage(selectedIndex, {})}
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    {processingCleanup ? 'Processing…' : 'Apply to Page'}
                  </button>
                  {pages.length > 1 && (
                    <button
                      type="button"
                      disabled={processingCleanup}
                      onClick={() => void applyCleanupToAllPages()}
                      className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Apply to All
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: HANDWRITING REVIEW + TABLES, FORMULAS & DIAGRAMS */}
          {step === 'ocr' && activePage && (
            <div className="space-y-5">
              {/* Consent & Cloud Vision Status */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Cloud Handwriting OCR Privacy & Service</span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Nothing leaves your device automatically. After you consent below and click Run OCR,
                      the enhanced scan is sent to <strong>Google Cloud Vision (DOCUMENT_TEXT_DETECTION)</strong>{' '}
                      to extract printed text, handwriting, tables, formulas, and page numbers.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Languages className="w-4 h-4 text-zinc-500" />
                    <select
                      value={languageHint}
                      onChange={(e) => setLanguageHint(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs font-medium"
                    >
                      {OCR_LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {ocrStatus && !ocrStatus.visionConfigured && (
                  <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3.5 text-xs space-y-1.5 text-amber-950 dark:text-amber-200">
                    <div className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Google Cloud Vision OCR credentials are not configured on the server yet</span>
                    </div>
                    <ol className="list-decimal pl-5 space-y-0.5">
                      {ocrStatus.setupInstructions.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userConsentedOcr}
                      onChange={(e) => setUserConsentedOcr(e.target.checked)}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <span>I consent to send selected scan images to Google Cloud Vision OCR</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        !userConsentedOcr ||
                        activePage.ocr.status === 'processing' ||
                        runningOcrAll
                      }
                      onClick={() => void runOcrForPage(selectedIndex)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
                    >
                      {activePage.ocr.status === 'processing' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileSearch className="w-3.5 h-3.5" />
                      )}
                      <span>Run OCR (Page {selectedIndex + 1})</span>
                    </button>

                    {pages.length > 1 && (
                      <button
                        type="button"
                        disabled={!userConsentedOcr || runningOcrAll}
                        onClick={() => void runOcrAllPages()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 whitespace-nowrap"
                      >
                        {runningOcrAll ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ScanLine className="w-3.5 h-3.5" />
                        )}
                        <span>Run All ({totalOcrDone}/{pages.length})</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {activePage.ocr.status === 'error' && activePage.ocr.errorMessage && (
                <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-800 dark:text-rose-200">
                  <span>{activePage.ocr.errorMessage}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRetakeTargetId(activePage.id);
                        setStep('capture');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold"
                    >
                      Retake Page
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOutputMode('original-pdf');
                        setStep('output');
                      }}
                      className="px-2.5 py-1 rounded-lg border border-rose-400 font-semibold"
                    >
                      Use Original Scan PDF
                    </button>
                  </div>
                </div>
              )}

              {/* Split Handwriting & Print Review */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">Original vs Enhanced Scan</span>
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-900">
                      <button
                        type="button"
                        onClick={() => setOcrViewSource('enhanced')}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                          ocrViewSource === 'enhanced' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-zinc-500'
                        }`}
                      >
                        Enhanced
                      </button>
                      <button
                        type="button"
                        onClick={() => setOcrViewSource('original')}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                          ocrViewSource === 'original' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-zinc-500'
                        }`}
                      >
                        Original
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl overflow-hidden bg-zinc-950 p-2 flex justify-center">
                    <div className="relative inline-block max-h-[360px]">
                      <img
                        src={
                          ocrViewSource === 'original'
                            ? activePage.originalDataUrl
                            : activePage.enhancedDataUrl
                        }
                        alt={`OCR reference page ${selectedIndex + 1}`}
                        referrerPolicy="no-referrer"
                        className="max-h-[360px] w-auto block rounded"
                      />
                      {ocrViewSource === 'enhanced' &&
                        activePage.ocr.words.map((word) => {
                          const isSelected = word.id === selectedWordId;
                          if (!word.isUncertain && !isSelected) return null;
                          return (
                            <button
                              key={word.id}
                              type="button"
                              title={`"${word.text}" (${Math.round(word.confidence * 100)}% confidence)`}
                              onClick={() => {
                                setSelectedWordId(word.id);
                                setWordEditDraft(word.text);
                              }}
                              style={{
                                left: `${word.box.x * 100}%`,
                                top: `${word.box.y * 100}%`,
                                width: `${word.box.width * 100}%`,
                                height: `${word.box.height * 100}%`,
                              }}
                              className={`absolute rounded-sm border-2 transition-colors ${
                                isSelected
                                  ? 'border-sky-400 bg-sky-400/25'
                                  : 'border-amber-400 bg-amber-400/20 hover:bg-amber-400/35'
                              }`}
                            />
                          );
                        })}
                    </div>
                  </div>

                  {selectedWord && (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 p-3 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <ZoomIn className="w-3.5 h-3.5 text-amber-500" />
                          <span>Zoomed Handwriting / Print Loupe</span>
                        </span>
                        <span className="font-mono tabular-nums text-zinc-500">
                          Confidence: {Math.round(selectedWord.confidence * 100)}%
                        </span>
                      </div>
                      <canvas
                        ref={loupeCanvasRef}
                        className="w-full h-24 object-contain rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={wordEditDraft}
                          onChange={(e) => setWordEditDraft(e.target.value)}
                          placeholder="Correct this word..."
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                        />
                        <button
                          type="button"
                          onClick={applyWordCorrection}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-semibold hover:bg-amber-400 whitespace-nowrap"
                        >
                          Replace Word
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-4 space-y-3 flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="font-semibold">Handwriting & Text Review</span>
                      {activePage.ocr.status === 'done' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{Math.round(activePage.ocr.overallConfidence * 100)}% confidence</span>
                          {activePage.ocr.detectedLanguage && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="uppercase">{activePage.ocr.detectedLanguage}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              uncertainCountOnPage > 0
                                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }
                          >
                            {uncertainCountOnPage} uncertain
                          </span>
                        </>
                      )}
                    </div>

                    {activePage.ocr.rawText && (
                      <button
                        type="button"
                        onClick={() =>
                          setPages((prev) =>
                            prev.map((p, i) =>
                              i === selectedIndex
                                ? { ...p, ocr: { ...p.ocr, correctedText: p.ocr.rawText } }
                                : p
                            )
                          )
                        }
                        className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white underline"
                      >
                        Reset to Raw OCR
                      </button>
                    )}
                  </div>

                  {activePage.ocr.words.length > 0 && (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-3 max-h-36 overflow-y-auto">
                      <div className="text-[11px] text-zinc-500 mb-2">
                        Uncertain handwriting/words are highlighted — tap to zoom and edit rather than guessing:
                      </div>
                      <div
                        dir={activePage.ocr.textDirection}
                        className="flex flex-wrap gap-1.5 leading-relaxed"
                      >
                        {activePage.ocr.words.map((word) => {
                          const isSelected = word.id === selectedWordId;
                          return (
                            <button
                              key={word.id}
                              type="button"
                              onClick={() => {
                                setOcrViewSource('enhanced');
                                setSelectedWordId(word.id);
                                setWordEditDraft(word.text);
                              }}
                              title={`Confidence: ${Math.round(word.confidence * 100)}%`}
                              className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                                isSelected
                                  ? 'bg-sky-500 text-white font-semibold'
                                  : word.isUncertain
                                    ? 'bg-amber-500/20 border-b-2 border-amber-500 text-amber-900 dark:text-amber-200 font-medium'
                                    : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                              }`}
                            >
                              {word.text}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Editable Page Text (use # for headings, | for table columns, [1] for footnotes)
                    </label>
                    <textarea
                      dir={activePage.ocr.textDirection}
                      value={activePage.ocr.correctedText}
                      onChange={(e) => {
                        const nextTxt = e.target.value;
                        setPages((prev) =>
                          prev.map((p, i) =>
                            i === selectedIndex
                              ? { ...p, ocr: { ...p.ocr, correctedText: nextTxt } }
                              : p
                          )
                        );
                      }}
                      rows={10}
                      placeholder={
                        activePage.ocr.status === 'idle'
                          ? 'Consent above and click "Run OCR", or transcribe printed/handwritten notes manually here…'
                          : 'Edit or correct extracted text here…'
                      }
                      className="w-full flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Tables, Formulas & Diagrams Detection + AI Side-by-Side Explanation */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Table2 className="w-4 h-4 text-amber-500" />
                      <span>Tables, Formulas & Diagrams on Page {selectedIndex + 1}</span>
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Extracted notation and values are preserved verbatim. Uncertain items are flagged for your review.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleAddManualItem('diagram')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Mark Page as Diagram</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAddManualItem('formula')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Formula</span>
                    </button>
                  </div>
                </div>

                {itemExplainError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{itemExplainError}</p>
                )}

                {(activePage.extractedItems ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-4 text-xs text-zinc-500 text-center">
                    No tables, formulas, or diagrams auto-detected on this page yet. Run OCR above or click &ldquo;Mark Page as Diagram&rdquo; to attach a visual figure for explanation and export.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(activePage.extractedItems ?? []).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4"
                      >
                        {/* Original Crop Image */}
                        <div className="lg:col-span-4 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                              {item.kind}
                            </span>
                            <span className="font-mono tabular-nums text-zinc-500">
                              {Math.round(item.confidence * 100)}% conf.
                            </span>
                          </div>
                          {item.cropDataUrl && (
                            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-950 p-1.5 flex justify-center">
                              <img
                                src={item.cropDataUrl}
                                alt={item.title}
                                referrerPolicy="no-referrer"
                                className="max-h-44 w-auto object-contain rounded"
                              />
                            </div>
                          )}
                          {item.isUncertain && (
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>Uncertain extraction — verify numbers & symbols against crop.</span>
                            </div>
                          )}
                        </div>

                        {/* Verbatim Extracted Values & Editable Caption */}
                        <div className="lg:col-span-4 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">Extracted Content (Verbatim)</span>
                            <button
                              type="button"
                              onClick={() =>
                                setPages((prev) =>
                                  prev.map((p, i) =>
                                    i === selectedIndex
                                      ? {
                                          ...p,
                                          extractedItems: (p.extractedItems ?? []).filter(
                                            (it) => it.id !== item.id
                                          ),
                                        }
                                      : p
                                  )
                                )
                              }
                              className="text-rose-500 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                          {item.tableRows && item.tableRows.length > 0 ? (
                            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                              <table className="w-full border-collapse text-[11px] tabular-nums">
                                <tbody>
                                  {item.tableRows.map((row, ri) => (
                                    <tr key={ri}>
                                      {row.map((cell, ci) => (
                                        <td
                                          key={ci}
                                          className="border border-zinc-200 dark:border-zinc-800 px-2 py-1"
                                        >
                                          {cell}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <textarea
                              rows={4}
                              value={item.rawText}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPages((prev) =>
                                  prev.map((p, i) =>
                                    i === selectedIndex
                                      ? {
                                          ...p,
                                          extractedItems: (p.extractedItems ?? []).map((it) =>
                                            it.id === item.id ? { ...it, rawText: val } : it
                                          ),
                                        }
                                      : p
                                  )
                                );
                              }}
                              placeholder="Caption or exact formula notation..."
                              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 font-mono text-[11px]"
                            />
                          )}
                        </div>

                        {/* Side-by-Side AI Explanation */}
                        <div className="lg:col-span-4 space-y-2 text-xs flex flex-col">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">AI Explanation</span>
                            <button
                              type="button"
                              disabled={explainingItemId === item.id}
                              onClick={() => void handleExplainItem(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 font-semibold text-[11px] disabled:opacity-50 whitespace-nowrap"
                            >
                              {explainingItemId === item.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              <span>{item.aiExplanation ? 'Re-Explain' : 'Explain Item'}</span>
                            </button>
                          </div>
                          <div className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[11px] leading-relaxed overflow-y-auto max-h-44">
                            {item.aiExplanation ? (
                              <div className="whitespace-pre-wrap">{item.aiExplanation}</div>
                            ) : (
                              <span className="text-zinc-500">
                                Click Explain Item to analyze this {item.kind} beside the original image without modifying numbers or labels.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: PAGE ORDER, COMPLETENESS & EDITABLE TABLE OF CONTENTS */}
          {step === 'order' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Completeness & Page Ordering Coach */}
              <div className="lg:col-span-7 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl font-semibold flex items-center gap-2">
                      <ListOrdered className="w-5 h-5 text-amber-500" />
                      <span>Page Order & Completeness Check</span>
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Detected page numbers, duplicates, blank scans, and missing gaps are highlighted below. Nothing changes unless you click an action.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={sortByDetectedPageNumbers}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold whitespace-nowrap"
                    >
                      Sort by Printed Numbers
                    </button>
                    <button
                      type="button"
                      onClick={restoreOriginalSequence}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Capture Order</span>
                    </button>
                  </div>
                </div>

                {/* Sequence Warnings */}
                {sequenceIssues.length > 0 ? (
                  <div className="space-y-2">
                    {sequenceIssues.map((issue) => (
                      <div
                        key={issue.id}
                        className={`rounded-xl border p-3 text-xs flex flex-wrap items-center justify-between gap-2 ${
                          issue.severity === 'warning'
                            ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200'
                            : 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 text-sky-950 dark:text-sky-200'
                        }`}
                      >
                        <div className="space-y-0.5 flex-1 min-w-[220px]">
                          <p className="font-semibold">{issue.message}</p>
                          <p className="opacity-85">{issue.suggestion}</p>
                        </div>
                        {(issue.type === 'duplicate' || issue.type === 'blank') &&
                          issue.affectedPageIds[0] && (
                            <button
                              type="button"
                              onClick={() => deletePageById(issue.affectedPageIds[0])}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold text-[11px] whitespace-nowrap"
                            >
                              Remove Flagged Page
                            </button>
                          )}
                        {issue.type === 'out-of-order' && (
                          <button
                            type="button"
                            onClick={sortByDetectedPageNumbers}
                            className="px-2.5 py-1 rounded-lg bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 font-semibold text-[11px] whitespace-nowrap"
                          >
                            Apply Suggested Sort
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25 p-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>No duplicate, blank, missing-gap, or page-number ordering issues detected.</span>
                  </div>
                )}

                {/* Manual Reorder + Printed Page Number Editor */}
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {pages.map((p, idx) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-2.5 flex items-center gap-3 text-xs"
                    >
                      <img
                        src={p.enhancedDataUrl || p.originalDataUrl}
                        alt={`Scan ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-11 h-14 object-cover rounded border border-zinc-200 dark:border-zinc-700 shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="font-semibold truncate">
                          Position #{idx + 1} · {p.sourceName}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 tabular-nums">
                          <span>Captured #{(p.originalCaptureIndex ?? idx) + 1}</span>
                          <span>·</span>
                          <label className="inline-flex items-center gap-1">
                            <span>Printed p.:</span>
                            <input
                              type="number"
                              min={1}
                              max={2500}
                              value={p.detectedPageNumber ?? ''}
                              placeholder="auto"
                              onChange={(e) => {
                                const val = e.target.value.trim();
                                const num = val ? Math.max(1, Number(val)) : null;
                                setPages((prev) =>
                                  prev.map((item) =>
                                    item.id === p.id
                                      ? { ...item, detectedPageNumber: num }
                                      : item
                                  )
                                );
                              }}
                              className="w-16 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => movePage(idx, -1)}
                          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-35"
                          title="Move Earlier"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === pages.length - 1}
                          onClick={() => movePage(idx, 1)}
                          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-35"
                          title="Move Later"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Editable Table of Contents */}
              <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-serif text-xl font-semibold">Table of Contents</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Edit chapters & sections before generating EPUB or eBook.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomToc(buildDefaultTocFromPages(pages))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Auto-Detect</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {customToc.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-2.5 flex items-center gap-2 text-xs"
                    >
                      <select
                        value={entry.level}
                        onChange={(e) => {
                          const lvl = e.target.value === 'section' ? 'section' : 'chapter';
                          setCustomToc((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, level: lvl } : c))
                          );
                        }}
                        className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[11px]"
                      >
                        <option value="chapter">Chapter</option>
                        <option value="section">Section</option>
                      </select>

                      <input
                        type="text"
                        value={entry.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomToc((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, title: val } : c))
                          );
                        }}
                        className="flex-1 min-w-0 px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                      />

                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, pages.length)}
                        value={entry.pageNumber}
                        onChange={(e) => {
                          const pNum = Math.min(
                            Math.max(1, Number(e.target.value) || 1),
                            Math.max(1, pages.length)
                          );
                          setCustomToc((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, pageNumber: pNum } : c))
                          );
                        }}
                        className="w-14 px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs tabular-nums"
                        title="Target Page"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setCustomToc((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded"
                        aria-label="Remove TOC entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setCustomToc((prev) => [
                      ...prev,
                      {
                        id: `toc-custom-${Date.now()}`,
                        title: `Chapter ${prev.length + 1}`,
                        pageNumber: Math.min(selectedIndex + 1, Math.max(1, pages.length)),
                        level: 'chapter',
                      },
                    ])
                  }
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-xs font-semibold hover:border-amber-500"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add TOC Entry</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: OUTPUT FORMAT & CREATE BOOK */}
          {step === 'output' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-5 space-y-4">
                  <h3 className="font-serif text-xl font-semibold">Output Format</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {(
                      [
                        {
                          id: 'reflowable-ebook',
                          title: 'Reflowable eBook (In-App Reader)',
                          desc: 'Structure-aware text with headings, TOC, footnotes, formulas, tables, diagrams, and linked original scans.',
                          icon: <BookOpen className="w-4 h-4 text-amber-500" />,
                        },
                        {
                          id: 'reflowable-epub',
                          title: 'Reflowable EPUB (.epub File + Library)',
                          desc: 'Downloads a real EPUB 3.0 package with your edited Table of Contents, tables, footnotes, and diagram images, and saves to your library.',
                          icon: <FileText className="w-4 h-4 text-violet-500" />,
                        },
                        {
                          id: 'searchable-pdf',
                          title: 'Searchable PDF (.pdf File + Library)',
                          desc: 'Preserves enhanced page images, embeds a selectable/searchable OCR text layer, downloads .PDF, and saves to your library.',
                          icon: <FileCheck2 className="w-4 h-4 text-emerald-500" />,
                        },
                        {
                          id: 'original-pdf',
                          title: 'Original Scan PDF (Unmodified Images)',
                          desc: 'Keeps your original scanned page images untouched without OCR changes, exports .PDF, and saves to your library.',
                          icon: <FileImage className="w-4 h-4 text-sky-500" />,
                        },
                      ] as const
                    ).map((opt) => {
                      const active = outputMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setOutputMode(opt.id)}
                          className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3 ${
                            active
                              ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/25'
                              : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">{opt.icon}</div>
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold">{opt.title}</span>
                              {active && <Check className="w-4 h-4 text-amber-600" />}
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                              {opt.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Direct Download Buttons */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={creatingBook || pages.length === 0}
                      onClick={() => void handleDownloadSelectedPdf('searchable-pdf')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Searchable PDF</span>
                    </button>
                    <button
                      type="button"
                      disabled={creatingBook || pages.length === 0}
                      onClick={() => void handleDownloadSelectedPdf('original-pdf')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Original Scan PDF</span>
                    </button>
                  </div>

                  {exportNotice && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">{exportNotice}</p>
                  )}
                  {exportError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400">{exportError}</p>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-5 space-y-4">
                  <h3 className="font-serif text-xl font-semibold">Book Details</h3>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Book Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Author / Source
                    </label>
                    <input
                      type="text"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Reader Colour Palette
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {PALETTE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setPaletteId(preset.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
                            paletteId === preset.id
                              ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'
                              : 'border-zinc-200 dark:border-zinc-800'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: preset.swatches[0] }}
                          />
                          <span>{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-600 dark:text-zinc-400 space-y-1 tabular-nums">
                    <div>Pages: {pages.length}</div>
                    <div>OCR processed: {totalOcrDone} / {pages.length} pages</div>
                    <div>TOC entries: {customToc.length}</div>
                    <div>Original scans & crops remain linked inside the saved book.</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Multi-page Thumbnail Strip + Footer Actions */}
        <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] px-4 sm:px-6 py-3 space-y-3">
          {pages.length > 0 && (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {pages.map((p, idx) => {
                const isSel = idx === selectedIndex;
                const uncertain = p.ocr.words.filter((w) => w.isUncertain).length;
                return (
                  <div
                    key={p.id}
                    className={`shrink-0 rounded-xl border p-1.5 transition-all flex flex-col gap-1 w-28 ${
                      isSel
                        ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIndex(idx);
                        setSelectedWordId(null);
                      }}
                      className="relative h-20 w-full rounded-lg overflow-hidden bg-zinc-200 dark:bg-zinc-950"
                    >
                      <img
                        src={p.enhancedDataUrl || p.originalDataUrl}
                        alt={`Thumbnail ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono tabular-nums">
                        {idx + 1}
                        {p.detectedPageNumber ? ` (p.${p.detectedPageNumber})` : ''}
                      </span>
                      {p.quality.overall !== 'good' && (
                        <span
                          title={p.quality.warnings.join(' ')}
                          className={`absolute top-1 right-1 p-0.5 rounded text-white ${
                            p.quality.overall === 'poor' ? 'bg-rose-600' : 'bg-amber-500'
                          }`}
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                        </span>
                      )}
                      {p.ocr.status === 'done' && (
                        <span
                          title={uncertain > 0 ? `${uncertain} uncertain words` : 'OCR complete'}
                          className={`absolute bottom-1 right-1 px-1 py-0.5 rounded text-[9px] font-semibold ${
                            uncertain > 0
                              ? 'bg-amber-500 text-zinc-950'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {uncertain > 0 ? `${uncertain}?` : 'OCR'}
                        </span>
                      )}
                    </button>

                    <div className="flex items-center justify-between gap-0.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => movePage(idx, -1)}
                        title="Move Left"
                        className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30"
                      >
                        <ArrowLeft className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void rotatePage(idx)}
                        title="Rotate 90°"
                        className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRetakeTargetId(p.id);
                          setStep('capture');
                        }}
                        title="Retake Page"
                        className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <Camera className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePage(idx)}
                        title="Delete Page"
                        className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === pages.length - 1}
                        onClick={() => movePage(idx, 1)}
                        title="Move Right"
                        className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30"
                      >
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setRetakeTargetId(null);
                  setStep('capture');
                  galleryInputRef.current?.click();
                }}
                className="shrink-0 h-28 w-24 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:border-amber-500 transition-colors"
              >
                <ImagePlus className="w-5 h-5" />
                <span>Add Page</span>
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Eye className="w-3.5 h-3.5" />
              <span>Original scan images remain preserved & linked inside the created book.</span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {currentStepIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(STEP_ORDER[currentStepIdx - 1])}
                  className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  Back
                </button>
              )}

              {currentStepIdx < STEP_ORDER.length - 1 ? (
                <button
                  type="button"
                  disabled={pages.length === 0}
                  onClick={() => setStep(STEP_ORDER[currentStepIdx + 1])}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
                >
                  <span>
                    {step === 'capture'
                      ? 'Next: Clean & Split'
                      : step === 'cleanup'
                        ? 'Next: OCR & Items'
                        : step === 'ocr'
                          ? 'Next: Order & TOC'
                          : 'Next: Output Format'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pages.length === 0 || creatingBook}
                  onClick={() => void handleFinalizeBook()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-zinc-950 text-xs font-semibold hover:bg-amber-400 disabled:opacity-40 whitespace-nowrap"
                >
                  {creatingBook ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>
                    {initialBook ? 'Save Scan Updates & Open Reader' : 'Create Book & Open in Reader'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Barcode,
  Printer,
  Plus,
  Minus,
  Trash2,
  Search,
  Sliders,
  Layers,
  RotateCcw,
  RefreshCw,
  Download,
  QrCode,
  Wand2,
  Save,
  Ruler,
  Crosshair,
  Settings2,
  Type,
  Square,
  Minus as LineIcon,
  Image as ImageIcon,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ArrowUp,
  ArrowUpDown,
  ArrowLeftRight,
  Table2,
  FolderKanban,
  PenTool,
  Upload,
  FileSpreadsheet,
  FileImage,
  FileDown,
  Scale,
  Hash,
  Calendar,
  Tag,
  GripVertical,
  Check,
  X,
} from "lucide-react";
import { type Product } from "@/lib/queries";
import { updateProductFn } from "@/lib/rpc";
import {
  getPosHardwareSettings,
  savePosHardwareSettings,
  DEFAULT_LABEL_SETTINGS,
  type PosLabelSettings,
  type BarcodeSymbology,
  type LabelElement,
  type LabelElementType,
  type LabelUnit,
  type LabelSavedTemplate,
} from "@/lib/pos-hardware";
import {
  LABEL_PRESETS,
  resolveProductBarcode,
  resolveProductVariantText,
  extractProductMeasurements,
  generateUniqueBarcode,
  generateStickerGraphicSvg,
  generateQrCodeSvg,
  computeStickerLayoutMetrics,
  computeEffectiveFontPt,
  resolveLabelVariables,
  mmToUnit,
  unitToMm,
  printProductLabels,
  printCalibrationSticker,
  downloadLabelsPdf,
  downloadLabelPng,
  type LabelQueueItem,
} from "@/lib/label-printer";
import { toast } from "sonner";

interface InstalledPrinter {
  name: string;
  isDefault?: boolean;
}

export interface LabelPrintingStudioProps {
  products?: Product[];
  initialProducts?: (Product & { initialCopies?: number })[];
  shopName?: string;
  lang?: string;
  embedded?: boolean;
  onPrinted?: () => void;
}

type StudioTab = "design" | "data" | "print" | "templates";
type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const BASE_PX_PER_MM = 5.4;

const VARIABLE_CHIPS: {
  token: string;
  labelEn: string;
  labelBn: string;
}[] = [
  { token: "{name}", labelEn: "Product Name", labelBn: "পণ্যের নাম" },
  { token: "{price}", labelEn: "Price (৳)", labelBn: "মূল্য (৳)" },
  { token: "{mrp}", labelEn: "MRP", labelBn: "এমআরপি" },
  { token: "{barcode}", labelEn: "Barcode/SKU", labelBn: "বারকোড" },
  { token: "{weight}", labelEn: "Weight", labelBn: "ওজন (Weight)" },
  { token: "{height}", labelEn: "Height", labelBn: "উচ্চতা (Height)" },
  { token: "{width}", labelEn: "Width", labelBn: "প্রস্থ (Width)" },
  { token: "{size}", labelEn: "Size/Measure", labelBn: "সাইজ/মাপ" },
  { token: "{variant}", labelEn: "Variant", labelBn: "ভ্যারিয়েন্ট" },
  { token: "{category}", labelEn: "Category", labelBn: "ক্যাটেগরি" },
  { token: "{date}", labelEn: "Date", labelBn: "তারিখ" },
  { token: "{exp_date}", labelEn: "Exp Date", labelBn: "মেয়াদ" },
  { token: "{serial}", labelEn: "Serial #", labelBn: "সিরিয়াল #" },
];

function makeId(prefix = "el"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function roundMm(val: number): number {
  return Math.round(val * 10) / 10;
}

function productToQueueRow(
  p: Product & { initialCopies?: number },
  fallbackCopies = 1
): LabelQueueItem {
  const m = extractProductMeasurements(p);
  return {
    id: makeId("row"),
    productId: p.id,
    name: p.name || "",
    code: resolveProductBarcode(p),
    price: Number(p.sell_price) || 0,
    mrp: undefined,
    category: p.category || "",
    variantText: resolveProductVariantText(p),
    weight: m.weight,
    heightText: m.heightText,
    widthText: m.widthText,
    measurement: m.measurement,
    mfgDate: "",
    expDate: "",
    serialStart: 1,
    copies: Math.max(1, Number(p.initialCopies) || fallbackCopies || 1),
  };
}

export function LabelPrintingStudio({
  products = [],
  initialProducts = [],
  shopName,
  lang = "bn",
  embedded = false,
  onPrinted,
}: LabelPrintingStudioProps) {
  const qc = useQueryClient();
  const isBn = lang === "bn";

  // Studio Core State
  const [activeTab, setActiveTab] = useState<StudioTab>("design");
  const [labelCfg, setLabelCfg] = useState<PosLabelSettings>(DEFAULT_LABEL_SETTINGS);
  const [elements, setElements] = useState<LabelElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingInlineId, setEditingInlineId] = useState<string | null>(null);

  // Undo / Redo History
  const [history, setHistory] = useState<LabelElement[][]>([]);
  const [future, setFuture] = useState<LabelElement[][]>([]);

  // Canvas Viewport & Alignment Guides
  const [zoomPct, setZoomPct] = useState<number>(125);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snapGuides, setSnapGuides] = useState<{ xCenter: boolean; yCenter: boolean }>({
    xCenter: false,
    yCenter: false,
  });

  // Data Rows (Label LIVE Data Tab)
  const [queue, setQueue] = useState<LabelQueueItem[]>([]);
  const [previewRowIndex, setPreviewRowIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [savingBarcodeId, setSavingBarcodeId] = useState<string | null>(null);

  // Templates State
  const [templateNameInput, setTemplateNameInput] = useState("");

  // Hardware & Print Execution State
  const [printing, setPrinting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [installedPrinters, setInstalledPrinters] = useState<InstalledPrinter[]>([]);
  const [defaultOsPrinter, setDefaultOsPrinter] = useState<string>("");
  const [loadingPrinters, setLoadingPrinters] = useState(false);

  // Refs for Drag & Resize and File Inputs
  const dragStateRef = useRef<{
    mode: "move" | "resize";
    elId: string;
    handle?: ResizeHandle;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    snapshot: LabelElement[];
    moved: boolean;
  } | null>(null);

  const imageUploadRef = useRef<HTMLInputElement | null>(null);
  const csvImportRef = useRef<HTMLInputElement | null>(null);
  const templateImportRef = useRef<HTMLInputElement | null>(null);
  const layerDragIndexRef = useRef<number | null>(null);

  const pxPerMm = useMemo(() => BASE_PX_PER_MM * (zoomPct / 100), [zoomPct]);

  // Load saved hardware & label settings on mount
  useEffect(() => {
    const hw = getPosHardwareSettings();
    const loadedCfg = {
      ...DEFAULT_LABEL_SETTINGS,
      ...(hw.labelSettings || {}),
    };
    setLabelCfg(loadedCfg);
    setElements(Array.isArray(loadedCfg.canvasElements) ? loadedCfg.canvasElements : []);
  }, []);

  // Populate initial products if passed (e.g. from Products or Purchases page)
  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setQueue(
        initialProducts.map((p) =>
          productToQueueRow(p, labelCfg.defaultCopies || 1)
        )
      );
      setPreviewRowIndex(0);
    }
  }, [initialProducts]);

  // Persist label settings + canvas elements cleanly
  const persistConfig = useCallback(
    (nextCfg: PosLabelSettings, nextElements?: LabelElement[]) => {
      const merged: PosLabelSettings = {
        ...nextCfg,
        canvasElements: nextElements !== undefined ? nextElements : nextCfg.canvasElements,
      };
      setLabelCfg(merged);
      savePosHardwareSettings({ labelSettings: merged });
    },
    []
  );

  const updateCfg = useCallback(
    (patch: Partial<PosLabelSettings>) => {
      setLabelCfg((prev) => {
        const next = { ...prev, ...patch };
        savePosHardwareSettings({ labelSettings: next });
        return next;
      });
    },
    []
  );

  const commitElements = useCallback(
    (nextElements: LabelElement[], recordUndo = true) => {
      setElements((prev) => {
        if (recordUndo) {
          setHistory((h) => [...h.slice(-39), prev]);
          setFuture([]);
        }
        setLabelCfg((cfgPrev) => {
          const updatedCfg = { ...cfgPrev, canvasElements: nextElements };
          savePosHardwareSettings({ labelSettings: updatedCfg });
          return updatedCfg;
        });
        return nextElements;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const previous = h[h.length - 1];
      setFuture((f) => [elements, ...f.slice(0, 39)]);
      setElements(previous);
      updateCfg({ canvasElements: previous });
      return h.slice(0, -1);
    });
  }, [elements, updateCfg]);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setHistory((h) => [...h.slice(-39), elements]);
      setElements(next);
      updateCfg({ canvasElements: next });
      return f.slice(1);
    });
  }, [elements, updateCfg]);

  // Installed Printers Discovery
  const fetchPrinters = useCallback(async () => {
    if (typeof window === "undefined") return;
    setLoadingPrinters(true);
    try {
      const electronPOS = (window as any).electronPOS;
      if (electronPOS?.getPrinters) {
        const def = await electronPOS.getDefaultPrinter?.();
        const list = await electronPOS.getPrinters();
        if (Array.isArray(list)) {
          setInstalledPrinters(list);
          setDefaultOsPrinter(def?.name || "");
          setLoadingPrinters(false);
          return;
        }
      }
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1400);
      const res = await fetch("http://127.0.0.1:9123/printers", {
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        setInstalledPrinters(Array.isArray(data.printers) ? data.printers : []);
        setDefaultOsPrinter(data.defaultPrinter?.name || "");
      }
    } catch {
      // Browser mode fallback
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    fetchPrinters();
  }, [fetchPrinters]);

  const existingCodesSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) {
      if (p.barcode) s.add(String(p.barcode).trim().toUpperCase());
      if (p.sku) s.add(String(p.sku).trim().toUpperCase());
      if (p.code) s.add(String(p.code).trim().toUpperCase());
    }
    for (const q of queue) {
      if (q.code) s.add(String(q.code).trim().toUpperCase());
    }
    return s;
  }, [products, queue]);

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) || null,
    [elements, selectedId]
  );

  const activeDataRow: Partial<LabelQueueItem> | null = useMemo(() => {
    if (!queue.length) return null;
    return queue[Math.min(previewRowIndex, queue.length - 1)] || queue[0];
  }, [queue, previewRowIndex]);

  // Total stickers calculation (either sum of Data rows, or defaultCopies when printing pure custom sticker)
  const totalStickersCount = useMemo(() => {
    if (queue.length > 0) {
      return queue.reduce((sum, item) => sum + Math.max(1, Number(item.copies) || 1), 0);
    }
    return Math.max(1, Number(labelCfg.defaultCopies) || 1);
  }, [queue, labelCfg.defaultCopies]);

  const handleSetStickerCopies = (newCount: number) => {
    const clamped = Math.max(1, Math.min(10000, Math.floor(Number(newCount) || 1)));
    if (queue.length === 1) {
      setQueue((prev) => [{ ...prev[0], copies: clamped }]);
    } else if (queue.length > 1) {
      setQueue((prev) =>
        prev.map((row, idx) =>
          idx === Math.min(previewRowIndex, prev.length - 1)
            ? { ...row, copies: clamped }
            : row
        )
      );
    }
    updateCfg({ defaultCopies: clamped });
  };

  // Add Canvas Element Helpers — ZERO forced default texts!
  const addCanvasElement = useCallback(
    (type: LabelElementType, presetPatch?: Partial<LabelElement>) => {
      const w = Math.max(15, Number(labelCfg.widthMm) || 50);
      const h = Math.max(10, Number(labelCfg.heightMm) || 30);

      let newEl: LabelElement;

      if (type === "barcode") {
        const bw = roundMm(Math.min(w - 4, w * 0.84));
        const bh = roundMm(Math.min(h - 3, Math.max(8, h * 0.44)));
        newEl = {
          id: makeId("bar"),
          type: "barcode",
          layerName: "Barcode",
          xMm: roundMm((w - bw) / 2),
          yMm: roundMm((h - bh) / 2),
          wMm: bw,
          hMm: bh,
          content: activeDataRow?.code ? "{barcode}" : "89401234",
          symbology: labelCfg.barcodeFormat === "QR" ? "CODE128" : labelCfg.barcodeFormat,
          showCodeText: true,
          fontSizePt: 6.5,
          ...presetPatch,
        };
      } else if (type === "qrcode") {
        const side = roundMm(Math.min(w - 3, h - 3, Math.max(10, Math.min(w, h) * 0.55)));
        newEl = {
          id: makeId("qr"),
          type: "qrcode",
          layerName: "QR Code",
          xMm: roundMm((w - side) / 2),
          yMm: roundMm((h - side) / 2),
          wMm: side,
          hMm: side,
          content: activeDataRow?.code ? "{barcode}" : "https://example.com",
          symbology: "QR",
          ...presetPatch,
        };
      } else if (type === "box") {
        newEl = {
          id: makeId("box"),
          type: "box",
          layerName: "Border Box",
          xMm: 1,
          yMm: 1,
          wMm: roundMm(w - 2),
          hMm: roundMm(h - 2),
          content: "",
          borderWidthMm: 0.4,
          borderStyle: "solid",
          borderRadiusMm: 0.8,
          filled: false,
          ...presetPatch,
        };
      } else if (type === "line") {
        newEl = {
          id: makeId("line"),
          type: "line",
          layerName: "Divider Line",
          xMm: 2,
          yMm: roundMm(h / 2),
          wMm: roundMm(w - 4),
          hMm: 1.5,
          content: "",
          borderWidthMm: 0.35,
          borderStyle: "solid",
          lineOrientation: "horizontal",
          ...presetPatch,
        };
      } else if (type === "image") {
        const side = roundMm(Math.min(w * 0.35, h * 0.45, 16));
        newEl = {
          id: makeId("img"),
          type: "image",
          layerName: "Logo / Image",
          xMm: 2,
          yMm: 2,
          wMm: side,
          hMm: side,
          content: "",
          ...presetPatch,
        };
      } else {
        // Text element — user sets their own suited text!
        const tw = roundMm(Math.min(w - 3, w * 0.86));
        const th = roundMm(Math.min(h - 2, Math.max(4.5, h * 0.22)));
        const offsetCount = elements.filter((e) => e.type === "text").length;
        const staggerY = Math.min(h - th - 1, roundMm(1.5 + offsetCount * (th + 0.8)));
        newEl = {
          id: makeId("txt"),
          type: "text",
          layerName: presetPatch?.layerName || "Text",
          xMm: roundMm((w - tw) / 2),
          yMm: Math.max(0.5, staggerY),
          wMm: tw,
          hMm: th,
          content: presetPatch?.content ?? "",
          fontFamily: "sans",
          fontSizePt: 9,
          fontWeight: "bold",
          align: "center",
          verticalAlign: "middle",
          inverted: false,
          autoFit: true,
          wrap: false,
          ...presetPatch,
        };
      }

      const next = [...elements, newEl];
      commitElements(next, true);
      setSelectedId(newEl.id);
      if (newEl.type === "text" && !presetPatch?.content) {
        setEditingInlineId(newEl.id);
      }
    },
    [labelCfg, activeDataRow, elements, commitElements]
  );

  const updateSelectedElement = useCallback(
    (patch: Partial<LabelElement>, recordUndo = true) => {
      if (!selectedId) return;
      const next = elements.map((el) =>
        el.id === selectedId ? { ...el, ...patch } : el
      );
      commitElements(next, recordUndo);
    },
    [selectedId, elements, commitElements]
  );

  const deleteElementById = useCallback(
    (id: string) => {
      const next = elements.filter((el) => el.id !== id);
      commitElements(next, true);
      if (selectedId === id) setSelectedId(null);
      if (editingInlineId === id) setEditingInlineId(null);
    },
    [elements, selectedId, editingInlineId, commitElements]
  );

  const duplicateElementById = useCallback(
    (id: string) => {
      const target = elements.find((el) => el.id === id);
      if (!target) return;
      const copy: LabelElement = {
        ...target,
        id: makeId(target.type),
        layerName: `${target.layerName || target.type} Copy`,
        xMm: roundMm(Math.min(labelCfg.widthMm - target.wMm, target.xMm + 2)),
        yMm: roundMm(Math.min(labelCfg.heightMm - target.hMm, target.yMm + 2)),
        locked: false,
      };
      commitElements([...elements, copy], true);
      setSelectedId(copy.id);
    },
    [elements, labelCfg.widthMm, labelCfg.heightMm, commitElements]
  );

  // Keyboard shortcuts on Design tab: Delete/Backspace, Arrow nudge, Ctrl+D, Ctrl+Z/Y
  useEffect(() => {
    if (activeTab !== "design") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isTyping =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (e.target as HTMLElement)?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !isTyping) {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !isTyping) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (isTyping || !selectedId || editingInlineId) return;
      const current = elements.find((el) => el.id === selectedId);
      if (!current) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteElementById(selectedId);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateElementById(selectedId);
        return;
      }

      if (current.locked) return;
      const step = e.shiftKey ? 2 : 0.5;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        updateSelectedElement({ xMm: roundMm(Math.max(0, current.xMm - step)) });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        updateSelectedElement({
          xMm: roundMm(Math.min(labelCfg.widthMm - current.wMm, current.xMm + step)),
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        updateSelectedElement({ yMm: roundMm(Math.max(0, current.yMm - step)) });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        updateSelectedElement({
          yMm: roundMm(Math.min(labelCfg.heightMm - current.hMm, current.yMm + step)),
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeTab,
    selectedId,
    editingInlineId,
    elements,
    labelCfg.widthMm,
    labelCfg.heightMm,
    handleUndo,
    handleRedo,
    deleteElementById,
    duplicateElementById,
    updateSelectedElement,
  ]);

  // Pointer Drag-and-Drop & 8-Handle Resize on the Physical Millimeter Canvas
  const startPointerInteraction = (
    e: React.PointerEvent,
    el: LabelElement,
    mode: "move" | "resize",
    handle?: ResizeHandle
  ) => {
    e.stopPropagation();
    if (editingInlineId && editingInlineId !== el.id) {
      setEditingInlineId(null);
    }
    setSelectedId(el.id);
    if (el.locked) return;
    if (editingInlineId === el.id && mode === "move") return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      mode,
      elId: el.id,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: el.xMm,
      origY: el.yMm,
      origW: el.wMm,
      origH: el.hMm,
      snapshot: elements,
      moved: false,
    };
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const st = dragStateRef.current;
    if (!st) return;

    const dxMm = (e.clientX - st.startClientX) / pxPerMm;
    const dyMm = (e.clientY - st.startClientY) / pxPerMm;
    if (Math.abs(dxMm) > 0.08 || Math.abs(dyMm) > 0.08) {
      st.moved = true;
    }

    const step = labelCfg.snapToGrid ? labelCfg.gridStepMm || 0.5 : 0.1;
    const snap = (v: number) => Math.round(v / step) * step;

    const stickerW = labelCfg.widthMm;
    const stickerH = labelCfg.heightMm;

    if (st.mode === "move") {
      let nextX = snap(st.origX + dxMm);
      let nextY = snap(st.origY + dyMm);

      nextX = Math.max(-st.origW * 0.5, Math.min(stickerW - st.origW * 0.5, nextX));
      nextY = Math.max(-st.origH * 0.5, Math.min(stickerH - st.origH * 0.5, nextY));

      // Smart Center Snap Guides (within 0.7mm of sticker center)
      const centerTargetX = (stickerW - st.origW) / 2;
      const centerTargetY = (stickerH - st.origH) / 2;
      let snappedX = false;
      let snappedY = false;

      if (Math.abs(nextX - centerTargetX) <= 0.7) {
        nextX = roundMm(centerTargetX);
        snappedX = true;
      }
      if (Math.abs(nextY - centerTargetY) <= 0.7) {
        nextY = roundMm(centerTargetY);
        snappedY = true;
      }

      setSnapGuides({ xCenter: snappedX, yCenter: snappedY });

      setElements((prev) =>
        prev.map((item) =>
          item.id === st.elId
            ? { ...item, xMm: roundMm(nextX), yMm: roundMm(nextY) }
            : item
        )
      );
    } else if (st.mode === "resize" && st.handle) {
      let x = st.origX;
      let y = st.origY;
      let w = st.origW;
      let h = st.origH;
      const minW = 3;
      const minH = 1.5;

      if (st.handle.includes("e")) {
        w = Math.max(minW, snap(st.origW + dxMm));
      }
      if (st.handle.includes("s")) {
        h = Math.max(minH, snap(st.origH + dyMm));
      }
      if (st.handle.includes("w")) {
        const proposedW = Math.max(minW, snap(st.origW - dxMm));
        x = roundMm(st.origX + (st.origW - proposedW));
        w = proposedW;
      }
      if (st.handle.includes("n")) {
        const proposedH = Math.max(minH, snap(st.origH - dyMm));
        y = roundMm(st.origY + (st.origH - proposedH));
        h = proposedH;
      }

      setElements((prev) =>
        prev.map((item) =>
          item.id === st.elId
            ? {
                ...item,
                xMm: roundMm(x),
                yMm: roundMm(y),
                wMm: roundMm(w),
                hMm: roundMm(h),
              }
            : item
        )
      );
    }
  };

  const onCanvasPointerUp = () => {
    const st = dragStateRef.current;
    if (!st) return;
    dragStateRef.current = null;
    setSnapGuides({ xCenter: false, yCenter: false });

    if (st.moved) {
      setHistory((h) => [...h.slice(-39), st.snapshot]);
      setFuture([]);
      updateCfg({ canvasElements: elements });
    }
  };

  // Image / Logo file upload into canvas
  const handleImageFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      if (selectedElement && selectedElement.type === "image") {
        updateSelectedElement({ content: dataUrl });
      } else {
        addCanvasElement("image", { content: dataUrl, layerName: file.name.slice(0, 18) });
      }
      toast.success(isBn ? "ছবি/লোগো লেবেলে যুক্ত হয়েছে!" : "Image added to label canvas!");
    };
    reader.readAsDataURL(file);
  };

  // CSV Import for Label LIVE Data Spreadsheet
  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        toast.error(isBn ? "CSV ফাইলে কোনো ডাটা পাওয়া যায়নি" : "CSV file has no data rows");
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const imported: LabelQueueItem[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const getCol = (names: string[]) => {
          const idx = headers.findIndex((h) => names.some((n) => h.includes(n)));
          return idx >= 0 ? cols[idx] || "" : "";
        };
        imported.push({
          id: makeId("csv"),
          name: getCol(["name", "product", "title"]) || cols[0] || "",
          code: getCol(["barcode", "code", "sku"]) || cols[1] || "89400001",
          price: Number(getCol(["price", "rate", "sell"])) || 0,
          mrp: Number(getCol(["mrp"])) || undefined,
          weight: getCol(["weight", "wt"]),
          heightText: getCol(["height"]),
          widthText: getCol(["width"]),
          measurement: getCol(["size", "measure"]),
          variantText: getCol(["variant", "color"]),
          copies: Math.max(1, Number(getCol(["copies", "qty", "stickers"])) || 1),
        });
      }
      setQueue((prev) => [...prev, ...imported]);
      toast.success(
        isBn
          ? `${imported.length}টি সারি CSV থেকে ইমপোর্ট হয়েছে!`
          : `Imported ${imported.length} rows from CSV!`
      );
    };
    reader.readAsText(file);
  };

  const handleExportDataCsv = () => {
    const header = "name,barcode,price,mrp,weight,height,width,size,variant,copies";
    const rows = queue.map((r) =>
      [
        `"${(r.name || "").replace(/"/g, '""')}"`,
        `"${(r.code || "").replace(/"/g, '""')}"`,
        r.price || 0,
        r.mrp || "",
        `"${(r.weight || "").replace(/"/g, '""')}"`,
        `"${(r.heightText || "").replace(/"/g, '""')}"`,
        `"${(r.widthText || "").replace(/"/g, '""')}"`,
        `"${(r.measurement || "").replace(/"/g, '""')}"`,
        `"${(r.variantText || "").replace(/"/g, '""')}"`,
        r.copies || 1,
      ].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `label-data-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save / Load / Export Custom Label Templates
  const handleSaveTemplate = () => {
    const name =
      templateNameInput.trim() ||
      `Label ${labelCfg.widthMm}×${labelCfg.heightMm}mm (${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })})`;
    const newTpl: LabelSavedTemplate = {
      id: makeId("tpl"),
      name,
      widthMm: labelCfg.widthMm,
      heightMm: labelCfg.heightMm,
      cornerRadiusMm: labelCfg.cornerRadiusMm,
      elements: JSON.parse(JSON.stringify(elements)),
      updatedAt: new Date().toISOString(),
    };
    const nextTemplates = [newTpl, ...(labelCfg.savedTemplates || [])];
    updateCfg({ savedTemplates: nextTemplates });
    setTemplateNameInput("");
    toast.success(isBn ? `টেমপ্লেট "${name}" সংরক্ষিত হয়েছে!` : `Template "${name}" saved!`);
  };

  const handleLoadTemplate = (tpl: LabelSavedTemplate) => {
    const cloned = JSON.parse(JSON.stringify(tpl.elements || []));
    setHistory((h) => [...h.slice(-39), elements]);
    setFuture([]);
    setElements(cloned);
    setSelectedId(null);
    persistConfig(
      {
        ...labelCfg,
        widthMm: tpl.widthMm,
        heightMm: tpl.heightMm,
        cornerRadiusMm: tpl.cornerRadiusMm ?? labelCfg.cornerRadiusMm,
      },
      cloned
    );
    setActiveTab("design");
    toast.success(isBn ? `"${tpl.name}" লোড করা হয়েছে` : `Loaded "${tpl.name}"`);
  };

  const handleDeleteTemplate = (id: string) => {
    const next = (labelCfg.savedTemplates || []).filter((t) => t.id !== id);
    updateCfg({ savedTemplates: next });
    toast.success(isBn ? "টেমপ্লেট মুছে ফেলা হয়েছে" : "Template deleted");
  };

  const handleExportTemplateJson = () => {
    const payload = {
      version: "label-live-pos-1.0",
      widthMm: labelCfg.widthMm,
      heightMm: labelCfg.heightMm,
      cornerRadiusMm: labelCfg.cornerRadiusMm,
      elements,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `label-design-${labelCfg.widthMm}x${labelCfg.heightMm}mm.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTemplateJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        if (!Array.isArray(parsed.elements)) throw new Error("Invalid template file");
        const nextW = Number(parsed.widthMm) >= 10 ? Number(parsed.widthMm) : labelCfg.widthMm;
        const nextH = Number(parsed.heightMm) >= 8 ? Number(parsed.heightMm) : labelCfg.heightMm;
        setElements(parsed.elements);
        persistConfig({ ...labelCfg, widthMm: nextW, heightMm: nextH }, parsed.elements);
        setSelectedId(null);
        setActiveTab("design");
        toast.success(isBn ? "লেবেল ডিজাইন ফাইল লোড হয়েছে!" : "Label design imported!");
      } catch {
        toast.error(isBn ? "ভুল ফাইল ফরম্যাট" : "Invalid label design JSON file");
      }
    };
    reader.readAsText(file);
  };

  // Filtered store inventory for Data tab
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const active = products.filter((p) => !p.archived);
    if (!q) return active.slice(0, 30);
    return active
      .filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.barcode || "").toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q) ||
          (p.code || "").toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [products, searchQuery]);

  const addProductToDataQueue = (p: Product) => {
    setQueue((prev) => {
      const idx = prev.findIndex((item) => item.productId === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], copies: copy[idx].copies + 1 };
        setPreviewRowIndex(idx);
        return copy;
      }
      const next = [...prev, productToQueueRow(p, labelCfg.defaultCopies || 1)];
      setPreviewRowIndex(next.length - 1);
      return next;
    });
    toast.success(isBn ? `"${p.name}" ডাটা তালিকায় যুক্ত হয়েছে` : `Added "${p.name}" to Data`);
  };

  const addBlankDataRow = () => {
    const row: LabelQueueItem = {
      id: makeId("manual"),
      name: "",
      code: generateUniqueBarcode("CODE128", existingCodesSet),
      price: 0,
      weight: "",
      heightText: "",
      widthText: "",
      measurement: "",
      copies: Math.max(1, labelCfg.defaultCopies || 1),
    };
    setQueue((prev) => {
      const next = [...prev, row];
      setPreviewRowIndex(next.length - 1);
      return next;
    });
  };

  const updateDataRow = (id: string, patch: Partial<LabelQueueItem>) => {
    setQueue((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSaveBarcodeToProductDb = async (row: LabelQueueItem) => {
    if (!row.productId) return;
    const product = products.find((p) => p.id === row.productId);
    if (!product) return;
    setSavingBarcodeId(row.id);
    try {
      await updateProductFn({
        data: {
          id: product.id,
          name: product.name,
          buy_price: product.buy_price,
          sell_price: row.price || product.sell_price,
          stock: product.stock,
          barcode: row.code.trim(),
          sku: product.sku || null,
          qr_code: product.qr_code || null,
          category: product.category || null,
          min_stock: product.min_stock ?? 5,
          image_url: product.image_url || null,
          attributes: product.attributes || {},
        },
      });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(isBn ? `বারকোড (${row.code}) পণ্যে সেভ হয়েছে!` : `Saved barcode (${row.code}) to product!`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save barcode");
    } finally {
      setSavingBarcodeId(null);
    }
  };

  // Print & Export Actions
  const handlePrint = async (forceDialog = false) => {
    if (elements.filter((e) => !e.hidden).length === 0) {
      toast.error(
        isBn
          ? "লেবেল খালি আছে! প্রিন্ট করার আগে বাম পাশ থেকে Text বা Barcode যোগ করুন।"
          : "Label canvas is empty! Add Text or Barcode elements on the Design tab before printing."
      );
      setActiveTab("design");
      return;
    }
    setPrinting(true);
    try {
      await printProductLabels(queue, {
        shopName,
        settings: { ...labelCfg, canvasElements: elements },
        forcePrintDialog: forceDialog,
      });
      toast.success(
        isBn
          ? `${totalStickersCount}টি স্টিকার প্রিন্ট পাঠানো হয়েছে!`
          : `Sent ${totalStickersCount} sticker(s) to printer!`
      );
      onPrinted?.();
    } catch (e: any) {
      toast.error(e?.message || "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (elements.filter((e) => !e.hidden).length === 0) {
      toast.error(isBn ? "প্রথমে লেবেলে কোনো এলিমেন্ট যোগ করুন" : "Add at least one element to export PDF");
      return;
    }
    setExportingPdf(true);
    try {
      await downloadLabelsPdf(queue, {
        shopName,
        settings: { ...labelCfg, canvasElements: elements },
      });
      toast.success(isBn ? "লেবেল PDF ডাউনলোড হয়েছে!" : "Exact-size Labels PDF downloaded!");
    } catch (e: any) {
      toast.error(e?.message || "PDF export failed");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadPng = async () => {
    if (elements.filter((e) => !e.hidden).length === 0) {
      toast.error(isBn ? "প্রথমে লেবেলে কোনো এলিমেন্ট যোগ করুন" : "Add at least one element to export PNG");
      return;
    }
    setExportingPng(true);
    try {
      await downloadLabelPng(queue, {
        shopName,
        settings: { ...labelCfg, canvasElements: elements },
      });
      toast.success(isBn ? "হাই-রেজোলিউশন PNG ডাউনলোড হয়েছে!" : "High-DPI Sticker PNG downloaded!");
    } catch (e: any) {
      toast.error(e?.message || "PNG export failed");
    } finally {
      setExportingPng(false);
    }
  };

  const handleOpenPrinterPreferences = async () => {
    const target = labelCfg.printerName || defaultOsPrinter;
    try {
      const electronPOS = (window as any).electronPOS;
      if (electronPOS?.openPrinterPreferences) {
        await electronPOS.openPrinterPreferences(target);
        toast.success(isBn ? "উইন্ডোজ প্রিন্টার সেটিংস খোলা হচ্ছে..." : "Opening Windows Printer Preferences...");
        return;
      }
      const res = await fetch("http://127.0.0.1:9123/printer-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerName: target }),
      });
      if (res.ok) {
        toast.success(isBn ? "উইন্ডোজ প্রিন্টার সেটিংস খোলা হচ্ছে..." : "Opening Windows Printer Preferences...");
        return;
      }
    } catch {}
    toast.info(
      isBn
        ? "উইন্ডোজ ড্রাইভার সেটিংস খুলতে পিসি সফটওয়্যার চালু করুন"
        : "Use the Windows Desktop POS app to open native driver preferences."
    );
  };

  const handleCalibrationPrint = async () => {
    setCalibrating(true);
    try {
      await printCalibrationSticker({
        shopName,
        settings: labelCfg,
      });
      toast.success(isBn ? "ক্যালিব্রেশন টেস্ট স্টিকার পাঠানো হয়েছে!" : "Calibration sticker sent!");
    } catch (e: any) {
      toast.error(e?.message || "Calibration failed");
    } finally {
      setCalibrating(false);
    }
  };

  // Ruler ticks in millimeters
  const xTicks = useMemo(() => {
    const arr: number[] = [];
    for (let m = 0; m <= Math.ceil(labelCfg.widthMm); m += 5) arr.push(m);
    return arr;
  }, [labelCfg.widthMm]);

  const yTicks = useMemo(() => {
    const arr: number[] = [];
    for (let m = 0; m <= Math.ceil(labelCfg.heightMm); m += 5) arr.push(m);
    return arr;
  }, [labelCfg.heightMm]);

  const layoutMetrics = useMemo(() => computeStickerLayoutMetrics(labelCfg), [labelCfg]);
  const unitLabel = labelCfg.unit || "mm";

  // Helper to render a live canvas element inside the interactive Design surface or Print preview
  const renderVisualElementContent = (
    el: LabelElement,
    row: Partial<LabelQueueItem> | null,
    copyIdx = 0,
    interactive = false
  ) => {
    const currency = labelCfg.currencyPrefix || "৳";

    if (el.type === "box") {
      return (
        <div
          className="w-full h-full pointer-events-none"
          style={{
            border: `${Math.max(1, (el.borderWidthMm || 0.4) * pxPerMm)}px ${
              el.borderStyle || "solid"
            } #000000`,
            borderRadius: `${(el.borderRadiusMm || 0) * pxPerMm}px`,
            backgroundColor: el.filled ? "#000000" : "transparent",
          }}
        />
      );
    }

    if (el.type === "line") {
      const pxThick = Math.max(1, (el.borderWidthMm || 0.4) * pxPerMm);
      const isVert = el.lineOrientation === "vertical";
      return isVert ? (
        <div className="w-full h-full flex justify-center pointer-events-none">
          <div
            style={{
              height: "100%",
              borderLeft: `${pxThick}px ${el.borderStyle || "solid"} #000000`,
            }}
          />
        </div>
      ) : (
        <div className="w-full h-full flex items-center pointer-events-none">
          <div
            style={{
              width: "100%",
              borderTop: `${pxThick}px ${el.borderStyle || "solid"} #000000`,
            }}
          />
        </div>
      );
    }

    if (el.type === "image") {
      if (!el.content) {
        return (
          <div className="w-full h-full border border-dashed border-zinc-400 flex flex-col items-center justify-center text-[10px] text-zinc-500 gap-0.5 select-none">
            <ImageIcon className="size-3.5" />
            <span>Logo</span>
          </div>
        );
      }
      return (
        <img
          src={el.content}
          alt=""
          draggable={false}
          className="w-full h-full object-contain pointer-events-none select-none"
          style={{ filter: "contrast(1.3) grayscale(1)" }}
        />
      );
    }

    if (el.type === "qrcode") {
      const resolved =
        resolveLabelVariables(el.content || "{barcode}", row, copyIdx, currency).trim() ||
        "89401234";
      const svg = generateQrCodeSvg(resolved, 64, true);
      return (
        <div
          className="w-full h-full p-0.5 pointer-events-none flex items-center justify-center"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      );
    }

    if (el.type === "barcode") {
      const resolved =
        resolveLabelVariables(el.content || "{barcode}", row, copyIdx, currency).trim() ||
        "89401234";
      const sym = el.symbology || "CODE128";
      const { svg, displayCode } = generateStickerGraphicSvg(resolved, sym, 40, 100, true);
      const codePx = Math.max(8, ((el.fontSizePt || 6.5) * 0.3528) * pxPerMm);
      return (
        <div className="w-full h-full flex flex-col items-stretch justify-between overflow-hidden pointer-events-none select-none">
          <div
            className="flex-1 min-h-0 w-full overflow-hidden"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          {el.showCodeText !== false && sym !== "QR" && (
            <div
              className="shrink-0 text-center font-mono font-extrabold text-black leading-none truncate pt-0.5"
              style={{ fontSize: `${codePx}px` }}
            >
              {displayCode}
            </div>
          )}
        </div>
      );
    }

    // Text element
    if (interactive && editingInlineId === el.id) {
      return (
        <input
          autoFocus
          value={el.content}
          placeholder={isBn ? "টেক্সট লিখুন..." : "Type text..."}
          onChange={(e) => updateSelectedElement({ content: e.target.value }, false)}
          onBlur={() => {
            setEditingInlineId(null);
            updateCfg({ canvasElements: elements });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              setEditingInlineId(null);
              updateCfg({ canvasElements: elements });
            }
          }}
          className="w-full h-full bg-amber-50/95 text-black font-bold px-1 outline-none border border-indigo-600 rounded text-xs"
          style={{ textAlign: el.align || "center" }}
        />
      );
    }

    const resolvedText = resolveLabelVariables(el.content, row, copyIdx, currency);
    const isEmptyPlaceholder = !resolvedText.trim();
    const displayStr = isEmptyPlaceholder
      ? interactive
        ? isBn
          ? "[ডাবল-ক্লিক করে টেক্সট লিখুন]"
          : "[Double-click to type text]"
        : ""
      : resolvedText;

    const effPt = computeEffectiveFontPt(el, displayStr || "Text");
    const fontPx = Math.max(8, effPt * 0.3528 * pxPerMm);
    const fontWeight =
      el.fontWeight === "normal"
        ? 500
        : el.fontWeight === "semibold"
        ? 700
        : el.fontWeight === "black"
        ? 900
        : 800;

    return (
      <div
        className="w-full h-full flex overflow-hidden select-none pointer-events-none"
        style={{
          backgroundColor: el.inverted ? "#000000" : "transparent",
          color: el.inverted ? "#ffffff" : isEmptyPlaceholder ? "#94a3b8" : "#000000",
          borderRadius: `${(el.borderRadiusMm ?? (el.inverted ? 0.8 : 0)) * pxPerMm}px`,
          padding: el.inverted ? "1px 4px" : "0 1px",
          alignItems:
            el.verticalAlign === "top"
              ? "flex-start"
              : el.verticalAlign === "bottom"
              ? "flex-end"
              : "center",
          justifyContent:
            el.align === "left"
              ? "flex-start"
              : el.align === "right"
              ? "flex-end"
              : "center",
          textAlign: el.align || "center",
        }}
      >
        <span
          style={{
            fontSize: `${isEmptyPlaceholder ? Math.min(fontPx, 11) : fontPx}px`,
            fontWeight,
            fontStyle: el.italic ? "italic" : "normal",
            textDecoration:
              [el.underline ? "underline" : "", el.strikethrough ? "line-through" : ""]
                .filter(Boolean)
                .join(" ") || "none",
            fontFamily:
              el.fontFamily === "mono"
                ? "Consolas, monospace"
                : el.fontFamily === "serif"
                ? "Georgia, serif"
                : el.fontFamily === "condensed"
                ? "'Arial Narrow', sans-serif"
                : "inherit",
            lineHeight: 1.08,
            letterSpacing: el.letterSpacingEm ? `${el.letterSpacingEm}em` : undefined,
            whiteSpace: el.wrap ? "pre-wrap" : "nowrap",
            wordBreak: el.wrap ? "break-word" : undefined,
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {displayStr}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col rounded-2xl border border-border/80 bg-background shadow-sm overflow-hidden">
      {/* Hidden File Inputs */}
      <input
        ref={imageUploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileSelected}
      />
      <input
        ref={csvImportRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvImport}
      />
      <input
        ref={templateImportRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportTemplateJson}
      />

      {/* ──────────────────────────────────────────────────────────────────────
          LABEL LIVE TOP APPLICATION BAR (App / Design / Data / Print + Copies)
         ────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 bg-zinc-900 text-zinc-100 border-b border-zinc-800">
        {/* Left Studio Title & History */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 pr-2 border-r border-zinc-700/80">
            <div className="size-7 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Barcode className="size-4" />
            </div>
            <div>
              <div className="text-xs font-extrabold tracking-tight leading-none text-white">
                Label LIVE Studio
              </div>
              <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                {mmToUnit(labelCfg.widthMm, unitLabel)} × {mmToUnit(labelCfg.heightMm, unitLabel)} {unitLabel}
                {labelCfg.mode === "thermal" && labelCfg.rollColumns > 1
                  ? ` • ${labelCfg.rollColumns}-Col`
                  : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!history.length}
              title="Undo (Ctrl+Z)"
              className="size-7 rounded-md flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-35 cursor-pointer transition-colors"
            >
              <Undo2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!future.length}
              title="Redo (Ctrl+Y)"
              className="size-7 rounded-md flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-35 cursor-pointer transition-colors"
            >
              <Redo2 className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Center Label LIVE 4-Tab Navigation */}
        <div className="flex items-center bg-zinc-950/90 p-1 rounded-xl border border-zinc-800">
          {(
            [
              { id: "design", labelEn: "Design", labelBn: "ডিজাইন", icon: PenTool },
              {
                id: "data",
                labelEn: `Data${queue.length ? ` (${queue.length})` : ""}`,
                labelBn: `ডাটা${queue.length ? ` (${queue.length})` : ""}`,
                icon: Table2,
              },
              { id: "print", labelEn: "Print", labelBn: "প্রিন্ট", icon: Printer },
              {
                id: "templates",
                labelEn: "Templates",
                labelBn: "টেমপ্লেট",
                icon: FolderKanban,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{isBn ? tab.labelBn : tab.labelEn}</span>
              </button>
            );
          })}
        </div>

        {/* Right Stickers Count + 1-Click Print */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-800/90 border border-zinc-700 rounded-lg px-2 py-1">
            <span className="text-[10px] font-semibold text-zinc-300 pr-1">
              {isBn ? "স্টিকার সংখ্যা:" : "Stickers:"}
            </span>
            <button
              type="button"
              onClick={() => handleSetStickerCopies(totalStickersCount - 1)}
              className="size-5 rounded bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-white cursor-pointer"
            >
              <Minus className="size-3" />
            </button>
            <input
              type="number"
              min={1}
              max={10000}
              value={
                queue.length > 1
                  ? queue[Math.min(previewRowIndex, queue.length - 1)]?.copies || 1
                  : totalStickersCount
              }
              onChange={(e) => handleSetStickerCopies(Number(e.target.value) || 1)}
              className="w-12 h-5 bg-transparent text-center font-mono text-xs font-extrabold text-white outline-none tabular-nums"
            />
            <button
              type="button"
              onClick={() => handleSetStickerCopies(totalStickersCount + 1)}
              className="size-5 rounded bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-white cursor-pointer"
            >
              <Plus className="size-3" />
            </button>
          </div>

          <Button
            type="button"
            size="sm"
            disabled={printing}
            onClick={() => handlePrint(false)}
            className="h-8 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 cursor-pointer"
          >
            <Printer className={`size-3.5 ${printing ? "animate-pulse" : ""}`} />
            <span>
              {isBn ? `প্রিন্ট (${totalStickersCount})` : `Print (${totalStickersCount})`}
            </span>
          </Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: DESIGN (Label LIVE 3-Pane Freeform Drag & Drop Studio)
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "design" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[560px]">
          {/* LEFT PANE: Add Elements Palette + Layers Stack */}
          <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-border/70 bg-muted/20 p-3 flex flex-col gap-3.5">
            {/* Add Core Objects */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground">
                  {isBn ? "এলিমেন্ট যোগ করুন" : "Add to Label"}
                </span>
                {elements.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      commitElements([], true);
                      setSelectedId(null);
                      toast.success(isBn ? "লেবেল খালি করা হয়েছে" : "Cleared label canvas");
                    }}
                    className="text-[10px] font-semibold text-destructive hover:underline cursor-pointer"
                  >
                    {isBn ? "সব মুছুন" : "Clear All"}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addCanvasElement("text")}
                  className="h-9 justify-start gap-2 text-xs font-bold bg-background hover:border-indigo-500/50 cursor-pointer"
                >
                  <Type className="size-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{isBn ? "কাস্টম টেক্সট" : "Text"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addCanvasElement("barcode")}
                  className="h-9 justify-start gap-2 text-xs font-bold bg-background hover:border-indigo-500/50 cursor-pointer"
                >
                  <Barcode className="size-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{isBn ? "বারকোড" : "Barcode"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addCanvasElement("qrcode")}
                  className="h-9 justify-start gap-2 text-xs font-bold bg-background hover:border-indigo-500/50 cursor-pointer"
                >
                  <QrCode className="size-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{isBn ? "QR কোড" : "QR Code"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => imageUploadRef.current?.click()}
                  className="h-9 justify-start gap-2 text-xs font-bold bg-background hover:border-indigo-500/50 cursor-pointer"
                >
                  <ImageIcon className="size-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{isBn ? "লোগো / ছবি" : "Image / Logo"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addCanvasElement("box")}
                  className="h-9 justify-start gap-2 text-xs font-bold bg-background hover:border-indigo-500/50 cursor-pointer"
                >
                  <Square className="size-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{isBn ? "বর্ডার / বক্স" : "Box / Border"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addCanvasElement("line")}
                  className="h-9 justify-start gap-2 text-xs font-bold bg-background hover:border-indigo-500/50 cursor-pointer"
                >
                  <LineIcon className="size-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{isBn ? "লাইন ডিভাইডার" : "Line"}</span>
                </Button>
              </div>
            </div>

            {/* Quick Dynamic Data Field Blocks (Optional 1-Click Add) */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-foreground block">
                {isBn ? "ডাটা ফিল্ড যুক্ত করুন (ঐচ্ছিক)" : "Quick Data Fields (Optional)"}
              </span>
              <div className="flex flex-wrap gap-1">
                {VARIABLE_CHIPS.slice(0, 9).map((chip) => (
                  <button
                    key={chip.token}
                    type="button"
                    onClick={() =>
                      addCanvasElement("text", {
                        layerName: chip.labelEn,
                        content:
                          chip.token === "{weight}"
                            ? "Wt: {weight}"
                            : chip.token === "{height}"
                            ? "H: {height}"
                            : chip.token === "{width}"
                            ? "W: {width}"
                            : chip.token === "{mrp}"
                            ? "MRP: {mrp}"
                            : chip.token,
                        fontWeight: chip.token === "{price}" ? "black" : "bold",
                        fontSizePt: chip.token === "{price}" ? 10.5 : 8.5,
                      })
                    }
                    className="px-2 py-1 rounded-md text-[10.5px] font-semibold bg-background border border-border hover:border-indigo-500/60 hover:bg-indigo-500/5 text-foreground transition-colors cursor-pointer"
                  >
                    + {isBn ? chip.labelBn : chip.labelEn}
                  </button>
                ))}
              </div>
            </div>

            {/* Layers Stack (Drag to Reorder + Lock + Hide + Delete Any Text/Item) */}
            <div className="flex-1 flex flex-col min-h-[160px] border-t border-border/60 pt-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                  <Layers className="size-3.5 text-muted-foreground" />
                  <span>
                    {isBn ? "লেয়ার তালিকা" : "Layers"} ({elements.length})
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {isBn ? "ড্র্যাগ করে সাজান" : "Drag to reorder"}
                </span>
              </div>

              {elements.length === 0 ? (
                <div className="flex-1 rounded-xl border border-dashed border-border/80 flex flex-col items-center justify-center p-4 text-center text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground/80">
                    {isBn ? "কোনো ডিফল্ট টেক্সট নেই" : "No Default Texts"}
                  </p>
                  <p className="text-[11px] mt-0.5">
                    {isBn
                      ? "উপরের বাটন থেকে আপনার পছন্দমতো Text, Barcode বা ওজন/সাইজ যোগ করুন।"
                      : "Click Text, Barcode, or a field above to place only what you want on your sticker."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 max-h-[260px] overflow-y-auto pr-0.5">
                  {[...elements].reverse().map((el, revIdx) => {
                    const realIdx = elements.length - 1 - revIdx;
                    const isSel = el.id === selectedId;
                    const summary =
                      el.type === "text"
                        ? el.content || (isBn ? "(খালি টেক্সট)" : "(Empty Text)")
                        : el.layerName || el.type.toUpperCase();
                    return (
                      <div
                        key={el.id}
                        draggable
                        onDragStart={() => {
                          layerDragIndexRef.current = realIdx;
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const from = layerDragIndexRef.current;
                          layerDragIndexRef.current = null;
                          if (from === null || from === realIdx) return;
                          const copy = [...elements];
                          const [moved] = copy.splice(from, 1);
                          copy.splice(realIdx, 0, moved);
                          commitElements(copy, true);
                        }}
                        onClick={() => setSelectedId(el.id)}
                        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isSel
                            ? "bg-indigo-600/10 border-indigo-500/60 text-foreground font-bold"
                            : "bg-background border-border/60 hover:bg-muted/50 text-foreground/90"
                        }`}
                      >
                        <GripVertical className="size-3 text-muted-foreground shrink-0 cursor-grab" />
                        <span className="truncate flex-1 text-[11px]">{summary}</span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = elements.map((item) =>
                              item.id === el.id ? { ...item, locked: !item.locked } : item
                            );
                            commitElements(next, false);
                          }}
                          title={el.locked ? "Unlock" : "Lock"}
                          className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {el.locked ? (
                            <Lock className="size-3 text-amber-500" />
                          ) : (
                            <Unlock className="size-3 opacity-50 group-hover:opacity-100" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = elements.map((item) =>
                              item.id === el.id ? { ...item, hidden: !item.hidden } : item
                            );
                            commitElements(next, false);
                          }}
                          title={el.hidden ? "Show" : "Hide"}
                          className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {el.hidden ? (
                            <EyeOff className="size-3 text-rose-500" />
                          ) : (
                            <Eye className="size-3 opacity-50 group-hover:opacity-100" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteElementById(el.id);
                          }}
                          title={isBn ? "মুছে ফেলুন" : "Delete element"}
                          className="p-0.5 text-rose-500 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* CENTER PANE: Interactive Physical Millimeter Canvas + Rulers + Zoom */}
          <div
            className="lg:col-span-5 flex flex-col bg-zinc-100 dark:bg-zinc-950/90 border-b lg:border-b-0 lg:border-r border-border/70 select-none"
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onClick={() => {
              setSelectedId(null);
              setEditingInlineId(null);
            }}
          >
            {/* Canvas Toolbar */}
            <div
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-background/90 border-b border-border/60 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setZoomPct((z) => Math.max(50, z - 25))}
                  className="size-7 rounded-md border border-border flex items-center justify-center hover:bg-muted cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="size-3.5" />
                </button>
                <span className="font-mono text-[11px] font-bold w-11 text-center tabular-nums">
                  {zoomPct}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomPct((z) => Math.min(300, z + 25))}
                  className="size-7 rounded-md border border-border flex items-center justify-center hover:bg-muted cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomPct(125)}
                  className="h-7 px-2 rounded-md border border-border text-[10px] font-semibold hover:bg-muted cursor-pointer"
                >
                  Reset
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    className="rounded"
                  />
                  <span>{isBn ? "গ্রিড" : "Grid"}</span>
                </label>
                <label className="flex items-center gap-1 text-[11px] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={labelCfg.snapToGrid}
                    onChange={(e) => updateCfg({ snapToGrid: e.target.checked })}
                    className="rounded"
                  />
                  <span>{isBn ? "স্ন্যাপ" : "Snap"}</span>
                </label>
              </div>
            </div>

            {/* Data Row Switcher if multiple products queued */}
            {queue.length > 0 && (
              <div
                className="flex items-center justify-between px-3 py-1.5 bg-indigo-500/10 border-b border-indigo-500/20 text-[11px]"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="font-semibold truncate max-w-[200px]">
                  {isBn ? "প্রিভিউ ডাটা:" : "Previewing:"}{" "}
                  <strong>{activeDataRow?.name || activeDataRow?.code || `#${previewRowIndex + 1}`}</strong>
                </span>
                {queue.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewRowIndex((i) => Math.max(0, i - 1))}
                      className="px-1.5 py-0.5 rounded bg-background border border-border font-bold cursor-pointer"
                    >
                      ‹
                    </button>
                    <span className="font-mono tabular-nums">
                      {previewRowIndex + 1}/{queue.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewRowIndex((i) => Math.min(queue.length - 1, i + 1))
                      }
                      className="px-1.5 py-0.5 rounded bg-background border border-border font-bold cursor-pointer"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Main Rulers + Sticker Backing Workspace */}
            <div className="flex-1 overflow-auto flex flex-col items-center justify-center p-6 min-h-[380px]">
              {/* Label LIVE Printer Feed Direction Indicator */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const order: PosLabelSettings["feedDirection"][] = [
                    "up",
                    "right",
                    "down",
                    "left",
                  ];
                  const nextDir =
                    order[(order.indexOf(labelCfg.feedDirection || "up") + 1) % order.length];
                  updateCfg({ feedDirection: nextDir });
                }}
                className="mb-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-200/80 dark:bg-zinc-800/90 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 tracking-wider uppercase hover:bg-zinc-300 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
                title="Click to rotate printer feed indicator"
              >
                <ArrowUp
                  className="size-3"
                  style={{
                    transform:
                      labelCfg.feedDirection === "right"
                        ? "rotate(90deg)"
                        : labelCfg.feedDirection === "down"
                        ? "rotate(180deg)"
                        : labelCfg.feedDirection === "left"
                        ? "rotate(270deg)"
                        : "none",
                  }}
                />
                <span>{isBn ? "প্রিন্টার ফিড দিক" : "Printer Feed Direction"}</span>
              </button>

              {/* Ruler + Sticker Frame */}
              <div className="inline-grid grid-cols-[22px_auto] grid-rows-[20px_auto]">
                {/* Corner unit badge */}
                <div className="flex items-center justify-center text-[8px] font-mono font-bold text-zinc-500 bg-zinc-200/70 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-tl">
                  mm
                </div>

                {/* Top Horizontal Millimeter Ruler */}
                <div
                  className="relative bg-zinc-200/70 dark:bg-zinc-900 border-y border-r border-zinc-300 dark:border-zinc-800 overflow-hidden rounded-tr"
                  style={{ width: `${labelCfg.widthMm * pxPerMm}px`, height: "20px" }}
                >
                  {xTicks.map((m) => (
                    <div
                      key={m}
                      className="absolute top-0 bottom-0 border-l border-zinc-400/70 dark:border-zinc-700 text-[8px] font-mono text-zinc-600 dark:text-zinc-400 pl-0.5 leading-none pt-0.5"
                      style={{ left: `${m * pxPerMm}px` }}
                    >
                      {m % 10 === 0 ? m : ""}
                    </div>
                  ))}
                </div>

                {/* Left Vertical Millimeter Ruler */}
                <div
                  className="relative bg-zinc-200/70 dark:bg-zinc-900 border-x border-b border-zinc-300 dark:border-zinc-800 overflow-hidden rounded-bl"
                  style={{ width: "22px", height: `${labelCfg.heightMm * pxPerMm}px` }}
                >
                  {yTicks.map((m) => (
                    <div
                      key={m}
                      className="absolute left-0 right-0 border-t border-zinc-400/70 dark:border-zinc-700 text-[8px] font-mono text-zinc-600 dark:text-zinc-400 pl-0.5 leading-none pt-0.5"
                      style={{ top: `${m * pxPerMm}px` }}
                    >
                      {m % 10 === 0 ? m : ""}
                    </div>
                  ))}
                </div>

                {/* THE PHYSICAL STICKER SURFACE */}
                <div className="p-2 bg-sky-100/70 dark:bg-sky-950/30 border-r border-b border-sky-200/80 dark:border-sky-900/40 rounded-br shadow-md">
                  <div
                    className="relative bg-white text-black shadow-sm transition-shadow"
                    style={{
                      width: `${labelCfg.widthMm * pxPerMm}px`,
                      height: `${labelCfg.heightMm * pxPerMm}px`,
                      borderRadius: `${(labelCfg.cornerRadiusMm || 0) * pxPerMm}px`,
                      outline: labelCfg.showBorder ? "1.5px solid #000000" : "1px solid #cbd5e1",
                      backgroundImage: showGrid
                        ? `radial-gradient(circle, #cbd5e1 0.85px, transparent 0.85px)`
                        : "none",
                      backgroundSize: showGrid
                        ? `${5 * pxPerMm}px ${5 * pxPerMm}px`
                        : undefined,
                    }}
                  >
                    {/* Smart Center Alignment Snap Lines */}
                    {snapGuides.xCenter && (
                      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-cyan-500 z-30 pointer-events-none" />
                    )}
                    {snapGuides.yCenter && (
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-cyan-500 z-30 pointer-events-none" />
                    )}

                    {/* Empty Sticker Non-Printed Guidance Overlay */}
                    {elements.length === 0 && (
                      <div
                        className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center select-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-[11px] font-bold text-zinc-400">
                          {isBn ? "খালি স্টিকার ক্যানভাস" : "Blank Sticker Canvas"}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-1 mt-1.5">
                          <button
                            type="button"
                            onClick={() => addCanvasElement("text")}
                            className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-500 cursor-pointer"
                          >
                            + Text
                          </button>
                          <button
                            type="button"
                            onClick={() => addCanvasElement("barcode")}
                            className="px-2 py-0.5 rounded bg-zinc-800 text-white text-[10px] font-bold hover:bg-zinc-700 cursor-pointer"
                          >
                            + Barcode
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Render Draggable + Resizable Elements */}
                    {elements.map((el, zIdx) => {
                      if (el.hidden) return null;
                      const isSel = el.id === selectedId;
                      const leftPx = el.xMm * pxPerMm;
                      const topPx = el.yMm * pxPerMm;
                      const widthPx = Math.max(8, el.wMm * pxPerMm);
                      const heightPx = Math.max(6, el.hMm * pxPerMm);

                      return (
                        <div
                          key={el.id}
                          onPointerDown={(e) => startPointerInteraction(e, el, "move")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(el.id);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (el.type === "text" && !el.locked) {
                              setEditingInlineId(el.id);
                            }
                          }}
                          style={{
                            position: "absolute",
                            left: `${leftPx}px`,
                            top: `${topPx}px`,
                            width: `${widthPx}px`,
                            height: `${heightPx}px`,
                            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                            transformOrigin: "center center",
                            zIndex: isSel ? 25 : zIdx + 1,
                            cursor: el.locked ? "not-allowed" : "move",
                          }}
                          className={`group/el ${
                            isSel
                              ? "ring-2 ring-indigo-600 bg-indigo-500/[0.03]"
                              : "hover:ring-1 hover:ring-indigo-400/70"
                          }`}
                        >
                          {renderVisualElementContent(el, activeDataRow, 0, true)}

                          {/* Floating Quick Action Toolbar + 8 Resize Handles when Selected */}
                          {isSel && !editingInlineId && (
                            <>
                              <div
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-zinc-900 text-white rounded-md px-1 py-0.5 shadow-md z-40 whitespace-nowrap"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSelectedElement({
                                      xMm: roundMm((labelCfg.widthMm - el.wMm) / 2),
                                    })
                                  }
                                  title="Center Horizontally"
                                  className="p-1 hover:bg-zinc-700 rounded cursor-pointer"
                                >
                                  <AlignCenter className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSelectedElement({
                                      rotation: (((el.rotation || 0) + 90) % 360) as
                                        | 0
                                        | 90
                                        | 180
                                        | 270,
                                    })
                                  }
                                  title="Rotate 90°"
                                  className="p-1 hover:bg-zinc-700 rounded cursor-pointer"
                                >
                                  <RotateCw className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => duplicateElementById(el.id)}
                                  title="Duplicate (Ctrl+D)"
                                  className="p-1 hover:bg-zinc-700 rounded cursor-pointer"
                                >
                                  <Copy className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteElementById(el.id)}
                                  title="Delete (Del)"
                                  className="p-1 text-rose-400 hover:bg-rose-600 hover:text-white rounded cursor-pointer"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>

                              {!el.locked &&
                                (
                                  [
                                    { h: "nw", cls: "-top-1.5 -left-1.5 cursor-nwse-resize" },
                                    {
                                      h: "n",
                                      cls: "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
                                    },
                                    { h: "ne", cls: "-top-1.5 -right-1.5 cursor-nesw-resize" },
                                    {
                                      h: "e",
                                      cls: "top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize",
                                    },
                                    { h: "se", cls: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
                                    {
                                      h: "s",
                                      cls: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
                                    },
                                    { h: "sw", cls: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
                                    {
                                      h: "w",
                                      cls: "top-1/2 -translate-y-1/2 -left-1.5 cursor-ew-resize",
                                    },
                                  ] as { h: ResizeHandle; cls: string }[]
                                ).map(({ h, cls }) => (
                                  <div
                                    key={h}
                                    onPointerDown={(e) =>
                                      startPointerInteraction(e, el, "resize", h)
                                    }
                                    className={`absolute size-2.5 rounded-full bg-white border-2 border-indigo-600 z-30 ${cls}`}
                                  />
                                ))}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-[10.5px] text-muted-foreground text-center">
                {isBn
                  ? "টিপস: যেকোনো টেক্সট/বারকোড মাউস দিয়ে টেনে (Drag & Drop) বসান, কোণা টেনে ছোট-বড় করুন, অথবা Delete চেপে মুছে ফেলুন।"
                  : "Tip: Drag any item to position, pull handles to resize, double-click text to edit, or press Delete to remove."}
              </div>
            </div>
          </div>

          {/* RIGHT PANE: Label LIVE Context Inspector (Label Measurements OR Selected Element) */}
          <div className="lg:col-span-4 p-3.5 bg-background space-y-4 overflow-y-auto max-h-[620px]">
            {!selectedElement ? (
              /* ── LABEL SETUP & MEASUREMENTS INSPECTOR ── */
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <h3 className="text-xs font-extrabold flex items-center gap-1.5">
                    <Ruler className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>
                      {isBn
                        ? "লেবেল সাইজ ও পরিমাপ (Measurements)"
                        : "Label Size & Measurements"}
                    </span>
                  </h3>
                  {/* Unit Switcher: mm / cm / inch */}
                  <div className="flex items-center bg-muted p-0.5 rounded-lg text-[10px] font-bold">
                    {(["mm", "cm", "in"] as LabelUnit[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => updateCfg({ unit: u })}
                        className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                          unitLabel === u
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preset Quick Selector */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold">
                    {isBn ? "স্ট্যান্ডার্ড স্টিকার সাইজ প্রিসেট" : "Standard Size Presets"}
                  </Label>
                  <Select
                    value={
                      LABEL_PRESETS.find(
                        (p) =>
                          p.mode === labelCfg.mode &&
                          p.widthMm === labelCfg.widthMm &&
                          p.heightMm === labelCfg.heightMm &&
                          (p.rollColumns || 1) === (labelCfg.rollColumns || 1)
                      )?.id || "custom"
                    }
                    onValueChange={(id) => {
                      if (id === "custom") return;
                      const preset = LABEL_PRESETS.find((p) => p.id === id);
                      if (preset) {
                        updateCfg({
                          mode: preset.mode,
                          widthMm: preset.widthMm,
                          heightMm: preset.heightMm,
                          rollColumns: preset.rollColumns || 1,
                          columnGapMm: preset.columnGapMm ?? labelCfg.columnGapMm,
                          a4Columns: preset.a4Columns || labelCfg.a4Columns,
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LABEL_PRESETS.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {isBn ? p.labelBn : p.labelEn}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom" className="text-xs font-bold text-indigo-600">
                        {isBn ? "কাস্টম সাইজ (Custom Size)" : "Custom Measurements"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom Width & Height Inputs + Orientation Swap */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">
                      {isBn ? `প্রস্থ / Width (${unitLabel})` : `Width (${unitLabel})`}
                    </Label>
                    <Input
                      type="number"
                      step={unitLabel === "mm" ? 1 : 0.1}
                      min={unitLabel === "in" ? 0.4 : unitLabel === "cm" ? 1 : 10}
                      value={mmToUnit(labelCfg.widthMm, unitLabel)}
                      onChange={(e) => {
                        const mm = unitToMm(Number(e.target.value), unitLabel);
                        if (mm >= 8) updateCfg({ widthMm: mm });
                      }}
                      className="h-8 text-xs font-mono font-bold"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      updateCfg({
                        widthMm: labelCfg.heightMm,
                        heightMm: labelCfg.widthMm,
                      })
                    }
                    title={isBn ? "প্রস্থ ও উচ্চতা অদলবদল" : "Swap Width & Height"}
                    className="size-8 cursor-pointer"
                  >
                    <ArrowLeftRight className="size-3.5" />
                  </Button>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">
                      {isBn ? `উচ্চতা / Height (${unitLabel})` : `Height (${unitLabel})`}
                    </Label>
                    <Input
                      type="number"
                      step={unitLabel === "mm" ? 1 : 0.1}
                      min={unitLabel === "in" ? 0.3 : unitLabel === "cm" ? 0.8 : 8}
                      value={mmToUnit(labelCfg.heightMm, unitLabel)}
                      onChange={(e) => {
                        const mm = unitToMm(Number(e.target.value), unitLabel);
                        if (mm >= 8) updateCfg({ heightMm: mm });
                      }}
                      className="h-8 text-xs font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Quick Stickers Quantity Pills */}
                <div className="space-y-1.5 pt-1 border-t border-border/50">
                  <Label className="text-[11px] font-bold">
                    {isBn
                      ? "কতগুলো স্টিকার প্রিন্ট হবে? (Copies)"
                      : "How Many Stickers to Print?"}
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={
                        queue.length > 0
                          ? queue[Math.min(previewRowIndex, queue.length - 1)]?.copies || 1
                          : labelCfg.defaultCopies || 1
                      }
                      onChange={(e) => handleSetStickerCopies(Number(e.target.value) || 1)}
                      className="h-8 w-20 text-xs font-mono font-extrabold text-center"
                    />
                    <div className="flex flex-wrap gap-1">
                      {[1, 2, 5, 10, 25, 50, 100].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => handleSetStickerCopies(n)}
                          className="px-2 py-1 rounded-md text-[10px] font-mono font-bold border border-border hover:bg-muted cursor-pointer"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick Product Weight & Height/Size Entry for Current Sticker */}
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold flex items-center gap-1">
                      <Scale className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>
                        {isBn
                          ? "পণ্যের ওজন ও উচ্চতা/মাপ (Weight & Size)"
                          : "Product Weight & Measurements"}
                      </span>
                    </Label>
                    {!queue.length && (
                      <button
                        type="button"
                        onClick={addBlankDataRow}
                        className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        + {isBn ? "ডাটা সারি খুলুন" : "Create Row"}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">
                        {isBn ? "ওজন (Weight)" : "Weight (g / kg)"}
                      </span>
                      <div className="flex gap-1">
                        <Input
                          placeholder="e.g. 250g / 1kg"
                          value={activeDataRow?.weight || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (activeDataRow?.id) {
                              updateDataRow(activeDataRow.id, { weight: val });
                            } else {
                              setQueue([
                                {
                                  id: makeId("manual"),
                                  name: "",
                                  code: "89401234",
                                  price: 0,
                                  weight: val,
                                  copies: labelCfg.defaultCopies || 1,
                                },
                              ]);
                            }
                          }}
                          className="h-7 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            addCanvasElement("text", {
                              layerName: "Weight",
                              content: activeDataRow?.weight
                                ? "Wt: {weight}"
                                : "Wt: 250g",
                              fontSizePt: 8,
                            })
                          }
                          title="Place Weight on Label"
                          className="h-7 px-2 text-[10px] cursor-pointer"
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">
                        {isBn ? "উচ্চতা / সাইজ (Height/Size)" : "Height / Size"}
                      </span>
                      <div className="flex gap-1">
                        <Input
                          placeholder='e.g. XL / 42"'
                          value={activeDataRow?.heightText || activeDataRow?.measurement || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (activeDataRow?.id) {
                              updateDataRow(activeDataRow.id, {
                                heightText: val,
                                measurement: val,
                              });
                            } else {
                              setQueue([
                                {
                                  id: makeId("manual"),
                                  name: "",
                                  code: "89401234",
                                  price: 0,
                                  heightText: val,
                                  measurement: val,
                                  copies: labelCfg.defaultCopies || 1,
                                },
                              ]);
                            }
                          }}
                          className="h-7 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            addCanvasElement("text", {
                              layerName: "Size/Height",
                              content:
                                activeDataRow?.heightText || activeDataRow?.measurement
                                  ? "Size: {size}"
                                  : "Size: XL",
                              fontSizePt: 8,
                            })
                          }
                          title="Place Size/Height on Label"
                          className="h-7 px-2 text-[10px] cursor-pointer"
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Roll Columns & Sticker Outer Options */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                  <div className="space-y-1">
                    <Label className="text-[10.5px] font-semibold">
                      {isBn ? "পেপার মোড" : "Paper Mode"}
                    </Label>
                    <Select
                      value={labelCfg.mode}
                      onValueChange={(v) =>
                        updateCfg({ mode: v as "thermal" | "a4_sheet" })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="thermal" className="text-xs">
                          Thermal Sticker Roll
                        </SelectItem>
                        <SelectItem value="a4_sheet" className="text-xs">
                          A4 Sticker Sheet
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {labelCfg.mode === "thermal" ? (
                    <div className="space-y-1">
                      <Label className="text-[10.5px] font-semibold">
                        {isBn ? "রোল কলাম (Across Roll)" : "Roll Columns"}
                      </Label>
                      <Select
                        value={String(labelCfg.rollColumns || 1)}
                        onValueChange={(v) => updateCfg({ rollColumns: Number(v) || 1 })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1" className="text-xs">1-Up Single Roll</SelectItem>
                          <SelectItem value="2" className="text-xs">2-Column Roll</SelectItem>
                          <SelectItem value="3" className="text-xs">3-Column Roll</SelectItem>
                          <SelectItem value="4" className="text-xs">4-Column Roll</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-[10.5px] font-semibold">A4 Columns</Label>
                      <Input
                        type="number"
                        min={1}
                        max={6}
                        value={labelCfg.a4Columns}
                        onChange={(e) =>
                          updateCfg({ a4Columns: Math.max(1, Number(e.target.value) || 4) })
                        }
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium">
                    {isBn ? "পুরো স্টিকারে আউটলাইন বর্ডার" : "Outer Sticker Border"}
                  </span>
                  <Switch
                    checked={labelCfg.showBorder}
                    onCheckedChange={(v) => updateCfg({ showBorder: v })}
                  />
                </div>
              </div>
            ) : (
              /* ── SELECTED ELEMENT PROPERTY INSPECTOR ── */
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                      {selectedElement.type}
                    </Badge>
                    <span className="text-xs font-bold truncate max-w-[130px]">
                      {selectedElement.layerName || selectedElement.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => duplicateElementById(selectedElement.id)}
                      className="h-7 px-2 text-xs cursor-pointer"
                      title="Duplicate"
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteElementById(selectedElement.id)}
                      className="h-7 px-2.5 text-xs gap-1 cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                      <span>{isBn ? "মুছুন" : "Delete"}</span>
                    </Button>
                  </div>
                </div>

                {/* Content / Variable Binding for Text, Barcode, QR */}
                {(selectedElement.type === "text" ||
                  selectedElement.type === "barcode" ||
                  selectedElement.type === "qrcode") && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold">
                      {selectedElement.type === "text"
                        ? isBn
                          ? "লেবেল টেক্সট (নিজের মতো লিখুন বা ভ্যারিয়েবল দিন)"
                          : "Text Content (Type custom text or insert variable)"
                        : isBn
                        ? "বারকোড / QR ডাটা"
                        : "Barcode / QR Value"}
                    </Label>
                    <div className="flex gap-1.5">
                      <Input
                        value={selectedElement.content}
                        placeholder={
                          selectedElement.type === "text"
                            ? isBn
                              ? "আপনার টেক্সট লিখুন..."
                              : "Enter custom text..."
                            : "{barcode} or 89401234"
                        }
                        onChange={(e) =>
                          updateSelectedElement({ content: e.target.value })
                        }
                        className="h-8 text-xs font-semibold"
                      />
                      {selectedElement.type === "barcode" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const generated = generateUniqueBarcode(
                              selectedElement.symbology || "CODE128",
                              existingCodesSet
                            );
                            updateSelectedElement({ content: generated });
                          }}
                          title="Generate Random Unique Barcode"
                          className="h-8 px-2.5 cursor-pointer"
                        >
                          <Wand2 className="size-3.5 text-indigo-600" />
                        </Button>
                      )}
                    </div>

                    {/* Insert Variable Chips */}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {VARIABLE_CHIPS.map((v) => (
                        <button
                          key={v.token}
                          type="button"
                          onClick={() => {
                            if (
                              selectedElement.type === "barcode" ||
                              selectedElement.type === "qrcode"
                            ) {
                              updateSelectedElement({ content: v.token });
                            } else {
                              const nextVal = selectedElement.content
                                ? `${selectedElement.content} ${v.token}`
                                : v.token;
                              updateSelectedElement({ content: nextVal });
                            }
                          }}
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted hover:bg-indigo-500/15 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer"
                        >
                          {v.token}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Image Replace Button */}
                {selectedElement.type === "image" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => imageUploadRef.current?.click()}
                    className="w-full h-8 text-xs gap-1.5 cursor-pointer"
                  >
                    <Upload className="size-3.5" />
                    <span>{isBn ? "নতুন ছবি/লোগো আপলোড করুন" : "Choose Logo / Image"}</span>
                  </Button>
                )}

                {/* Barcode Specific Controls */}
                {selectedElement.type === "barcode" && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                    <div className="space-y-1">
                      <Label className="text-[10.5px] font-semibold">Symbology</Label>
                      <Select
                        value={selectedElement.symbology || "CODE128"}
                        onValueChange={(v) =>
                          updateSelectedElement({ symbology: v as BarcodeSymbology })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs font-mono">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CODE128" className="text-xs">Code-128 (Auto)</SelectItem>
                          <SelectItem value="EAN13" className="text-xs">EAN-13 (13 Digit)</SelectItem>
                          <SelectItem value="UPCA" className="text-xs">UPC-A (12 Digit)</SelectItem>
                          <SelectItem value="CODE39" className="text-xs">Code-39 (SKU)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10.5px] font-semibold">Digits Font (pt)</Label>
                      <Input
                        type="number"
                        min={4.5}
                        max={14}
                        step={0.5}
                        value={selectedElement.fontSizePt || 6.5}
                        onChange={(e) =>
                          updateSelectedElement({ fontSizePt: Number(e.target.value) || 6.5 })
                        }
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {isBn ? "বারকোডের নিচে নম্বর দেখান" : "Show Code Text Under Bars"}
                      </span>
                      <Switch
                        checked={selectedElement.showCodeText !== false}
                        onCheckedChange={(v) => updateSelectedElement({ showCodeText: v })}
                      />
                    </div>
                  </div>
                )}

                {/* Typography Controls for Text */}
                {selectedElement.type === "text" && (
                  <div className="space-y-2.5 pt-1 border-t border-border/50">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10.5px] font-semibold">Font Family</Label>
                        <Select
                          value={selectedElement.fontFamily || "sans"}
                          onValueChange={(v) =>
                            updateSelectedElement({
                              fontFamily: v as LabelElement["fontFamily"],
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sans" className="text-xs">Clean Sans</SelectItem>
                            <SelectItem value="condensed" className="text-xs">Condensed Tag</SelectItem>
                            <SelectItem value="mono" className="text-xs">Monospace</SelectItem>
                            <SelectItem value="serif" className="text-xs">Classic Serif</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10.5px] font-semibold">Font Size (pt)</Label>
                        <Input
                          type="number"
                          min={4}
                          max={64}
                          step={0.5}
                          value={selectedElement.fontSizePt || 9}
                          onChange={(e) =>
                            updateSelectedElement({ fontSizePt: Number(e.target.value) || 9 })
                          }
                          className="h-8 text-xs font-mono font-bold"
                        />
                      </div>
                    </div>

                    {/* Style & Alignment Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedElement({
                              fontWeight:
                                selectedElement.fontWeight === "black" ? "normal" : "black",
                            })
                          }
                          className={`size-7 rounded border flex items-center justify-center cursor-pointer ${
                            selectedElement.fontWeight === "bold" ||
                            selectedElement.fontWeight === "black"
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "border-border hover:bg-muted"
                          }`}
                          title="Bold"
                        >
                          <Bold className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedElement({ italic: !selectedElement.italic })
                          }
                          className={`size-7 rounded border flex items-center justify-center cursor-pointer ${
                            selectedElement.italic
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "border-border hover:bg-muted"
                          }`}
                          title="Italic"
                        >
                          <Italic className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedElement({ underline: !selectedElement.underline })
                          }
                          className={`size-7 rounded border flex items-center justify-center cursor-pointer ${
                            selectedElement.underline
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "border-border hover:bg-muted"
                          }`}
                          title="Underline"
                        >
                          <Underline className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedElement({
                              strikethrough: !selectedElement.strikethrough,
                            })
                          }
                          className={`h-7 px-2 rounded border text-[11px] font-bold line-through cursor-pointer ${
                            selectedElement.strikethrough
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "border-border hover:bg-muted"
                          }`}
                          title="Strikethrough (e.g. Old MRP)"
                        >
                          S
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {(["left", "center", "right"] as const).map((al) => {
                          const Icon =
                            al === "left"
                              ? AlignLeft
                              : al === "right"
                              ? AlignRight
                              : AlignCenter;
                          return (
                            <button
                              key={al}
                              type="button"
                              onClick={() => updateSelectedElement({ align: al })}
                              className={`size-7 rounded border flex items-center justify-center cursor-pointer ${
                                (selectedElement.align || "center") === al
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "border-border hover:bg-muted"
                              }`}
                            >
                              <Icon className="size-3.5" />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="flex items-center justify-between text-[11px] font-medium border border-border/60 rounded-lg px-2.5 py-1.5 cursor-pointer">
                        <span>{isBn ? "কালো ব্যাজ (Invert)" : "Inverted Tag"}</span>
                        <Switch
                          checked={Boolean(selectedElement.inverted)}
                          onCheckedChange={(v) => updateSelectedElement({ inverted: v })}
                        />
                      </label>
                      <label className="flex items-center justify-between text-[11px] font-medium border border-border/60 rounded-lg px-2.5 py-1.5 cursor-pointer">
                        <span>{isBn ? "অটো-ফিট সাইজ" : "Auto-Shrink"}</span>
                        <Switch
                          checked={selectedElement.autoFit !== false}
                          onCheckedChange={(v) => updateSelectedElement({ autoFit: v })}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Box / Line Specific Controls */}
                {(selectedElement.type === "box" || selectedElement.type === "line") && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                    <div className="space-y-1">
                      <Label className="text-[10.5px] font-semibold">Stroke (mm)</Label>
                      <Input
                        type="number"
                        step={0.1}
                        min={0.2}
                        max={5}
                        value={selectedElement.borderWidthMm || 0.4}
                        onChange={(e) =>
                          updateSelectedElement({
                            borderWidthMm: Number(e.target.value) || 0.4,
                          })
                        }
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10.5px] font-semibold">Style</Label>
                      <Select
                        value={selectedElement.borderStyle || "solid"}
                        onValueChange={(v) =>
                          updateSelectedElement({
                            borderStyle: v as "solid" | "dashed" | "dotted",
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="solid" className="text-xs">Solid</SelectItem>
                          <SelectItem value="dashed" className="text-xs">Dashed</SelectItem>
                          <SelectItem value="dotted" className="text-xs">Dotted</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Exact X / Y / Width / Height (mm) Position & Alignment */}
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10.5px] font-bold">
                      {isBn ? "পজিশন ও সাইজ (mm)" : "Position & Size (mm)"}
                    </Label>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedElement({
                          xMm: roundMm((labelCfg.widthMm - selectedElement.wMm) / 2),
                          yMm: roundMm((labelCfg.heightMm - selectedElement.hMm) / 2),
                        })
                      }
                      className="text-[10px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                    >
                      {isBn ? "মাঝখানে আনুন" : "Center on Sticker"}
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    <div>
                      <span className="text-[9.5px] text-muted-foreground font-mono">X</span>
                      <Input
                        type="number"
                        step={0.5}
                        value={selectedElement.xMm}
                        onChange={(e) =>
                          updateSelectedElement({ xMm: Number(e.target.value) || 0 })
                        }
                        className="h-7 text-xs font-mono px-1.5"
                      />
                    </div>
                    <div>
                      <span className="text-[9.5px] text-muted-foreground font-mono">Y</span>
                      <Input
                        type="number"
                        step={0.5}
                        value={selectedElement.yMm}
                        onChange={(e) =>
                          updateSelectedElement({ yMm: Number(e.target.value) || 0 })
                        }
                        className="h-7 text-xs font-mono px-1.5"
                      />
                    </div>
                    <div>
                      <span className="text-[9.5px] text-muted-foreground font-mono">W</span>
                      <Input
                        type="number"
                        step={0.5}
                        min={2}
                        value={selectedElement.wMm}
                        onChange={(e) =>
                          updateSelectedElement({
                            wMm: Math.max(2, Number(e.target.value) || 10),
                          })
                        }
                        className="h-7 text-xs font-mono px-1.5"
                      />
                    </div>
                    <div>
                      <span className="text-[9.5px] text-muted-foreground font-mono">H</span>
                      <Input
                        type="number"
                        step={0.5}
                        min={1}
                        value={selectedElement.hMm}
                        onChange={(e) =>
                          updateSelectedElement({
                            hMm: Math.max(1, Number(e.target.value) || 5),
                          })
                        }
                        className="h-7 text-xs font-mono px-1.5"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: DATA (Label LIVE Spreadsheet + Store Inventory + CSV)
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "data" && (
        <div className="p-4 space-y-4 min-h-[520px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold">
                {isBn
                  ? "ডাটা স্প্রেডশিট ও পণ্য তালিকা (Label LIVE Data)"
                  : "Label Data Spreadsheet & Store Products"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isBn
                  ? "স্টোরের পণ্য যুক্ত করুন অথবা সরাসরি কাস্টম নাম, বারকোড, মূল্য, ওজন (Weight), উচ্চতা (Height) ও স্টিকার সংখ্যা লিখুন"
                  : "Link store inventory or type custom rows with weight, height/size measurements, barcode, and sticker copies"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                onClick={addBlankDataRow}
                className="h-8 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>{isBn ? "নতুন ডাটা সারি" : "Add Blank Row"}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => csvImportRef.current?.click()}
                className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
              >
                <Upload className="size-3.5" />
                <span>Import CSV</span>
              </Button>
              {queue.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportDataCsv}
                  className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="size-3.5" />
                  <span>Export CSV</span>
                </Button>
              )}
            </div>
          </div>

          {/* Store Inventory Quick Picker */}
          {products.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2">
              <div className="relative">
                <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isBn
                      ? "স্টোরের পণ্যের নাম, বারকোড বা SKU খুঁজুন..."
                      : "Search store inventory by product name, barcode, or SKU..."
                  }
                  className="h-8 pl-8 text-xs bg-background"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProductToDataQueue(p)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border/80 hover:border-indigo-500 text-xs font-medium cursor-pointer transition-colors"
                  >
                    <Plus className="size-3 text-indigo-600" />
                    <span className="truncate max-w-[160px] font-semibold">{p.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      ৳{p.sell_price}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Spreadsheet Table */}
          {queue.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-12 text-center space-y-2">
              <Table2 className="size-7 text-muted-foreground mx-auto" />
              <p className="text-xs font-bold">
                {isBn
                  ? "ডাটা টেবিল খালি (স্ট্যাটিক স্টিকার মোড সক্রিয়)"
                  : "No Data Rows Added (Static Label Mode Active)"}
              </p>
              <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                {isBn
                  ? "আপনি চাইলে কোনো পণ্য ছাড়াই সরাসরি Design ট্যাবে টেক্সট লিখে প্রিন্ট করতে পারেন, অথবা একাধিক পণ্যের ব্যাচ স্টিকার প্রিন্ট করতে উপরে থেকে পণ্য যোগ করুন।"
                  : "You can print static custom stickers directly from the Design tab, or add product/CSV rows above for dynamic batch printing."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">
                  {queue.length} {isBn ? "টি সারি • মোট স্টিকার:" : "rows • Total Stickers:"}{" "}
                  <strong className="text-foreground">{totalStickersCount}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = queue.map((r) => {
                        const prod = products.find((p) => p.id === r.productId);
                        return prod
                          ? { ...r, copies: Math.max(1, Number(prod.stock) || 1) }
                          : r;
                      });
                      setQueue(next);
                      toast.success(isBn ? "স্টক অনুযায়ী কপি সেট হয়েছে" : "Matched copies to stock!");
                    }}
                    className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                  >
                    {isBn ? "স্টক সমান কপি দিন" : "Match Stock Qty"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueue([])}
                    className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                  >
                    {isBn ? "সব মুছুন" : "Clear Table"}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border text-left font-bold text-[11px]">
                      <th className="p-2 w-24">{isBn ? "স্টিকার সংখ্যা" : "Stickers"}</th>
                      <th className="p-2 min-w-[150px]">{isBn ? "নাম {name}" : "Name {name}"}</th>
                      <th className="p-2 min-w-[150px]">{isBn ? "বারকোড {barcode}" : "Barcode {barcode}"}</th>
                      <th className="p-2 w-24">{isBn ? "মূল্য {price}" : "Price {price}"}</th>
                      <th className="p-2 w-28">{isBn ? "ওজন {weight}" : "Weight {weight}"}</th>
                      <th className="p-2 w-28">{isBn ? "উচ্চতা/সাইজ {size}" : "Height/Size {size}"}</th>
                      <th className="p-2 w-12 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((row, idx) => (
                      <tr
                        key={row.id}
                        onClick={() => setPreviewRowIndex(idx)}
                        className={`border-b border-border/60 ${
                          previewRowIndex === idx ? "bg-indigo-500/5" : "hover:bg-muted/30"
                        }`}
                      >
                        <td className="p-1.5">
                          <Input
                            type="number"
                            min={1}
                            max={10000}
                            value={row.copies}
                            onChange={(e) =>
                              updateDataRow(row.id, {
                                copies: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="h-7 font-mono font-extrabold text-center"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            value={row.name}
                            onChange={(e) => updateDataRow(row.id, { name: e.target.value })}
                            placeholder="Product / Label Name"
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <div className="flex items-center gap-1">
                            <Input
                              value={row.code}
                              onChange={(e) => updateDataRow(row.id, { code: e.target.value })}
                              className="h-7 text-xs font-mono"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateDataRow(row.id, {
                                  code: generateUniqueBarcode("CODE128", existingCodesSet),
                                })
                              }
                              title="Generate Barcode"
                              className="p-1 rounded border border-border hover:bg-muted cursor-pointer"
                            >
                              <Wand2 className="size-3 text-indigo-600" />
                            </button>
                            {row.productId && (
                              <button
                                type="button"
                                disabled={savingBarcodeId === row.id}
                                onClick={() => handleSaveBarcodeToProductDb(row)}
                                title="Save Barcode to Product DB"
                                className="p-1 rounded border border-border hover:bg-emerald-500/10 text-emerald-600 cursor-pointer"
                              >
                                <Save className="size-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            value={row.price}
                            onChange={(e) =>
                              updateDataRow(row.id, { price: Number(e.target.value) || 0 })
                            }
                            className="h-7 text-xs font-mono"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            value={row.weight || ""}
                            onChange={(e) => updateDataRow(row.id, { weight: e.target.value })}
                            placeholder="e.g. 500g"
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            value={row.measurement || row.heightText || ""}
                            onChange={(e) =>
                              updateDataRow(row.id, {
                                measurement: e.target.value,
                                heightText: e.target.value,
                              })
                            }
                            placeholder='e.g. XL / 42"'
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQueue((prev) => prev.filter((item) => item.id !== row.id));
                            }}
                            className="p-1 text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3: PRINT (Label LIVE Hardware Setup, Calibration & Batch Output)
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "print" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[520px]">
          {/* Left Print Settings & Hardware */}
          <div className="lg:col-span-5 p-4 border-b lg:border-b-0 lg:border-r border-border/70 space-y-4">
            <h3 className="text-sm font-extrabold flex items-center gap-2">
              <Printer className="size-4 text-indigo-600 dark:text-indigo-400" />
              <span>
                {isBn ? "স্টিকার প্রিন্টার ও পেজ সেটআপ" : "Sticker Printer & Output"}
              </span>
            </h3>

            {/* Dedicated Sticker Printer Dropdown */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold">
                  {isBn ? "স্টিকার প্রিন্টার নির্বাচন" : "Target Sticker Printer"}
                </Label>
                <button
                  type="button"
                  onClick={fetchPrinters}
                  className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`size-3 ${loadingPrinters ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>

              <Select
                value={labelCfg.printerName || "__default__"}
                onValueChange={(v) =>
                  updateCfg({ printerName: v === "__default__" ? "" : v })
                }
              >
                <SelectTrigger className="h-9 text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__" className="text-xs">
                    {defaultOsPrinter
                      ? `System Default (${defaultOsPrinter})`
                      : "System Default / Browser Print"}
                  </SelectItem>
                  {installedPrinters.map((p) => (
                    <SelectItem key={p.name} value={p.name} className="text-xs">
                      {p.name} {p.isDefault ? "(OS Default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenPrinterPreferences}
                  className="h-7 text-[11px] gap-1 cursor-pointer"
                >
                  <Settings2 className="size-3" />
                  <span>{isBn ? "ড্রাইভার প্রেফারেন্স" : "Driver Preferences"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={calibrating}
                  onClick={handleCalibrationPrint}
                  className="h-7 text-[11px] gap-1 cursor-pointer"
                >
                  <Crosshair className="size-3" />
                  <span>{isBn ? "ক্যালিব্রেশন টেস্ট" : "Calibration Test"}</span>
                </Button>
              </div>
            </div>

            {/* Size + Gap + Printhead X/Y Offsets */}
            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border/60">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Width (mm)</Label>
                <Input
                  type="number"
                  min={10}
                  max={300}
                  value={labelCfg.widthMm}
                  onChange={(e) =>
                    updateCfg({ widthMm: Math.max(10, Number(e.target.value) || 50) })
                  }
                  className="h-8 text-xs font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Height (mm)</Label>
                <Input
                  type="number"
                  min={8}
                  max={400}
                  value={labelCfg.heightMm}
                  onChange={(e) =>
                    updateCfg({ heightMm: Math.max(8, Number(e.target.value) || 30) })
                  }
                  className="h-8 text-xs font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Left Offset (mm)</Label>
                <Input
                  type="number"
                  step={0.5}
                  min={-15}
                  max={15}
                  value={labelCfg.offsetLeftMm}
                  onChange={(e) => updateCfg({ offsetLeftMm: Number(e.target.value) || 0 })}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Top Offset (mm)</Label>
                <Input
                  type="number"
                  step={0.5}
                  min={-15}
                  max={15}
                  value={labelCfg.offsetTopMm}
                  onChange={(e) => updateCfg({ offsetTopMm: Number(e.target.value) || 0 })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="text-xs font-bold">
                  {isBn ? "১-ক্লিক সাইলেন্ট প্রিন্ট" : "1-Click Silent Print"}
                </div>
                <div className="text-[10.5px] text-muted-foreground">
                  {isBn
                    ? "ডায়ালগ ছাড়াই সরাসরি স্টিকার প্রিন্টারে পাঠাবে"
                    : "Send directly to sticker printer without OS popup"}
                </div>
              </div>
              <Switch
                checked={labelCfg.silentPrint}
                onCheckedChange={(v) => updateCfg({ silentPrint: v })}
              />
            </div>

            {/* Primary Output Buttons */}
            <div className="space-y-2 pt-3 border-t border-border/60">
              <Button
                type="button"
                disabled={printing}
                onClick={() => handlePrint(false)}
                className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs gap-2 cursor-pointer"
              >
                <Printer className="size-4" />
                <span>
                  {isBn
                    ? `এখনই ${totalStickersCount}টি স্টিকার প্রিন্ট করুন`
                    : `Print ${totalStickersCount} Sticker(s) Now`}
                </span>
              </Button>

              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={printing}
                  onClick={() => handlePrint(true)}
                  className="h-8 text-[11px] font-semibold gap-1 cursor-pointer"
                >
                  <Sliders className="size-3" />
                  <span>Print Dialog</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportingPdf}
                  onClick={handleDownloadPdf}
                  className="h-8 text-[11px] font-semibold gap-1 cursor-pointer"
                >
                  <FileDown className="size-3" />
                  <span>Export PDF</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportingPng}
                  onClick={handleDownloadPng}
                  className="h-8 text-[11px] font-semibold gap-1 cursor-pointer"
                >
                  <FileImage className="size-3" />
                  <span>Export PNG</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Right Live Batch Roll / Sheet Output Preview */}
          <div className="lg:col-span-7 bg-zinc-100 dark:bg-zinc-950/90 p-5 flex flex-col items-center justify-start overflow-auto max-h-[560px]">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <span>
                {isBn ? "লাইভ রোল আউটপুট প্রিভিউ" : "Live Output Roll Preview"} (
                {layoutMetrics.totalRowWidthMm} × {layoutMetrics.heightMm} mm)
              </span>
            </div>

            <div
              className="grid bg-sky-100/70 dark:bg-sky-950/30 p-3 rounded-xl border border-sky-200/80 dark:border-sky-900/40"
              style={{
                gridTemplateColumns: `repeat(${
                  labelCfg.mode === "a4_sheet"
                    ? Math.min(3, labelCfg.a4Columns)
                    : layoutMetrics.rollCols
                }, ${labelCfg.widthMm * BASE_PX_PER_MM * 0.85}px)`,
                gap: `${labelCfg.columnGapMm * BASE_PX_PER_MM * 0.85}px`,
              }}
            >
              {Array.from({ length: Math.min(6, totalStickersCount) }).map((_, idx) => {
                const rowForIdx =
                  queue.length > 0 ? queue[idx % queue.length] : activeDataRow;
                const scaleFactor = 0.85;
                const pMm = BASE_PX_PER_MM * scaleFactor;
                return (
                  <div
                    key={idx}
                    className="relative bg-white text-black shadow-xs overflow-hidden"
                    style={{
                      width: `${labelCfg.widthMm * pMm}px`,
                      height: `${labelCfg.heightMm * pMm}px`,
                      borderRadius: `${(labelCfg.cornerRadiusMm || 0) * pMm}px`,
                      border: labelCfg.showBorder
                        ? "1.5px solid #000000"
                        : "1px solid #cbd5e1",
                    }}
                  >
                    {elements
                      .filter((e) => !e.hidden)
                      .map((el) => (
                        <div
                          key={el.id}
                          style={{
                            position: "absolute",
                            left: `${el.xMm * pMm}px`,
                            top: `${el.yMm * pMm}px`,
                            width: `${el.wMm * pMm}px`,
                            height: `${el.hMm * pMm}px`,
                            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                          }}
                        >
                          {renderVisualElementContent(el, rowForIdx, idx, false)}
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
            {totalStickersCount > 6 && (
              <p className="mt-2 text-[11px] text-muted-foreground font-mono">
                + {totalStickersCount - 6} more sticker(s) queued in batch
              </p>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 4: TEMPLATES (Save / Load Custom Label Designs + Import/Export)
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "templates" && (
        <div className="p-4 space-y-5 min-h-[480px]">
          {/* Save Current Design */}
          <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-border/60">
            <div className="space-y-1 flex-1 min-w-[220px]">
              <Label className="text-xs font-extrabold">
                {isBn
                  ? "বর্তমান লেবেল ডিজাইন সেভ করুন"
                  : "Save Current Label Design as Template"}
              </Label>
              <div className="flex gap-2">
                <Input
                  value={templateNameInput}
                  onChange={(e) => setTemplateNameInput(e.target.value)}
                  placeholder={
                    isBn
                      ? "টেমপ্লেটের নাম (যেমন: Garments Tag 50x30)..."
                      : "Template name (e.g. Garments Price & Weight Tag)..."
                  }
                  className="h-9 text-xs max-w-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveTemplate}
                  className="h-9 px-4 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                >
                  <Save className="size-3.5" />
                  <span>{isBn ? "সেভ করুন" : "Save Template"}</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportTemplateJson}
                className="h-9 text-xs gap-1.5 cursor-pointer"
              >
                <Download className="size-3.5" />
                <span>Export .json</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => templateImportRef.current?.click()}
                className="h-9 text-xs gap-1.5 cursor-pointer"
              >
                <Upload className="size-3.5" />
                <span>Import .json</span>
              </Button>
            </div>
          </div>

          {/* Start Fresh Blank Label + Saved User Templates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {/* Blank Canvas Card */}
            <div className="rounded-xl border border-dashed border-border p-3.5 flex flex-col justify-between gap-3 bg-muted/10">
              <div>
                <div className="text-xs font-extrabold">
                  {isBn ? "সম্পূর্ণ খালি লেবেল (Blank Label)" : "Start Blank Label"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isBn
                    ? "কোনো ডিফল্ট টেক্সট ছাড়াই শূন্য থেকে নিজের লেবেল তৈরি করুন"
                    : "Clean empty sticker with zero default texts"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  commitElements([], true);
                  setSelectedId(null);
                  setActiveTab("design");
                }}
                className="h-8 text-xs font-bold cursor-pointer"
              >
                {isBn ? "খালি ক্যানভাস খুলুন" : "New Blank Canvas"}
              </Button>
            </div>

            {(labelCfg.savedTemplates || []).map((tpl) => (
              <div
                key={tpl.id}
                className="rounded-xl border border-border p-3.5 flex flex-col justify-between gap-3 bg-background"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold">{tpl.name}</div>
                    <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                      {tpl.widthMm} × {tpl.heightMm} mm • {tpl.elements?.length || 0} items
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className="p-1 text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleLoadTemplate(tpl)}
                  className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                >
                  {isBn ? "ডিজাইন লোড করুন" : "Open Template"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface LabelPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products?: Product[];
  initialProducts?: (Product & { initialCopies?: number })[];
  shopName?: string;
  lang?: string;
}

export function LabelPrintDialog({
  open,
  onOpenChange,
  products = [],
  initialProducts = [],
  shopName,
  lang = "bn",
}: LabelPrintDialogProps) {
  const isBn = lang === "bn";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[94vh] overflow-y-auto p-3 sm:p-4">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {isBn ? "লেবেল প্রিন্টিং স্টুডিও" : "Label Printing Studio"}
          </DialogTitle>
          <DialogDescription>
            {isBn
              ? "ড্র্যাগ অ্যান্ড ড্রপ কাস্টম সাইজ লেবেল ও বারকোড স্টিকার প্রিন্টিং"
              : "Label LIVE style drag-and-drop barcode and custom sticker designer"}
          </DialogDescription>
        </DialogHeader>
        <LabelPrintingStudio
          products={products}
          initialProducts={initialProducts}
          shopName={shopName}
          lang={lang}
          embedded
        />
      </DialogContent>
    </Dialog>
  );
}

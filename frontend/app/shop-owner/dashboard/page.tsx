"use client";

import { useEffect, useState } from "react";
import { useShopOwnerGuard } from "@/hooks/useRoleGuard";
import {
  shopsApi,
  productsApi,
  ordersApi,
  whatsappImportsApi,
} from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import {
  Store,
  Package,
  ShoppingCart,
  DollarSign,
  Plus,
  MessageCircle,
  Upload,
  Edit2,
  Trash2,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Activity,
  Clock,
  Copy,
  Terminal,
  GitCompareArrows,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import ShopWhatsAppAvatars, {
  ShopWhatsAppGroupAvatar,
} from "@/components/shops/ShopWhatsAppAvatars";

interface Shop {
  id: string;
  name: string;
  description: string | null;
  phone: string;
  address: string | null;
  status: string;
  _count?: { products: number };
  relatedWhatsAppGroups?: ShopWhatsAppGroupAvatar[];
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  stockQty: number;
  category: string | null;
  status: string;
  images: string[] | null;
}

interface ProductDraft {
  name: string;
  description: string;
  basePrice: number;
  stockQty: number;
  category: string;
  images: string[];
  raw?: string;
  sourceText?: string;
  aiConfidence?: number;
  aiSource?: string;
  aiTags?: string[];
  colors?: string[];
  sizes?: string[];
}

interface DuplicateCandidateProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  status: string;
  basePrice: number;
  stockQty: number;
  images: string[];
  updatedAt: string;
  _count: { listings: number; orderItems: number };
}

interface DuplicateCandidate {
  id: string;
  reason: string;
  confidence: number;
  distance: number | null;
  nameSimilarity: number;
  captureGroupingWarning: boolean;
  left: DuplicateCandidateProduct;
  right: DuplicateCandidateProduct;
}

interface WhatsAppImportItem {
  id: string;
  caption: string;
  mediaUrls: string[] | null;
  parsedDraft: ProductDraft | null;
  status: string;
  sourceGroup: string | null;
  senderPhone: string | null;
  messageId: string | null;
  receivedAt: string;
  error: string | null;
  resolutionOutcome?: "CREATED" | "UPDATED" | "DUPLICATE" | "RENEWED" | null;
  matchedProductId?: string | null;
  matchConfidence?: number | null;
  matchAgeDays?: number | null;
  matchReason?: string | null;
  resolvedAt?: string | null;
  product?: { id: string; name: string } | null;
}

interface WhatsAppCaptureStats {
  total: number;
  byStatus: Record<string, number>;
  pendingReview: number;
  capturedLastHour: number;
  capturedLastDay: number;
  recentMediaCount: number;
  recentWithMedia: number;
  mediaCoverage: number;
  duplicatesPrevented: number;
  productsRenewed: number;
  lastCaptured: {
    id: string;
    status: string;
    sourceGroup: string | null;
    receivedAt: string;
    mediaCount: number;
    captionPreview: string;
  } | null;
  lastImportedAt: string | null;
  minutesSinceLastCapture: number | null;
  captureHealth: "ACTIVE" | "STALE" | "IDLE" | "NO_CAPTURE";
  sourceGroups: Array<{ name: string; count: number }>;
  captureCheckpoints: Array<{
    id: string;
    shopId: string;
    groupId: string;
    sourceGroup: string | null;
    lastFullyCapturedMessageId: string | null;
    lastFullyCapturedAt: string | null;
    lastScanStartedAt: string | null;
    lastScanCompletedAt: string | null;
    lastScanStatus: string;
    lastError: string | null;
    messagesScanned: number;
    productsCaptured: number;
    productsSkipped: number;
    productsFailed: number;
    updatedAt: string;
  }>;
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  customer: { name: string; phone: string };
}

const emptyProductForm = {
  name: "",
  description: "",
  basePrice: 0,
  stockQty: 0,
  category: "",
};

const SAMPLE_WHATSAPP_TEXT = `Fresh Milk 1L - R29.99 - Stock: 24 - Category: Dairy
Whole Wheat Bread R18.50 available 12

Organic Bananas 1kg
Price: R25
Qty: 30
Category: Produce
https://example.com/banana.jpg`;

const normalizeWhatsAppText = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ŘŔŖ]/g, "R")
    .replace(/[řŕŗ]/g, "r")
    .replace(/[ĚËÈÉÊ]/g, "E")
    .replace(/[ěëèéê]/g, "e")
    .replace(/[ÏÍÌÎ]/g, "I")
    .replace(/[ïíìî]/g, "i")
    .replace(/[ÅÄÁÀÂÃ]/g, "A")
    .replace(/[åäáàâã]/g, "a")
    .replace(/[ČĆĈĊ]/g, "C")
    .replace(/[čćĉċ]/g, "c")
    .replace(/[ŜŠŚ]/g, "S")
    .replace(/[ŝšś]/g, "s")
    .replace(/[ẄŴ]/g, "W")
    .replace(/[ẅŵ]/g, "w")
    .replace(/[Ť]/g, "T")
    .replace(/[ť]/g, "t")
    .replace(/[ĽŁ]/g, "L")
    .replace(/[ľł]/g, "l")
    .replace(/[ẒŽŹ]/g, "Z")
    .replace(/[ẓžź]/g, "z");

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-800",
  PAID: "bg-blue-100 text-blue-800",
  PROCESSING: "bg-purple-100 text-purple-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default function ShopOwnerDashboard() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<
    "products" | "whatsapp" | "orders"
  >("products");
  const [showProductForm, setShowProductForm] = useState(false);
  const [showWhatsAppImport, setShowWhatsAppImport] = useState(false);
  const [whatsAppText, setWhatsAppText] = useState("");
  const [parsedDrafts, setParsedDrafts] = useState<ProductDraft[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [queuedImports, setQueuedImports] = useState<WhatsAppImportItem[]>([]);
  const [captureStats, setCaptureStats] = useState<WhatsAppCaptureStats | null>(
    null,
  );
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<string, ProductDraft>
  >({});
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [enrichingImportIds, setEnrichingImportIds] = useState<string[]>([]);
  const [isBatchEnriching, setIsBatchEnriching] = useState(false);
  const [queueCaption, setQueueCaption] = useState("");
  const [queueMediaUrls, setQueueMediaUrls] = useState("");
  const [queueSourceGroup, setQueueSourceGroup] = useState("");
  const [captureMode, setCaptureMode] = useState<
    "since-last" | "range" | "recent"
  >("since-last");
  const [captureFrom, setCaptureFrom] = useState("");
  const [captureTo, setCaptureTo] = useState("");
  const [captureLimit, setCaptureLimit] = useState(500);
  const [captureMaxProducts, setCaptureMaxProducts] = useState(0);
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    DuplicateCandidate[]
  >([]);
  const [duplicateSummary, setDuplicateSummary] = useState<{
    total: number;
    fingerprintedProducts: number;
    activeProducts: number;
  } | null>(null);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [resolvingDuplicateId, setResolvingDuplicateId] = useState<
    string | null
  >(null);
  const { user, isReady } = useShopOwnerGuard();

  useEffect(() => {
    if (!isReady || !user) return;
    loadShops();
  }, [isReady]);

  useEffect(() => {
    if (selectedShop) {
      loadShopData(selectedShop.id);
    }
  }, [selectedShop, activeTab]);

  const loadShops = async () => {
    try {
      const res = await shopsApi.getMyShops();
      const data = res.data?.data || res.data || [];
      setShops(data);
      if (data.length > 0) setSelectedShop(data[0]);
    } catch {
      toast.error("Failed to load shops");
    }
  };

  const loadShopData = async (shopId: string) => {
    try {
      if (activeTab === "products") {
        const res = await productsApi.getByShop(shopId);
        setProducts(res.data?.data || res.data || []);
      } else if (activeTab === "whatsapp") {
        const queueRes = await whatsappImportsApi.getByShop(shopId, {
          limit: 100,
        });
        const imports = queueRes.data?.data || [];
        setQueuedImports(imports);
        setCaptureStats(buildLocalCaptureStats(imports));
        setReviewDrafts(
          imports.reduce(
            (acc: Record<string, ProductDraft>, item: WhatsAppImportItem) => ({
              ...acc,
              [item.id]: draftFromQueuedImport(item),
            }),
            {},
          ),
        );

        try {
          const statsRes = await whatsappImportsApi.getCaptureStats(shopId);
          setCaptureStats(statsRes.data);
        } catch {
          // The queue data is enough to keep the tracker useful.
        }
      } else {
        const res = await ordersApi.getByShop(shopId, { limit: 50 });
        setOrders(res.data?.data || res.data || []);
      }
    } catch {
      toast.error("Failed to load data");
    }
  };

  const loadDuplicateCandidates = async () => {
    if (!selectedShop) return;
    setLoadingDuplicates(true);
    try {
      const response = await productsApi.getDuplicateCandidates(
        selectedShop.id,
      );
      setDuplicateCandidates(response.data?.data || []);
      setDuplicateSummary({
        total: response.data?.total || 0,
        fingerprintedProducts: response.data?.fingerprintedProducts || 0,
        activeProducts: response.data?.activeProducts || 0,
      });
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Could not scan duplicate products",
      );
    } finally {
      setLoadingDuplicates(false);
    }
  };

  const handleMergeCandidate = async (
    candidate: DuplicateCandidate,
    keep: DuplicateCandidateProduct,
    remove: DuplicateCandidateProduct,
  ) => {
    if (!selectedShop) return;
    if (
      !window.confirm(
        `Keep “${keep.name}” and merge “${remove.name}” into it? The removed product will be deactivated.`,
      )
    )
      return;
    setResolvingDuplicateId(candidate.id);
    try {
      await productsApi.mergeDuplicate(selectedShop.id, keep.id, remove.id);
      toast.success("Products merged");
      await loadDuplicateCandidates();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Could not merge products");
    } finally {
      setResolvingDuplicateId(null);
    }
  };

  const handleDeleteCandidateProduct = async (
    candidate: DuplicateCandidate,
    product: DuplicateCandidateProduct,
  ) => {
    if (!selectedShop) return;
    if (
      !window.confirm(
        `Deactivate “${product.name}”? Existing order history will be preserved.`,
      )
    )
      return;
    setResolvingDuplicateId(candidate.id);
    try {
      await productsApi.delete(selectedShop.id, product.id);
      toast.success("Product deactivated");
      await loadDuplicateCandidates();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Could not deactivate product",
      );
    } finally {
      setResolvingDuplicateId(null);
    }
  };

  const handleKeepCandidateSeparate = async (candidate: DuplicateCandidate) => {
    if (!selectedShop) return;
    setResolvingDuplicateId(candidate.id);
    try {
      await productsApi.keepDuplicateSeparate(
        selectedShop.id,
        candidate.left.id,
        candidate.right.id,
      );
      setDuplicateCandidates((current) =>
        current.filter((item) => item.id !== candidate.id),
      );
      toast.success("Products marked as separate");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Could not save review");
    } finally {
      setResolvingDuplicateId(null);
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShop) return;
    setIsSubmitting(true);
    try {
      const payload = {
        name: productForm.name,
        description: productForm.description || undefined,
        basePrice: Number(productForm.basePrice),
        stockQty: Number(productForm.stockQty),
        category: productForm.category || undefined,
      };

      if (editingProduct) {
        await productsApi.update(selectedShop.id, editingProduct.id, payload);
        toast.success("Product updated");
      } else {
        await productsApi.create(selectedShop.id, payload);
        toast.success("Product created");
      }
      cancelProductForm();
      loadShopData(selectedShop.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save product");
    } finally {
      setIsSubmitting(false);
    }
  };

  const parseWhatsAppProducts = (text: string): ProductDraft[] => {
    const chunks = text
      .split(/\n\s*\n|(?=\n\s*[-•*]\s+)/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    return chunks
      .map((chunk) => {
        const normalized = normalizeWhatsAppText(chunk)
          .replace(/[🔥📦💰✅❌]/g, " ")
          .replace(/\r/g, "")
          .trim();

        const priceMatch =
          normalized.match(
            /(?:\b(?:R|ZAR|E|SZL)|\$)\s*(\d+(?:[.,]\d{1,2})?)/i,
          ) ||
          normalized.match(
            /(\d+(?:[.,]\d{1,2})?)\s*(?:rand|rands|emalangeni|lilangeni|each|only|ea)\b/i,
          ) ||
          normalized.match(
            /\b(?:price|now|sale|special|was|from)\D{0,12}(\d{2,5})(?:[.,]\d{1,2})?\b/i,
          ) ||
          normalized.match(
            /(?:^|\n|\s)(\d{2,5})(?:[.,]\d{1,2})?\s*(?:\/-|\.00)?(?:\s|$)/,
          );
        const stockMatch =
          normalized.match(
            /(?:stock|qty|quantity|available|units?)\D*(\d+)/i,
          ) || normalized.match(/(\d+)\s*(?:left|in stock|pcs|bags|boxes)/i);
        const categoryMatch = normalized.match(
          /(?:category|cat)\s*[:\-]\s*([^\n|]+)/i,
        );
        const images =
          normalized
            .match(/https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s]+)?/gi)
            ?.slice(0, 10) ?? [];

        const basePrice = priceMatch ? parseMoneyToken(priceMatch[1]) : 0;
        const stockQty = stockMatch ? Math.max(1, Number(stockMatch[1])) : 1;

        const lines = normalized
          .split("\n")
          .map((line) =>
            line
              .replace(/^[-•*]\s*/, "")
              .replace(/\*/g, "")
              .trim(),
          )
          .filter(Boolean);

        const nameSource =
          lines.find(
            (line) =>
              !/^(price|stock|qty|quantity|category|cat)\s*[:\-]/i.test(line) &&
              !/^\[WhatsApp media/i.test(line),
          ) ||
          lines[0] ||
          "";

        const name = nameSource
          .replace(/(?:\b(?:R|ZAR|E|SZL)|\$)\s*\d+(?:[.,]\d{1,2})?/gi, "")
          .replace(/\b(?:stock|qty|quantity|available)\D*\d+/gi, "")
          .replace(/\b\d+\s*(?:left|in stock|pcs|bags|boxes)\b/gi, "")
          .replace(/category\s*[:\-].*/i, "")
          .replace(/\s[-|]\s*/g, " ")
          .replace(/[-|]\s*$/g, "")
          .replace(/\s{2,}/g, " ")
          .trim();

        const category = categoryMatch?.[1]?.trim() || "";
        const description = lines
          .filter((line) => line !== nameSource)
          .map((line) => normalizeSpecialLine(line, basePrice))
          .join("\n")
          .slice(0, 500);

        return {
          name,
          description,
          basePrice,
          stockQty,
          category,
          images,
          raw: chunk,
        };
      })
      .filter((draft) => draft.name.length >= 3 && draft.basePrice > 0);
  };

  const parseMoneyToken = (value: string) => {
    const clean = String(value || "")
      .replace(/\s+/g, "")
      .replace(",", ".");
    if (!clean) return 0;
    if (clean.includes(".")) return Number(clean);

    const digits = clean.replace(/\D/g, "");
    if (digits.length >= 4) return Number(digits) / 100;
    return Number(digits);
  };

  const formatMoney = (value: number) => Number(value).toFixed(2);

  const normalizeSpecialLine = (line: string, basePrice: number) => {
    const match = line.match(
      /\b(\d+)\s*(?:for|x|@)\s*(?:(?:\b(?:R|ZAR|E|SZL)|\$)\s*)?(\d+(?:[.,]\d{1,2})?)\b/i,
    );
    const isSpecial = /\b(?:sale|bulk|special|promo|deal|discount)\b/i.test(
      line,
    );

    if (!match || !isSpecial) return line;

    const quantity = Number(match[1]);
    const specialUnitPrice = parseMoneyToken(match[2]);
    if (!quantity || !specialUnitPrice) return line;

    const savedEach = Math.max(0, basePrice - specialUnitPrice);
    const discountPercent =
      basePrice > 0 ? Math.round((savedEach / basePrice) * 100) : 0;
    const savings =
      savedEach > 0
        ? ` (save R ${formatMoney(savedEach)} each${
            discountPercent > 0 ? `, ${discountPercent}% off` : ""
          })`
        : "";

    return `Sale/Bulk special: ${quantity} for/@ R ${formatMoney(
      specialUnitPrice,
    )} each${savings}.`;
  };

  const handleParseWhatsAppText = () => {
    const drafts = parseWhatsAppProducts(whatsAppText);
    setParsedDrafts(drafts);

    if (drafts.length === 0) {
      toast.error("No product prices found in the WhatsApp text");
    } else {
      toast.success(
        `${drafts.length} product draft${drafts.length === 1 ? "" : "s"} parsed`,
      );
    }
  };

  const updateDraft = (
    index: number,
    field: keyof Omit<ProductDraft, "raw">,
    value: string | number | string[],
  ) => {
    setParsedDrafts((drafts) =>
      drafts.map((draft, i) =>
        i === index ? { ...draft, [field]: value } : draft,
      ),
    );
  };

  const draftFromQueuedImport = (item: WhatsAppImportItem): ProductDraft => ({
    name: item.parsedDraft?.name || "",
    description: item.parsedDraft?.description || "",
    basePrice: Number(item.parsedDraft?.basePrice || 0),
    stockQty: Number(item.parsedDraft?.stockQty || 1),
    category: item.parsedDraft?.category || "",
    images: item.parsedDraft?.images || item.mediaUrls || [],
    raw: item.parsedDraft?.raw,
    sourceText: item.parsedDraft?.sourceText || item.caption,
    aiConfidence: item.parsedDraft?.aiConfidence,
    aiSource: item.parsedDraft?.aiSource,
    aiTags: item.parsedDraft?.aiTags,
    colors: item.parsedDraft?.colors,
    sizes: item.parsedDraft?.sizes,
  });

  function buildLocalCaptureStats(
    imports: WhatsAppImportItem[],
  ): WhatsAppCaptureStats {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const byStatus = imports.reduce((acc: Record<string, number>, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    const recent = imports.filter(
      (item) => new Date(item.receivedAt).getTime() >= oneDayAgo,
    );
    const lastCaptured =
      [...imports].sort(
        (left, right) =>
          new Date(right.receivedAt).getTime() -
          new Date(left.receivedAt).getTime(),
      )[0] || null;
    const sourceGroupCounts = recent.reduce(
      (acc: Record<string, number>, item) => {
        const name = item.sourceGroup || "Unknown source";
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      },
      {},
    );
    const recentWithMedia = recent.filter(
      (item) => (item.mediaUrls || []).length > 0,
    ).length;
    const recentMediaCount = recent.reduce(
      (count, item) => count + (item.mediaUrls || []).length,
      0,
    );
    const minutesSinceLastCapture = lastCaptured
      ? Math.floor((now - new Date(lastCaptured.receivedAt).getTime()) / 60000)
      : null;
    const captureHealth =
      minutesSinceLastCapture === null
        ? "NO_CAPTURE"
        : minutesSinceLastCapture <= 30
          ? "ACTIVE"
          : minutesSinceLastCapture <= 360
            ? "STALE"
            : "IDLE";

    return {
      total: imports.length,
      byStatus,
      pendingReview: (byStatus.PARSED || 0) + (byStatus.NEEDS_REVIEW || 0),
      capturedLastHour: imports.filter(
        (item) => new Date(item.receivedAt).getTime() >= oneHourAgo,
      ).length,
      capturedLastDay: recent.length,
      recentMediaCount,
      recentWithMedia,
      mediaCoverage:
        recent.length > 0
          ? Math.round((recentWithMedia / recent.length) * 100)
          : 0,
      duplicatesPrevented: imports.filter(
        (item) => item.resolutionOutcome === "DUPLICATE",
      ).length,
      productsRenewed: imports.filter(
        (item) => item.resolutionOutcome === "RENEWED",
      ).length,
      lastCaptured: lastCaptured
        ? {
            id: lastCaptured.id,
            status: lastCaptured.status,
            sourceGroup: lastCaptured.sourceGroup,
            receivedAt: lastCaptured.receivedAt,
            mediaCount: (lastCaptured.mediaUrls || []).length,
            captionPreview: lastCaptured.caption.slice(0, 160),
          }
        : null,
      lastImportedAt: null,
      minutesSinceLastCapture,
      captureHealth,
      sourceGroups: Object.entries(sourceGroupCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
      captureCheckpoints: [],
    };
  }

  const updateReviewDraft = (
    importId: string,
    field: keyof Omit<ProductDraft, "raw" | "sourceText">,
    value: string | number | string[],
  ) => {
    setReviewDrafts((drafts) => ({
      ...drafts,
      [importId]: {
        ...(drafts[importId] || {
          name: "",
          description: "",
          basePrice: 0,
          stockQty: 1,
          category: "",
          images: [],
        }),
        [field]: value,
      },
    }));
  };

  const saveQueuedDraft = async (
    item: WhatsAppImportItem,
    status: "PARSED" | "NEEDS_REVIEW" | "IGNORED" = "PARSED",
  ) => {
    if (!selectedShop) return null;
    const draft = reviewDrafts[item.id] || draftFromQueuedImport(item);

    return whatsappImportsApi.update(selectedShop.id, item.id, {
      status,
      parsedDraft:
        status === "IGNORED"
          ? undefined
          : {
              name: draft.name.trim(),
              description: draft.description || undefined,
              basePrice: Number(draft.basePrice),
              stockQty: Math.max(1, Number(draft.stockQty)),
              category: draft.category || undefined,
              images: draft.images,
            },
    });
  };

  const handleSaveQueuedDraft = async (item: WhatsAppImportItem) => {
    try {
      await saveQueuedDraft(item);
      toast.success("Draft saved");
      if (selectedShop) loadShopData(selectedShop.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save draft");
    }
  };

  const handleEnrichQueuedPost = async (item: WhatsAppImportItem) => {
    if (!selectedShop) return;

    setEnrichingImportIds((ids) => [...ids, item.id]);

    try {
      const response = await whatsappImportsApi.enrich(
        selectedShop.id,
        item.id,
      );
      const enriched = response.data as WhatsAppImportItem;
      const nextDraft = draftFromQueuedImport(enriched);

      setReviewDrafts((drafts) => ({
        ...drafts,
        [item.id]: nextDraft,
      }));
      setQueuedImports((imports) =>
        imports.map((queued) => (queued.id === item.id ? enriched : queued)),
      );
      toast.success("AI suggestions added");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "AI enrichment failed");
    } finally {
      setEnrichingImportIds((ids) => ids.filter((id) => id !== item.id));
    }
  };

  const handleEnrichSelectedPosts = async () => {
    if (!selectedShop) return;

    const enrichableIds = selectedImportIds.filter((id) => {
      const item = queuedImports.find((queued) => queued.id === id);
      if (!item || item.status === "IMPORTED" || item.status === "IGNORED") {
        return false;
      }

      const draft = reviewDrafts[item.id] || draftFromQueuedImport(item);
      return draft.images.length > 0;
    });

    if (enrichableIds.length === 0) {
      toast.error("Select queued posts with captured images first");
      return;
    }

    setIsBatchEnriching(true);
    setEnrichingImportIds((ids) => [...new Set([...ids, ...enrichableIds])]);

    try {
      const response = await whatsappImportsApi.enrichSelected(
        selectedShop.id,
        enrichableIds,
      );
      const enrichedItems = (response.data.results ||
        []) as WhatsAppImportItem[];
      const failedItems = response.data.failed || [];
      const enrichedById = new Map(
        enrichedItems.map((item) => [item.id, item]),
      );

      setQueuedImports((imports) =>
        imports.map((item) => enrichedById.get(item.id) || item),
      );
      setReviewDrafts((drafts) => ({
        ...drafts,
        ...Object.fromEntries(
          enrichedItems.map((item) => [item.id, draftFromQueuedImport(item)]),
        ),
      }));

      if (enrichedItems.length > 0) {
        toast.success(`AI enriched ${enrichedItems.length} post(s)`);
      }

      if (failedItems.length > 0) {
        toast.error(`${failedItems.length} post(s) could not be enriched`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "AI enrichment failed");
    } finally {
      setIsBatchEnriching(false);
      setEnrichingImportIds((ids) =>
        ids.filter((id) => !enrichableIds.includes(id)),
      );
    }
  };

  const handleIgnoreQueuedPost = async (item: WhatsAppImportItem) => {
    if (!confirm("Ignore this WhatsApp post?")) return;

    try {
      await saveQueuedDraft(item, "IGNORED");
      toast.success("Post ignored");
      setSelectedImportIds((ids) => ids.filter((id) => id !== item.id));
      if (selectedShop) loadShopData(selectedShop.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to ignore post");
    }
  };

  const handleApproveQueuedPost = async (item: WhatsAppImportItem) => {
    if (!selectedShop) return;
    setIsImporting(true);

    try {
      await saveQueuedDraft(item);
      const response = await whatsappImportsApi.importSelected(
        selectedShop.id,
        [item.id],
      );
      toast.success(
        `Imported ${response.data.created} new, updated ${response.data.updated}`,
      );
      setSelectedImportIds((ids) => ids.filter((id) => id !== item.id));
      loadShopData(selectedShop.id);
      setActiveTab("products");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to approve post");
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportDrafts = async () => {
    if (!selectedShop || parsedDrafts.length === 0) return;

    setIsImporting(true);
    try {
      const response = await productsApi.importWhatsApp(
        selectedShop.id,
        parsedDrafts.map((draft) => ({
          name: draft.name.trim(),
          description: draft.description || undefined,
          basePrice: Number(draft.basePrice),
          stockQty: Math.max(1, Number(draft.stockQty)),
          category: draft.category || undefined,
          images: draft.images,
          sourceText: draft.raw,
        })),
      );

      toast.success(
        `Imported ${response.data.created} new, updated ${response.data.updated}`,
      );
      setWhatsAppText("");
      setParsedDrafts([]);
      setShowWhatsAppImport(false);
      loadShopData(selectedShop.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to import products");
    } finally {
      setIsImporting(false);
    }
  };

  const handleQueueWhatsAppPost = async () => {
    if (!selectedShop || !queueCaption.trim()) return;

    try {
      await whatsappImportsApi.ingest(selectedShop.id, {
        caption: queueCaption,
        sourceGroup: queueSourceGroup || undefined,
        mediaUrls: queueMediaUrls
          .split("\n")
          .map((url) => url.trim())
          .filter(Boolean),
      });
      toast.success("WhatsApp post queued");
      setQueueCaption("");
      setQueueMediaUrls("");
      setQueueSourceGroup("");
      loadShopData(selectedShop.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to queue post");
    }
  };

  const handleImportQueuedPosts = async () => {
    if (!selectedShop || selectedImportIds.length === 0) return;
    setIsImporting(true);

    try {
      const selectedItems = queuedImports.filter((item) =>
        selectedImportIds.includes(item.id),
      );

      await Promise.all(selectedItems.map((item) => saveQueuedDraft(item)));

      const response = await whatsappImportsApi.importSelected(
        selectedShop.id,
        selectedImportIds,
      );
      toast.success(
        `Imported ${response.data.created} new, updated ${response.data.updated}`,
      );
      setSelectedImportIds([]);
      loadShopData(selectedShop.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to import queue");
    } finally {
      setIsImporting(false);
    }
  };

  const handleEditProduct = (product: Product) => {
    setProductForm({
      name: product.name,
      description: product.description || "",
      basePrice: product.basePrice,
      stockQty: product.stockQty,
      category: product.category || "",
    });
    setEditingProduct(product);
    setShowProductForm(true);
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!selectedShop || !confirm(`Delete "${product.name}"?`)) return;
    try {
      await productsApi.delete(selectedShop.id, product.id);
      toast.success("Product deleted");
      loadShopData(selectedShop.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete product");
    }
  };

  const cancelProductForm = () => {
    setShowProductForm(false);
    setEditingProduct(null);
    setProductForm(emptyProductForm);
  };

  const selectedEnrichableCount = selectedImportIds.filter((id) => {
    const item = queuedImports.find((queued) => queued.id === id);
    if (!item || item.status === "IMPORTED" || item.status === "IGNORED") {
      return false;
    }

    const draft = reviewDrafts[item.id] || draftFromQueuedImport(item);
    return draft.images.length > 0;
  }).length;

  const captureHealthStyle: Record<
    WhatsAppCaptureStats["captureHealth"],
    string
  > = {
    ACTIVE: "bg-green-100 text-green-800",
    STALE: "bg-yellow-100 text-yellow-800",
    IDLE: "bg-gray-100 text-gray-800",
    NO_CAPTURE: "bg-gray-100 text-gray-800",
  };

  const captureHealthLabel: Record<
    WhatsAppCaptureStats["captureHealth"],
    string
  > = {
    ACTIVE: "Active",
    STALE: "Stale",
    IDLE: "Idle",
    NO_CAPTURE: "No capture yet",
  };

  const formatCaptureAge = (minutes: number | null) => {
    if (minutes === null) return "No posts captured";
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

  const formatDateTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString() : "Not recorded";

  const checkpointStatusClass = (status?: string | null) => {
    const normalized = String(status || "NEVER_RUN").toUpperCase();
    if (normalized === "COMPLETED") return "bg-green-100 text-green-800";
    if (normalized === "SCANNING") return "bg-blue-100 text-blue-800";
    if (normalized === "PARTIAL") return "bg-yellow-100 text-yellow-800";
    if (normalized === "FAILED") return "bg-red-100 text-red-800";
    return "bg-gray-100 text-gray-700";
  };

  const captureCommand = (() => {
    const flags = ["npm run whatsapp:session:backfill", "--"];

    if (captureMode === "since-last") {
      flags.push("--since-last-capture");
    }

    if (captureMode === "range") {
      if (captureFrom) flags.push(`--from=${captureFrom}`);
      if (captureTo) flags.push(`--to=${captureTo}`);
    }

    flags.push(`--limit=${Math.max(1, Number(captureLimit) || 500)}`);

    if (Number(captureMaxProducts) > 0) {
      flags.push(`--max-products=${Number(captureMaxProducts)}`);
    }

    return `cd C:\\Dev\\runnercommercequen35plus\\backend; ${flags.join(" ")}`;
  })();

  const handleCopyCaptureCommand = async () => {
    try {
      await navigator.clipboard.writeText(captureCommand);
      toast.success("Capture command copied");
    } catch {
      toast.error("Could not copy command");
    }
  };

  const totalRevenue = orders
    .filter((o) => o.status === "COMPLETED")
    .reduce((sum, o) => sum + o.totalAmount, 0);

  if (!isReady) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (shops.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <Store className="w-16 h-16 mx-auto text-gray-300" />
          <h3 className="mt-4 text-xl font-semibold text-gray-700">
            No shops yet
          </h3>
          <p className="mt-2 text-gray-500">You don't own any shops.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Shop Owner Dashboard</h1>

      {/* Shop Selector */}
      {shops.length > 1 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {shops.map((shop) => (
            <button
              key={shop.id}
              onClick={() => setSelectedShop(shop)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedShop?.id === shop.id
                  ? "bg-primary text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              <span className="flex items-center gap-2">
                <ShopWhatsAppAvatars
                  shopName={shop.name}
                  groups={shop.relatedWhatsAppGroups}
                  size="sm"
                  showLabel={false}
                />
                <span>{shop.name}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedShop && (
        <>
          {/* Shop Info */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold">{selectedShop.name}</h2>
                <ShopWhatsAppAvatars
                  shopName={selectedShop.name}
                  groups={selectedShop.relatedWhatsAppGroups}
                  max={5}
                  variant="buttons"
                  showLabel
                  className="mt-3"
                />
                {selectedShop.description && (
                  <p className="text-gray-600 mt-1">
                    {selectedShop.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
                  {selectedShop.address && (
                    <span>📍 {selectedShop.address}</span>
                  )}
                  <span>📞 {selectedShop.phone}</span>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  STATUS_COLORS[selectedShop.status] ||
                  "bg-gray-100 text-gray-800"
                }`}
              >
                {selectedShop.status}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-md p-5 flex items-center gap-4">
              <div className="bg-blue-500 text-white p-3 rounded-lg">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="text-gray-500 text-sm">Products</p>
                <p className="text-2xl font-bold">{products.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-5 flex items-center gap-4">
              <div className="bg-purple-500 text-white p-3 rounded-lg">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <div>
                <p className="text-gray-500 text-sm">Total Orders</p>
                <p className="text-2xl font-bold">{orders.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-5 flex items-center gap-4">
              <div className="bg-green-500 text-white p-3 rounded-lg">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-gray-500 text-sm">Revenue (Completed)</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(totalRevenue)}
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 border-b mb-6">
            <button
              onClick={() => setActiveTab("products")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "products"
                  ? "border-b-2 border-primary text-primary"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Products
            </button>
            <button
              onClick={() => setActiveTab("whatsapp")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "whatsapp"
                  ? "border-b-2 border-primary text-primary"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              WhatsApp Queue
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "orders"
                  ? "border-b-2 border-primary text-primary"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Orders
            </button>
          </div>

          {/* Products Tab */}
          {activeTab === "products" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Products</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowWhatsAppImport((open) => !open)}
                    className="border px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp Import
                  </button>
                  {!showProductForm && (
                    <button
                      onClick={() => setShowProductForm(true)}
                      className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Product
                    </button>
                  )}
                </div>
              </div>

              {showWhatsAppImport && (
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-bold">
                        Import from WhatsApp Posts
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Paste product messages from your shop WhatsApp group,
                        review the drafts, then sync them to this shop.
                      </p>
                    </div>
                    <button onClick={() => setShowWhatsAppImport(false)}>
                      <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                    </button>
                  </div>

                  <textarea
                    value={whatsAppText}
                    onChange={(e) => setWhatsAppText(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    rows={8}
                    placeholder={SAMPLE_WHATSAPP_TEXT}
                  />

                  <div className="flex flex-wrap gap-2 justify-end mt-3">
                    <button
                      type="button"
                      onClick={() => setWhatsAppText(SAMPLE_WHATSAPP_TEXT)}
                      className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
                    >
                      Use sample
                    </button>
                    <button
                      type="button"
                      onClick={handleParseWhatsAppText}
                      className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary/90 text-sm"
                    >
                      Parse Products
                    </button>
                  </div>

                  {parsedDrafts.length > 0 && (
                    <div className="mt-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">Review Drafts</h4>
                        <button
                          type="button"
                          onClick={handleImportDrafts}
                          disabled={isImporting}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                        >
                          <Upload className="w-4 h-4" />
                          {isImporting ? "Syncing..." : "Sync to Products"}
                        </button>
                      </div>

                      {parsedDrafts.map((draft, index) => (
                        <div
                          key={`${draft.name}-${index}`}
                          className="grid grid-cols-1 md:grid-cols-12 gap-3 border rounded-lg p-3"
                        >
                          <input
                            value={draft.name}
                            onChange={(e) =>
                              updateDraft(index, "name", e.target.value)
                            }
                            className="md:col-span-4 border rounded px-3 py-2 text-sm"
                            placeholder="Product name"
                          />
                          <input
                            type="number"
                            value={draft.basePrice}
                            onChange={(e) =>
                              updateDraft(
                                index,
                                "basePrice",
                                Number(e.target.value),
                              )
                            }
                            className="md:col-span-2 border rounded px-3 py-2 text-sm"
                            min="0"
                            step="0.01"
                            placeholder="Price"
                          />
                          <input
                            type="number"
                            value={draft.stockQty}
                            onChange={(e) =>
                              updateDraft(
                                index,
                                "stockQty",
                                Number(e.target.value),
                              )
                            }
                            className="md:col-span-2 border rounded px-3 py-2 text-sm"
                            min="1"
                            placeholder="Stock"
                          />
                          <input
                            value={draft.category}
                            onChange={(e) =>
                              updateDraft(index, "category", e.target.value)
                            }
                            className="md:col-span-4 border rounded px-3 py-2 text-sm"
                            placeholder="Category"
                          />
                          <input
                            value={draft.images.join(", ")}
                            onChange={(e) =>
                              updateDraft(
                                index,
                                "images",
                                e.target.value
                                  .split(",")
                                  .map((url) => url.trim())
                                  .filter(Boolean),
                              )
                            }
                            className="md:col-span-12 border rounded px-3 py-2 text-sm"
                            placeholder="Image URLs, comma separated"
                          />
                          <textarea
                            value={draft.description}
                            onChange={(e) =>
                              updateDraft(index, "description", e.target.value)
                            }
                            className="md:col-span-12 border rounded px-3 py-2 text-sm"
                            rows={2}
                            placeholder="Description"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Product Form */}
              {showProductForm && (
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">
                      {editingProduct ? "Edit Product" : "New Product"}
                    </h3>
                    <button onClick={cancelProductForm}>
                      <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                    </button>
                  </div>
                  <form
                    onSubmit={handleProductSubmit}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">
                        Product Name *
                      </label>
                      <input
                        type="text"
                        value={productForm.name}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            name: e.target.value,
                          })
                        }
                        className="w-full border rounded-lg px-3 py-2"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">
                        Description
                      </label>
                      <textarea
                        value={productForm.description}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            description: e.target.value,
                          })
                        }
                        className="w-full border rounded-lg px-3 py-2"
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Base Price (R) *
                      </label>
                      <input
                        type="number"
                        value={productForm.basePrice}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            basePrice: Number(e.target.value),
                          })
                        }
                        className="w-full border rounded-lg px-3 py-2"
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Stock Quantity *
                      </label>
                      <input
                        type="number"
                        value={productForm.stockQty}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            stockQty: Number(e.target.value),
                          })
                        }
                        className="w-full border rounded-lg px-3 py-2"
                        min="0"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Category
                      </label>
                      <input
                        type="text"
                        value={productForm.category}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            category: e.target.value,
                          })
                        }
                        className="w-full border rounded-lg px-3 py-2"
                        placeholder="e.g. Electronics, Food"
                      />
                    </div>
                    <div className="md:col-span-2 flex gap-3 justify-end">
                      <button
                        type="button"
                        onClick={cancelProductForm}
                        className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-primary text-white px-6 py-2 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        {isSubmitting
                          ? "Saving..."
                          : editingProduct
                            ? "Update"
                            : "Create"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Products Grid */}
              {products.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg shadow-md">
                  <Package className="w-12 h-12 mx-auto text-gray-300" />
                  <p className="mt-4 text-gray-500">
                    No products yet. Add your first product!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="bg-white rounded-lg shadow-md p-4"
                    >
                      {product.images?.[0] && (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="w-full h-32 object-cover rounded-lg mb-3"
                        />
                      )}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold">{product.name}</h3>
                          {product.category && (
                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded mt-1 inline-block">
                              {product.category}
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ml-2 ${
                            STATUS_COLORS[product.status] ||
                            "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {product.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div>
                          <span className="text-primary font-bold text-lg">
                            {formatCurrency(product.basePrice)}
                          </span>
                          <span className="text-xs text-gray-500 ml-2">
                            Stock: {product.stockQty}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "whatsapp" && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-2">
                  WhatsApp Product Queue
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Incoming WhatsApp group products land here for review before
                  they become shop products. The session bridge pairs image
                  bursts with the next priced description and saves the captured
                  media for approval.
                </p>

                {captureStats && (
                  <div className="border rounded-lg p-4 mb-5 bg-gray-50">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold">Capture Tracking</h3>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          captureHealthStyle[captureStats.captureHealth]
                        }`}
                      >
                        {captureHealthLabel[captureStats.captureHealth]}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      <div>
                        <p className="text-xs text-gray-500">Captured today</p>
                        <p className="text-xl font-bold">
                          {captureStats.capturedLastDay}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Last hour</p>
                        <p className="text-xl font-bold">
                          {captureStats.capturedLastHour}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Needs action</p>
                        <p className="text-xl font-bold">
                          {captureStats.pendingReview}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Media coverage</p>
                        <p className="text-xl font-bold">
                          {captureStats.mediaCoverage}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">
                          Duplicates stopped
                        </p>
                        <p className="text-xl font-bold">
                          {captureStats.duplicatesPrevented}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Renewed</p>
                        <p className="text-xl font-bold">
                          {captureStats.productsRenewed}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 text-sm">
                      <div className="lg:col-span-2 flex items-start gap-2">
                        <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="font-medium">
                            Last captured{" "}
                            {formatCaptureAge(
                              captureStats.minutesSinceLastCapture,
                            )}
                          </p>
                          {captureStats.lastCaptured ? (
                            <p className="text-gray-500 line-clamp-2">
                              {captureStats.lastCaptured.sourceGroup ||
                                "Unknown source"}{" "}
                              · {captureStats.lastCaptured.status} ·{" "}
                              {captureStats.lastCaptured.mediaCount} image
                              {captureStats.lastCaptured.mediaCount === 1
                                ? ""
                                : "s"}{" "}
                              · {captureStats.lastCaptured.captionPreview}
                            </p>
                          ) : (
                            <p className="text-gray-500">
                              No WhatsApp posts have been captured yet.
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="font-medium mb-1">Top sources today</p>
                        {captureStats.sourceGroups.length > 0 ? (
                          <div className="space-y-1">
                            {captureStats.sourceGroups.map((source) => (
                              <div
                                key={source.name}
                                className="flex justify-between gap-3 text-gray-600"
                              >
                                <span className="truncate">{source.name}</span>
                                <span className="font-medium">
                                  {source.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500">No source activity.</p>
                        )}
                      </div>
                    </div>

                    {captureStats.captureCheckpoints.length > 0 && (
                      <div className="mt-5 border-t pt-4">
                        <div className="mb-3">
                          <p className="font-semibold">Capture checkpoints</p>
                          <p className="text-xs text-gray-500">
                            Each WhatsApp source group resumes from its last
                            safe captured item. Failed scans keep the previous
                            safe marker so the next run can retry.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                          {captureStats.captureCheckpoints.map((checkpoint) => (
                            <div
                              key={`${checkpoint.shopId}:${checkpoint.groupId}`}
                              className="rounded-lg border bg-white p-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">
                                    {checkpoint.sourceGroup ||
                                      "Unknown source group"}
                                  </p>
                                  <p className="break-all text-[11px] text-gray-500">
                                    {checkpoint.groupId}
                                  </p>
                                </div>
                                <span
                                  className={`rounded-full px-2 py-1 text-xs font-semibold ${checkpointStatusClass(
                                    checkpoint.lastScanStatus,
                                  )}`}
                                >
                                  {checkpoint.lastScanStatus.replace("_", " ")}
                                </span>
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                                <ShopCheckpointFact
                                  label="Last safe captured"
                                  value={formatDateTime(
                                    checkpoint.lastFullyCapturedAt,
                                  )}
                                />
                                <ShopCheckpointFact
                                  label="Scan completed"
                                  value={formatDateTime(
                                    checkpoint.lastScanCompletedAt,
                                  )}
                                />
                                <ShopCheckpointFact
                                  label="Scan started"
                                  value={formatDateTime(
                                    checkpoint.lastScanStartedAt,
                                  )}
                                />
                                <ShopCheckpointFact
                                  label="Updated"
                                  value={formatDateTime(checkpoint.updatedAt)}
                                />
                                <ShopCheckpointFact
                                  label="Last run"
                                  value={`${
                                    checkpoint.messagesScanned || 0
                                  } scanned · ${
                                    checkpoint.productsCaptured || 0
                                  } captured · ${
                                    checkpoint.productsSkipped || 0
                                  } skipped · ${
                                    checkpoint.productsFailed || 0
                                  } failed`}
                                  wide
                                />
                                <ShopCheckpointFact
                                  label="Safe message id"
                                  value={
                                    checkpoint.lastFullyCapturedMessageId ||
                                    "Not set"
                                  }
                                  wide
                                  mono
                                />
                                {checkpoint.lastError && (
                                  <ShopCheckpointFact
                                    label="Last error"
                                    value={checkpoint.lastError}
                                    wide
                                    danger
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="border rounded-lg p-4 mb-5 bg-amber-50/40">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <GitCompareArrows className="w-5 h-5 text-amber-700" />
                      <div>
                        <h3 className="font-semibold">
                          Duplicate & capture grouping review
                        </h3>
                        <p className="text-xs text-gray-500">
                          Review matching fingerprints and images reused across
                          captured products.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={loadDuplicateCandidates}
                      disabled={loadingDuplicates}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                    >
                      {loadingDuplicates ? "Scanning…" : "Scan duplicates"}
                    </button>
                  </div>

                  {duplicateSummary && (
                    <p className="mt-3 text-xs text-gray-600">
                      {duplicateSummary.total} candidate pair
                      {duplicateSummary.total === 1 ? "" : "s"} ·{" "}
                      {duplicateSummary.fingerprintedProducts} of{" "}
                      {duplicateSummary.activeProducts} products fingerprinted
                    </p>
                  )}

                  {duplicateCandidates.length > 0 && (
                    <div className="mt-4 space-y-4">
                      {duplicateCandidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          className="rounded-lg border bg-white p-4"
                        >
                          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`rounded-full px-2 py-1 font-semibold ${candidate.captureGroupingWarning ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                            >
                              {candidate.captureGroupingWarning
                                ? "Possible capture grouping error"
                                : "Likely duplicate"}
                            </span>
                            <span className="text-gray-500">
                              {candidate.reason.replaceAll("_", " ")} ·{" "}
                              {Math.round(candidate.confidence * 100)}%
                              {candidate.distance !== null
                                ? ` · distance ${candidate.distance}`
                                : ""}
                            </span>
                            <button
                              type="button"
                              disabled={resolvingDuplicateId === candidate.id}
                              onClick={() =>
                                handleKeepCandidateSeparate(candidate)
                              }
                              className="ml-auto rounded border border-green-300 bg-green-50 px-2 py-1 font-semibold text-green-800 disabled:opacity-50"
                            >
                              Keep each
                            </button>
                          </div>
                          <div className="grid gap-4 lg:grid-cols-2">
                            {[candidate.left, candidate.right].map(
                              (product, index) => {
                                const other =
                                  index === 0
                                    ? candidate.right
                                    : candidate.left;
                                return (
                                  <div
                                    key={product.id}
                                    className="rounded-lg border p-3"
                                  >
                                    <div className="flex gap-3">
                                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded bg-gray-100">
                                        {product.images[0] ? (
                                          <img
                                            src={product.images[0]}
                                            alt={product.name}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <Package className="m-6 h-8 w-8 text-gray-300" />
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="font-semibold break-words">
                                          {product.name}
                                        </p>
                                        <p className="text-sm text-gray-600">
                                          {formatCurrency(product.basePrice)} ·
                                          stock {product.stockQty}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {product._count.listings} listing(s) ·{" "}
                                          {product._count.orderItems} order
                                          item(s)
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleEditProduct(product)
                                        }
                                        className="rounded border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          resolvingDuplicateId === candidate.id
                                        }
                                        onClick={() =>
                                          handleDeleteCandidateProduct(
                                            candidate,
                                            product,
                                          )
                                        }
                                        className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                      >
                                        Delete this
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          resolvingDuplicateId === candidate.id
                                        }
                                        onClick={() =>
                                          handleMergeCandidate(
                                            candidate,
                                            product,
                                            other,
                                          )
                                        }
                                        className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                                      >
                                        Keep this & merge other
                                      </button>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {duplicateSummary &&
                    duplicateCandidates.length === 0 &&
                    !loadingDuplicates && (
                      <p className="mt-4 rounded-lg bg-white p-3 text-sm text-gray-500">
                        No duplicate candidates found.
                      </p>
                    )}
                </div>

                <div className="border rounded-lg p-4 mb-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">Capture Control</h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCaptureCommand}
                      className="inline-flex items-center gap-2 border border-gray-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                    >
                      <Copy className="w-4 h-4" />
                      Copy command
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Capture mode
                      </label>
                      <select
                        value={captureMode}
                        onChange={(e) =>
                          setCaptureMode(
                            e.target.value as "since-last" | "range" | "recent",
                          )
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        <option value="since-last">From last capture</option>
                        <option value="range">Date and time range</option>
                        <option value="recent">Recent messages</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Scan messages
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={captureLimit}
                        onChange={(e) =>
                          setCaptureLimit(Number(e.target.value))
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Max products
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={captureMaxProducts}
                        onChange={(e) =>
                          setCaptureMaxProducts(Number(e.target.value))
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="0 = no cap"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Shop
                      </label>
                      <input
                        value={selectedShop?.name || ""}
                        disabled
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
                      />
                    </div>
                  </div>

                  {captureMode === "range" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          From
                        </label>
                        <input
                          type="datetime-local"
                          value={captureFrom}
                          onChange={(e) => setCaptureFrom(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          To
                        </label>
                        <input
                          type="datetime-local"
                          value={captureTo}
                          onChange={(e) => setCaptureTo(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-100">
                    {captureCommand}
                  </pre>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Source group
                    </label>
                    <input
                      value={queueSourceGroup}
                      onChange={(e) => setQueueSourceGroup(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="e.g. Maria Daily Specials"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Media URLs
                    </label>
                    <textarea
                      value={queueMediaUrls}
                      onChange={(e) => setQueueMediaUrls(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2"
                      rows={2}
                      placeholder="One image URL per line"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">
                      Caption / product message
                    </label>
                    <textarea
                      value={queueCaption}
                      onChange={(e) => setQueueCaption(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2"
                      rows={4}
                      placeholder="Fresh Milk 1L - R29.99 - Stock: 24 - Category: Dairy"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-3">
                  <button
                    onClick={handleQueueWhatsAppPost}
                    className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary/90"
                  >
                    Queue Post
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-bold">Queued Posts</h3>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={handleEnrichSelectedPosts}
                      disabled={
                        selectedEnrichableCount === 0 || isBatchEnriching
                      }
                      className="inline-flex items-center gap-2 border border-purple-300 text-purple-700 px-4 py-2 rounded-lg font-medium hover:bg-purple-50 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      {isBatchEnriching
                        ? "Enriching..."
                        : `AI Enrich Selected (${selectedEnrichableCount})`}
                    </button>
                    <button
                      onClick={handleImportQueuedPosts}
                      disabled={selectedImportIds.length === 0 || isImporting}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {isImporting
                        ? "Importing..."
                        : `Import Selected (${selectedImportIds.length})`}
                    </button>
                  </div>
                </div>

                {queuedImports.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No WhatsApp posts queued.
                  </div>
                ) : (
                  <div className="divide-y">
                    {queuedImports.map((item) => {
                      const draft =
                        reviewDrafts[item.id] || draftFromQueuedImport(item);
                      const checked = selectedImportIds.includes(item.id);
                      const canImport = ![
                        "IMPORTED",
                        "IGNORED",
                        "DUPLICATE",
                        "RENEWED",
                      ].includes(item.status);

                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-[auto_1fr] gap-3 p-4 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canImport}
                            onChange={(e) =>
                              setSelectedImportIds((ids) =>
                                e.target.checked
                                  ? [...ids, item.id]
                                  : ids.filter((id) => id !== item.id),
                              )
                            }
                            className="mt-1"
                          />
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">
                                {draft.name || "Needs review"}
                              </span>
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                {item.status}
                              </span>
                              {(item.status === "DUPLICATE" ||
                                item.status === "RENEWED") && (
                                <span
                                  className={`text-xs px-2 py-0.5 rounded ${item.status === "RENEWED" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
                                >
                                  {item.status === "RENEWED"
                                    ? "Existing product renewed"
                                    : "Duplicate prevented"}
                                </span>
                              )}
                              {item.sourceGroup && (
                                <span className="text-xs text-gray-500">
                                  {item.sourceGroup}
                                </span>
                              )}
                              {item.senderPhone && (
                                <span className="text-xs text-gray-500">
                                  {item.senderPhone}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {new Date(item.receivedAt).toLocaleString()}
                              {item.messageId ? ` · ${item.messageId}` : ""}
                            </div>
                            {(item.status === "DUPLICATE" ||
                              item.status === "RENEWED") && (
                              <p className="text-xs text-gray-600">
                                Matched{" "}
                                {item.product?.name || "existing product"}
                                {item.matchReason
                                  ? ` · ${item.matchReason.replaceAll("_", " ")}`
                                  : ""}
                                {typeof item.matchConfidence === "number"
                                  ? ` · ${Math.round(item.matchConfidence * 100)}% confidence`
                                  : ""}
                                {typeof item.matchAgeDays === "number"
                                  ? ` · ${item.matchAgeDays.toFixed(1)} days old`
                                  : ""}
                              </p>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Product name
                                </label>
                                <input
                                  value={draft.name}
                                  disabled={!canImport}
                                  onChange={(e) =>
                                    updateReviewDraft(
                                      item.id,
                                      "name",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                  placeholder="Product name"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Price
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draft.basePrice}
                                  disabled={!canImport}
                                  onChange={(e) =>
                                    updateReviewDraft(
                                      item.id,
                                      "basePrice",
                                      Number(e.target.value),
                                    )
                                  }
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Stock
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={draft.stockQty}
                                  disabled={!canImport}
                                  onChange={(e) =>
                                    updateReviewDraft(
                                      item.id,
                                      "stockQty",
                                      Number(e.target.value),
                                    )
                                  }
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Category
                                </label>
                                <input
                                  value={draft.category}
                                  disabled={!canImport}
                                  onChange={(e) =>
                                    updateReviewDraft(
                                      item.id,
                                      "category",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                  placeholder="Category"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Description
                                </label>
                                <textarea
                                  value={draft.description}
                                  disabled={!canImport}
                                  onChange={(e) =>
                                    updateReviewDraft(
                                      item.id,
                                      "description",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                  rows={3}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                  Image URLs
                                </label>
                                <textarea
                                  value={draft.images.join("\n")}
                                  disabled={!canImport}
                                  onChange={(e) =>
                                    updateReviewDraft(
                                      item.id,
                                      "images",
                                      e.target.value
                                        .split("\n")
                                        .map((url) => url.trim())
                                        .filter(Boolean),
                                    )
                                  }
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                  rows={3}
                                />
                              </div>
                            </div>

                            {draft.images.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-gray-500 mb-2">
                                  Captured media
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                  {draft.images
                                    .slice(0, 6)
                                    .map((url, index) => (
                                      <a
                                        key={`${item.id}-${url}`}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block aspect-square rounded-lg overflow-hidden border bg-gray-100 hover:ring-2 hover:ring-primary"
                                        title="Open captured image"
                                      >
                                        <img
                                          src={url}
                                          alt={`Captured product media ${index + 1}`}
                                          className="w-full h-full object-cover"
                                          loading="lazy"
                                        />
                                      </a>
                                    ))}
                                </div>
                                {draft.images.length > 6 && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    +{draft.images.length - 6} more image
                                    {draft.images.length - 6 === 1 ? "" : "s"}
                                  </p>
                                )}
                              </div>
                            )}
                            <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                              {item.caption}
                            </p>
                            {item.error && (
                              <p className="text-xs text-red-600 mt-1">
                                {item.error}
                              </p>
                            )}
                            {draft.aiSource && (
                              <p className="text-xs text-purple-700 mt-1">
                                AI suggested
                                {typeof draft.aiConfidence === "number"
                                  ? ` · ${Math.round(draft.aiConfidence * 100)}% confidence`
                                  : ""}
                                {draft.colors && draft.colors.length > 0
                                  ? ` · ${draft.colors.join(", ")}`
                                  : ""}
                              </p>
                            )}
                            {canImport && (
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleIgnoreQueuedPost(item)}
                                  className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100"
                                >
                                  Ignore
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEnrichQueuedPost(item)}
                                  disabled={
                                    enrichingImportIds.includes(item.id) ||
                                    draft.images.length === 0
                                  }
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-purple-300 text-purple-700 text-sm font-medium hover:bg-purple-50 disabled:opacity-50"
                                >
                                  <Sparkles className="w-4 h-4" />
                                  {enrichingImportIds.includes(item.id)
                                    ? "Enriching..."
                                    : "AI Enrich"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveQueuedDraft(item)}
                                  className="px-3 py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary/5"
                                >
                                  Save Draft
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApproveQueuedPost(item)}
                                  disabled={
                                    isImporting ||
                                    !draft.name.trim() ||
                                    Number(draft.basePrice) <= 0
                                  }
                                  className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                                >
                                  Approve & Import
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === "orders" && (
            <div>
              <h2 className="text-xl font-bold mb-4">Orders</h2>
              {orders.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg shadow-md">
                  <ShoppingCart className="w-12 h-12 mx-auto text-gray-300" />
                  <p className="mt-4 text-gray-500">No orders yet.</p>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-semibold">
                          Order ID
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold">
                          Customer
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold">
                          Amount
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold">
                          Status
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-mono text-gray-600">
                            {order.id.slice(0, 8)}...
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium">
                              {order.customer?.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {order.customer?.phone}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-sm">
                            {formatCurrency(order.totalAmount)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-1 rounded-full font-medium ${
                                STATUS_COLORS[order.status] ||
                                "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {order.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ShopCheckpointFact({
  label,
  value,
  wide,
  mono,
  danger,
}: {
  label: string;
  value: string;
  wide?: boolean;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="font-semibold uppercase text-gray-500">{label}</p>
      <p
        className={`mt-0.5 break-words font-medium ${
          mono ? "font-mono text-[11px]" : ""
        } ${danger ? "text-red-700" : "text-gray-700"}`}
      >
        {value}
      </p>
    </div>
  );
}

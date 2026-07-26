// frontend/app/runner/listings/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { runnerApi, runnerShopsApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import {
  isVideoMedia,
  mediaFileExtension,
  parseProductMedia,
} from "@/lib/productMedia";
import { useAuth } from "@/context/AuthContext";
import { useRunnerGuard } from "@/hooks/useRoleGuard";
import { Button } from "@/components/ui/Button";
import {
  Ban,
  CheckSquare,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  PanelBottom,
  Pause,
  Play,
  Edit2,
  ListFilter,
  MessageCircle,
  PencilLine,
  RadioTower,
  RotateCcw,
  Search,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ProductPricingSummary } from "@/components/products/ProductPricingSummary";
import { productPricing } from "@/lib/productPricing";
import { runnerOrderLinkLine } from "@/lib/orderPrompt";
import { useFeatureFlags } from "@/context/FeatureFlagsContext";

type ListingPostFilter =
  | "ALL"
  | "NOT_POSTED_TO_GROUP"
  | "POSTED_TO_GROUP"
  | "NEVER_POSTED"
  | "POSTED_ANYWHERE"
  | "CAPTION_ISSUE";

const LISTINGS_PAGE_SIZE = 40;
const DEFAULT_POSTING_AGE_DAYS = 14;
const formatStatusAge = (updatedAt: Date | null, now: number) => {
  if (!updatedAt) return "not yet";
  const seconds = Math.max(0, Math.floor((now - updatedAt.getTime()) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
};
type RunnerDestinationGroup = {
  groupId: string;
  name: string;
  participants?: number;
};
const ImageSearchPanel = dynamic(
  () => import("@/components/products/ImageSearchPanel"),
  {
    loading: () => (
      <div className="h-14 animate-pulse rounded-lg bg-gray-100" />
    ),
  },
);

export default function RunnerListingsPage() {
  const { phase2Enabled } = useFeatureFlags();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listingPage, setListingPage] = useState(1);
  const [listingTotal, setListingTotal] = useState(0);
  const [hasMoreListings, setHasMoreListings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMarkup, setEditMarkup] = useState<number>(0);
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [isPreparingPack, setIsPreparingPack] = useState(false);
  const [isSharingImages, setIsSharingImages] = useState(false);
  const [bridgeGroup, setBridgeGroup] = useState("");
  const [runnerDestinationGroups, setRunnerDestinationGroups] = useState<
    RunnerDestinationGroup[]
  >([]);
  const [destinationPostSummary, setDestinationPostSummary] =
    useState<any>(null);
  const [repostStatusUpdatedAt, setRepostStatusUpdatedAt] =
    useState<Date | null>(null);
  const [statusClock, setStatusClock] = useState(() => Date.now());
  const [listingSearch, setListingSearch] = useState("");
  const [listingStatusFilter, setListingStatusFilter] = useState("");
  const [postingAgeDays, setPostingAgeDays] = useState(
    String(DEFAULT_POSTING_AGE_DAYS),
  );
  const [listingPostFilter, setListingPostFilter] =
    useState<ListingPostFilter>("ALL");
  const [isQueueingBridgePost, setIsQueueingBridgePost] = useState(false);
  const [isMarkingCaptionRecovery, setIsMarkingCaptionRecovery] =
    useState(false);
  const [isQueueingCapture, setIsQueueingCapture] = useState(false);
  const [cleanupAge, setCleanupAge] = useState(1);
  const [cleanupUnit, setCleanupUnit] = useState<"hours" | "days">("days");
  const [cleanupBasis, setCleanupBasis] = useState<"capture" | "listing">(
    "capture",
  );
  const [isCleaningListings, setIsCleaningListings] = useState(false);
  const [orderRequests, setOrderRequests] = useState<any[]>([]);
  const [loadingOrderRequests, setLoadingOrderRequests] = useState(false);
  const [showOrderConversations, setShowOrderConversations] = useState(false);
  const [expandedOrderConversationIds, setExpandedOrderConversationIds] =
    useState<string[]>([]);
  const [hiddenOrderConversationIds, setHiddenOrderConversationIds] = useState<
    string[]
  >([]);
  const [convertingOrderRequestId, setConvertingOrderRequestId] = useState<
    string | null
  >(null);
  const [updatingAutoPostId, setUpdatingAutoPostId] = useState<string | null>(
    null,
  );
  const [skippingListingId, setSkippingListingId] = useState<string | null>(
    null,
  );
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>(
    {},
  );
  const [removedImageUrls, setRemovedImageUrls] = useState<
    Record<string, string[]>
  >({});
  const [runnerProfile, setRunnerProfile] = useState<any>(null);
  const [isUpdatingReposting, setIsUpdatingReposting] = useState(false);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, any>>({});
  const { user } = useAuth();
  const { isReady } = useRunnerGuard();

  useEffect(() => {
    if (!isReady) return;
    loadListings();
    loadRunnerProfile();
    loadRunnerDestinationGroups();
    if (phase2Enabled) {
      loadOrderRequests();
    }
    setBridgeGroup(localStorage.getItem("runner_whatsapp_group") || "");
    setCaptionDrafts(readStoredRecord("runner_listing_captions"));
    setRemovedImageUrls(readStoredRecord("runner_listing_removed_images"));
  }, [isReady]);

  useEffect(() => {
    if (!isReady || !bridgeGroup.trim()) {
      setDestinationPostSummary(null);
      return;
    }
    refreshDestinationPostSummary();
  }, [isReady, bridgeGroup]);

  useEffect(() => {
    if (!isReady || !bridgeGroup.trim()) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshDestinationPostSummary();
      }
    };
    const intervalMs = runnerProfile?.autoPostEnabled ? 15_000 : 60_000;
    const intervalId = window.setInterval(refreshWhenVisible, intervalMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isReady, bridgeGroup, runnerProfile?.autoPostEnabled]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") setStatusClock(Date.now());
    }, 10_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const refreshDestinationPostSummary = async () => {
    const destinationGroup = bridgeGroup.trim();
    if (!destinationGroup) return;
    try {
      const response = await runnerApi.getListingRepostStatus(destinationGroup);
      setDestinationPostSummary(response.data);
      setRepostStatusUpdatedAt(new Date());
    } catch {
      setDestinationPostSummary(null);
    }
  };

  const readStoredRecord = (key: string) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch {
      return {};
    }
  };

  const loadListings = async (
    searchTerm?: string,
    page = 1,
    append = false,
    filterOverride?: { ageDays: string; status: string },
    captionIssue = false,
  ) => {
    const cleanSearch =
      typeof searchTerm === "string" ? searchTerm.trim() : listingSearch.trim();
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const capturedFrom = postingAgeCapturedFrom(
        filterOverride ? filterOverride.ageDays : postingAgeDays,
      );
      const searchAllMatches = Boolean(cleanSearch);
      const response = await runnerApi.getListings({
        search: cleanSearch || undefined,
        capturedFrom,
        status:
          (filterOverride ? filterOverride.status : listingStatusFilter) ||
          undefined,
        page: searchAllMatches ? undefined : page,
        limit: searchAllMatches ? undefined : LISTINGS_PAGE_SIZE,
        paginated: !searchAllMatches,
        captionIssue: captionIssue || undefined,
      });
      const payload = response.data || {};
      const nextListings = Array.isArray(payload)
        ? payload
        : payload.data || [];
      const pagination = payload.pagination;
      setListings((current) =>
        append ? [...current, ...nextListings] : nextListings,
      );
      setListingPage(searchAllMatches ? 1 : page);
      setListingTotal(pagination?.total ?? nextListings.length);
      setHasMoreListings(
        searchAllMatches ? false : Boolean(pagination?.hasMore),
      );
    } catch (error) {
      console.error("Failed to load listings:", error);
      toast.error("Failed to load listings");
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  };

  const postingAgeCapturedFrom = (value: string) => {
    const days = Math.max(
      1,
      Math.min(90, Number(value || DEFAULT_POSTING_AGE_DAYS)),
    );
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  };

  const selectedPostingAgeDays = () => {
    const days = Number(postingAgeDays);
    return Number.isInteger(days) && days >= 1 && days <= 90 ? days : null;
  };

  const loadRunnerProfile = async () => {
    try {
      const response = await runnerApi.getProfile();
      setRunnerProfile(response.data || null);
    } catch (error) {
      console.error("Failed to load runner profile:", error);
    }
  };

  const loadRunnerDestinationGroups = async () => {
    try {
      const [groupsResponse, shopsResponse] = await Promise.all([
        runnerShopsApi.getDestinationGroups(),
        runnerShopsApi.getMyShops(),
      ]);
      const available: RunnerDestinationGroup[] =
        groupsResponse.data?.data || [];
      const configuredIds: string[] = Array.from(
        new Set<string>(
          (shopsResponse.data || []).flatMap((assignment: any) => {
            const raw = String(assignment.destinationGroup || "").trim();
            if (!raw) return [];
            try {
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed)
                ? parsed.map((item) => String(item))
                : [raw];
            } catch {
              return raw
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
            }
          }),
        ),
      ).slice(0, 2);
      const resolvedGroups = configuredIds.map(
        (groupId) =>
          available.find(
            (group) => group.groupId === groupId || group.name === groupId,
          ) || { groupId, name: groupId },
      );
      const seenDestinationIds = new Set<string>();
      const seenDestinationNames = new Set<string>();
      const groups = resolvedGroups.filter((group) => {
        const id = String(group.groupId || "")
          .trim()
          .toLowerCase();
        const name = String(group.name || "")
          .trim()
          .toLowerCase();
        if (
          (id && seenDestinationIds.has(id)) ||
          (name && seenDestinationNames.has(name))
        ) {
          return false;
        }
        if (id) seenDestinationIds.add(id);
        if (name) seenDestinationNames.add(name);
        return true;
      });
      setRunnerDestinationGroups(groups);
      const stored = localStorage.getItem("runner_whatsapp_group") || "";
      const selected = groups.find(
        (group) => group.groupId === stored || group.name === stored,
      );
      if (selected) setBridgeGroup(selected.groupId);
      else if (groups[0]) setBridgeGroup(groups[0].groupId);
    } catch (error) {
      console.error("Failed to load runner destination groups:", error);
    }
  };

  const handleRepostingControl = async (enabled: boolean) => {
    const postingAge = enabled ? selectedPostingAgeDays() : null;
    if (enabled && !postingAge) {
      toast.error("Choose a posting age between 1 and 90 days first");
      return;
    }
    setIsUpdatingReposting(true);
    try {
      if (enabled) {
        await runnerShopsApi.updateAllAutomation({
          selectionScope: "all",
          autoPostEnabled: true,
          autoListEnabled: true,
          maximumListingAgeDays: postingAge!,
        });
      }
      const response = await runnerApi.updateProfile({
        autoPostEnabled: enabled,
      });
      setRunnerProfile(response.data);
      toast.success(
        enabled
          ? "Automatic reposting started"
          : "Automatic reposting paused. No new automatic posts will be sent.",
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to update reposting",
      );
    } finally {
      setIsUpdatingReposting(false);
    }
  };

  const handleRepostPriceMode = async (mode: string) => {
    const repostPriceMode = mode as
      "ORIGINAL" | "FEE_BREAKDOWN" | "TOTAL_ONLY" | "STOCK_EACH_TOTALS";
    setIsUpdatingReposting(true);
    try {
      const response = await runnerApi.updateProfile({ repostPriceMode });
      setRunnerProfile(response.data);
      toast.success("Caption price format updated");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to update repost format",
      );
    } finally {
      setIsUpdatingReposting(false);
    }
  };

  const handleOrderDetailsToggle = async (enabled: boolean) => {
    setIsUpdatingReposting(true);
    try {
      const response = await runnerApi.updateProfile({
        repostOrderDetailsEnabled: enabled,
      });
      setRunnerProfile(response.data);
      toast.success(
        enabled ? "Order code and link enabled" : "Order code and link hidden",
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to update order details",
      );
    } finally {
      setIsUpdatingReposting(false);
    }
  };

  const handleFeePercentageToggle = async (enabled: boolean) => {
    setIsUpdatingReposting(true);
    try {
      const response = await runnerApi.updateProfile({
        repostFeePercentageEnabled: enabled,
      });
      setRunnerProfile(response.data);
      toast.success(
        enabled
          ? "Runner fee percentage shown"
          : "Runner fee percentage hidden",
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to update fee display",
      );
    } finally {
      setIsUpdatingReposting(false);
    }
  };

  const handleOriginalPricePerImageToggle = async (enabled: boolean) => {
    setIsUpdatingReposting(true);
    try {
      const response = await runnerApi.updateProfile({
        repostOriginalPricePerImageEnabled: enabled,
      });
      setRunnerProfile(response.data);
      toast.success(
        enabled
          ? "Earlier images will show original prices only"
          : "Earlier image price captions disabled",
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ||
          "Failed to update image price captions",
      );
    } finally {
      setIsUpdatingReposting(false);
    }
  };

  const updateListingRepostControl = async (
    listing: any,
    action: "START_NOW" | "SCHEDULE" | "PAUSE" | "RESUME" | "STOP",
  ) => {
    const draft = scheduleDrafts[listing.id] || {};
    if (action === "SCHEDULE" && !draft.scheduledStartAt) {
      toast.error("Choose a future start date and time");
      return;
    }
    setUpdatingAutoPostId(listing.id);
    try {
      const response = await runnerApi.updateListingRepostControl(listing.id, {
        action,
        scheduledStartAt: draft.scheduledStartAt
          ? new Date(draft.scheduledStartAt).toISOString()
          : undefined,
      });
      setListings((current) =>
        current.map((item) =>
          item.id === listing.id ? { ...item, ...response.data } : item,
        ),
      );
      toast.success(`Reposting ${action.toLowerCase().replaceAll("_", " ")}`);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Could not update reposting",
      );
    } finally {
      setUpdatingAutoPostId(null);
    }
  };

  const loadOrderRequests = async () => {
    setLoadingOrderRequests(true);
    try {
      const response = await runnerApi.getOrderRequests();
      setOrderRequests(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to load WhatsApp order requests:", error);
    } finally {
      setLoadingOrderRequests(false);
    }
  };

  const isOrderConversationVisible = (requestId: string) =>
    showOrderConversations
      ? !hiddenOrderConversationIds.includes(requestId)
      : expandedOrderConversationIds.includes(requestId);

  const toggleOrderConversation = (requestId: string) => {
    if (showOrderConversations) {
      setHiddenOrderConversationIds((current) =>
        current.includes(requestId)
          ? current.filter((id) => id !== requestId)
          : [...current, requestId],
      );
      return;
    }

    setExpandedOrderConversationIds((current) =>
      current.includes(requestId)
        ? current.filter((id) => id !== requestId)
        : [...current, requestId],
    );
  };

  const toggleAllOrderConversations = () => {
    setShowOrderConversations((current) => !current);
    setExpandedOrderConversationIds([]);
    setHiddenOrderConversationIds([]);
  };

  const handleConvertOrderRequest = async (request: any) => {
    if (!request.listingId) {
      toast.error("This request is not matched to a listing yet");
      return;
    }

    setConvertingOrderRequestId(request.id);
    try {
      const response = await runnerApi.convertOrderRequest(request.id, {
        quantity: 1,
        customerPhone: request.customerPhone,
        customerName: request.customerName,
        notes: request.messageText,
      });
      toast.success("Order created from WhatsApp request");
      setOrderRequests((current) =>
        current.map((item) =>
          item.id === request.id
            ? {
                ...item,
                status: "CONVERTED",
                orderId: response.data?.id,
                order: response.data,
              }
            : item,
        ),
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to create order from request",
      );
    } finally {
      setConvertingOrderRequestId(null);
    }
  };

  const handleDelete = async (listingId: string) => {
    if (!confirm("Remove this product from your listings?")) return;

    try {
      await runnerApi.deleteListing(listingId);
      toast.success("Listing removed");
      setListings(listings.filter((l) => l.id !== listingId));
      setListingTotal((total) => Math.max(0, total - 1));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to remove listing");
    }
  };
  const handleSkipListing = async (listing: any) => {
    const productName = listing.product?.name || "this product";
    if (
      !confirm(
        `Mark ${productName} as do not buy? Runner will stop reposting it and use its images as a future skip reference.`,
      )
    ) {
      return;
    }

    const reason = window.prompt(
      "Optional reason for the skip list",
      "Runner does not buy this item",
    );
    setSkippingListingId(listing.id);
    try {
      const response = await runnerApi.skipListing(
        listing.id,
        reason || "Runner does not buy this item",
      );
      toast.success(
        response.data?.message || "Product saved to Runner skip list",
      );
      setListings((current) =>
        current.filter((item) => item.id !== listing.id),
      );
      setSelectedListingIds((current) =>
        current.filter((listingId) => listingId !== listing.id),
      );
      setListingTotal((total) => Math.max(0, total - 1));
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ||
          "Failed to mark product as do not buy",
      );
    } finally {
      setSkippingListingId(null);
    }
  };

  const handleDeleteListingsByAge = async () => {
    const age = Math.max(1, Number(cleanupAge || 1));
    const label = `${age} ${cleanupUnit === "hours" ? "hour" : "day"}${
      age === 1 ? "" : "s"
    }`;
    if (
      !confirm(
        `Delete your listings where the ${cleanupBasis === "capture" ? "source WhatsApp post" : "listing row"} is older than ${label}? This does not delete the original shop products.`,
      )
    ) {
      return;
    }

    setIsCleaningListings(true);
    try {
      const response =
        cleanupBasis === "capture"
          ? cleanupUnit === "hours"
            ? await runnerApi.deleteListingsOlderThanCaptureHours(age)
            : await runnerApi.deleteListingsOlderThanCapture(age)
          : cleanupUnit === "hours"
            ? await runnerApi.deleteListingsOlderThanHours(age)
            : await runnerApi.deleteListingsOlderThan(age);
      toast.success(response.data?.message || "Old listings deleted");
      await loadListings();
      setSelectedListingIds([]);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to delete old listings",
      );
    } finally {
      setIsCleaningListings(false);
    }
  };

  const handleUpdateMarkup = async (listingId: string) => {
    try {
      const product = listings.find((l) => l.id === listingId);
      if (!product) return;

      await runnerApi.createListing(product.productId, editMarkup);
      toast.success("Markup updated");
      setEditingId(null);
      loadListings();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to update markup");
    }
  };

  const handleAutoPostToggle = async (
    listing: any,
    autoPostApproved: boolean,
  ) => {
    setUpdatingAutoPostId(listing.id);
    try {
      const response = await runnerApi.updateListingAutoPost(
        listing.id,
        autoPostApproved,
      );
      setListings((current) =>
        current.map((item) =>
          item.id === listing.id ? { ...item, ...response.data } : item,
        ),
      );
      toast.success(
        autoPostApproved
          ? "Listing approved for hourly auto-posting"
          : "Listing paused from auto-posting",
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to update auto-posting",
      );
    } finally {
      setUpdatingAutoPostId(null);
    }
  };

  const handleWhatsAppShare = (listing: any) => {
    const message = generateWhatsAppMessage(listing);
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
  };

  const handleCopyLink = async (listing: any) => {
    const message = generateWhatsAppMessage(listing);
    await navigator.clipboard.writeText(message);
    toast.success("Message copied to clipboard!");
  };

  const productImages = (images: any): string[] => {
    return parseProductMedia(images);
  };

  const originalImportForProduct = (product: any) =>
    Array.isArray(product?.whatsappImports) ? product.whatsappImports[0] : null;

  const originalProductMedia = (product: any) => {
    const importMedia = parseProductMedia(
      originalImportForProduct(product)?.mediaUrls,
    );
    return importMedia.length > 0
      ? importMedia
      : productImages(product?.images);
  };

  const repostImagesForListing = (listing: any) => {
    const removed = new Set(removedImageUrls[listing.id] || []);
    return originalProductMedia(listing.product).filter(
      (image) => !removed.has(image),
    );
  };

  const persistRemovedImageUrls = (next: Record<string, string[]>) => {
    setRemovedImageUrls(next);
    localStorage.setItem("runner_listing_removed_images", JSON.stringify(next));
  };

  const removeListingImageFromRepost = (
    listingId: string,
    imageUrl: string,
  ) => {
    const current = removedImageUrls[listingId] || [];
    const next = {
      ...removedImageUrls,
      [listingId]: Array.from(new Set([...current, imageUrl])),
    };
    persistRemovedImageUrls(next);
    toast.success("Image removed from repost bundle");
  };

  const restoreListingImages = (listingId: string) => {
    const next = { ...removedImageUrls };
    delete next[listingId];
    persistRemovedImageUrls(next);
    toast.success("Images restored for reposting");
  };

  const imageFileName = (listing: any, index: number, url: string) => {
    const baseName = String(listing.product?.name || "runner-product")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);

    return `${baseName || "runner-product"}-${index + 1}.${mediaFileExtension(url)}`;
  };

  const imageFileFromUrl = async (
    url: string,
    fileName: string,
  ): Promise<File> => {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load media ${url}`);
    }

    const blob = await response.blob();
    const type =
      blob.type &&
      (blob.type.startsWith("image/") || blob.type.startsWith("video/"))
        ? blob.type
        : isVideoMedia(url)
          ? "video/mp4"
          : "image/jpeg";

    return new File([blob], fileName, { type });
  };

  const imageFileWithOrderCode = async (
    file: File,
    listing: any,
    index: number,
  ) => {
    const orderCode = String(listing.orderCode || "").trim();
    if (!orderCode || !file.type.startsWith("image/")) return file;

    try {
      const image = await loadImageElement(file);
      const maxWidth = 1600;
      const scale = Math.min(1, maxWidth / image.width);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) return file;

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);

      const fontSize = Math.max(
        28,
        Math.round(Math.min(width, height) * 0.045),
      );
      const horizontalPadding = Math.round(fontSize * 0.65);
      const verticalPadding = Math.round(fontSize * 0.45);
      const margin = Math.max(16, Math.round(fontSize * 0.55));

      context.font = `800 ${fontSize}px Arial`;
      const textWidth = context.measureText(orderCode).width;
      const boxWidth = Math.min(
        width - margin * 2,
        Math.round(textWidth + horizontalPadding * 2),
      );
      const boxHeight = Math.round(fontSize + verticalPadding * 2);
      const x = Math.max(margin, width - boxWidth - margin);
      const y = Math.max(margin, height - boxHeight - margin);

      context.fillStyle = "rgba(0, 0, 0, 0.72)";
      context.fillRect(x, y, boxWidth, boxHeight);
      context.fillStyle = "#ffffff";
      context.fillText(
        orderCode,
        x + horizontalPadding,
        y + verticalPadding + fontSize * 0.78,
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error("Could not export")),
          "image/jpeg",
          0.92,
        );
      });

      return new File([blob], imageFileName(listing, index, "jpg"), {
        type: "image/jpeg",
      });
    } catch {
      return file;
    }
  };

  const listingImageFiles = async (listing: any, maxImages = 6) => {
    const images = repostImagesForListing(listing).slice(0, maxImages);
    const files: File[] = [];

    for (let index = 0; index < images.length; index += 1) {
      const file = await imageFileFromUrl(
        images[index],
        imageFileName(listing, index, images[index]),
      );
      files.push(await imageFileWithOrderCode(file, listing, index));
    }

    return files;
  };

  const groupedListingImageFiles = async (listing: any, maxImages = 0) => {
    const imageCount = repostImagesForListing(listing).length;
    const files = await listingImageFiles(
      listing,
      maxImages > 0 ? maxImages : imageCount,
    );

    return files;
  };

  const loadImageElement = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new window.Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load product image"));
      };
      image.src = url;
    });

  const wrapCanvasText = (
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ) => {
    const words = text.replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = [];
    let line = "";

    words.forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      if (context.measureText(testLine).width <= maxWidth) {
        line = testLine;
        return;
      }

      if (line) lines.push(line);
      line = word;
    });

    if (line) lines.push(line);
    return lines;
  };

  const whatsappDigits = (phone?: string) =>
    String(phone || "").replace(/\D/g, "");

  const runnerWhatsAppLink = () => {
    const digits =
      whatsappDigits(
        runnerProfile?.phone || runnerProfile?.user?.phone || user?.phone,
      ) || whatsappDigits(process.env.NEXT_PUBLIC_WHATSAPP_ORDER_INTAKE_PHONE);
    return digits ? `https://wa.me/${digits}` : "";
  };

  const runnerOrderLine = (listing?: any) => {
    const link = runnerWhatsAppLink();
    return runnerOrderLinkLine(
      {
        ...listing,
        runner: {
          ...(listing?.runner || {}),
          publicCode: listing?.runner?.publicCode || runnerProfile?.publicCode,
        },
      },
      link,
    );
  };

  const compactRunnerFeeMessage = (listing: any) => {
    const pricing = productPricing(listing.product);
    const markup = Math.max(0, Number(listing.markup || 0));
    const multiplier = 1 + markup;
    const feePercent = Math.round(markup * 100);
    const runnerPrice = Number(listing.runnerPrice || 0);
    const lines = [`*${listing.product?.name || "Item"}*`];

    if (
      pricing.stockIsBulkPrice &&
      pricing.regularUnitPrice &&
      pricing.bulkUnitPrice &&
      !pricing.bulkQuantity
    ) {
      lines.push(
        `Stock: ${formatCurrency(
          runnerPrice || pricing.bulkUnitPrice * multiplier,
        )} | Each: ${formatCurrency(pricing.regularUnitPrice * multiplier)}`,
      );
    } else if (
      pricing.bulkQuantity &&
      pricing.bulkTotal &&
      pricing.bulkUnitPrice
    ) {
      const unitBase = pricing.regularUnitPrice || pricing.bulkUnitPrice;
      const runnerUnit = unitBase * multiplier;
      const runnerBulkTotal = pricing.bulkTotal * multiplier;
      const runnerBulkUnit = pricing.bulkUnitPrice * multiplier;
      const money = (value: number) =>
        `R${value.toFixed(2).replace(/\.00$/, "")}`;
      lines.push(
        "",
        `1 for ${money(unitBase)}`,
        `Runner price: ${money(runnerUnit)}`,
        feePercent > 0 ? `(+${feePercent}% runner fee)` : "",
        "",
        `${pricing.bulkQuantity} for ${money(pricing.bulkTotal)}`,
        pricing.bulkSavings > 0
          ? `Bulk Save: R${pricing.bulkSavings.toFixed(2)}`
          : "",
        `Runner price: ${money(runnerBulkTotal)}`,
        `(${money(runnerBulkUnit)} each${
          feePercent > 0 ? `, +${feePercent}% runner fee` : ""
        })`,
      );
    } else if (runnerPrice > 0) {
      lines.push(`Price: ${formatCurrency(runnerPrice)}`);
    }

    if (!pricing.bulkQuantity) {
      lines.push(
        feePercent > 0
          ? `Runner fee: ${feePercent}% included`
          : "Final runner price",
      );
    }
    const originalCaption = String(
      originalImportForProduct(listing.product)?.caption || "",
    );
    const sizeLine = originalCaption
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^(?:free\s+size|sizes?\b)/i.test(line));
    if (sizeLine) {
      lines.push(sizeLine.replace(/^sizes?\s*[:=-]?\s*/i, "Size: "));
    }

    return lines.join("\n");
  };

  const withOrderInstructions = (listing: any, message: string) => {
    const text = String(message || "").trim();
    const runnerLine = runnerOrderLine(listing);
    return [text, runnerLine].filter(Boolean).join("\n\n");
  };

  const defaultRepostMessage = (listing: any) => {
    const originalCaption = String(
      originalImportForProduct(listing.product)?.caption || "",
    ).trim();
    return normalizeRepostMessage(listing, originalCaption);
  };

  const repostPricingSummary = (listing: any, caption: string) => {
    const pricing = productPricing(listing.product);
    if (
      pricing.stockIsBulkPrice &&
      pricing.regularUnitPrice &&
      pricing.bulkUnitPrice &&
      !pricing.bulkQuantity
    ) {
      const lines: string[] = [];
      if (!/\bstock\/bulk price\s*:/i.test(caption)) {
        lines.push(
          `Each/Retail price: ${formatCurrency(pricing.regularUnitPrice)}`,
          `Stock/Bulk price: ${formatCurrency(pricing.bulkUnitPrice)} per item`,
        );
        if (pricing.bulkSavingsPerItem > 0) {
          lines.push(
            `Stock/Bulk saving: ${formatCurrency(
              pricing.bulkSavingsPerItem,
            )} per item (${pricing.bulkSavingsPercent}% off)`,
          );
        }
      }

      const markup = Math.max(0, Number(listing.markup || 0));
      if (markup > 0) {
        if (!/\bstock\/bulk with runner fee\s*:/i.test(caption)) {
          lines.push(
            `Stock/bulk with runner fee: ${formatCurrency(
              pricing.bulkUnitPrice * (1 + markup),
            )} per item (includes ${(markup * 100).toFixed(0)}% runner fee)`,
          );
        }
        if (!/\beach\/retail with runner fee\s*:/i.test(caption)) {
          lines.push(
            `Each/retail with runner fee: ${formatCurrency(
              pricing.regularUnitPrice * (1 + markup),
            )} per item (includes ${(markup * 100).toFixed(0)}% runner fee)`,
          );
        }
      }
      return lines.join("\n");
    }

    if (!pricing.bulkQuantity || !pricing.bulkTotal || !pricing.bulkUnitPrice) {
      return "";
    }

    const lines: string[] = [];
    if (!/\bbulk price\s*:/i.test(caption)) {
      lines.push(
        pricing.regularUnitPrice
          ? `Unit price: ${formatCurrency(pricing.regularUnitPrice)}`
          : `Bulk unit price: ${formatCurrency(pricing.bulkUnitPrice)} each`,
        `Bulk price: ${pricing.bulkQuantity} for ${formatCurrency(
          pricing.bulkTotal,
        )} (${formatCurrency(pricing.bulkUnitPrice)} each)`,
      );
      if (pricing.bulkSavings > 0) {
        lines.push(
          `Save ${formatCurrency(pricing.bulkSavings)} when buying ${
            pricing.bulkQuantity
          } (${formatCurrency(pricing.bulkSavingsPerItem)} each, ${
            pricing.bulkSavingsPercent
          }% off)`,
        );
      }
    }

    const markup = Math.max(0, Number(listing.markup || 0));
    if (markup > 0 && !/\bbulk with runner fee\s*:/i.test(caption)) {
      const runnerBulkTotal = pricing.bulkTotal * (1 + markup);
      const runnerBulkUnit = pricing.bulkUnitPrice * (1 + markup);
      lines.push(
        `Bulk with runner fee: ${pricing.bulkQuantity} for ${formatCurrency(
          runnerBulkTotal,
        )} (${formatCurrency(runnerBulkUnit)} each, includes ${(
          markup * 100
        ).toFixed(0)}% runner fee)`,
      );
    }
    return lines.join("\n");
  };

  const normalizeRepostMessage = (listing: any, message: string) => {
    const clean = message
      .replace("Reply here if you need help ordering.", "")
      .trim();
    return withOrderInstructions(listing, clean);
  };

  const repostMessageForListing = (listing: any) =>
    captionDrafts[listing.id]?.trim()
      ? normalizeRepostMessage(listing, captionDrafts[listing.id].trim())
      : defaultRepostMessage(listing);

  const saveCaptionDraft = (listingId: string, value: string) => {
    const next = { ...captionDrafts, [listingId]: value };
    setCaptionDrafts(next);
    localStorage.setItem("runner_listing_captions", JSON.stringify(next));
  };

  const resetCaptionDraft = (listing: any) => {
    const next = { ...captionDrafts };
    delete next[listing.id];
    setCaptionDrafts(next);
    localStorage.setItem("runner_listing_captions", JSON.stringify(next));
  };

  const generateImageCaptionLines = (listing: any) => {
    const captionLines = repostMessageForListing(listing)
      .replace(/\*/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return captionLines.map((line, index) => ({
      text: line,
      font:
        index === 0
          ? "700 48px Arial"
          : /^price:/i.test(line)
            ? "800 56px Arial"
            : "400 34px Arial",
      color:
        index === 0 ? "#111827" : /^price:/i.test(line) ? "#047857" : "#374151",
      lineHeight: index === 0 ? 58 : /^price:/i.test(line) ? 66 : 44,
    })) as Array<{
      text: string;
      font: string;
      color: string;
      lineHeight: number;
    }>;
  };

  const createCaptionedImageFile = async (listing: any) => {
    const [sourceFile] = await listingImageFiles(listing, 1);
    if (!sourceFile) {
      throw new Error("This listing has no product image");
    }

    const image = await loadImageElement(sourceFile);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not prepare caption image");
    }

    const width = 1080;
    const imageHeight = Math.max(
      720,
      Math.min(1080, Math.round((image.height / image.width) * width)),
    );
    const padding = 56;
    const maxTextWidth = width - padding * 2;
    const captionBlocks = generateImageCaptionLines(listing);

    let captionHeight = padding * 2;
    const wrappedBlocks = captionBlocks.map((block) => {
      context.font = block.font;
      const lines = wrapCanvasText(context, block.text, maxTextWidth).slice(
        0,
        block.font.includes("400") ? 4 : 3,
      );
      captionHeight += lines.length * block.lineHeight + 16;
      return { ...block, lines };
    });

    canvas.width = width;
    canvas.height = imageHeight + captionHeight;

    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const sourceRatio = image.width / image.height;
    const targetRatio = width / imageHeight;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.width;
    let sourceHeight = image.height;

    if (sourceRatio > targetRatio) {
      sourceWidth = image.height * targetRatio;
      sourceX = (image.width - sourceWidth) / 2;
    } else {
      sourceHeight = image.width / targetRatio;
      sourceY = (image.height - sourceHeight) / 2;
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      imageHeight,
    );

    context.fillStyle = "#ffffff";
    context.fillRect(0, imageHeight, width, captionHeight);

    let y = imageHeight + padding;
    wrappedBlocks.forEach((block) => {
      context.font = block.font;
      context.fillStyle = block.color;
      block.lines.forEach((line) => {
        context.fillText(line, padding, y);
        y += block.lineHeight;
      });
      y += 16;
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Could not export image")),
        "image/jpeg",
        0.92,
      );
    });

    return new File([blob], imageFileName(listing, 0, "poster.jpg"), {
      type: "image/jpeg",
    });
  };

  const downloadImageFiles = (files: File[]) => {
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };

  const canNativeShareFiles = (files: File[]) =>
    typeof navigator !== "undefined" &&
    Boolean(navigator.share) &&
    (!navigator.canShare || navigator.canShare({ files }));

  const shareFilesOrFallback = async (
    files: File[],
    text: string,
    title: string,
    successMessage = "Image repost sent to share sheet",
  ) => {
    await navigator.clipboard.writeText(text);

    if (files.length === 0) {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
      toast.success("Caption copied and WhatsApp opened");
      return;
    }

    if (canNativeShareFiles(files)) {
      await navigator.share({ title, text, files });
      toast.success(successMessage);
      return;
    }

    downloadImageFiles(files);
    toast.success("Caption copied and images downloaded for WhatsApp");
  };

  const generateWhatsAppMessage = (listing: any) =>
    repostMessageForListing(listing);

  const normalizedGroup = (value?: string | null) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const selectedDestinationGroup = bridgeGroup.trim();
  const selectedDestination = runnerDestinationGroups.find(
    (group) =>
      group.groupId === selectedDestinationGroup ||
      normalizedGroup(group.name) === normalizedGroup(selectedDestinationGroup),
  );
  const selectedDestinationLabel =
    selectedDestination?.name || selectedDestinationGroup;

  const repostLogsForListing = (listing: any) =>
    Array.isArray(listing?.repostLogs) ? listing.repostLogs : [];

  const latestRepostLog = (listing: any) =>
    repostLogsForListing(listing).find((log: any) => log.status === "POSTED") ||
    null;

  const latestRepostLogForGroup = (listing: any, groupIdOrName: string) => {
    const normalized = normalizedGroup(groupIdOrName);
    if (!normalized) return null;

    const destination = runnerDestinationGroups.find(
      (group) =>
        normalizedGroup(group.groupId) === normalized ||
        normalizedGroup(group.name) === normalized,
    );
    const aliases = new Set(
      [groupIdOrName, destination?.groupId, destination?.name]
        .filter(Boolean)
        .map((value) => normalizedGroup(value)),
    );
    return (
      repostLogsForListing(listing).find(
        (log: any) =>
          log.status === "POSTED" &&
          (aliases.has(normalizedGroup(log.groupIdOrName)) ||
            aliases.has(normalizedGroup(log.groupName))),
      ) || null
    );
  };

  const wasPostedToSelectedGroup = (listing: any) =>
    Boolean(
      selectedDestinationGroup &&
      latestRepostLogForGroup(listing, selectedDestinationGroup),
    );

  const wasPostedAnywhere = (listing: any) =>
    repostLogsForListing(listing).length > 0 ||
    Number(listing.postCount || 0) > 0 ||
    Boolean(listing.lastPostedAt);

  const postingBadgeForListing = (listing: any) => {
    const anyLog = latestRepostLog(listing);
    if (runnerDestinationGroups.length > 0) {
      const posted = runnerDestinationGroups.filter((group) =>
        latestRepostLogForGroup(listing, group.groupId),
      );
      const remaining = runnerDestinationGroups.filter(
        (group) => !posted.some((item) => item.groupId === group.groupId),
      );
      if (remaining.length === 0) {
        return {
          label: "Posted to all destinations",
          detail: posted.map((group) => group.name).join(" · "),
          className: "border-green-300 bg-green-100 text-green-800",
        };
      }
      if (posted.length > 0) {
        return {
          label: `${remaining.length} destination${remaining.length === 1 ? "" : "s"} remaining`,
          detail: `Posted: ${posted.map((group) => group.name).join(", ")} · Remaining: ${remaining.map((group) => group.name).join(", ")}`,
          className: "border-blue-300 bg-blue-100 text-blue-800",
        };
      }
      return {
        label: "Not yet posted",
        detail: `Target${remaining.length === 1 ? "" : "s"}: ${remaining.map((group) => group.name).join(", ")}`,
        className: "border-amber-300 bg-amber-100 text-amber-900",
      };
    }

    if (anyLog || listing.lastPostedAt) {
      const dateValue = anyLog?.postedAt || listing.lastPostedAt;
      return {
        label: "Posted somewhere",
        detail: dateValue
          ? `${anyLog?.groupIdOrName || "Previous destination"} · ${new Date(dateValue).toLocaleString()}`
          : "Previous destination recorded",
        className: "border-blue-300 bg-blue-100 text-blue-800",
      };
    }

    return {
      label: "Not yet posted",
      detail: "Choose a destination group to track posting",
      className: "border-amber-300 bg-amber-100 text-amber-900",
    };
  };

  const formatTraceDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString() : "Not recorded";

  const itemAge = (value?: string | null) => {
    if (!value) return "Age unknown";
    const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return "Captured just now";
    if (minutes < 60) return `${minutes} min old`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} old`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} old`;
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} old`;
  };

  const listingTraceMeta = (listing: any) => {
    const sourcePost = originalImportForProduct(listing.product);
    const postedLog = latestRepostLog(listing);
    return {
      shopName:
        listing.searchMeta?.shopName ||
        listing.shop?.name ||
        listing.product?.shop?.name ||
        "Unknown shop",
      sourceGroup:
        listing.searchMeta?.sourceGroup ||
        sourcePost?.sourceGroup ||
        "Unknown source group",
      runnerName:
        listing.searchMeta?.runnerName ||
        runnerProfile?.user?.name ||
        runnerProfile?.phone ||
        user?.name ||
        "Runner",
      capturedAt:
        listing.searchMeta?.capturedAt ||
        sourcePost?.receivedAt ||
        sourcePost?.importedAt ||
        listing.createdAt,
      repostedAt:
        listing.searchMeta?.repostedAt ||
        postedLog?.postedAt ||
        listing.lastPostedAt ||
        null,
      repostedGroup:
        listing.searchMeta?.repostedGroup ||
        postedLog?.groupIdOrName ||
        "Not reposted yet",
      captionDelivery:
        postedLog?.captionStatus === "ATTACHED_VERIFIED"
          ? "Caption attached"
          : postedLog?.captionStatus === "FALLBACK_SENT"
            ? "Caption sent separately"
            : postedLog?.captionStatus === "TEXT_ONLY_VERIFIED"
              ? "Text verified"
              : postedLog?.captionStatus === "FAILED"
                ? "Caption failed"
                : postedLog?.captionStatus === "ATTACHED_UNVERIFIED"
                  ? "Caption unverified"
                  : postedLog
                    ? "Not historically verified"
                    : "Not posted",
    };
  };

  const listingMatchesSearch = (listing: any) => {
    const search = listingSearch.trim().toLowerCase();
    if (!search) return true;

    const trace = listingTraceMeta(listing);
    const sourcePost = originalImportForProduct(listing.product);
    const haystack = [
      listing.orderCode,
      listing.product?.name,
      listing.product?.description,
      listing.product?.category,
      trace.shopName,
      trace.sourceGroup,
      trace.runnerName,
      trace.repostedGroup,
      trace.capturedAt,
      trace.repostedAt,
      sourcePost?.caption,
      ...repostLogsForListing(listing).map((log: any) => log.groupIdOrName),
      ...repostLogsForListing(listing).map((log: any) => log.groupName),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  };

  const hasCaptionIssue = (listing: any) =>
    repostLogsForListing(listing).some(
      (log: any) =>
        log.status === "FAILED" ||
        log.captionStatus === "UNKNOWN" ||
        log.captionStatus === "FAILED" ||
        log.captionStatus === "ATTACHED_UNVERIFIED",
    );

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      if (!listingMatchesSearch(listing)) return false;

      switch (listingPostFilter) {
        case "NOT_POSTED_TO_GROUP":
          return selectedDestinationGroup
            ? !wasPostedToSelectedGroup(listing)
            : !wasPostedAnywhere(listing);
        case "POSTED_TO_GROUP":
          return selectedDestinationGroup
            ? wasPostedToSelectedGroup(listing)
            : wasPostedAnywhere(listing);
        case "NEVER_POSTED":
          return !wasPostedAnywhere(listing);
        case "POSTED_ANYWHERE":
          return wasPostedAnywhere(listing);
        case "CAPTION_ISSUE":
          return hasCaptionIssue(listing);
        default:
          return true;
      }
    });
  }, [
    listings,
    listingSearch,
    listingPostFilter,
    selectedDestinationGroup,
    runnerProfile,
    user,
  ]);

  const postFilterCounts = useMemo(
    () => ({
      ALL: listings.length,
      NOT_POSTED_TO_GROUP: listings.filter((listing) =>
        selectedDestinationGroup
          ? !wasPostedToSelectedGroup(listing)
          : !wasPostedAnywhere(listing),
      ).length,
      POSTED_TO_GROUP: listings.filter((listing) =>
        selectedDestinationGroup
          ? wasPostedToSelectedGroup(listing)
          : wasPostedAnywhere(listing),
      ).length,
      NEVER_POSTED: listings.filter((listing) => !wasPostedAnywhere(listing))
        .length,
      POSTED_ANYWHERE: listings.filter((listing) => wasPostedAnywhere(listing))
        .length,
      CAPTION_ISSUE: listings.filter((listing) => hasCaptionIssue(listing))
        .length,
    }),
    [listings, selectedDestinationGroup],
  );

  const selectedListings = useMemo(
    () => listings.filter((listing) => selectedListingIds.includes(listing.id)),
    [listings, selectedListingIds],
  );

  const toggleListingSelection = (listingId: string) => {
    setSelectedListingIds((current) =>
      current.includes(listingId)
        ? current.filter((id) => id !== listingId)
        : [...current, listingId],
    );
  };

  const selectActiveListings = () => {
    setSelectedListingIds(
      filteredListings
        .filter((listing) => listing.status === "ACTIVE")
        .map((listing) => listing.id),
    );
  };

  const selectNotPostedToSelectedGroup = () => {
    setSelectedListingIds(
      filteredListings
        .filter(
          (listing) =>
            listing.status === "ACTIVE" &&
            (selectedDestinationGroup
              ? !wasPostedToSelectedGroup(listing)
              : !wasPostedAnywhere(listing)),
        )
        .map((listing) => listing.id),
    );
  };

  const generatePackMessage = (messages: string[]) =>
    [
      "*Available items*",
      "Prices include runner service. Reply with the item you want.",
      "",
      messages.join("\n\n━━━━━━━━━━━━\n\n"),
    ].join("\n");

  const prepareListingPack = async (openWhatsApp: boolean) => {
    if (selectedListings.length === 0) {
      toast.error("Select listings to repost first");
      return;
    }

    setIsPreparingPack(true);
    try {
      const packMessage = generatePackMessage(
        selectedListings.map((listing) => generateWhatsAppMessage(listing)),
      );
      await navigator.clipboard.writeText(packMessage);

      if (openWhatsApp && packMessage.length < 7000) {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(packMessage)}`,
          "_blank",
        );
        toast.success("Repost pack copied and opened in WhatsApp");
      } else if (openWhatsApp) {
        toast.success(
          "Repost pack copied. Paste it into WhatsApp in smaller batches.",
        );
      } else {
        toast.success("Repost pack copied");
      }
    } catch {
      toast.error("Failed to prepare repost pack");
    } finally {
      setIsPreparingPack(false);
    }
  };

  const shareListingWithCaption = async (listing: any) => {
    setIsSharingImages(true);
    try {
      const message = generateWhatsAppMessage(listing);
      const files = await groupedListingImageFiles(listing);
      await shareFilesOrFallback(
        files,
        message,
        listing.product?.name || "Runner product",
        "Shared images with editable caption",
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to prepare images");
    } finally {
      setIsSharingImages(false);
    }
  };

  const shareListingAsPoster = async (listing: any) => {
    setIsSharingImages(true);
    try {
      const message = generateWhatsAppMessage(listing);
      const files = [await createCaptionedImageFile(listing)];
      await shareFilesOrFallback(
        files,
        message,
        listing.product?.name || "Runner product",
        "Shared poster image. Caption also copied.",
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to prepare poster");
    } finally {
      setIsSharingImages(false);
    }
  };

  const shareSelectedPackWithImages = async () => {
    if (selectedListings.length === 0) {
      toast.error("Select listings to repost first");
      return;
    }

    setIsSharingImages(true);
    try {
      const packMessage = generatePackMessage(
        selectedListings.map((listing) => generateWhatsAppMessage(listing)),
      );
      const files: File[] = [];

      for (const listing of selectedListings) {
        const listingFiles = await groupedListingImageFiles(listing);
        files.push(...listingFiles);
        if (files.length >= 10) break;
      }

      await shareFilesOrFallback(files, packMessage, "Runner repost pack");
    } catch (error: any) {
      toast.error(error?.message || "Failed to prepare image pack");
    } finally {
      setIsSharingImages(false);
    }
  };

  const queueBridgeRepost = async () => {
    const groupIdOrName = bridgeGroup.trim();

    if (selectedListings.length === 0) {
      toast.error("Select listings to repost first");
      return;
    }

    if (!groupIdOrName) {
      toast.error("Enter the runner WhatsApp group id or exact group name");
      return;
    }

    setIsQueueingBridgePost(true);
    try {
      localStorage.setItem("runner_whatsapp_group", groupIdOrName);
      const captionOverrides = Object.fromEntries(
        selectedListings
          .filter((listing) => captionDrafts[listing.id]?.trim())
          .map((listing) => [
            listing.id,
            normalizeRepostMessage(listing, captionDrafts[listing.id].trim()),
          ]),
      );
      const imageOverrides = Object.fromEntries(
        selectedListings
          .filter((listing) => (removedImageUrls[listing.id] || []).length > 0)
          .map((listing) => [listing.id, repostImagesForListing(listing)]),
      );
      const response = await runnerApi.queueWhatsAppSessionRepost({
        listingIds: selectedListings.map((listing) => listing.id),
        groupIdOrName,
        captionOverrides,
        imageOverrides,
        forceRepost: listingPostFilter === "CAPTION_ISSUE",
      });
      toast.success(
        `${response.data?.message || "Queued for WhatsApp bridge"} Refresh after the bridge posts to update status.`,
      );
      setSelectedListingIds([]);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to queue bridge repost",
      );
    } finally {
      setIsQueueingBridgePost(false);
    }
  };

  const applyListingPostFilter = async (value: ListingPostFilter) => {
    const wasCaptionIssue = listingPostFilter === "CAPTION_ISSUE";
    setListingPostFilter(value);
    setSelectedListingIds([]);
    if (value === "CAPTION_ISSUE") {
      await loadListings(listingSearch, 1, false, undefined, true);
    } else if (wasCaptionIssue) {
      await loadListings(listingSearch, 1);
    }
  };

  const markCaptionRecoveryAutomatically = async () => {
    const listingIds = selectedListingIds.length
      ? selectedListingIds
      : filteredListings.map((listing) => listing.id);
    if (listingIds.length === 0) {
      toast.error("No caption-problem listings are selected");
      return;
    }
    setIsMarkingCaptionRecovery(true);
    try {
      const response =
        await runnerApi.recoverListingCaptionsAutomatically(listingIds);
      toast.success(response.data?.message || "Caption recovery queued");
      setSelectedListingIds([]);
      await loadListings(listingSearch, 1, false, undefined, true);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to queue caption recovery",
      );
    } finally {
      setIsMarkingCaptionRecovery(false);
    }
  };

  const queueApprovedShopCapture = async () => {
    setIsQueueingCapture(true);
    try {
      const response = await runnerShopsApi.captureApprovedShops();
      toast.success(
        response.data?.message ||
          `Capture queued for ${response.data?.shopCount || 0} approved shop(s)`,
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ||
          "Failed to queue capture for approved shops",
      );
    } finally {
      setIsQueueingCapture(false);
    }
  };

  if (!isReady) {
    return (
      <div className="text-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "var(--text-secondary)" }}>
          Loading your listings...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            My Listings
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Manage your promoted products
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            themed
            disabled={isQueueingCapture}
            isLoading={isQueueingCapture}
            onClick={queueApprovedShopCapture}
            title="Capture WhatsApp posts from your approved joined shops"
          >
            <RadioTower className="w-4 h-4 mr-1" />
            Capture joined shops
          </Button>
          <Link href="/runner/products">
            <Button themed>
              <span className="text-lg mr-1">+</span> Add Products
            </Button>
          </Link>
          <Link href="/runner/dashboard">
            <Button variant="outline" themed>
              ← Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div
          className="p-4 rounded-xl"
          style={{
            backgroundColor: "var(--card-bg)",
            border: "1px solid var(--card-border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Total Listings
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {listings.length}
          </p>
        </div>
        <div
          className="p-4 rounded-xl"
          style={{
            backgroundColor: "var(--card-bg)",
            border: "1px solid var(--card-border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Active Listings
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {listings.filter((l) => l.status === "ACTIVE").length}
          </p>
        </div>
        <div
          className="p-4 rounded-xl"
          style={{
            backgroundColor: "var(--card-bg)",
            border: "1px solid var(--card-border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Avg. Markup
          </p>
          <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
            {listings.length > 0
              ? `${((listings.reduce((sum, l) => sum + l.markup, 0) / listings.length) * 100).toFixed(0)}%`
              : "0%"}
          </p>
        </div>
        {phase2Enabled && (
          <div
            className="p-4 rounded-xl"
            style={{
              backgroundColor: "var(--card-bg)",
              border: "1px solid var(--card-border)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              WhatsApp Orders
            </p>
            <p
              className="text-2xl font-bold"
              style={{ color: "var(--accent)" }}
            >
              {
                orderRequests.filter((request) => request.status === "NEW")
                  .length
              }
            </p>
          </div>
        )}
      </div>

      <ImageSearchPanel title="Find Captured Product By Image" compact />

      <div
        className="rounded-xl p-4"
        style={{
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Listing cleanup
            </p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Delete only your runner listing records by source post age or
              listing age. Captured shop products remain available for other
              runners.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={cleanupBasis}
              onChange={(event) =>
                setCleanupBasis(event.target.value as "capture" | "listing")
              }
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="capture">Source post age</option>
              <option value="listing">Listing age</option>
            </select>
            <label
              className="flex items-center gap-2 text-sm font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Older than
              <input
                type="number"
                min={1}
                max={cleanupUnit === "hours" ? 8760 : 365}
                value={cleanupAge}
                onChange={(event) =>
                  setCleanupAge(Number(event.target.value || 1))
                }
                className="w-20 rounded-lg border px-3 py-2 text-sm font-normal"
              />
              <select
                value={cleanupUnit}
                onChange={(event) =>
                  setCleanupUnit(event.target.value as "hours" | "days")
                }
                className="rounded-lg border px-3 py-2 text-sm font-normal"
              >
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </label>
            <Button
              variant="outline"
              themed
              disabled={isCleaningListings}
              isLoading={isCleaningListings}
              onClick={handleDeleteListingsByAge}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete old listings
            </Button>
            <Button variant="outline" themed onClick={() => loadListings()}>
              <RotateCcw className="mr-1 h-4 w-4" />
              Refresh status
            </Button>
          </div>
        </div>
      </div>

      {phase2Enabled && (
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: "var(--card-bg)",
            border: "1px solid var(--card-border)",
          }}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Incoming WhatsApp order requests
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Private customer messages are matched using the listing order
                code.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                themed
                onClick={toggleAllOrderConversations}
              >
                {showOrderConversations ? (
                  <EyeOff className="mr-1 h-4 w-4" />
                ) : (
                  <Eye className="mr-1 h-4 w-4" />
                )}
                {showOrderConversations ? "Hide chats" : "Show chats"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                themed
                disabled={loadingOrderRequests}
                isLoading={loadingOrderRequests}
                onClick={loadOrderRequests}
              >
                Refresh
              </Button>
              <Link href="/runner/order-requests">
                <Button size="sm" themed>
                  Open WhatsApp Orders
                </Button>
              </Link>
            </div>
          </div>

          {orderRequests.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No WhatsApp order requests captured yet.
            </p>
          ) : (
            <div className="space-y-3">
              {orderRequests.slice(0, 5).map((request) => {
                const conversationVisible = isOrderConversationVisible(
                  request.id,
                );

                return (
                  <div
                    key={request.id}
                    className="rounded-lg border p-3"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p
                          className="font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {request.listing?.product?.name ||
                            request.orderCode ||
                            "Unmatched request"}
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {[
                            request.customerName || request.customerPhone,
                            request.orderCode,
                            request.receivedAt
                              ? new Date(request.receivedAt).toLocaleString()
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          themed
                          onClick={() => toggleOrderConversation(request.id)}
                        >
                          {conversationVisible ? (
                            <EyeOff className="mr-1 h-4 w-4" />
                          ) : (
                            <Eye className="mr-1 h-4 w-4" />
                          )}
                          {conversationVisible ? "Hide chat" : "View chat"}
                        </Button>
                        {request.orderId && (
                          <Link href={`/orders/${request.orderId}`}>
                            <Button size="sm" variant="outline" themed>
                              View order
                            </Button>
                          </Link>
                        )}
                        {!request.orderId && request.status === "NEW" && (
                          <Button
                            size="sm"
                            themed
                            disabled={convertingOrderRequestId === request.id}
                            isLoading={convertingOrderRequestId === request.id}
                            onClick={() => handleConvertOrderRequest(request)}
                          >
                            Create order
                          </Button>
                        )}
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            request.status === "NEW"
                              ? "bg-green-100 text-green-700"
                              : request.status === "CONVERTED"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {request.status}
                        </span>
                      </div>
                    </div>
                    {conversationVisible ? (
                      <div
                        className="mt-3 rounded-lg p-3"
                        style={{ backgroundColor: "var(--bg-secondary)" }}
                      >
                        <p
                          className="mb-1 text-xs font-semibold uppercase"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Conversation
                        </p>
                        <p
                          className="whitespace-pre-wrap text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {request.messageText}
                        </p>
                      </div>
                    ) : (
                      <p
                        className="mt-2 text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Conversation hidden. Open this chat to review the
                        captured WhatsApp replies for this request.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <section
        className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
        style={{
          backgroundColor: runnerProfile?.autoPostEnabled
            ? "#ecfdf5"
            : "#fff7ed",
          borderColor: runnerProfile?.autoPostEnabled ? "#86efac" : "#fdba74",
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-1 h-3 w-3 flex-none rounded-full ${
              runnerProfile?.autoPostEnabled ? "bg-green-600" : "bg-orange-500"
            }`}
          />
          <div>
            <h2 className="font-bold text-zinc-950">
              Automatic reposting is{" "}
              {runnerProfile?.autoPostEnabled ? "running" : "paused"}
            </h2>
            <p className="mt-1 text-sm text-zinc-700">
              This master control applies to all your shops and destinations.
              Individual shop and listing approvals still apply.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:min-w-72">
          <label className="text-xs font-bold uppercase text-zinc-700">
            Caption price format
            <select
              value={runnerProfile?.repostPriceMode || "ORIGINAL"}
              disabled={isUpdatingReposting}
              onChange={(event) => handleRepostPriceMode(event.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-950"
            >
              <option value="ORIGINAL">Original text only</option>
              <option value="TOTAL_ONLY">Original + final runner prices</option>
              <option value="FEE_BREAKDOWN">
                Original + fee breakdown prices
              </option>
              <option value="STOCK_EACH_TOTALS">
                Original + runner STOCK and EACH prices
              </option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-950">
            <span>Order code + link</span>
            <input
              type="checkbox"
              checked={runnerProfile?.repostOrderDetailsEnabled !== false}
              disabled={isUpdatingReposting}
              onChange={(event) =>
                handleOrderDetailsToggle(event.target.checked)
              }
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-950">
            <span>Show fee percentage</span>
            <input
              type="checkbox"
              checked={runnerProfile?.repostFeePercentageEnabled !== false}
              disabled={isUpdatingReposting}
              onChange={(event) =>
                handleFeePercentageToggle(event.target.checked)
              }
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-start justify-between gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-950">
            <span>
              Original prices on earlier images
              <span className="mt-1 block text-xs font-normal text-zinc-600">
                Images before the last one get only original prices.
              </span>
            </span>
            <input
              type="checkbox"
              checked={
                runnerProfile?.phase1Setup
                  ?.repostOriginalPricePerImageEnabled === true
              }
              disabled={isUpdatingReposting}
              onChange={(event) =>
                handleOriginalPricePerImageToggle(event.target.checked)
              }
              className="mt-1 h-4 w-4"
            />
          </label>
          {runnerProfile?.autoPostEnabled ? (
            <Button
              variant="outline"
              disabled={isUpdatingReposting}
              isLoading={isUpdatingReposting}
              onClick={() => handleRepostingControl(false)}
              className="border-orange-600 text-orange-800 hover:bg-orange-100"
            >
              <Pause className="mr-2 h-4 w-4" />
              Pause reposting
            </Button>
          ) : (
            <Button
              themed
              disabled={isUpdatingReposting || !selectedPostingAgeDays()}
              isLoading={isUpdatingReposting}
              onClick={() => handleRepostingControl(true)}
            >
              <Play className="mr-2 h-4 w-4" />
              Start reposting
            </Button>
          )}
        </div>
      </section>

      {listings.length > 0 && (
        <div
          className="rounded-xl p-4 space-y-4"
          style={{
            backgroundColor: "var(--card-bg)",
            border: "1px solid var(--card-border)",
          }}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                WhatsApp repost pack
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {selectedListings.length} selected from{" "}
                {filteredListings.length} visible / {listings.length} loaded
                {listingTotal > listings.length
                  ? ` of ${listingTotal} total`
                  : ""}{" "}
                listings
              </p>
              <p
                className="mt-1 text-xs font-semibold"
                style={{
                  color:
                    selectedDestinationGroup &&
                    postFilterCounts.NOT_POSTED_TO_GROUP > 0
                      ? "#b45309"
                      : "var(--text-muted)",
                }}
              >
                {selectedDestinationGroup
                  ? `${destinationPostSummary?.notPosted ?? postFilterCounts.NOT_POSTED_TO_GROUP} total not yet posted to ${destinationPostSummary?.destinationName || selectedDestinationLabel} · ${postFilterCounts.NOT_POSTED_TO_GROUP} in the ${listings.length} loaded listings · Updated ${formatStatusAge(repostStatusUpdatedAt, statusClock)}`
                  : "Choose a destination group to track posted vs not posted per group"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                themed
                onClick={selectNotPostedToSelectedGroup}
                title="Select active listings not yet posted to the selected destination group"
              >
                <CheckSquare className="w-4 h-4 mr-1" />
                Select not posted
              </Button>
              <Button
                variant="outline"
                themed
                onClick={selectActiveListings}
                title="Select all visible active listings"
              >
                <CheckSquare className="w-4 h-4 mr-1" />
                Select visible active
              </Button>
              <Button
                variant="outline"
                themed
                onClick={() => setSelectedListingIds([])}
              >
                Clear
              </Button>
              <Button
                themed
                disabled={isPreparingPack || selectedListings.length === 0}
                isLoading={isPreparingPack}
                onClick={() => prepareListingPack(false)}
              >
                <Copy className="w-4 h-4 mr-1" />
                Copy captions
              </Button>
              <Button
                themed
                disabled={isPreparingPack || selectedListings.length === 0}
                isLoading={isPreparingPack}
                onClick={() => prepareListingPack(true)}
              >
                <Send className="w-4 h-4 mr-1" />
                Open WhatsApp text
              </Button>
              <Button
                themed
                disabled={isSharingImages || selectedListings.length === 0}
                isLoading={isSharingImages}
                onClick={shareSelectedPackWithImages}
                title="Share selected product images with one combined caption"
              >
                <ImageIcon className="w-4 h-4 mr-1" />
                Share selected media
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <select
              value={bridgeGroup}
              onChange={(event) => {
                setBridgeGroup(event.target.value);
                localStorage.setItem(
                  "runner_whatsapp_group",
                  event.target.value,
                );
              }}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Select destination group</option>
              {runnerDestinationGroups.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.name}
                  {group.participants ? ` (${group.participants})` : ""}
                </option>
              ))}
            </select>
            <Button
              themed
              disabled={
                isQueueingBridgePost ||
                selectedListings.length === 0 ||
                !bridgeGroup.trim()
              }
              isLoading={isQueueingBridgePost}
              onClick={queueBridgeRepost}
              title="Queue true WhatsApp media captions through the session bridge"
            >
              <RadioTower className="w-4 h-4 mr-1" />
              Queue media post
            </Button>
          </div>

          <form
            className="grid gap-2 md:grid-cols-[1fr_auto_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              loadListings(listingSearch);
            }}
          >
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                value={listingSearch}
                onChange={(event) => setListingSearch(event.target.value)}
                placeholder="Search by shop, group, order code, or captured date (YYYY-MM-DD)"
                className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <Button type="submit" variant="outline" themed>
              Search listings
            </Button>
            {listingSearch.trim() && (
              <Button
                type="button"
                variant="outline"
                themed
                onClick={() => {
                  setListingSearch("");
                  loadListings("");
                }}
              >
                Clear search
              </Button>
            )}
          </form>

          <div
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end"
            style={{
              borderColor: "var(--card-border)",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            <label
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Post items captured in the last
              <div className="mt-1 flex overflow-hidden rounded-lg border bg-white">
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={postingAgeDays}
                  onChange={(event) => setPostingAgeDays(event.target.value)}
                  className="min-w-0 flex-1 px-3 py-2 font-normal outline-none"
                />
                <span className="border-l px-3 py-2 text-sm font-semibold text-zinc-700">
                  days
                </span>
              </div>
              <span className="mt-1 block text-xs font-normal text-zinc-600">
                Only listings captured within this age are loaded for posting.
              </span>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                themed
                onClick={() => loadListings(listingSearch)}
              >
                Apply filters
              </Button>
              {(postingAgeDays !== String(DEFAULT_POSTING_AGE_DAYS) ||
                listingStatusFilter ||
                listingSearch.trim()) && (
                <Button
                  type="button"
                  variant="outline"
                  themed
                  onClick={() => {
                    setPostingAgeDays(String(DEFAULT_POSTING_AGE_DAYS));
                    setListingStatusFilter("");
                    setListingSearch("");
                    loadListings("", 1, false, {
                      ageDays: String(DEFAULT_POSTING_AGE_DAYS),
                      status: "",
                    });
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Listing status
              <select
                value={listingStatusFilter}
                onChange={(event) => setListingStatusFilter(event.target.value)}
                className="mt-1 block w-full rounded-lg border px-3 py-2 font-normal"
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="PAUSED">Paused</option>
                <option value="STOPPED">Stopped</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["ALL", "All"],
                ["NOT_POSTED_TO_GROUP", "Not posted"],
                ["POSTED_TO_GROUP", "Posted"],
                ["NEVER_POSTED", "Never posted"],
                ["POSTED_ANYWHERE", "Posted anywhere"],
                ["CAPTION_ISSUE", "Missing/unverified text"],
              ] as Array<[ListingPostFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => void applyListingPostFilter(value)}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition hover:opacity-80"
                style={
                  listingPostFilter === value
                    ? {
                        backgroundColor: "var(--accent)",
                        borderColor: "var(--accent)",
                        color: "#fff",
                      }
                    : {
                        backgroundColor:
                          value === "NOT_POSTED_TO_GROUP"
                            ? "#fef3c7"
                            : "var(--bg-secondary)",
                        borderColor:
                          value === "NOT_POSTED_TO_GROUP"
                            ? "#f59e0b"
                            : "var(--card-border)",
                        color:
                          value === "NOT_POSTED_TO_GROUP"
                            ? "#92400e"
                            : "var(--text-primary)",
                      }
                }
              >
                {value === "ALL" && <ListFilter className="h-4 w-4" />}
                {label} {postFilterCounts[value]}
              </button>
            ))}
          </div>

          {listingPostFilter === "CAPTION_ISSUE" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="mr-auto text-sm font-semibold text-amber-950">
                Recover affected posts automatically or force a manual repost to
                the selected destination.
              </p>
              <Button
                variant="outline"
                themed
                onClick={() =>
                  setSelectedListingIds(
                    filteredListings.map((listing) => listing.id),
                  )
                }
              >
                Select all shown
              </Button>
              <Button
                variant="outline"
                themed
                isLoading={isMarkingCaptionRecovery}
                disabled={isMarkingCaptionRecovery}
                onClick={markCaptionRecoveryAutomatically}
              >
                Recover automatically
              </Button>
              <Button
                themed
                isLoading={isQueueingBridgePost}
                disabled={
                  isQueueingBridgePost || selectedListingIds.length === 0
                }
                onClick={queueBridgeRepost}
              >
                Repost selected now
              </Button>
            </div>
          )}

          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Bridge posts attach the caption to the image. Run{" "}
            <code>npm run whatsapp:session:bridge</code> in the backend.
          </p>
        </div>
      )}

      {/* Listings */}
      {listings.length === 0 ? (
        <div className="text-center py-12">
          <p className="mb-4" style={{ color: "var(--text-secondary)" }}>
            You haven't added any products yet
          </p>
          <Link href="/runner/products">
            <Button themed>Browse Products</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredListings.length === 0 ? (
            <div
              className="rounded-xl border p-8 text-center"
              style={{
                backgroundColor: "var(--card-bg)",
                borderColor: "var(--card-border)",
              }}
            >
              <p
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                No listings match this posting filter
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Change the posting filter or choose another destination group.
              </p>
            </div>
          ) : (
            filteredListings.map((listing) => {
              const postingBadge = postingBadgeForListing(listing);
              const postedGroups = repostLogsForListing(listing).slice(0, 4);
              const traceMeta = listingTraceMeta(listing);

              return (
                <div
                  key={listing.id}
                  className="p-4 rounded-xl"
                  style={{
                    backgroundColor: "var(--card-bg)",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  <div className="flex items-start gap-4">
                    <button
                      type="button"
                      onClick={() => toggleListingSelection(listing.id)}
                      className="rounded-lg p-2 shadow-md"
                      style={{
                        backgroundColor: "var(--surface-raised)",
                        color: selectedListingIds.includes(listing.id)
                          ? "var(--accent)"
                          : "var(--text-muted)",
                        border: "1px solid var(--card-border)",
                      }}
                      title={
                        selectedListingIds.includes(listing.id)
                          ? "Remove from repost pack"
                          : "Add to repost pack"
                      }
                    >
                      {selectedListingIds.includes(listing.id) ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>

                    {/* Product Image */}
                    <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200">
                      {repostImagesForListing(listing)[0] ? (
                        isVideoMedia(repostImagesForListing(listing)[0]) ? (
                          <video
                            src={repostImagesForListing(listing)[0]}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={repostImagesForListing(listing)[0]}
                            alt={listing.product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          📦
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3
                            className="font-semibold text-lg"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {listing.product?.name}
                          </h3>
                          <p
                            className="text-sm"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {listing.product?.shop?.name}
                          </p>
                          {listing.orderCode && (
                            <p
                              className="mt-1 text-xs font-semibold"
                              style={{ color: "var(--accent)" }}
                            >
                              Order code: {listing.orderCode}
                            </p>
                          )}
                          <div
                            className={`mt-2 inline-flex max-w-full flex-col rounded-lg border px-3 py-2 text-xs font-semibold ${postingBadge.className}`}
                          >
                            <span>{postingBadge.label}</span>
                            <span className="font-medium opacity-90">
                              {postingBadge.detail}
                            </span>
                          </div>
                          {postedGroups.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {postedGroups.map((log: any) => (
                                <span
                                  key={
                                    log.id ||
                                    `${listing.id}-${log.groupIdOrName}`
                                  }
                                  className="rounded-full border border-green-200 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-800"
                                  title={`Posted ${new Date(log.postedAt).toLocaleString()}`}
                                >
                                  {log.groupName || "Unknown WhatsApp Group"}
                                </span>
                              ))}
                            </div>
                          )}
                          <div
                            className="mt-3 grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-2 lg:grid-cols-3"
                            style={{
                              backgroundColor: "var(--bg-secondary)",
                              borderColor: "var(--card-border)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {[
                              ["Shop", traceMeta.shopName],
                              ["Source group", traceMeta.sourceGroup],
                              ["Runner", traceMeta.runnerName],
                              [
                                "Captured",
                                formatTraceDate(traceMeta.capturedAt),
                              ],
                              ["Item age", itemAge(traceMeta.capturedAt)],
                              [
                                "Reposted",
                                formatTraceDate(traceMeta.repostedAt),
                              ],
                              ["Reposted group", traceMeta.repostedGroup],
                              ["Caption delivery", traceMeta.captionDelivery],
                            ].map(([label, value]) => (
                              <div key={`${listing.id}-${label}`}>
                                <p
                                  className="font-semibold uppercase"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {label}
                                </p>
                                <p
                                  className="mt-0.5 truncate font-medium"
                                  title={String(value || "")}
                                >
                                  {value}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            listing.status === "ACTIVE"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {listing.status}
                        </span>
                      </div>

                      {/* Pricing */}
                      {editingId === listing.id ? (
                        <div className="mt-3 space-y-2">
                          <div>
                            <label
                              className="text-sm"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              Markup: {(editMarkup * 100).toFixed(0)}%
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={editMarkup}
                              onChange={(e) =>
                                setEditMarkup(parseFloat(e.target.value))
                              }
                              className="w-full"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              themed
                              onClick={() => handleUpdateMarkup(listing.id)}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              themed
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center gap-4">
                          <div>
                            <p
                              className="text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Base Price
                            </p>
                            <p
                              className="font-medium"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {formatCurrency(listing.product?.basePrice)}
                            </p>
                          </div>
                          <div>
                            <p
                              className="text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Your Price
                            </p>
                            <p
                              className="font-bold text-lg"
                              style={{ color: "var(--accent)" }}
                            >
                              {formatCurrency(listing.runnerPrice)}
                            </p>
                          </div>
                          <div>
                            <p
                              className="text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Your Profit
                            </p>
                            <p className="font-bold text-green-500">
                              +
                              {formatCurrency(
                                listing.runnerPrice -
                                  listing.product?.basePrice,
                              )}
                            </p>
                          </div>
                        </div>
                      )}

                      <ProductPricingSummary
                        product={listing.product}
                        runnerMarkup={listing.markup}
                      />

                      <div
                        className="mt-4 rounded-lg border p-3"
                        style={{ borderColor: "var(--card-border)" }}
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p
                              className="text-sm font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              Automatic reposting
                            </p>
                            <p
                              className="text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {postingBadge.label === "Not yet posted"
                                ? "Not yet posted to the selected destination"
                                : listing.lastPostedAt
                                  ? `Last posted ${new Date(
                                      listing.lastPostedAt,
                                    ).toLocaleString()}`
                                  : "Posted log recorded"}
                              {Number(listing.postCount || 0) > 0
                                ? ` · ${listing.postCount} post${
                                    listing.postCount === 1 ? "" : "s"
                                  }`
                                : ""}
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={Boolean(listing.autoPostApproved)}
                              disabled={updatingAutoPostId === listing.id}
                              onChange={(event) =>
                                handleAutoPostToggle(
                                  listing,
                                  event.target.checked,
                                )
                              }
                              className="h-4 w-4"
                            />
                            <span style={{ color: "var(--text-primary)" }}>
                              Approved
                            </span>
                          </label>
                        </div>

                        <details
                          className="mb-3 rounded-md border p-2"
                          style={{ borderColor: "var(--card-border)" }}
                        >
                          <summary
                            className="cursor-pointer text-sm font-semibold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            Reposting schedule · {listing.status}
                          </summary>
                          <div className="mt-3 grid gap-2">
                            <label
                              className="text-xs font-semibold"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              Scheduled start
                              <input
                                type="datetime-local"
                                value={
                                  scheduleDrafts[listing.id]
                                    ?.scheduledStartAt || ""
                                }
                                onChange={(event) =>
                                  setScheduleDrafts((current) => ({
                                    ...current,
                                    [listing.id]: {
                                      ...current[listing.id],
                                      scheduledStartAt: event.target.value,
                                    },
                                  }))
                                }
                                className="mt-1 w-full rounded-md border px-2 py-1.5"
                              />
                            </label>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              themed
                              disabled={updatingAutoPostId === listing.id}
                              onClick={() =>
                                updateListingRepostControl(
                                  listing,
                                  listing.status === "PAUSED"
                                    ? "RESUME"
                                    : "START_NOW",
                                )
                              }
                            >
                              <Play className="mr-1 h-4 w-4" />
                              {listing.status === "PAUSED"
                                ? "Resume"
                                : "Start now"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              themed
                              disabled={updatingAutoPostId === listing.id}
                              onClick={() =>
                                updateListingRepostControl(listing, "SCHEDULE")
                              }
                            >
                              Schedule
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              themed
                              disabled={
                                updatingAutoPostId === listing.id ||
                                listing.status === "PAUSED"
                              }
                              onClick={() =>
                                updateListingRepostControl(listing, "PAUSE")
                              }
                            >
                              <Pause className="mr-1 h-4 w-4" />
                              Pause
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-700"
                              disabled={
                                updatingAutoPostId === listing.id ||
                                listing.status === "STOPPED"
                              }
                              onClick={() =>
                                updateListingRepostControl(listing, "STOP")
                              }
                            >
                              Stop
                            </Button>
                          </div>
                        </details>

                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <p
                              className="text-sm font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              Repost media
                            </p>
                            <p
                              className="text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {repostImagesForListing(listing).length} of{" "}
                              {originalProductMedia(listing.product).length}{" "}
                              media included
                            </p>
                          </div>
                          {(removedImageUrls[listing.id] || []).length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              themed
                              onClick={() => restoreListingImages(listing.id)}
                            >
                              <RotateCcw className="w-4 h-4 mr-1" />
                              Restore
                            </Button>
                          )}
                        </div>

                        {originalProductMedia(listing.product).length === 0 ? (
                          <p
                            className="text-sm"
                            style={{ color: "var(--text-muted)" }}
                          >
                            No product media captured for this listing.
                          </p>
                        ) : (
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {originalProductMedia(listing.product).map(
                              (imageUrl, index) => {
                                const isRemoved = (
                                  removedImageUrls[listing.id] || []
                                ).includes(imageUrl);

                                return (
                                  <div
                                    key={`${listing.id}-${imageUrl}-${index}`}
                                    className={`relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border ${
                                      isRemoved ? "opacity-45 grayscale" : ""
                                    }`}
                                    style={{
                                      borderColor: isRemoved
                                        ? "#ef4444"
                                        : "var(--card-border)",
                                    }}
                                  >
                                    {isVideoMedia(imageUrl) ? (
                                      <video
                                        src={imageUrl}
                                        className="h-full w-full object-cover"
                                        muted
                                        playsInline
                                        preload="metadata"
                                      />
                                    ) : (
                                      <img
                                        src={imageUrl}
                                        alt={`${listing.product.name} media ${index + 1}`}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    )}
                                    {!isRemoved ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeListingImageFromRepost(
                                            listing.id,
                                            imageUrl,
                                          )
                                        }
                                        className="absolute right-1 top-1 rounded-full bg-black/75 p-1 text-white"
                                        title="Remove from repost bundle"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    ) : (
                                      <span className="absolute bottom-1 left-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                        Removed
                                      </span>
                                    )}
                                  </div>
                                );
                              },
                            )}
                          </div>
                        )}
                      </div>

                      <div
                        className="mt-4 rounded-lg border p-3"
                        style={{ borderColor: "var(--card-border)" }}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p
                            className="text-sm font-semibold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            Repost text
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              themed
                              onClick={() =>
                                setEditingCaptionId(
                                  editingCaptionId === listing.id
                                    ? null
                                    : listing.id,
                                )
                              }
                            >
                              <PencilLine className="w-4 h-4 mr-1" />
                              {editingCaptionId === listing.id
                                ? "Done"
                                : "Edit"}
                            </Button>
                            {captionDrafts[listing.id] && (
                              <Button
                                size="sm"
                                variant="outline"
                                themed
                                onClick={() => resetCaptionDraft(listing)}
                              >
                                Reset
                              </Button>
                            )}
                          </div>
                        </div>

                        {editingCaptionId === listing.id ? (
                          <textarea
                            value={repostMessageForListing(listing)}
                            onChange={(event) =>
                              saveCaptionDraft(listing.id, event.target.value)
                            }
                            rows={5}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          />
                        ) : (
                          <pre
                            className="whitespace-pre-wrap text-sm"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {repostMessageForListing(listing)}
                          </pre>
                        )}
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-3 sm:w-52">
                      <Button
                        themed
                        disabled={isSharingImages}
                        onClick={() => shareListingWithCaption(listing)}
                        title="Repost product media with its editable caption"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Repost
                      </Button>
                      <details
                        className="rounded-lg border p-2"
                        style={{ borderColor: "var(--card-border)" }}
                      >
                        <summary
                          className="cursor-pointer px-1 py-2 text-sm font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Actions
                        </summary>
                        <div className="mt-2 grid gap-3">
                          <div
                            className="rounded-lg border p-2"
                            style={{ borderColor: "var(--card-border)" }}
                          >
                            <p
                              className="mb-2 text-xs font-semibold uppercase"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Repost
                            </p>
                            <div className="grid gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                themed
                                onClick={() => handleWhatsAppShare(listing)}
                                title="Open WhatsApp with caption"
                              >
                                <MessageCircle className="mr-1 h-4 w-4" />
                                Text
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                themed
                                disabled={isSharingImages}
                                onClick={() => shareListingWithCaption(listing)}
                                title="Share images with editable WhatsApp caption"
                              >
                                <ImageIcon className="mr-1 h-4 w-4" />
                                Media
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                themed
                                onClick={() => handleCopyLink(listing)}
                                title="Copy caption"
                              >
                                <Copy className="mr-1 h-4 w-4" />
                                Copy
                              </Button>
                            </div>
                          </div>

                          <div
                            className="rounded-lg border p-2"
                            style={{ borderColor: "var(--card-border)" }}
                          >
                            <p
                              className="mb-2 text-xs font-semibold uppercase"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Manage
                            </p>
                            <div className="grid gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                themed
                                onClick={() => {
                                  setEditingId(listing.id);
                                  setEditMarkup(listing.markup);
                                }}
                              >
                                <Edit2 className="mr-1 h-4 w-4" />
                                Markup
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                themed
                                disabled={isSharingImages}
                                onClick={() => shareListingAsPoster(listing)}
                                title="Create image poster with text below"
                              >
                                <PanelBottom className="mr-1 h-4 w-4" />
                                Poster
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-amber-700 hover:bg-amber-50"
                                disabled={skippingListingId === listing.id}
                                isLoading={skippingListingId === listing.id}
                                onClick={() => handleSkipListing(listing)}
                              >
                                <Ban className="mr-1 h-4 w-4" />
                                Do not buy
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-500 hover:bg-red-50"
                                onClick={() => handleDelete(listing.id)}
                              >
                                <Trash2 className="mr-1 h-4 w-4" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {hasMoreListings && (
            <div className="flex justify-center py-3">
              <Button
                variant="outline"
                themed
                disabled={loadingMore}
                isLoading={loadingMore}
                onClick={() =>
                  loadListings(listingSearch, listingPage + 1, true)
                }
              >
                Load 40 more listings
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

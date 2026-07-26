"use client";

import { useEffect, useState } from "react";
import { useRunnerGuard } from "@/hooks/useRoleGuard";
import {
  CheckCircle,
  Clock,
  Package,
  Plus,
  RefreshCw,
  Save,
  ShoppingCart,
  Store,
  Target,
  XCircle,
} from "lucide-react";
import { shopsApi, runnerShopsApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import ShopWhatsAppAvatars, {
  ShopWhatsAppGroupAvatar,
} from "@/components/shops/ShopWhatsAppAvatars";
import { isVideoMedia, parseProductMedia } from "@/lib/productMedia";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import Link from "next/link";

export type RunnerMarketplaceTab = "discover" | "my-shops" | "marketplace";

interface Shop {
  id: string;
  name: string;
  description: string | null;
  phone: string;
  address: string | null;
  status: string;
  owner: {
    name: string;
    phone: string;
  };
  _count?: {
    products: number;
  };
  relatedWhatsAppGroups?: ShopWhatsAppGroupAvatar[];
}

interface RunnerShopAssignment {
  id: string;
  status: string;
  joinedAt: string;
  approvedAt: string | null;
  notes: string | null;
  autoListEnabled: boolean;
  autoPostEnabled: boolean;
  markupPercent: number;
  destinationGroup: string | null;
  maxPostsPerRun: number;
  maximumListingAgeDays: number;
  minPrice: number | null;
  maxPrice: number | null;
  categoryFilter: string | null;
  requireMedia: boolean;
  shop: {
    id: string;
    name: string;
    description: string | null;
    phone: string;
    address: string | null;
    owner: {
      name: string;
      phone: string;
    };
    _count?: {
      products: number;
    };
    relatedWhatsAppGroups?: ShopWhatsAppGroupAvatar[];
  };
}

interface DestinationGroup {
  groupId: string;
  name: string;
  participants: number;
  profileImageUrl?: string | null;
  lastSeenAt: string;
  runnerRepostingGroupId?: string | null;
  isOwnGroup?: boolean;
  isTestGroup?: boolean;
  scope?: "test" | "live";
  readinessStatus?: string | null;
}

const DEFAULT_MAX_POSTS_PER_RUN = 10;
const LIVE_CAPTURE_SHOP_LIMIT = 30;

export function RunnerMarketplaceContent({
  defaultTab = "discover",
  embedded = false,
}: {
  defaultTab?: RunnerMarketplaceTab;
  embedded?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<RunnerMarketplaceTab>(defaultTab);
  const [shops, setShops] = useState<Shop[]>([]);
  const [myShops, setMyShops] = useState<RunnerShopAssignment[]>([]);
  const [destinationGroups, setDestinationGroups] = useState<
    DestinationGroup[]
  >([]);
  const [marketplace, setMarketplace] = useState<any>(null);
  const [showAllMarketplaceShops, setShowAllMarketplaceShops] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState<string | null>(null);
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(
    null,
  );
  const [savingAutomationId, setSavingAutomationId] = useState<string | null>(
    null,
  );
  const [isRefreshingDestinations, setIsRefreshingDestinations] =
    useState(false);
  const [updatingDestinationScopeId, setUpdatingDestinationScopeId] = useState<
    string | null
  >(null);
  const [destinationRefreshMessage, setDestinationRefreshMessage] =
    useState("");
  const [globalAutomationDraft, setGlobalAutomationDraft] = useState({
    autoListEnabled: true,
    autoPostEnabled: true,
    requireMedia: true,
    markupPercent: 0.3,
    maxPostsPerRun: DEFAULT_MAX_POSTS_PER_RUN,
    maximumListingAgeDays: 14,
    destinationGroups: [] as string[],
  });
  const [isApplyingGlobalAutomation, setIsApplyingGlobalAutomation] =
    useState(false);
  const [automationDrafts, setAutomationDrafts] = useState<Record<string, any>>(
    {},
  );
  const { user, isReady } = useRunnerGuard();

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    if (!isReady || !user) return;
    loadData();
  }, [isReady, activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === "discover") {
        const [response, assignmentsResponse] = await Promise.all([
          shopsApi.getAll({
            limit: 500,
            status: "ACTIVE",
            sortBy: "name",
            order: "asc",
          }),
          runnerShopsApi.getMyShops({ selectionScope: "live" }),
        ]);
        setShops(response.data.data || response.data || []);
        setMyShops(assignmentsResponse.data || []);
      } else if (activeTab === "my-shops") {
        const [shopsResponse, groupsResponse] = await Promise.all([
          runnerShopsApi.getMyShops({ selectionScope: "live" }),
          runnerShopsApi.getDestinationGroups().catch(() => null),
        ]);
        const assignments = shopsResponse.data || [];
        setMyShops(assignments);
        const groups = groupsResponse?.data?.data || [];
        setDestinationGroups(groups);
        setDestinationRefreshMessage(destinationGroupsMessage(groups));
        hydrateGlobalAutomationDefaults(assignments);
        setAutomationDrafts((current) => ({
          ...current,
          ...Object.fromEntries(
            assignments.map((assignment: RunnerShopAssignment) => [
              assignment.id,
              automationDraftFromAssignment(assignment),
            ]),
          ),
        }));
      } else if (activeTab === "marketplace") {
        const response = await runnerShopsApi.getMarketplace();
        setMarketplace(response.data);
      }
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const automationDraftFromAssignment = (assignment: RunnerShopAssignment) => ({
    autoListEnabled: Boolean(assignment.autoListEnabled),
    autoPostEnabled: Boolean(assignment.autoPostEnabled),
    markupPercent: Number(assignment.markupPercent ?? 0.3),
    destinationGroups: parseDestinationGroups(assignment.destinationGroup),
    maxPostsPerRun: Number(
      assignment.maxPostsPerRun || DEFAULT_MAX_POSTS_PER_RUN,
    ),
    maximumListingAgeDays: Number(assignment.maximumListingAgeDays || 14),
    minPrice: assignment.minPrice ?? "",
    maxPrice: assignment.maxPrice ?? "",
    categoryFilter: assignment.categoryFilter || "",
    requireMedia: assignment.requireMedia !== false,
  });

  const hydrateGlobalAutomationDefaults = (
    assignments: RunnerShopAssignment[],
  ) => {
    const approved =
      assignments.find((assignment) => assignment.status === "APPROVED") ||
      assignments[0];
    if (!approved) return;
    const selectedGroups = Array.from(
      new Set(
        assignments.flatMap((assignment) =>
          parseDestinationGroups(assignment.destinationGroup),
        ),
      ),
    ).slice(0, 2);

    setGlobalAutomationDraft((current) => ({
      ...current,
      autoListEnabled: Boolean(approved.autoListEnabled),
      autoPostEnabled: Boolean(approved.autoPostEnabled),
      requireMedia: approved.requireMedia !== false,
      markupPercent: Number(approved.markupPercent ?? 0.3),
      maxPostsPerRun: Number(
        approved.maxPostsPerRun || DEFAULT_MAX_POSTS_PER_RUN,
      ),
      maximumListingAgeDays: Number(approved.maximumListingAgeDays || 14),
      destinationGroups:
        current.destinationGroups.length > 0
          ? current.destinationGroups
          : selectedGroups,
    }));
  };

  const parseDestinationGroups = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value
        .map((group) => String(group || "").trim())
        .filter(Boolean)
        .slice(0, 2);
    }

    const clean = String(value || "").trim();
    if (!clean) return [];

    if (clean.startsWith("[")) {
      try {
        const parsed = JSON.parse(clean);
        return parseDestinationGroups(parsed);
      } catch {
        return [clean].slice(0, 2);
      }
    }

    return clean
      .split(",")
      .map((group) => group.trim())
      .filter(Boolean)
      .slice(0, 2);
  };

  const destinationGroupLabel = (groupId: string) => {
    const group = destinationGroups.find(
      (item) => item.groupId === groupId || item.name === groupId,
    );
    return group ? `${group.name} (${group.participants})` : groupId;
  };

  const destinationGroupFor = (groupId: string) =>
    destinationGroups.find(
      (item) => item.groupId === groupId || item.name === groupId,
    ) || {
      groupId,
      name: groupId,
      participants: 0,
      profileImageUrl: null,
      lastSeenAt: "",
    };

  const destinationGroupsMessage = (groups: DestinationGroup[]) => {
    const testCount = groups.filter((group) => group.isTestGroup).length;
    const liveCount = groups.filter((group) => !group.isTestGroup).length;
    const latestSeen = groups
      .map((group) => new Date(group.lastSeenAt).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    const latestText = latestSeen
      ? ` Last seen ${new Date(latestSeen).toLocaleString()}.`
      : "";
    return `${liveCount} live and ${testCount} test runner advertising group${groups.length === 1 ? "" : "s"} available.${latestText}`;
  };

  const liveDestinationGroups = destinationGroups.filter(
    (group) => !group.isTestGroup,
  );

  const refreshDestinationGroups = async (showToast = true) => {
    setIsRefreshingDestinations(true);
    try {
      const response = await runnerShopsApi.getDestinationGroups();
      const groups = response.data?.data || [];
      setDestinationGroups(groups);
      const message = destinationGroupsMessage(groups);
      setDestinationRefreshMessage(message);
      if (showToast) toast.success(message);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          "Failed to refresh runner advertising groups",
      );
    } finally {
      setIsRefreshingDestinations(false);
    }
  };

  const addDestinationGroup = (assignmentId: string, groupId: string) => {
    if (!groupId) return;
    const current = parseDestinationGroups(
      automationDrafts[assignmentId]?.destinationGroups,
    );
    if (current.includes(groupId) || current.length >= 2) return;
    updateAutomationDraft(assignmentId, "destinationGroups", [
      ...current,
      groupId,
    ]);
  };

  const removeDestinationGroup = (assignmentId: string, groupId: string) => {
    updateAutomationDraft(
      assignmentId,
      "destinationGroups",
      parseDestinationGroups(
        automationDrafts[assignmentId]?.destinationGroups,
      ).filter((item) => item !== groupId),
    );
  };

  const addDefaultDestinationGroup = (groupId: string) => {
    if (!groupId) return;
    setGlobalAutomationDraft((current) => {
      if (
        current.destinationGroups.includes(groupId) ||
        current.destinationGroups.length >= 2
      ) {
        return current;
      }
      return {
        ...current,
        destinationGroups: [...current.destinationGroups, groupId],
      };
    });
  };

  const removeDefaultDestinationGroup = (groupId: string) => {
    setGlobalAutomationDraft((current) => ({
      ...current,
      destinationGroups: current.destinationGroups.filter(
        (item) => item !== groupId,
      ),
    }));
  };

  const updateGlobalAutomationDraft = (field: string, value: any) => {
    setGlobalAutomationDraft((current) => ({ ...current, [field]: value }));
  };

  const updateDestinationGroupScope = async (
    group: DestinationGroup,
    isTestGroup: boolean,
  ) => {
    if (!group.isOwnGroup) {
      toast.error("Only groups linked to your runner profile can be switched");
      return;
    }

    setUpdatingDestinationScopeId(group.groupId);
    try {
      const response = await runnerShopsApi.updateDestinationGroupScope(
        group.runnerRepostingGroupId || group.groupId,
        isTestGroup,
      );
      const updated = response.data?.data;
      setDestinationGroups((current) =>
        current.map((item) => {
          if (isTestGroup && item.groupId !== group.groupId) {
            return { ...item, isTestGroup: false, scope: "live" };
          }
          if (item.groupId !== group.groupId) return item;
          return {
            ...item,
            ...updated,
            isTestGroup,
            scope: isTestGroup ? "test" : "live",
          };
        }),
      );
      if (isTestGroup) {
        setGlobalAutomationDraft((current) => ({
          ...current,
          destinationGroups: current.destinationGroups.filter(
            (groupId) => groupId !== group.groupId,
          ),
        }));
        setAutomationDrafts((current) =>
          Object.fromEntries(
            Object.entries(current).map(
              ([assignmentId, draft]: [string, any]) => [
                assignmentId,
                {
                  ...draft,
                  destinationGroups: parseDestinationGroups(
                    draft.destinationGroups,
                  ).filter((groupId) => groupId !== group.groupId),
                },
              ],
            ),
          ),
        );
      }
      toast.success(
        response.data?.message ||
          `${group.name} is now ${isTestGroup ? "primary" : "additional"}`,
      );
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to switch destination group",
      );
    } finally {
      setUpdatingDestinationScopeId(null);
    }
  };

  const buildAutomationPayload = (draft: any) => {
    const selectedDestinationGroups = parseDestinationGroups(
      draft.destinationGroups ?? draft.destinationGroup,
    );
    const payload: any = {
      autoListEnabled: Boolean(draft.autoListEnabled),
      autoPostEnabled: Boolean(draft.autoPostEnabled),
      markupPercent: Number(draft.markupPercent || 0),
      destinationGroup:
        selectedDestinationGroups.length > 0
          ? JSON.stringify(selectedDestinationGroups)
          : "",
      maxPostsPerRun: Number(draft.maxPostsPerRun || DEFAULT_MAX_POSTS_PER_RUN),
      maximumListingAgeDays: Number(draft.maximumListingAgeDays || 14),
      requireMedia: Boolean(draft.requireMedia),
    };

    if (draft.selectionScope) {
      payload.selectionScope = draft.selectionScope;
    }

    if (Object.prototype.hasOwnProperty.call(draft, "minPrice")) {
      payload.minPrice =
        draft.minPrice === "" || draft.minPrice === null
          ? null
          : Number(draft.minPrice);
    }

    if (Object.prototype.hasOwnProperty.call(draft, "maxPrice")) {
      payload.maxPrice =
        draft.maxPrice === "" || draft.maxPrice === null
          ? null
          : Number(draft.maxPrice);
    }

    if (Object.prototype.hasOwnProperty.call(draft, "categoryFilter")) {
      payload.categoryFilter = String(draft.categoryFilter || "").trim();
    }

    return payload;
  };

  const applyGlobalAutomationToAll = async () => {
    const selectedGroups = parseDestinationGroups(
      globalAutomationDraft.destinationGroups,
    );
    if (selectedGroups.length === 0) {
      toast.error("Choose at least one runner advertising group first");
      return;
    }

    const approvedAssignments = myShops.filter(
      (assignment) => assignment.status === "APPROVED",
    );
    if (approvedAssignments.length === 0) {
      toast.error("No approved shops to update");
      return;
    }

    setAutomationDrafts((current) => ({
      ...current,
      ...Object.fromEntries(
        approvedAssignments.map((assignment) => [
          assignment.id,
          {
            ...(current[assignment.id] ||
              automationDraftFromAssignment(assignment)),
            autoListEnabled: globalAutomationDraft.autoListEnabled,
            autoPostEnabled: globalAutomationDraft.autoPostEnabled,
            requireMedia: globalAutomationDraft.requireMedia,
            markupPercent: globalAutomationDraft.markupPercent,
            maxPostsPerRun: globalAutomationDraft.maxPostsPerRun,
            maximumListingAgeDays: globalAutomationDraft.maximumListingAgeDays,
            selectionScope: "live",
            destinationGroups: selectedGroups,
          },
        ]),
      ),
    }));

    setIsApplyingGlobalAutomation(true);
    try {
      const response = await runnerShopsApi.updateAllAutomation(
        buildAutomationPayload({
          autoListEnabled: globalAutomationDraft.autoListEnabled,
          autoPostEnabled: globalAutomationDraft.autoPostEnabled,
          requireMedia: globalAutomationDraft.requireMedia,
          markupPercent: globalAutomationDraft.markupPercent,
          maxPostsPerRun: globalAutomationDraft.maxPostsPerRun,
          maximumListingAgeDays: globalAutomationDraft.maximumListingAgeDays,
          selectionScope: "live",
          destinationGroups: selectedGroups,
        }),
      );
      const updatedAssignments: RunnerShopAssignment[] =
        response.data?.data || [];
      setMyShops((current) =>
        current.map(
          (item) =>
            updatedAssignments.find((updated) => updated.id === item.id) ||
            item,
        ),
      );
      setAutomationDrafts((current) => ({
        ...current,
        ...Object.fromEntries(
          updatedAssignments.map((assignment) => [
            assignment.id,
            automationDraftFromAssignment(assignment),
          ]),
        ),
      }));
      toast.success(
        response.data?.message ||
          `Applied automation settings to ${updatedAssignments.length} approved shop${updatedAssignments.length === 1 ? "" : "s"}`,
      );
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          "Failed to apply automation settings to all shops",
      );
    } finally {
      setIsApplyingGlobalAutomation(false);
    }
  };

  const updateAutomationDraft = (
    assignmentId: string,
    field: string,
    value: any,
  ) => {
    setAutomationDrafts((current) => ({
      ...current,
      [assignmentId]: {
        ...(current[assignmentId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveAutomation = async (assignment: RunnerShopAssignment) => {
    const draft =
      automationDrafts[assignment.id] ||
      automationDraftFromAssignment(assignment);

    setSavingAutomationId(assignment.id);
    try {
      const response = await runnerShopsApi.updateAutomation(
        assignment.shop.id,
        buildAutomationPayload(draft),
      );
      setMyShops((current) =>
        current.map((item) =>
          item.id === assignment.id ? response.data : item,
        ),
      );
      setAutomationDrafts((current) => ({
        ...current,
        [assignment.id]: automationDraftFromAssignment(response.data),
      }));
      toast.success("Automation settings saved");
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to save automation settings",
      );
    } finally {
      setSavingAutomationId(null);
    }
  };

  const handleClearDestinationGroups = async (
    assignment: RunnerShopAssignment,
  ) => {
    setSavingAutomationId(assignment.id);
    try {
      const response = await runnerShopsApi.updateAutomation(
        assignment.shop.id,
        {
          destinationGroup: "",
          autoPostEnabled: false,
        },
      );
      setMyShops((current) =>
        current.map((item) =>
          item.id === assignment.id ? response.data : item,
        ),
      );
      setAutomationDrafts((current) => ({
        ...current,
        [assignment.id]: automationDraftFromAssignment(response.data),
      }));
      toast.success("Destination groups removed and auto-post disabled");
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to remove destination groups",
      );
    } finally {
      setSavingAutomationId(null);
    }
  };

  const handleClearAllDestinationGroups = async () => {
    if (
      !confirm(
        "Remove destination groups and disable auto-post for every approved shop?",
      )
    )
      return;

    setIsApplyingGlobalAutomation(true);
    try {
      const response = await runnerShopsApi.updateAllAutomation({
        destinationGroup: "",
        autoPostEnabled: false,
        selectionScope: "live",
      });
      const updatedAssignments: RunnerShopAssignment[] =
        response.data?.data || [];
      setMyShops((current) =>
        current.map(
          (item) =>
            updatedAssignments.find((updated) => updated.id === item.id) ||
            item,
        ),
      );
      setAutomationDrafts((current) => ({
        ...current,
        ...Object.fromEntries(
          updatedAssignments.map((assignment) => [
            assignment.id,
            automationDraftFromAssignment(assignment),
          ]),
        ),
      }));
      setGlobalAutomationDraft((current) => ({
        ...current,
        destinationGroups: [],
        autoPostEnabled: false,
      }));
      toast.success("All destination groups removed; auto-post is disabled");
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          "Failed to remove all destination groups",
      );
    } finally {
      setIsApplyingGlobalAutomation(false);
    }
  };

  const handleJoinShop = async (shopId: string, notes?: string) => {
    if (liveCaptureShopLimitReached) {
      toast.error(
        `Runners can select up to ${LIVE_CAPTURE_SHOP_LIMIT} capture shops`,
      );
      return;
    }

    setIsJoining(shopId);
    try {
      await runnerShopsApi.joinShop(
        shopId,
        notes || "I'd like to deliver from your shop!",
      );
      toast.success("Request sent! Waiting for shop owner approval");
      await loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to request joining");
    } finally {
      setIsJoining(null);
    }
  };

  const handleLeaveShop = async (shopId: string) => {
    if (!confirm("Are you sure you want to leave this shop?")) return;

    try {
      await runnerShopsApi.leaveShop(shopId);
      toast.success("Successfully left the shop");
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to leave shop");
    }
  };

  const handleCancelJoinRequest = async (assignment: RunnerShopAssignment) => {
    if (!confirm(`Cancel request to join ${assignment.shop.name}?`)) return;

    setCancelingRequestId(assignment.id);
    try {
      await runnerShopsApi.cancelJoinRequest(assignment.shop.id);
      toast.success("Shop join request cancelled");
      await loadData();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to cancel shop request",
      );
    } finally {
      setCancelingRequestId(null);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "APPROVED":
        return "bg-green-100 text-green-800";
      case "REJECTED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  const assignmentByShopId = new Map(
    myShops.map((assignment) => [assignment.shop.id, assignment]),
  );
  const liveCaptureShopCount = myShops.filter((assignment) =>
    ["PENDING", "APPROVED"].includes(assignment.status),
  ).length;
  const liveCaptureShopLimitReached =
    liveCaptureShopCount >= LIVE_CAPTURE_SHOP_LIMIT;
  const approvedCaptureShopCount = myShops.filter(
    (assignment) => assignment.status === "APPROVED",
  ).length;
  const selectedLiveDestinationCount = parseDestinationGroups(
    globalAutomationDraft.destinationGroups,
  ).length;

  const getDiscoverStatus = (shop: Shop) => {
    const assignment = assignmentByShopId.get(shop.id);
    if (!assignment) return null;

    switch (assignment.status) {
      case "APPROVED":
        return {
          assignment,
          icon: CheckCircle,
          label: "Already joined",
          description: "This shop is already selected for product capture.",
          className: "bg-green-100 text-green-800",
        };
      case "PENDING":
        return {
          assignment,
          icon: Clock,
          label: "Request pending",
          description: "Waiting for shop owner approval.",
          className: "bg-yellow-100 text-yellow-800",
        };
      case "REJECTED":
        return {
          assignment,
          icon: XCircle,
          label: "Request rejected",
          description: "A previous request was rejected.",
          className: "bg-red-100 text-red-800",
        };
      default:
        return {
          assignment,
          icon: Clock,
          label: assignment.status,
          description: "This shop already has a runner relationship.",
          className: "bg-gray-100 text-gray-800",
        };
    }
  };

  if (!isReady) {
    return (
      <div className={embedded ? "" : "container mx-auto px-4 py-8"}>
        <div className="text-center py-12">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={embedded ? "" : "container mx-auto px-4 py-8"}>
        <div className="text-center py-12">
          <ShoppingCart className="w-16 h-16 mx-auto text-gray-300 animate-pulse" />
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "container mx-auto px-4 py-8"}>
      {!embedded && (
        <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-950">
                Runner Marketplace
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">
                Select capture shops separately from the live WhatsApp
                advertising group that receives reposts.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-lg font-bold text-gray-950">
                  {shops.length}
                </div>
                <div className="text-[11px] font-semibold uppercase text-gray-500">
                  Shops
                </div>
              </div>
              <div className="rounded-lg bg-green-50 px-3 py-2">
                <div className="text-lg font-bold text-green-800">
                  {liveCaptureShopCount}/{LIVE_CAPTURE_SHOP_LIMIT}
                </div>
                <div className="text-[11px] font-semibold uppercase text-green-700">
                  Capture shops
                </div>
              </div>
              <div className="rounded-lg bg-blue-50 px-3 py-2">
                <div className="text-lg font-bold text-blue-800">
                  {selectedLiveDestinationCount}/{liveDestinationGroups.length}
                </div>
                <div className="text-[11px] font-semibold uppercase text-blue-700">
                  Posting destinations
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Tabs */}
      {!embedded && (
        <div className="mb-6 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {[
            ["discover", "Capture Shops", Store],
            ["my-shops", "Posting Destinations", Target],
            ["marketplace", "Marketplace", ShoppingCart],
          ].map(([key, label, Icon]) => {
            const TabIcon = Icon as typeof Store;
            return (
              <button
                key={key as string}
                onClick={() =>
                  setActiveTab(key as "discover" | "my-shops" | "marketplace")
                }
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition-colors ${
                  activeTab === key
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-600 hover:bg-white/70 hover:text-gray-900"
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {label as string}
              </button>
            );
          })}
        </div>
      )}

      {/* Capture Shops Tab */}
      {activeTab === "discover" && (
        <>
          <section className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-green-950">
                  <Store className="h-5 w-5" />
                  Capture shops
                </h2>
                <p className="mt-1 text-sm text-green-800">
                  Pick the shops products are captured from. This does not
                  choose where posts are advertised.
                </p>
              </div>
              <div className="rounded-lg bg-white px-4 py-2 text-center shadow-sm">
                <div className="text-xl font-bold text-green-900">
                  {liveCaptureShopCount}/{LIVE_CAPTURE_SHOP_LIMIT}
                </div>
                <div className="text-[11px] font-semibold uppercase text-green-700">
                  Selected
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {shops.map((shop) => {
              const discoverStatus = getDiscoverStatus(shop);
              const StatusIcon = discoverStatus?.icon;
              return (
                <div
                  key={shop.id}
                  className={`rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
                    discoverStatus ? "border-green-200" : "border-gray-200"
                  }`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold text-gray-950">
                        {shop.name}
                      </h3>
                      <ShopWhatsAppAvatars
                        shopName={shop.name}
                        groups={shop.relatedWhatsAppGroups}
                        max={3}
                        variant="feature"
                        className="mt-4"
                      />
                    </div>
                    {discoverStatus && StatusIcon && (
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${discoverStatus.className}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                        {discoverStatus.label}
                      </span>
                    )}
                  </div>

                  {discoverStatus && (
                    <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      {discoverStatus.description}
                    </div>
                  )}

                  {shop.description && (
                    <p className="mb-4 line-clamp-2 text-sm leading-6 text-gray-600">
                      {shop.description}
                    </p>
                  )}
                  <div className="mb-4 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                    <p className="rounded-md bg-gray-50 px-3 py-2">
                      {shop.address || "Address not provided"}
                    </p>
                    <p className="rounded-md bg-gray-50 px-3 py-2">
                      {shop.phone}
                    </p>
                    <p className="rounded-md bg-gray-50 px-3 py-2">
                      Owner: {shop.owner.name}
                    </p>
                    <p className="inline-flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
                      <Package className="h-4 w-4 text-gray-400" />
                      {shop._count?.products || 0} products
                    </p>
                  </div>

                  {discoverStatus?.assignment.status === "APPROVED" ? (
                    <button
                      disabled
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-100 py-2 font-medium text-green-800"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Capture shop selected
                    </button>
                  ) : discoverStatus?.assignment.status === "PENDING" ? (
                    <button
                      onClick={() =>
                        handleCancelJoinRequest(discoverStatus.assignment)
                      }
                      disabled={
                        cancelingRequestId === discoverStatus.assignment.id
                      }
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-100 py-2 font-medium text-yellow-900 transition-colors hover:bg-yellow-200 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      {cancelingRequestId === discoverStatus.assignment.id
                        ? "Cancelling..."
                        : "Cancel pending request"}
                    </button>
                  ) : discoverStatus ? (
                    <button
                      disabled
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-100 py-2 font-medium text-gray-700"
                    >
                      <XCircle className="h-4 w-4" />
                      {discoverStatus.label}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleJoinShop(shop.id)}
                      disabled={
                        isJoining === shop.id || liveCaptureShopLimitReached
                      }
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      {liveCaptureShopLimitReached
                        ? "Capture shop limit reached"
                        : isJoining === shop.id
                          ? "Sending Request..."
                          : "Select capture shop"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Posting Destinations Tab */}
      {activeTab === "my-shops" && (
        <>
          <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <Target className="h-5 w-5" />
                  Posting destination advertising groups
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Choose up to two WhatsApp posting groups where approved
                  listings repost. Capture-shop selection stays in the Capture
                  Shops tab.
                </p>
                {destinationRefreshMessage && (
                  <p className="mt-2 text-sm font-semibold text-gray-800">
                    {destinationRefreshMessage}
                  </p>
                )}
              </div>
              <button
                onClick={() => refreshDestinationGroups(true)}
                disabled={isRefreshingDestinations}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshingDestinations ? "animate-spin" : ""}`}
                />
                {isRefreshingDestinations ? "Refreshing..." : "Refresh Groups"}
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(320px,1fr)]">
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-800">
                  Reposting defaults
                </p>
                <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                  <span>Auto-list captured products</span>
                  <input
                    type="checkbox"
                    checked={globalAutomationDraft.autoListEnabled}
                    onChange={(event) =>
                      updateGlobalAutomationDraft(
                        "autoListEnabled",
                        event.target.checked,
                      )
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                  <span>Auto-post approved listings</span>
                  <input
                    type="checkbox"
                    checked={globalAutomationDraft.autoPostEnabled}
                    onChange={(event) =>
                      updateGlobalAutomationDraft(
                        "autoPostEnabled",
                        event.target.checked,
                      )
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                  <span>Require media</span>
                  <input
                    type="checkbox"
                    checked={globalAutomationDraft.requireMedia}
                    onChange={(event) =>
                      updateGlobalAutomationDraft(
                        "requireMedia",
                        event.target.checked,
                      )
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-gray-600">
                    Markup %
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="1"
                      value={Math.round(
                        Number(globalAutomationDraft.markupPercent || 0) * 100,
                      )}
                      onChange={(event) =>
                        updateGlobalAutomationDraft(
                          "markupPercent",
                          Math.max(
                            0,
                            Math.min(Number(event.target.value), 50),
                          ) / 100,
                        )
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold text-gray-600">
                    Max posts/run
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={globalAutomationDraft.maxPostsPerRun}
                      onChange={(event) =>
                        updateGlobalAutomationDraft(
                          "maxPostsPerRun",
                          Number(event.target.value),
                        )
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <label className="block text-xs font-semibold text-gray-600">
                  Maximum product age
                  <select
                    value={globalAutomationDraft.maximumListingAgeDays}
                    onChange={(event) =>
                      updateGlobalAutomationDraft(
                        "maximumListingAgeDays",
                        Number(event.target.value),
                      )
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value={1}>1 day</option>
                    <option value={3}>3 days</option>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </label>
                <p className="text-xs text-gray-600">
                  Posting runs every 30 minutes and sends each product once per
                  destination group.
                </p>
              </div>

              <div className="space-y-3">
                <select
                  value=""
                  onChange={(event) =>
                    addDefaultDestinationGroup(event.target.value)
                  }
                  disabled={
                    globalAutomationDraft.destinationGroups.length >= 2 ||
                    liveDestinationGroups.length === 0
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">
                    {liveDestinationGroups.length === 0
                      ? "No runner advertising groups available"
                      : "Add posting group"}
                  </option>
                  {liveDestinationGroups.map((group) => (
                    <option
                      key={group.groupId}
                      value={group.groupId}
                      disabled={globalAutomationDraft.destinationGroups.includes(
                        group.groupId,
                      )}
                    >
                      {group.name} ({group.participants})
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap gap-2">
                  {globalAutomationDraft.destinationGroups.map((groupId) => (
                    <span
                      key={groupId}
                      className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
                    >
                      <DestinationGroupAvatar
                        group={destinationGroupFor(groupId)}
                      />
                      {destinationGroupLabel(groupId)}
                      <button
                        type="button"
                        onClick={() => removeDefaultDestinationGroup(groupId)}
                        className="rounded-full p-0.5 text-green-700 hover:bg-green-200"
                        aria-label={`Remove ${destinationGroupLabel(groupId)}`}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  If a recently joined group is missing, admin should run{" "}
                  <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">
                    npm run whatsapp:session:sync-groups
                  </code>{" "}
                  in the backend, mark it as Runner Advertising, then refresh.
                </p>
                <div className="grid gap-2">
                  {destinationGroups.map((group) => (
                    <div
                      key={group.groupId}
                      className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <DestinationGroupAvatar group={group} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {group.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {group.participants} members
                            {group.readinessStatus
                              ? ` · ${group.readinessStatus}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-1">
                        {(["live", "test"] as const).map((scope) => {
                          const isActive =
                            scope === "test"
                              ? group.isTestGroup
                              : !group.isTestGroup;
                          return (
                            <button
                              key={scope}
                              type="button"
                              onClick={() =>
                                updateDestinationGroupScope(
                                  group,
                                  scope === "test",
                                )
                              }
                              disabled={
                                !group.isOwnGroup ||
                                updatingDestinationScopeId === group.groupId ||
                                Boolean(isActive)
                              }
                              className={`rounded px-3 py-1 text-xs font-bold capitalize transition-colors disabled:cursor-not-allowed ${
                                isActive
                                  ? "bg-white text-gray-950 shadow-sm"
                                  : "text-gray-600 hover:bg-white"
                              } ${!group.isOwnGroup ? "opacity-50" : ""}`}
                              title={
                                group.isOwnGroup
                                  ? `Mark ${group.name} as ${scope === "test" ? "primary" : "additional"}`
                                  : "This group is not linked to your runner setup"
                              }
                            >
                              {scope === "test" ? "primary" : "additional"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={applyGlobalAutomationToAll}
                  disabled={
                    isApplyingGlobalAutomation ||
                    globalAutomationDraft.destinationGroups.length === 0 ||
                    myShops.every(
                      (assignment) => assignment.status !== "APPROVED",
                    )
                  }
                  className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isApplyingGlobalAutomation
                    ? "Applying..."
                    : `Apply posting destinations to ${approvedCaptureShopCount} approved capture shop${approvedCaptureShopCount === 1 ? "" : "s"}`}
                </button>
                <button
                  type="button"
                  onClick={handleClearAllDestinationGroups}
                  disabled={
                    isApplyingGlobalAutomation ||
                    myShops.every(
                      (assignment) => assignment.status !== "APPROVED",
                    )
                  }
                  className="w-full rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  Remove All Destinations & Disable Auto-post
                </button>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {myShops.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <Store className="w-16 h-16 mx-auto text-gray-300" />
                <h3 className="mt-4 text-xl font-semibold text-gray-700">
                  No shops joined yet
                </h3>
                <p className="mt-2 text-gray-500">
                  Browse the Discover tab to find shops to join
                </p>
              </div>
            ) : (
              myShops.map((assignment) => (
                <div
                  key={assignment.id}
                  className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold">
                        {assignment.shop.name}
                      </h3>
                      <ShopWhatsAppAvatars
                        shopName={assignment.shop.name}
                        groups={assignment.shop.relatedWhatsAppGroups}
                        max={2}
                        size="sm"
                        className="mt-2"
                      />
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(
                        assignment.status,
                      )}`}
                    >
                      {assignment.status}
                    </span>
                  </div>

                  {assignment.status === "APPROVED" ? (
                    <>
                      <div className="mb-4">
                        <p className="text-sm text-gray-600 mb-2">
                          {assignment.shop._count?.products || 0} products
                          available
                        </p>
                        <p className="text-xs text-gray-500">
                          Joined:{" "}
                          {new Date(assignment.joinedAt).toLocaleDateString()}
                          {assignment.approvedAt && (
                            <span className="ml-2">
                              • Approved:{" "}
                              {new Date(
                                assignment.approvedAt,
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                      <details className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                          Shop-specific overrides ·{" "}
                          {Math.round(
                            Number(
                              automationDrafts[assignment.id]?.markupPercent ||
                                0,
                            ) * 100,
                          )}
                          % markup ·{" "}
                          {
                            parseDestinationGroups(
                              automationDrafts[assignment.id]
                                ?.destinationGroups,
                            ).length
                          }{" "}
                          groups
                        </summary>
                        <div className="mt-3">
                          <p className="mb-3 text-xs text-gray-500">
                            Use this only when this shop needs different limits
                            or destinations from the global defaults above.
                          </p>
                          <div className="space-y-3">
                            <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                              <span>Auto-list captured products</span>
                              <input
                                type="checkbox"
                                checked={Boolean(
                                  automationDrafts[assignment.id]
                                    ?.autoListEnabled,
                                )}
                                onChange={(event) =>
                                  updateAutomationDraft(
                                    assignment.id,
                                    "autoListEnabled",
                                    event.target.checked,
                                  )
                                }
                              />
                            </label>
                            <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                              <span>Auto-post approved listings</span>
                              <input
                                type="checkbox"
                                checked={Boolean(
                                  automationDrafts[assignment.id]
                                    ?.autoPostEnabled,
                                )}
                                onChange={(event) =>
                                  updateAutomationDraft(
                                    assignment.id,
                                    "autoPostEnabled",
                                    event.target.checked,
                                  )
                                }
                              />
                            </label>
                            <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                              <span>Require media</span>
                              <input
                                type="checkbox"
                                checked={
                                  automationDrafts[assignment.id]
                                    ?.requireMedia !== false
                                }
                                onChange={(event) =>
                                  updateAutomationDraft(
                                    assignment.id,
                                    "requireMedia",
                                    event.target.checked,
                                  )
                                }
                              />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-xs font-semibold text-gray-600">
                                Markup %
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="1"
                                  value={Math.round(
                                    Number(
                                      automationDrafts[assignment.id]
                                        ?.markupPercent ?? 0,
                                    ) * 100,
                                  )}
                                  onChange={(event) =>
                                    updateAutomationDraft(
                                      assignment.id,
                                      "markupPercent",
                                      Math.max(
                                        0,
                                        Math.min(
                                          Number(event.target.value),
                                          50,
                                        ),
                                      ) / 100,
                                    )
                                  }
                                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                                />
                              </label>
                              <label className="text-xs font-semibold text-gray-600">
                                Max posts/run
                                <input
                                  type="number"
                                  min="1"
                                  max="10"
                                  value={
                                    automationDrafts[assignment.id]
                                      ?.maxPostsPerRun ??
                                    DEFAULT_MAX_POSTS_PER_RUN
                                  }
                                  onChange={(event) =>
                                    updateAutomationDraft(
                                      assignment.id,
                                      "maxPostsPerRun",
                                      Number(event.target.value),
                                    )
                                  }
                                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                                />
                              </label>
                            </div>
                            <div className="space-y-2">
                              <select
                                value=""
                                onChange={(event) =>
                                  addDestinationGroup(
                                    assignment.id,
                                    event.target.value,
                                  )
                                }
                                disabled={
                                  parseDestinationGroups(
                                    automationDrafts[assignment.id]
                                      ?.destinationGroups,
                                  ).length >= 2
                                }
                                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                              >
                                <option value="">
                                  Add destination WhatsApp group
                                </option>
                                {liveDestinationGroups.map((group) => {
                                  const selectedGroups = parseDestinationGroups(
                                    automationDrafts[assignment.id]
                                      ?.destinationGroups,
                                  );
                                  return (
                                    <option
                                      key={group.groupId}
                                      value={group.groupId}
                                      disabled={selectedGroups.includes(
                                        group.groupId,
                                      )}
                                    >
                                      {group.name} ({group.participants})
                                    </option>
                                  );
                                })}
                              </select>
                              <div className="flex flex-wrap gap-2">
                                {parseDestinationGroups(
                                  automationDrafts[assignment.id]
                                    ?.destinationGroups,
                                ).map((groupId) => (
                                  <span
                                    key={groupId}
                                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700"
                                  >
                                    <DestinationGroupAvatar
                                      group={destinationGroupFor(groupId)}
                                    />
                                    {destinationGroupLabel(groupId)}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeDestinationGroup(
                                          assignment.id,
                                          groupId,
                                        )
                                      }
                                      className="rounded-full p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                                      aria-label={`Remove ${destinationGroupLabel(groupId)}`}
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                              <p className="text-xs text-gray-500">
                                All joined groups are available. Choose up to
                                two active repost destinations.
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                min="0"
                                placeholder="Min R"
                                value={
                                  automationDrafts[assignment.id]?.minPrice
                                }
                                onChange={(event) =>
                                  updateAutomationDraft(
                                    assignment.id,
                                    "minPrice",
                                    event.target.value,
                                  )
                                }
                                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                              />
                              <input
                                type="number"
                                min="0"
                                placeholder="Max R"
                                value={
                                  automationDrafts[assignment.id]?.maxPrice
                                }
                                onChange={(event) =>
                                  updateAutomationDraft(
                                    assignment.id,
                                    "maxPrice",
                                    event.target.value,
                                  )
                                }
                                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Category filter, e.g. Clothing"
                              value={
                                automationDrafts[assignment.id]
                                  ?.categoryFilter ?? ""
                              }
                              onChange={(event) =>
                                updateAutomationDraft(
                                  assignment.id,
                                  "categoryFilter",
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            <button
                              onClick={() => handleSaveAutomation(assignment)}
                              disabled={savingAutomationId === assignment.id}
                              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" />
                              {savingAutomationId === assignment.id
                                ? "Saving..."
                                : "Save age & automation"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleClearDestinationGroups(assignment)
                              }
                              disabled={savingAutomationId === assignment.id}
                              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-white py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                            >
                              <XCircle className="h-4 w-4" />
                              Remove Destinations & Disable Auto-post
                            </button>
                          </div>
                        </div>
                      </details>
                      <button
                        onClick={() => handleLeaveShop(assignment.shop.id)}
                        className="w-full bg-red-500 text-white py-2 rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Leave Shop
                      </button>
                    </>
                  ) : assignment.status === "PENDING" ? (
                    <div className="text-center py-4">
                      <Clock className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
                      <p className="text-sm text-gray-600">
                        Request pending owner approval
                      </p>
                      {assignment.notes && (
                        <p className="text-xs text-gray-500 mt-2">
                          Message: {assignment.notes}
                        </p>
                      )}
                      <button
                        onClick={() => handleCancelJoinRequest(assignment)}
                        disabled={cancelingRequestId === assignment.id}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        {cancelingRequestId === assignment.id
                          ? "Cancelling..."
                          : "Cancel Request"}
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-600">
                        {assignment.status === "REJECTED"
                          ? "Request rejected by owner"
                          : "Blocked by owner"}
                      </p>
                      {assignment.status === "REJECTED" && (
                        <button
                          onClick={() => handleCancelJoinRequest(assignment)}
                          disabled={cancelingRequestId === assignment.id}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          {cancelingRequestId === assignment.id
                            ? "Removing..."
                            : "Remove Request"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Marketplace Tab */}
      {activeTab === "marketplace" && marketplace && (
        <div>
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="font-bold text-blue-900">
                  Your Marketplace ({marketplace.totalShops} shops)
                </h3>
                <p className="text-sm text-blue-700">
                  {marketplace.totalProducts} products available from your
                  joined shops
                </p>
              </div>
              <ShoppingCart className="w-12 h-12 text-blue-500" />
            </div>
            {marketplace.shops?.length > 0 && (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {marketplace.shops
                  .slice(
                    0,
                    showAllMarketplaceShops ? marketplace.shops.length : 6,
                  )
                  .map((shop: any) => (
                    <div
                      key={shop.id}
                      className="rounded-lg border border-blue-100 bg-white/90 p-3 shadow-sm"
                    >
                      <ShopWhatsAppAvatars
                        shopName={shop.name}
                        groups={shop.relatedWhatsAppGroups}
                        variant="feature"
                        max={2}
                      />
                    </div>
                  ))}
                {marketplace.shops.length > 6 && !showAllMarketplaceShops && (
                  <button
                    type="button"
                    onClick={() => setShowAllMarketplaceShops(true)}
                    className="flex min-h-28 items-center justify-center rounded-lg border border-blue-200 bg-white/70 text-sm font-bold text-blue-800 transition hover:bg-white"
                  >
                    +{marketplace.shops.length - 6} more shops
                  </button>
                )}
              </div>
            )}
          </div>

          {marketplace.products.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-16 h-16 mx-auto text-gray-300" />
              <h3 className="mt-4 text-xl font-semibold text-gray-700">
                No products available
              </h3>
              <p className="mt-2 text-gray-500">
                Products from approved shops will appear here
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {marketplace.products.map((product: any) => {
                const media = parseProductMedia(product.images);
                const primaryMedia = media[0];
                return (
                  <div
                    key={product.id}
                    className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] bg-gray-100">
                      {primaryMedia ? (
                        isVideoMedia(primaryMedia) ? (
                          <video
                            src={primaryMedia}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={primaryMedia}
                            alt={product.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        )
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                          <Package className="h-12 w-12" />
                        </div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-gray-800 shadow-sm">
                        {product.shopName}
                      </span>
                    </div>
                    <div className="p-4">
                      <ShopWhatsAppAvatars
                        shopName={product.shopName}
                        groups={product.shopRelatedWhatsAppGroups}
                        size="sm"
                        showLabel
                        className="mb-3"
                      />
                      <h4 className="line-clamp-2 text-lg font-bold text-gray-950">
                        {product.name}
                      </h4>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xl font-bold text-primary">
                          {formatCurrency(product.basePrice)}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                          Stock: {product.stockQty}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
                        <span>
                          Captured {productAgeLabel(product.createdAt)}
                        </span>
                        <span>
                          {product.status === "ACTIVE" && product.stockQty > 0
                            ? "Available"
                            : "Unavailable"}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Link
                          href={`/products/${product.id}`}
                          className="rounded-md border border-gray-300 px-3 py-2 text-center text-sm font-semibold text-gray-800 hover:bg-gray-50"
                        >
                          View details
                        </Link>
                        <Link
                          href="/runner/products"
                          className="rounded-md bg-primary px-3 py-2 text-center text-sm font-semibold text-white hover:bg-primary/90"
                        >
                          Manage listing
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DestinationGroupAvatar({ group }: { group: DestinationGroup }) {
  const initial = (group.name || group.groupId || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/70 text-[10px] font-bold text-gray-700 ring-1 ring-black/10">
      {group.profileImageUrl ? (
        <img
          src={resolveMediaUrl(group.profileImageUrl, group.lastSeenAt)}
          alt={`${group.name} profile`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        initial || "?"
      )}
    </span>
  );
}

function productAgeLabel(value?: string) {
  if (!value) return "date unknown";
  const hours = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000),
  );
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default RunnerMarketplaceContent;

"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { runnerApi, runnerShopsApi, shopsApi } from "@/lib/api";
import { useRunnerGuard } from "@/hooks/useRoleGuard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { RunnerMarketplaceContent } from "@/components/runner/RunnerMarketplaceContent";
import {
  CheckCircle,
  Clock,
  PauseCircle,
  Play,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Store,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface RunnerShopAssignment {
  id: string;
  status: string;
  joinedAt?: string;
  approvedAt?: string | null;
  notes?: string | null;
  autoListEnabled: boolean;
  autoPostEnabled: boolean;
  markupPercent: number;
  destinationGroup: string | null;
  maxPostsPerRun: number;
  maximumListingAgeDays: number;
  requireMedia: boolean;
  shop: {
    id: string;
    name: string;
    description?: string | null;
    phone?: string | null;
    address?: string | null;
    owner?: {
      name?: string | null;
      phone?: string | null;
    };
    _count?: {
      products?: number;
    };
  };
}

interface DestinationGroup {
  groupId: string;
  name: string;
  participants: number;
  lastSeenAt: string;
  groupPurpose?: "UNCLASSIFIED" | "RUNNER_ADVERTISING";
  importedRunnerAdvertisingAt?: string | null;
  isRunnerAdvertising?: boolean;
  runnerRepostingGroupId?: string | null;
  isOwnGroup?: boolean;
  isTestGroup?: boolean;
  readinessStatus?: string | null;
  sourceBridge?: {
    id: string;
    name: string;
    phone?: string | null;
    status?: string | null;
    lastSeenAt?: string | null;
    sessionName?: string | null;
    workerKey?: string | null;
  } | null;
  sourceBridgePresence?: {
    bridgeAccountId: string;
    isAvailable: boolean;
    lastSeenAt?: string | null;
  } | null;
}

interface RepostingGroup {
  id: string;
  groupName: string;
  isTestGroup: boolean;
  status: string;
  botJoinStatus: string;
  botAdminStatus: string;
  whatsappGroupId?: string | null;
  discoveredGroupId?: string | null;
  discoveredGroupName?: string | null;
  runnerConfirmedAdminAt?: string | null;
  adminVerifiedAt?: string | null;
}

interface AutomationDraft {
  autoListEnabled: boolean;
  autoPostEnabled: boolean;
  requireMedia: boolean;
  markupPercent: number;
  maxPostsPerRun: number;
  maximumListingAgeDays: number | "";
  destinationGroups: string[];
}

const DEFAULT_MAX_POSTS_PER_RUN = 10;
const PHASE1_SHOP_DISCOVERY_LIMIT = 500;
type CombinedRunnerTab = "setup" | "marketplace";
type SetupSubTab = "test" | "live" | "links";
const COMBINED_TABS: Array<{
  key: CombinedRunnerTab;
  label: string;
  icon: typeof Settings2;
}> = [
  { key: "setup", label: "Setup", icon: Settings2 },
  { key: "marketplace", label: "Products", icon: Store },
];

const SETUP_SUB_TABS: Array<{
  key: SetupSubTab;
  label: string;
  icon: typeof Settings2;
}> = [
  { key: "test", label: "Shop Setup", icon: Settings2 },
  { key: "links", label: "Missing Links", icon: Clock },
];

const parseDestinationGroups = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((group) => String(group || "").trim()).filter(Boolean);
  }

  const clean = String(value || "").trim();
  if (!clean) return [];

  if (clean.startsWith("[")) {
    try {
      return parseDestinationGroups(JSON.parse(clean));
    } catch {
      return [clean];
    }
  }

  return clean
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean);
};

const automationDraftFromAssignment = (assignment: RunnerShopAssignment) => ({
  autoListEnabled: Boolean(assignment.autoListEnabled),
  autoPostEnabled: Boolean(assignment.autoPostEnabled),
  requireMedia: assignment.requireMedia !== false,
  markupPercent: Number(assignment.markupPercent ?? 0.3),
  maxPostsPerRun: Number(
    assignment.maxPostsPerRun || DEFAULT_MAX_POSTS_PER_RUN,
  ),
  maximumListingAgeDays: Number(assignment.maximumListingAgeDays || 14),
  destinationGroups: parseDestinationGroups(assignment.destinationGroup),
});

export default function RunnerPhase1Page() {
  const { user, isReady } = useRunnerGuard();
  const [activeTab, setActiveTab] = useState<CombinedRunnerTab>("setup");
  const [setupSubTab, setSetupSubTab] = useState<SetupSubTab>("test");
  const [status, setStatus] = useState<any>(null);
  const [runnerProfile, setRunnerProfile] = useState<any>(null);
  const [shops, setShops] = useState<any[]>([]);
  const [liveShops, setLiveShops] = useState<any[]>([]);
  const [myShops, setMyShops] = useState<RunnerShopAssignment[]>([]);
  const [liveShopAssignments, setLiveShopAssignments] = useState<
    RunnerShopAssignment[]
  >([]);
  const [destinationGroups, setDestinationGroups] = useState<
    DestinationGroup[]
  >([]);
  const [shopSearch, setShopSearch] = useState("");
  const [liveShopSearch, setLiveShopSearch] = useState("");
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [shopLinks, setShopLinks] = useState("");
  const [groupForm, setGroupForm] = useState({
    inviteLink: "",
    isTestGroup: false,
  });
  const [automationDraft, setAutomationDraft] = useState<AutomationDraft>({
    autoListEnabled: true,
    autoPostEnabled: true,
    requireMedia: true,
    markupPercent: 0.3,
    maxPostsPerRun: DEFAULT_MAX_POSTS_PER_RUN,
    maximumListingAgeDays: "",
    destinationGroups: [] as string[],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [removingShopId, setRemovingShopId] = useState<string | null>(null);
  const [updatingLiveShopId, setUpdatingLiveShopId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!isReady || !user) return;
    load();
  }, [isReady, user]);

  const load = async () => {
    setIsLoading(true);
    try {
      const [statusRes, shopsRes, myShopsRes, groupsRes] = await Promise.all([
        runnerApi.getPhase1Status(),
        runnerApi.discoverPhase1Shops({
          search: shopSearch || undefined,
          limit: PHASE1_SHOP_DISCOVERY_LIMIT,
        }),
        runnerShopsApi
          .getMyShops({ selectionScope: "test" })
          .catch(() => ({ data: [] })),
        runnerShopsApi
          .getDestinationGroups({ includeCandidates: true })
          .catch(() => ({ data: { data: [] } })),
      ]);
      const [profileRes, liveShopsRes, liveAssignmentsRes] = await Promise.all([
        runnerApi.getProfile().catch(() => ({ data: null })),
        shopsApi
          .getAll({
            limit: 500,
            status: "ACTIVE",
            sortBy: "name",
            order: "asc",
          })
          .catch(() => ({ data: { data: [] } })),
        runnerShopsApi
          .getMyShops({ selectionScope: "live" })
          .catch(() => ({ data: [] })),
      ]);
      const assignments: RunnerShopAssignment[] = myShopsRes.data || [];
      const liveAssignments: RunnerShopAssignment[] =
        liveAssignmentsRes.data || [];
      const groups: DestinationGroup[] = groupsRes.data?.data || [];
      const phase1Status = statusRes.data;
      setStatus(phase1Status);
      setRunnerProfile(profileRes.data);
      setShops(shopsRes.data.data || []);
      setLiveShops(liveShopsRes.data.data || liveShopsRes.data || []);
      setMyShops(assignments);
      setLiveShopAssignments(liveAssignments);
      setDestinationGroups(groups);
      hydrateAutomationDefaults(assignments, phase1Status, profileRes.data);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to load runner setup",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const hydrateAutomationDefaults = (
    assignments: RunnerShopAssignment[],
    phase1Status?: any,
    profile?: any,
  ) => {
    const approved =
      assignments.find((assignment) => assignment.status === "APPROVED") ||
      assignments[0];
    const readyDestinations = readyPostingDestinationGroups(phase1Status);
    const testDestination = preferredPostingDestinationGroup(phase1Status);
    if (!approved && !testDestination && readyDestinations.length === 0) return;

    const selectedGroups = Array.from(
      new Set(
        assignments.flatMap((assignment) =>
          parseDestinationGroups(assignment.destinationGroup),
        ),
      ),
    );
    const draft = approved
      ? automationDraftFromAssignment(approved)
      : automationDraft;
    const confirmedPostingAgeDays = Number(
      profile?.phase1Setup?.postingAgeDays || 0,
    );
    const hasConfirmedPostingAge = Boolean(
      profile?.phase1Setup?.postingAgeConfirmedAt &&
      confirmedPostingAgeDays >= 1 &&
      confirmedPostingAgeDays <= 90,
    );

    setAutomationDraft((current) => ({
      ...draft,
      maximumListingAgeDays: hasConfirmedPostingAge
        ? confirmedPostingAgeDays
        : current.maximumListingAgeDays,
      destinationGroups:
        current.destinationGroups.length > 0
          ? current.destinationGroups
          : readyDestinations.length > 0
            ? readyDestinations
            : testDestination
              ? [testDestination]
              : selectedGroups,
    }));
  };

  const searchShops = async () => {
    try {
      const response = await runnerApi.discoverPhase1Shops({
        search: shopSearch || undefined,
        limit: PHASE1_SHOP_DISCOVERY_LIMIT,
      });
      setShops(response.data.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to search shops");
    }
  };

  const searchLiveShops = async () => {
    try {
      const response = await shopsApi.getAll({
        limit: 500,
        status: "ACTIVE",
        sortBy: "name",
        order: "asc",
        search: liveShopSearch || undefined,
      });
      setLiveShops(response.data.data || response.data || []);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to search shop groups",
      );
    }
  };

  const saveSelectedShops = async () => {
    if (selectedShopIds.length === 0) {
      toast.error("Select at least one shop");
      return;
    }
    setIsSaving(true);
    try {
      const response = await runnerApi.selectPhase1Shops(selectedShopIds);
      setStatus(response.data);
      setSelectedShopIds([]);
      await load();
      toast.success("Shop groups selected");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to select shops");
    } finally {
      setIsSaving(false);
    }
  };

  const removeSelectedShop = async (shopId: string) => {
    setRemovingShopId(shopId);
    try {
      const response = await runnerApi.removePhase1Shop(shopId);
      setStatus(response.data);
      setSelectedShopIds((current) => current.filter((id) => id !== shopId));
      await load();
      toast.success("Shop group deselected");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to deselect shop");
    } finally {
      setRemovingShopId(null);
    }
  };

  const toggleShopSelection = async (shopId: string, checked: boolean) => {
    const isSaved = savedSelectedSet.has(shopId);
    if (!checked) {
      if (isSaved) {
        await removeSelectedShop(shopId);
        return;
      }
      setSelectedShopIds((current) => current.filter((id) => id !== shopId));
      return;
    }

    if (isSaved) return;
    if (savedSelectedSet.size + selectedShopIds.length >= 30) {
      toast.error("During Phase 1, you can select up to 30 shop groups");
      return;
    }
    setSelectedShopIds((current) =>
      current.includes(shopId) ? current : [...current, shopId],
    );
  };

  const submitShopLinks = async () => {
    setIsSaving(true);
    try {
      await runnerApi.submitShopLinks(shopLinks);
      setShopLinks("");
      await load();
      toast.success("Shop links submitted for review");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to submit links");
    } finally {
      setIsSaving(false);
    }
  };

  const submitGroup = async () => {
    setIsSaving(true);
    try {
      await runnerApi.submitRepostingGroup(groupForm);
      setGroupForm({ inviteLink: "", isTestGroup: false });
      await load();
      toast.success("Reposting group submitted");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to submit group");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmAdmin = async (groupId: string) => {
    setIsSaving(true);
    try {
      await runnerApi.confirmBotAdmin(groupId);
      await load();
      toast.success("Support fallback confirmation recorded");
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          "Failed to record support fallback confirmation",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const runCommand = async (message: string) => {
    setIsSaving(true);
    try {
      const response = await runnerApi.commandReposting(message);
      await load();
      toast.success(response.data.message || `${message} sent`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || `Failed to run ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedPostingAgeDays = () => {
    const days = Number(automationDraft.maximumListingAgeDays);
    return Number.isInteger(days) && days >= 1 && days <= 90 ? days : null;
  };

  const requirePostingAgeDays = () => {
    const days = selectedPostingAgeDays();
    if (!days) {
      toast.error("Choose a posting age between 1 and 90 days first");
      return null;
    }
    return days;
  };

  const runLiveStartResumeCommand = async (
    action: "START" | "RESUME",
    suffix = "LIVE",
  ) => {
    const days = requirePostingAgeDays();
    if (!days) return;
    await runCommand(`${action} ${suffix} ${days} DAYS`);
  };

  const runTestRepostingCommand = async (
    action: "START" | "PAUSE" | "RESUME" | "STOP",
  ) => {
    setIsSaving(true);
    try {
      const enableReposting = action === "START" || action === "RESUME";
      const postingAgeDays = enableReposting ? requirePostingAgeDays() : null;
      if (enableReposting && !postingAgeDays) return;
      const response = await runnerShopsApi.updateAllAutomation({
        selectionScope: "live",
        autoPostEnabled: enableReposting,
        ...(enableReposting
          ? { autoListEnabled: true, maximumListingAgeDays: postingAgeDays! }
          : {}),
      });
      await load();
      toast.success(
        response.data?.message ||
          (enableReposting
            ? "Reposting enabled for selected shops"
            : "Reposting paused for selected shops"),
      );
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          `Failed to ${action.toLowerCase()} reposting`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const refreshLiveSetup = async () => {
    const [liveShopsRes, liveAssignmentsRes, profileRes] = await Promise.all([
      shopsApi.getAll({
        limit: 500,
        status: "ACTIVE",
        sortBy: "name",
        order: "asc",
        search: liveShopSearch || undefined,
      }),
      runnerShopsApi.getMyShops({ selectionScope: "live" }),
      runnerApi.getProfile().catch(() => ({ data: runnerProfile })),
    ]);
    setLiveShops(liveShopsRes.data.data || liveShopsRes.data || []);
    setLiveShopAssignments(liveAssignmentsRes.data || []);
    setRunnerProfile(profileRes.data);
  };

  const joinLiveShop = async (shopId: string) => {
    setUpdatingLiveShopId(shopId);
    try {
      const response = await runnerApi.selectPhase1Shops([shopId], "live");
      setStatus(response.data);
      await refreshLiveSetup();
      toast.success("Shop group selected");
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to select shop group",
      );
    } finally {
      setUpdatingLiveShopId(null);
    }
  };

  const cancelLiveShopRequest = async (assignment: RunnerShopAssignment) => {
    setUpdatingLiveShopId(assignment.shop.id);
    try {
      await runnerShopsApi.cancelJoinRequest(assignment.shop.id);
      await refreshLiveSetup();
      toast.success("Join request cancelled");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to cancel request");
    } finally {
      setUpdatingLiveShopId(null);
    }
  };

  const exitLiveShop = async (assignment: RunnerShopAssignment) => {
    if (!confirm(`Exit ${assignment.shop.name}?`)) return;
    setUpdatingLiveShopId(assignment.shop.id);
    try {
      await runnerShopsApi.leaveShop(assignment.shop.id);
      await refreshLiveSetup();
      toast.success("Exited shop group");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to exit shop");
    } finally {
      setUpdatingLiveShopId(null);
    }
  };

  const toggleLiveShopSelection = async (shopId: string, checked: boolean) => {
    const assignment = liveAssignmentByShopId.get(shopId);
    if (checked) {
      if (assignment) return;
      if (liveShopLimitReached) {
        toast.error(
          `During Phase 1, you can select up to ${status?.liveShopLimit?.max || 2} shop groups`,
        );
        return;
      }
      await joinLiveShop(shopId);
      return;
    }

    if (!assignment) return;
    if (assignment.status === "PENDING") {
      await cancelLiveShopRequest(assignment);
      return;
    }
    await exitLiveShop(assignment);
  };

  const setLiveShopReposting = async (
    assignment: RunnerShopAssignment,
    enabled: boolean,
  ) => {
    const postingAgeDays = enabled ? requirePostingAgeDays() : null;
    if (enabled && !postingAgeDays) return;
    setUpdatingLiveShopId(assignment.shop.id);
    try {
      await runnerShopsApi.updateAutomation(assignment.shop.id, {
        autoPostEnabled: enabled,
        selectionScope: "live",
        ...(enabled ? { maximumListingAgeDays: postingAgeDays! } : {}),
      });
      await refreshLiveSetup();
      toast.success(
        enabled
          ? "Shop reposting resumed"
          : "Shop reposting paused; capture stays enabled",
      );
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to update shop reposting",
      );
    } finally {
      setUpdatingLiveShopId(null);
    }
  };

  const addDestinationGroup = async (groupId: string) => {
    if (!groupId) return;

    setAutomationDraft((current) => ({
      ...current,
      destinationGroups: Array.from(
        new Set([...current.destinationGroups, groupId]),
      ),
    }));
  };

  const removeDestinationGroup = (groupId: string) => {
    setAutomationDraft((current) => ({
      ...current,
      destinationGroups: current.destinationGroups.filter(
        (selectedGroupId) => selectedGroupId !== groupId,
      ),
    }));
  };

  const applyAutomation = async () => {
    const destinationGroupsValue = Array.from(
      new Set(
        automationDraft.destinationGroups
          .map((groupId) => String(groupId || "").trim())
          .filter(Boolean),
      ),
    );
    const postingAgeDays = requirePostingAgeDays();
    if (!postingAgeDays) return;
    setIsSaving(true);
    try {
      const response = await runnerShopsApi.updateAllAutomation({
        autoListEnabled: automationDraft.autoListEnabled,
        autoPostEnabled: automationDraft.autoPostEnabled,
        requireMedia: automationDraft.requireMedia,
        markupPercent: Number(automationDraft.markupPercent || 0),
        maxPostsPerRun: Number(
          automationDraft.maxPostsPerRun || DEFAULT_MAX_POSTS_PER_RUN,
        ),
        maximumListingAgeDays: postingAgeDays,
        selectionScope: "live",
        destinationGroup:
          destinationGroupsValue.length > 0
            ? JSON.stringify(destinationGroupsValue)
            : "",
      });
      setMyShops(response.data?.data || myShops);
      await load();
      toast.success(
        response.data?.message || "Automation settings applied to all shops",
      );
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to apply automation settings",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const savedSelectedSet = useMemo(
    () =>
      new Set(
        (status?.selectedShops || []).map((shop: any) => String(shop.shopId)),
      ),
    [status],
  );
  const selectedSet = useMemo(() => {
    const next = new Set(savedSelectedSet);
    selectedShopIds.forEach((shopId) => next.add(shopId));
    return next;
  }, [savedSelectedSet, selectedShopIds]);
  const testShopLimitReached =
    savedSelectedSet.size + selectedShopIds.length >=
    Number(status?.shopLimit?.max || 30);
  const activeTestShopCount = myShops.filter((assignment) =>
    ["PENDING", "APPROVED"].includes(assignment.status),
  ).length;
  const activeLiveShopCount = liveShopAssignments.filter((assignment) =>
    ["PENDING", "APPROVED"].includes(assignment.status),
  ).length;
  const liveShopLimitReached =
    activeLiveShopCount >= Number(status?.liveShopLimit?.max || 2);
  const testDestinationOptions = useMemo(
    () => linkedDestinationGroups(status, destinationGroups),
    [status, destinationGroups],
  );
  const unlinkedAdvertisingGroups = useMemo(
    () =>
      destinationGroups.filter((group) => {
        if (group.isOwnGroup) return false;
        return !(status?.repostingGroups || []).some(
          (item: RepostingGroup) =>
            item.whatsappGroupId === group.groupId ||
            item.discoveredGroupName === group.name,
        );
      }),
    [destinationGroups, status?.repostingGroups],
  );
  const testMetrics = useMemo(() => {
    const approvedAssignments = myShops.filter(
      (assignment) => assignment.status === "APPROVED",
    );
    const enabledAssignments = approvedAssignments.filter(
      (assignment) => assignment.autoPostEnabled,
    );
    const readyDestination = (
      (status?.repostingGroups || []) as RepostingGroup[]
    ).find((group) => group.status === "READY_FOR_REPOSTING");
    const selectedCount = Number(status?.shopLimit?.selected || 0);
    const approvedCount =
      approvedAssignments.length || (status?.selectedShops || []).length;
    const maxPosts =
      approvedAssignments.length > 0
        ? Math.max(
            ...approvedAssignments.map((assignment) =>
              Number(assignment.maxPostsPerRun || DEFAULT_MAX_POSTS_PER_RUN),
            ),
          )
        : Number(runnerProfile?.maxPostsPerRun || DEFAULT_MAX_POSTS_PER_RUN);
    const statusLabel =
      selectedCount === 0
        ? "No shops selected"
        : !status?.readiness?.canStart
          ? "Setup needs attention"
          : enabledAssignments.length > 0
            ? "Reposting on"
            : "Reposting paused";

    return [
      {
        label: "Reposting Status",
        value: statusLabel,
        tone:
          enabledAssignments.length > 0
            ? "green"
            : status?.readiness?.canStart
              ? "amber"
              : "red",
      },
      {
        label: "Enabled Shops",
        value: `${enabledAssignments.length} of ${approvedCount}`,
        tone: enabledAssignments.length > 0 ? "green" : "amber",
      },
      {
        label: "Posting Group",
        value: readyDestination
          ? displayGroupName(readyDestination)
          : "Pending",
        tone: readyDestination ? "green" : "amber",
      },
      {
        label: "Max Posts/Run",
        value: String(maxPosts),
        tone: "blue",
      },
    ];
  }, [myShops, runnerProfile?.maxPostsPerRun, status]);
  const liveDestinationGroupCount = Number(
    status?.groupLimit?.selected || status?.repostingGroups?.length || 0,
  );
  const readyLiveRepostingGroups = useMemo(
    () =>
      ((status?.repostingGroups || []) as RepostingGroup[]).filter(
        (group) => group.status === "READY_FOR_REPOSTING",
      ),
    [status?.repostingGroups],
  );
  const liveMetrics = useMemo(() => {
    const approvedAssignments = liveShopAssignments.filter(
      (assignment) => assignment.status === "APPROVED",
    );
    const enabledAssignments = approvedAssignments.filter(
      (assignment) => assignment.autoPostEnabled,
    );
    const selectedCount = liveShopAssignments.filter((assignment) =>
      ["PENDING", "APPROVED"].includes(assignment.status),
    ).length;
    const liveGroupCount = Number(
      status?.groupLimit?.selected ?? liveDestinationGroupCount,
    );
    const liveGroupMax = Number(status?.groupLimit?.max || 2);
    const maxLiveShops = Number(status?.liveShopLimit?.max || 2);
    const effectiveEnabledCount =
      liveGroupCount > 0 && status?.repostingControl?.active
        ? enabledAssignments.length
        : 0;
    const statusLabel =
      selectedCount === 0
        ? "No shop groups selected"
        : liveGroupCount === 0
          ? "Posting group needed"
          : effectiveEnabledCount > 0
            ? "Reposting on"
            : "Reposting paused";

    return [
      {
        label: "Reposting",
        value: statusLabel,
        tone:
          effectiveEnabledCount > 0
            ? "green"
            : selectedCount > 0 && liveGroupCount > 0
              ? "amber"
              : "red",
      },
      {
        label: "Selected Shops",
        value: `${selectedCount} of ${maxLiveShops}`,
        tone: selectedCount > 0 ? "green" : "amber",
      },
      {
        label: "Posting Groups",
        value: `${liveGroupCount} of ${liveGroupMax}`,
        tone: liveGroupCount > 0 ? "green" : "amber",
      },
      {
        label: "Enabled Shop Groups",
        value: `${effectiveEnabledCount} of ${approvedAssignments.length}`,
        tone: effectiveEnabledCount > 0 ? "green" : "amber",
      },
    ];
  }, [
    liveDestinationGroupCount,
    liveShopAssignments,
    status?.groupLimit?.max,
    status?.groupLimit?.selected,
    status?.repostingControl?.active,
    status?.liveShopLimit?.max,
  ]);
  const liveGlobalRepostingStatus = String(
    status?.repostingStatus || runnerProfile?.repostingStatus || "NOT_STARTED",
  ).toUpperCase();
  const liveGlobalRepostingState = status?.repostingControl?.active
    ? "running"
    : liveGlobalRepostingStatus === "STOPPED"
      ? "stopped"
      : "paused";
  const liveAssignmentByShopId = useMemo(
    () =>
      new Map(
        liveShopAssignments.map((assignment) => [
          assignment.shop.id,
          assignment,
        ]),
      ),
    [liveShopAssignments],
  );

  if (!isReady || isLoading) {
    return (
      <div className="py-12 text-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Setup & Marketplace
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            One place for shop groups, advertising groups, automation defaults,
            and reposting controls.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("marketplace")}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold"
            style={{
              borderColor: "var(--card-border)",
              color: "var(--text-primary)",
            }}
          >
            <Store className="h-4 w-4" />
            Browse Products
          </button>
          <Button variant="outline" themed onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div
        className="flex flex-wrap gap-2 rounded-lg border p-1"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--card-border)",
        }}
      >
        {COMBINED_TABS.map(({ key, label, icon: Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition-colors"
              style={
                active
                  ? {
                      backgroundColor: "var(--card-bg)",
                      color: "var(--text-primary)",
                      boxShadow: "0 1px 2px rgb(0 0 0 / 0.08)",
                    }
                  : { color: "var(--text-secondary)" }
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === "setup" && (
        <div
          className="flex gap-2 overflow-x-auto rounded-lg border p-1"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          {SETUP_SUB_TABS.map(({ key, label, icon: Icon }) => {
            const active = setupSubTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSetupSubTab(key)}
                className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-bold transition-colors"
                style={
                  active
                    ? {
                        backgroundColor: "var(--card-bg)",
                        color: "var(--text-primary)",
                        boxShadow: "0 1px 2px rgb(0 0 0 / 0.08)",
                      }
                    : { color: "var(--text-secondary)" }
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {activeTab === "setup" ? (
        <>
          <section
            className="rounded-lg border p-4"
            style={{
              backgroundColor: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <div
              className={`grid gap-3 ${
                setupSubTab === "links" ? "md:grid-cols-6" : "md:grid-cols-4"
              }`}
            >
              <StatusTile label="Access" value={status?.access?.label} />
              <StatusTile label="Reposting" value={status?.repostingStatus} />
              <StatusTile
                label="Shop Groups"
                value={`${activeTestShopCount} of ${status?.shopLimit?.max || 30}`}
              />
              <StatusTile
                label="Posting Groups"
                value={`${status?.groupLimit?.selected || 0} of ${status?.groupLimit?.max || 2}`}
              />
            </div>
            {status?.readiness?.canStart ? (
              <div className="mt-4 rounded-md bg-green-50 p-3 text-sm font-semibold text-green-800">
                Setup is ready for reposting.
              </div>
            ) : (
              <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-bold">Still needed</div>
                <ul className="mt-2 list-disc pl-5">
                  {(status?.readiness?.blockers || []).map(
                    (blocker: string) => (
                      <li key={blocker}>{blocker}</li>
                    ),
                  )}
                </ul>
              </div>
            )}
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <StatusExplanationPanel
                icon={
                  status?.bridgeStatus?.online ? (
                    <Wifi className="h-5 w-5" />
                  ) : (
                    <WifiOff className="h-5 w-5" />
                  )
                }
                label={status?.bridgeStatus?.label || "Bot connection checking"}
                explanation={
                  status?.bridgeStatus?.explanation ||
                  "Bot connection status is not available yet."
                }
                tone={status?.bridgeStatus?.online ? "green" : "amber"}
              />
              <StatusExplanationPanel
                icon={
                  status?.repostingControl?.active ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <PauseCircle className="h-5 w-5" />
                  )
                }
                label={
                  status?.repostingControl?.label || "Reposting status unknown"
                }
                explanation={
                  status?.repostingControl?.explanation ||
                  "Reposting status is not available yet."
                }
                tone={status?.repostingControl?.active ? "green" : "amber"}
              />
            </div>
          </section>

          {setupSubTab === "test" && (
            <section
              className="rounded-lg border p-4"
              style={{
                backgroundColor: "var(--card-bg)",
                borderColor: "var(--card-border)",
              }}
            >
              <div className="mb-3 flex items-center gap-2">
                <Play className="h-5 w-5" />
                <h2 className="text-lg font-bold">Reposting Controls</h2>
              </div>
              <p
                className="mb-3 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                These controls post selected shop products to your posting
                group.
              </p>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {testMetrics.map((metric) => (
                  <TestMetricTile
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                  />
                ))}
              </div>
              <div className="mb-3 max-w-sm">
                <label className="text-sm font-semibold">
                  Post products captured in the last
                  <div
                    className="mt-1 flex overflow-hidden rounded-md border bg-white"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    <Input
                      type="number"
                      min="1"
                      max="90"
                      value={automationDraft.maximumListingAgeDays}
                      placeholder="3"
                      onChange={(event) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          maximumListingAgeDays:
                            event.target.value === ""
                              ? ""
                              : Number(event.target.value),
                        }))
                      }
                      className="min-w-0 flex-1 border-0"
                    />
                    <span className="border-l px-3 py-2 text-sm font-semibold text-zinc-700">
                      days
                    </span>
                  </div>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  themed
                  disabled={isSaving || !selectedPostingAgeDays()}
                  onClick={() => runTestRepostingCommand("START")}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Start Reposting
                </Button>
                <Button
                  variant="outline"
                  themed
                  disabled={isSaving}
                  onClick={() => runTestRepostingCommand("PAUSE")}
                >
                  <PauseCircle className="mr-2 h-4 w-4" />
                  Pause
                </Button>
                <Button
                  variant="outline"
                  themed
                  disabled={isSaving || !selectedPostingAgeDays()}
                  onClick={() => runTestRepostingCommand("RESUME")}
                >
                  Resume
                </Button>
                <Button
                  variant="outline"
                  themed
                  disabled={isSaving}
                  onClick={() => runTestRepostingCommand("STOP")}
                >
                  Stop
                </Button>
              </div>
              <div
                className="mt-4 rounded-md border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--input-bg)",
                  borderColor: "var(--card-border)",
                  color: "var(--text-secondary)",
                }}
              >
                Caption price format and image caption settings are managed in{" "}
                <a
                  href="/runner/listings"
                  className="font-semibold text-green-700 hover:text-green-800"
                >
                  Listings repost controls
                </a>
                .
              </div>
            </section>
          )}

          {setupSubTab === "test" && (
            <>
              <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: "var(--card-bg)",
                    borderColor: "var(--card-border)",
                  }}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Store className="h-5 w-5" />
                    <h2 className="text-lg font-bold">Available Shop Groups</h2>
                  </div>
                  <div className="mb-3 flex gap-2">
                    <Input
                      value={shopSearch}
                      onChange={(event) => setShopSearch(event.target.value)}
                      placeholder="Search Durban, shoes, cosmetics..."
                    />
                    <Button variant="outline" themed onClick={searchShops}>
                      Search
                    </Button>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-auto pr-1">
                    {shops.map((shop) => (
                      <label
                        key={shop.id}
                        className="flex gap-3 rounded-md border p-3 text-sm"
                        style={{ borderColor: "var(--card-border)" }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSet.has(shop.id)}
                          disabled={
                            removingShopId === shop.id ||
                            (!selectedSet.has(shop.id) && testShopLimitReached)
                          }
                          onChange={(event) =>
                            toggleShopSelection(shop.id, event.target.checked)
                          }
                        />
                        <span>
                          <span className="block font-semibold">
                            {shop.name}
                          </span>
                          <span
                            className="block text-xs"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {shop.location} · {shop.activeProducts} active
                            products ·{" "}
                            {shop.primaryGroupName || "Group pending"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <Button
                    className="mt-3"
                    themed
                    disabled={isSaving || selectedShopIds.length === 0}
                    onClick={saveSelectedShops}
                  >
                    Save Shop Groups
                  </Button>
                  <div
                    className="mt-4 border-t pt-4"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    <h3 className="font-semibold">Active shop assignments</h3>
                    <div className="mt-2 space-y-1 text-sm">
                      {(status?.selectedShops || []).length === 0 ? (
                        <div style={{ color: "var(--text-secondary)" }}>
                          No shop assignments yet.
                        </div>
                      ) : (
                        (status?.selectedShops || []).map((assignment: any) => (
                          <div
                            key={assignment.id || assignment.shopId}
                            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                            style={{ borderColor: "var(--card-border)" }}
                          >
                            <span>
                              {assignment.shopName || assignment.shopId}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold">
                                {assignment.status}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                themed
                                disabled={
                                  isSaving ||
                                  removingShopId === assignment.shopId
                                }
                                onClick={() =>
                                  removeSelectedShop(assignment.shopId)
                                }
                              >
                                {removingShopId === assignment.shopId
                                  ? "Removing..."
                                  : "Remove"}
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: "var(--card-bg)",
                    borderColor: "var(--card-border)",
                  }}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    <h2 className="text-lg font-bold">Reposting Groups</h2>
                  </div>
                  <div className="grid gap-3">
                    <Input
                      value={groupForm.inviteLink}
                      onChange={(event) =>
                        setGroupForm((current) => ({
                          ...current,
                          inviteLink: event.target.value,
                        }))
                      }
                      placeholder="https://chat.whatsapp.com/..."
                    />

                    <Button
                      themed
                      disabled={isSaving || !groupForm.inviteLink}
                      onClick={submitGroup}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Submit Group
                    </Button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {(status?.repostingGroups || []).length === 0 &&
                      unlinkedAdvertisingGroups.length === 0 && (
                        <div
                          className="rounded-md border p-3 text-sm"
                          style={{
                            borderColor: "var(--card-border)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          No advertising groups have been imported yet.
                        </div>
                      )}
                    {(status?.repostingGroups || []).map((group: any) => (
                      <div
                        key={group.id}
                        className="rounded-md border p-3 text-sm"
                        style={{ borderColor: "var(--card-border)" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold">
                            {displayGroupName(group)}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold">
                              Posting group
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-bold ${groupReadinessClass(group)}`}
                            >
                              {groupReadinessLabel(group)}
                            </span>
                          </div>
                        </div>
                        <div
                          className="mt-1 text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Bot access: {groupReadinessLabel(group)}
                        </div>

                        {!group.runnerConfirmedAdminAt && (
                          <Button
                            className="mt-2"
                            size="sm"
                            variant="outline"
                            themed
                            disabled={isSaving}
                            onClick={() => confirmAdmin(group.id)}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Support fallback
                          </Button>
                        )}
                      </div>
                    ))}
                    {unlinkedAdvertisingGroups.length > 0 && (
                      <div className="pt-2">
                        <div
                          className="mb-2 text-xs font-bold uppercase"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Imported advertising groups
                        </div>
                        <div className="space-y-2">
                          {unlinkedAdvertisingGroups.map((group) => (
                            <div
                              key={group.groupId}
                              className="rounded-md border p-3 text-sm"
                              style={{ borderColor: "var(--card-border)" }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate font-semibold">
                                    {group.name}
                                  </div>
                                  <div
                                    className="mt-1 text-xs"
                                    style={{
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    {group.participants} members
                                    {group.lastSeenAt
                                      ? ` · Seen ${new Date(group.lastSeenAt).toLocaleString()}`
                                      : ""}
                                    {group.sourceBridge
                                      ? ` · Bot connection: ${group.sourceBridge.name}`
                                      : ""}
                                  </div>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                                    group.isRunnerAdvertising
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-amber-100 text-amber-900"
                                  }`}
                                >
                                  {group.isRunnerAdvertising
                                    ? "Runner advertising"
                                    : "Needs admin decision"}
                                </span>
                              </div>
                              <p
                                className="mt-2 text-xs"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {group.isRunnerAdvertising
                                  ? "This group is imported as runner advertising, but it is not linked to your runner setup yet. Support can add or verify it as a posting group."
                                  : "This synced group has not been classified yet. Support can decide whether it becomes a posting group."}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section
                className="rounded-lg border p-4"
                style={{
                  backgroundColor: "var(--card-bg)",
                  borderColor: "var(--card-border)",
                }}
              >
                <div className="mb-4 flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  <h2 className="text-lg font-bold">Automation Defaults</h2>
                </div>
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={automationDraft.autoListEnabled}
                      onChange={(event) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          autoListEnabled: event.target.checked,
                        }))
                      }
                    />
                    Auto-list approved products
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={automationDraft.autoPostEnabled}
                      onChange={(event) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          autoPostEnabled: event.target.checked,
                        }))
                      }
                    />
                    Auto-post to posting group
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={automationDraft.requireMedia}
                      onChange={(event) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          requireMedia: event.target.checked,
                        }))
                      }
                    />
                    Require product media
                  </label>
                  <label className="text-sm font-medium">
                    Markup %
                    <Input
                      type="number"
                      min="0"
                      max="10"
                      step="1"
                      value={Math.round(
                        Math.max(
                          0,
                          Number(automationDraft.markupPercent || 0),
                        ) * 100,
                      )}
                      onChange={(event) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          markupPercent:
                            Math.max(
                              0,
                              Math.min(Number(event.target.value), 50),
                            ) / 100,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Max posts per run
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={automationDraft.maxPostsPerRun}
                      onChange={(event) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          maxPostsPerRun: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Post products captured in the last
                    <Input
                      type="number"
                      min="1"
                      max="90"
                      value={automationDraft.maximumListingAgeDays}
                      placeholder="3"
                      onChange={(event) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          maximumListingAgeDays:
                            event.target.value === ""
                              ? ""
                              : Number(event.target.value),
                        }))
                      }
                    />
                    <span className="mt-1 block text-xs font-normal text-zinc-500">
                      days, required before Start or Resume
                    </span>
                  </label>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto]">
                  <div>
                    <select
                      value=""
                      onChange={(event) =>
                        addDestinationGroup(event.target.value)
                      }
                      disabled={isSaving || testDestinationOptions.length === 0}
                      className="w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
                      style={{ borderColor: "var(--card-border)" }}
                    >
                      <option value="">
                        {testDestinationOptions.length === 0
                          ? "No linked advertising groups available"
                          : "Add posting group"}
                      </option>
                      {testDestinationOptions.map((group) => (
                        <option
                          key={group.groupId}
                          value={group.groupId}
                          disabled={automationDraft.destinationGroups.includes(
                            group.groupId,
                          )}
                        >
                          {group.name}
                          {group.participants > 0
                            ? ` (${group.participants})`
                            : ""}
                        </option>
                      ))}
                    </select>
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Choose linked posting groups, or leave this blank.
                    </p>
                  </div>
                  <Button themed disabled={isSaving} onClick={applyAutomation}>
                    <Save className="mr-2 h-4 w-4" />
                    Save Posting Defaults
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {automationDraft.destinationGroups.length === 0 ? (
                    <div
                      className="rounded-md border px-3 py-2 text-sm"
                      style={{
                        borderColor: "var(--card-border)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      No posting group selected. Saving will leave reposting
                      without a destination.
                    </div>
                  ) : (
                    automationDraft.destinationGroups.map((groupId) => (
                      <span
                        key={groupId}
                        className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800"
                      >
                        {destinationGroupLabel(
                          [...testDestinationOptions, ...destinationGroups],
                          groupId,
                        )}
                        <button
                          type="button"
                          onClick={() => removeDestinationGroup(groupId)}
                          className="text-green-700 hover:text-green-950"
                          aria-label={`Remove ${groupId}`}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                  {automationDraft.destinationGroups.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAutomationDraft((current) => ({
                          ...current,
                          destinationGroups: [],
                        }))
                      }
                      className="rounded-md border px-3 py-1 text-xs font-semibold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Leave blank
                    </button>
                  )}
                </div>
                {(status?.repostingGroups || []).length > 0 && (
                  <div className="mt-4 grid gap-2">
                    <div
                      className="text-xs font-bold uppercase"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Posting groups
                    </div>
                    {((status?.repostingGroups || []) as RepostingGroup[])
                      .filter((group) => group.whatsappGroupId)
                      .map((group) => {
                        const groupId = group.whatsappGroupId as string;
                        const selected =
                          automationDraft.destinationGroups.includes(groupId);
                        return (
                          <div
                            key={group.id}
                            className="flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                            style={{ borderColor: "var(--card-border)" }}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-semibold">
                                {displayGroupName(group)}
                              </div>
                              <div
                                className="mt-1 text-xs"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                Posting group · {groupReadinessLabel(group)}
                                {selected ? " · Selected" : ""}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {selected ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeDestinationGroup(groupId)
                                  }
                                  className="rounded-md border px-3 py-1 text-xs font-semibold"
                                  style={{ color: "var(--text-secondary)" }}
                                >
                                  Remove
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addDestinationGroup(groupId)}
                                  disabled={isSaving}
                                  className="rounded-md bg-green-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                                >
                                  Add
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </section>
            </>
          )}

          {setupSubTab === "links" && (
            <section
              className="rounded-lg border p-4"
              style={{
                backgroundColor: "var(--card-bg)",
                borderColor: "var(--card-border)",
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                <h2 className="text-lg font-bold">Submit Missing Shop Links</h2>
              </div>
              <textarea
                value={shopLinks}
                onChange={(event) => setShopLinks(event.target.value)}
                className="mt-3 min-h-28 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--card-border)" }}
                placeholder={
                  "https://chat.whatsapp.com/xxxxxxxx\nhttps://chat.whatsapp.com/yyyyyyyy"
                }
              />
              <Button
                className="mt-3"
                themed
                disabled={isSaving || !shopLinks.trim()}
                onClick={submitShopLinks}
              >
                Submit Links
              </Button>
            </section>
          )}

          {setupSubTab === "live" && (
            <section className="space-y-6">
              <div
                className="rounded-lg border p-4"
                style={{
                  backgroundColor: "var(--card-bg)",
                  borderColor: "var(--card-border)",
                }}
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <Play className="h-5 w-5" />
                      <h2 className="text-lg font-bold">Reposting Controls</h2>
                    </div>
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Automatic reposting is{" "}
                      <span className="font-semibold">
                        {liveGlobalRepostingState}
                      </span>
                      . Use these after your posting group is ready. These
                      controls apply globally and every joined shop reflects the
                      global state; shop-level pause only stops reposting from
                      that shop while capture stays enabled.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {liveMetrics.map((metric) => (
                        <TestMetricTile
                          key={metric.label}
                          label={metric.label}
                          value={metric.value}
                          tone={metric.tone}
                        />
                      ))}
                    </div>
                    <div className="mt-4 max-w-sm">
                      <label className="text-sm font-semibold">
                        Post products captured in the last
                        <div
                          className="mt-1 flex overflow-hidden rounded-md border bg-white"
                          style={{ borderColor: "var(--card-border)" }}
                        >
                          <Input
                            type="number"
                            min="1"
                            max="90"
                            value={automationDraft.maximumListingAgeDays}
                            placeholder="3"
                            onChange={(event) =>
                              setAutomationDraft((current) => ({
                                ...current,
                                maximumListingAgeDays:
                                  event.target.value === ""
                                    ? ""
                                    : Number(event.target.value),
                              }))
                            }
                            className="min-w-0 flex-1 border-0"
                          />
                          <span className="border-l px-3 py-2 text-sm font-semibold text-zinc-700">
                            days
                          </span>
                        </div>
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        themed
                        disabled={isSaving || !selectedPostingAgeDays()}
                        onClick={() => runLiveStartResumeCommand("START")}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Start Reposting
                      </Button>
                      {readyLiveRepostingGroups.map((group, index) => (
                        <Button
                          key={group.id}
                          variant="outline"
                          themed
                          disabled={isSaving || !selectedPostingAgeDays()}
                          onClick={() =>
                            runLiveStartResumeCommand(
                              "START",
                              `LIVE ${index + 1}`,
                            )
                          }
                          title={displayGroupName(group)}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Start Group {index + 1}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        themed
                        disabled={isSaving}
                        onClick={() => runCommand("PAUSE LIVE")}
                      >
                        <PauseCircle className="mr-2 h-4 w-4" />
                        Pause Reposting
                      </Button>
                      <Button
                        variant="outline"
                        themed
                        disabled={isSaving || !selectedPostingAgeDays()}
                        onClick={() => runLiveStartResumeCommand("RESUME")}
                      >
                        Resume Reposting
                      </Button>
                      <Button
                        variant="outline"
                        themed
                        disabled={isSaving}
                        onClick={() => runCommand("STOP LIVE")}
                      >
                        Stop Reposting
                      </Button>
                    </div>
                  </div>
                  <div
                    className="rounded-md border px-3 py-2 text-sm"
                    style={{
                      backgroundColor: "var(--input-bg)",
                      borderColor: "var(--card-border)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Caption price format and image caption settings are managed
                    in{" "}
                    <a
                      href="/runner/listings"
                      className="font-semibold text-green-700 hover:text-green-800"
                    >
                      Listings repost controls
                    </a>
                    .
                  </div>
                </div>
              </div>

              <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: "var(--card-bg)",
                    borderColor: "var(--card-border)",
                  }}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Store className="h-5 w-5" />
                    <h2 className="text-lg font-bold">Reposting</h2>
                  </div>
                  <p
                    className="mb-3 text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Shop groups are selected once in Shop Setup. You can start
                    reposting before the trial ends.
                  </p>
                  <div className="hidden">
                    <Input
                      value={liveShopSearch}
                      onChange={(event) =>
                        setLiveShopSearch(event.target.value)
                      }
                      placeholder="Search shop groups..."
                    />
                    <Button variant="outline" themed onClick={searchLiveShops}>
                      Search
                    </Button>
                  </div>
                  <div className="hidden">
                    {liveShops.map((shop) => {
                      const assignment = liveAssignmentByShopId.get(shop.id);
                      return (
                        <label
                          key={shop.id}
                          className="flex gap-3 rounded-md border p-3 text-sm"
                          style={{ borderColor: "var(--card-border)" }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(assignment)}
                            disabled={
                              updatingLiveShopId === shop.id ||
                              (!assignment && liveShopLimitReached)
                            }
                            onChange={(event) =>
                              toggleLiveShopSelection(
                                shop.id,
                                event.target.checked,
                              )
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <span className="min-w-0">
                                <span className="block font-semibold">
                                  {shop.name}
                                </span>
                                <span
                                  className="block text-xs"
                                  style={{ color: "var(--text-secondary)" }}
                                >
                                  {shop.address || "Address pending"} ·{" "}
                                  {shop._count?.products || 0} products
                                  {shop.owner?.name
                                    ? ` · Owner: ${shop.owner.name}`
                                    : ""}
                                </span>
                                {shop.phone && (
                                  <span
                                    className="block text-xs"
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    {shop.phone}
                                  </span>
                                )}
                              </span>
                              <LiveShopStatus
                                assignment={assignment}
                                globalState={liveGlobalRepostingState}
                              />
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div
                    className="hidden"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    <h3 className="font-semibold">Live shop assignments</h3>
                    <div className="mt-2 space-y-1 text-sm">
                      {liveShopAssignments.length === 0 ? (
                        <div style={{ color: "var(--text-secondary)" }}>
                          No live shop assignments yet.
                        </div>
                      ) : (
                        liveShopAssignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="flex flex-col gap-3 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                            style={{ borderColor: "var(--card-border)" }}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">
                                {assignment.shop.name}
                              </span>
                              <span
                                className="block text-xs"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {assignment.shop.address || "Address pending"}
                              </span>
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              <LiveShopStatus
                                assignment={assignment}
                                globalState={liveGlobalRepostingState}
                              />
                              {assignment.status === "APPROVED" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  themed
                                  disabled={
                                    updatingLiveShopId === assignment.shop.id ||
                                    (!assignment.autoPostEnabled &&
                                      !selectedPostingAgeDays())
                                  }
                                  onClick={() =>
                                    setLiveShopReposting(
                                      assignment,
                                      !assignment.autoPostEnabled,
                                    )
                                  }
                                >
                                  {assignment.autoPostEnabled
                                    ? "Pause"
                                    : "Resume"}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                themed
                                disabled={
                                  updatingLiveShopId === assignment.shop.id
                                }
                                onClick={() =>
                                  assignment.status === "PENDING"
                                    ? cancelLiveShopRequest(assignment)
                                    : exitLiveShop(assignment)
                                }
                              >
                                {assignment.status === "PENDING"
                                  ? "Cancel"
                                  : "Remove"}
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <RunnerMarketplaceContent defaultTab="my-shops" embedded />
                </div>
              </section>
            </section>
          )}
        </>
      ) : (
        <RunnerMarketplaceContent
          key="marketplace"
          defaultTab="marketplace"
          embedded
        />
      )}
    </div>
  );
}

function displayGroupName(group: RepostingGroup) {
  const discovered = String(group.discoveredGroupName || "").trim();
  if (discovered) return discovered;

  const clean = String(group.groupName || "").trim();
  if (!clean || /^(pending advertising group|posting group)$/i.test(clean)) {
    return group.whatsappGroupId || "Pending advertising group";
  }
  return clean.replace(/\s+\(test\)$/i, "");
}

function groupReadinessLabel(group: RepostingGroup) {
  if (group.status === "READY_FOR_REPOSTING") return "Ready";
  if (group.botJoinStatus === "JOIN_FAILED") return "Needs attention";
  if (group.botJoinStatus === "JOINED_GROUP") {
    return group.botAdminStatus === "ADMIN_VERIFIED" ? "Checking" : "Checking";
  }
  return "Checking";
}

function groupReadinessClass(group: RepostingGroup) {
  const label = groupReadinessLabel(group);
  if (label === "Ready") return "bg-green-100 text-green-800";
  if (label === "Needs attention") return "bg-red-100 text-red-800";
  if (label === "Checking") return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-800";
}

function LiveShopStatus({
  assignment,
  globalState,
}: {
  assignment?: RunnerShopAssignment;
  globalState: string;
}) {
  if (!assignment) {
    return (
      <span className="inline-flex w-fit rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">
        Not joined
      </span>
    );
  }

  if (assignment.status === "APPROVED" && globalState === "stopped") {
    return (
      <span className="inline-flex w-fit rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-800">
        Global stopped
      </span>
    );
  }

  if (assignment.status === "APPROVED" && globalState === "paused") {
    return (
      <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
        Global paused
      </span>
    );
  }

  if (assignment.status === "PENDING") {
    return (
      <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
        Pending
      </span>
    );
  }

  if (assignment.status === "APPROVED" && !assignment.autoPostEnabled) {
    return (
      <span className="inline-flex w-fit rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-800">
        Reposting paused
      </span>
    );
  }

  if (assignment.status === "APPROVED") {
    return (
      <span className="inline-flex w-fit rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-800">
        Reposting active
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">
      {assignment.status}
    </span>
  );
}

function preferredPostingDestinationGroup(status: any) {
  const groups = ((status?.repostingGroups || []) as RepostingGroup[]).filter(
    (group) => group.whatsappGroupId,
  );
  return (
    groups.find((group) => group.status === "READY_FOR_REPOSTING")
      ?.whatsappGroupId ||
    groups.find((group) => group.adminVerifiedAt)?.whatsappGroupId ||
    groups[0]?.whatsappGroupId ||
    null
  );
}

function readyPostingDestinationGroups(status: any) {
  return Array.from(
    new Set(
      ((status?.repostingGroups || []) as RepostingGroup[])
        .filter(
          (group) =>
            group.status === "READY_FOR_REPOSTING" && group.whatsappGroupId,
        )
        .map((group) => group.whatsappGroupId as string),
    ),
  );
}

function linkedDestinationGroups(
  status: any,
  importedGroups: DestinationGroup[],
) {
  return ((status?.repostingGroups || []) as RepostingGroup[])
    .filter((group) => group.whatsappGroupId)
    .map((group) => {
      const imported = importedGroups.find(
        (item) => item.groupId === group.whatsappGroupId,
      );
      return {
        groupId: group.whatsappGroupId as string,
        name: `${displayGroupName(group)}${""}${group.status === "READY_FOR_REPOSTING" ? "" : ` - ${group.status}`}`,
        participants: imported?.participants || 0,
        lastSeenAt: imported?.lastSeenAt || "",
      };
    });
}

function destinationGroupLabel(groups: DestinationGroup[], groupId: string) {
  const group = groups.find(
    (item) => item.groupId === groupId || item.name === groupId,
  );
  return group ? `${group.name} (${group.participants})` : groupId;
}

function TestMetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  const toneClass =
    {
      green: "bg-green-50 text-green-800",
      amber: "bg-amber-50 text-amber-900",
      red: "bg-red-50 text-red-800",
      blue: "bg-blue-50 text-blue-800",
    }[tone] || "bg-gray-50 text-gray-800";

  return (
    <div
      className={`rounded-md border p-3 ${toneClass}`}
      style={{ borderColor: "var(--card-border)" }}
    >
      <div className="text-xs font-bold uppercase opacity-75">{label}</div>
      <div className="mt-1 truncate text-sm font-extrabold" title={value}>
        {value}
      </div>
    </div>
  );
}

function StatusExplanationPanel({
  icon,
  label,
  explanation,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  explanation: string;
  tone: "green" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "bg-green-50 text-green-900"
      : "bg-amber-50 text-amber-950";

  return (
    <div
      className={`rounded-md border p-3 text-sm ${toneClass}`}
      style={{ borderColor: "var(--card-border)" }}
    >
      <div className="flex items-center gap-2 font-extrabold">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 leading-5">{explanation}</p>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value?: string }) {
  return (
    <div
      className="rounded-md border p-3"
      style={{
        borderColor: "var(--card-border)",
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      <div
        className="text-xs font-semibold uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      <div className="mt-1 font-bold" style={{ color: "var(--text-primary)" }}>
        {value || "Not set"}
      </div>
    </div>
  );
}

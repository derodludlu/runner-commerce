"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminGuard } from "@/hooks/useRoleGuard";
import { useAuth } from "@/context/AuthContext";
import { adminApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import {
  Bike,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  PauseCircle,
  Search,
  Store,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface AdminRunner {
  id: string;
  status: string;
  phone: string | null;
  serviceArea: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  rating: number;
  totalOrders: number;
  totalEarnings: number;
  createdAt: string;
  whatsappOrderIntakeEnabled?: boolean;
  whatsappOrderTemplatesVerifiedAt?: string | null;
  whatsappOrderTestedAt?: string | null;
  refundMode?:
    "MANUAL_REFUND_ONLY" | "STRIPE_ELIGIBLE" | "STORE_CREDIT_OR_EXCHANGE";
  shippingMode?:
    | "MANUAL_HANDOVER"
    | "MANUAL_TRACKING"
    | "PROVIDER_RATE_QUOTE"
    | "PROVIDER_LABELS";
  supervisionMode?: "SUPERVISED" | "ASSISTED" | "AUTOMATION_REVIEW";
  phase2ReadinessNotes?: string | null;
  phase2Readiness?: {
    orderWorkflowAddonEnabled: boolean;
    whatsappOrderIntakeEnabled: boolean;
    refundMode: string;
    shippingMode: string;
    supervisionMode: string;
    blockers: string[];
    readyForWhatsAppOrderIntake: boolean;
    lastTestedAt: string | null;
    lastReviewedAt: string | null;
  };
  whatsappGroup?: string | null;
  autoPostEnabled?: boolean;
  autoPostIntervalMinutes?: number;
  maxPostsPerRun?: number;
  lastAutoPostAt?: string | null;
  trialStatus?: string;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  subscriptionStatus?: string;
  repostingStatus?: string;
  legacyReposting?: {
    destinationGroups: string[];
    destinationGroupCount: number;
    mergedCount: number;
    mergedIntoPhase1: boolean;
    status: "NO_LEGACY_DESTINATIONS" | "PENDING" | "PARTIAL" | "MERGED";
  };
  approvedAt?: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    status: string;
  } | null;
  wallet: {
    balance: number;
    pending: number;
  } | null;
  bridgeAccount?: {
    id: string;
    name: string;
    phone: string | null;
    sessionName: string | null;
    status: string;
    capacityRunners: number;
    _count?: {
      runners: number;
    };
  } | null;
  serviceCities?: Array<{ city: string; active: boolean }>;
  shopAssignments: Array<{
    id: string;
    status: string;
    joinedAt: string;
    approvedAt: string | null;
    selectedForTest?: boolean;
    selectedForLive?: boolean;
    shop: {
      id: string;
      name: string;
      status: string;
    };
  }>;
  repostingGroups?: Array<{
    id: string;
    whatsappGroupId?: string | null;
    discoveredGroupId?: string | null;
    discoveredGroupName?: string | null;
    bridgeAccountId?: string | null;
    groupName: string;
    isTestGroup: boolean;
    status: string;
    botJoinStatus: string;
    botAdminStatus: string;
    runnerConfirmedAdminAt: string | null;
    adminVerifiedAt: string | null;
  }>;
  submittedShopLinks?: Array<{
    id: string;
    inviteLink: string;
    status: string;
    notes?: string | null;
    createdAt: string;
  }>;
  _count: {
    orders: number;
    listings: number;
    shopAssignments: number;
  };
}

interface BridgeAccount {
  id: string;
  name: string;
  phone?: string | null;
  status: string;
  capacityRunners: number;
  availableRunnerSlots?: number;
  _count?: {
    runners: number;
  };
}

interface Phase1Prospect {
  id: string;
  whatsappNumber: string;
  currentStep: string;
  lastResponse?: string | null;
  lastQuestion?: string | null;
  submittedShopLinks: string[];
  repostingGroupLinks: string[];
  bridgeJoinApprovals?: Array<{
    inviteLink: string;
    bridgeAccountId: string;
    linkType?: string;
    status?: "QUEUED" | "JOINED" | "FAILED" | "RETRYING";
    queuedMessageId?: string;
    queuedAt?: string;
    joinedAt?: string;
    groupId?: string;
    lastAttemptAt?: string;
    lastError?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

const PAGE_SIZE = 20;

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  INACTIVE: "bg-gray-100 text-gray-800",
};

const SHOP_STATUS_STYLES: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  REJECTED: "bg-red-100 text-red-800",
  BLOCKED: "bg-gray-100 text-gray-800",
};

function pendingLegacyDestinationLabel(runner: AdminRunner) {
  const legacy = runner.legacyReposting;
  if (!legacy || legacy.status === "NO_LEGACY_DESTINATIONS") return null;
  if (legacy.status === "PARTIAL") {
    return `Destination sync pending (${legacy.mergedCount}/${legacy.destinationGroupCount})`;
  }
  if (legacy.status === "PENDING") {
    return `Destination sync pending (${legacy.destinationGroupCount})`;
  }
  return null;
}

function displayRepostingGroupName(
  group: NonNullable<AdminRunner["repostingGroups"]>[number],
) {
  const discovered = String(group.discoveredGroupName || "").trim();
  if (discovered) return discovered;

  const clean = String(group.groupName || "").trim();
  if (!clean || /^(pending advertising group|posting group)$/i.test(clean)) {
    return group.whatsappGroupId || "Pending advertising group";
  }
  return clean.replace(/\s+\(test\)$/i, "");
}

function repostingGroupCountSummary(
  runner: AdminRunner,
  options: { readyOnly?: boolean } = {},
) {
  const allGroups = runner.repostingGroups || [];
  const groups = options.readyOnly
    ? allGroups.filter((group) => group.status === "READY_FOR_REPOSTING")
    : allGroups;
  const primary = groups.filter((group) => group.isTestGroup).length;
  const additional = groups.filter((group) => !group.isTestGroup).length;
  const primaryMax = Math.max(
    1,
    primary,
    allGroups.filter((group) => group.isTestGroup).length,
  );
  const additionalMax = Math.max(
    1,
    additional,
    allGroups.filter((group) => !group.isTestGroup).length,
  );

  return `Primary ${primary}/${primaryMax} · Additional ${additional}/${additionalMax} by plan`;
}

function repostingGroupReadiness(
  group: NonNullable<AdminRunner["repostingGroups"]>[number],
) {
  if (group.status === "READY_FOR_REPOSTING") {
    return { label: "Ready", className: "bg-green-100 text-green-800" };
  }
  if (group.botJoinStatus === "JOIN_FAILED") {
    return { label: "Join failed", className: "bg-red-100 text-red-800" };
  }
  if (group.botJoinStatus === "JOINED_GROUP") {
    if (group.botAdminStatus === "ADMIN_VERIFIED") {
      return {
        label: "Verification pending",
        className: "bg-amber-100 text-amber-800",
      };
    }
    return { label: "Admin pending", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "Join pending", className: "bg-blue-100 text-blue-800" };
}

function activeShopAssignmentCount(runner: AdminRunner) {
  return new Set(
    runner.shopAssignments
      .filter((assignment) => assignment.status === "APPROVED")
      .map((assignment) => assignment.shop?.id || assignment.id),
  ).size;
}

export default function AdminRunnersPage() {
  const [runners, setRunners] = useState<AdminRunner[]>([]);
  const [bridges, setBridges] = useState<BridgeAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingPreferences, setPendingPreferences] = useState<any[]>([]);
  const [phase1Prospects, setPhase1Prospects] = useState<Phase1Prospect[]>([]);
  const [autoImportRunnerAdvertising, setAutoImportRunnerAdvertising] =
    useState(true);
  const [prospectBridgeSelections, setProspectBridgeSelections] = useState<
    Record<string, string>
  >({});
  const autoMergeAttemptedRef = useRef(false);
  const router = useRouter();
  const { user, isReady } = useAdminGuard();
  const { startRunnerImpersonation } = useAuth();

  useEffect(() => {
    if (!isReady || !user) return;
    loadRunners();
  }, [search, statusFilter, page, isReady, user]);

  const loadRunners = async (options: { skipAutoMerge?: boolean } = {}) => {
    setIsLoading(true);
    try {
      const res = await adminApi.getRunners({
        status: statusFilter || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      const bridgeRes = await adminApi.getWhatsAppBridges();
      const pendingRes = await adminApi.getPendingRunnerPreferences();
      const prospectsRes = await adminApi.getPhase1Prospects({
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      const loadedRunners = res.data.runners || [];
      setRunners(loadedRunners);
      setBridges(Array.isArray(bridgeRes.data) ? bridgeRes.data : []);
      setTotal(res.data.total || 0);
      setPendingPreferences(pendingRes.data || []);
      setPhase1Prospects(prospectsRes.data?.prospects || []);

      const hasPendingLegacyMerge = loadedRunners.some(
        (runner: AdminRunner) =>
          runner.legacyReposting &&
          ["PENDING", "PARTIAL"].includes(runner.legacyReposting.status),
      );
      if (
        hasPendingLegacyMerge &&
        !options.skipAutoMerge &&
        !autoMergeAttemptedRef.current
      ) {
        autoMergeAttemptedRef.current = true;
        const autoMergeRes = await adminApi.autoMergeLegacyRunnerReposting({
          limit: 100,
        });
        if (autoMergeRes.data?.mergedCount > 0) {
          toast.success(autoMergeRes.data.message || "Legacy setups synced");
          await loadRunners({ skipAutoMerge: true });
        } else if (autoMergeRes.data?.failedCount > 0) {
          toast.error("Some legacy setups still need review");
        }
      }
    } catch {
      toast.error("Failed to load runners");
    } finally {
      setIsLoading(false);
    }
  };

  const assignBridge = async (runnerId: string, bridgeAccountId: string) => {
    setUpdatingId(runnerId);
    try {
      await adminApi.assignRunnerBridge(runnerId, bridgeAccountId || null);
      toast.success("Bridge assignment updated");
      await loadRunners();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to assign bridge account",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const updatePhase2Controls = async (
    runnerId: string,
    data: Parameters<typeof adminApi.updateRunnerPhase2Controls>[1],
  ) => {
    setUpdatingId(runnerId);
    try {
      const response = await adminApi.updateRunnerPhase2Controls(
        runnerId,
        data,
      );
      toast.success(response.data?.message || "Phase 2 controls updated");
      await loadRunners();
    } catch (error: unknown) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: string } } })
          .response?.data?.message === "string"
          ? (error as { response: { data: { message: string } } }).response.data
              .message
          : "Failed to update Phase 2 controls";
      toast.error(message);
    } finally {
      setUpdatingId(null);
    }
  };

  const updateStatus = async (
    runnerId: string,
    status: "ACTIVE" | "PENDING" | "INACTIVE",
  ) => {
    setUpdatingId(runnerId);
    try {
      await adminApi.updateRunnerStatus(runnerId, status);
      toast.success(`Runner set to ${status.toLowerCase()}`);
      await loadRunners();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update runner");
    } finally {
      setUpdatingId(null);
    }
  };

  const activateTrial = async (runnerId: string) => {
    setUpdatingId(runnerId);
    try {
      await adminApi.updateRunnerPhase1Access(runnerId, {
        activateTrial: true,
      });
      toast.success("Phase 1 trial activated");
      await loadRunners();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to activate Phase 1 trial",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const operateAsRunner = async (runner: AdminRunner) => {
    setUpdatingId(runner.id);
    try {
      await startRunnerImpersonation(runner.id);
      toast.success(
        `Operating as ${runner.user?.name || runner.phone || "runner"}`,
      );
      router.push("/runner/phase1");
    } catch (error: any) {
      toast.error(error.message || "Failed to start runner impersonation");
    } finally {
      setUpdatingId(null);
    }
  };

  const markGroupReady = async (groupId: string, isTestGroup?: boolean) => {
    setUpdatingId(groupId);
    try {
      await adminApi.verifyRunnerRepostingGroup(groupId, {
        status: "READY_FOR_REPOSTING",
        ...(isTestGroup !== undefined ? { isTestGroup } : {}),
        autoImportRunnerAdvertising,
      });
      toast.success("Reposting group marked ready");
      await loadRunners();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to verify group");
    } finally {
      setUpdatingId(null);
    }
  };

  const setRepostingGroupScope = async (
    group: NonNullable<AdminRunner["repostingGroups"]>[number],
    isTestGroup: boolean,
  ) => {
    setUpdatingId(group.id);
    try {
      await adminApi.verifyRunnerRepostingGroup(group.id, {
        isTestGroup,
        autoImportRunnerAdvertising,
      });
      toast.success(
        `${displayRepostingGroupName(group)} set as ${isTestGroup ? "primary" : "additional"} posting destination`,
      );
      await loadRunners();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to update destination role",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteRepostingGroup = async (
    group: NonNullable<AdminRunner["repostingGroups"]>[number],
  ) => {
    const groupName = displayRepostingGroupName(group);
    if (
      !window.confirm(
        `Remove "${groupName}" from this runner setup? The runner can submit a fresh invite link after this.`,
      )
    ) {
      return;
    }

    setUpdatingId(group.id);
    try {
      await adminApi.deleteRunnerRepostingGroup(group.id);
      toast.success("Reposting group removed");
      await loadRunners();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to remove reposting group",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const mergeLegacyReposting = async (runner: AdminRunner) => {
    setUpdatingId(runner.id);
    try {
      const response = await adminApi.mergeLegacyRunnerReposting(runner.id);
      toast.success(response.data?.message || "Legacy reposting setup merged");
      await loadRunners();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to merge legacy reposting",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const reviewShopLink = async (
    linkId: string,
    status: "APPROVED" | "REJECTED" | "PENDING_REVIEW",
    bridgeAccountId?: string,
  ) => {
    setUpdatingId(linkId);
    try {
      await adminApi.reviewSubmittedShopLink(linkId, {
        status,
        bridgeAccountId,
      });
      toast.success(
        status === "APPROVED"
          ? "Shop link approved"
          : status === "REJECTED"
            ? "Shop link rejected"
            : "Shop link returned to review",
      );
      await loadRunners();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to review shop link",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const approveProspectInviteLink = async (
    prospect: Phase1Prospect,
    inviteLink: string,
    linkType: "SUBMITTED_SHOP" | "REPOSTING_GROUP",
  ) => {
    const selectionKey = `${prospect.id}:${inviteLink}`;
    const bridgeAccountId = prospectBridgeSelections[selectionKey];
    if (!bridgeAccountId) {
      toast.error("Choose the bridge that should join this group");
      return;
    }
    setUpdatingId(selectionKey);
    try {
      await adminApi.approvePhase1ProspectInviteLink(prospect.id, {
        inviteLink,
        bridgeAccountId,
        linkType,
      });
      toast.success("Group join queued for selected bridge");
      await loadRunners();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to queue group join",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const bridgeLabel = (bridgeAccountId?: string) => {
    const bridge = bridges.find((item) => item.id === bridgeAccountId);
    return bridge?.name || bridgeAccountId || "Selected bridge";
  };

  const joinStatusClass = (status?: string) => {
    if (status === "JOINED") return "bg-green-100 text-green-800";
    if (status === "FAILED") return "bg-red-100 text-red-800";
    if (status === "RETRYING") return "bg-amber-100 text-amber-800";
    return "bg-blue-100 text-blue-800";
  };

  const renderProspectInviteLink = (
    prospect: Phase1Prospect,
    link: string,
    linkType: "SUBMITTED_SHOP" | "REPOSTING_GROUP",
  ) => {
    const selectionKey = `${prospect.id}:${link}`;
    const approval = (prospect.bridgeJoinApprovals || [])
      .filter((item) => item.inviteLink === link)
      .at(-1);
    const isJoined = approval?.status === "JOINED";
    const isQueued =
      approval?.status === "QUEUED" || approval?.status === "RETRYING";

    return (
      <div key={link} className="rounded border border-blue-100 p-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="block min-w-0 flex-1 break-all font-mono text-xs text-blue-700 underline"
          >
            {link}
          </a>
          {approval && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${joinStatusClass(
                approval.status,
              )}`}
            >
              {approval.status || "QUEUED"}
            </span>
          )}
        </div>
        {approval && (
          <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-700">
            <div>Approved for {bridgeLabel(approval.bridgeAccountId)}</div>
            {approval.queuedAt && (
              <div>Queued {new Date(approval.queuedAt).toLocaleString()}</div>
            )}
            {approval.joinedAt && (
              <div>Joined {new Date(approval.joinedAt).toLocaleString()}</div>
            )}
            {approval.groupId && (
              <div className="break-all">Group: {approval.groupId}</div>
            )}
            {approval.lastError && (
              <div className="mt-1 break-words text-red-700">
                {approval.lastError}
              </div>
            )}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            value={prospectBridgeSelections[selectionKey] || ""}
            onChange={(event) =>
              setProspectBridgeSelections((current) => ({
                ...current,
                [selectionKey]: event.target.value,
              }))
            }
            disabled={isJoined || isQueued}
            className="min-w-[180px] rounded border px-2 py-1 text-xs disabled:bg-gray-100"
          >
            <option value="">
              {approval
                ? bridgeLabel(approval.bridgeAccountId)
                : "Choose bridge..."}
            </option>
            {bridges.map((bridge) => (
              <option key={bridge.id} value={bridge.id}>
                {bridge.name} ({bridge.status})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={updatingId === selectionKey || isJoined || isQueued}
            onClick={() => approveProspectInviteLink(prospect, link, linkType)}
            className="rounded bg-green-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
          >
            {isJoined ? "Joined" : isQueued ? "Join queued" : "Approve & join"}
          </button>
        </div>
      </div>
    );
  };

  const toggleCity = async (runner: AdminRunner, city: string) => {
    const active = new Set(
      (runner.serviceCities || [])
        .filter((item) => item.active)
        .map((item) => item.city),
    );
    active.has(city) ? active.delete(city) : active.add(city);
    setUpdatingId(runner.id);
    try {
      await adminApi.updateRunnerServiceCities(runner.id, [...active]);
      await loadRunners();
      toast.success("Runner cities updated");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update cities");
    } finally {
      setUpdatingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const resolvePreference = async (preferenceId: string, runnerId: string) => {
    if (!runnerId) return;
    setUpdatingId(preferenceId);
    try {
      await adminApi.resolveRunnerPreference(preferenceId, runnerId);
      await loadRunners();
      toast.success("Customer preference matched");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not match runner");
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isReady) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 flex items-center gap-2 text-3xl font-bold">
        <Users className="h-8 w-8" />
        Runner Management
      </h1>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: "Active", value: "ACTIVE", icon: CheckCircle },
          { label: "Pending", value: "PENDING", icon: Clock },
          { label: "Inactive", value: "INACTIVE", icon: PauseCircle },
        ].map(({ label, value, icon: Icon }) => (
          <button
            key={value}
            onClick={() => {
              setStatusFilter(statusFilter === value ? "" : value);
              setPage(0);
            }}
            className={`rounded-lg border-2 bg-white p-4 text-left transition-all ${
              statusFilter === value
                ? "border-primary bg-primary/5"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <Icon className="mb-3 h-5 w-5 text-gray-500" />
            <div className="text-sm text-gray-600">{label} runners</div>
            <div className="mt-1 text-2xl font-bold">
              {statusFilter === value ? total : "-"}
            </div>
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, phone, vehicle, area..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setPage(0);
          }}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING">Pending</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <span className="self-center text-sm text-gray-500">
          {total} runner{total !== 1 ? "s" : ""}
        </span>
        <label className="flex items-center gap-2 self-center text-sm text-gray-600">
          <input
            type="checkbox"
            checked={autoImportRunnerAdvertising}
            onChange={(event) =>
              setAutoImportRunnerAdvertising(event.target.checked)
            }
          />
          Auto-import ready groups as runner advertising
        </label>
      </div>

      {pendingPreferences.length > 0 && (
        <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <h2 className="font-bold">Pending trusted runner matches</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {pendingPreferences.map((preference) => (
              <div
                key={preference.id}
                className="rounded-md bg-white p-3 text-sm"
              >
                <div className="font-semibold">
                  {preference.customer?.name || "Customer"} · {preference.city}
                </div>
                <div className="mt-1">
                  Runner number: {preference.runnerPhone}
                </div>
                <select
                  className="mt-2 w-full rounded-md border px-2 py-2"
                  defaultValue=""
                  disabled={updatingId === preference.id}
                  onChange={(event) =>
                    resolvePreference(preference.id, event.target.value)
                  }
                >
                  <option value="">Match to eligible runner...</option>
                  {runners
                    .filter(
                      (runner) =>
                        runner.status === "ACTIVE" &&
                        (runner.serviceCities || []).some(
                          (item) =>
                            item.city === preference.city && item.active,
                        ),
                    )
                    .map((runner) => (
                      <option key={runner.id} value={runner.id}>
                        {runner.user?.name || runner.phone}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {phase1Prospects.length > 0 && (
        <section className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold">Phase 1 bot prospects</h2>
              <p className="mt-1 text-sm">
                These numbers have chatted with Bridge 1 but do not have runner
                profiles yet.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">
              {phase1Prospects.length} visible
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {phase1Prospects.map((prospect) => (
              <div
                key={prospect.id}
                className="rounded-md bg-white p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{prospect.whatsappNumber}</div>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                    {prospect.currentStep}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Updated {new Date(prospect.updatedAt).toLocaleString()}
                </div>
                {prospect.lastResponse && (
                  <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-700">
                    Last message: {prospect.lastResponse}
                  </div>
                )}
                {prospect.submittedShopLinks.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-bold text-gray-700">
                      Submitted shop links
                    </div>
                    <div className="mt-1 space-y-1">
                      {prospect.submittedShopLinks.map((link) =>
                        renderProspectInviteLink(
                          prospect,
                          link,
                          "SUBMITTED_SHOP",
                        ),
                      )}
                    </div>
                  </div>
                )}
                {prospect.repostingGroupLinks.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-bold text-gray-700">
                      Reposting group links
                    </div>
                    <div className="mt-1 space-y-1">
                      {prospect.repostingGroupLinks.map((link) =>
                        renderProspectInviteLink(
                          prospect,
                          link,
                          "REPOSTING_GROUP",
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow-md">
        {isLoading ? (
          <div className="py-12 text-center text-gray-500">Loading...</div>
        ) : (
          <table className="w-full">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">
                  Runner
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold">
                  Operations
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold">
                  Linked Shops
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold">
                  Bridge
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    No runners found.
                  </td>
                </tr>
              ) : (
                runners.map((runner) => (
                  <tr
                    key={runner.id}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold">
                        {runner.user?.name || "Unnamed runner"}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {runner.user?.email || "No email"}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        {runner.phone || runner.user?.phone || "No phone"}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                        <Bike className="h-4 w-4" />
                        {runner.vehicleType || "Vehicle not set"}
                        {runner.vehicleNumber
                          ? ` (${runner.vehicleNumber})`
                          : ""}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-600">
                      <div>{runner._count.orders} orders</div>
                      <div>{runner._count.listings} listings</div>
                      <div>{formatCurrency(runner.totalEarnings)} earned</div>
                      <div className="mt-1 text-xs text-gray-500">
                        Wallet {formatCurrency(runner.wallet?.balance)}
                      </div>
                      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-2 text-xs text-blue-950">
                        <div className="font-bold">Phase 1 pilot</div>
                        <div className="mt-1">
                          Trial: {runner.trialStatus || "TRIAL_PENDING_SETUP"}
                        </div>
                        <div>
                          Subscription:{" "}
                          {runner.subscriptionStatus || "PENDING_SUBSCRIPTION"}
                        </div>
                        <div>
                          Reposting: {runner.repostingStatus || "NOT_STARTED"}
                        </div>
                        {pendingLegacyDestinationLabel(runner) && (
                          <div className="mt-1 rounded bg-amber-100 px-2 py-1 font-semibold text-amber-800">
                            {pendingLegacyDestinationLabel(runner)}
                          </div>
                        )}
                        {runner.trialEndsAt && (
                          <div>
                            Trial ends:{" "}
                            {new Date(runner.trialEndsAt).toLocaleDateString()}
                          </div>
                        )}
                        <div className="mt-1 space-y-0.5">
                          <div>
                            Shop groups: {activeShopAssignmentCount(runner)}
                            /30
                          </div>
                          <div>
                            Ready groups:{" "}
                            {repostingGroupCountSummary(runner, {
                              readyOnly: true,
                            })}
                          </div>
                          <div>
                            Saved groups: {repostingGroupCountSummary(runner)}
                          </div>
                        </div>
                        {(runner.repostingGroups || []).some(
                          (group) => group.status === "READY_FOR_REPOSTING",
                        ) ? (
                          <div className="mt-1 font-semibold text-green-700">
                            Reposting group ready
                          </div>
                        ) : (
                          <div className="mt-1 font-semibold text-amber-700">
                            Group verification pending
                          </div>
                        )}
                        {(runner.submittedShopLinks?.length || 0) > 0 && (
                          <div className="mt-2 space-y-2">
                            <div className="font-semibold">
                              Submitted shop links
                            </div>
                            {runner.submittedShopLinks?.map((link) => (
                              <div
                                key={link.id}
                                className="rounded-md bg-white/90 p-2"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                      link.status === "APPROVED"
                                        ? "bg-green-100 text-green-800"
                                        : link.status === "REJECTED"
                                          ? "bg-red-100 text-red-800"
                                          : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {link.status}
                                  </span>
                                  <span className="text-[11px] text-gray-500">
                                    {new Date(
                                      link.createdAt,
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                                <a
                                  href={link.inviteLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 block break-all font-mono text-[11px] text-blue-700 underline"
                                >
                                  {link.inviteLink}
                                </a>
                                {link.notes && (
                                  <div className="mt-1 text-[11px] text-gray-600">
                                    {link.notes}
                                  </div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={updatingId === link.id}
                                    onClick={() =>
                                      reviewShopLink(link.id, "APPROVED")
                                    }
                                    className="inline-flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                                  >
                                    <CheckCircle className="h-3 w-3" />
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={updatingId === link.id}
                                    onClick={() =>
                                      reviewShopLink(link.id, "REJECTED")
                                    }
                                    className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                                  >
                                    <XCircle className="h-3 w-3" />
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {(runner.repostingGroups || []).length > 0 && (
                          <div className="mt-2 space-y-1">
                            {(runner.repostingGroups || []).map((group) => {
                              const readiness = repostingGroupReadiness(group);
                              return (
                                <div
                                  key={group.id}
                                  className="rounded-md bg-white/80 p-2"
                                >
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-semibold">
                                      {group.isTestGroup
                                        ? "Primary posting destination"
                                        : "Additional posting destination"}
                                      : {displayRepostingGroupName(group)}
                                    </span>
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">
                                      {group.isTestGroup
                                        ? "Primary"
                                        : "Additional"}
                                    </span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${readiness.className}`}
                                    >
                                      {readiness.label}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-[11px] text-gray-600">
                                    Bot: {group.botJoinStatus} · Admin:{" "}
                                    {group.botAdminStatus}
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {(["test", "live"] as const).map(
                                      (scope) => {
                                        const isTestScope = scope === "test";
                                        const isActive =
                                          group.isTestGroup === isTestScope;
                                        return (
                                          <button
                                            key={scope}
                                            type="button"
                                            disabled={
                                              updatingId === group.id ||
                                              isActive
                                            }
                                            onClick={() =>
                                              setRepostingGroupScope(
                                                group,
                                                isTestScope,
                                              )
                                            }
                                            className={`rounded px-2 py-1 text-[11px] font-bold capitalize disabled:opacity-50 ${
                                              isActive
                                                ? "bg-gray-900 text-white"
                                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                            }`}
                                          >
                                            {isTestScope
                                              ? "Primary"
                                              : "Additional"}
                                          </button>
                                        );
                                      },
                                    )}
                                  </div>
                                  {group.status !== "READY_FOR_REPOSTING" && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      <button
                                        type="button"
                                        disabled={updatingId === group.id}
                                        onClick={() =>
                                          markGroupReady(group.id, true)
                                        }
                                        className="rounded bg-green-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                                      >
                                        Ready as Primary
                                      </button>
                                      <button
                                        type="button"
                                        disabled={updatingId === group.id}
                                        onClick={() =>
                                          markGroupReady(group.id, false)
                                        }
                                        className="rounded bg-blue-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                                      >
                                        Ready as Additional
                                      </button>
                                      <button
                                        type="button"
                                        disabled={updatingId === group.id}
                                        onClick={() =>
                                          deleteRepostingGroup(group)
                                        }
                                        className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                                        title="Remove failed or pending group"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        Remove
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {runner.whatsappGroup &&
                          runner.legacyReposting?.status !== "MERGED" && (
                            <button
                              type="button"
                              disabled={updatingId === runner.id}
                              onClick={() => mergeLegacyReposting(runner)}
                              className="mt-2 rounded bg-purple-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                            >
                              Retry legacy sync
                            </button>
                          )}
                      </div>
                      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-xs text-emerald-950">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-bold">
                            Phase 2 supervised orders
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              runner.phase2Readiness
                                ?.readyForWhatsAppOrderIntake
                                ? "bg-green-100 text-green-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {runner.phase2Readiness?.readyForWhatsAppOrderIntake
                              ? "Ready"
                              : "Gated"}
                          </span>
                        </div>
                        <div className="mt-1">
                          Add-on:{" "}
                          {runner.phase2Readiness?.orderWorkflowAddonEnabled
                            ? "Active"
                            : "Missing"}
                        </div>
                        <div>
                          Last test:{" "}
                          {runner.phase2Readiness?.lastTestedAt
                            ? new Date(
                                runner.phase2Readiness.lastTestedAt,
                              ).toLocaleDateString()
                            : "Not tested"}
                        </div>
                        {(runner.phase2Readiness?.blockers || []).length >
                          0 && (
                          <div className="mt-2 space-y-1">
                            {runner.phase2Readiness?.blockers.map((blocker) => (
                              <div
                                key={blocker}
                                className="rounded bg-white/90 px-2 py-1 text-[11px] text-amber-900"
                              >
                                {blocker}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 grid gap-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(
                                runner.whatsappOrderIntakeEnabled,
                              )}
                              disabled={updatingId === runner.id}
                              onChange={(event) =>
                                updatePhase2Controls(runner.id, {
                                  whatsappOrderIntakeEnabled:
                                    event.target.checked,
                                })
                              }
                            />
                            WhatsApp order intake
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(
                                runner.whatsappOrderTemplatesVerifiedAt,
                              )}
                              disabled={updatingId === runner.id}
                              onChange={(event) =>
                                updatePhase2Controls(runner.id, {
                                  whatsappOrderTemplatesVerified:
                                    event.target.checked,
                                })
                              }
                            />
                            Reply templates verified
                          </label>
                          <button
                            type="button"
                            disabled={updatingId === runner.id}
                            onClick={() =>
                              updatePhase2Controls(runner.id, {
                                markWhatsAppOrderTested: true,
                              })
                            }
                            className="rounded bg-emerald-700 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            Mark test intake passed
                          </button>
                          <select
                            value={runner.refundMode || "MANUAL_REFUND_ONLY"}
                            disabled={updatingId === runner.id}
                            onChange={(event) =>
                              updatePhase2Controls(runner.id, {
                                refundMode: event.target.value as NonNullable<
                                  AdminRunner["refundMode"]
                                >,
                              })
                            }
                            className="rounded border px-2 py-1"
                            title="Refund mode"
                          >
                            <option value="MANUAL_REFUND_ONLY">
                              Manual refunds only
                            </option>
                            <option value="STRIPE_ELIGIBLE">
                              Stripe eligible when payment supports it
                            </option>
                            <option value="STORE_CREDIT_OR_EXCHANGE">
                              Store credit / exchange
                            </option>
                          </select>
                          <select
                            value={runner.shippingMode || "MANUAL_HANDOVER"}
                            disabled={updatingId === runner.id}
                            onChange={(event) =>
                              updatePhase2Controls(runner.id, {
                                shippingMode: event.target.value as NonNullable<
                                  AdminRunner["shippingMode"]
                                >,
                              })
                            }
                            className="rounded border px-2 py-1"
                            title="Shipping mode"
                          >
                            <option value="MANUAL_HANDOVER">
                              Manual handover
                            </option>
                            <option value="MANUAL_TRACKING">
                              Manual tracking
                            </option>
                            <option value="PROVIDER_RATE_QUOTE">
                              Provider rate quote gated
                            </option>
                            <option value="PROVIDER_LABELS">
                              Provider labels gated
                            </option>
                          </select>
                          <select
                            value={runner.supervisionMode || "SUPERVISED"}
                            disabled={updatingId === runner.id}
                            onChange={(event) =>
                              updatePhase2Controls(runner.id, {
                                supervisionMode: event.target
                                  .value as NonNullable<
                                  AdminRunner["supervisionMode"]
                                >,
                              })
                            }
                            className="rounded border px-2 py-1"
                            title="Supervision mode"
                          >
                            <option value="SUPERVISED">
                              Supervised workflow
                            </option>
                            <option value="ASSISTED">
                              Assisted only after pilot
                            </option>
                            <option value="AUTOMATION_REVIEW">
                              Automation review only
                            </option>
                          </select>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {["DURBAN", "JOHANNESBURG", "MAPUTO"].map((city) => {
                          const checked = (runner.serviceCities || []).some(
                            (item) => item.city === city && item.active,
                          );
                          return (
                            <label
                              key={city}
                              className="inline-flex items-center gap-1 text-xs"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={updatingId === runner.id}
                                onChange={() => toggleCity(runner, city)}
                              />
                              {city[0] + city.slice(1).toLowerCase()}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                    <td className="max-w-xs px-4 py-4 align-top">
                      {runner.shopAssignments.length === 0 ? (
                        <span className="text-sm text-gray-400">No shops</span>
                      ) : (
                        <div className="space-y-2">
                          {runner.shopAssignments
                            .slice(0, 3)
                            .map((assignment) => (
                              <div key={assignment.id} className="text-sm">
                                <div className="flex items-center gap-2">
                                  <Store className="h-4 w-4 text-gray-400" />
                                  <span className="truncate">
                                    {assignment.shop.name}
                                  </span>
                                </div>
                                <span
                                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                    SHOP_STATUS_STYLES[assignment.status] ||
                                    "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {assignment.status}
                                </span>
                              </div>
                            ))}
                          {runner.shopAssignments.length > 3 && (
                            <div className="text-xs text-gray-500">
                              +{runner.shopAssignments.length - 3} more
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <select
                        value={runner.bridgeAccount?.id || ""}
                        disabled={updatingId === runner.id}
                        onChange={(event) =>
                          assignBridge(runner.id, event.target.value)
                        }
                        className="w-full rounded-lg border px-2 py-1.5 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {bridges.map((bridge) => (
                          <option key={bridge.id} value={bridge.id}>
                            {bridge.name} ({bridge._count?.runners || 0}/
                            {bridge.capacityRunners})
                          </option>
                        ))}
                      </select>
                      {runner.bridgeAccount && (
                        <div className="mt-1 text-xs text-gray-500">
                          {runner.bridgeAccount.phone || "No phone"} ·{" "}
                          {runner.bridgeAccount.status}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          STATUS_STYLES[runner.status] ||
                          "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {runner.status}
                      </span>
                      <div className="mt-2 text-xs text-gray-500">
                        Joined {new Date(runner.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex justify-end gap-2">
                        {user?.role === "SUPERUSER" && (
                          <button
                            onClick={() => operateAsRunner(runner)}
                            disabled={updatingId === runner.id}
                            className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                            title="Operate as this runner"
                          >
                            Operate
                          </button>
                        )}
                        {runner.trialStatus !== "TRIAL_ACTIVE" && (
                          <button
                            onClick={() => activateTrial(runner.id)}
                            disabled={updatingId === runner.id}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                            title="Activate Phase 1 trial"
                          >
                            Trial
                          </button>
                        )}
                        {runner.status !== "ACTIVE" && (
                          <button
                            onClick={() => updateStatus(runner.id, "ACTIVE")}
                            disabled={updatingId === runner.id}
                            className="rounded-lg bg-green-500 p-2 text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                            title="Activate runner"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        {runner.status !== "PENDING" && (
                          <button
                            onClick={() => updateStatus(runner.id, "PENDING")}
                            disabled={updatingId === runner.id}
                            className="rounded-lg bg-yellow-500 p-2 text-white transition-colors hover:bg-yellow-600 disabled:opacity-50"
                            title="Set pending"
                          >
                            <Clock className="h-4 w-4" />
                          </button>
                        )}
                        {runner.status !== "INACTIVE" && (
                          <button
                            onClick={() => updateStatus(runner.id, "INACTIVE")}
                            disabled={updatingId === runner.id}
                            className="rounded-lg bg-gray-600 p-2 text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
                            title="Deactivate runner"
                          >
                            <PauseCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0}
              className="rounded-lg border p-2 transition-colors hover:bg-gray-50 disabled:opacity-40"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() =>
                setPage((current) => Math.min(totalPages - 1, current + 1))
              }
              disabled={page >= totalPages - 1}
              className="rounded-lg border p-2 transition-colors hover:bg-gray-50 disabled:opacity-40"
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Pencil,
  Loader2,
  RadioTower,
  RefreshCw,
  Save,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAdminGuard } from "@/hooks/useRoleGuard";
import { adminApi } from "@/lib/api";

interface BridgeAccount {
  id: string;
  name: string;
  phone?: string | null;
  expectedPhone?: string | null;
  verifiedPhone?: string | null;
  phoneVerifiedAt?: string | null;
  verificationStatus?: string | null;
  mismatchReason?: string | null;
  mode?: "CAPTURE_ONLY" | "POST_ONLY" | "CAPTURE_AND_POST" | "PAUSED";
  sessionName?: string | null;
  workerKey?: string | null;
  status: string;
  health?: string;
  isBotBridge?: boolean;
  botBridgeAccountId?: string | null;
  capacityRunners: number;
  maxPostsPerRun: number;
  runtimeSettings?: BridgeRuntimeSettings | null;
  availableRunnerSlots?: number;
  notes?: string | null;
  lastSeenAt?: string | null;
  runners?: Array<{
    id: string;
    status: string;
    user?: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
  }>;
  metrics?: {
    availableGroups: number;
    totalGroupRecords: number;
    postsSentToday: number;
    failedPostsToday: number;
    recoveredPostsToday?: number;
    stillFailedPosts?: number;
    pendingRetries: number;
    lastSuccessfulRepostAt?: string | null;
    lastFailedRepostAt?: string | null;
    runtimeSignal?: {
      status: "OK" | "BROKEN" | "UNKNOWN";
      issueCount: number;
      lastIssue?: string | null;
      lastHealthy?: string | null;
      checkedAt: string;
    };
    recentRepostLogs: Array<{
      id: string;
      status: string;
      groupIdOrName: string;
      error?: string | null;
      retryCount: number;
      nextRetryAt?: string | null;
      lastAttemptAt?: string | null;
      postedAt?: string | null;
      listing?: {
        id: string;
        product?: {
          name?: string | null;
        } | null;
      } | null;
      runner?: {
        id: string;
        user?: {
          name?: string | null;
          phone?: string | null;
        } | null;
      } | null;
    }>;
  };
  _count?: {
    runners: number;
  };
}

interface BridgeRuntimeSettings {
  repostProductSeparator?: string;
  repostImagesPerListing?: number;
  repostSendDelayMs?: number;
  shopRepostSendDelayMs?: number;
  repostMaxPostsPerJob?: number;
  repostRetryDelayMinutes?: number;
  repostMaxRetryCount?: number;
  showRunnerPriceOnRepost?: boolean;
  syncGroupProfileImagesDuringDiscovery?: boolean;
  groupProfileImageSyncLimit?: number;
}

type BridgeEditForm = {
  name: string;
  phone: string;
  expectedPhone: string;
  mode: string;
  status: string;
  sessionName: string;
  workerKey: string;
  capacityRunners: number;
  maxPostsPerRun: number;
  notes: string;
};

interface DestinationConflict {
  destinationGroup: string;
  destinationName: string;
  participants: number | null;
  runnerCount: number;
  assignmentCount: number;
  severity: "CONFLICT" | "OK";
  assignments: Array<{
    assignmentId: string;
    runnerId: string;
    runnerName: string;
    runnerPhone: string | null;
    shopId: string;
    shopName: string;
    bridgeAccount: {
      id: string;
      name: string;
      phone?: string | null;
      status: string;
    } | null;
    maxPostsPerRun: number;
  }>;
}

interface BridgeLogFile {
  name: string;
  exists: boolean;
  size: number;
  modifiedAt?: string | null;
  lines: string[];
}

interface BridgeLogs {
  bridge: Pick<
    BridgeAccount,
    "id" | "name" | "phone" | "sessionName" | "workerKey" | "status"
  > & {
    lastSeenAt?: string | null;
  };
  lineLimit: number;
  files: BridgeLogFile[];
  combinedLines: Array<{
    file: string;
    text: string;
  }>;
  generatedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  HEALTHY: "bg-green-100 text-green-800",
  ONLINE: "bg-green-100 text-green-800",
  BROKEN: "bg-red-100 text-red-800",
  MISMATCHED: "bg-red-100 text-red-800",
  STALE: "bg-amber-100 text-amber-800",
  OFFLINE: "bg-red-100 text-red-800",
  INACTIVE: "bg-gray-100 text-gray-800",
};

const MODE_LABELS: Record<string, string> = {
  CAPTURE_AND_POST: "Capture + post",
  CAPTURE_ONLY: "Capture only",
  POST_ONLY: "Post only",
  PAUSED: "Paused",
};

const DEFAULT_RUNTIME_SETTINGS: Required<BridgeRuntimeSettings> = {
  repostProductSeparator: "━━━━━━━━━━━━",
  repostImagesPerListing: 0,
  repostSendDelayMs: 90000,
  shopRepostSendDelayMs: 90000,
  repostMaxPostsPerJob: 10,
  repostRetryDelayMinutes: 30,
  repostMaxRetryCount: 3,
  showRunnerPriceOnRepost: false,
  syncGroupProfileImagesDuringDiscovery: false,
  groupProfileImageSyncLimit: 40,
};

const runtimeSettingsFor = (
  settings?: BridgeRuntimeSettings | null,
): Required<BridgeRuntimeSettings> => ({
  ...DEFAULT_RUNTIME_SETTINGS,
  ...(settings || {}),
});

const editFormForBridge = (bridge: BridgeAccount): BridgeEditForm => ({
  name: bridge.name || "",
  phone: bridge.phone || "",
  expectedPhone: bridge.expectedPhone || bridge.phone || "",
  mode: bridge.mode || "CAPTURE_AND_POST",
  status: bridge.status || "INACTIVE",
  sessionName: bridge.sessionName || "",
  workerKey: bridge.workerKey || "",
  capacityRunners: Number(bridge.capacityRunners || 8),
  maxPostsPerRun: Number(bridge.maxPostsPerRun || 10),
  notes: bridge.notes || "",
});

const getLogLineClass = (text: string) => {
  if (
    /error|failed|exception|timeout|target closed|detached frame|protocol error/i.test(
      text,
    )
  ) {
    return "text-red-300";
  }
  if (/warning|warn|stale|retry/i.test(text)) {
    return "text-amber-200";
  }
  if (
    /ready|authenticated|capturing|posted|queued|healthy|online/i.test(text)
  ) {
    return "text-green-200";
  }
  return "text-gray-100";
};

const formatStatusAge = (updatedAt: Date | null, now: number) => {
  if (!updatedAt) return "not yet";
  const seconds = Math.max(0, Math.floor((now - updatedAt.getTime()) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
};

export default function AdminWhatsAppBridgesPage() {
  const { isReady } = useAdminGuard();
  const [bridges, setBridges] = useState<BridgeAccount[]>([]);
  const [destinationConflicts, setDestinationConflicts] = useState<
    DestinationConflict[]
  >([]);
  const [monitoredAssignments, setMonitoredAssignments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedLogBridge, setSelectedLogBridge] =
    useState<BridgeAccount | null>(null);
  const [bridgeLogs, setBridgeLogs] = useState<BridgeLogs | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
  const [bridgesUpdatedAt, setBridgesUpdatedAt] = useState<Date | null>(null);
  const [statusClock, setStatusClock] = useState(() => Date.now());
  const [settingsDrafts, setSettingsDrafts] = useState<
    Record<string, Required<BridgeRuntimeSettings>>
  >({});
  const [savingSettingsId, setSavingSettingsId] = useState<string | null>(null);
  const [savingBotBridgeId, setSavingBotBridgeId] = useState<string | null>(
    null,
  );
  const [editingBridgeId, setEditingBridgeId] = useState<string | null>(null);
  const [savingBridgeId, setSavingBridgeId] = useState<string | null>(null);
  const [bridgeEditDrafts, setBridgeEditDrafts] = useState<
    Record<string, BridgeEditForm>
  >({});
  const [form, setForm] = useState({
    name: "",
    phone: "",
    expectedPhone: "",
    mode: "CAPTURE_AND_POST",
    sessionName: "",
    workerKey: "",
    capacityRunners: 8,
    maxPostsPerRun: 10,
    runtimeSettings: DEFAULT_RUNTIME_SETTINGS,
    notes: "",
  });

  useEffect(() => {
    if (!isReady) return;
    loadBridges();
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadBridges(true);
    };
    const interval = window.setInterval(refreshWhenVisible, 10_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isReady]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") setStatusClock(Date.now());
    }, 10_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedLogBridge || !autoRefreshLogs) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadBridgeLogs(selectedLogBridge, true);
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [selectedLogBridge, autoRefreshLogs]);

  const loadBridges = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [bridgesResponse, conflictsResponse] = await Promise.all([
        adminApi.getWhatsAppBridges(),
        adminApi.getWhatsAppDestinationConflicts(),
      ]);
      setBridges(
        Array.isArray(bridgesResponse.data) ? bridgesResponse.data : [],
      );
      setSettingsDrafts(
        Object.fromEntries(
          (Array.isArray(bridgesResponse.data) ? bridgesResponse.data : []).map(
            (bridge: BridgeAccount) => [
              bridge.id,
              runtimeSettingsFor(bridge.runtimeSettings),
            ],
          ),
        ),
      );
      setDestinationConflicts(conflictsResponse.data?.data || []);
      setMonitoredAssignments(
        Number(conflictsResponse.data?.monitoredAssignments || 0),
      );
      setBridgesUpdatedAt(new Date());
    } catch (error: any) {
      if (!silent) {
        toast.error(error?.response?.data?.message || "Failed to load bridges");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const totals = useMemo(
    () =>
      bridges.reduce(
        (acc, bridge) => {
          acc.capacity += Number(bridge.capacityRunners || 0);
          acc.assigned += Number(bridge._count?.runners || 0);
          acc.postsToday += Number(bridge.metrics?.postsSentToday || 0);
          acc.failuresToday += Number(bridge.metrics?.failedPostsToday || 0);
          if ((bridge.health || bridge.status) === "HEALTHY") acc.healthy += 1;
          return acc;
        },
        {
          capacity: 0,
          assigned: 0,
          healthy: 0,
          postsToday: 0,
          failuresToday: 0,
        },
      ),
    [bridges],
  );

  const createBridge = async () => {
    const inferredName =
      form.name.trim() ||
      form.phone.trim() ||
      form.sessionName.trim() ||
      form.workerKey.trim() ||
      `WhatsApp Bridge ${new Date().toLocaleDateString()}`;

    setSaving(true);
    try {
      await adminApi.createWhatsAppBridge({
        ...form,
        name: inferredName,
        expectedPhone: form.expectedPhone || form.phone,
        capacityRunners: Number(form.capacityRunners || 8),
        maxPostsPerRun: Number(form.maxPostsPerRun || 10),
        runtimeSettings: form.runtimeSettings,
      });
      toast.success("Bridge account created");
      setForm({
        name: "",
        phone: "",
        expectedPhone: "",
        mode: "CAPTURE_AND_POST",
        sessionName: "",
        workerKey: "",
        capacityRunners: 8,
        maxPostsPerRun: 10,
        runtimeSettings: DEFAULT_RUNTIME_SETTINGS,
        notes: "",
      });
      await loadBridges();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to create bridge");
    } finally {
      setSaving(false);
    }
  };

  const updateBridgeStatus = async (bridge: BridgeAccount, status: string) => {
    try {
      await adminApi.updateWhatsAppBridge(bridge.id, { status });
      toast.success(`Bridge set to ${status.toLowerCase()}`);
      await loadBridges();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to update bridge");
    }
  };

  const startEditingBridge = (bridge: BridgeAccount) => {
    setEditingBridgeId(bridge.id);
    setBridgeEditDrafts((current) => ({
      ...current,
      [bridge.id]: current[bridge.id] || editFormForBridge(bridge),
    }));
  };

  const cancelEditingBridge = (bridgeId: string) => {
    setEditingBridgeId(null);
    setBridgeEditDrafts((current) => {
      const next = { ...current };
      delete next[bridgeId];
      return next;
    });
  };

  const updateBridgeEditDraft = <K extends keyof BridgeEditForm>(
    bridgeId: string,
    key: K,
    value: BridgeEditForm[K],
  ) => {
    setBridgeEditDrafts((current) => ({
      ...current,
      [bridgeId]: {
        ...(current[bridgeId] || editFormForBridge({} as BridgeAccount)),
        [key]: value,
      },
    }));
  };

  const saveBridgeEdit = async (bridge: BridgeAccount) => {
    const draft = bridgeEditDrafts[bridge.id] || editFormForBridge(bridge);
    if (!draft.name.trim()) {
      toast.error("Bridge name is required");
      return;
    }

    setSavingBridgeId(bridge.id);
    try {
      await adminApi.updateWhatsAppBridge(bridge.id, {
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        expectedPhone: draft.expectedPhone.trim() || draft.phone.trim() || null,
        mode: draft.mode,
        status: draft.status.trim() || "INACTIVE",
        sessionName: draft.sessionName.trim() || null,
        workerKey: draft.workerKey.trim() || null,
        capacityRunners: Number(draft.capacityRunners || 8),
        maxPostsPerRun: Number(draft.maxPostsPerRun || 10),
        notes: draft.notes.trim() || null,
      });
      toast.success("Bridge updated");
      setEditingBridgeId(null);
      setBridgeEditDrafts((current) => {
        const next = { ...current };
        delete next[bridge.id];
        return next;
      });
      await loadBridges();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to update bridge");
    } finally {
      setSavingBridgeId(null);
    }
  };

  const updateBridgeMode = async (bridge: BridgeAccount, mode: string) => {
    try {
      await adminApi.updateWhatsAppBridge(bridge.id, { mode });
      toast.success(`Bridge mode set to ${MODE_LABELS[mode] || mode}`);
      await loadBridges();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to update mode");
    }
  };

  const setBotBridge = async (bridge: BridgeAccount) => {
    setSavingBotBridgeId(bridge.id);
    try {
      await adminApi.setWhatsAppBotBridge(bridge.id);
      toast.success(`Runner bot switched to ${bridge.name}`);
      await loadBridges();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to switch runner bot bridge",
      );
    } finally {
      setSavingBotBridgeId(null);
    }
  };

  const updateSettingsDraft = <K extends keyof Required<BridgeRuntimeSettings>>(
    bridgeId: string,
    key: K,
    value: Required<BridgeRuntimeSettings>[K],
  ) => {
    setSettingsDrafts((current) => ({
      ...current,
      [bridgeId]: {
        ...(current[bridgeId] || DEFAULT_RUNTIME_SETTINGS),
        [key]: value,
      },
    }));
  };

  const saveBridgeRuntimeSettings = async (bridge: BridgeAccount) => {
    const runtimeSettings =
      settingsDrafts[bridge.id] || runtimeSettingsFor(bridge.runtimeSettings);
    setSavingSettingsId(bridge.id);
    try {
      await adminApi.updateWhatsAppBridge(bridge.id, { runtimeSettings });
      toast.success("Bridge runtime settings saved");
      await loadBridges();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to save bridge settings",
      );
    } finally {
      setSavingSettingsId(null);
    }
  };

  const copyBridgeId = async (bridge: BridgeAccount) => {
    try {
      await navigator.clipboard.writeText(bridge.id);
      toast.success("Bridge ID copied");
    } catch {
      toast.error("Failed to copy bridge ID");
    }
  };

  const deleteBridge = async (bridge: BridgeAccount) => {
    if (
      !confirm(
        `Delete ${bridge.name}? Assigned runners will be unassigned from this bridge.`,
      )
    ) {
      return;
    }

    try {
      await adminApi.deleteWhatsAppBridge(bridge.id);
      toast.success("Bridge deleted");
      await loadBridges();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete bridge");
    }
  };

  const loadBridgeLogs = async (bridge: BridgeAccount, silent = false) => {
    if (!silent) {
      setLoadingLogs(true);
      setBridgeLogs(null);
    }

    try {
      const response = await adminApi.getWhatsAppBridgeLogs(bridge.id, 300);
      setBridgeLogs(response.data);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to load bridge logs",
      );
    } finally {
      if (!silent) {
        setLoadingLogs(false);
      }
    }
  };

  const openBridgeLogs = async (bridge: BridgeAccount) => {
    setSelectedLogBridge(bridge);
    setAutoRefreshLogs(false);
    await loadBridgeLogs(bridge);
  };

  const closeBridgeLogs = () => {
    setSelectedLogBridge(null);
    setBridgeLogs(null);
    setAutoRefreshLogs(false);
  };

  if (!isReady || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <RadioTower className="h-8 w-8" />
            WhatsApp Bridges
          </h1>
          <p className="text-sm text-gray-600">
            Manage reposting bridge numbers, capacity, and worker health.
          </p>
          <p className="mt-1 text-xs font-medium text-gray-500">
            Live health updated {formatStatusAge(bridgesUpdatedAt, statusClock)}
          </p>
        </div>
        <Button variant="outline" onClick={() => loadBridges()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Bridge capacity</p>
          <p className="mt-1 text-2xl font-bold">{totals.capacity}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Assigned runners</p>
          <p className="mt-1 text-2xl font-bold">{totals.assigned}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Healthy workers</p>
          <p className="mt-1 text-2xl font-bold">{totals.healthy}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Posts today</p>
          <p className="mt-1 text-2xl font-bold">{totals.postsToday}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Failures today</p>
          <p className="mt-1 text-2xl font-bold text-red-700">
            {totals.failuresToday}
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Shared Destination Group Monitor
            </h2>
            <p className="text-sm text-gray-600">
              Enforces one active runner per customer/repost group. New shared
              access and repost attempts are blocked to prevent duplicate
              adverts in the same WhatsApp group; conflicts below are existing
              assignments that still need correction.
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {destinationConflicts.length} conflict
            {destinationConflicts.length === 1 ? "" : "s"} from{" "}
            {monitoredAssignments} active auto-post assignment
            {monitoredAssignments === 1 ? "" : "s"}
          </div>
        </div>

        {destinationConflicts.length === 0 ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            No shared destination groups detected among active auto-post
            runners.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">
                    Destination Group
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Runners</th>
                  <th className="px-4 py-3 text-left font-semibold">Shops</th>
                  <th className="px-4 py-3 text-left font-semibold">Bridges</th>
                  <th className="px-4 py-3 text-left font-semibold">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {destinationConflicts.map((conflict) => {
                  const runnerNames = [
                    ...new Set(
                      conflict.assignments.map(
                        (assignment) => assignment.runnerName,
                      ),
                    ),
                  ];
                  const shopNames = [
                    ...new Set(
                      conflict.assignments.map(
                        (assignment) => assignment.shopName,
                      ),
                    ),
                  ];
                  const bridgeNames = [
                    ...new Set(
                      conflict.assignments.map(
                        (assignment) =>
                          assignment.bridgeAccount?.name || "No bridge",
                      ),
                    ),
                  ];

                  return (
                    <tr key={conflict.destinationGroup}>
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold">
                          {conflict.destinationName}
                        </div>
                        <div className="mt-1 font-mono text-xs text-gray-500">
                          {conflict.destinationGroup}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {conflict.participants ?? "-"} participants
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-red-700">
                          {conflict.runnerCount} runners
                        </div>
                        <div className="mt-1 space-y-1 text-xs text-gray-600">
                          {runnerNames.slice(0, 5).map((runner) => (
                            <div key={runner}>{runner}</div>
                          ))}
                          {runnerNames.length > 5 && (
                            <div>+{runnerNames.length - 5} more</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-xs text-gray-600">
                          {shopNames.slice(0, 6).join(", ")}
                          {shopNames.length > 6
                            ? ` +${shopNames.length - 6} more`
                            : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-xs text-gray-600">
                          {bridgeNames.join(", ")}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-800">
                          Access blocked for new posts
                        </span>
                        <div className="mt-2 text-xs text-gray-500">
                          {conflict.assignmentCount} shop assignment
                          {conflict.assignmentCount === 1 ? "" : "s"} post here
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Add bridge number</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm font-medium text-gray-700">
            Bridge name
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Optional, e.g. Doreen Bridge"
              className="w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">
            WhatsApp number
            <input
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              placeholder="+268..."
              className="w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">
            Expected linked number
            <input
              value={form.expectedPhone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expectedPhone: event.target.value,
                }))
              }
              placeholder="+268..."
              className="w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">
            Bridge mode
            <select
              value={form.mode}
              onChange={(event) =>
                setForm((current) => ({ ...current, mode: event.target.value }))
              }
              className="w-full rounded-lg border px-3 py-2 text-sm font-normal"
            >
              <option value="CAPTURE_AND_POST">Capture + post</option>
              <option value="CAPTURE_ONLY">Capture only</option>
              <option value="POST_ONLY">Post only</option>
              <option value="PAUSED">Paused</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">
            Session name
            <input
              value={form.sessionName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sessionName: event.target.value,
                }))
              }
              placeholder="Optional"
              className="w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">
            Worker key
            <input
              value={form.workerKey}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  workerKey: event.target.value,
                }))
              }
              placeholder="Optional"
              className="w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">
            Runner capacity
            <input
              type="number"
              min={1}
              max={100}
              value={form.capacityRunners}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  capacityRunners: Number(event.target.value),
                }))
              }
              className="w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">
            Max posts/run
            <select
              value={form.maxPostsPerRun}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  maxPostsPerRun: Number(event.target.value),
                }))
              }
              className="w-full rounded-lg border px-3 py-2 text-sm font-normal"
            >
              {[6, 8, 10].map((value) => (
                <option key={value} value={value}>
                  {value} posts
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700 md:col-span-4">
            Notes
            <input
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Optional"
              className="w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
        </div>
        <Button className="mt-3" isLoading={saving} onClick={createBridge}>
          Add bridge
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Bridge
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Capacity
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Health
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Activity
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {bridges.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-gray-500">
                  No bridge accounts configured yet.
                </td>
              </tr>
            ) : (
              bridges.map((bridge) => {
                const health = bridge.health || bridge.status;
                const canUseForBot =
                  ["ACTIVE", "CONNECTED", "READY", "ONLINE"].includes(
                    bridge.status,
                  ) && bridge.mode !== "PAUSED";
                const isEditing = editingBridgeId === bridge.id;
                const editDraft =
                  bridgeEditDrafts[bridge.id] || editFormForBridge(bridge);
                return (
                  <tr key={bridge.id}>
                    <td className="px-4 py-4 align-top">
                      {isEditing ? (
                        <BridgeIdentityEditor
                          bridgeId={bridge.id}
                          draft={editDraft}
                          onChange={updateBridgeEditDraft}
                        />
                      ) : (
                        <>
                          <div className="font-semibold">{bridge.name}</div>
                          <div className="text-sm text-gray-600">
                            {bridge.phone || "No phone"} ·{" "}
                            {bridge.sessionName || "No session name"}
                          </div>
                        </>
                      )}
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-800">
                          {MODE_LABELS[
                            (isEditing ? editDraft.mode : bridge.mode) ||
                              "CAPTURE_AND_POST"
                          ] ||
                            (isEditing ? editDraft.mode : bridge.mode) ||
                            "Capture + post"}
                        </span>
                        {bridge.isBotBridge && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">
                            <RadioTower className="h-3 w-3" />
                            Bot inbox
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-1 font-semibold ${
                            bridge.verificationStatus === "VERIFIED"
                              ? "bg-green-100 text-green-800"
                              : bridge.verificationStatus === "MISMATCHED"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {bridge.verificationStatus || "UNVERIFIED"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Expected:{" "}
                        {isEditing
                          ? editDraft.expectedPhone || editDraft.phone || "-"
                          : bridge.expectedPhone || bridge.phone || "-"}{" "}
                        · Verified: {bridge.verifiedPhone || "-"}
                      </div>
                      {bridge.mismatchReason && (
                        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                          {bridge.mismatchReason}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-500">
                        Worker:{" "}
                        {isEditing
                          ? editDraft.workerKey || "not set"
                          : bridge.workerKey || "not set"}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="font-mono">{bridge.id}</span>
                        <button
                          type="button"
                          onClick={() => copyBridgeId(bridge)}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <Copy className="h-3 w-3" />
                          Copy ID
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm">
                      {isEditing ? (
                        <div className="grid gap-2">
                          <label className="text-xs font-semibold text-gray-700">
                            Capacity
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={editDraft.capacityRunners}
                              onChange={(event) =>
                                updateBridgeEditDraft(
                                  bridge.id,
                                  "capacityRunners",
                                  Number(event.target.value || 1),
                                )
                              }
                              className="mt-1 w-full rounded border px-2 py-1 font-normal"
                            />
                          </label>
                          <label className="text-xs font-semibold text-gray-700">
                            Max posts/run
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={editDraft.maxPostsPerRun}
                              onChange={(event) =>
                                updateBridgeEditDraft(
                                  bridge.id,
                                  "maxPostsPerRun",
                                  Number(event.target.value || 1),
                                )
                              }
                              className="mt-1 w-full rounded border px-2 py-1 font-normal"
                            />
                          </label>
                          <div className="text-xs text-gray-500">
                            {bridge._count?.runners || 0} runners currently
                            assigned
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            {bridge._count?.runners || 0} /{" "}
                            {bridge.capacityRunners} runners
                          </div>
                          <div className="text-gray-500">
                            Max {bridge.maxPostsPerRun} posts/run
                          </div>
                        </>
                      )}
                      <div className="mt-1 text-gray-500">
                        {bridge.metrics?.availableGroups || 0} available groups
                        {bridge.metrics?.totalGroupRecords &&
                        bridge.metrics.totalGroupRecords !==
                          bridge.metrics.availableGroups
                          ? ` (${bridge.metrics.totalGroupRecords} total seen)`
                          : ""}
                      </div>
                      {bridge.runners && bridge.runners.length > 0 && (
                        <div className="mt-2 space-y-1 text-xs text-gray-500">
                          {bridge.runners.slice(0, 4).map((runner) => (
                            <div key={runner.id}>
                              {runner.user?.name ||
                                runner.user?.phone ||
                                runner.user?.email ||
                                runner.id}
                            </div>
                          ))}
                          {bridge.runners.length > 4 && (
                            <div>+{bridge.runners.length - 4} more</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          STATUS_STYLES[health] || STATUS_STYLES.INACTIVE
                        }`}
                      >
                        {health}
                      </span>
                      <div className="mt-1 text-xs text-gray-500">
                        {bridge.lastSeenAt
                          ? `Last seen ${new Date(bridge.lastSeenAt).toLocaleString()}`
                          : "Never seen"}
                      </div>
                      {bridge.metrics?.runtimeSignal?.status === "BROKEN" && (
                        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                          <div className="font-semibold">
                            Runtime monitor detected{" "}
                            {bridge.metrics.runtimeSignal.issueCount} repeated
                            issue
                            {bridge.metrics.runtimeSignal.issueCount === 1
                              ? ""
                              : "s"}
                          </div>
                          {bridge.metrics.runtimeSignal.lastIssue && (
                            <div className="mt-1 line-clamp-3">
                              {bridge.metrics.runtimeSignal.lastIssue}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-sm">
                      <div className="grid grid-cols-2 gap-2 text-center xl:grid-cols-4">
                        <div className="rounded border bg-gray-50 px-2 py-1">
                          <div className="text-xs text-gray-500">Sent</div>
                          <div className="font-bold">
                            {bridge.metrics?.postsSentToday || 0}
                          </div>
                        </div>
                        <div className="rounded border bg-gray-50 px-2 py-1">
                          <div className="text-xs text-gray-500">
                            Still failed
                          </div>
                          <div className="font-bold text-red-700">
                            {bridge.metrics?.stillFailedPosts ??
                              bridge.metrics?.failedPostsToday ??
                              0}
                          </div>
                        </div>
                        <div className="rounded border bg-gray-50 px-2 py-1">
                          <div className="text-xs text-gray-500">
                            Retry queue
                          </div>
                          <div className="font-bold text-amber-700">
                            {bridge.metrics?.pendingRetries || 0}
                          </div>
                        </div>
                        <div className="rounded border bg-gray-50 px-2 py-1">
                          <div className="text-xs text-gray-500">Recovered</div>
                          <div className="font-bold text-emerald-700">
                            {bridge.metrics?.recoveredPostsToday || 0}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        Last success:{" "}
                        {bridge.metrics?.lastSuccessfulRepostAt
                          ? new Date(
                              bridge.metrics.lastSuccessfulRepostAt,
                            ).toLocaleString()
                          : "none"}
                      </div>
                      <div className="text-xs text-gray-500">
                        Last failure:{" "}
                        {bridge.metrics?.lastFailedRepostAt
                          ? new Date(
                              bridge.metrics.lastFailedRepostAt,
                            ).toLocaleString()
                          : "none"}
                      </div>
                      {(bridge.metrics?.recentRepostLogs || []).length > 0 && (
                        <div className="mt-3 space-y-2">
                          {(bridge.metrics?.recentRepostLogs || []).map(
                            (log) => (
                              <div
                                key={log.id}
                                className="rounded border border-gray-100 bg-gray-50 p-2 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold">
                                    {log.listing?.product?.name || "Listing"}
                                  </span>
                                  <span
                                    className={
                                      log.status === "POSTED"
                                        ? "text-green-700"
                                        : "text-red-700"
                                    }
                                  >
                                    {log.status}
                                  </span>
                                </div>
                                <div className="mt-1 text-gray-500">
                                  {log.runner?.user?.name ||
                                    log.runner?.user?.phone ||
                                    "Runner"}{" "}
                                  {"->"} {log.groupIdOrName}
                                </div>
                                {log.error && (
                                  <div className="mt-1 line-clamp-2 text-red-700">
                                    {log.error}
                                  </div>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right align-top">
                      <div className="flex justify-end gap-2">
                        <select
                          value={
                            isEditing
                              ? editDraft.mode
                              : bridge.mode || "CAPTURE_AND_POST"
                          }
                          onChange={(event) =>
                            isEditing
                              ? updateBridgeEditDraft(
                                  bridge.id,
                                  "mode",
                                  event.target.value,
                                )
                              : updateBridgeMode(bridge, event.target.value)
                          }
                          className="rounded border px-2 py-1 text-sm"
                          aria-label={`Mode for ${bridge.name}`}
                        >
                          <option value="CAPTURE_AND_POST">
                            Capture + post
                          </option>
                          <option value="CAPTURE_ONLY">Capture only</option>
                          <option value="POST_ONLY">Post only</option>
                          <option value="PAUSED">Paused</option>
                        </select>
                        {isEditing && (
                          <select
                            value={editDraft.status}
                            onChange={(event) =>
                              updateBridgeEditDraft(
                                bridge.id,
                                "status",
                                event.target.value,
                              )
                            }
                            className="rounded border px-2 py-1 text-sm"
                            aria-label={`Status for ${bridge.name}`}
                          >
                            <option value="INACTIVE">Inactive</option>
                            <option value="ONLINE">Online</option>
                            <option value="MISMATCHED">Mismatched</option>
                            <option value="OFFLINE">Offline</option>
                          </select>
                        )}
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => saveBridgeEdit(bridge)}
                              disabled={savingBridgeId === bridge.id}
                            >
                              {savingBridgeId === bridge.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cancelEditingBridge(bridge.id)}
                              disabled={savingBridgeId === bridge.id}
                            >
                              <X className="h-4 w-4" />
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditingBridge(bridge)}
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={bridge.isBotBridge ? "primary" : "outline"}
                          onClick={() => setBotBridge(bridge)}
                          disabled={
                            isEditing ||
                            bridge.isBotBridge ||
                            !canUseForBot ||
                            savingBotBridgeId === bridge.id
                          }
                        >
                          {savingBotBridgeId === bridge.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RadioTower className="h-4 w-4" />
                          )}
                          {bridge.isBotBridge ? "Bot active" : "Use for bot"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openBridgeLogs(bridge)}
                          disabled={isEditing}
                        >
                          <Terminal className="h-4 w-4" />
                          Logs
                        </Button>
                        {bridge.status === "INACTIVE" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateBridgeStatus(bridge, "ONLINE")}
                            disabled={isEditing}
                          >
                            Resume
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateBridgeStatus(bridge, "INACTIVE")
                            }
                            disabled={isEditing}
                          >
                            Pause
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => deleteBridge(bridge)}
                          disabled={isEditing}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <BridgeRuntimeSettingsPanel
                        bridge={bridge}
                        draft={
                          settingsDrafts[bridge.id] ||
                          runtimeSettingsFor(bridge.runtimeSettings)
                        }
                        onChange={(key, value) =>
                          updateSettingsDraft(bridge.id, key, value)
                        }
                        onSave={() => saveBridgeRuntimeSettings(bridge)}
                        isSaving={savingSettingsId === bridge.id}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedLogBridge && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 backdrop-blur-sm">
          <div className="mx-auto flex max-h-[92vh] max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex flex-col gap-3 border-b px-5 py-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Terminal className="h-5 w-5" />
                  Bridge Console Logs
                </h2>
                <p className="text-sm text-gray-600">
                  {selectedLogBridge.name} ·{" "}
                  {selectedLogBridge.sessionName || "No session"} ·{" "}
                  {selectedLogBridge.workerKey || "No worker key"}
                </p>
                {bridgeLogs?.generatedAt && (
                  <p className="mt-1 text-xs text-gray-500">
                    Refreshed{" "}
                    {new Date(bridgeLogs.generatedAt).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={autoRefreshLogs}
                    onChange={(event) =>
                      setAutoRefreshLogs(event.target.checked)
                    }
                  />
                  Auto refresh
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadBridgeLogs(selectedLogBridge)}
                  disabled={loadingLogs}
                >
                  {loadingLogs ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
                <Button size="sm" variant="outline" onClick={closeBridgeLogs}>
                  <X className="h-4 w-4" />
                  Close
                </Button>
              </div>
            </div>

            <div className="border-b bg-gray-50 px-5 py-3">
              <div className="flex flex-wrap gap-2 text-xs text-gray-700">
                {(bridgeLogs?.files || []).map((file) => (
                  <span
                    key={file.name}
                    className={`rounded-full border px-3 py-1 ${
                      file.exists
                        ? "border-green-200 bg-green-50 text-green-800"
                        : "border-gray-200 bg-white text-gray-500"
                    }`}
                  >
                    {file.name}
                    {file.exists && file.modifiedAt
                      ? ` · ${new Date(file.modifiedAt).toLocaleTimeString()}`
                      : " · not found"}
                  </span>
                ))}
              </div>
            </div>

            <div className="min-h-[420px] flex-1 overflow-auto bg-gray-950 p-4 font-mono text-xs leading-5">
              {loadingLogs ? (
                <div className="flex h-full min-h-[360px] items-center justify-center text-gray-300">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading bridge logs...
                </div>
              ) : (bridgeLogs?.combinedLines || []).length === 0 ? (
                <div className="flex h-full min-h-[360px] items-center justify-center text-gray-400">
                  No log lines found for this bridge yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {(bridgeLogs?.combinedLines || []).map((line, index) => (
                    <div
                      key={`${line.file}-${index}`}
                      className="grid grid-cols-[minmax(120px,180px)_1fr] gap-3"
                    >
                      <span className="truncate text-gray-500">
                        {line.file}
                      </span>
                      <span
                        className={`whitespace-pre-wrap ${getLogLineClass(line.text)}`}
                      >
                        {line.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BridgeIdentityEditor({
  bridgeId,
  draft,
  onChange,
}: {
  bridgeId: string;
  draft: BridgeEditForm;
  onChange: <K extends keyof BridgeEditForm>(
    bridgeId: string,
    key: K,
    value: BridgeEditForm[K],
  ) => void;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-xs font-semibold text-gray-700">
        Bridge name
        <input
          value={draft.name}
          onChange={(event) => onChange(bridgeId, "name", event.target.value)}
          className="mt-1 w-full rounded border px-2 py-1 font-normal"
        />
      </label>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs font-semibold text-gray-700">
          WhatsApp number
          <input
            value={draft.phone}
            onChange={(event) =>
              onChange(bridgeId, "phone", event.target.value)
            }
            placeholder="+268..."
            className="mt-1 w-full rounded border px-2 py-1 font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-gray-700">
          Expected linked number
          <input
            value={draft.expectedPhone}
            onChange={(event) =>
              onChange(bridgeId, "expectedPhone", event.target.value)
            }
            placeholder="+268..."
            className="mt-1 w-full rounded border px-2 py-1 font-normal"
          />
        </label>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs font-semibold text-gray-700">
          Session name
          <input
            value={draft.sessionName}
            onChange={(event) =>
              onChange(bridgeId, "sessionName", event.target.value)
            }
            className="mt-1 w-full rounded border px-2 py-1 font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-gray-700">
          Worker key
          <input
            value={draft.workerKey}
            onChange={(event) =>
              onChange(bridgeId, "workerKey", event.target.value)
            }
            className="mt-1 w-full rounded border px-2 py-1 font-normal"
          />
        </label>
      </div>
      <label className="text-xs font-semibold text-gray-700">
        Notes
        <textarea
          value={draft.notes}
          onChange={(event) => onChange(bridgeId, "notes", event.target.value)}
          rows={2}
          className="mt-1 w-full rounded border px-2 py-1 font-normal"
        />
      </label>
    </div>
  );
}

function BridgeRuntimeSettingsPanel({
  bridge,
  draft,
  onChange,
  onSave,
  isSaving,
}: {
  bridge: BridgeAccount;
  draft: Required<BridgeRuntimeSettings>;
  onChange: <K extends keyof Required<BridgeRuntimeSettings>>(
    key: K,
    value: Required<BridgeRuntimeSettings>[K],
  ) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <details className="mt-3 rounded-lg border bg-gray-50 p-3 text-left">
      <summary className="cursor-pointer text-xs font-bold text-gray-800">
        Runtime settings
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid gap-2 text-xs md:grid-cols-2">
          <label className="flex items-center gap-2 rounded border bg-white px-2 py-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={draft.showRunnerPriceOnRepost}
              onChange={(event) =>
                onChange("showRunnerPriceOnRepost", event.target.checked)
              }
            />
            Show runner final price
          </label>
          <label className="flex items-center gap-2 rounded border bg-white px-2 py-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={draft.syncGroupProfileImagesDuringDiscovery}
              onChange={(event) =>
                onChange(
                  "syncGroupProfileImagesDuringDiscovery",
                  event.target.checked,
                )
              }
            />
            Sync group avatars
          </label>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-xs font-semibold text-gray-700">
            Divider (always sent before each item)
            <input
              value={draft.repostProductSeparator}
              onChange={(event) =>
                onChange("repostProductSeparator", event.target.value)
              }
              className="mt-1 w-full rounded border px-2 py-1 font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Images/listing
            <input
              type="number"
              min={0}
              max={20}
              value={draft.repostImagesPerListing}
              onChange={(event) =>
                onChange(
                  "repostImagesPerListing",
                  Number(event.target.value || 0),
                )
              }
              className="mt-1 w-full rounded border px-2 py-1 font-normal"
            />
            <span className="mt-1 block font-normal text-gray-500">
              0 sends all product images.
            </span>
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Send delay ms
            <input
              type="number"
              min={90000}
              max={300000}
              value={draft.repostSendDelayMs}
              onChange={(event) =>
                onChange(
                  "repostSendDelayMs",
                  Number(event.target.value || 90000),
                )
              }
              className="mt-1 w-full rounded border px-2 py-1 font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Shop repost delay ms
            <input
              type="number"
              min={90000}
              max={300000}
              value={draft.shopRepostSendDelayMs}
              onChange={(event) =>
                onChange(
                  "shopRepostSendDelayMs",
                  Number(event.target.value || 90000),
                )
              }
              className="mt-1 w-full rounded border px-2 py-1 font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Max posts per job
            <input
              type="number"
              min={1}
              max={10}
              value={draft.repostMaxPostsPerJob}
              onChange={(event) =>
                onChange(
                  "repostMaxPostsPerJob",
                  Number(event.target.value || 8),
                )
              }
              className="mt-1 w-full rounded border px-2 py-1 font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Retry delay minutes
            <input
              type="number"
              min={1}
              max={1440}
              value={draft.repostRetryDelayMinutes}
              onChange={(event) =>
                onChange(
                  "repostRetryDelayMinutes",
                  Number(event.target.value || 30),
                )
              }
              className="mt-1 w-full rounded border px-2 py-1 font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Max repost retries
            <input
              type="number"
              min={0}
              max={20}
              value={draft.repostMaxRetryCount}
              onChange={(event) =>
                onChange("repostMaxRetryCount", Number(event.target.value || 0))
              }
              className="mt-1 w-full rounded border px-2 py-1 font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Avatar sync limit
            <input
              type="number"
              min={0}
              max={500}
              value={draft.groupProfileImageSyncLimit}
              onChange={(event) =>
                onChange(
                  "groupProfileImageSyncLimit",
                  Number(event.target.value || 0),
                )
              }
              className="mt-1 w-full rounded border px-2 py-1 font-normal"
            />
          </label>
        </div>

        <div className="rounded border border-blue-100 bg-blue-50 p-2 text-xs text-blue-900">
          These settings are read by the running bridge worker. Some polling
          intervals still come from the startup script and need a bridge restart
          to change.
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={onSave}
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Save runtime settings for {bridge.name}
        </Button>
      </div>
    </details>
  );
}

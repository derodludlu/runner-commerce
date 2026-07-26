"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CirclePlay,
  Copy,
  MegaphoneOff,
  MessageCircleOff,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAdminGuard } from "@/hooks/useRoleGuard";
import { adminApi } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useFeatureFlags } from "@/context/FeatureFlagsContext";

type DevState = {
  counts: Record<string, number>;
  settings: {
    runnerShopJoinAutoApprovalEnabled: boolean;
    phase2Enabled: boolean;
    whatsappOrderTrackingEnabled: boolean;
    whatsappRepostingEnabled: boolean;
  };
  rbac: Record<string, string[]>;
};

type OperationsState = {
  maintenanceMode: boolean;
  whatsappRepostingEnabled: boolean;
  canStartFromUi: boolean;
  startCommand: string;
};

export default function AdminDevelopmentPage() {
  const { isReady } = useAdminGuard();
  const { refresh: refreshFeatureFlags } = useFeatureFlags();
  const [state, setState] = useState<DevState | null>(null);
  const [operations, setOperations] = useState<OperationsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState<string | null>(null);
  const [productCleanupAge, setProductCleanupAge] = useState(1);
  const [productCleanupUnit, setProductCleanupUnit] = useState<
    "hours" | "days"
  >("days");
  const phase2EnabledRef = useRef<boolean | null>(null);

  const loadState = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setIsLoading(true);
      try {
        const [stateResponse, operationsResponse] = await Promise.all([
          adminApi.getDevelopmentState(),
          adminApi.getOperationsState(),
        ]);
        const nextState = stateResponse.data as DevState;
        if (
          phase2EnabledRef.current !== null &&
          phase2EnabledRef.current !== nextState.settings.phase2Enabled
        ) {
          void refreshFeatureFlags();
        }
        phase2EnabledRef.current = nextState.settings.phase2Enabled;
        setState(nextState);
        setOperations(operationsResponse.data);
      } catch (error: any) {
        if (!options?.silent) {
          toast.error(
            error.response?.data?.message || "Failed to load dev state",
          );
        }
      } finally {
        if (!options?.silent) setIsLoading(false);
      }
    },
    [refreshFeatureFlags],
  );

  useEffect(() => {
    if (isReady) void loadState();
  }, [isReady, loadState]);

  useEffect(() => {
    if (!isReady) return;

    const refreshSilently = () => {
      if (document.hidden || isWorking) return;
      void loadState({ silent: true });
    };

    const intervalId = window.setInterval(refreshSilently, 5000);
    window.addEventListener("focus", refreshSilently);
    document.addEventListener("visibilitychange", refreshSilently);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshSilently);
      document.removeEventListener("visibilitychange", refreshSilently);
    };
  }, [isReady, isWorking, loadState]);

  const toggleAutoApproval = async () => {
    if (!state) return;
    const enabled = !state.settings.runnerShopJoinAutoApprovalEnabled;
    setIsWorking("auto-approval");
    try {
      await adminApi.updateRunnerShopAutoApproval(enabled);
      toast.success(
        enabled
          ? "Runner shop auto-approval enabled"
          : "Runner shop auto-approval disabled",
      );
      await loadState();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to update auto-approval",
      );
    } finally {
      setIsWorking(null);
    }
  };

  const toggleWhatsAppOrderTracking = async () => {
    if (!state) return;
    const enabled = !state.settings.whatsappOrderTrackingEnabled;
    setIsWorking("whatsapp-order-tracking");
    try {
      await adminApi.updateWhatsAppOrderTracking(enabled);
      toast.success(
        enabled
          ? "Incoming WhatsApp order intake enabled"
          : "Incoming WhatsApp order intake paused",
      );
      await loadState();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          "Failed to update WhatsApp order intake",
      );
    } finally {
      setIsWorking(null);
    }
  };

  const toggleWhatsAppReposting = async () => {
    if (!state) return;
    const enabled = !state.settings.whatsappRepostingEnabled;
    setIsWorking("whatsapp-reposting");
    try {
      const response = await adminApi.updateWhatsAppReposting(enabled);
      toast.success(response.data?.message || "Reposting setting updated");
      await loadState();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to update WhatsApp reposting",
      );
    } finally {
      setIsWorking(null);
    }
  };

  const toggleMaintenanceMode = async () => {
    if (!operations) return;
    const enabled = !operations.maintenanceMode;
    if (
      !enabled &&
      !confirm("Leave maintenance mode? Reposting will remain paused.")
    )
      return;
    setIsWorking("maintenance");
    try {
      const response = await adminApi.updateMaintenanceMode(enabled);
      toast.success(response.data?.message || "Maintenance mode updated");
      await loadState();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to update maintenance mode",
      );
    } finally {
      setIsWorking(null);
    }
  };

  const safeShutdown = async () => {
    if (
      !confirm(
        "Safely stop the frontend, API, monitor, and WhatsApp bridges now? Reposting will remain paused after the next start.",
      )
    )
      return;
    if (
      !confirm(
        "Final confirmation: the web UI will become unavailable until the local start command is run.",
      )
    )
      return;
    setIsWorking("shutdown");
    try {
      const response = await adminApi.safeShutdown(true);
      toast.success(response.data?.message || "Safe shutdown started", {
        duration: 10000,
      });
      setIsWorking(null);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to start safe shutdown",
      );
      setIsWorking(null);
    }
  };

  const copyStartCommand = async () => {
    const command =
      operations?.startCommand ||
      ".\\ops\\start-hybrid-local.ps1 -StartBridges";
    await navigator.clipboard.writeText(command);
    toast.success("Start command copied");
  };

  const togglePhase2 = async () => {
    if (!state) return;
    const enabled = !state.settings.phase2Enabled;
    setIsWorking("phase-2");
    try {
      const response = await adminApi.updatePhase2(enabled);
      toast.success(response.data?.message || "Phase setting updated");
      await Promise.all([loadState(), refreshFeatureFlags()]);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update Phase 2");
    } finally {
      setIsWorking(null);
    }
  };

  const resetOrders = async () => {
    if (!confirm("Reset all orders and WhatsApp order requests?")) return;
    setIsWorking("orders");
    try {
      const response = await adminApi.resetOrders();
      toast.success(response.data?.message || "Orders reset");
      await loadState();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to reset orders");
    } finally {
      setIsWorking(null);
    }
  };

  const resetListings = async () => {
    if (
      !confirm(
        "Reset runner listings? This also clears dependent orders, order requests, cart items, and repost logs.",
      )
    ) {
      return;
    }
    setIsWorking("listings");
    try {
      const response = await adminApi.resetListings();
      toast.success(response.data?.message || "Listings reset");
      await loadState();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to reset listings");
    } finally {
      setIsWorking(null);
    }
  };

  const resetShopsAndWhatsAppGroups = async () => {
    if (
      !confirm(
        "Reset all shops and WhatsApp groups? This removes shop-owned products, listings, imports, mappings, runner joins, capture checkpoints, and discovered WhatsApp groups.",
      )
    ) {
      return;
    }

    setIsWorking("shops-groups");
    try {
      const response = await adminApi.resetShopsAndWhatsAppGroups();
      toast.success(response.data?.message || "Shops and groups reset");
      await loadState();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to reset shops and groups",
      );
    } finally {
      setIsWorking(null);
    }
  };

  const deleteProductsByCaptureAge = async () => {
    const age = Math.max(1, Number(productCleanupAge || 1));
    const label = `${age} ${productCleanupUnit === "hours" ? "hour" : "day"}${
      age === 1 ? "" : "s"
    }`;
    if (
      !confirm(
        `Delete products whose latest source WhatsApp post is older than ${label}? Products with order history are protected.`,
      )
    ) {
      return;
    }

    setIsWorking("products-age");
    try {
      const response =
        productCleanupUnit === "hours"
          ? await adminApi.deleteProductsOlderThanCaptureHours(age)
          : await adminApi.deleteProductsOlderThanCapture(age);
      toast.success(response.data?.message || "Old products deleted");
      await loadState();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to delete products");
    } finally {
      setIsWorking(null);
    }
  };

  const deleteShopsNotConnectedToAnyBridge = async () => {
    if (
      !confirm(
        "Delete shops not connected to any available WhatsApp bridge group? Shops with order history are protected. Products, listings, imports, mappings, and join requests owned by deleted shops will also be removed.",
      )
    ) {
      return;
    }

    setIsWorking("shops-bridge");
    try {
      const response = await adminApi.deleteShopsNotConnectedToAnyBridge();
      toast.success(response.data?.message || "Shops deleted");
      await loadState();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to delete shops");
    } finally {
      setIsWorking(null);
    }
  };

  const deleteOrphanedWhatsAppGroups = async () => {
    if (
      !confirm(
        "Delete discovered WhatsApp groups that are not connected to any bridge and are not imported or mapped to a shop?",
      )
    ) {
      return;
    }

    setIsWorking("orphaned-groups");
    try {
      const response = await adminApi.deleteOrphanedWhatsAppGroups();
      toast.success(
        response.data?.message || "Orphaned WhatsApp groups deleted",
      );
      await loadState();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          "Failed to delete orphaned WhatsApp groups",
      );
    } finally {
      setIsWorking(null);
    }
  };

  if (!isReady || isLoading) {
    return (
      <div className="py-16 text-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1
            className="flex items-center gap-2 text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            <ShieldCheck className="h-8 w-8" />
            Development Controls
          </h1>
          <p
            className="mt-2 max-w-3xl text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Admin-only reset and flexibility controls for testing CRUD flows
            while runner and shop-owner actions remain scoped by RBAC.
          </p>
        </div>
        <button
          onClick={() => void loadState()}
          className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-50"
          style={{
            borderColor: "var(--card-border)",
            color: "var(--text-primary)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section
          className="rounded-lg border p-5 shadow-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="flex items-center gap-2 text-lg font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            <ShieldCheck className="h-5 w-5" />
            Service Phases
          </h2>
          <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
            <strong>Phase 1: Reposting</strong>
            <div>
              Always enabled: capture, marketplace, listings, and WhatsApp
              reposting.
            </div>
          </div>
          <button
            onClick={togglePhase2}
            disabled={Boolean(isWorking)}
            className="mt-3 flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
            style={{
              borderColor: "var(--card-border)",
              color: state?.settings.phase2Enabled ? "#14532d" : "#991b1b",
              backgroundColor: state?.settings.phase2Enabled
                ? "#dcfce7"
                : "#fee2e2",
            }}
          >
            <span>Phase 2: Orders, carts, shopping and delivery workflow</span>
            <span>
              {isWorking === "phase-2"
                ? "Saving..."
                : state?.settings.phase2Enabled
                  ? "Enabled"
                  : "Disabled"}
            </span>
          </button>
        </section>

        <section
          className="rounded-lg border p-5 shadow-sm xl:col-span-2"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2
                className="flex items-center gap-2 text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                <Power className="h-5 w-5" /> System Operations
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Pause safely before updates, block watchdog restarts, or shut
                down the local service in the correct order.
              </p>
            </div>
            <span
              className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${operations?.maintenanceMode ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}
            >
              {operations?.maintenanceMode ? "MAINTENANCE" : "NORMAL"}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <button
              onClick={toggleWhatsAppReposting}
              disabled={
                Boolean(isWorking) || Boolean(operations?.maintenanceMode)
              }
              className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-left text-sm font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state?.settings.whatsappRepostingEnabled
                ? "Pause reposting now"
                : "Resume reposting explicitly"}
              <span className="mt-1 block text-xs font-normal">
                Applies to queued and automatic reposts within seconds.
              </span>
            </button>
            <button
              onClick={toggleMaintenanceMode}
              disabled={Boolean(isWorking)}
              className="rounded-lg border border-blue-400 bg-blue-50 px-4 py-3 text-left text-sm font-bold text-blue-950 disabled:opacity-50"
            >
              {isWorking === "maintenance"
                ? "Updating..."
                : operations?.maintenanceMode
                  ? "Leave maintenance"
                  : "Prepare for code update"}
              <span className="mt-1 block text-xs font-normal">
                Pauses reposting and controls bridge watchdog restarts.
              </span>
            </button>
            <button
              onClick={safeShutdown}
              disabled={Boolean(isWorking)}
              className="rounded-lg border border-red-500 bg-red-50 px-4 py-3 text-left text-sm font-bold text-red-950 disabled:opacity-50"
            >
              {isWorking === "shutdown" ? "Shutting down..." : "Safe shutdown"}
              <span className="mt-1 block text-xs font-normal">
                Stops app services and both bridge workers after pausing.
              </span>
            </button>
          </div>

          <div
            className="mt-4 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            style={{
              borderColor: "var(--card-border)",
              backgroundColor: "var(--bg-primary)",
            }}
          >
            <div className="min-w-0">
              <div
                className="flex items-center gap-2 text-sm font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                <CirclePlay className="h-4 w-4" /> Start after shutdown
              </div>
              <code
                className="mt-1 block break-all text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {operations?.startCommand ||
                  ".\\ops\\start-hybrid-local.ps1 -StartBridges"}
              </code>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Run locally because the web UI cannot start an API that is
                offline. Reposting stays paused.
              </p>
            </div>
            <button
              onClick={copyStartCommand}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"
              style={{
                borderColor: "var(--card-border)",
                color: "var(--text-primary)",
              }}
            >
              <Copy className="h-4 w-4" /> Copy
            </button>
          </div>
        </section>

        <section
          className="rounded-lg border p-5 shadow-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="flex items-center gap-2 text-lg font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            <MegaphoneOff className="h-5 w-5" />
            WhatsApp Reposting
          </h2>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Emergency/global control for automatic and queued WhatsApp reposts.
            Capture and listing creation remain separate.
          </p>
          <button
            onClick={toggleWhatsAppReposting}
            disabled={Boolean(isWorking)}
            className="mt-5 flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
            style={{
              borderColor: "var(--card-border)",
              color: state?.settings.whatsappRepostingEnabled
                ? "#14532d"
                : "#991b1b",
              backgroundColor: state?.settings.whatsappRepostingEnabled
                ? "#dcfce7"
                : "#fee2e2",
            }}
          >
            <span>Automatic WhatsApp reposting</span>
            <span>
              {isWorking === "whatsapp-reposting"
                ? "Saving..."
                : state?.settings.whatsappRepostingEnabled
                  ? "Enabled"
                  : "Paused"}
            </span>
          </button>
          <p
            className="mt-3 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Reposting does not resume after restart unless this is explicitly
            enabled. Bridge mode, runner, shop, and listing approvals still
            apply.
          </p>
        </section>

        <section
          className="rounded-lg border p-5 shadow-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="mb-4 text-lg font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Reset Test Data
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ActionPanel
              title="Reset Orders"
              body="Clears orders, order items, WhatsApp order requests, payments, returns, reservations, and related order records."
              action="Reset Orders"
              icon={<RotateCcw className="h-4 w-4" />}
              danger
              disabled={Boolean(isWorking)}
              busy={isWorking === "orders"}
              onClick={resetOrders}
            />
            <ActionPanel
              title="Reset Listings"
              body="Clears order data first, then removes runner listings, cart items, and repost logs for a clean reposting test cycle."
              action="Reset Listings"
              icon={<Trash2 className="h-4 w-4" />}
              danger
              disabled={Boolean(isWorking)}
              busy={isWorking === "listings"}
              onClick={resetListings}
            />
            <ActionPanel
              title="Reset Shops + WhatsApp Groups"
              body="Clears all shops, shop-owned products, listings, imports, mappings, runner joins, capture checkpoints, and discovered WhatsApp groups."
              action="Reset Shops + Groups"
              icon={<Trash2 className="h-4 w-4" />}
              danger
              disabled={Boolean(isWorking)}
              busy={isWorking === "shops-groups"}
              onClick={resetShopsAndWhatsAppGroups}
            />
            <div
              className="rounded-lg border p-4"
              style={{
                borderColor: "var(--card-border)",
                backgroundColor: "var(--bg-primary)",
              }}
            >
              <h3
                className="text-base font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Delete Products By Source Age
              </h3>
              <p
                className="mt-2 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Deletes products whose latest WhatsApp source post is older than
                the selected age. Products with order history are kept.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={productCleanupUnit === "hours" ? 8760 : 365}
                  value={productCleanupAge}
                  onChange={(event) =>
                    setProductCleanupAge(Number(event.target.value || 1))
                  }
                  className="w-24 rounded-lg border px-3 py-2 text-sm"
                />
                <select
                  value={productCleanupUnit}
                  onChange={(event) =>
                    setProductCleanupUnit(
                      event.target.value as "hours" | "days",
                    )
                  }
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
                <button
                  onClick={deleteProductsByCaptureAge}
                  disabled={Boolean(isWorking)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-800 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {isWorking === "products-age"
                    ? "Working..."
                    : "Delete Products"}
                </button>
              </div>
            </div>
            <ActionPanel
              title="Delete Orphaned WhatsApp Groups"
              body="Removes discovered group records that are not seen by any bridge and are not imported or mapped to a shop."
              action="Delete Orphaned Groups"
              icon={<Trash2 className="h-4 w-4" />}
              danger
              disabled={Boolean(isWorking)}
              busy={isWorking === "orphaned-groups"}
              onClick={deleteOrphanedWhatsAppGroups}
            />
            <div
              className="rounded-lg border p-4"
              style={{
                borderColor: "var(--card-border)",
                backgroundColor: "var(--bg-primary)",
              }}
            >
              <h3
                className="text-base font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Delete Shops Not Connected To Any Bridge
              </h3>
              <p
                className="mt-2 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Removes shops that are not actively mapped to any group
                currently available through a WhatsApp bridge. Shops with order
                history are kept.
              </p>
              <button
                onClick={deleteShopsNotConnectedToAnyBridge}
                disabled={Boolean(isWorking)}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-800 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {isWorking === "shops-bridge" ? "Working..." : "Delete Shops"}
              </button>
            </div>
          </div>
        </section>

        <section
          className="rounded-lg border p-5 shadow-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Join Request Approval
          </h2>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            When enabled, new runner requests to join shops are approved
            immediately for faster development testing.
          </p>
          <button
            onClick={toggleAutoApproval}
            disabled={Boolean(isWorking)}
            className="mt-5 flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
            style={{
              borderColor: "var(--card-border)",
              color: "var(--text-primary)",
              backgroundColor: state?.settings.runnerShopJoinAutoApprovalEnabled
                ? "#dcfce7"
                : "var(--bg-primary)",
            }}
          >
            <span>Auto approve runner-shop requests</span>
            <span>
              {isWorking === "auto-approval"
                ? "Saving..."
                : state?.settings.runnerShopJoinAutoApprovalEnabled
                  ? "On"
                  : "Off"}
            </span>
          </button>
        </section>

        <section
          className="rounded-lg border p-5 shadow-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="flex items-center gap-2 text-lg font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            <MessageCircleOff className="h-5 w-5" />
            WhatsApp Order Intake
          </h2>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Pause Phase 2 order tracking while keeping Phase 1 capture, listing,
            and reposting active.
          </p>
          <button
            onClick={toggleWhatsAppOrderTracking}
            disabled={Boolean(isWorking) || !state?.settings.phase2Enabled}
            className="mt-5 flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
            style={{
              borderColor: "var(--card-border)",
              color: state?.settings.whatsappOrderTrackingEnabled
                ? "#14532d"
                : "#991b1b",
              backgroundColor: state?.settings.whatsappOrderTrackingEnabled
                ? "#dcfce7"
                : "#fee2e2",
            }}
          >
            <span>Incoming customer WhatsApp order messages</span>
            <span>
              {isWorking === "whatsapp-order-tracking"
                ? "Saving..."
                : state?.settings.whatsappOrderTrackingEnabled
                  ? "Enabled"
                  : "Paused"}
            </span>
          </button>
          <p
            className="mt-3 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            When paused, the system does not create WhatsApp order requests,
            carts, customers, runner notifications, or customer auto-replies.
            {!state?.settings.phase2Enabled &&
              " Enable Phase 2 first to use this control."}
          </p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <section
          className="rounded-lg border p-5 shadow-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="mb-4 text-lg font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Current Test Counts
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(state?.counts || {}).map(([key, value]) => (
              <div
                key={key}
                className="rounded-lg border px-4 py-3"
                style={{
                  borderColor: "var(--card-border)",
                  backgroundColor: "var(--bg-primary)",
                }}
              >
                <div
                  className="text-xs font-semibold uppercase"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatLabel(key)}
                </div>
                <div
                  className="mt-1 text-2xl font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          className="rounded-lg border p-5 shadow-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="mb-4 text-lg font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            RBAC Flexibility
          </h2>
          <div className="space-y-4">
            {Object.entries(state?.rbac || {}).map(([role, actions]) => (
              <div key={role}>
                <div
                  className="mb-1 text-sm font-bold capitalize"
                  style={{ color: "var(--text-primary)" }}
                >
                  {role}
                </div>
                <ul
                  className="list-disc space-y-1 pl-5 text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ActionPanel({
  title,
  body,
  action,
  icon,
  danger,
  disabled,
  busy,
  onClick,
}: {
  title: string;
  body: string;
  action: string;
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--card-border)",
        backgroundColor: "var(--bg-primary)",
      }}
    >
      <h3
        className="text-base font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h3>
      <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        {body}
      </p>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`mt-4 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-60 ${
          danger ? "bg-red-700 hover:bg-red-800" : ""
        }`}
        style={danger ? undefined : { background: "var(--accent)" }}
      >
        {icon}
        {busy ? "Working..." : action}
      </button>
    </div>
  );
}

function formatLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

// frontend/app/runner/dashboard/page.tsx

"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { runnerApi, runnerShopsApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { useRunnerGuard } from "@/hooks/useRoleGuard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Activity,
  Package,
  DollarSign,
  TrendingUp,
  Star,
  Truck,
  Edit2,
  Save,
  X,
  RefreshCw,
  Send,
  Copy,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "sonner";

type DashboardScope = "test" | "live";
type MetricTone = "blue" | "green" | "emerald" | "red" | "amber";

export default function RunnerDashboardPage() {
  const { user, isReady } = useRunnerGuard();
  const [runner, setRunner] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>(null);
  const [automationMetrics, setAutomationMetrics] = useState<any>(null);
  const [listingSummary, setListingSummary] = useState<any>(null);
  const [phase1Status, setPhase1Status] = useState<any>(null);
  const [testAssignments, setTestAssignments] = useState<any[]>([]);
  const [liveAssignments, setLiveAssignments] = useState<any[]>([]);
  const [dashboardScope, setDashboardScope] = useState<DashboardScope>("test");
  const [metricsInterval, setMetricsInterval] = useState<30 | 60>(30);
  const [isRefreshingMetrics, setIsRefreshingMetrics] = useState(false);
  const [metricsUpdatedAt, setMetricsUpdatedAt] = useState<Date | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    phone: "",
    vehicleType: "",
    vehicleNumber: "",
    serviceArea: "",
    whatsappGroup: "",
  });

  useEffect(() => {
    if (!isReady || !user) return;

    loadData();
  }, [isReady, user, metricsInterval, dashboardScope]);

  useEffect(() => {
    if (!isReady || !user) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshRunnerMetrics(false);
      }
    };
    const intervalId = window.setInterval(refreshWhenVisible, 30_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isReady, user, metricsInterval, dashboardScope]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") setClock(Date.now());
    }, 10_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const loadData = async () => {
    try {
      const [
        runnerRes,
        earningsRes,
        metricsRes,
        listingSummaryRes,
        phase1StatusRes,
        testAssignmentsRes,
        liveAssignmentsRes,
      ] = await Promise.all([
        runnerApi.getProfile(),
        runnerApi.getEarnings(),
        runnerApi.getAutomationMetrics({
          intervalMinutes: metricsInterval,
          hours: 24,
          selectionScope: dashboardScope,
        }),
        runnerApi.getListingSummary(),
        runnerApi.getPhase1Status(),
        runnerShopsApi
          .getMyShops({ selectionScope: "test" })
          .catch(() => ({ data: [] })),
        runnerShopsApi
          .getMyShops({ selectionScope: "live" })
          .catch(() => ({ data: [] })),
      ]);
      setRunner(runnerRes.data);
      setEarnings(earningsRes.data);
      setAutomationMetrics(metricsRes.data);
      setListingSummary(listingSummaryRes.data);
      setPhase1Status(phase1StatusRes.data);
      setTestAssignments(testAssignmentsRes.data || []);
      setLiveAssignments(liveAssignmentsRes.data || []);
      setMetricsUpdatedAt(new Date());
      hydrateProfileForm(runnerRes.data);
    } catch (error) {
      console.error("Failed to load runner data:", error);
    }
  };

  const refreshRunnerMetrics = async (showFeedback = false) => {
    if (showFeedback) setIsRefreshingMetrics(true);
    try {
      const [
        metricsResponse,
        listingSummaryResponse,
        phase1StatusResponse,
        testAssignmentsResponse,
        liveAssignmentsResponse,
      ] = await Promise.all([
        runnerApi.getAutomationMetrics({
          intervalMinutes: metricsInterval,
          hours: 24,
          selectionScope: dashboardScope,
        }),
        runnerApi.getListingSummary(),
        runnerApi.getPhase1Status(),
        runnerShopsApi
          .getMyShops({ selectionScope: "test" })
          .catch(() => ({ data: testAssignments })),
        runnerShopsApi
          .getMyShops({ selectionScope: "live" })
          .catch(() => ({ data: liveAssignments })),
      ]);
      setAutomationMetrics(metricsResponse.data);
      setListingSummary(listingSummaryResponse.data);
      setPhase1Status(phase1StatusResponse.data);
      setTestAssignments(testAssignmentsResponse.data || []);
      setLiveAssignments(liveAssignmentsResponse.data || []);
      setMetricsUpdatedAt(new Date());
      if (showFeedback) toast.success("Runner metrics refreshed");
    } catch (error: any) {
      if (showFeedback) {
        toast.error(
          error?.response?.data?.message || "Failed to refresh metrics",
        );
      }
    } finally {
      if (showFeedback) setIsRefreshingMetrics(false);
    }
  };

  const refreshAutomationMetrics = () => refreshRunnerMetrics(true);

  const scopedDashboardMetrics = useMemo(
    () =>
      buildScopedDashboardMetrics({
        scope: dashboardScope,
        assignments:
          dashboardScope === "test" ? testAssignments : liveAssignments,
        listingSummary,
        phase1Status,
      }),
    [
      dashboardScope,
      liveAssignments,
      listingSummary,
      phase1Status,
      testAssignments,
    ],
  );

  const hydrateProfileForm = (runnerData: any) => {
    setProfileForm({
      name: runnerData?.user?.name || user?.name || "",
      phone: runnerData?.phone || runnerData?.user?.phone || user?.phone || "",
      vehicleType: runnerData?.vehicleType || "",
      vehicleNumber: runnerData?.vehicleNumber || "",
      serviceArea: runnerData?.serviceArea || "",
      whatsappGroup: runnerData?.whatsappGroup || "",
    });
  };

  const updateProfileField = (
    field: string,
    value: string | boolean | number,
  ) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const cancelProfileEdit = () => {
    hydrateProfileForm(runner);
    setIsEditingProfile(false);
  };

  const runnerShopLink = useMemo(() => {
    if (!runner?.publicCode || typeof window === "undefined") return "";
    return `${window.location.origin}/r/${encodeURIComponent(runner.publicCode)}`;
  }, [runner?.publicCode]);

  const runnerShareText = useMemo(() => {
    if (!runnerShopLink) return "";
    const runnerName = runner?.user?.name || user?.name || "your runner";
    return [
      `Browse and order through ${runnerName}'s Runner Commerce shop:`,
      runnerShopLink,
      "Message me here if you need help.",
    ].join("\n");
  }, [runner?.user?.name, runnerShopLink, user?.name]);

  const copyRunnerShopLink = async () => {
    if (!runnerShopLink) return;
    await navigator.clipboard.writeText(runnerShopLink);
    toast.success("Runner shop link copied");
  };

  const copyRunnerShareText = async () => {
    if (!runnerShareText) return;
    await navigator.clipboard.writeText(runnerShareText);
    toast.success("WhatsApp share text copied");
  };

  const openRunnerShareWhatsApp = () => {
    if (!runnerShareText) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(runnerShareText)}`, "_blank", "noopener,noreferrer");
  };

  const saveProfile = async () => {
    if (!profileForm.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!profileForm.phone.trim()) {
      toast.error("WhatsApp phone number is required");
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await runnerApi.updateProfile({
        name: profileForm.name,
        phone: profileForm.phone,
        vehicleType: profileForm.vehicleType,
        vehicleNumber: profileForm.vehicleNumber,
        serviceArea: profileForm.serviceArea,
        whatsappGroup: profileForm.whatsappGroup,
      });
      setRunner(response.data);
      hydrateProfileForm(response.data);
      setIsEditingProfile(false);
      toast.success("Profile updated");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (!isReady) {
    return (
      <div className="text-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Runner Dashboard
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Manage your listings and track earnings
          </p>
          <p
            className="mt-2 text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Showing data for:{" "}
            {runner?.user?.name || runner?.phone || "your runner account"}
          </p>
        </div>
        <Link href="/runner/products">
          <Button themed>
            <Package className="w-4 h-4 mr-2" />
            Browse Products
          </Button>
        </Link>
      </div>

      <ScopedSetupDashboard
        scope={dashboardScope}
        setScope={setDashboardScope}
        metrics={scopedDashboardMetrics}
      />

      <section
        className="rounded-xl border p-5"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Share my shop link
            </p>
            <h2 className="mt-1 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              Send customers to your Runner Commerce storefront
            </h2>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--text-secondary)" }}>
              Use this in WhatsApp advertising groups so customers browse and order on the web while still knowing you are their runner.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button themed disabled={!runnerShopLink} onClick={copyRunnerShopLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </Button>
            <Button variant="outline" disabled={!runnerShareText} onClick={copyRunnerShareText}>
              <MessageCircle className="mr-2 h-4 w-4" />
              Copy text
            </Button>
            <Button variant="outline" disabled={!runnerShareText} onClick={openRunnerShareWhatsApp}>
              <ExternalLink className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
          </div>
        </div>
        <div
          className="mt-4 rounded-lg border px-3 py-2 font-mono text-sm"
          style={{
            borderColor: "var(--card-border)",
            color: "var(--text-primary)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          {runnerShopLink || "Runner link will appear after your public code is generated."}
        </div>
        {runner?.publicCode && (
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Runner code: {runner.publicCode}
          </p>
        )}
      </section>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        <StatCard
          icon={<DollarSign className="w-6 h-6" />}
          label="Total Earnings"
          value={formatCurrency(earnings?.totalRevenue)}
          color="green"
        />
        <StatCard
          icon={<Package className="w-6 h-6" />}
          label="Active Listings"
          value={listingSummary?.totalActive || 0}
          color="blue"
        />
        <StatCard
          icon={<TrendingUp className="w-6 h-6" />}
          label="Orders Completed"
          value={earnings?.totalOrders || 0}
          color="purple"
        />
        <StatCard
          icon={<Star className="w-6 h-6" />}
          label="Rating"
          value={(earnings?.rating || 0).toFixed(1)}
          color="yellow"
        />
      </div>

      <section
        className="rounded-xl border p-5"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              className="text-lg font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Listing health
            </h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Your listing totals only, using the same logged-in runner account
              as My Listings.
            </p>
          </div>
          <Link href="/runner/listings">
            <Button size="sm" variant="outline" themed>
              Manage listings
            </Button>
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Paused", listingSummary?.paused || 0],
            ["Pending repost", listingSummary?.pendingReposting || 0],
            ["Reposted today", listingSummary?.recentlyReposted || 0],
            ["Needs attention", listingSummary?.requiringAttention || 0],
            ["Older than 14 days", listingSummary?.oldProducts || 0],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-lg border p-3"
              style={{
                borderColor: "var(--card-border)",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <p
                className="text-2xl font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {value}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {label}
              </p>
            </div>
          ))}
        </div>
        {listingSummary?.byShop?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {listingSummary.byShop.map((shop: any) => (
              <span
                key={shop.shopId}
                className="rounded-full border px-3 py-1 text-xs font-semibold"
                style={{
                  borderColor: "var(--card-border)",
                  color: "var(--text-secondary)",
                }}
              >
                {shop.shopName}: {shop.count}
              </span>
            ))}
          </div>
        )}
      </section>

      <AutomationMetricsPanel
        metrics={automationMetrics}
        scope={dashboardScope}
        interval={metricsInterval}
        setInterval={setMetricsInterval}
        onRefresh={refreshAutomationMetrics}
        isRefreshing={isRefreshingMetrics}
        updatedAgo={formatUpdatedAgo(metricsUpdatedAt, clock)}
      />

      {/* Runner Info */}
      <div
        className="rounded-xl p-6"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--card-border)",
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Your Profile
          </h2>
          {isEditingProfile ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                themed
                onClick={cancelProfileEdit}
                disabled={isSavingProfile}
              >
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                themed
                onClick={saveProfile}
                isLoading={isSavingProfile}
              >
                <Save className="w-4 h-4 mr-1" />
                Save
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              themed
              onClick={() => setIsEditingProfile(true)}
            >
              <Edit2 className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
        </div>

        {isEditingProfile ? (
          <div className="grid md:grid-cols-2 gap-4">
            <ProfileField label="Display Name">
              <Input
                value={profileForm.name}
                onChange={(event) =>
                  updateProfileField("name", event.target.value)
                }
                placeholder="Runner display name"
              />
            </ProfileField>
            <ProfileField label="WhatsApp Phone">
              <Input
                value={profileForm.phone}
                onChange={(event) =>
                  updateProfileField("phone", event.target.value)
                }
                placeholder="+26876123456"
              />
            </ProfileField>
            <ProfileField label="Vehicle Type">
              <Input
                value={profileForm.vehicleType}
                onChange={(event) =>
                  updateProfileField("vehicleType", event.target.value)
                }
                placeholder="Car, bicycle, motorcycle"
              />
            </ProfileField>
            <ProfileField label="Vehicle Number">
              <Input
                value={profileForm.vehicleNumber}
                onChange={(event) =>
                  updateProfileField("vehicleNumber", event.target.value)
                }
                placeholder="Registration number"
              />
            </ProfileField>
            <div className="md:col-span-2">
              <ProfileField label="Service Area">
                <Input
                  value={profileForm.serviceArea}
                  onChange={(event) =>
                    updateProfileField("serviceArea", event.target.value)
                  }
                  placeholder="Areas you serve"
                />
              </ProfileField>
            </div>
            <div className="md:col-span-2">
              <ProfileField label="Default Runner WhatsApp Group(s)">
                <Input
                  value={profileForm.whatsappGroup}
                  onChange={(event) =>
                    updateProfileField("whatsappGroup", event.target.value)
                  }
                  placeholder="Updated from Marketplace destination groups"
                />
              </ProfileField>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <InfoRow label="Status" value={runner?.status} />
            <InfoRow label="Name" value={runner?.user?.name || user?.name} />
            <InfoRow
              label="Vehicle"
              value={`${runner?.vehicleType || "Not specified"} ${
                runner?.vehicleNumber ? `(${runner.vehicleNumber})` : ""
              }`}
            />
            <InfoRow
              label="WhatsApp Phone"
              value={runner?.phone || user?.phone}
            />
            <InfoRow
              label="Service Area"
              value={runner?.serviceArea || "Not specified"}
            />
            <InfoRow
              label="Default Runner WhatsApp Group(s)"
              value={
                <GroupBadges
                  value={
                    runner?.destinationGroupNames?.length
                      ? runner.destinationGroupNames
                      : runner?.whatsappGroup
                  }
                />
              }
            />
            <InfoRow
              label="Automatic reposting"
              value={runner?.autoPostEnabled ? "Enabled" : "Disabled"}
            />
            <InfoRow
              label="Reposting cadence"
              value="Managed in Listings with the 30-minute safety standard"
            />
            <InfoRow
              label="Post limit"
              value="Up to 10 posts per automatic job"
            />
            <InfoRow
              label="Show fee percentage"
              value={
                runner?.repostFeePercentageEnabled !== false ? "Yes" : "No"
              }
            />
            <InfoRow
              label="Caption price format"
              value={
                runner?.repostPriceMode === "ORIGINAL"
                  ? "Original post"
                  : runner?.repostPriceMode === "TOTAL_ONLY"
                    ? "Final runner prices"
                    : runner?.repostPriceMode === "STOCK_EACH_TOTALS"
                      ? "Stock and each runner prices"
                      : "Fee breakdown prices"
              }
            />
            <InfoRow
              label="Where to edit"
              value={
                <a
                  href="/runner/listings"
                  className="font-semibold text-green-700 hover:text-green-800"
                >
                  Open Listings repost controls
                </a>
              }
            />
          </div>
        )}
        <div
          className="mt-4 pt-4 border-t"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div
            className="flex items-center gap-2"
            style={{ color: "var(--text-secondary)" }}
          >
            <Truck className="w-4 h-4" />
            <span className="text-sm">
              Wallet Balance:{" "}
              <strong style={{ color: "var(--accent)" }}>
                {formatCurrency(earnings?.wallet?.balance)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link href="/runner/listings">
          <div
            className="p-6 rounded-xl cursor-pointer transition-all hover:scale-105"
            style={{
              backgroundColor: "var(--card-bg)",
              border: "1px solid var(--card-border)",
            }}
          >
            <Package
              className="w-8 h-8 mb-3"
              style={{ color: "var(--accent)" }}
            />
            <h3
              className="font-semibold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              My Listings
            </h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Manage your product listings
            </p>
          </div>
        </Link>

        <Link href="/runner/earnings">
          <div
            className="p-6 rounded-xl cursor-pointer transition-all hover:scale-105"
            style={{
              backgroundColor: "var(--card-bg)",
              border: "1px solid var(--card-border)",
            }}
          >
            <DollarSign
              className="w-8 h-8 mb-3"
              style={{ color: "var(--accent)" }}
            />
            <h3
              className="font-semibold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              Earnings
            </h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              View detailed earnings report
            </p>
          </div>
        </Link>

        <Link href="/runner/products">
          <div
            className="p-6 rounded-xl cursor-pointer transition-all hover:scale-105"
            style={{
              backgroundColor: "var(--card-bg)",
              border: "1px solid var(--card-border)",
            }}
          >
            <TrendingUp
              className="w-8 h-8 mb-3"
              style={{ color: "var(--accent)" }}
            />
            <h3
              className="font-semibold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              Add Products
            </h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Promote new products
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

function ScopedSetupDashboard({
  scope,
  setScope,
  metrics,
}: {
  scope: DashboardScope;
  setScope: (scope: DashboardScope) => void;
  metrics: Array<{ label: string; value: string | number; tone: MetricTone }>;
}) {
  return (
    <section
      className="rounded-xl border p-5"
      style={{
        backgroundColor: "var(--card-bg)",
        borderColor: "var(--card-border)",
      }}
    >
      <div
        className="mb-4 flex gap-2 overflow-x-auto rounded-lg border p-1"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--card-border)",
        }}
      >
        {(["test", "live"] as const).map((tab) => {
          const active = scope === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setScope(tab)}
              className="inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-bold capitalize transition-colors"
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
              {tab === "test"
                ? "Shop group metrics"
                : "Customer posting metrics"}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((metric) => (
          <MetricPill
            key={metric.label}
            label={metric.label}
            value={metric.value}
            tone={metric.tone}
          />
        ))}
      </div>
    </section>
  );
}

function buildScopedDashboardMetrics({
  scope,
  assignments,
  listingSummary,
  phase1Status,
}: {
  scope: DashboardScope;
  assignments: any[];
  listingSummary: any;
  phase1Status: any;
}): Array<{ label: string; value: string | number; tone: MetricTone }> {
  const selectedAssignments = assignments.filter((assignment) =>
    ["PENDING", "APPROVED"].includes(String(assignment.status)),
  );
  const approvedAssignments = assignments.filter(
    (assignment) => assignment.status === "APPROVED",
  );
  const enabledAssignments = approvedAssignments.filter(
    (assignment) => assignment.autoPostEnabled,
  );
  const shopIds = new Set(
    selectedAssignments
      .map((assignment) => assignment.shop?.id || assignment.shopId)
      .filter(Boolean),
  );
  const activeListings = (listingSummary?.byShop || []).reduce(
    (total: number, shop: any) =>
      shopIds.has(shop.shopId) ? total + Number(shop.count || 0) : total,
    0,
  );
  const groupLimit =
    scope === "test"
      ? phase1Status?.groupLimit?.test
      : phase1Status?.groupLimit?.live;
  const shopLimit =
    scope === "test" ? phase1Status?.shopLimit : phase1Status?.liveShopLimit;
  const scopeLabel = scope === "test" ? "Shop Group" : "Customer Posting";
  const groupCount = Number(groupLimit?.selected || 0);
  const effectiveEnabledCount =
    scope === "live" &&
    (!phase1Status?.repostingControl?.active || groupCount === 0)
      ? 0
      : enabledAssignments.length;

  return [
    {
      label: `${scopeLabel} Shops`,
      value: `${selectedAssignments.length} of ${shopLimit?.max || (scope === "test" ? 5 : 2)}`,
      tone: selectedAssignments.length > 0 ? "green" : "amber",
    },
    {
      label: `Approved ${scopeLabel}`,
      value: approvedAssignments.length,
      tone: approvedAssignments.length > 0 ? "green" : "amber",
    },
    {
      label: `Enabled ${scopeLabel}`,
      value: `${effectiveEnabledCount} of ${approvedAssignments.length}`,
      tone: effectiveEnabledCount > 0 ? "green" : "amber",
    },
    {
      label: `${scopeLabel} Groups`,
      value: `${groupLimit?.selected || 0} of ${groupLimit?.max || (scope === "test" ? 1 : 2)}`,
      tone: groupCount > 0 ? "green" : "amber",
    },
    {
      label: "Active Listings",
      value: activeListings,
      tone: activeListings > 0 ? "blue" : "amber",
    },
  ];
}

function AutomationMetricsPanel({
  metrics,
  scope,
  interval,
  setInterval,
  onRefresh,
  isRefreshing,
  updatedAgo,
}: {
  metrics: any;
  scope: DashboardScope;
  interval: 30 | 60;
  setInterval: (value: 30 | 60) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  updatedAgo: string;
}) {
  const buckets = [...(metrics?.buckets || [])].slice(-12).reverse();
  const checkpoints = metrics?.checkpoints || [];
  const summary = metrics?.summary || {};
  const postingTrends = metrics?.postingTrends || {};
  const postingPeriods = postingTrends?.periods || [];
  const lastHour = metrics?.lastCompletedHour || {};
  const shopGroupMetrics = metrics?.shopGroupMetrics || {};
  const captureByGroup = lastHour.captureByGroup || [];
  const repostByGroup = lastHour.repostByGroup || [];
  const scopeLabel = scope === "test" ? "Shop Group" : "Customer Posting";
  const [view, setView] = useState<"timeline" | "groups" | "checkpoints">(
    "timeline",
  );
  const checkpointTotals = checkpoints.reduce((acc: any, checkpoint: any) => {
    const status = String(checkpoint.lastScanStatus || "NEVER_RUN");
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return (
    <section
      className="rounded-xl p-6"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--card-border)",
      }}
    >
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2
            className="flex items-center gap-2 text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            <Activity className="h-5 w-5" />
            {scopeLabel} Capture & Repost Monitor
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            {scopeLabel} runner activity for the last 24 hours, grouped by{" "}
            {metrics?.intervalMinutes || interval} minute intervals. Times are
            shown in your local timezone.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Updated {updatedAgo} · Generated:{" "}
            {formatDateTime(metrics?.generatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={interval}
            onChange={(event) =>
              setInterval(Number(event.target.value) === 60 ? 60 : 30)
            }
            className="rounded-lg border px-3 py-2 text-sm font-semibold"
            style={{
              borderColor: "var(--card-border)",
              color: "var(--text-primary)",
              backgroundColor: "var(--bg-primary)",
            }}
          >
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Hourly</option>
          </select>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50"
            style={{
              borderColor: "var(--card-border)",
              color: "var(--text-primary)",
            }}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-6">
        <MetricPill
          label="Captured"
          value={summary.captured || 0}
          tone="blue"
        />
        <MetricPill
          label="Listed"
          value={summary.listingsCreated || 0}
          tone="green"
        />
        <MetricPill
          label="Reposted"
          value={summary.reposted || 0}
          tone="emerald"
        />
        <MetricPill
          label="Your Still Failed"
          value={summary.repostStillFailed || 0}
          tone="red"
        />
        <MetricPill
          label="Your Recovered"
          value={summary.repostRecovered || 0}
          tone="emerald"
        />
        <MetricPill
          label="Your Posting Backlog"
          value={summary.pendingAutoPostListings || 0}
          tone="amber"
        />
      </div>

      <div
        className="mb-5 rounded-xl border p-4"
        style={{
          borderColor: "var(--card-border)",
          backgroundColor: "var(--bg-primary)",
        }}
      >
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3
              className="text-base font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Posting volume and averages
            </h3>
            <p
              className="mt-1 max-w-3xl text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              {postingTrends?.definition ||
                "Successful listing-to-destination posts only. Failed attempts and retries are excluded."}
            </p>
          </div>
          <div
            className="rounded-lg border px-3 py-2 text-xs font-semibold"
            style={{
              borderColor: "var(--card-border)",
              color: "var(--text-primary)",
            }}
          >
            Current setting: every{" "}
            {postingTrends?.currentSettings?.intervalMinutes || 30} minutes · up
            to {postingTrends?.currentSettings?.maxPostsPerRun || 10} posts/run
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {postingPeriods.map((period: any) => (
            <div
              key={period.key}
              className="rounded-lg border p-4"
              style={{
                borderColor: "var(--card-border)",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <p
                className="text-xs font-semibold uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                {period.label}
              </p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <div>
                  <p
                    className="text-3xl font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {period.total || 0}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    successful posts
                  </p>
                </div>
                <p
                  className="text-right text-sm font-bold"
                  style={{ color: "var(--accent)" }}
                >
                  {period.averagePerDay || 0}/day
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <dt style={{ color: "var(--text-muted)" }}>Active days</dt>
                <dd
                  className="text-right font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {period.activeDays || 0}
                </dd>
                <dt style={{ color: "var(--text-muted)" }}>
                  Avg. per active day
                </dt>
                <dd
                  className="text-right font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {period.averagePerActiveDay || 0}
                </dd>
                <dt style={{ color: "var(--text-muted)" }}>
                  Avg. per posting slot
                </dt>
                <dd
                  className="text-right font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {period.averagePerPostingSlot || 0}
                </dd>
                <dt style={{ color: "var(--text-muted)" }}>
                  Limit used per slot
                </dt>
                <dd
                  className="text-right font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {period.averageSlotUtilizationPercent || 0}%
                </dd>
                <dt style={{ color: "var(--text-muted)" }}>
                  Destination groups
                </dt>
                <dd
                  className="text-right font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {period.destinationGroups || 0}
                </dd>
              </dl>
            </div>
          ))}
          {postingPeriods.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Posting history is loading.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <InfoStrip
          icon={<Package className="h-4 w-4" />}
          label="Latest captured post"
          value={formatDateTime(summary.latestCaptureAt)}
        />
        <InfoStrip
          icon={<Send className="h-4 w-4" />}
          label="Latest repost attempt"
          value={formatDateTime(summary.latestRepostAt)}
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ["timeline", "Interval Timeline"],
          ["groups", "By Shop / WhatsApp Group"],
          ["checkpoints", "Checkpoints"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() =>
              setView(key as "timeline" | "groups" | "checkpoints")
            }
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
              view === key ? "shadow-sm" : ""
            }`}
            style={{
              borderColor:
                view === key ? "var(--accent)" : "var(--card-border)",
              backgroundColor:
                view === key ? "var(--card-bg)" : "var(--bg-primary)",
              color:
                view === key ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "groups" && (
        <div className="space-y-5">
          <div
            className="rounded-lg border p-4"
            style={{
              borderColor: "var(--card-border)",
              backgroundColor: "var(--bg-primary)",
            }}
          >
            <div className="mb-3">
              <h3
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: "var(--text-secondary)" }}
              >
                Shop totals for selected range
              </h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {formatDateTime(shopGroupMetrics.from)} to{" "}
                {formatDateTime(shopGroupMetrics.to)}
              </p>
            </div>
            <ShopMetricTable rows={shopGroupMetrics.shopTotals || []} />
          </div>

          <div
            className="rounded-lg border p-4"
            style={{
              borderColor: "var(--card-border)",
              backgroundColor: "var(--bg-primary)",
            }}
          >
            <div className="mb-3">
              <h3
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: "var(--text-secondary)" }}
              >
                WhatsApp group breakdown for selected range
              </h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Source groups show captured shop posts. Destination groups show
                repost activity.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <GroupMetricTable
                title="Captured from shop groups"
                emptyText="No captured posts in this range."
                groupHeader="Source shop / captured group"
                rows={shopGroupMetrics.captureBySourceGroup || []}
                columns={[
                  ["captured", "Captured"],
                  ["imported", "Imported"],
                  ["pending", "Pending"],
                  ["failed", "Failed"],
                ]}
              />
              <GroupMetricTable
                title="Reposted to runner groups"
                emptyText="No repost attempts in this range."
                groupHeader="Source shop / destination group"
                rows={shopGroupMetrics.repostByDestinationGroup || []}
                columns={[
                  ["posted", "Posted"],
                  ["retryAttempts", "Retries tried"],
                  ["recovered", "Recovered"],
                  ["stillFailed", "Still failed"],
                  ["waitingRetry", "Retry queue"],
                ]}
              />
            </div>

            <div className="mt-4">
              <RepostingGroupMetricTable
                rows={shopGroupMetrics.repostByRepostingGroup || []}
              />
            </div>
          </div>
        </div>
      )}

      {view === "timeline" && (
        <div className="space-y-5">
          <div
            className="rounded-lg border p-4"
            style={{
              borderColor: "var(--card-border)",
              backgroundColor: "var(--bg-primary)",
            }}
          >
            <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h3
                  className="text-sm font-bold uppercase tracking-wide"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Last completed hour by WhatsApp group/shop
                </h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatDateTime(lastHour.from)} to{" "}
                  {formatDateTime(lastHour.to)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <GroupMetricTable
                title="Captured from shop groups"
                emptyText="No captured posts in the last completed hour."
                groupHeader="Source shop / captured group"
                rows={captureByGroup}
                columns={[
                  ["captured", "Captured"],
                  ["imported", "Imported"],
                  ["pending", "Pending"],
                  ["failed", "Failed"],
                ]}
              />
              <GroupMetricTable
                title="Reposted to runner groups"
                emptyText="No repost attempts in the last completed hour."
                groupHeader="Source shop / destination group"
                rows={repostByGroup}
                columns={[
                  ["posted", "Posted"],
                  ["retryAttempts", "Retries tried"],
                  ["recovered", "Recovered"],
                  ["stillFailed", "Still failed"],
                  ["waitingRetry", "Retry queue"],
                ]}
              />
            </div>
          </div>

          <div
            className="overflow-x-auto rounded-lg border"
            style={{ borderColor: "var(--card-border)" }}
          >
            <table className="w-full min-w-[820px] text-sm">
              <thead style={{ backgroundColor: "var(--bg-primary)" }}>
                <tr style={{ color: "var(--text-secondary)" }}>
                  <th className="px-3 py-3 text-left font-semibold">
                    Interval
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Captured
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Imported
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Pending
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">Listed</th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Auto OK
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Reposted
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Recovered
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Still failed
                  </th>
                </tr>
              </thead>
              <tbody>
                {buckets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-6 text-center"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      No automation activity in this range yet.
                    </td>
                  </tr>
                ) : (
                  buckets.map((bucket: any) => (
                    <tr
                      key={bucket.startAt}
                      className="border-t"
                      style={{ borderColor: "var(--card-border)" }}
                    >
                      <td
                        className="px-3 py-3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <div className="font-semibold">
                          {formatTime(bucket.startAt)} -{" "}
                          {formatTime(bucket.endAt)}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {formatDate(bucket.startAt)}
                        </div>
                      </td>
                      <NumberCell value={bucket.captured} />
                      <NumberCell value={bucket.captureImported} />
                      <NumberCell value={bucket.capturePending} />
                      <NumberCell value={bucket.listingsCreated} />
                      <NumberCell value={bucket.listingsAutoApproved} />
                      <NumberCell value={bucket.reposted} />
                      <NumberCell value={bucket.repostRecovered} />
                      <NumberCell
                        value={
                          (bucket.captureFailed || 0) +
                          (bucket.repostStillFailed || 0)
                        }
                      />
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "checkpoints" && checkpoints.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <div>
              <h3
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: "var(--text-secondary)" }}
              >
                Latest capture checkpoints
              </h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Showing {checkpoints.length} approved shop group checkpoint
                {checkpoints.length === 1 ? "" : "s"}. Last-run counters may be
                zero when no new posts were found.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {["COMPLETED", "SCANNING", "PARTIAL", "FAILED", "NEVER_RUN"]
                .filter((status) => checkpointTotals[status])
                .map((status) => (
                  <span
                    key={status}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${checkpointStatusClass(status)}`}
                  >
                    {status.replace("_", " ")} {checkpointTotals[status]}
                  </span>
                ))}
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {checkpoints.map((checkpoint: any) => (
              <div
                key={`${checkpoint.shopId}:${checkpoint.groupId}`}
                className="rounded-lg border p-3"
                style={{
                  borderColor: "var(--card-border)",
                  backgroundColor: "var(--bg-primary)",
                }}
              >
                <div
                  className="font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {checkpoint.shopName}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${checkpointStatusClass(
                      checkpoint.lastScanStatus,
                    )}`}
                  >
                    {String(checkpoint.lastScanStatus || "NEVER_RUN").replace(
                      "_",
                      " ",
                    )}
                  </span>
                  {checkpoint.productsFailed > 0 && (
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                      Needs attention
                    </span>
                  )}
                </div>
                <div
                  className="mt-1 text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {checkpoint.sourceGroupName ||
                    checkpoint.sourceGroup ||
                    checkpoint.groupId}
                </div>
                {checkpoint.groupId &&
                  checkpoint.groupId !== checkpoint.sourceGroupName && (
                    <div
                      className="mt-1 break-all text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {checkpoint.groupId}
                    </div>
                  )}
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <CheckpointFact
                    label="Last safe captured"
                    value={formatDateTime(checkpoint.lastFullyCapturedAt)}
                  />
                  <CheckpointFact
                    label="Latest item imported"
                    value={formatDateTime(checkpoint.latestImportAt)}
                  />
                  <CheckpointFact
                    label="Scan started"
                    value={formatDateTime(checkpoint.lastScanStartedAt)}
                  />
                  <CheckpointFact
                    label="Scan completed"
                    value={formatDateTime(checkpoint.lastScanCompletedAt)}
                  />
                  <CheckpointFact
                    label="Last run counters"
                    value={`${checkpoint.messagesScanned || 0} scanned · ${
                      checkpoint.productsCaptured || 0
                    } captured · ${checkpoint.productsSkipped || 0} skipped · ${
                      checkpoint.productsFailed || 0
                    } failed`}
                    wide
                  />
                  <CheckpointFact
                    label="Safe message id"
                    value={checkpoint.lastFullyCapturedMessageId || "Not set"}
                    wide
                    mono
                  />
                  <CheckpointFact
                    label="Resume behavior"
                    value={
                      checkpoint.lastScanStatus === "COMPLETED"
                        ? "Next run resumes after the safe marker, with overlap for image-caption pairing."
                        : "Checkpoint was not advanced. Next run retries from the previous safe marker."
                    }
                    wide
                  />
                  {checkpoint.lastError && (
                    <CheckpointFact
                      label="Last error"
                      value={checkpoint.lastError}
                      wide
                      danger
                    />
                  )}
                  <CheckpointFact
                    label="All-time imports"
                    value={`${checkpoint.totalImported || 0}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function checkpointStatusClass(status?: string | null) {
  const normalized = String(status || "NEVER_RUN").toUpperCase();
  if (normalized === "COMPLETED") return "bg-green-100 text-green-800";
  if (normalized === "SCANNING") return "bg-blue-100 text-blue-800";
  if (normalized === "PARTIAL") return "bg-amber-100 text-amber-800";
  if (normalized === "FAILED") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

function CheckpointFact({
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
      <p
        className="font-semibold uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className={`mt-0.5 break-words font-medium ${mono ? "font-mono text-[11px]" : ""}`}
        style={{ color: danger ? "#b91c1c" : "var(--text-secondary)" }}
      >
        {value}
      </p>
    </div>
  );
}

function StatCard({ icon, label, value, color }: any) {
  return (
    <div
      className="rounded-xl p-6"
      style={{
        backgroundColor: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div style={{ color: `var(--accent)` }}>{icon}</div>
      </div>
      <p
        className="text-2xl font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: any) {
  return (
    <div>
      <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="font-medium" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function GroupBadges({ value }: { value?: string | string[] | null }) {
  const groups = parseGroupList(value);
  if (groups.length === 0) return <span>Not configured</span>;

  return (
    <span className="flex flex-wrap gap-2">
      {groups.map((group) => (
        <span
          key={group}
          className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800"
        >
          {group}
        </span>
      ))}
    </span>
  );
}

function ShopMetricTable({ rows }: { rows: any[] }) {
  return (
    <div
      className="overflow-x-auto rounded-lg border bg-white/60"
      style={{ borderColor: "var(--card-border)" }}
    >
      <table className="w-full min-w-[1080px] text-sm">
        <thead>
          <tr style={{ color: "var(--text-secondary)" }}>
            <th className="px-3 py-2 text-left font-semibold">Shop</th>
            <th className="px-3 py-2 text-right font-semibold">Captured</th>
            <th className="px-3 py-2 text-right font-semibold">Imported</th>
            <th className="px-3 py-2 text-right font-semibold">Pending</th>
            <th className="px-3 py-2 text-right font-semibold">
              Capture Failed
            </th>
            <th className="px-3 py-2 text-right font-semibold">Listings</th>
            <th className="px-3 py-2 text-right font-semibold">
              Auto Approved
            </th>
            <th className="px-3 py-2 text-right font-semibold">Reposted</th>
            <th className="px-3 py-2 text-right font-semibold">
              Retries Tried
            </th>
            <th className="px-3 py-2 text-right font-semibold">Recovered</th>
            <th className="px-3 py-2 text-right font-semibold">Still Failed</th>
            <th className="px-3 py-2 text-right font-semibold">Retry Queue</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={12}
                className="px-3 py-6 text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                No shop metrics in this range yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.shopId}
                className="border-t"
                style={{ borderColor: "var(--card-border)" }}
              >
                <td className="px-3 py-3">
                  <div
                    className="font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {row.shopName}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <StatusBadge
                      active={row.autoListEnabled}
                      activeLabel="Auto-list"
                      inactiveLabel="Manual list"
                    />
                    <StatusBadge
                      active={row.autoPostEnabled}
                      activeLabel="Auto-post"
                      inactiveLabel="Manual post"
                    />
                  </div>
                </td>
                <NumberCell value={row.captured} />
                <NumberCell value={row.imported} />
                <NumberCell value={row.pending} />
                <NumberCell value={row.captureFailed} />
                <NumberCell value={row.listingsCreated} />
                <NumberCell value={row.listingsAutoApproved} />
                <NumberCell value={row.reposted} />
                <NumberCell value={row.repostRetryAttempts} />
                <NumberCell value={row.repostRecovered} />
                <NumberCell value={row.repostStillFailed} />
                <NumberCell value={row.repostWaitingRetry} />
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
        active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
      }`}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function RepostingGroupMetricTable({ rows }: { rows: any[] }) {
  return (
    <div
      className="overflow-x-auto rounded-lg border bg-white/60"
      style={{ borderColor: "var(--card-border)" }}
    >
      <div
        className="border-b px-3 py-2 text-sm font-bold"
        style={{
          borderColor: "var(--card-border)",
          color: "var(--text-primary)",
        }}
      >
        Repost monitor per reposting group
      </div>
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr style={{ color: "var(--text-secondary)" }}>
            <th className="px-3 py-2 text-left font-semibold">Posting group</th>
            <th className="px-3 py-2 text-left font-semibold">Role</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
            <th className="px-3 py-2 text-right font-semibold">Shops</th>
            <th className="px-3 py-2 text-right font-semibold">Posted</th>
            <th className="px-3 py-2 text-right font-semibold">
              Retries tried
            </th>
            <th className="px-3 py-2 text-right font-semibold">Recovered</th>
            <th className="px-3 py-2 text-right font-semibold">Still failed</th>
            <th className="px-3 py-2 text-right font-semibold">Retry queue</th>
            <th className="px-3 py-2 text-left font-semibold">Latest</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={10}
                className="px-3 py-5 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                No reposting groups are ready yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={`${row.id || row.groupIdOrName}-${row.role}`}
                className="border-t"
                style={{ borderColor: "var(--card-border)" }}
              >
                <td className="px-3 py-3 align-top">
                  <div
                    className="font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {row.groupName}
                  </div>
                  {row.groupId ? (
                    <div
                      className="mt-0.5 break-all text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {row.groupId}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-top font-semibold">
                  {row.role || "Unknown"}
                </td>
                <td className="px-3 py-3 align-top text-xs font-semibold">
                  {row.status || "Unknown"}
                </td>
                <NumberCell value={row.shopsPosted || 0} />
                <NumberCell value={row.posted || 0} />
                <NumberCell value={row.retryAttempts || 0} />
                <NumberCell value={row.recovered || 0} />
                <NumberCell value={row.stillFailed || 0} />
                <NumberCell value={row.waitingRetry || 0} />
                <td className="px-3 py-3 align-top text-xs">
                  {formatDateTime(row.latestRepostAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupMetricTable({
  title,
  emptyText,
  groupHeader,
  rows,
  columns,
}: {
  title: string;
  emptyText: string;
  groupHeader: string;
  rows: any[];
  columns: Array<[string, string]>;
}) {
  return (
    <div
      className="overflow-x-auto rounded-lg border bg-white/60"
      style={{ borderColor: "var(--card-border)" }}
    >
      <div
        className="border-b px-3 py-2 text-sm font-bold"
        style={{
          borderColor: "var(--card-border)",
          color: "var(--text-primary)",
        }}
      >
        {title}
      </div>
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr style={{ color: "var(--text-secondary)" }}>
            <th className="px-3 py-2 text-left font-semibold">{groupHeader}</th>
            {columns.map(([, label]) => (
              <th key={label} className="px-3 py-2 text-right font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + 1}
                className="px-3 py-5 text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={`${row.shopId}:${row.groupName}`}
                className="border-t"
                style={{ borderColor: "var(--card-border)" }}
              >
                <td className="px-3 py-2">
                  <div
                    className="font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {row.shopName}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {row.groupName}
                  </div>
                  {row.groupId && row.groupId !== row.groupName ? (
                    <div
                      className="mt-0.5 break-all text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {row.groupId}
                    </div>
                  ) : null}
                </td>
                {columns.map(([key]) => (
                  <NumberCell key={key} value={row[key] || 0} />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: MetricTone;
}) {
  const colors = {
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    emerald: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-800",
    amber: "bg-amber-100 text-amber-800",
  };

  return (
    <div className={`rounded-lg px-4 py-3 ${colors[tone]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

function InfoStrip({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-4 py-3"
      style={{
        borderColor: "var(--card-border)",
        color: "var(--text-primary)",
      }}
    >
      <span style={{ color: "var(--accent)" }}>{icon}</span>
      <span>
        <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function NumberCell({ value }: { value: number }) {
  return (
    <td
      className="px-3 py-3 text-right font-semibold"
      style={{ color: value ? "var(--text-primary)" : "var(--text-muted)" }}
    >
      {value || 0}
    </td>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function formatUpdatedAgo(updatedAt: Date | null, now: number) {
  if (!updatedAt) return "not yet";
  const seconds = Math.max(0, Math.floor((now - updatedAt.getTime()) / 1000));
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

function formatTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseGroupList(value?: string | string[] | null) {
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
      if (Array.isArray(parsed)) {
        return parsed
          .map((group) => String(group || "").trim())
          .filter(Boolean)
          .slice(0, 2);
      }
    } catch {
      return [clean];
    }
  }

  return clean
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function ProfileField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

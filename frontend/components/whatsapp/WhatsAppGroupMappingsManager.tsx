"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  MessageSquare,
  PauseCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { adminApi, shopsApi, whatsappImportsApi } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Scope = "admin" | "shop-owner";
type MappingStatus = "ACTIVE" | "PAUSED" | "INACTIVE";
type GroupRole = "SOURCE" | "SHOP_REPOST_DESTINATION";
type GroupPurpose = "UNCLASSIFIED" | "SHOP_OWNED" | "RUNNER_ADVERTISING";

interface Shop {
  id: string;
  name: string;
  phone?: string;
  owner?: {
    name?: string;
    phone?: string;
  };
}

interface WhatsAppGroupMapping {
  id: string;
  shopId: string;
  groupId: string;
  sourceGroup: string;
  participants: number | null;
  profileImageUrl?: string | null;
  status: MappingStatus;
  groupRole: GroupRole;
  isPrimarySource: boolean;
  captureEnabled: boolean;
  postingEnabled: boolean;
  captureLimitPerRun: number;
  listingLimitPerRun: number;
  lastCaptureAt?: string | null;
  lastPostAt?: string | null;
  archivedAt?: string | null;
  inviteLink: string | null;
  notes: string | null;
  updatedAt: string;
  shop?: Shop;
}

interface BridgeAccount {
  id: string;
  name: string;
  phone?: string | null;
  status: string;
  health?: string;
  lastSeenAt?: string | null;
}

interface BridgePresence {
  id: string;
  bridgeAccountId: string;
  groupId: string;
  name: string;
  profileImageUrl?: string | null;
  isAvailable: boolean;
  lastSeenAt: string;
  bridgeAccount?: BridgeAccount;
}

interface DiscoveredGroup {
  id: string;
  groupId: string;
  name: string;
  creatorId: string | null;
  creatorPhone: string | null;
  participants: number;
  profileImageUrl?: string | null;
  importedShopId: string | null;
  groupPurpose: GroupPurpose;
  importedRunnerAdvertisingAt?: string | null;
  lastSeenAt: string;
  bridgePresence?: BridgePresence[];
  importedShop?: {
    id: string;
    name: string;
    owner?: {
      name: string;
      phone: string;
    };
  } | null;
  mapping?: {
    id: string;
    shopId: string;
    status: MappingStatus;
    groupRole?: GroupRole;
    isPrimarySource?: boolean;
  } | null;
}

interface DiscoveredChannel {
  id: string;
  channelId: string;
  name: string;
  description: string | null;
  isReadOnly: boolean;
  unreadCount: number;
  subscriberCount?: number | null;
  inviteLink?: string | null;
  lastActivityAt?: string | null;
  lastSeenAt: string;
  archivedAt?: string | null;
  isAvailable?: boolean;
  bridgeAccount?: BridgeAccount | null;
}

interface CustomerGroupConflict {
  id: string;
  customerPhone: string;
  city: string;
  status: string;
  runnerIds: string[];
  groups: Array<{
    groupId: string;
    groupName: string;
    runnerId: string;
    runnerName?: string | null;
  }>;
  lastSeenAt: string;
}

interface GroupMappingForm {
  shopId: string;
  groupId: string;
  sourceGroup: string;
  participants: string;
  status: MappingStatus;
  groupRole: GroupRole;
  isPrimarySource: boolean;
  captureEnabled: boolean;
  postingEnabled: boolean;
  captureLimitPerRun: string;
  listingLimitPerRun: string;
  inviteLink: string;
  notes: string;
}

const EMPTY_FORM: GroupMappingForm = {
  shopId: "",
  groupId: "",
  sourceGroup: "",
  participants: "",
  status: "ACTIVE" as MappingStatus,
  groupRole: "SOURCE",
  isPrimarySource: true,
  captureEnabled: true,
  postingEnabled: false,
  captureLimitPerRun: "100",
  listingLimitPerRun: "20",
  inviteLink: "",
  notes: "",
};

export default function WhatsAppGroupMappingsManager({
  scope,
}: {
  scope: Scope;
}) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [mappings, setMappings] = useState<WhatsAppGroupMapping[]>([]);
  const [discoveredGroups, setDiscoveredGroups] = useState<DiscoveredGroup[]>(
    [],
  );
  const [discoveredChannels, setDiscoveredChannels] = useState<
    DiscoveredChannel[]
  >([]);
  const [bridgeAccounts, setBridgeAccounts] = useState<BridgeAccount[]>([]);
  const [selectedBridgeAccountId, setSelectedBridgeAccountId] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("available");
  const [discoveryShopId, setDiscoveryShopId] = useState("");
  const [selectedShopId, setSelectedShopId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingMappings, setIsRefreshingMappings] = useState(false);
  const [isRefreshingDiscovered, setIsRefreshingDiscovered] = useState(false);
  const [isRefreshingChannels, setIsRefreshingChannels] = useState(false);
  const [mappingsRefreshMessage, setMappingsRefreshMessage] = useState("");
  const [discoveredRefreshMessage, setDiscoveredRefreshMessage] = useState("");
  const [channelsRefreshMessage, setChannelsRefreshMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [importingGroupId, setImportingGroupId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [customerConflicts, setCustomerConflicts] = useState<
    CustomerGroupConflict[]
  >([]);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadMappings();
  }, [selectedShopId, statusFilter]);

  useEffect(() => {
    if (scope !== "admin" || isLoading) return;
    loadDiscoveredGroups();
    loadDiscoveredChannels();
  }, [selectedBridgeAccountId, availabilityFilter]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const shopsResponse =
        scope === "admin"
          ? await shopsApi.getAll({
              limit: 500,
              status: "ACTIVE",
              sortBy: "name",
              order: "asc",
            })
          : await shopsApi.getMyShops();
      const loadedShops = shopsResponse.data?.data || shopsResponse.data || [];
      setShops(loadedShops);

      const firstShopId = loadedShops[0]?.id || "";
      setSelectedShopId((current) => {
        if (current) return current;
        return scope === "admin" ? "" : firstShopId;
      });
      setForm((current) => ({
        ...current,
        shopId: current.shopId || (scope === "admin" ? "" : firstShopId),
      }));
      setDiscoveryShopId((current) => {
        if (current) return current;
        return scope === "admin" ? "" : firstShopId;
      });
      if (scope === "admin") {
        const bridgesResponse = await adminApi.getWhatsAppBridges();
        const loadedBridges = Array.isArray(bridgesResponse.data)
          ? bridgesResponse.data
          : [];
        setBridgeAccounts(loadedBridges);
        await Promise.all([
          loadDiscoveredGroups(),
          loadDiscoveredChannels(),
          loadCustomerConflicts(),
        ]);
      }
    } catch {
      toast.error("Failed to load shops");
    } finally {
      setIsLoading(false);
    }
  };

  const loadCustomerConflicts = async () => {
    if (scope !== "admin") return;
    try {
      const response = await whatsappImportsApi.getCustomerGroupConflicts({
        status: "OPEN",
      });
      setCustomerConflicts(response.data || []);
    } catch {
      toast.error("Failed to load customer group conflicts");
    }
  };

  const resolveCustomerConflict = async (
    conflict: CustomerGroupConflict,
    runnerId: string,
  ) => {
    setResolvingConflictId(conflict.id);
    try {
      await whatsappImportsApi.resolveCustomerGroupConflict(conflict.id, {
        runnerId,
        note: "Resolved from WhatsApp group conflict queue.",
      });
      toast.success("Customer trusted runner saved");
      await loadCustomerConflicts();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to resolve customer conflict",
      );
    } finally {
      setResolvingConflictId(null);
    }
  };

  const loadMappings = async (showFeedback = false) => {
    if (showFeedback) {
      setIsRefreshingMappings(true);
      setMappingsRefreshMessage("");
    }

    try {
      const response = await whatsappImportsApi.getGroupMappings({
        shopId: selectedShopId || undefined,
        status: statusFilter || undefined,
      });
      const loadedMappings = response.data?.data || [];
      const total = Number(response.data?.total ?? loadedMappings.length);
      const active = loadedMappings.filter(
        (mapping: WhatsAppGroupMapping) => mapping.status === "ACTIVE",
      ).length;
      const source = loadedMappings.filter(
        (mapping: WhatsAppGroupMapping) => mapping.groupRole === "SOURCE",
      ).length;
      const destination = loadedMappings.filter(
        (mapping: WhatsAppGroupMapping) =>
          mapping.groupRole === "SHOP_REPOST_DESTINATION",
      ).length;
      const message = `Loaded ${total} shop group mapping${total === 1 ? "" : "s"}: ${active} active, ${source} source, ${destination} shop destination.`;

      setMappings(loadedMappings);
      setMappingsRefreshMessage(message);
      if (showFeedback) toast.success(message);
    } catch {
      toast.error("Failed to load WhatsApp group mappings");
    } finally {
      if (showFeedback) setIsRefreshingMappings(false);
    }
  };

  const loadDiscoveredGroups = async (showFeedback = false) => {
    if (scope !== "admin") return;
    if (showFeedback) {
      setIsRefreshingDiscovered(true);
      setDiscoveredRefreshMessage("");
    }

    try {
      const response = await whatsappImportsApi.getDiscoveredGroups({
        bridgeAccountId: selectedBridgeAccountId || undefined,
        availability: availabilityFilter || undefined,
      });
      const loadedGroups = response.data?.data || [];
      const total = Number(response.data?.total ?? loadedGroups.length);
      const shopGroups = loadedGroups.filter(
        (group: DiscoveredGroup) => group.groupPurpose === "SHOP_OWNED",
      ).length;
      const runnerGroups = loadedGroups.filter(
        (group: DiscoveredGroup) => group.groupPurpose === "RUNNER_ADVERTISING",
      ).length;
      const unclassified = Math.max(0, total - shopGroups - runnerGroups);
      const message = `Loaded ${total} synced WhatsApp group${total === 1 ? "" : "s"}: ${shopGroups} shop-owned, ${runnerGroups} runner advertising, ${unclassified} unclassified.`;

      setDiscoveredGroups(loadedGroups);
      setDiscoveredRefreshMessage(message);
      if (showFeedback) toast.success(message);
      if (scope === "admin") await loadCustomerConflicts();
    } catch {
      toast.error("Failed to load authenticated WhatsApp groups");
    } finally {
      if (showFeedback) setIsRefreshingDiscovered(false);
    }
  };

  const loadDiscoveredChannels = async (showFeedback = false) => {
    if (scope !== "admin") return;
    if (showFeedback) {
      setIsRefreshingChannels(true);
      setChannelsRefreshMessage("");
    }

    try {
      const response = await whatsappImportsApi.getDiscoveredChannels({
        bridgeAccountId: selectedBridgeAccountId || undefined,
        availability: availabilityFilter || undefined,
      });
      const loadedChannels = response.data?.data || [];
      const total = Number(response.data?.total ?? loadedChannels.length);
      const writable = loadedChannels.filter(
        (channel: DiscoveredChannel) => !channel.isReadOnly,
      ).length;
      const message = `Loaded ${total} synced WhatsApp channel${total === 1 ? "" : "s"}: ${writable} writable, ${Math.max(0, total - writable)} read-only.`;

      setDiscoveredChannels(loadedChannels);
      setChannelsRefreshMessage(message);
      if (showFeedback) toast.success(message);
    } catch {
      toast.error("Failed to load authenticated WhatsApp channels");
    } finally {
      if (showFeedback) setIsRefreshingChannels(false);
    }
  };

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) || null,
    [shops, selectedShopId],
  );

  const discoveredGroupById = useMemo(
    () =>
      new Map(
        discoveredGroups.map((group) => [
          group.groupId,
          {
            groupId: group.groupId,
            name: group.name,
            profileImageUrl:
              group.profileImageUrl ||
              group.bridgePresence?.find((presence) => presence.profileImageUrl)
                ?.profileImageUrl ||
              null,
          },
        ]),
      ),
    [discoveredGroups],
  );

  const avatarGroupForMapping = (mapping: WhatsAppGroupMapping) => {
    const discovered = discoveredGroupById.get(mapping.groupId);
    return {
      groupId: mapping.groupId,
      name: discovered?.name || mapping.sourceGroup,
      profileImageUrl: discovered?.profileImageUrl || mapping.profileImageUrl,
    };
  };

  const counts = useMemo(
    () =>
      mappings.reduce<Record<string, number>>((acc, mapping) => {
        acc[mapping.status] = (acc[mapping.status] || 0) + 1;
        return acc;
      }, {}),
    [mappings],
  );

  const shopGroupClusters = useMemo(() => {
    const grouped = new Map<
      string,
      {
        shopId: string;
        shopName: string;
        ownerName: string;
        ownerPhone?: string;
        activeCount: number;
        activeSourceCount: number;
        activePrimarySourceCount: number;
        activeDestinationCount: number;
        totalCount: number;
        participantTotal: number;
        groups: WhatsAppGroupMapping[];
      }
    >();

    for (const mapping of mappings) {
      const shopId = mapping.shop?.id || mapping.shopId || "unknown";
      const current = grouped.get(shopId) || {
        shopId,
        shopName: mapping.shop?.name || "Unknown shop",
        ownerName: mapping.shop?.owner?.name || "Unknown owner",
        ownerPhone: mapping.shop?.owner?.phone,
        activeCount: 0,
        activeSourceCount: 0,
        activePrimarySourceCount: 0,
        activeDestinationCount: 0,
        totalCount: 0,
        participantTotal: 0,
        groups: [],
      };

      current.groups.push(mapping);
      current.totalCount += 1;
      current.participantTotal += Number(mapping.participants || 0);
      if (mapping.status === "ACTIVE") {
        current.activeCount += 1;
        if (mapping.groupRole === "SOURCE") {
          current.activeSourceCount += 1;
          if (mapping.isPrimarySource) current.activePrimarySourceCount += 1;
        } else {
          current.activeDestinationCount += 1;
        }
      }
      grouped.set(shopId, current);
    }

    return [...grouped.values()].sort(
      (a, b) => b.activeCount - a.activeCount || b.totalCount - a.totalCount,
    );
  }, [mappings]);

  const updateForm = <K extends keyof GroupMappingForm>(
    field: K,
    value: GroupMappingForm[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.shopId || !form.groupId.trim() || !form.sourceGroup.trim()) {
      toast.error("Shop, group id, and group name are required");
      return;
    }

    setIsSaving(true);
    try {
      await whatsappImportsApi.createGroupMapping({
        shopId: form.shopId,
        groupId: form.groupId.trim(),
        sourceGroup: form.sourceGroup.trim(),
        participants: form.participants ? Number(form.participants) : undefined,
        status: form.status,
        groupRole: form.groupRole,
        isPrimarySource:
          form.groupRole === "SOURCE" ? form.isPrimarySource : false,
        captureEnabled: form.captureEnabled,
        postingEnabled: form.postingEnabled,
        captureLimitPerRun: Number(form.captureLimitPerRun || 100),
        listingLimitPerRun: Number(form.listingLimitPerRun || 20),
        inviteLink: form.inviteLink.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success("WhatsApp group mapping saved");
      setForm({
        ...EMPTY_FORM,
        shopId: selectedShopId || form.shopId,
      });
      await loadMappings();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          "Failed to save WhatsApp group mapping",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (
    mapping: WhatsAppGroupMapping,
    status: MappingStatus,
  ) => {
    setUpdatingId(mapping.id);
    try {
      await whatsappImportsApi.updateGroupMapping(mapping.id, { status });
      toast.success(`Group marked ${status.toLowerCase()}`);
      await loadMappings();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update group");
    } finally {
      setUpdatingId(null);
    }
  };

  const updateRole = async (
    mapping: WhatsAppGroupMapping,
    data: Partial<{
      groupRole: GroupRole;
      isPrimarySource: boolean;
      inviteLink: string;
      status: MappingStatus;
      captureEnabled: boolean;
      postingEnabled: boolean;
      captureLimitPerRun: number;
      listingLimitPerRun: number;
    }>,
    successMessage: string,
  ) => {
    setUpdatingId(mapping.id);
    try {
      await whatsappImportsApi.updateGroupMapping(mapping.id, data);
      toast.success(successMessage);
      await loadMappings();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update group");
    } finally {
      setUpdatingId(null);
    }
  };

  const updateAutomation = async (
    mapping: WhatsAppGroupMapping,
    data: Partial<{
      captureEnabled: boolean;
      postingEnabled: boolean;
      captureLimitPerRun: number;
      listingLimitPerRun: number;
    }>,
  ) => {
    await updateRole(mapping, data, "Group automation updated");
  };

  const deactivate = async (mapping: WhatsAppGroupMapping) => {
    if (!confirm(`Deactivate "${mapping.sourceGroup}"?`)) return;
    setUpdatingId(mapping.id);
    try {
      await whatsappImportsApi.deactivateGroupMapping(mapping.id);
      toast.success("Group deactivated");
      await loadMappings();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to deactivate group",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const delink = async (mapping: WhatsAppGroupMapping) => {
    if (
      !confirm(
        `Delink "${mapping.sourceGroup}" from "${mapping.shop?.name || "this shop"}"? This removes the shop relationship and returns the discovered group to unclassified.`,
      )
    ) {
      return;
    }

    setUpdatingId(mapping.id);
    try {
      await whatsappImportsApi.unlinkGroupMapping(mapping.id);
      toast.success("Group delinked from shop");
      await Promise.all([loadMappings(), loadDiscoveredGroups()]);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to delink group");
    } finally {
      setUpdatingId(null);
    }
  };

  const importAsShop = async (group: DiscoveredGroup) => {
    setImportingGroupId(`${group.groupId}:import-shop`);
    try {
      const response = await whatsappImportsApi.importDiscoveredGroupAsShop(
        group.groupId,
      );
      const result = response.data;
      const passwordNote = result.temporaryPassword
        ? ` Temporary owner password: ${result.temporaryPassword}`
        : "";
      const relationNote = result.importedAsRelatedDestination
        ? " Linked as a related same-shop destination group. Activate it after shop-owner agreement to repost there."
        : "";
      const duplicateNote = result.reusedGlobalDuplicate
        ? " Reused an existing same-name shop to prevent a duplicate."
        : "";
      toast.success(
        `Imported ${group.name} as a shop group.${relationNote}${duplicateNote}${passwordNote}`,
      );
      await Promise.all([
        loadInitialData(),
        loadMappings(),
        loadDiscoveredGroups(),
      ]);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to import WhatsApp group",
      );
    } finally {
      setImportingGroupId(null);
    }
  };

  const linkDiscoveredGroupToShop = async (
    group: DiscoveredGroup,
    groupRole: GroupRole,
  ) => {
    if (!discoveryShopId) {
      toast.error("Select the shop to link this WhatsApp group into");
      return;
    }

    const targetShop = shops.find((shop) => shop.id === discoveryShopId);
    if (
      targetShop &&
      !areLikelySameShopName(group.name, targetShop.name) &&
      !confirm(
        `"${group.name}" does not look related to "${targetShop.name}". Continue linking it anyway?`,
      )
    ) {
      return;
    }

    const action = groupRole === "SOURCE" ? "source" : "destination";
    setImportingGroupId(`${group.groupId}:link-${action}`);
    try {
      await whatsappImportsApi.linkDiscoveredGroupToShop(group.groupId, {
        shopId: discoveryShopId,
        groupRole,
        isPrimarySource: groupRole === "SOURCE",
      });
      toast.success(
        groupRole === "SOURCE"
          ? `${group.name} linked as the shop source group`
          : `${group.name} linked as a paused shop destination group. Activate after owner agreement.`,
      );
      await Promise.all([loadMappings(), loadDiscoveredGroups()]);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to link WhatsApp group",
      );
    } finally {
      setImportingGroupId(null);
    }
  };

  const importAsRunnerAdvertisingGroup = async (group: DiscoveredGroup) => {
    setImportingGroupId(`${group.groupId}:runner-advertising`);
    try {
      await whatsappImportsApi.importDiscoveredGroupAsRunnerAdvertising(
        group.groupId,
      );
      toast.success(`${group.name} is now a runner advertising group`);
      await loadDiscoveredGroups();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          "Failed to import runner advertising group",
      );
    } finally {
      setImportingGroupId(null);
    }
  };

  const deleteDiscoveredGroup = async (group: DiscoveredGroup) => {
    if (!confirm(`Remove "${group.name}" from synced WhatsApp groups?`)) return;
    setDeletingGroupId(group.groupId);
    try {
      await whatsappImportsApi.deleteDiscoveredGroup(group.groupId);
      toast.success("Discovered group removed");
      await loadDiscoveredGroups();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to remove discovered group",
      );
    } finally {
      setDeletingGroupId(null);
    }
  };

  if (isLoading) {
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
            <MessageSquare className="h-8 w-8" />
            WhatsApp Groups
          </h1>
          <p
            className="mt-2 max-w-3xl text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Persist shop-owned WhatsApp groups separately from runner
            advertising groups. Each shop should have one source/capture group;
            its other same-shop groups can be linked as destinations, paused
            until the shop owner agrees to any shop-group reposting service.
          </p>
        </div>
        <button
          onClick={() => loadMappings(true)}
          disabled={isRefreshingMappings}
          className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-50"
          style={{
            borderColor: "var(--card-border)",
            color: "var(--text-primary)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshingMappings ? "animate-spin" : ""}`}
          />
          {isRefreshingMappings ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {mappingsRefreshMessage && (
        <div
          className="mb-6 rounded-lg border px-4 py-3 text-sm font-semibold"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
            color: "var(--text-primary)",
          }}
        >
          {mappingsRefreshMessage}
        </div>
      )}

      {scope === "admin" && (
        <section
          className="mb-6 rounded-lg border p-4 shadow-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2
                className="text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Customer Group Conflicts
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Same customer number found in more than one runner advertising
                group for the same direction. Resolve by choosing one trusted
                runner for that direction.
              </p>
            </div>
            <button
              type="button"
              onClick={loadCustomerConflicts}
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-gray-50"
              style={{
                borderColor: "var(--card-border)",
                color: "var(--text-primary)",
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh conflicts
            </button>
          </div>

          {customerConflicts.length === 0 ? (
            <p
              className="mt-4 rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--card-border)",
                color: "var(--text-secondary)",
              }}
            >
              No open duplicate customer group conflicts.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {customerConflicts.map((conflict) => {
                const candidates = Array.from(
                  new Map(
                    conflict.groups.map((group) => [
                      group.runnerId,
                      {
                        runnerId: group.runnerId,
                        runnerName: group.runnerName || "Registered runner",
                        groupNames: conflict.groups
                          .filter((item) => item.runnerId === group.runnerId)
                          .map((item) => item.groupName),
                      },
                    ]),
                  ).values(),
                );
                return (
                  <div
                    key={conflict.id}
                    className="rounded-lg border p-3"
                    style={{
                      backgroundColor: "var(--card-bg)",
                      borderColor: "var(--card-border)",
                    }}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p
                          className="font-bold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {conflict.customerPhone} · {conflict.city}
                        </p>
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {conflict.groups.length} group links · seen{" "}
                          {new Date(conflict.lastSeenAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {candidates.map((candidate) => (
                          <button
                            key={candidate.runnerId}
                            type="button"
                            disabled={resolvingConflictId === conflict.id}
                            onClick={() =>
                              resolveCustomerConflict(
                                conflict,
                                candidate.runnerId,
                              )
                            }
                            className="rounded-md border px-3 py-2 text-sm font-bold transition-colors hover:bg-emerald-50 disabled:opacity-50"
                            style={{
                              borderColor: "var(--card-border)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <span className="block">
                              Keep {candidate.runnerName}
                            </span>
                            <span
                              className="block text-xs font-semibold"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {candidate.groupNames.join(", ")}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {conflict.groups.map((group) => (
                        <span
                          key={`${group.groupId}:${group.runnerId}`}
                          className="rounded-md border px-2 py-1 text-xs"
                          style={{
                            borderColor: "var(--card-border)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Runner group: {group.groupName} · Trusted runner:{" "}
                          {group.runnerName || group.runnerId.slice(-6)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {scope === "admin" && (
        <section
          className="mb-6 rounded-lg border p-4 shadow-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2
                className="text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Authenticated WhatsApp Groups
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Groups seen by the currently linked WhatsApp bridge session.
                Importing creates or reuses the group creator as shop owner.
                Similar names under the same creator, such as Nagran 111 G3 and
                Nagran 111 G8, are linked under the same shop where possible.
                Refresh Groups reloads the latest stored bridge sync. To scan
                WhatsApp immediately after joining a new group, run{" "}
                <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs">
                  npm run whatsapp:session:sync-groups
                </code>{" "}
                in the backend, then refresh this list.
              </p>
            </div>
            <button
              onClick={() => loadDiscoveredGroups(true)}
              disabled={isRefreshingDiscovered}
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-gray-50"
              style={{
                borderColor: "var(--card-border)",
                color: "var(--text-primary)",
              }}
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshingDiscovered ? "animate-spin" : ""}`}
              />
              {isRefreshingDiscovered
                ? "Refreshing..."
                : "Reload Stored Groups"}
            </button>
          </div>

          {discoveredRefreshMessage && (
            <div
              className="mb-4 rounded-lg border px-4 py-3 text-sm font-semibold"
              style={{
                backgroundColor: "var(--bg-primary)",
                borderColor: "var(--card-border)",
                color: "var(--text-primary)",
              }}
            >
              {discoveredRefreshMessage}
            </div>
          )}

          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_minmax(220px,1fr)]">
            <label className="block">
              <span
                className="mb-1 block text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Bridge
              </span>
              <select
                value={selectedBridgeAccountId}
                onChange={(event) =>
                  setSelectedBridgeAccountId(event.target.value)
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">All bridges</option>
                {bridgeAccounts.map((bridge) => (
                  <option key={bridge.id} value={bridge.id}>
                    {bridge.name}
                    {bridge.phone ? ` (${bridge.phone})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span
                className="mb-1 block text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Availability
              </span>
              <select
                value={availabilityFilter}
                onChange={(event) => setAvailabilityFilter(event.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="available">Available on bridge</option>
                <option value="unavailable">No longer available</option>
                <option value="">All synced groups</option>
              </select>
            </label>
            <label className="block">
              <span
                className="mb-1 block text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Link into shop
              </span>
              <select
                value={discoveryShopId}
                onChange={(event) => setDiscoveryShopId(event.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Select shop</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead style={{ backgroundColor: "var(--bg-primary)" }}>
                <tr style={{ color: "var(--text-secondary)" }}>
                  <th className="px-4 py-3 text-left font-semibold">Group</th>
                  <th className="px-4 py-3 text-left font-semibold">Bridge</th>
                  <th className="px-4 py-3 text-left font-semibold">Creator</th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Participants
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    System Status
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Last Seen
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {discoveredGroups.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      No authenticated WhatsApp groups have been synced yet.
                    </td>
                  </tr>
                ) : (
                  discoveredGroups.map((group) => {
                    const isShopLinked = Boolean(
                      group.mapping || group.importedShop,
                    );
                    const isRunnerAdvertising =
                      group.groupPurpose === "RUNNER_ADVERTISING";
                    const isWorking =
                      importingGroupId === group.groupId ||
                      Boolean(
                        importingGroupId?.startsWith(`${group.groupId}:`),
                      );
                    return (
                      <tr
                        key={group.groupId}
                        className="border-t"
                        style={{ borderColor: "var(--card-border)" }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <GroupAvatar group={group} />
                            <div className="min-w-0">
                              <div
                                className="font-semibold"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {group.name}
                              </div>
                              <div
                                className="mt-1 break-all font-mono text-xs"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {group.groupId}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {(group.bridgePresence || []).length > 0 ? (
                            <div className="space-y-2">
                              {(group.bridgePresence || []).map((presence) => (
                                <div key={presence.id}>
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                      presence.isAvailable
                                        ? "bg-green-100 text-green-800"
                                        : "bg-gray-100 text-gray-700"
                                    }`}
                                  >
                                    {presence.isAvailable
                                      ? "AVAILABLE"
                                      : "STALE"}
                                  </span>
                                  <div
                                    className="mt-1 text-xs"
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    {presence.bridgeAccount?.name ||
                                      "Unknown bridge"}
                                  </div>
                                  <div
                                    className="text-xs"
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    {new Date(
                                      presence.lastSeenAt,
                                    ).toLocaleString()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span
                              className="text-xs"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              Legacy global record
                            </span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {group.creatorPhone || group.name}
                          {!group.creatorPhone && (
                            <div
                              className="mt-1 text-xs"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              Creator number not exposed
                            </div>
                          )}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {group.participants || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {isRunnerAdvertising ? (
                            <div>
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                                RUNNER AD GROUP
                              </span>
                              <div
                                className="mt-1 text-xs"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                Available for runner repost destinations
                              </div>
                            </div>
                          ) : isShopLinked ? (
                            <div>
                              <StatusBadge
                                status={group.mapping?.status || "ACTIVE"}
                              />
                              <div
                                className="mt-1 text-xs"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {group.importedShop?.name || "Shop group"}
                                {group.mapping?.groupRole ===
                                "SHOP_REPOST_DESTINATION"
                                  ? " destination"
                                  : " source"}
                              </div>
                            </div>
                          ) : (
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
                              READY TO IMPORT
                            </span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {new Date(group.lastSeenAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              onClick={() => importAsShop(group)}
                              disabled={isWorking || isRunnerAdvertising}
                              className="rounded-lg px-3 py-2 text-sm font-bold text-white transition-colors disabled:opacity-50"
                              style={{ background: "var(--accent)" }}
                              title="Create or reuse a shop from this group"
                            >
                              {importingGroupId ===
                              `${group.groupId}:import-shop`
                                ? "Importing..."
                                : isShopLinked
                                  ? "Re-import"
                                  : "Import as Shop"}
                            </button>
                            <button
                              onClick={() =>
                                linkDiscoveredGroupToShop(group, "SOURCE")
                              }
                              disabled={
                                isWorking ||
                                isRunnerAdvertising ||
                                !discoveryShopId
                              }
                              className="rounded-lg border px-3 py-2 text-sm font-bold transition-colors hover:bg-gray-50 disabled:opacity-50"
                              style={{
                                borderColor: "var(--card-border)",
                                color: "var(--text-primary)",
                              }}
                              title="Link this group as the selected shop source"
                            >
                              {importingGroupId ===
                              `${group.groupId}:link-source`
                                ? "Linking..."
                                : "Link Source"}
                            </button>
                            <button
                              onClick={() =>
                                linkDiscoveredGroupToShop(
                                  group,
                                  "SHOP_REPOST_DESTINATION",
                                )
                              }
                              disabled={
                                isWorking ||
                                isRunnerAdvertising ||
                                !discoveryShopId
                              }
                              className="rounded-lg border px-3 py-2 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
                              style={{ borderColor: "var(--card-border)" }}
                              title="Link this as a paused same-shop destination group"
                            >
                              {importingGroupId ===
                              `${group.groupId}:link-destination`
                                ? "Linking..."
                                : "Shop Destination"}
                            </button>
                            <button
                              onClick={() =>
                                importAsRunnerAdvertisingGroup(group)
                              }
                              disabled={
                                isWorking || isShopLinked || isRunnerAdvertising
                              }
                              className="rounded-lg border px-3 py-2 text-sm font-bold text-emerald-800 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                              style={{ borderColor: "var(--card-border)" }}
                              title="Make this group selectable for runner reposting"
                            >
                              {importingGroupId ===
                              `${group.groupId}:runner-advertising`
                                ? "Importing..."
                                : "Runner Advertising"}
                            </button>
                            <button
                              onClick={() => deleteDiscoveredGroup(group)}
                              disabled={deletingGroupId === group.groupId}
                              className="rounded-lg border p-2 text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                              style={{ borderColor: "var(--card-border)" }}
                              title="Remove synced group"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {scope === "admin" && (
        <section
          className="mb-6 rounded-lg border p-4 shadow-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2
                className="text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Authenticated WhatsApp Channels
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Channels/newsletters seen by the linked WhatsApp bridge. This
                first pass is read-only: it confirms channel visibility and
                whether WhatsApp marks the channel as writable before we wire
                channel posting into shop or runner flows. To scan immediately,
                run{" "}
                <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs">
                  npm run whatsapp:session:sync-channels
                </code>{" "}
                in the backend, then reload this list.
              </p>
            </div>
            <button
              onClick={() => loadDiscoveredChannels(true)}
              disabled={isRefreshingChannels}
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-gray-50"
              style={{
                borderColor: "var(--card-border)",
                color: "var(--text-primary)",
              }}
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshingChannels ? "animate-spin" : ""}`}
              />
              {isRefreshingChannels
                ? "Refreshing..."
                : "Reload Stored Channels"}
            </button>
          </div>

          {channelsRefreshMessage && (
            <div
              className="mb-4 rounded-lg border px-4 py-3 text-sm font-semibold"
              style={{
                backgroundColor: "var(--bg-primary)",
                borderColor: "var(--card-border)",
                color: "var(--text-primary)",
              }}
            >
              {channelsRefreshMessage}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead style={{ backgroundColor: "var(--bg-primary)" }}>
                <tr style={{ color: "var(--text-secondary)" }}>
                  <th className="px-4 py-3 text-left font-semibold">Channel</th>
                  <th className="px-4 py-3 text-left font-semibold">Bridge</th>
                  <th className="px-4 py-3 text-left font-semibold">Access</th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Subscribers
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Activity
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Last Seen
                  </th>
                </tr>
              </thead>
              <tbody>
                {discoveredChannels.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      No authenticated WhatsApp channels have been synced yet.
                    </td>
                  </tr>
                ) : (
                  discoveredChannels.map((channel) => (
                    <tr
                      key={`${channel.bridgeAccount?.id || "global"}:${channel.channelId}`}
                      className="border-t"
                      style={{ borderColor: "var(--card-border)" }}
                    >
                      <td className="px-4 py-3">
                        <div
                          className="font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {channel.name}
                        </div>
                        <div
                          className="mt-1 break-all font-mono text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {channel.channelId}
                        </div>
                        {channel.description && (
                          <div
                            className="mt-2 max-w-xl text-xs"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {channel.description}
                          </div>
                        )}
                        {channel.inviteLink && (
                          <a
                            href={channel.inviteLink}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:underline"
                          >
                            Open channel invite
                          </a>
                        )}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {channel.bridgeAccount?.name || "Unknown bridge"}
                        <div
                          className="mt-1 text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {channel.bridgeAccount?.phone || "No bridge phone"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            channel.isReadOnly
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {channel.isReadOnly ? "READ-ONLY" : "WRITABLE"}
                        </span>
                        <div
                          className="mt-2 text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {channel.isAvailable
                            ? "Available now"
                            : "Stale/offline"}
                        </div>
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {channel.subscriberCount ?? "-"}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {channel.lastActivityAt
                          ? new Date(channel.lastActivityAt).toLocaleString()
                          : `${channel.unreadCount || 0} unread`}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {new Date(channel.lastSeenAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section
        className="mb-6 rounded-lg border p-4 shadow-sm"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--card-border)",
        }}
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2
              className="text-lg font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Shop-Owned Group Monitor
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              Shows the exact WhatsApp groups owned by each shop. Keep one
              active source group for product capture; record the shop's other
              groups as same-shop destinations and activate reposting only after
              there is a clear agreement with the shop owner.
            </p>
          </div>
          <div
            className="rounded-lg px-3 py-2 text-sm font-semibold"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
            }}
          >
            {
              shopGroupClusters.filter(
                (cluster) =>
                  cluster.activeSourceCount !== 1 ||
                  cluster.activePrimarySourceCount !== 1,
              ).length
            }{" "}
            shop setup warning
            {shopGroupClusters.filter(
              (cluster) =>
                cluster.activeSourceCount !== 1 ||
                cluster.activePrimarySourceCount !== 1,
            ).length === 1
              ? ""
              : "s"}
          </div>
        </div>

        {shopGroupClusters.length === 0 ? (
          <div
            className="mt-4 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--card-border)",
              color: "var(--text-secondary)",
            }}
          >
            No shop WhatsApp group mappings found.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {shopGroupClusters.map((cluster) => {
              const hasSetupRisk =
                cluster.activeSourceCount !== 1 ||
                cluster.activePrimarySourceCount !== 1;
              return (
                <div
                  key={cluster.shopId}
                  className="rounded-lg border p-4"
                  style={{
                    borderColor: hasSetupRisk
                      ? "#f59e0b"
                      : "var(--card-border)",
                    backgroundColor: hasSetupRisk
                      ? "#fffbeb"
                      : "var(--bg-primary)",
                  }}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3
                        className="font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {cluster.shopName}
                      </h3>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Owner: {cluster.ownerName}
                        {cluster.ownerPhone ? ` · ${cluster.ownerPhone}` : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        hasSetupRisk
                          ? "bg-amber-100 text-amber-900"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {cluster.activeSourceCount} source /{" "}
                      {cluster.activeDestinationCount} destination
                    </span>
                  </div>

                  {hasSetupRisk && (
                    <p className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950">
                      Setup warning: runner reposting should use products from
                      one active primary source group per shop. Mark other
                      same-shop groups as paused destinations so they are
                      tracked but not captured or reposted until the shop owner
                      agrees.
                    </p>
                  )}

                  <div className="mt-3 space-y-2">
                    {cluster.groups.map((group) => (
                      <div
                        key={group.id}
                        className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs"
                        style={{
                          borderColor: "var(--card-border)",
                          backgroundColor: "var(--bg-secondary)",
                        }}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <GroupAvatar group={avatarGroupForMapping(group)} />
                          <div className="min-w-0">
                            <div
                              className="font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {group.sourceGroup}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <RoleBadge
                                role={group.groupRole || "SOURCE"}
                                isPrimarySource={group.isPrimarySource}
                              />
                              <StatusBadge status={group.status} />
                            </div>
                            <div
                              className="mt-1 break-all font-mono"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {group.groupId}
                            </div>
                            {group.inviteLink && (
                              <a
                                href={group.inviteLink}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block truncate font-semibold text-blue-700"
                              >
                                {group.inviteLink}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className="mt-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {group.participants ?? "-"} members
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <form
          onSubmit={submit}
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
            Add Shop-Owned Group
          </h2>

          {shops.length === 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
              Add an active shop before creating a WhatsApp group mapping.
            </div>
          )}

          <div className="space-y-4">
            <Field label="Shop">
              <select
                value={form.shopId}
                onChange={(event) => updateForm("shopId", event.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Select shop</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Group name">
              <input
                value={form.sourceGroup}
                onChange={(event) =>
                  updateForm("sourceGroup", event.target.value)
                }
                placeholder="D-F Daily Fashion G/s 9"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Group id">
              <input
                value={form.groupId}
                onChange={(event) => updateForm("groupId", event.target.value)}
                placeholder="120363429239724324@g.us"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Group role">
              <select
                value={form.groupRole}
                onChange={(event) => {
                  const nextRole = event.target.value as GroupRole;
                  setForm((current) => ({
                    ...current,
                    groupRole: nextRole,
                    isPrimarySource:
                      nextRole === "SOURCE" ? current.isPrimarySource : false,
                    captureEnabled:
                      nextRole === "SOURCE" ? current.captureEnabled : false,
                    postingEnabled:
                      nextRole === "SHOP_REPOST_DESTINATION"
                        ? current.postingEnabled
                        : false,
                    status: nextRole === "SOURCE" ? current.status : "PAUSED",
                  }));
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="SOURCE">Shop source/capture group</option>
                <option value="SHOP_REPOST_DESTINATION">
                  Same-shop destination group
                </option>
              </select>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Runner reposting uses products captured from the shop source
                group only. Same-shop destination groups are used for optional
                shop-owner reposting after agreement.
              </p>
            </Field>

            {form.groupRole === "SOURCE" && (
              <label className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPrimarySource}
                  onChange={(event) =>
                    updateForm("isPrimarySource", event.target.checked)
                  }
                  className="mt-1"
                />
                <span style={{ color: "var(--text-primary)" }}>
                  Primary source group for this shop
                  <span
                    className="block text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Use one primary source per shop for clean capture and
                    reposting.
                  </span>
                </span>
              </label>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.captureEnabled}
                  onChange={(event) =>
                    updateForm("captureEnabled", event.target.checked)
                  }
                  className="mt-1"
                />
                <span style={{ color: "var(--text-primary)" }}>
                  Capture enabled
                  <span
                    className="block text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Source groups only; pause when testing or cleaning backlog.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.postingEnabled}
                  onChange={(event) =>
                    updateForm("postingEnabled", event.target.checked)
                  }
                  className="mt-1"
                />
                <span style={{ color: "var(--text-primary)" }}>
                  Posting enabled
                  <span
                    className="block text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Destination groups only; keep off until agreed.
                  </span>
                </span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Capture limit/run">
                <input
                  value={form.captureLimitPerRun}
                  onChange={(event) =>
                    updateForm("captureLimitPerRun", event.target.value)
                  }
                  type="number"
                  min={1}
                  max={2000}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Listing/post limit/run">
                <input
                  value={form.listingLimitPerRun}
                  onChange={(event) =>
                    updateForm("listingLimitPerRun", event.target.value)
                  }
                  type="number"
                  min={1}
                  max={200}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <Field label="Invite link">
              <input
                value={form.inviteLink}
                onChange={(event) =>
                  updateForm("inviteLink", event.target.value)
                }
                placeholder="https://chat.whatsapp.com/..."
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Participants">
                <input
                  value={form.participants}
                  onChange={(event) =>
                    updateForm("participants", event.target.value)
                  }
                  type="number"
                  min={0}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(event) =>
                    updateForm("status", event.target.value as MappingStatus)
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
                {form.groupRole === "SHOP_REPOST_DESTINATION" && (
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Keep paused until the shop owner agrees, then activate to
                    repost captured source-group products into this group.
                  </p>
                )}
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                rows={3}
                placeholder="Optional capture notes"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={isSaving || shops.length === 0}
            className="mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {isSaving ? "Saving..." : "Save Group Mapping"}
          </button>
        </form>

        <section>
          <div
            className="mb-4 rounded-lg border p-4"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--card-border)",
            }}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2
                  className="text-lg font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {selectedShop ? selectedShop.name : "All Shops"}
                </h2>
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {mappings.length} mapping{mappings.length === 1 ? "" : "s"}{" "}
                  loaded
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedShopId}
                  onChange={(event) => {
                    setSelectedShopId(event.target.value);
                    setForm((current) => ({
                      ...current,
                      shopId: event.target.value || current.shopId,
                    }));
                  }}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  {scope === "admin" && <option value="">All shops</option>}
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active ({counts.ACTIVE || 0})</option>
                  <option value="PAUSED">Paused ({counts.PAUSED || 0})</option>
                  <option value="INACTIVE">
                    Inactive ({counts.INACTIVE || 0})
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div
            className="overflow-hidden rounded-lg border shadow-sm"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--card-border)",
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead style={{ backgroundColor: "var(--bg-primary)" }}>
                  <tr style={{ color: "var(--text-secondary)" }}>
                    <th className="px-4 py-3 text-left font-semibold">Group</th>
                    <th className="px-4 py-3 text-left font-semibold">Shop</th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Relationship
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Role</th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Participants
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Automation
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Updated
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-12 text-center"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        No WhatsApp group mappings found.
                      </td>
                    </tr>
                  ) : (
                    mappings.map((mapping) => (
                      <tr
                        key={mapping.id}
                        className="border-t"
                        style={{ borderColor: "var(--card-border)" }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <GroupAvatar
                              group={avatarGroupForMapping(mapping)}
                            />
                            <div className="min-w-0">
                              <div
                                className="font-semibold"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {mapping.sourceGroup}
                              </div>
                              <div
                                className="mt-1 break-all font-mono text-xs"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {mapping.groupId}
                              </div>
                              {mapping.inviteLink && (
                                <a
                                  href={mapping.inviteLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 block max-w-[320px] truncate text-xs font-semibold text-blue-700"
                                >
                                  {mapping.inviteLink}
                                </a>
                              )}
                              {mapping.notes && (
                                <div
                                  className="mt-1 text-xs"
                                  style={{ color: "var(--text-secondary)" }}
                                >
                                  {mapping.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {mapping.shop?.name || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <RelationshipBadge mapping={mapping} />
                        </td>
                        <td className="px-4 py-3">
                          <RoleBadge
                            role={mapping.groupRole || "SOURCE"}
                            isPrimarySource={mapping.isPrimarySource}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={mapping.status} />
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {mapping.participants ?? "-"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() =>
                                  updateAutomation(mapping, {
                                    captureEnabled: !mapping.captureEnabled,
                                  })
                                }
                                disabled={updatingId === mapping.id}
                                className={`rounded-full px-2 py-1 text-xs font-bold ${
                                  mapping.captureEnabled
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                Capture {mapping.captureEnabled ? "on" : "off"}
                              </button>
                              <button
                                onClick={() =>
                                  updateAutomation(mapping, {
                                    postingEnabled: !mapping.postingEnabled,
                                  })
                                }
                                disabled={updatingId === mapping.id}
                                className={`rounded-full px-2 py-1 text-xs font-bold ${
                                  mapping.postingEnabled
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                Posting {mapping.postingEnabled ? "on" : "off"}
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                min={1}
                                max={2000}
                                defaultValue={mapping.captureLimitPerRun || 100}
                                onBlur={(event) =>
                                  updateAutomation(mapping, {
                                    captureLimitPerRun: Number(
                                      event.target.value || 100,
                                    ),
                                  })
                                }
                                className="w-24 rounded border px-2 py-1 text-xs"
                                title="Capture limit per run"
                              />
                              <input
                                type="number"
                                min={1}
                                max={200}
                                defaultValue={mapping.listingLimitPerRun || 20}
                                onBlur={(event) =>
                                  updateAutomation(mapping, {
                                    listingLimitPerRun: Number(
                                      event.target.value || 20,
                                    ),
                                  })
                                }
                                className="w-24 rounded border px-2 py-1 text-xs"
                                title="Listing/post limit per run"
                              />
                            </div>
                            <div
                              className="space-y-0.5 text-xs"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              <div>
                                Captured:{" "}
                                {mapping.lastCaptureAt
                                  ? new Date(
                                      mapping.lastCaptureAt,
                                    ).toLocaleString()
                                  : "never"}
                              </div>
                              <div>
                                Posted:{" "}
                                {mapping.lastPostAt
                                  ? new Date(
                                      mapping.lastPostAt,
                                    ).toLocaleString()
                                  : "never"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {new Date(mapping.updatedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            {mapping.groupRole !== "SOURCE" && (
                              <button
                                onClick={() =>
                                  updateRole(
                                    mapping,
                                    {
                                      groupRole: "SOURCE",
                                      isPrimarySource: true,
                                    },
                                    "Group marked as shop source",
                                  )
                                }
                                disabled={updatingId === mapping.id}
                                className="rounded-lg border px-2 py-1 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50"
                                title="Use as source"
                              >
                                Source
                              </button>
                            )}
                            {mapping.groupRole === "SOURCE" &&
                              !mapping.isPrimarySource && (
                                <button
                                  onClick={() =>
                                    updateRole(
                                      mapping,
                                      { isPrimarySource: true },
                                      "Group marked as primary source",
                                    )
                                  }
                                  disabled={updatingId === mapping.id}
                                  className="rounded-lg border px-2 py-1 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50"
                                  title="Make primary source"
                                >
                                  Primary
                                </button>
                              )}
                            {mapping.groupRole === "SOURCE" && (
                              <button
                                onClick={() =>
                                  updateRole(
                                    mapping,
                                    {
                                      groupRole: "SHOP_REPOST_DESTINATION",
                                      isPrimarySource: false,
                                      status: "PAUSED",
                                    },
                                    "Group marked as paused same-shop destination",
                                  )
                                }
                                disabled={updatingId === mapping.id}
                                className="rounded-lg border px-2 py-1 text-xs font-bold text-purple-700 transition-colors hover:bg-purple-50 disabled:opacity-50"
                                title="Mark as destination"
                              >
                                Destination
                              </button>
                            )}
                            {mapping.status !== "ACTIVE" && (
                              <button
                                onClick={() => updateStatus(mapping, "ACTIVE")}
                                disabled={updatingId === mapping.id}
                                className="rounded-lg p-2 text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
                                title="Activate"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                            )}
                            {mapping.status === "ACTIVE" && (
                              <button
                                onClick={() => updateStatus(mapping, "PAUSED")}
                                disabled={updatingId === mapping.id}
                                className="rounded-lg p-2 text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
                                title="Pause"
                              >
                                <PauseCircle className="h-4 w-4" />
                              </button>
                            )}
                            {mapping.status !== "INACTIVE" && (
                              <button
                                onClick={() => deactivate(mapping)}
                                disabled={updatingId === mapping.id}
                                className="rounded-lg p-2 text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                                title="Deactivate"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => delink(mapping)}
                              disabled={updatingId === mapping.id}
                              className="rounded-lg border px-2 py-1 text-xs font-bold text-red-800 transition-colors hover:bg-red-50 disabled:opacity-50"
                              style={{ borderColor: "var(--card-border)" }}
                              title="Remove shop relationship"
                            >
                              Delink
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-sm font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function RelationshipBadge({ mapping }: { mapping: WhatsAppGroupMapping }) {
  const shopName = mapping.shop?.name || "";
  const namesLookRelated = areLikelySameShopName(mapping.sourceGroup, shopName);
  const notes = mapping.notes || "";

  let label = "Mapped";
  let styles = "bg-blue-100 text-blue-800";
  let detail = "";

  if (!namesLookRelated && shopName) {
    label = "Name mismatch";
    styles = "bg-red-100 text-red-800";
    detail = "Likely manual link";
  } else if (notes.includes("Linked from authenticated WhatsApp groups")) {
    label = "Manual link";
    styles = "bg-amber-100 text-amber-900";
    detail = "Selected shop";
  } else if (notes.includes("Related same-shop destination")) {
    label = "Related group";
    styles = "bg-purple-100 text-purple-800";
    detail = "Same-shop destination";
  } else if (notes.includes("Imported from authenticated WhatsApp groups")) {
    label = "Imported shop";
    styles = "bg-green-100 text-green-800";
    detail = "Created/reused";
  }

  return (
    <div>
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${styles}`}
      >
        {label}
      </span>
      {detail && (
        <div
          className="mt-1 text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          {detail}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: MappingStatus }) {
  const styles = {
    ACTIVE: "bg-green-100 text-green-800",
    PAUSED: "bg-amber-100 text-amber-900",
    INACTIVE: "bg-gray-100 text-gray-800",
  }[status];

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${styles}`}
    >
      {status}
    </span>
  );
}

function GroupAvatar({
  group,
}: {
  group: {
    groupId: string;
    name: string;
    profileImageUrl?: string | null;
    bridgePresence?: BridgePresence[];
  };
}) {
  const imageUrl =
    group.profileImageUrl ||
    group.bridgePresence?.find((presence) => presence.profileImageUrl)
      ?.profileImageUrl;
  const initial = (group.name || group.groupId || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border text-sm font-bold"
      style={{
        borderColor: "var(--card-border)",
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`${group.name} profile`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        initial || "?"
      )}
    </div>
  );
}

function areLikelySameShopName(left: string, right: string) {
  const leftCanonical = canonicalShopGroupName(left);
  const rightCanonical = canonicalShopGroupName(right);
  if (!leftCanonical || !rightCanonical) return false;
  if (leftCanonical === rightCanonical) return true;

  const [shorter, longer] =
    leftCanonical.length <= rightCanonical.length
      ? [leftCanonical, rightCanonical]
      : [rightCanonical, leftCanonical];

  if (shorter.length < 8) return false;
  return longer.startsWith(`${shorter} `) || longer.startsWith(`${shorter}-`);
}

function canonicalShopGroupName(value: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(?:shop|group)\b/g, " ")
    .replace(/\bg\s*\/\s*s\s*\d+\w*\b/g, " ")
    .replace(/\bg\s*[-#]?\s*\d+\w*\b/g, " ")
    .replace(/\bgrp\s*[-#]?\s*\d+\w*\b/g, " ")
    .replace(/\bgroup\s*[-#]?\s*\d+\w*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function RoleBadge({
  role,
  isPrimarySource,
}: {
  role: GroupRole;
  isPrimarySource?: boolean;
}) {
  if (role === "SOURCE") {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
        {isPrimarySource ? "PRIMARY SOURCE" : "SOURCE"}
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-800">
      DESTINATION
    </span>
  );
}

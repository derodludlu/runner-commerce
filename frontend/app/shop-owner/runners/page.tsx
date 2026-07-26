"use client";

import { useEffect, useMemo, useState } from "react";
import { useShopOwnerGuard } from "@/hooks/useRoleGuard";
import {
  Ban,
  CheckCircle,
  Clock,
  Store,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { shopsApi, runnerShopsApi } from "@/lib/api";
import { toast } from "sonner";
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
  owner: {
    name: string;
    phone: string;
  };
  _count?: {
    products: number;
  };
  relatedWhatsAppGroups?: ShopWhatsAppGroupAvatar[];
}

type RunnerShopStatus = "PENDING" | "APPROVED" | "REJECTED" | "BLOCKED";

interface RunnerShopRequest {
  id: string;
  status: RunnerShopStatus;
  joinedAt: string;
  approvedAt: string | null;
  notes: string | null;
  runner: {
    id: string;
    user: {
      name: string;
      phone: string;
      email: string;
    };
    rating: number | null;
    totalOrders: number;
    _count?: {
      orders: number;
      listings: number;
      shopAssignments: number;
    };
  };
}

const STATUS_OPTIONS: Array<{ label: string; value: RunnerShopStatus | "" }> = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Blocked", value: "BLOCKED" },
];

export default function ShopRunnerManagementPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [relationships, setRelationships] = useState<RunnerShopRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRunners, setIsLoadingRunners] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RunnerShopStatus | "">("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { user, isReady } = useShopOwnerGuard();

  useEffect(() => {
    if (!isReady || !user) return;
    loadShops();
  }, [isReady, user]);

  useEffect(() => {
    if (selectedShop) {
      loadRelationships(selectedShop.id);
    }
  }, [selectedShop]);

  const loadShops = async () => {
    setIsLoading(true);
    try {
      const response = await shopsApi.getMyShops();
      const loadedShops = response.data.data || response.data || [];
      setShops(loadedShops);
      if (loadedShops.length > 0) {
        setSelectedShop((current) => current || loadedShops[0]);
      }
    } catch {
      toast.error("Failed to load shops");
    } finally {
      setIsLoading(false);
    }
  };

  const loadRelationships = async (shopId: string) => {
    setIsLoadingRunners(true);
    try {
      const response = await runnerShopsApi.getShopRequests(shopId);
      setRelationships(response.data || []);
    } catch {
      toast.error("Failed to load runners");
    } finally {
      setIsLoadingRunners(false);
    }
  };

  const updateRelationshipStatus = async (
    runnerId: string,
    status: RunnerShopStatus,
  ) => {
    if (!selectedShop) return;

    setUpdatingId(runnerId);
    try {
      await runnerShopsApi.updateRunnerStatus(
        selectedShop.id,
        runnerId,
        status,
      );
      toast.success(`Runner ${status.toLowerCase()} successfully`);
      await loadRelationships(selectedShop.id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update runner");
    } finally {
      setUpdatingId(null);
    }
  };

  const removeRunner = async (runnerId: string, runnerName: string) => {
    if (!selectedShop) return;
    if (!confirm(`Remove ${runnerName} from ${selectedShop.name}?`)) return;

    setUpdatingId(runnerId);
    try {
      await runnerShopsApi.removeRunner(selectedShop.id, runnerId);
      toast.success("Runner removed from shop");
      await loadRelationships(selectedShop.id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to remove runner");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredRelationships = useMemo(
    () =>
      statusFilter
        ? relationships.filter(
            (relationship) => relationship.status === statusFilter,
          )
        : relationships,
    [relationships, statusFilter],
  );

  const statusCounts = useMemo(
    () =>
      relationships.reduce<Record<string, number>>((counts, relationship) => {
        counts[relationship.status] = (counts[relationship.status] || 0) + 1;
        return counts;
      }, {}),
    [relationships],
  );

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "APPROVED":
        return "bg-green-100 text-green-800";
      case "REJECTED":
        return "bg-red-100 text-red-800";
      case "BLOCKED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  const renderActions = (relationship: RunnerShopRequest) => {
    const runnerId = relationship.runner.id;
    const runnerName = relationship.runner.user.name;
    const isUpdating = updatingId === runnerId;

    return (
      <div className="flex flex-wrap justify-end gap-2">
        {relationship.status !== "APPROVED" && (
          <button
            onClick={() => updateRelationshipStatus(runnerId, "APPROVED")}
            disabled={isUpdating}
            className="rounded-lg bg-green-500 p-2 text-white transition-colors hover:bg-green-600 disabled:opacity-50"
            title="Approve runner"
          >
            <CheckCircle className="h-5 w-5" />
          </button>
        )}
        {relationship.status === "PENDING" && (
          <button
            onClick={() => updateRelationshipStatus(runnerId, "REJECTED")}
            disabled={isUpdating}
            className="rounded-lg bg-red-500 p-2 text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            title="Reject request"
          >
            <XCircle className="h-5 w-5" />
          </button>
        )}
        {relationship.status !== "BLOCKED" && (
          <button
            onClick={() => updateRelationshipStatus(runnerId, "BLOCKED")}
            disabled={isUpdating}
            className="rounded-lg bg-gray-700 p-2 text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
            title="Block runner"
          >
            <Ban className="h-5 w-5" />
          </button>
        )}
        <button
          onClick={() => removeRunner(runnerId, runnerName)}
          disabled={isUpdating}
          className="rounded-lg border border-red-200 p-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          title="Remove from shop"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    );
  };

  if (!isReady) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="py-12 text-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="py-12 text-center">
          <Store className="mx-auto h-16 w-16 animate-pulse text-gray-300" />
          <p className="mt-4 text-gray-500">Loading your shops...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 flex items-center gap-2 text-3xl font-bold">
        <Users className="h-8 w-8" />
        Manage Runners
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-lg bg-white p-4 shadow-md">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
              <Store className="h-5 w-5" />
              Your Shops
            </h2>

            {shops.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                You don't own any shops yet
              </p>
            ) : (
              <div className="space-y-2">
                {shops.map((shop) => (
                  <button
                    key={shop.id}
                    onClick={() => {
                      setSelectedShop(shop);
                      setStatusFilter("");
                    }}
                    className={`w-full rounded-lg p-3 text-left transition-colors ${
                      selectedShop?.id === shop.id
                        ? "bg-primary text-white"
                        : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <ShopWhatsAppAvatars
                        shopName={shop.name}
                        groups={shop.relatedWhatsAppGroups}
                        size="sm"
                        showLabel={false}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold">{shop.name}</div>
                        <div className="truncate text-xs opacity-70">
                          {shop.relatedWhatsAppGroups?.[0]?.name ||
                            "No WhatsApp group linked"}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm opacity-75">
                      {shop._count?.products || 0} products
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedShop ? (
            <div className="rounded-lg bg-white p-6 shadow-md">
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    Runners - {selectedShop.name}
                  </h2>
                  <ShopWhatsAppAvatars
                    shopName={selectedShop.name}
                    groups={selectedShop.relatedWhatsAppGroups}
                    max={5}
                    variant="buttons"
                    showLabel
                    className="mt-3"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Approve, block, or remove runner access for this shop.
                  </p>
                </div>
                <button
                  onClick={() =>
                    selectedShop && loadRelationships(selectedShop.id)
                  }
                  className="rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-gray-50"
                >
                  Refresh
                </button>
              </div>

              <div className="mb-6 flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    onClick={() => setStatusFilter(option.value)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      statusFilter === option.value
                        ? "bg-primary text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {option.label}
                    <span className="ml-1 text-xs opacity-75">
                      {option.value
                        ? statusCounts[option.value] || 0
                        : relationships.length}
                    </span>
                  </button>
                ))}
              </div>

              {isLoadingRunners ? (
                <div className="py-12 text-center text-gray-500">
                  Loading...
                </div>
              ) : filteredRelationships.length === 0 ? (
                <div className="py-12 text-center">
                  <Clock className="mx-auto h-12 w-12 text-gray-300" />
                  <p className="mt-4 text-gray-500">No runners found</p>
                  <p className="text-sm text-gray-400">
                    Runner access requests and approved runners will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRelationships.map((relationship) => (
                    <div
                      key={relationship.id}
                      className="rounded-lg border p-4 transition-shadow hover:shadow-md"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-semibold">
                              {relationship.runner.user.name}
                            </h3>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeColor(
                                relationship.status,
                              )}`}
                            >
                              {relationship.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-3 text-sm text-gray-600 md:grid-cols-2">
                            <div>
                              <span className="font-medium">Email:</span>{" "}
                              {relationship.runner.user.email || "-"}
                            </div>
                            <div>
                              <span className="font-medium">Phone:</span>{" "}
                              {relationship.runner.user.phone || "-"}
                            </div>
                            <div>
                              <span className="font-medium">Rating:</span>{" "}
                              {relationship.runner.rating?.toFixed(1) || "New"}
                            </div>
                            <div>
                              <span className="font-medium">Orders:</span>{" "}
                              {relationship.runner.totalOrders} completed
                            </div>
                            <div>
                              <span className="font-medium">Listings:</span>{" "}
                              {relationship.runner._count?.listings || 0}
                            </div>
                            <div>
                              <span className="font-medium">Shops:</span>{" "}
                              {relationship.runner._count?.shopAssignments || 0}
                            </div>
                          </div>

                          {relationship.notes && (
                            <div className="mt-3 rounded bg-gray-50 p-3">
                              <p className="text-sm text-gray-700">
                                <span className="font-medium">Message:</span>{" "}
                                {relationship.notes}
                              </p>
                            </div>
                          )}

                          <div className="mt-3 text-xs text-gray-500">
                            Joined{" "}
                            {new Date(
                              relationship.joinedAt,
                            ).toLocaleDateString()}
                            {relationship.approvedAt && (
                              <span className="ml-4">
                                Approved{" "}
                                {new Date(
                                  relationship.approvedAt,
                                ).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="xl:min-w-44">
                          {renderActions(relationship)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-white p-6 text-center shadow-md">
              <UserCheck className="mx-auto h-16 w-16 text-gray-300" />
              <h3 className="mt-4 text-xl font-semibold text-gray-700">
                Select a Shop
              </h3>
              <p className="mt-2 text-gray-500">
                Choose a shop from the list to manage runner access
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

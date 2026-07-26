// frontend/app/orders/page.tsx

"use client";

import { useEffect, useState } from "react";
import { ordersApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  Package,
  Clock,
  Truck,
  CheckCircle,
  AlertCircle,
  ShoppingBag,
} from "lucide-react";

// Status icon mapping
const statusIcons: Record<string, any> = {
  PENDING_RUNNER_ACTIVATION: Clock,
  AWAITING_RUNNER_ACCEPTANCE: Clock,
  CREATED: Clock,
  ORDER_CONFIRMED: CheckCircle,
  PENDING_PAYMENT: Clock,
  PAID: CheckCircle,
  BUYING_TRIP_PLANNED: Package,
  BUYING_IN_PROGRESS: ShoppingBag,
  PURCHASED_FROM_SHOPS: ShoppingBag,
  ARRIVED_FOR_PACKING: Truck,
  BATCHED: Package,
  PICKED: Truck,
  PACKED: Package,
  READY_FOR_HANDOVER: Package,
  OUT_FOR_HANDOVER: Truck,
  SHIPPED: Truck,
  COMPLETED: CheckCircle,
  CANCELLED: AlertCircle,
  REFUNDED: AlertCircle,
};

const statusColors: Record<string, string> = {
  PENDING_RUNNER_ACTIVATION: "bg-amber-100 text-amber-900",
  AWAITING_RUNNER_ACCEPTANCE: "bg-amber-100 text-amber-900",
  CREATED: "bg-gray-100 text-gray-700",
  ORDER_CONFIRMED: "bg-blue-100 text-blue-700",
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-700",
  PAID: "bg-blue-100 text-blue-700",
  BUYING_TRIP_PLANNED: "bg-purple-100 text-purple-700",
  BUYING_IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  PURCHASED_FROM_SHOPS: "bg-cyan-100 text-cyan-700",
  ARRIVED_FOR_PACKING: "bg-sky-100 text-sky-700",
  BATCHED: "bg-purple-100 text-purple-700",
  PICKED: "bg-indigo-100 text-indigo-700",
  PACKED: "bg-indigo-100 text-indigo-700",
  READY_FOR_HANDOVER: "bg-emerald-100 text-emerald-700",
  OUT_FOR_HANDOVER: "bg-green-100 text-green-700",
  SHIPPED: "bg-green-100 text-green-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  REFUNDED: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  PENDING_RUNNER_ACTIVATION: "Runner activation needed",
  AWAITING_RUNNER_ACCEPTANCE: "Awaiting runner acceptance",
  CREATED: "Captured",
  ORDER_CONFIRMED: "Customer confirmed",
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  BUYING_TRIP_PLANNED: "Buying trip planned",
  BUYING_IN_PROGRESS: "Buying in progress",
  PURCHASED_FROM_SHOPS: "Bought from shops",
  ARRIVED_FOR_PACKING: "Back for packing",
  BATCHED: "Trip batch",
  PICKED: "Picked",
  PACKED: "Packed",
  READY_FOR_HANDOVER: "Ready for handover",
  OUT_FOR_HANDOVER: "On the way",
  SHIPPED: "Sent",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export default function OrdersPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login?redirect=/orders");
    }
  }, [isAuthenticated, router]);

  // Fetch orders
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchOrders = async () => {
      try {
        const response = await ordersApi.getAll(statusFilter ? { status: statusFilter } : undefined);
        setOrders(response.data.data || []);
      } catch (error: any) {
        console.error("Failed to fetch orders:", error);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [isAuthenticated, statusFilter]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
          style={{ borderColor: "var(--accent)" }}
        />
        <p className="mt-4" style={{ color: "var(--text-secondary)" }}>
          Loading your orders...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {user?.role === "RUNNER" ? "Runner Orders" : "My Orders"}
        </h1>
        <Link href={user?.role === "RUNNER" ? "/runner/dashboard" : "/products"}>
          <Button variant="outline" themed>
            {user?.role === "RUNNER" ? "Back to Runner Dashboard" : "Continue Shopping"}
          </Button>
        </Link>
      </div>

      {user?.role === "RUNNER" && (
        <div className="flex flex-wrap gap-2" aria-label="Order queue filters">
          {[
            ["", "All"],
            ["PENDING_RUNNER_ACTIVATION", "Activation needed"],
            ["AWAITING_RUNNER_ACCEPTANCE", "Needs acceptance"],
            ["PENDING_PAYMENT", "Payment"],
            ["PAID", "Ready to buy"],
            ["BUYING_IN_PROGRESS", "Buying"],
            ["PACKED", "Packed"],
            ["READY_FOR_HANDOVER", "Handover"],
            ["COMPLETED", "Completed"],
            ["CANCELLED", "Cancelled"],
          ].map(([value, label]) => (
            <button key={value || "all"} type="button" onClick={() => setStatusFilter(value)} className="rounded-md border px-3 py-2 text-sm font-semibold" style={{ borderColor: statusFilter === value ? "var(--accent)" : "var(--card-border)", background: statusFilter === value ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--card-bg)", color: "var(--text-primary)" }}>{label}</button>
          ))}
        </div>
      )}

      {/* Orders List */}
      {orders.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl border"
          style={{
            backgroundColor: "var(--card-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <Package
            className="w-16 h-16 mx-auto mb-4"
            style={{ color: "var(--text-muted)" }}
          />
          <h2
            className="text-xl font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            No orders yet
          </h2>
          <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
            Start shopping to see your orders here!
          </p>
          <Link href="/products">
            <Button themed>Browse Products</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => {
            const StatusIcon = statusIcons[order.status] || Clock;
            const statusColor =
              statusColors[order.status] || "bg-gray-100 text-gray-700";

            return (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block rounded-xl border transition-all hover:shadow-lg hover:scale-[1.01]"
                style={{
                  backgroundColor: "var(--card-bg)",
                  borderColor: "var(--card-border)",
                }}
              >
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    {/* Order Info */}
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className="font-mono text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          #{order.id.slice(-8)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {statusLabels[order.status] || order.status}
                        </span>
                      </div>

                      <p
                        className="font-medium mb-1"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {order.items?.length || 0} item
                        {order.items?.length !== 1 ? "s" : ""} •{" "}
                        {formatCurrency(order.totalAmount)}
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                      {(order.procurementCity || order.fulfillmentMethod) && (
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {[order.procurementCity, order.fulfillmentMethod]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>

                    {/* Items Preview */}
                    <div className="flex-1 sm:text-right">
                      {order.items?.slice(0, 3).map((item: any) => (
                        <p
                          key={item.id}
                          className="text-sm truncate"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {item.quantity}× {item.product?.name || "Product"}
                        </p>
                      ))}
                      {order.items && order.items.length > 3 && (
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          +{order.items.length - 3} more items
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <div
                      className="flex items-center justify-center"
                      style={{ color: "var(--accent)" }}
                    >
                      <span className="text-2xl">→</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// frontend/app/orders/[id]/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ordersApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import {
  Package,
  Truck,
  CheckCircle,
  Clock,
  MapPin,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";

// Status step configuration
const STATUS_STEPS = [
  { status: "PENDING_RUNNER_ACTIVATION", label: "Runner Activation Needed", icon: Clock },
  { status: "AWAITING_RUNNER_ACCEPTANCE", label: "Runner Reviewing", icon: Clock },
  { status: "PENDING_PAYMENT", label: "Payment Requested", icon: Clock },
  { status: "ORDER_CONFIRMED", label: "Customer Confirmed", icon: Clock },
  {
    status: "BUYING_TRIP_PLANNED",
    label: "Buying Trip Planned",
    icon: Package,
  },
  {
    status: "BUYING_IN_PROGRESS",
    label: "Buying From Shops",
    icon: ShoppingBag,
  },
  {
    status: "PURCHASED_FROM_SHOPS",
    label: "Bought From Shops",
    icon: ShoppingBag,
  },
  { status: "ARRIVED_FOR_PACKING", label: "Back For Packing", icon: Truck },
  { status: "PACKED", label: "Packed Per Customer", icon: Package },
  { status: "READY_FOR_HANDOVER", label: "Ready For Handover", icon: Package },
  { status: "OUT_FOR_HANDOVER", label: "On The Way", icon: Truck },
  { status: "COMPLETED", label: "Completed", icon: CheckCircle },
];

const legacyStepAliases: Record<string, string> = {
  CREATED: "PENDING_RUNNER_ACTIVATION",
  PAID: "ORDER_CONFIRMED",
  BATCHED: "BUYING_TRIP_PLANNED",
  PICKED: "PURCHASED_FROM_SHOPS",
  SHIPPED: "OUT_FOR_HANDOVER",
};

const NEXT_RUNNER_STATUS: Record<string, { status: string; label: string }> = {
  AWAITING_RUNNER_ACCEPTANCE: { status: "PENDING_PAYMENT", label: "Accept order" },
  PAID: { status: "BUYING_TRIP_PLANNED", label: "Plan buying trip" },
  BUYING_TRIP_PLANNED: { status: "BUYING_IN_PROGRESS", label: "Start buying" },
  BUYING_IN_PROGRESS: {
    status: "PURCHASED_FROM_SHOPS",
    label: "Finish shop purchases",
  },
  PURCHASED_FROM_SHOPS: {
    status: "ARRIVED_FOR_PACKING",
    label: "Arrived for packing",
  },
  ARRIVED_FOR_PACKING: { status: "PACKED", label: "Mark packed" },
  PACKED: { status: "READY_FOR_HANDOVER", label: "Ready for handover" },
  READY_FOR_HANDOVER: { status: "OUT_FOR_HANDOVER", label: "Start handover" },
  OUT_FOR_HANDOVER: { status: "COMPLETED", label: "Complete order" },
  SHIPPED: { status: "COMPLETED", label: "Confirm delivered" },
};

export default function OrderTrackingPage() {
  const { id } = useParams();
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [manualBusy, setManualBusy] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("MTN_MOMO");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login?redirect=/orders/" + id);
      return;
    }

    const fetchOrder = async () => {
      try {
        const response = await ordersApi.getById(id as string);
        setOrder(response.data);
      } catch (error: any) {
        toast.error(error?.response?.data?.message || "Failed to load order");
        router.push("/orders");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [id, isAuthenticated, router]);

  // Calculate current step index
  const currentWorkflowStatus =
    legacyStepAliases[order?.status] || order?.status;
  const currentStepIndex = STATUS_STEPS.findIndex(
    (step) => step.status === currentWorkflowStatus,
  );

  if (loading) {
    return (
      <div className="text-center py-12">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
          style={{ borderColor: "var(--accent)" }}
        />
        <p className="mt-4" style={{ color: "var(--text-secondary)" }}>
          Loading order...
        </p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <h1
          className="text-2xl font-bold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Order Not Found
        </h1>
        <Link href="/orders">
          <Button themed>View My Orders</Button>
        </Link>
      </div>
    );
  }

  const isAdminUser = user?.role === "ADMIN" || user?.role === "SUPERUSER";
  const permittedActions = Array.isArray(order.permittedActions)
    ? order.permittedActions
    : [];
  const runnerHasWorkflowControls =
    user?.role === "RUNNER" &&
    permittedActions.some((action: string) => action !== "INVITE_RUNNER_TO_ACTIVATE");
  const canManualTrack = isAdminUser || runnerHasWorkflowControls;
  const nextRunnerStatus = NEXT_RUNNER_STATUS[order.status];
  const canAdvanceOrder = Boolean(
    canManualTrack &&
      nextRunnerStatus &&
      (isAdminUser ||
        permittedActions.includes(nextRunnerStatus.status) ||
        (order.status === "AWAITING_RUNNER_ACCEPTANCE" &&
          permittedActions.includes("ACCEPT"))),
  );
  const canRejectOrder =
    canManualTrack &&
    order.status === "AWAITING_RUNNER_ACCEPTANCE" &&
    (isAdminUser || permittedActions.includes("REJECT"));
  const paymentEvidence = Boolean(
    order.customerPaymentProofUrl || order.customerPaymentReference,
  );
  const paymentCanBeReviewed =
    order.customerPaymentStatus === "SUBMITTED" &&
    paymentEvidence &&
    order.status !== "CANCELLED";
  const paymentStatusStyle: Record<string, string> = {
    UNPAID: "border-gray-300 bg-gray-50 text-gray-800",
    SUBMITTED: "border-amber-300 bg-amber-50 text-amber-900",
    UNDER_REVIEW: "border-blue-300 bg-blue-50 text-blue-900",
    PAID: "border-green-300 bg-green-50 text-green-900",
    REJECTED: "border-red-300 bg-red-50 text-red-900",
  };
  const latestPayment = Array.isArray(order.manualPayments)
    ? order.manualPayments[order.manualPayments.length - 1]
    : null;

  const updateManualTracking = async (
    label: string,
    data: Record<string, string>,
  ) => {
    setManualBusy(label);
    try {
      const response = await ordersApi.updateManualTracking(order.id, data);
      setOrder(response.data);
      toast.success("Order tracking updated");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to update order");
    } finally {
      setManualBusy(null);
    }
  };

  const promptReference = (message: string) =>
    window.prompt(message, "")?.trim() || undefined;

  const advanceOrder = async () => {
    const next = NEXT_RUNNER_STATUS[order.status];
    if (!next) return;
    setStatusBusy(true);
    try {
      const response = await ordersApi.updateStatus(order.id, next.status);
      setOrder(response.data);
      toast.success(`Order updated: ${next.label}`);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Could not update order status",
      );
    } finally {
      setStatusBusy(false);
    }
  };

  const rejectOrder = async () => {
    const reason = window.prompt("Why are you rejecting this order?", "Item or trip unavailable")?.trim();
    if (!reason) return;
    setStatusBusy(true);
    try {
      const response = await ordersApi.updateStatus(order.id, "CANCELLED", { rejectionReason: reason });
      setOrder(response.data);
      toast.success("Order rejected and customer notified");
    } catch (error: any) { toast.error(error.response?.data?.message || "Could not reject order"); }
    finally { setStatusBusy(false); }
  };

  const submitPayment = async () => {
    if (paymentMethod !== "CASH" && !paymentReference.trim() && !paymentProof) {
      toast.error("Add a payment reference or proof"); return;
    }
    setPaymentBusy(true);
    try {
      let proofUrl: string | undefined;
      if (paymentProof) proofUrl = (await ordersApi.uploadPaymentProof(order.id, paymentProof)).data.proofUrl;
      const response = await ordersApi.submitCustomerPayment(order.id, { method: paymentMethod, reference: paymentReference.trim() || undefined, proofUrl, amount: order.totalAmount });
      setOrder(response.data.order);
      toast.success(response.data.duplicate ? "Payment was already submitted" : "Payment sent to your runner for verification");
    } catch (error: any) { toast.error(error.response?.data?.message || "Could not submit payment"); }
    finally { setPaymentBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Order #{order.id.slice(-8)}
          </h1>
          <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
            Placed on {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Link href="/orders">
          <Button variant="outline" themed>
            ← Back to Orders
          </Button>
        </Link>
      </div>

      {order.status === "PENDING_RUNNER_ACTIVATION" && (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          This order is captured, but the trusted runner still needs to activate
          Phase 2 order management before they can manage tracking here.
        </div>
      )}

      {canAdvanceOrder && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          style={{
            backgroundColor: "var(--card-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Next operational step
            </p>
            <p
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {nextRunnerStatus?.label}
            </p>
          </div>
          <Button
            themed
            onClick={advanceOrder}
            disabled={statusBusy}
            isLoading={statusBusy}
          >
            {nextRunnerStatus?.label}
          </Button>
        </div>
      )}
      {canRejectOrder && (
        <div className="flex justify-end"><Button variant="outline" themed disabled={statusBusy} onClick={rejectOrder}>Reject order</Button></div>
      )}

      {/* Status Timeline */}
      <div
        className="rounded-xl shadow-sm border p-6"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <h2
          className="text-lg font-semibold mb-6"
          style={{ color: "var(--text-primary)" }}
        >
          Order Status
        </h2>

        <div className="relative">
          {/* Progress Line */}
          <div
            className="absolute left-4 top-0 bottom-0 w-0.5"
            style={{ backgroundColor: "var(--text-muted)" }}
          />

          {/* Steps */}
          <div className="space-y-6">
            {STATUS_STEPS.map((step, index) => {
              const isCompleted = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const Icon = step.icon;

              return (
                <div
                  key={step.status}
                  className="relative flex items-start gap-4"
                >
                  {/* Status Icon */}
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isCompleted ? "text-white" : "text-gray-400"
                    }`}
                    style={{
                      background: isCompleted
                        ? "var(--button-primary-bg)"
                        : "var(--bg-secondary)",
                      borderColor: "var(--card-border)",
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Step Content */}
                  <div className="flex-1">
                    <p
                      className={`font-medium transition-colors ${
                        isCompleted ? "" : "opacity-50"
                      }`}
                      style={{
                        color: isCompleted
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                      }}
                    >
                      {step.label}
                    </p>
                    {isCurrent && (
                      <p
                        className="text-sm mt-1"
                        style={{ color: "var(--accent)" }}
                      >
                        {order.status === "SHIPPED" &&
                        order.shippingAddress?.trackingNumber
                          ? `Tracking: ${order.shippingAddress.trackingNumber}`
                          : "In progress..."}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {user?.role === "CUSTOMER" && order.status === "PENDING_PAYMENT" && order.customerPaymentStatus !== "SUBMITTED" && (
        <section className="rounded-xl border p-5" style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--card-border)" }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Submit payment for runner verification</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>Your runner accepted the order. Add the payment details they gave you.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm" style={{ color: "var(--text-secondary)" }}>Payment method<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="theme-input mt-1 min-h-11 w-full rounded-md border px-3"><option value="MTN_MOMO">MTN MoMo</option><option value="EFT">EFT</option><option value="CASH_DEPOSIT">Cash deposit</option><option value="INSTANT_MONEY">Instant Money</option><option value="EWALLET">eWallet</option><option value="UNAYO">Unayo</option><option value="CASH">Cash</option></select></label>
            <label className="text-sm" style={{ color: "var(--text-secondary)" }}>Reference<input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="theme-input mt-1 min-h-11 w-full rounded-md border px-3" placeholder="Transaction/reference number" /></label>
            <label className="text-sm sm:col-span-2" style={{ color: "var(--text-secondary)" }}>Proof image<input type="file" accept="image/*" onChange={(e) => setPaymentProof(e.target.files?.[0] || null)} className="mt-2 block w-full" /></label>
          </div>
          <Button className="mt-4" themed isLoading={paymentBusy} onClick={submitPayment}>Submit payment</Button>
        </section>
      )}

      {/* Order Details */}
      <div
        className="rounded-xl shadow-sm border p-6"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <h2
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Order Details
        </h2>

        <div className="space-y-4">
          {order.items?.map((item: any) => (
            <div
              key={item.id}
              className="flex gap-4 py-3 border-b last:border-0"
              style={{ borderColor: "var(--card-border)" }}
            >
              <div
                className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                {item.product?.images?.[0] ? (
                  <img
                    src={item.product.images[0]}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.product?.name || "Product"}
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Qty: {item.quantity}
                </p>
                {(item.selectedSize || item.selectedColor) && (
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {[
                      item.selectedSize && `Size ${item.selectedSize}`,
                      item.selectedColor && `Colour ${item.selectedColor}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {item.customerNote && (
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Note: {item.customerNote}
                  </p>
                )}
                <p
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Shop {formatCurrency(item.shopPrice)} + runner fee{" "}
                  {formatCurrency(item.commission)} per item
                </p>
              </div>
              <p
                className="font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {formatCurrency(item.unitPrice * item.quantity)}
              </p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div
          className="mt-6 pt-4 border-t space-y-2 text-sm"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>
              Items subtotal
            </span>
            <span style={{ color: "var(--text-primary)" }}>
              {formatCurrency(order.subtotal)}
            </span>
          </div>
          {Number(order.tax || 0) > 0 && (
            <div className="flex justify-between">
              <span style={{ color: "var(--text-secondary)" }}>Tax</span>
              <span style={{ color: "var(--text-primary)" }}>
                {formatCurrency(order.tax)}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>
              Transport fee
            </span>
            <span style={{ color: "var(--text-primary)" }}>
              {formatCurrency(order.shippingFee)}
            </span>
          </div>
          <div
            className="flex justify-between font-bold text-base pt-2 border-t"
            style={{ borderColor: "var(--card-border)" }}
          >
            <span style={{ color: "var(--text-primary)" }}>Total</span>
            <span style={{ color: "var(--accent)" }}>
              {formatCurrency(order.totalAmount)}
            </span>
          </div>
        </div>
      </div>

      <div
        className={`rounded-xl border p-5 ${paymentStatusStyle[order.customerPaymentStatus] || paymentStatusStyle.UNPAID}`}
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Customer payment
            </p>
            <p
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {(order.customerPaymentStatus || "UNPAID").replaceAll("_", " ")}
            </p>
          </div>
          <div
            className="text-right text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            <p>
              {(
                order.customerPaymentMethod || "Method not supplied"
              ).replaceAll("_", " ")}
            </p>
            {order.customerPaymentReference && (
              <p>Ref: {order.customerPaymentReference}</p>
            )}
          </div>
        </div>
        {order.customerPaymentStatus === "SUBMITTED" && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Payment details have been sent and are awaiting runner verification.
          </p>
        )}
        {order.customerPaymentProofUrl && (
          <div className="mt-4">
            <a href={order.customerPaymentProofUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border bg-white p-2">
              <img src={order.customerPaymentProofUrl} alt="Customer proof of payment" className="max-h-80 w-full object-contain" />
              <span className="mt-2 block text-center text-sm font-bold text-blue-700 underline">Open full payment proof</span>
            </a>
          </div>
        )}
        {latestPayment?.createdAt && (
          <p className="mt-3 text-xs">Submitted {new Date(latestPayment.createdAt).toLocaleString()}</p>
        )}
        {order.paymentVerifiedAt && (
          <p className="mt-1 text-xs">Reviewed {new Date(order.paymentVerifiedAt).toLocaleString()}</p>
        )}
      </div>

      {canManualTrack && (
        <div
          className="rounded-xl shadow-sm border p-6"
          style={{
            backgroundColor: "var(--card-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-4 flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}
          >
            <CheckCircle
              className="w-5 h-5"
              style={{ color: "var(--accent)" }}
            />
            Manual Payment & Purchase Tracking
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--card-border)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Customer payment
              </p>
              <p
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {order.customerPaymentStatus || "UNPAID"}
              </p>
              {order.customerPaymentReference && (
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Ref: {order.customerPaymentReference}
                </p>
              )}
              <Button
                className="mt-3"
                size="sm"
                themed
                disabled={manualBusy === "customer" || !paymentCanBeReviewed}
                title={!paymentCanBeReviewed ? "Customer must submit a payment reference or proof before verification." : "Confirm payment received"}
                isLoading={manualBusy === "customer"}
                onClick={() =>
                  updateManualTracking("customer", {
                    customerPaymentStatus: "PAID",
                    customerPaymentMethod:
                      order.customerPaymentMethod || "OTHER",
                    customerPaymentReference:
                      order.customerPaymentReference || "",
                  })
                }
              >
                Verify payment
              </Button>
              {order.customerPaymentStatus === "SUBMITTED" && (
                <Button
                  className="mt-3 ml-2"
                  size="sm"
                  variant="outline"
                  themed
                  disabled={manualBusy === "customer-reject" || !paymentCanBeReviewed}
                  title={!paymentCanBeReviewed ? "No reviewable payment proof has been submitted." : "Reject this payment submission"}
                  onClick={() =>
                    updateManualTracking("customer-reject", {
                      customerPaymentStatus: "REJECTED",
                    })
                  }
                >
                  Reject
                </Button>
              )}
              {order.customerPaymentStatus === "SUBMITTED" && (
                <Button
                  className="mt-3 ml-2"
                  size="sm"
                  variant="outline"
                  disabled={manualBusy === "clearer-proof" || !paymentCanBeReviewed}
                  title="Reject this submission and ask for a clearer proof"
                  onClick={() =>
                    updateManualTracking("clearer-proof", {
                      customerPaymentStatus: "REJECTED",
                    })
                  }
                >
                  Request clearer proof
                </Button>
              )}
            </div>
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--card-border)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Shop payment
              </p>
              <p
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {order.shopPaymentStatus || "UNPAID"}
              </p>
              {order.shopPaymentReference && (
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Ref: {order.shopPaymentReference}
                </p>
              )}
              <Button
                className="mt-3"
                size="sm"
                themed
                disabled={manualBusy === "shop"}
                isLoading={manualBusy === "shop"}
                onClick={() =>
                  updateManualTracking("shop", {
                    shopPaymentStatus: "PAID",
                    shopPaymentMethod: "EFT",
                    shopPaymentReference:
                      promptReference("Shop payment reference") || "",
                  })
                }
              >
                Mark shop paid
              </Button>
            </div>
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--card-border)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Runner purchase
              </p>
              <p
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {order.runnerPurchaseStatus || "NOT_BOUGHT"}
              </p>
              <Button
                className="mt-3"
                size="sm"
                themed
                disabled={manualBusy === "purchase" || order.customerPaymentStatus !== "PAID"}
                title={order.customerPaymentStatus !== "PAID" ? "Payment must be confirmed before purchasing." : "Mark items bought"}
                isLoading={manualBusy === "purchase"}
                onClick={() =>
                  updateManualTracking("purchase", {
                    runnerPurchaseStatus: "BOUGHT",
                  })
                }
              >
                Mark bought
              </Button>
            </div>
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--card-border)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Delivery / collection
              </p>
              <p
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {order.handoverStatus || "PENDING"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  themed
                  disabled={manualBusy === "delivered" || !["READY_FOR_HANDOVER", "OUT_FOR_HANDOVER", "SHIPPED", "COMPLETED"].includes(order.status)}
                  title={!['READY_FOR_HANDOVER', 'OUT_FOR_HANDOVER', 'SHIPPED', 'COMPLETED'].includes(order.status) ? "Order must be ready for handover first." : "Mark delivered"}
                  isLoading={manualBusy === "delivered"}
                  onClick={() =>
                    updateManualTracking("delivered", {
                      handoverStatus: "DELIVERED",
                    })
                  }
                >
                  Delivered
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  themed
                  disabled={manualBusy === "collected" || !["READY_FOR_HANDOVER", "OUT_FOR_HANDOVER", "COMPLETED"].includes(order.status)}
                  title={!['READY_FOR_HANDOVER', 'OUT_FOR_HANDOVER', 'COMPLETED'].includes(order.status) ? "Order must be ready for handover first." : "Mark collected"}
                  isLoading={manualBusy === "collected"}
                  onClick={() =>
                    updateManualTracking("collected", {
                      handoverStatus: "COLLECTED",
                    })
                  }
                >
                  Collected
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fulfillment Details */}
      <div
        className="rounded-xl shadow-sm border p-6"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <h2
          className="text-lg font-semibold mb-4 flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <Truck className="w-5 h-5" style={{ color: "var(--accent)" }} />
          Runner Fulfillment
        </h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p style={{ color: "var(--text-muted)" }}>Buying trip</p>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>
              {[order.procurementCity, order.procurementTripCode]
                .filter(Boolean)
                .join(" · ") || "To be confirmed"}
            </p>
          </div>
          <div>
            <p style={{ color: "var(--text-muted)" }}>Customer handover</p>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>
              {order.fulfillmentMethod || "To be confirmed"}
            </p>
          </div>
          <div>
            <p style={{ color: "var(--text-muted)" }}>Station / location</p>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>
              {order.fulfillmentLocation || "To be confirmed"}
            </p>
          </div>
          <div>
            <p style={{ color: "var(--text-muted)" }}>Contact / transport</p>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>
              {order.fulfillmentContact || "To be confirmed"}
            </p>
          </div>
        </div>
        {order.fulfillmentNotes && (
          <p
            className="mt-4 whitespace-pre-wrap text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            {order.fulfillmentNotes}
          </p>
        )}
      </div>

      {/* Shipping Address */}
      <div
        className="rounded-xl shadow-sm border p-6"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <h2
          className="text-lg font-semibold mb-4 flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <MapPin className="w-5 h-5" style={{ color: "var(--accent)" }} />
          Delivery Address
        </h2>
        <address
          className="not-italic"
          style={{ color: "var(--text-secondary)" }}
        >
          {order.shippingAddress?.street || "N/A"}
          <br />
          {order.shippingAddress?.city}, {order.shippingAddress?.state}{" "}
          {order.shippingAddress?.zipCode}
          <br />
          {order.shippingAddress?.country || "N/A"}
        </address>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        {order.status === "CREATED" && (
          <Button
            variant="danger"
            onClick={async () => {
              if (confirm("Cancel this order?")) {
                try {
                  await ordersApi.cancel(order.id);
                  toast.success("Order cancelled");
                  router.push("/orders");
                } catch (error: any) {
                  toast.error(
                    error?.response?.data?.message || "Failed to cancel order",
                  );
                }
              }
            }}
          >
            Cancel Order
          </Button>
        )}
        <Link href={user?.role === "RUNNER" ? "/runner/dashboard" : "/products"}>
          <Button variant="outline" themed>
            {user?.role === "RUNNER" ? "Back to Runner Dashboard" : "Continue Shopping"}
          </Button>
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useRunnerGuard } from "@/hooks/useRoleGuard";
import { runnerApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { isVideoMedia, parseProductMedia } from "@/lib/productMedia";
import type { WhatsAppOrderRequest } from "@/lib/types";

type RequestStatus =
  | "ALL"
  | "NEW"
  | "UNMATCHED"
  | "AWAITING_CUSTOMER_DETAILS"
  | "CONTACTED"
  | "CONVERTED"
  | "CLOSED";

const STATUS_FILTERS: RequestStatus[] = [
  "ALL",
  "NEW",
  "UNMATCHED",
  "AWAITING_CUSTOMER_DETAILS",
  "CONTACTED",
  "CONVERTED",
  "CLOSED",
];

function mediaUrl(url: string) {
  return resolveMediaUrl(url);
}

export default function RunnerOrderRequestsPage() {
  const { isReady } = useRunnerGuard();
  const [requests, setRequests] = useState<WhatsAppOrderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RequestStatus>("ALL");
  const [showConversations, setShowConversations] = useState(false);
  const [expandedConversationIds, setExpandedConversationIds] = useState<
    string[]
  >([]);
  const [hiddenConversationIds, setHiddenConversationIds] = useState<string[]>(
    [],
  );

  useEffect(() => {
    if (!isReady) return;
    loadRequests();
  }, [isReady]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const response = await runnerApi.getOrderRequests();
      setRequests(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to load WhatsApp order requests:", error);
      toast.error("Failed to load WhatsApp order requests");
    } finally {
      setLoading(false);
    }
  };

  const filteredRequests = useMemo(
    () =>
      statusFilter === "ALL"
        ? requests
        : requests.filter((request) => request.status === statusFilter),
    [requests, statusFilter],
  );

  const isConversationVisible = (requestId: string) =>
    showConversations
      ? !hiddenConversationIds.includes(requestId)
      : expandedConversationIds.includes(requestId);

  const toggleConversation = (requestId: string) => {
    if (showConversations) {
      setHiddenConversationIds((current) =>
        current.includes(requestId)
          ? current.filter((id) => id !== requestId)
          : [...current, requestId],
      );
      return;
    }

    setExpandedConversationIds((current) =>
      current.includes(requestId)
        ? current.filter((id) => id !== requestId)
        : [...current, requestId],
    );
  };

  const toggleAllConversations = () => {
    setShowConversations((current) => !current);
    setExpandedConversationIds([]);
    setHiddenConversationIds([]);
  };

  const counts = useMemo(
    () =>
      requests.reduce(
        (acc, request) => {
          acc.ALL += 1;
          acc[request.status] = (acc[request.status] || 0) + 1;
          return acc;
        },
        {
          ALL: 0,
          NEW: 0,
          UNMATCHED: 0,
          CONTACTED: 0,
          CONVERTED: 0,
          CLOSED: 0,
        } as Record<RequestStatus, number>,
      ),
    [requests],
  );

  const groupedRequests = useMemo(() => {
    const customerMap = new Map<
      string,
      {
        key: string;
        label: string;
        phone?: string;
        count: number;
        shops: Map<
          string,
          {
            key: string;
            label: string;
            count: number;
            requests: WhatsAppOrderRequest[];
          }
        >;
      }
    >();

    filteredRequests.forEach((request) => {
      const customerLabel =
        request.customerName || request.customerPhone || "Unknown customer";
      const customerKey = String(request.customerPhone || customerLabel);
      const shopLabel =
        request.listing?.shop?.name ||
        request.listing?.product?.shop?.name ||
        "Unknown shop";
      const shopKey =
        request.listing?.shop?.id ||
        request.listing?.product?.shop?.id ||
        shopLabel;
      const customerGroup =
        customerMap.get(customerKey) ||
        ({
          key: customerKey,
          label: customerLabel,
          phone: request.customerPhone,
          count: 0,
          shops: new Map(),
        } satisfies {
          key: string;
          label: string;
          phone?: string;
          count: number;
          shops: Map<
            string,
            {
              key: string;
              label: string;
              count: number;
              requests: WhatsAppOrderRequest[];
            }
          >;
        });
      const shopGroup =
        customerGroup.shops.get(shopKey) ||
        ({
          key: shopKey,
          label: shopLabel,
          count: 0,
          requests: [],
        } satisfies {
          key: string;
          label: string;
          count: number;
          requests: WhatsAppOrderRequest[];
        });

      customerGroup.count += 1;
      shopGroup.count += 1;
      shopGroup.requests.push(request);
      customerGroup.shops.set(shopKey, shopGroup);
      customerMap.set(customerKey, customerGroup);
    });

    return Array.from(customerMap.values()).map((customer) => ({
      ...customer,
      shops: Array.from(customer.shops.values()),
    }));
  }, [filteredRequests]);

  const updateStatus = async (
    request: WhatsAppOrderRequest,
    status: Exclude<RequestStatus, "ALL">,
  ) => {
    setBusyId(request.id);
    try {
      const response = await runnerApi.updateOrderRequestStatus(
        request.id,
        status,
      );
      setRequests((current) =>
        current.map((item) => (item.id === request.id ? response.data : item)),
      );
      toast.success(`Request marked ${status.toLowerCase()}`);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to update request status",
      );
    } finally {
      setBusyId(null);
    }
  };

  const convertRequest = async (request: WhatsAppOrderRequest) => {
    if (!request.listingId) {
      toast.error("This request is not matched to a listing yet");
      return;
    }

    const quantityInput = window.prompt("Quantity ordered?", "1");
    if (quantityInput === null) return;

    const quantity = Math.max(1, Number(quantityInput || 1));
    if (!Number.isFinite(quantity)) {
      toast.error("Enter a valid quantity");
      return;
    }

    setBusyId(request.id);
    try {
      const response = await runnerApi.convertOrderRequest(request.id, {
        quantity,
        customerPhone: request.customerPhone,
        customerName: request.customerName,
        notes: request.messageText,
      });
      setRequests((current) =>
        current.map((item) =>
          item.id === request.id
            ? {
                ...item,
                status: "CONVERTED",
                orderId: response.data?.id,
                order: response.data,
              }
            : item,
        ),
      );
      toast.success("Order created from WhatsApp request");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to create order from request",
      );
    } finally {
      setBusyId(null);
    }
  };

  const whatsappLink = (phone?: string | null) => {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "";
  };

  const requestMedia = (request: WhatsAppOrderRequest) => {
    const product = request.listing?.product as any;
    const importMedia = parseProductMedia(
      product?.whatsappImports?.[0]?.mediaUrls,
    );
    const productImages = parseProductMedia(product?.images);
    return importMedia.length > 0 ? importMedia : productImages;
  };

  const basketSummary = (request: WhatsAppOrderRequest) => {
    const order = request.order as any;
    const items = Array.isArray(order?.items) ? order.items : [];
    return {
      itemCount: items.length,
      totalQuantity: items.reduce(
        (total: number, item: any) => total + Number(item.quantity || 0),
        0,
      ),
    };
  };

  const basketLineForRequest = (request: WhatsAppOrderRequest) => {
    const items = Array.isArray((request.order as any)?.items)
      ? ((request.order as any).items as any[])
      : [];
    return (
      items.find((item) => item.listingId === request.listingId) || items[0]
    );
  };

  const customerReferenceImages = (
    request: WhatsAppOrderRequest,
    basketLine: any,
  ) => {
    const requestImages = Array.isArray(request.customerImageUrls)
      ? request.customerImageUrls
      : [];
    const lineImages = Array.isArray(basketLine?.customerImageUrls)
      ? basketLine.customerImageUrls
      : [];

    return [...new Set([...requestImages, ...lineImages])];
  };

  const statusClass = (status: string) => {
    switch (status) {
      case "NEW":
        return "bg-green-100 text-green-800";
      case "CONTACTED":
        return "bg-amber-100 text-amber-800";
      case "CONVERTED":
        return "bg-blue-100 text-blue-800";
      case "CLOSED":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-red-100 text-red-800";
    }
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
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            WhatsApp Orders
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Private customer messages are captured when they include a runner
            listing code such as RC-1234ABCD.
          </p>
        </div>
        <Button variant="outline" themed onClick={loadRequests}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div
        className="rounded-xl border p-4 text-sm"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
          color: "var(--text-secondary)",
        }}
      >
        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Three ways orders can enter the system
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <p
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Customer messages you directly
            </p>
            <p className="mt-1">
              Send RunnerBot: ORDER FOR &lt;customer phone&gt;, CODE, QTY, SIZE,
              COLOR and NOTE.
            </p>
          </div>
          <div>
            <p
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Customer uses RunnerBot
            </p>
            <p className="mt-1">
              Ask the customer to send ORDER &lt;code&gt; or use the order link
              in your repost.
            </p>
          </div>
          <div>
            <p
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Customer uses app/webapp
            </p>
            <p className="mt-1">
              App orders appear here and in the Shopping List automatically.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {STATUS_FILTERS.filter((status) => status !== "ALL").map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className="rounded-lg border p-4 text-left transition hover:opacity-80"
            style={{
              backgroundColor: "var(--card-bg)",
              borderColor:
                statusFilter === status
                  ? "var(--accent)"
                  : "var(--card-border)",
            }}
          >
            <p
              className="text-xs font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              {status}
            </p>
            <p
              className="text-2xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {counts[status]}
            </p>
          </button>
        ))}
      </div>

      <div
        className="rounded-xl border p-4"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold transition"
                style={
                  statusFilter === status
                    ? { backgroundColor: "var(--accent)", color: "#fff" }
                    : {
                        backgroundColor: "var(--bg-secondary)",
                        color: "var(--text-primary)",
                      }
                }
              >
                {status} {counts[status]}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            themed
            onClick={toggleAllConversations}
          >
            {showConversations ? (
              <EyeOff className="mr-1 h-4 w-4" />
            ) : (
              <Eye className="mr-1 h-4 w-4" />
            )}
            {showConversations ? "Hide conversations" : "Show conversations"}
          </Button>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="py-12 text-center">
            <MessageCircle
              className="mx-auto mb-3 h-10 w-10"
              style={{ color: "var(--text-muted)" }}
            />
            <p
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              No requests in this view
            </p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Keep the WhatsApp bridge running and ask customers to forward the
              order code to the runner personal WhatsApp.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedRequests.map((customerGroup) => {
              const customerLink = whatsappLink(customerGroup.phone);
              return (
                <div
                  key={customerGroup.key}
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--card-border)" }}
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p
                        className="text-xs font-semibold uppercase"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Customer
                      </p>
                      <h2
                        className="text-lg font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {customerGroup.label}
                      </h2>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {customerGroup.count} request
                        {customerGroup.count === 1 ? "" : "s"} across{" "}
                        {customerGroup.shops.length} shop
                        {customerGroup.shops.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    {customerLink && (
                      <a href={customerLink} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" themed>
                          <MessageCircle className="mr-1 h-4 w-4" />
                          Reply to customer
                        </Button>
                      </a>
                    )}
                  </div>

                  <div className="space-y-4">
                    {customerGroup.shops.map((shopGroup) => (
                      <div
                        key={shopGroup.key}
                        className="rounded-lg border p-3"
                        style={{
                          borderColor: "var(--card-border)",
                          backgroundColor: "var(--bg-secondary)",
                        }}
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p
                              className="text-xs font-semibold uppercase"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Shop
                            </p>
                            <p
                              className="font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {shopGroup.label}
                            </p>
                          </div>
                          <span
                            className="rounded-full px-2 py-1 text-xs font-semibold"
                            style={{
                              backgroundColor: "var(--card-bg)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {shopGroup.count} item
                            {shopGroup.count === 1 ? "" : "s"}
                          </span>
                        </div>

                        <div className="space-y-3">
                          {shopGroup.requests.map((request) => {
                            const contactLink = whatsappLink(
                              request.customerPhone,
                            );
                            const media = requestMedia(request).slice(0, 6);
                            const basket = basketSummary(request);
                            const basketLine = basketLineForRequest(request);
                            const referenceImages = customerReferenceImages(
                              request,
                              basketLine,
                            );
                            const conversationVisible = isConversationVisible(
                              request.id,
                            );
                            return (
                              <div
                                key={request.id}
                                className="rounded-lg border p-4"
                                style={{
                                  borderColor: "var(--card-border)",
                                  backgroundColor: "var(--card-bg)",
                                }}
                              >
                                <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                                  <div>
                                    {media.length > 0 ? (
                                      <div className="grid grid-cols-2 gap-2">
                                        {media.map((url, index) => (
                                          <div
                                            key={`${request.id}-${url}-${index}`}
                                            className="relative aspect-square overflow-hidden rounded-lg border"
                                            style={{
                                              borderColor: "var(--card-border)",
                                              backgroundColor:
                                                "var(--bg-secondary)",
                                            }}
                                          >
                                            {isVideoMedia(url) ? (
                                              <video
                                                src={url}
                                                className="h-full w-full object-cover"
                                                muted
                                                playsInline
                                                controls
                                              />
                                            ) : (
                                              <img
                                                src={url}
                                                alt={
                                                  request.listing?.product
                                                    ?.name || "Ordered item"
                                                }
                                                className="h-full w-full object-cover"
                                                loading="lazy"
                                                decoding="async"
                                              />
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div
                                        className="flex aspect-square items-center justify-center rounded-lg border text-sm"
                                        style={{
                                          borderColor: "var(--card-border)",
                                          backgroundColor:
                                            "var(--bg-secondary)",
                                          color: "var(--text-muted)",
                                        }}
                                      >
                                        No image captured
                                      </div>
                                    )}
                                  </div>

                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3
                                        className="font-semibold"
                                        style={{
                                          color: "var(--text-primary)",
                                        }}
                                      >
                                        {request.listing?.product?.name ||
                                          request.orderCode ||
                                          "Unmatched customer message"}
                                      </h3>
                                      <span
                                        className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(
                                          request.status,
                                        )}`}
                                      >
                                        {request.status}
                                      </span>
                                    </div>
                                    <p
                                      className="mt-1 text-xs font-semibold"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      {[
                                        request.orderCode
                                          ? `Code ${request.orderCode}`
                                          : null,
                                        request.receivedAt
                                          ? new Date(
                                              request.receivedAt,
                                            ).toLocaleString()
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </p>
                                    {request.listing?.runnerPrice && (
                                      <p
                                        className="mt-1 text-sm font-semibold"
                                        style={{ color: "var(--accent)" }}
                                      >
                                        Listing price:{" "}
                                        {formatCurrency(
                                          request.listing.runnerPrice,
                                        )}
                                      </p>
                                    )}

                                    {request.matchedStampedMediaLog && (
                                      <div
                                        className="mt-2 rounded-lg border px-3 py-2 text-xs"
                                        style={{
                                          borderColor: "var(--card-border)",
                                          backgroundColor: "#ecfdf5",
                                          color: "#047857",
                                        }}
                                      >
                                        <p className="font-semibold">
                                          Matched returned stamped image
                                        </p>
                                        <p className="mt-0.5">
                                          Posted to{" "}
                                          {
                                            request.matchedStampedMediaLog
                                              .groupIdOrName
                                          }{" "}
                                          on{" "}
                                          {new Date(
                                            request.matchedStampedMediaLog
                                              .sentAt,
                                          ).toLocaleString()}
                                        </p>
                                        <p className="mt-0.5">
                                          Confidence:{" "}
                                          {Math.round(
                                            Number(
                                              request.imageMatchConfidence || 0,
                                            ) * 100,
                                          )}
                                          % ·{" "}
                                          {request.imageMatchReason ||
                                            "Image fingerprint"}
                                        </p>
                                      </div>
                                    )}

                                    {request.orderId && (
                                      <div
                                        className="mt-2 rounded-lg border px-3 py-2 text-xs"
                                        style={{
                                          borderColor: "var(--card-border)",
                                          backgroundColor:
                                            "var(--bg-secondary)",
                                          color: "var(--text-secondary)",
                                        }}
                                      >
                                        Basket: {basket.itemCount} item
                                        {basket.itemCount === 1 ? "" : "s"}
                                        {basket.totalQuantity
                                          ? ` · ${basket.totalQuantity} total qty`
                                          : ""}
                                        {request.order?.totalAmount
                                          ? ` · ${formatCurrency(
                                              request.order.totalAmount,
                                            )}`
                                          : ""}
                                      </div>
                                    )}

                                    {basketLine && (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <span
                                          className="rounded-full px-2 py-1 text-xs font-semibold"
                                          style={{
                                            backgroundColor:
                                              "var(--bg-secondary)",
                                            color: "var(--text-primary)",
                                          }}
                                        >
                                          Qty: {basketLine.quantity || 1}
                                        </span>
                                        {basketLine.selectedSize && (
                                          <span
                                            className="rounded-full px-2 py-1 text-xs font-semibold"
                                            style={{
                                              backgroundColor:
                                                "var(--bg-secondary)",
                                              color: "var(--text-primary)",
                                            }}
                                          >
                                            Size: {basketLine.selectedSize}
                                          </span>
                                        )}
                                        {basketLine.selectedColor && (
                                          <span
                                            className="rounded-full px-2 py-1 text-xs font-semibold"
                                            style={{
                                              backgroundColor:
                                                "var(--bg-secondary)",
                                              color: "var(--text-primary)",
                                            }}
                                          >
                                            Color: {basketLine.selectedColor}
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {referenceImages.length > 0 && (
                                      <div className="mt-3">
                                        <p
                                          className="mb-2 text-xs font-semibold uppercase"
                                          style={{
                                            color: "var(--text-muted)",
                                          }}
                                        >
                                          Customer reference
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                          {referenceImages.map((url) => (
                                            <a
                                              key={url}
                                              href={mediaUrl(url)}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="block"
                                            >
                                              <img
                                                src={mediaUrl(url)}
                                                alt="Customer reference"
                                                className="h-20 w-20 rounded-lg border object-cover"
                                                loading="lazy"
                                                decoding="async"
                                                style={{
                                                  borderColor:
                                                    "var(--card-border)",
                                                }}
                                              />
                                            </a>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      themed
                                      onClick={() =>
                                        toggleConversation(request.id)
                                      }
                                      className="mt-3"
                                    >
                                      {conversationVisible ? (
                                        <EyeOff className="mr-1 h-4 w-4" />
                                      ) : (
                                        <Eye className="mr-1 h-4 w-4" />
                                      )}
                                      {conversationVisible
                                        ? "Hide conversation"
                                        : "View conversation"}
                                    </Button>

                                    {conversationVisible ? (
                                      <div
                                        className="mt-3 rounded-lg p-3"
                                        style={{
                                          backgroundColor:
                                            "var(--bg-secondary)",
                                        }}
                                      >
                                        <p
                                          className="mb-1 text-xs font-semibold uppercase"
                                          style={{ color: "var(--text-muted)" }}
                                        >
                                          Conversation
                                        </p>
                                        <p
                                          className="whitespace-pre-wrap text-sm"
                                          style={{
                                            color: "var(--text-secondary)",
                                          }}
                                        >
                                          {request.messageText}
                                        </p>
                                      </div>
                                    ) : (
                                      <p
                                        className="mt-3 rounded-lg p-3 text-sm"
                                        style={{
                                          backgroundColor:
                                            "var(--bg-secondary)",
                                          color: "var(--text-muted)",
                                        }}
                                      >
                                        Conversation hidden. Use Show
                                        conversations to view the captured
                                        WhatsApp chat.
                                      </p>
                                    )}

                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {contactLink && (
                                        <a
                                          href={contactLink}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            themed
                                          >
                                            <MessageCircle className="mr-1 h-4 w-4" />
                                            Reply
                                          </Button>
                                        </a>
                                      )}
                                      {request.orderId && (
                                        <Link
                                          href={`/orders/${request.orderId}`}
                                        >
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            themed
                                          >
                                            <ExternalLink className="mr-1 h-4 w-4" />
                                            View basket
                                          </Button>
                                        </Link>
                                      )}
                                      {!request.orderId &&
                                        request.listingId && (
                                          <Button
                                            size="sm"
                                            themed
                                            disabled={busyId === request.id}
                                            isLoading={busyId === request.id}
                                            onClick={() =>
                                              convertRequest(request)
                                            }
                                          >
                                            <ShoppingBag className="mr-1 h-4 w-4" />
                                            Create order
                                          </Button>
                                        )}
                                    </div>
                                  </div>
                                </div>

                                {!request.orderId && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {request.status !== "CONTACTED" && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        themed
                                        disabled={busyId === request.id}
                                        onClick={() =>
                                          updateStatus(request, "CONTACTED")
                                        }
                                      >
                                        <CheckCircle2 className="mr-1 h-4 w-4" />
                                        Mark contacted
                                      </Button>
                                    )}
                                    {request.status !== "NEW" &&
                                      request.listingId && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          themed
                                          disabled={busyId === request.id}
                                          onClick={() =>
                                            updateStatus(request, "NEW")
                                          }
                                        >
                                          Reopen
                                        </Button>
                                      )}
                                    {request.status !== "CLOSED" && (
                                      <Button
                                        size="sm"
                                        variant="danger"
                                        disabled={busyId === request.id}
                                        onClick={() =>
                                          updateStatus(request, "CLOSED")
                                        }
                                      >
                                        <XCircle className="mr-1 h-4 w-4" />
                                        Close
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

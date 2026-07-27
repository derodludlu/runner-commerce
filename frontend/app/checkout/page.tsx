"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MapPin, Package, Truck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { customersApi, ordersApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { getCartPricing, getItemPricing } from "@/lib/pricing";
import { parseProductMedia } from "@/lib/productMedia";

const FULFILMENT_OPTIONS = [
  { value: "COLLECTION", label: "Collect from runner" },
  { value: "DELIVERY_STATION", label: "Town delivery station" },
  { value: "PUBLIC_TRANSPORT", label: "Send by public transport" },
] as const;

type ItemChoice = { size: string; color: string; note: string };

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState("COLLECTION");
  const [fulfillmentLocation, setFulfillmentLocation] = useState("");
  const [fulfillmentContact, setFulfillmentContact] = useState("");
  const [fulfillmentNotes, setFulfillmentNotes] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [runnerPreferences, setRunnerPreferences] = useState<any[]>([]);
  const [choices, setChoices] = useState<Record<string, ItemChoice>>({});

  useEffect(() => {
    if (!user) {
      router.replace("/login?redirect=/checkout");
      return;
    }
    setCustomerPhone((current) => current || user.phone || "");
    if (items.length === 0) router.replace("/cart");
  }, [items.length, router, user]);

  useEffect(() => {
    if (!user) return;
    customersApi
      .getRunnerPreferences()
      .then((response) => setRunnerPreferences(response.data || []))
      .catch(() => setRunnerPreferences([]));
  }, [user]);

  const pricing = useMemo(() => getCartPricing(items, 0), [items]);
  const runnerGroups = useMemo(() => {
    return Object.values(
      items.reduce<
        Record<
          string,
          {
            runnerId: string;
            runnerName: string;
            city: string;
            items: typeof items;
          }
        >
      >((groups, item) => {
        const runnerId = item.listing.runnerId;
        const city = String(
          (item.product as any)?.shop?.procurementCity || "DURBAN",
        ).toUpperCase();
        const key = `${runnerId}:${city}`;
        if (!groups[key]) {
          groups[key] = {
            runnerId,
            runnerName: item.listing.runner?.user?.name || "Runner",
            city,
            items: [],
          };
        }
        groups[key].items.push(item);
        return groups;
      }, {}),
    );
  }, [items]);

  const updateChoice = (
    listingId: string,
    field: keyof ItemChoice,
    value: string,
  ) => {
    setChoices((current) => ({
      ...current,
      [listingId]: {
        size: current[listingId]?.size || "",
        color: current[listingId]?.color || "",
        note: current[listingId]?.note || "",
        [field]: value,
      },
    }));
  };

  const submitOrders = async () => {
    if (!user || busy) return;
    if (!customerPhone.trim() || !fulfillmentLocation.trim()) {
      toast.error("Add your WhatsApp number and handover location");
      return;
    }
    const overrideGroups = runnerGroups.filter((group) => {
      const preference = runnerPreferences.find(
        (item) => item.city === group.city && item.status === "MATCHED",
      );
      return !preference || preference.runnerId !== group.runnerId;
    });
    if (overrideGroups.length > 0) {
      const runnerList = overrideGroups
        .map(
          (group) =>
            `${group.runnerName} for ${group.city[0] + group.city.slice(1).toLowerCase()}`,
        )
        .join(", ");
      const confirmed = window.confirm(
        `These items came through ${runnerList}. This may differ from your trusted runner setup. Continue with this runner?`,
      );
      if (!confirmed) return;
    }

    setBusy(true);
    const createdOrderIds: string[] = [];
    try {
      for (const group of runnerGroups) {
        const response = await ordersApi.create({
          customerPhone: customerPhone.trim(),
          customerName: user.name,
          items: group.items.map((item) => ({
            listingId: item.listing.id,
            productId: item.product.id,
            quantity: item.quantity,
            customerImageUrls: item.customerImageUrls || [],
            selectedSize: choices[item.listing.id]?.size || undefined,
            selectedColor: choices[item.listing.id]?.color || undefined,
            customerNote: choices[item.listing.id]?.note || undefined,
          })),
          shippingAddress: {
            street: fulfillmentLocation.trim(),
            city: fulfillmentLocation.trim(),
            state: "",
            zipCode: "",
            country: "Eswatini",
          },
          fulfillmentMethod,
          fulfillmentLocation: fulfillmentLocation.trim(),
          fulfillmentContact: fulfillmentContact.trim() || customerPhone.trim(),
          fulfillmentNotes: fulfillmentNotes.trim() || undefined,
          notes: fulfillmentNotes.trim() || undefined,
          trustedRunnerOverrideConfirmed: overrideGroups.some(
            (overrideGroup) =>
              overrideGroup.runnerId === group.runnerId &&
              overrideGroup.city === group.city,
          ),
          trustedRunnerOverrideReason: overrideGroups.some(
            (overrideGroup) =>
              overrideGroup.runnerId === group.runnerId &&
              overrideGroup.city === group.city,
          )
            ? "Customer confirmed checkout through runner storefront link"
            : undefined,
        });

        const order = response.data;
        createdOrderIds.push(order.id);
      }

      await clearCart();
      toast.success(
        createdOrderIds.length === 1
          ? "Order sent to your runner for acceptance"
          : `${createdOrderIds.length} runner orders created`,
      );
      router.push(
        createdOrderIds.length === 1
          ? `/orders/${createdOrderIds[0]}`
          : "/orders",
      );
    } catch (error: any) {
      const message = Array.isArray(error.response?.data?.message)
        ? error.response.data.message.join(", ")
        : error.response?.data?.message;
      toast.error(message || "Could not place the order");
      if (createdOrderIds.length > 0) {
        toast.info(
          "Some runner orders were created. Check My Orders before retrying.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  if (!user || items.length === 0) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
          Phase 2 order workflow
        </p>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Confirm your order
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Your trusted runner reviews the order first. Payment is requested only
          after acceptance.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className="space-y-6">
          <section
            className="rounded-lg border p-5"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <h2
              className="mb-4 flex items-center gap-2 font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              <Package className="h-5 w-5" /> Item details
            </h2>
            <div className="space-y-5">
              {items.map((item) => {
                const productImage = parseProductMedia(item.product.images)[0];
                return (
                  <div
                    key={item.listing.id}
                    className="grid gap-3 border-b pb-5 last:border-b-0 last:pb-0 sm:grid-cols-[72px_1fr]"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    <div className="aspect-square overflow-hidden rounded-md bg-black/5">
                      {productImage && (
                        <img
                          src={productImage}
                          alt={item.product.name}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p
                            className="font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {item.product.name}
                          </p>
                          <p
                            className="text-sm"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Quantity {item.quantity}
                          </p>
                        </div>
                        <p
                          className="font-semibold"
                          style={{ color: "var(--accent)" }}
                        >
                          {formatCurrency(
                            getItemPricing(
                              item.product,
                              item.listing,
                              item.quantity,
                            ).finalSubtotal,
                          )}
                        </p>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <input
                          value={choices[item.listing.id]?.size || ""}
                          onChange={(event) =>
                            updateChoice(
                              item.listing.id,
                              "size",
                              event.target.value,
                            )
                          }
                          placeholder="Size"
                          className="rounded-md border px-3 py-2 text-sm"
                        />
                        <input
                          value={choices[item.listing.id]?.color || ""}
                          onChange={(event) =>
                            updateChoice(
                              item.listing.id,
                              "color",
                              event.target.value,
                            )
                          }
                          placeholder="Colour"
                          className="rounded-md border px-3 py-2 text-sm"
                        />
                        <input
                          value={choices[item.listing.id]?.note || ""}
                          onChange={(event) =>
                            updateChoice(
                              item.listing.id,
                              "note",
                              event.target.value,
                            )
                          }
                          placeholder="Item note"
                          className="rounded-md border px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className="rounded-lg border p-5"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <h2
              className="mb-4 flex items-center gap-2 font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              <Truck className="h-5 w-5" /> Handover
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {FULFILMENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFulfillmentMethod(option.value)}
                  className="min-h-12 rounded-md border px-3 py-2 text-sm font-medium"
                  style={{
                    borderColor:
                      fulfillmentMethod === option.value
                        ? "var(--accent)"
                        : "var(--card-border)",
                    color: "var(--text-primary)",
                    background:
                      fulfillmentMethod === option.value
                        ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                        : "transparent",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                WhatsApp number
                <input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="+268 76..."
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
              <label
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> Location / station / town
                </span>
                <input
                  value={fulfillmentLocation}
                  onChange={(event) =>
                    setFulfillmentLocation(event.target.value)
                  }
                  placeholder="Manzini, Mbabane, collection point..."
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
              <label
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Transport or alternate contact
                <input
                  value={fulfillmentContact}
                  onChange={(event) =>
                    setFulfillmentContact(event.target.value)
                  }
                  placeholder="Bus, driver, phone (optional)"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
              <label
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Handover instructions
                <input
                  value={fulfillmentNotes}
                  onChange={(event) => setFulfillmentNotes(event.target.value)}
                  placeholder="Optional note"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
            </div>
          </section>

          <section
            className="rounded-lg border p-5"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <h2
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Payment comes after acceptance
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              Your runner will confirm the order and amount. Runner Commerce
              will then notify you to submit the payment reference or proof.
            </p>
          </section>
        </div>

        <aside
          className="h-fit rounded-lg border p-5 lg:sticky lg:top-20"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Order summary
          </h2>
          <div className="mt-4 space-y-3 text-sm">
            <div
              className="flex justify-between"
              style={{ color: "var(--text-secondary)" }}
            >
              <span>Shop prices</span>
              <span>{formatCurrency(pricing.shopSubtotal)}</span>
            </div>
            <div
              className="flex justify-between"
              style={{ color: "var(--text-secondary)" }}
            >
              <span>Runner fees</span>
              <span>{formatCurrency(pricing.runnerFeeTotal)}</span>
            </div>
            <div
              className="flex justify-between border-t pt-3 text-lg font-bold"
              style={{
                color: "var(--text-primary)",
                borderColor: "var(--card-border)",
              }}
            >
              <span>Total</span>
              <span>{formatCurrency(pricing.total)}</span>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            {runnerGroups.map((group) => (
              <div
                key={`${group.runnerId}:${group.city}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--card-border)" }}
              >
                <span style={{ color: "var(--text-primary)" }}>
                  {group.runnerName} ·{" "}
                  {group.city[0] + group.city.slice(1).toLowerCase()}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {group.items.length} item{group.items.length === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
          {runnerGroups.length > 1 && (
            <p
              className="mt-3 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              A separate order is created for each runner so payment, buying,
              and handover stay accountable.
            </p>
          )}
          <button
            type="button"
            onClick={submitOrders}
            disabled={busy}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-4 font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            <CheckCircle2 className="h-5 w-5" />{" "}
            {busy ? "Submitting..." : "Place order"}
          </button>
        </aside>
      </div>
    </div>
  );
}

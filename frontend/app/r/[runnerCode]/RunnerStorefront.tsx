"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, MessageCircle, Package, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { runnerApi } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { formatCurrency } from "@/lib/currency";
import { isVideoMedia, parseProductMedia } from "@/lib/productMedia";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { Product, RunnerListing } from "@/lib/types";

type PublicRunner = {
  id: string;
  publicCode: string;
  name?: string;
  phone?: string;
  whatsappLink?: string;
  serviceArea?: string;
  vehicleType?: string;
  rating?: number;
  serviceCities?: Array<{ city: string; active?: boolean }>;
};

type StorefrontResponse = {
  runner: PublicRunner;
  listings: Array<RunnerListing & { product: Product }>;
  deepLinkOrderCode?: string | null;
};

export default function RunnerStorefront({
  runnerCode,
  orderCode,
}: {
  runnerCode: string;
  orderCode?: string;
}) {
  const { addItem } = useCart();
  const [data, setData] = useState<StorefrontResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    runnerApi
      .getPublicRunner(runnerCode, orderCode)
      .then((response) => {
        if (mounted) setData(response.data);
      })
      .catch((err) => {
        const message =
          err?.response?.status === 404
            ? "Runner link not found or inactive"
            : "Unable to load this runner shop right now";
        if (mounted) setError(message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [runnerCode, orderCode]);

  const listings = useMemo(() => {
    const items = data?.listings || [];
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((listing) => {
      const product = listing.product;
      return [product?.name, product?.description, product?.category, product?.shop?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [data?.listings, query]);

  const shopLink = typeof window === "undefined" ? "" : window.location.href;

  const copyLink = async () => {
    if (!shopLink) return;
    await navigator.clipboard.writeText(shopLink);
    toast.success("Link copied");
  };

  const addListing = async (listing: RunnerListing & { product: Product }) => {
    setAddingId(listing.id);
    try {
      await addItem(listing, listing.product, 1);
    } finally {
      setAddingId("");
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-lg border p-8 text-center" style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}>
          Loading runner shop...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-lg border p-8" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Runner shop unavailable</h1>
          <p className="mt-2" style={{ color: "var(--text-secondary)" }}>{error || "This runner link is not available."}</p>
          <Link className="mt-5 inline-block font-semibold" href="/products" style={{ color: "var(--accent)" }}>Browse all products</Link>
        </div>
      </main>
    );
  }

  const runner = data.runner;
  const cities = (runner.serviceCities || []).map((item) => item.city).filter(Boolean);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <section className="rounded-lg border p-5" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Runner Commerce</p>
            <h1 className="mt-1 text-3xl font-bold" style={{ color: "var(--text-primary)" }}>{runner.name || "Runner shop"}</h1>
            <p className="mt-2 max-w-2xl" style={{ color: "var(--text-secondary)" }}>
              Browse this runner's active listings and checkout through the web app. WhatsApp is still available if you need help.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--card-border)" }}>{runner.publicCode}</span>
              {runner.serviceArea && <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--card-border)" }}>{runner.serviceArea}</span>}
              {cities.slice(0, 3).map((city) => (
                <span key={city} className="rounded-full border px-3 py-1" style={{ borderColor: "var(--card-border)" }}>{city}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyLink} className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </button>
            {runner.whatsappLink && (
              <a href={runner.whatsappLink} className="inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-white" style={{ background: "#16a34a" }}>
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp help
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this runner's listings"
            className="w-full rounded-md border py-2 pl-9 pr-3 text-sm"
            style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
          />
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {listings.length} active listing{listings.length === 1 ? "" : "s"}
        </p>
      </div>

      {listings.length === 0 ? (
        <section className="rounded-lg border p-8 text-center" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
          <Package className="mx-auto h-10 w-10" style={{ color: "var(--text-muted)" }} />
          <h2 className="mt-3 text-lg font-bold" style={{ color: "var(--text-primary)" }}>No matching listings</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {data.deepLinkOrderCode ? "That item is not available from this runner right now." : "This runner has no active public listings right now."}
          </p>
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              adding={addingId === listing.id}
              onAdd={() => addListing(listing)}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function ListingCard({
  listing,
  adding,
  onAdd,
}: {
  listing: RunnerListing & { product: Product };
  adding: boolean;
  onAdd: () => void;
}) {
  const product = listing.product;
  const importMedia = parseProductMedia((product?.whatsappImports?.[0] as any)?.mediaUrls);
  const media = importMedia.length > 0 ? importMedia : parseProductMedia(product?.images);
  const firstMedia = media[0] ? resolveMediaUrl(media[0], product?.updatedAt) : "";

  return (
    <article className="overflow-hidden rounded-lg border" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
      <div className="aspect-square bg-zinc-100">
        {firstMedia ? (
          isVideoMedia(firstMedia) ? (
            <video src={firstMedia} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <img src={firstMedia} alt={product?.name || "Product"} className="h-full w-full object-cover" />
          )
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-12 w-12 text-zinc-300" />
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h2 className="line-clamp-2 min-h-12 font-bold" style={{ color: "var(--text-primary)" }}>{product?.name || "Product"}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{product?.shop?.name || "Shop"}</p>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Runner price</p>
            <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{formatCurrency(listing.runnerPrice)}</p>
          </div>
          {listing.orderCode && (
            <span className="rounded-md border px-2 py-1 font-mono text-xs" style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}>
              {listing.orderCode}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          className="inline-flex w-full items-center justify-center rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          <ShoppingBag className="mr-2 h-4 w-4" />
          {adding ? "Adding..." : "Add to cart"}
        </button>
      </div>
    </article>
  );
}

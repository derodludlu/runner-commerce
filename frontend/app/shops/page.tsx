import Link from "next/link";
import { shopsApi } from "@/lib/api";
import ShopWhatsAppAvatars from "@/components/shops/ShopWhatsAppAvatars";
import { ArrowRight, Package, Phone, Search, X } from "lucide-react";

export const revalidate = 60;

export default async function ShopsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = String((await searchParams)?.q || "").trim();
  const shops = await shopsApi
    .getAll({
      limit: 100,
      status: "ACTIVE",
      sortBy: "name",
      order: "asc",
    })
    .then(
      (res) => res.data.data || res.data || [],
      () => [],
    );

  const filteredShops = query
    ? shops.filter((shop: any) =>
        [shop.name, shop.description, shop.phone, shop.address]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query.toLowerCase())),
      )
    : shops;

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Shops
        </h1>
        <p className="mt-2" style={{ color: "var(--text-secondary)" }}>
          Browse active shops and discover products from local sellers.
        </p>
      </div>

      <form method="get" className="flex max-w-2xl gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search shops by name, description, phone, or address"
            className="w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm"
            style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--card-border)", color: "var(--text-primary)" }}
          />
        </div>
        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white">Search</button>
        {query && (
          <Link href="/shops" className="inline-flex items-center justify-center rounded-lg border px-3" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }} title="Clear search">
            <X className="h-4 w-4" />
          </Link>
        )}
      </form>

      {filteredShops.length > 0 ? (
        <div className="space-y-4">
          {filteredShops.map((shop: any) => (
            <div
              key={shop.id}
              className="overflow-hidden rounded-xl border transition-shadow hover:shadow-lg"
              style={{
                backgroundColor: "var(--card-bg)",
                borderColor: "var(--card-border)",
              }}
            >
              <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
                <div className="min-w-0">
                  <h2
                    className="text-xl font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {shop.name}
                  </h2>
                  <ShopWhatsAppAvatars
                    shopName={shop.name}
                    groups={shop.relatedWhatsAppGroups}
                    variant="feature"
                    max={3}
                    className="mt-4"
                  />
                  <p
                    className="mt-4 max-w-3xl text-sm leading-6"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {shop.description || "No description available."}
                  </p>
                  <div
                    className="mt-4 flex flex-wrap gap-3 text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-4 w-4" />
                      {shop.phone || "No phone"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Package className="h-4 w-4" />
                      {shop._count?.products || 0} products
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 lg:items-stretch">
                  <Link
                    href={`/products?shopId=${encodeURIComponent(shop.id)}`}
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-black/20 bg-zinc-900 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
                    style={{ color: "#ffffff" }}
                  >
                    View products
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                  <div
                    className="rounded-lg border px-3 py-2 text-center text-xs font-semibold"
                    style={{
                      borderColor: "var(--card-border)",
                      color: "var(--text-secondary)",
                      backgroundColor: "var(--bg-primary)",
                    }}
                  >
                    Shop products only
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: "var(--text-secondary)" }}>
          {query ? `No shops match “${query}”.` : "No shops are available yet."}
        </p>
      )}
    </div>
  );
}

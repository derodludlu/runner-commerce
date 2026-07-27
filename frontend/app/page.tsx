import Link from "next/link";
import {
  ClipboardCheck,
  MessageCircle,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { productsApi } from "@/lib/api";
import ProductCard from "@/components/products/ProductCard";
import { HomeActions } from "@/components/home/HomeActions";
import { parseProductMedia } from "@/lib/productMedia";

export const dynamic = "force-dynamic";

export default async function Home() {
  const products = await productsApi
    .getAll({ limit: 8, status: "ACTIVE" })
    .then(
      (res) => res.data.data,
      () => [],
    );
  const heroImage = products
    .map((product: any) => parseProductMedia(product.images)[0])
    .find(Boolean);

  return (
    <div className="space-y-12 pb-12">
      <section
        className="relative left-1/2 flex min-h-[68vh] w-screen -translate-x-1/2 items-end overflow-hidden border-b"
        style={{
          borderColor: "var(--card-border)",
          backgroundColor: "#18181b",
          backgroundImage: heroImage ? `url(${heroImage})` : undefined,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-0 bg-black/65" aria-hidden="true" />
        <div className="container relative mx-auto w-full px-5 pb-12 pt-24 sm:px-8">
          <div className="max-w-3xl text-white">
            <h1 className="text-4xl font-bold sm:text-6xl">Runner Commerce</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-100 sm:text-xl">
              WhatsApp product reposting and organised order management for
              runners, shops, and customers.
            </p>
            <HomeActions />
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4">
        <div className="grid gap-6 md:grid-cols-4">
          {[
            {
              icon: MessageCircle,
              title: "Capture",
              text: "Capture original product posts and media from approved shop WhatsApp groups.",
            },
            {
              icon: RefreshCw,
              title: "Repost",
              text: "Repost product adverts to runner or shop groups with controlled schedules and tracking.",
            },
            {
              icon: ClipboardCheck,
              title: "Order",
              text: "Customers order through a runner they already know and trust, with runner payment verification.",
            },
            {
              icon: PackageCheck,
              title: "Fulfil",
              text: "Buy shop by shop, pack per customer, then track collection, delivery, or public transport.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="border-t-2 pt-5"
              style={{ borderColor: "var(--accent)" }}
            >
              <Icon className="h-6 w-6" style={{ color: "var(--accent)" }} />
              <h2
                className="mt-4 text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {title}
              </h2>
              <p
                className="mt-2 text-sm leading-6"
                style={{ color: "var(--text-secondary)" }}
              >
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2
              className="text-3xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Recently captured products
            </h2>
            <p className="mt-2" style={{ color: "var(--text-secondary)" }}>
              Products available through runners and their joined shops.
            </p>
          </div>
          <Link
            href="/products"
            className="font-semibold underline"
            style={{ color: "var(--accent)" }}
          >
            View all products
          </Link>
        </div>
        {products.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="py-10" style={{ color: "var(--text-secondary)" }}>
            No active products are available yet.
          </p>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1
        className="text-3xl font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        Help
      </h1>
      <div
        className="rounded-xl border p-6 space-y-4"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <p style={{ color: "var(--text-secondary)" }}>
          Use Products to browse items, Cart to review selections, Orders to
          track purchases, and Support if you need help with an order.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/products"
            className="font-semibold hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Browse products
          </Link>
          <Link
            href="/support"
            className="font-semibold hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}

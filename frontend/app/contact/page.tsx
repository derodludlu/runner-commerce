import Link from "next/link";

export default function ContactPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1
        className="text-3xl font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        Contact
      </h1>
      <div
        className="rounded-xl border p-6 space-y-4"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <p style={{ color: "var(--text-secondary)" }}>
          For order issues, delivery questions, or account support, open a
          support ticket from your account.
        </p>
        <Link
          href="/support"
          className="inline-block font-semibold hover:underline"
          style={{ color: "var(--accent)" }}
        >
          Open support
        </Link>
      </div>
    </div>
  );
}

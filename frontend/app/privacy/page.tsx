export default function PrivacyPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1
        className="text-3xl font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        Privacy
      </h1>
      <div
        className="rounded-xl border p-6 space-y-4"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <p style={{ color: "var(--text-secondary)" }}>
          Runner Commerce stores account, order, delivery, and support details
          needed to operate the marketplace experience. Keep production secrets
          and payment credentials outside source control.
        </p>
        <p style={{ color: "var(--text-secondary)" }}>
          This development page is a placeholder for a full production privacy
          policy.
        </p>
      </div>
    </div>
  );
}

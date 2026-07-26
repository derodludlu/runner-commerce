"use client";

import { useEffect, useState } from "react";
import { Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function AccountDetailsPage() {
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth();
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name || "",
      phone: user.phone || "",
      email: user.email || "",
    });
  }, [user]);

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated || !user) return null;

  const updateField =
    (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setErrorMessage(null);
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSaving(true);
    try {
      await authApi.updateMe({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
      });
      await refreshUser();
      toast.success("Account details updated");
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        "Account details could not be updated.";
      setErrorMessage(Array.isArray(message) ? message.join(" ") : message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <section
        className="rounded-lg border p-6 shadow-sm"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--card-border)",
        }}
      >
        <h1
          className="flex items-center gap-2 text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          <UserRound className="h-6 w-6" />
          Account Details
        </h1>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
            >
              {errorMessage}
            </div>
          )}

          <label className="block text-sm font-semibold">
            <span style={{ color: "var(--text-primary)" }}>Full name</span>
            <input
              type="text"
              value={form.name}
              onChange={updateField("name")}
              minLength={2}
              maxLength={120}
              required
              className="mt-2 w-full rounded-md border px-3 py-2"
              style={{
                backgroundColor: "var(--input-bg)",
                borderColor: "var(--input-border)",
                color: "var(--text-primary)",
              }}
            />
          </label>

          <label className="block text-sm font-semibold">
            <span style={{ color: "var(--text-primary)" }}>WhatsApp phone</span>
            <input
              type="tel"
              value={form.phone}
              onChange={updateField("phone")}
              minLength={8}
              maxLength={20}
              required
              className="mt-2 w-full rounded-md border px-3 py-2"
              style={{
                backgroundColor: "var(--input-bg)",
                borderColor: "var(--input-border)",
                color: "var(--text-primary)",
              }}
            />
          </label>

          <label className="block text-sm font-semibold">
            <span style={{ color: "var(--text-primary)" }}>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={updateField("email")}
              maxLength={180}
              className="mt-2 w-full rounded-md border px-3 py-2"
              style={{
                backgroundColor: "var(--input-bg)",
                borderColor: "var(--input-border)",
                color: "var(--text-primary)",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </section>
    </div>
  );
}

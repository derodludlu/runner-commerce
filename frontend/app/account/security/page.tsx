"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function AccountSecurityPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const response = await authApi.changePassword(
        currentPassword,
        newPassword,
      );
      const message =
        response.data?.message ||
        "Password changed successfully. Use the new password next time you sign in.";
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage(message);
      toast.success("Password changed successfully");
    } catch (error: any) {
      const message =
        error.response?.status === 429
          ? "Too many password-change attempts. Wait one minute and try again."
          : error.response?.data?.message ||
            "Password change failed. Check your current password and try again.";
      setErrorMessage(Array.isArray(message) ? message.join(" ") : message);
    } finally {
      setSaving(false);
    }
  };

  const required = searchParams.get("required") === "1";
  return (
    <div className="mx-auto max-w-lg">
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
          <KeyRound className="h-6 w-6" />
          Account Security
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {required
            ? "Replace the temporary password before continuing."
            : "Change your Runner Commerce password."}
        </p>

        {successMessage ? (
          <div className="mt-6 space-y-4">
            <div
              className="rounded-md border border-green-300 bg-green-50 p-4 text-green-900"
              role="status"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Password updated</p>
                  <p className="mt-1 text-sm">{successMessage}</p>
                  <p className="mt-1 text-sm">
                    Any temporary password or reset PIN is no longer valid.
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="w-full rounded-md px-4 py-3 text-sm font-bold text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Continue to Runner Commerce
            </button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            {errorMessage && (
              <div
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
              >
                {errorMessage}
              </div>
            )}
            {[
              [
                "Current or temporary password",
                currentPassword,
                setCurrentPassword,
              ],
              ["New password", newPassword, setNewPassword],
              ["Confirm new password", confirmPassword, setConfirmPassword],
            ].map(([label, value, setter]) => (
              <label
                key={label as string}
                className="block text-sm font-semibold"
              >
                <span style={{ color: "var(--text-primary)" }}>
                  {label as string}
                </span>
                <input
                  type={showPasswords ? "text" : "password"}
                  value={value as string}
                  onChange={(event) => {
                    setErrorMessage(null);
                    (setter as React.Dispatch<React.SetStateAction<string>>)(
                      event.target.value,
                    );
                  }}
                  minLength={label === "Current or temporary password" ? 6 : 8}
                  maxLength={128}
                  required
                  className="mt-2 w-full rounded-md border px-3 py-2"
                  style={{
                    backgroundColor: "var(--input-bg)",
                    borderColor: "var(--input-border)",
                    color: "var(--text-primary)",
                  }}
                />
              </label>
            ))}

            <button
              type="button"
              onClick={() => setShowPasswords((value) => !value)}
              className="inline-flex items-center gap-2 text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {showPasswords ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {showPasswords ? "Hide passwords" : "Show passwords"}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {saving ? "Changing..." : "Change Password"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

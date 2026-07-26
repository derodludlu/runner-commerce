"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function errorMessage(error: any, fallback: string) {
  if (error?.response?.status === 429) {
    return "Too many reset attempts. Wait 15 minutes before trying again.";
  }
  const message = error?.response?.data?.message;
  return Array.isArray(message) ? message.join(" ") : message || fallback;
}

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [requested, setRequested] = useState(false);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const requestPin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const response = await authApi.forgotPassword(identifier);
      const text =
        response.data?.message ||
        "If the account exists, a reset PIN has been sent.";
      setRequested(true);
      setFeedback({ type: "success", text });
      toast.success("Reset request received");
    } catch (error: any) {
      setFeedback({
        type: "error",
        text: errorMessage(error, "Could not request a reset PIN"),
      });
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    if (newPassword !== confirmPassword) {
      setFeedback({ type: "error", text: "New passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      const response = await authApi.resetPassword(
        identifier,
        pin,
        newPassword,
      );
      setComplete(true);
      setFeedback({
        type: "success",
        text: response.data?.message || "Password reset successful.",
      });
      toast.success("Password reset successful");
    } catch (error: any) {
      setFeedback({
        type: "error",
        text: errorMessage(error, "Could not reset password"),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <section
        className="rounded-lg border p-6 shadow-sm"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div
            className="rounded-md p-2"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            {complete ? (
              <CheckCircle2
                className="h-6 w-6"
                style={{ color: "var(--accent)" }}
              />
            ) : (
              <KeyRound
                className="h-6 w-6"
                style={{ color: "var(--accent)" }}
              />
            )}
          </div>
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Forgot Password
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {complete
                ? "Your password has been replaced."
                : "Recover access through your registered WhatsApp number."}
            </p>
          </div>
        </div>

        {feedback && (
          <div
            role="alert"
            className={`mb-4 rounded-md border px-3 py-2 text-sm ${feedback.type === "success" ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}
          >
            {feedback.text}
          </div>
        )}

        {complete ? (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              The one-time PIN is now invalid. Sign in using the new password
              you created.
            </p>
            <Link href="/login" className="block">
              <Button themed className="w-full">
                Return to Sign In
              </Button>
            </Link>
          </div>
        ) : !requested ? (
          <form onSubmit={requestPin} className="space-y-4">
            <label
              className="block text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Phone, email, or exact account name
              <Input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                className="mt-2"
                required
                autoComplete="username"
              />
            </label>
            <div
              className="flex gap-2 rounded-md border p-3 text-sm"
              style={{
                borderColor: "var(--card-border)",
                color: "var(--text-secondary)",
              }}
            >
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                A six-digit PIN will be queued through WhatsApp Bridge 1 and
                expires after 15 minutes.
              </span>
            </div>
            <Button
              type="submit"
              themed
              className="w-full"
              isLoading={busy}
              disabled={busy}
            >
              Send Reset PIN
            </Button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="space-y-4">
            <label
              className="block text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Six-digit PIN
              <Input
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                className="mt-2 text-center text-xl tracking-widest"
                required
                minLength={6}
                maxLength={6}
              />
            </label>
            {[
              {
                label: "New password",
                value: newPassword,
                setter: setNewPassword,
                autocomplete: "new-password",
              },
              {
                label: "Confirm new password",
                value: confirmPassword,
                setter: setConfirmPassword,
                autocomplete: "new-password",
              },
            ].map((field) => (
              <label
                key={field.label}
                className="block text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {field.label}
                <div className="relative mt-2">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={field.value}
                    onChange={(event) => field.setter(event.target.value)}
                    minLength={8}
                    maxLength={128}
                    autoComplete={field.autocomplete}
                    required
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center"
                    aria-label={
                      showPassword ? "Hide passwords" : "Show passwords"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </label>
            ))}
            <Button
              type="submit"
              themed
              className="w-full"
              isLoading={busy}
              disabled={busy || pin.length !== 6}
            >
              Reset Password
            </Button>
            <button
              type="button"
              className="w-full text-sm font-medium"
              style={{ color: "var(--accent)" }}
              onClick={() => {
                setRequested(false);
                setPin("");
                setFeedback(null);
              }}
            >
              Request another PIN
            </button>
          </form>
        )}

        {!complete && (
          <Link
            href="/login"
            className="mt-5 block text-center text-sm font-medium"
            style={{ color: "var(--accent)" }}
          >
            Back to sign in
          </Link>
        )}
      </section>
    </div>
  );
}

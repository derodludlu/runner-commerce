// frontend/app/login/page.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";
import { User, Mail, Phone, Lock, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { login } = useAuth();

  const getIdentifierType = () => {
    if (identifier.includes("@")) return "email";
    if (/^\+?[1-9]\d{0,14}$/.test(identifier.replace(/[\s-()]/g, "")))
      return "phone";
    return "text";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFeedback(null);

    try {
      const response = await login({ identifier, password });

      toast.success(`Welcome back, ${response.user.name}!`);
      if (response.user.mustChangePassword) {
        toast.info("Replace your temporary password before continuing.");
      }

      // Small delay to ensure localStorage is written
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Force full page reload to refresh auth state
      const redirectPath =
        new URLSearchParams(window.location.search).get("redirect") ||
        (response.user.role === "RUNNER" ? "/runner/dashboard" : "/");
      window.location.href = response.user.mustChangePassword
        ? "/account/security?required=1"
        : redirectPath;
    } catch (error: any) {
      const status = error.response?.status;
      const serverMessage = error.response?.data?.message;
      const message =
        status === 429
          ? "Too many sign-in attempts. Wait briefly, then try again or reset your password."
          : serverMessage === "Account is not active"
            ? "This account is not active. Contact Runner Commerce support."
            : status === 401
              ? "The login details do not match. Check your identifier and password, or use Forgot Password."
              : !error.response
                ? "Runner Commerce could not reach the server. Check your connection and try again."
                : Array.isArray(serverMessage)
                  ? serverMessage.join(" ")
                  : serverMessage || "Sign in failed. Please try again.";
      setFeedback(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const identifierType = getIdentifierType();
  const InputIcon =
    identifierType === "email"
      ? Mail
      : identifierType === "phone"
        ? Phone
        : User;

  return (
    <div className="max-w-md mx-auto">
      <div
        className="theme-card rounded-2xl shadow-2xl p-10"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <h1
          className="text-4xl font-bold text-center mb-3 tracking-tight"
          style={{
            background:
              "linear-gradient(135deg, var(--accent), var(--accent-hover))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Welcome Back
        </h1>
        <p
          className="text-center mb-8 text-lg"
          style={{ color: "var(--text-secondary)" }}
        >
          Sign in to continue your journey
        </p>

        {feedback && (
          <div
            role="alert"
            className="mb-5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            {feedback}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              className="block text-base font-semibold mb-2 uppercase tracking-wide"
              style={{ color: "var(--text-primary)" }}
            >
              Phone, Email, or Username
            </label>
            <div className="relative">
              <Input
                type={
                  identifierType === "phone"
                    ? "tel"
                    : identifierType === "email"
                      ? "email"
                      : "text"
                }
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setFeedback(null);
                }}
                placeholder="+1234567890 or user@example.com or John"
                required
                className="pl-12"
                style={{
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  borderColor: "var(--input-border)",
                }}
              />
              <InputIcon
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: "var(--accent)" }}
              />
            </div>
          </div>

          <div>
            <label
              className="block text-base font-semibold mb-2 uppercase tracking-wide"
              style={{ color: "var(--text-primary)" }}
            >
              Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFeedback(null);
                }}
                placeholder="••••••••"
                required
                className="pl-12 pr-12"
                style={{
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  borderColor: "var(--input-border)",
                }}
              />
              <Lock
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: "var(--accent)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md transition-colors hover:bg-black/5 focus:outline-none focus:ring-2"
                style={{ color: "var(--text-secondary)" }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            <div className="mt-2 text-right">
              <Link
                href="/forgot-password"
                className="text-sm font-semibold"
                style={{ color: "var(--accent)" }}
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full py-4 text-lg font-bold"
            isLoading={isLoading}
            themed
          >
            {isLoading ? "Signing In..." : "✦ Sign In"}
          </Button>
        </form>

        <div
          className="mt-6 rounded-lg border p-4 text-center"
          style={{
            borderColor: "var(--card-border)",
            backgroundColor: "var(--bg-primary)",
          }}
        >
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            New to Runner Commerce?
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link href="/register?next=runner" className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                Create Customer Account
              </Button>
            </Link>
            <Link href="/register" className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                Start Runner Application
              </Button>
            </Link>
          </div>
          <p
            className="mt-3 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Runner access is approved after your customer account is created.
          </p>
        </div>

        {process.env.NEXT_PUBLIC_SHOW_TEST_CREDENTIALS === "true" && (
          <div
            className="mt-8 text-center"
            style={{ color: "var(--text-secondary)" }}
          >
            <p className="text-sm font-semibold uppercase tracking-wide mb-3">
              Test Credentials
            </p>
            <div
              className="rounded-lg p-4 font-mono text-xs space-y-1"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--card-border)",
              }}
            >
              <p>📱 Phone: +10000000001 / password123</p>
              <p>👤 Name: Maria / password123</p>
              <p>📧 Email: john.customer@example.com / password123</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

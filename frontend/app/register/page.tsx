"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail,
  Phone,
  User,
  Lock,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const router = useRouter();
  const [continueToRunnerApplication, setContinueToRunnerApplication] =
    useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    preferredRunnerCity: "DURBAN",
    preferredRunnerPhone: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setContinueToRunnerApplication(params.get("next") === "runner");
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const response = await authApi.register({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        preferredRunnerCity: form.preferredRunnerCity,
        preferredRunnerPhone: form.preferredRunnerPhone.trim(),
      });

      document.cookie = `user_role=${response.user.role}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      toast.success(
        response.runnerPreference?.status === "MATCHED"
          ? "Account created and your trusted runner was matched."
          : "Account created. We do not have your runner yet; browsing is available while checkout waits for them to register.",
      );
      router.push(continueToRunnerApplication ? "/runner/register" : "/");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div
        className="theme-card rounded-2xl p-10 shadow-2xl"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <h1
          className="mb-3 text-center text-4xl font-bold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Create Account
        </h1>
        <p
          className="mb-8 text-center text-lg"
          style={{ color: "var(--text-secondary)" }}
        >
          Start as a customer. Runner and shop-owner access is approved later.
          {continueToRunnerApplication
            ? " After this step, you will complete the runner application."
            : ""}
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Full Name" icon={User}>
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Doreen Shabangu"
              required
              className="pl-12"
              style={{
                backgroundColor: "var(--input-bg)",
                color: "var(--text-primary)",
                borderColor: "var(--input-border)",
              }}
            />
          </Field>

          <Field label="WhatsApp Phone" icon={Phone}>
            <Input
              type="tel"
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              placeholder="+26876154884"
              required
              className="pl-12"
              style={{
                backgroundColor: "var(--input-bg)",
                color: "var(--text-primary)",
                borderColor: "var(--input-border)",
              }}
            />
          </Field>

          <Field label="Email Optional" icon={Mail}>
            <Input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="name@example.com"
              className="pl-12"
              style={{
                backgroundColor: "var(--input-bg)",
                color: "var(--text-primary)",
                borderColor: "var(--input-border)",
              }}
            />
          </Field>

          <Field label="Password" icon={Lock}>
            <Input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              placeholder="Minimum 6 characters"
              minLength={6}
              required
              className="pl-12 pr-12"
              style={{
                backgroundColor: "var(--input-bg)",
                color: "var(--text-primary)",
                borderColor: "var(--input-border)",
              }}
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
          </Field>

          <div>
            <label className="mb-2 block text-base font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
              Runner shopping city
            </label>
            <select
              value={form.preferredRunnerCity}
              onChange={(event) => setForm((current) => ({ ...current, preferredRunnerCity: event.target.value }))}
              className="theme-input min-h-12 w-full rounded-md border px-4"
              required
            >
              <option value="DURBAN">Durban</option>
              <option value="JOHANNESBURG">Johannesburg</option>
              <option value="MAPUTO">Maputo</option>
            </select>
          </div>

          <Field label="Trusted runner WhatsApp" icon={Phone}>
            <Input
              type="tel"
              value={form.preferredRunnerPhone}
              onChange={(event) => setForm((current) => ({ ...current, preferredRunnerPhone: event.target.value }))}
              placeholder="+26876154884"
              required
              className="pl-12"
              style={{ backgroundColor: "var(--input-bg)", color: "var(--text-primary)", borderColor: "var(--input-border)" }}
            />
          </Field>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            We match you to the runner you already know and trust. If they are not registered yet, you can browse while checkout waits for them to join.
          </p>

          <Button
            type="submit"
            className="w-full py-4 text-lg font-bold"
            isLoading={isLoading}
            themed
          >
            {isLoading ? "Creating Account..." : "Create Account"}
          </Button>
        </form>

        <p
          className="mt-6 text-center text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Already have an account?{" "}
          <Link href="/login" className="font-semibold underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        className="mb-2 block text-base font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </label>
      <div className="relative">
        {children}
        <Icon
          className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
          style={{ color: "var(--accent)" }}
        />
      </div>
    </div>
  );
}

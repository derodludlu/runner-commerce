"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import RunnerSidebar from "@/components/layout/RunnerSidebar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const dynamic = "force-dynamic";

export default function RunnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isRegistrationPage = pathname === "/runner/register";
  const { isReady } = useRoleGuard({
    roles: isRegistrationPage ? ["CUSTOMER"] : ["RUNNER"],
    requireRunnerEntity: !isRegistrationPage,
  });

  useEffect(() => {
    if (isReady && pathname === "/runner") {
      router.replace("/runner/dashboard");
    }
  }, [isReady, router, pathname]);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return isRegistrationPage ? (
    <>{children}</>
  ) : (
    <div
      className="flex min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <RunnerSidebar />
      <main
        className="flex-1 p-6"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        {children}
      </main>
    </div>
  );
}

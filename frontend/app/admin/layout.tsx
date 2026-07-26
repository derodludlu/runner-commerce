"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import AdminSidebar from "@/components/layout/AdminSidebar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isReady } = useRoleGuard({ roles: ["ADMIN", "SUPERUSER"] });
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Optional: redirect admin users from root admin path to dashboard
    if (isReady && pathname === "/admin") {
      router.replace("/admin/dashboard");
    }
  }, [isReady, router, pathname]);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <AdminSidebar />
      <main
        className="flex-1 p-6"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        {children}
      </main>
    </div>
  );
}

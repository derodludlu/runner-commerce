"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import ShopOwnerSidebar from "@/components/layout/ShopOwnerSidebar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const dynamic = "force-dynamic";

export default function ShopOwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isReady } = useRoleGuard({ roles: ["SHOP_OWNER", "SUPERUSER"] });
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Optional: redirect shop-owner users from root shop-owner path to dashboard
    if (isReady && pathname === "/shop-owner") {
      router.replace("/shop-owner/dashboard");
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
      <ShopOwnerSidebar />
      <main
        className="flex-1 p-6"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        {children}
      </main>
    </div>
  );
}

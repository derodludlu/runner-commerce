"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { getRoleHomePage } from "@/lib/rbac";
import type { UserRole } from "@/lib/rbac";

/**
 * Smart dashboard redirect page.
 * Redirects authenticated users to their role-specific dashboard:
 * - ADMIN -> /admin/dashboard
 * - SHOP_OWNER -> /shop-owner/dashboard
 * - RUNNER (with runner entity) -> /runner/dashboard
 * - RUNNER (without runner entity) -> /runner/register
 * - CUSTOMER, WAREHOUSE, or no role -> /
 */
export default function DashboardRedirectPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      // Not authenticated - redirect to login with redirect back to dashboard
      router.replace(`/login?redirect=${encodeURIComponent("/dashboard")}`);
      return;
    }

    // Get the role-specific home page
    const homePage = getRoleHomePage(user.role);

    // Special case: RUNNER role users need to have completed runner registration
    // Note: user.runner can be MinimalRunner (from auth) or full Runner (from runner endpoints)
    if (user.role === "RUNNER" && !user.runner) {
      router.replace("/runner/register");
      return;
    }

    // Redirect to role-appropriate dashboard
    router.replace(homePage);
  }, [isLoading, isAuthenticated, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}

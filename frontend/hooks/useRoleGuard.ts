"use client";

// hooks/useRoleGuard.ts
//
// Drop-in replacement for the repeated useEffect guard pattern spread across pages:
//
//   const { user, isReady } = useRoleGuard(["ADMIN"]);
//   if (!isReady) return <LoadingSpinner />;
//
// The hook handles: loading state, unauthenticated redirect, role check, and
// an optional runner-sub-entity check for runner-specific pages.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { hasRole, type UserRole } from "@/lib/rbac";

interface UseRoleGuardOptions {
  /** Roles permitted to access this page. Empty = any authenticated user. */
  roles?: UserRole[];
  /** If true, also checks that user.runner exists (runner registration check). */
  requireRunnerEntity?: boolean;
  /** Where to redirect when unauthenticated. Default: /login */
  loginRedirect?: string;
  /** Where to redirect when role doesn't match. Default: /unauthorized */
  unauthorizedRedirect?: string;
}

interface UseRoleGuardResult {
  /** The authenticated user, or null while loading. */
  user: ReturnType<typeof useAuth>["user"];
  /** True once auth state is resolved and the user is authorized. */
  isReady: boolean;
}

export function useRoleGuard(
  options: UseRoleGuardOptions = {},
): UseRoleGuardResult {
  const {
    roles = [],
    requireRunnerEntity = false,
    loginRedirect = "/login",
    unauthorizedRedirect = "/unauthorized",
  } = options;

  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    // 1. Must be authenticated
    if (!isAuthenticated || !user) {
      const current =
        typeof window !== "undefined" ? window.location.pathname : "";
      router.replace(
        `${loginRedirect}?redirect=${encodeURIComponent(current)}`,
      );
      return;
    }

    // 2. Role check (if specific roles are required)
    if (roles.length > 0 && !hasRole(user.role, roles)) {
      router.replace(unauthorizedRedirect);
      return;
    }

    // 3. Runner sub-entity check (user must have completed runner registration)
    // Note: user.runner can be MinimalRunner (from auth) or full Runner (from runner endpoints)
    if (requireRunnerEntity && !user.runner) {
      router.replace("/runner/register");
      return;
    }

    setIsReady(true);
  }, [
    isLoading,
    isAuthenticated,
    user,
    router,
    loginRedirect,
    unauthorizedRedirect,
    requireRunnerEntity,
  ]);

  return { user, isReady };
}

// Convenience wrappers for common role patterns
export const useAdminGuard = () => useRoleGuard({ roles: ["ADMIN"] });
export const useShopOwnerGuard = () => useRoleGuard({ roles: ["SHOP_OWNER"] });
export const useRunnerGuard = () =>
  useRoleGuard({ roles: ["RUNNER"], requireRunnerEntity: true });
export const useAuthGuard = () => useRoleGuard({ roles: [] });

"use client";

// components/guards/RoleGuard.tsx
//
// Declarative wrapper for RBAC protection. Suitable for use inside layouts
// or wherever you want to conditionally render content based on role.
//
// Usage:
//   <RoleGuard roles={["ADMIN"]}>
//     <AdminPanel />
//   </RoleGuard>
//
// The layout-level guards (app/admin/layout.tsx etc.) use the hook version
// for route-level protection. This component is for in-page conditional rendering.

import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/lib/rbac";
import { hasRole } from "@/lib/rbac";

interface RoleGuardProps {
  /** Roles that can see the children. */
  roles: UserRole[];
  /** Rendered while auth is loading. Default: null (nothing). */
  fallbackLoading?: React.ReactNode;
  /** Rendered when the user doesn't have the required role. Default: null. */
  fallbackUnauthorized?: React.ReactNode;
  children: React.ReactNode;
}

export default function RoleGuard({
  roles,
  fallbackLoading = null,
  fallbackUnauthorized = null,
  children,
}: RoleGuardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <>{fallbackLoading}</>;
  if (!user || !hasRole(user.role, roles)) return <>{fallbackUnauthorized}</>;

  return <>{children}</>;
}

// ─── Convenience variants ─────────────────────────────────────────────────────

export function AdminOnly({ children }: { children: React.ReactNode }) {
  return <RoleGuard roles={["ADMIN"]}>{children}</RoleGuard>;
}

export function ShopOwnerOnly({ children }: { children: React.ReactNode }) {
  return <RoleGuard roles={["SHOP_OWNER"]}>{children}</RoleGuard>;
}

export function RunnerOnly({ children }: { children: React.ReactNode }) {
  return <RoleGuard roles={["RUNNER"]}>{children}</RoleGuard>;
}

export function CustomerOnly({ children }: { children: React.ReactNode }) {
  return <RoleGuard roles={["CUSTOMER"]}>{children}</RoleGuard>;
}

export function StaffOnly({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard roles={["ADMIN", "SHOP_OWNER", "WAREHOUSE"]}>{children}</RoleGuard>
  );
}

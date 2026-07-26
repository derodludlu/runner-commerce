// lib/rbac.ts — Single source of truth for roles, permissions, and route guards

export type UserRole =
  "ADMIN" | "CUSTOMER" | "RUNNER" | "SHOP_OWNER" | "WAREHOUSE" | "SUPERUSER";

export const PHASE_2_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PHASE_2 === "true";

// ─── Route permission map ────────────────────────────────────────────────────
// Keys are route prefixes. Values are allowed roles (empty = any authenticated user).
// SUPERUSER has access to ALL routes by default (handled in middleware)
export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/admin": ["ADMIN", "SUPERUSER"],
  "/shop-owner": ["SHOP_OWNER", "SUPERUSER"],
  "/runner/register": ["CUSTOMER"],
  "/runner": ["RUNNER", "SUPERUSER"],
};

// Public routes — no auth required
export const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/forgot-password",
  "/register",
  "/r",
  "/products",
  "/shops",
  "/help",
  "/contact",
  "/privacy",
  "/unauthorized",
];

// Routes any authenticated user may access (role-agnostic)
export const AUTH_ROUTES = [
  "/orders",
  "/cart",
  "/checkout",
  "/wishlist",
  "/notifications",
  "/support",
  "/returns",
  "/dashboard",
  "/account/runners",
];

// ─── Role → default landing page ────────────────────────────────────────────
export const ROLE_HOME: Record<UserRole, string> = {
  ADMIN: "/admin/dashboard",
  SHOP_OWNER: "/shop-owner/dashboard",
  RUNNER: "/runner/dashboard",
  CUSTOMER: "/",
  WAREHOUSE: "/",
  SUPERUSER: "/admin/dashboard", // SUPERUSER redirects to admin dashboard
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function hasRole(
  userRole: UserRole | undefined,
  allowed: UserRole[],
): boolean {
  if (!userRole) return false;
  if (userRole === "SUPERUSER") return true;
  return allowed.includes(userRole);
}

export interface NavigationLink {
  href: string;
  label: string;
  scope: "public" | "authenticated";
  roles?: UserRole[];
  phase?: "phase1" | "phase2";
  requiresRunner?: boolean;
  hideWhenRunner?: boolean;
  priority?: "primary" | "secondary";
}

export const NAVIGATION_LINKS: NavigationLink[] = [
  {
    href: "/products",
    label: "Products",
    scope: "public",
    priority: "primary",
  },
  { href: "/shops", label: "Shops", scope: "public", priority: "primary" },
  {
    href: "/account/runners",
    label: "My Runners",
    scope: "authenticated",
    roles: ["CUSTOMER"],
    phase: "phase2",
    priority: "primary",
  },
  {
    href: "/orders",
    label: "Orders",
    scope: "authenticated",
    roles: ["CUSTOMER", "RUNNER", "ADMIN", "SUPERUSER"],
    phase: "phase2",
    priority: "primary",
  },
  {
    href: "/wishlist",
    label: "Wishlist",
    scope: "authenticated",
    roles: ["CUSTOMER"],
    phase: "phase2",
    priority: "secondary",
  },
  {
    href: "/notifications",
    label: "Notifications",
    scope: "authenticated",
    roles: ["CUSTOMER", "RUNNER", "SHOP_OWNER", "ADMIN", "SUPERUSER"],
    priority: "secondary",
  },
  {
    href: "/support",
    label: "Support",
    scope: "authenticated",
    roles: ["CUSTOMER", "RUNNER", "SHOP_OWNER"],
    priority: "secondary",
  },
  {
    href: "/returns",
    label: "Returns",
    scope: "authenticated",
    roles: ["CUSTOMER"],
    phase: "phase2",
    priority: "secondary",
  },
  {
    href: "/runner/register",
    label: "Become a Runner",
    scope: "authenticated",
    roles: ["CUSTOMER"],
    hideWhenRunner: true,
    priority: "primary",
  },
  {
    href: "/runner/phase1",
    label: "Setup & Marketplace",
    scope: "authenticated",
    roles: ["RUNNER"],
    requiresRunner: true,
    priority: "primary",
  },
  {
    href: "/runner/dashboard",
    label: "Runner",
    scope: "authenticated",
    roles: ["RUNNER"],
    requiresRunner: true,
    priority: "primary",
  },
  {
    href: "/runner/listings",
    label: "Listings",
    scope: "authenticated",
    roles: ["RUNNER"],
    requiresRunner: true,
    priority: "secondary",
  },
  {
    href: "/runner/order-requests",
    label: "WhatsApp Orders",
    scope: "authenticated",
    roles: ["RUNNER"],
    phase: "phase2",
    requiresRunner: true,
    priority: "secondary",
  },
  {
    href: "/runner/shopping-list",
    label: "Shopping List",
    scope: "authenticated",
    roles: ["RUNNER"],
    phase: "phase2",
    requiresRunner: true,
    priority: "secondary",
  },
  {
    href: "/runner/earnings",
    label: "Earnings",
    scope: "authenticated",
    roles: ["RUNNER"],
    phase: "phase2",
    requiresRunner: true,
    priority: "secondary",
  },
  {
    href: "/runner/billing",
    label: "Billing",
    scope: "authenticated",
    roles: ["RUNNER"],
    phase: "phase2",
    requiresRunner: true,
    priority: "secondary",
  },
  {
    href: "/shop-owner/dashboard",
    label: "My Shop",
    scope: "authenticated",
    roles: ["SHOP_OWNER"],
    priority: "primary",
  },
  {
    href: "/shop-owner/runners",
    label: "Runners",
    scope: "authenticated",
    roles: ["SHOP_OWNER"],
    priority: "primary",
  },
  {
    href: "/shop-owner/whatsapp-groups",
    label: "WhatsApp Groups",
    scope: "authenticated",
    roles: ["SHOP_OWNER"],
    priority: "primary",
  },
  {
    href: "/shop-owner/billing",
    label: "Billing",
    scope: "authenticated",
    roles: ["SHOP_OWNER"],
    priority: "secondary",
  },
  {
    href: "/admin/dashboard",
    label: "Admin",
    scope: "authenticated",
    roles: ["ADMIN", "SUPERUSER"],
    priority: "primary",
  },
  {
    href: "/admin/users",
    label: "Users",
    scope: "authenticated",
    roles: ["ADMIN", "SUPERUSER"],
    priority: "primary",
  },
  {
    href: "/admin/runners",
    label: "Runners",
    scope: "authenticated",
    roles: ["ADMIN", "SUPERUSER"],
    priority: "primary",
  },
  {
    href: "/admin/shops",
    label: "Shops Admin",
    scope: "authenticated",
    roles: ["ADMIN", "SUPERUSER"],
    priority: "primary",
  },
  {
    href: "/admin/whatsapp-groups",
    label: "WhatsApp Groups",
    scope: "authenticated",
    roles: ["ADMIN", "SUPERUSER"],
    priority: "primary",
  },
  {
    href: "/admin/coupons",
    label: "Coupons",
    scope: "authenticated",
    roles: ["ADMIN", "SUPERUSER"],
    phase: "phase2",
    priority: "secondary",
  },
  {
    href: "/admin/billing",
    label: "Billing",
    scope: "authenticated",
    roles: ["ADMIN", "SUPERUSER"],
    priority: "secondary",
  },
  {
    href: "/admin/development",
    label: "Development",
    scope: "authenticated",
    roles: ["ADMIN", "SUPERUSER"],
    priority: "secondary",
  },
];

export function canAccessNavigationLink(
  link: NavigationLink,
  context: {
    isAuthenticated: boolean;
    role?: UserRole;
    hasRunner?: boolean;
    phase2Enabled?: boolean;
  },
): boolean {
  if (link.phase === "phase2" && !(context.phase2Enabled ?? PHASE_2_ENABLED))
    return false;
  if (link.scope === "authenticated" && !context.isAuthenticated) return false;
  if (link.roles && (!context.role || !link.roles.includes(context.role))) {
    return false;
  }
  if (link.requiresRunner && !context.hasRunner) return false;
  if (link.hideWhenRunner && context.hasRunner) return false;
  return true;
}

export function getRequiredRoles(pathname: string): UserRole[] | null {
  for (const [prefix, roles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname.startsWith(prefix)) return roles;
  }
  return null; // no specific role required
}

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case "SUPERUSER":
      return "Superuser";
    case "ADMIN":
      return "Administrator";
    case "SHOP_OWNER":
      return "Shop Owner";
    case "RUNNER":
      return "Runner";
    case "CUSTOMER":
      return "Customer";
    case "WAREHOUSE":
      return "Warehouse";
  }
}

export function getRoleHomePage(role: UserRole): string {
  return ROLE_HOME[role] || "/";
}

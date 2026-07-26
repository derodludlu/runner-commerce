// frontend/components/layout/Header.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useTheme } from "@/context/ThemeContext";
import { useFeatureFlags } from "@/context/FeatureFlagsContext";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  Coins,
  Heart,
  LayoutDashboard,
  KeyRound,
  List,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Tag,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  canAccessNavigationLink,
  getRoleHomePage,
  NAVIGATION_LINKS,
  roleLabel,
  type NavigationLink,
} from "@/lib/rbac";

const NAV_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/admin/dashboard": ShieldCheck,
  "/admin/users": Users,
  "/admin/runners": Users,
  "/admin/shops": Store,
  "/admin/development": SlidersHorizontal,
  "/admin/coupons": Tag,
  "/orders": Package,
  "/wishlist": Heart,
  "/notifications": Bell,
  "/support": MessageSquare,
  "/returns": RotateCcw,
  "/account": User,
  "/account/security": KeyRound,
  "/runner/register": User,
  "/runner/dashboard": LayoutDashboard,
  "/runner/phase1": Store,
  "/runner/listings": List,
  "/runner/earnings": Coins,
  "/shop-owner/dashboard": Store,
  "/shop-owner/runners": Users,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  compact = false,
  onClick,
}: {
  item: NavigationLink;
  active: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const Icon = NAV_ICONS[item.href];

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex min-h-10 items-center gap-2 rounded-md transition-colors hover:opacity-80 ${
        compact ? "px-3 py-2 text-sm" : "px-3 py-2 text-sm font-medium"
      }`}
      style={{
        color: active ? "var(--accent)" : "var(--text-primary)",
        backgroundColor: active ? "var(--bg-primary)" : undefined,
      }}
      aria-current={active ? "page" : undefined}
      title={item.label}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout, stopImpersonation } = useAuth();
  const { itemCount } = useCart();
  const { theme, toggleTheme } = useTheme();
  const { phase2Enabled } = useFeatureFlags();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  const navItems = useMemo(
    () =>
      NAVIGATION_LINKS.filter((item) =>
        canAccessNavigationLink(item, {
          isAuthenticated,
          role: user?.role,
          hasRunner: Boolean(user?.runner),
          phase2Enabled,
        }),
      ),
    [isAuthenticated, phase2Enabled, user?.role, user?.runner],
  );

  const primaryNav = navItems.filter((item) => item.priority !== "secondary");
  const secondaryNav = navItems.filter((item) => item.priority === "secondary");
  const showCart =
    phase2Enabled && (!isAuthenticated || user?.role === "CUSTOMER");

  const themeCode = theme
    .split("-")
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-lg"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--card-border)",
      }}
    >
      {user?.impersonation?.active && (
        <div className="border-b border-amber-300 bg-amber-100 text-amber-950">
          <div className="container mx-auto flex min-h-10 flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <div className="font-semibold">
              Operating as {user.name || user.phone} ({roleLabel(user.role)})
            </div>
            <button
              type="button"
              onClick={stopImpersonation}
              className="rounded border border-amber-400 bg-white px-3 py-1 text-xs font-bold text-amber-950 transition-colors hover:bg-amber-50"
            >
              Exit impersonation
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto flex min-h-16 items-center gap-3 px-4">
        <Link
          href={isAuthenticated && user ? getRoleHomePage(user.role) : "/"}
          className="shrink-0 text-lg font-bold tracking-wide md:text-xl"
          style={{ color: "var(--accent)" }}
        >
          Runner Commerce
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
          {primaryNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {showCart && (
            <Link
              href="/cart"
              className="relative flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:opacity-80"
              style={{ color: "var(--text-primary)" }}
              title="Cart"
            >
              <ShoppingBag className="h-5 w-5" />
              {itemCount > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
                  style={{ background: "var(--accent)" }}
                >
                  {itemCount}
                </span>
              )}
            </Link>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="hidden h-10 items-center rounded-md border px-3 text-xs font-semibold transition-colors hover:opacity-80 sm:flex"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--card-border)",
              color: "var(--text-primary)",
            }}
            title={`Theme: ${theme}`}
          >
            {themeCode}
          </button>

          {isAuthenticated && user ? (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                className="flex h-10 max-w-56 items-center gap-2 rounded-md border px-3 text-sm transition-colors hover:opacity-80"
                style={{
                  borderColor: "var(--card-border)",
                  color: "var(--text-primary)",
                  backgroundColor: "var(--bg-primary)",
                }}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
              >
                <span className="min-w-0 truncate">{user.name}</span>
                <ChevronDown className="h-4 w-4 shrink-0" />
              </button>

              {accountOpen && (
                <div
                  className="absolute right-0 mt-2 w-64 rounded-md border p-2 shadow-xl"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--card-border)",
                  }}
                  role="menu"
                >
                  <div
                    className="border-b px-3 py-2"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    <div
                      className="truncate text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {user.name}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {roleLabel(user.role)}
                    </div>
                  </div>

                  <div className="py-2">
                    {secondaryNav.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        compact
                        active={isActive(pathname, item.href)}
                      />
                    ))}
                    {secondaryNav.length === 0 && (
                      <Link
                        href={getRoleHomePage(user.role)}
                        className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </Link>
                    )}
                    <Link
                      href="/account"
                      className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:opacity-80"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <User className="h-4 w-4" />
                      Account Details
                    </Link>
                    <Link
                      href="/account/security"
                      className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:opacity-80"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <KeyRound className="h-4 w-4" />
                      Account Security
                    </Link>
                    <Link
                      href="/help"
                      className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:opacity-80"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <CircleHelp className="h-4 w-4" />
                      Help
                    </Link>
                  </div>

                  <button
                    type="button"
                    onClick={logout}
                    className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:opacity-80"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="hidden md:block">
              <Button variant="outline" size="sm">
                <User className="mr-1 h-4 w-4" />
                Login
              </Button>
            </Link>
          )}

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md lg:hidden"
            style={{ color: "var(--text-primary)" }}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          >
            {menuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          className="border-t lg:hidden"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--card-border)",
          }}
        >
          <nav className="container mx-auto grid gap-1 px-4 py-3 sm:grid-cols-2">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                compact
                active={isActive(pathname, item.href)}
              />
            ))}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:opacity-80 sm:hidden"
              style={{ color: "var(--text-primary)" }}
            >
              Theme {themeCode}
            </button>
            {isAuthenticated ? (
              <>
                <NavLink
                  item={{
                    href: "/account",
                    label: "Account Details",
                    scope: "authenticated",
                  }}
                  compact
                  active={isActive(pathname, "/account")}
                />
                <NavLink
                  item={{
                    href: "/account/security",
                    label: "Account Security",
                    scope: "authenticated",
                  }}
                  compact
                  active={isActive(pathname, "/account/security")}
                />
                <button
                  type="button"
                  onClick={logout}
                  className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:opacity-80"
                  style={{ color: "var(--text-primary)" }}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </>
            ) : (
              <NavLink
                item={{ href: "/login", label: "Login", scope: "public" }}
                compact
                active={isActive(pathname, "/login")}
              />
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

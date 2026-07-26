"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  RadioTower,
  Users,
  Store,
  Tag,
  ReceiptText,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useFeatureFlags } from "@/context/FeatureFlagsContext";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/runners", label: "Runners", icon: Users },
  { href: "/admin/shops", label: "Shops", icon: Store },
  {
    href: "/admin/whatsapp-groups",
    label: "WhatsApp Groups",
    icon: MessageSquare,
  },
  {
    href: "/admin/whatsapp-bridges",
    label: "WhatsApp Bridges",
    icon: RadioTower,
  },
  { href: "/admin/coupons", label: "Coupons", icon: Tag, phase: "phase2" },
  { href: "/admin/billing", label: "Billing", icon: ReceiptText },
  { href: "/admin/development", label: "Development", icon: SlidersHorizontal },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { phase2Enabled } = useFeatureFlags();

  return (
    <aside
      className={`flex flex-col border-r transition-all duration-200 ${
        collapsed ? "w-14" : "w-56"
      }`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--card-border)",
        minHeight: "calc(100vh - 64px)",
      }}
    >
      {/* Section heading */}
      {!collapsed && (
        <div
          className="px-4 pt-5 pb-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-secondary)" }}
        >
          Admin Panel
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 px-2 py-2 space-y-1">
        {NAV.filter((item) => item.phase !== "phase2" || phase2Enabled).map(
          ({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? "text-white" : "hover:opacity-80"
                }`}
                style={
                  active
                    ? { background: "var(--accent)", color: "#fff" }
                    : { color: "var(--text-primary)" }
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          },
        )}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center py-3 border-t transition-colors hover:opacity-70"
        style={{
          borderColor: "var(--card-border)",
          color: "var(--text-secondary)",
        }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
}

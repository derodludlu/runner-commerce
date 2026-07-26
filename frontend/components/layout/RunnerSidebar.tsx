"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  List,
  Package,
  ShoppingBag,
  MessageCircle,
  DollarSign,
  ReceiptText,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
} from "lucide-react";
import { useState } from "react";
import { useFeatureFlags } from "@/context/FeatureFlagsContext";

const NAV = [
  { href: "/runner/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/runner/phase1",
    label: "Setup & Marketplace",
    icon: ClipboardCheck,
  },
  { href: "/runner/listings", label: "My Listings", icon: List },
  {
    href: "/orders",
    label: "Orders",
    icon: Package,
    phase: "phase2",
  },
  {
    href: "/runner/order-requests",
    label: "WhatsApp Orders",
    icon: MessageCircle,
    phase: "phase2",
  },
  {
    href: "/runner/shopping-list",
    label: "Shopping List",
    icon: ShoppingBag,
    phase: "phase2",
  },
  { href: "/runner/products", label: "Products", icon: Package },
  {
    href: "/runner/earnings",
    label: "Earnings",
    icon: DollarSign,
    phase: "phase2",
  },
  {
    href: "/runner/billing",
    label: "Billing",
    icon: ReceiptText,
    phase: "phase2",
  },
];

export default function RunnerSidebar() {
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
      {!collapsed && (
        <div
          className="px-4 pt-5 pb-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-secondary)" }}
        >
          Runner Portal
        </div>
      )}

      <nav className="flex-1 px-2 py-2 space-y-1">
        {NAV.filter((item) => item.phase !== "phase2" || phase2Enabled).map(
          ({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
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

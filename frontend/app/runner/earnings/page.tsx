// frontend/app/runner/earnings/page.tsx

"use client";

import { useEffect, useState } from "react";
import { runnerApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { useRunnerGuard } from "@/hooks/useRoleGuard";
import { DollarSign, TrendingUp, Package, Wallet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function RunnerEarningsPage() {
  const [earnings, setEarnings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { isReady } = useRunnerGuard();

  useEffect(() => {
    if (!isReady) return;
    loadEarnings();
  }, [isReady]);

  const loadEarnings = async () => {
    try {
      const response = await runnerApi.getEarnings();
      setEarnings(response.data);
    } catch (error) {
      console.error("Failed to load earnings:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isReady) {
    return (
      <div className="text-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "var(--text-secondary)" }}>Loading earnings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Earnings & Wallet
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Track your commissions and withdrawals
          </p>
        </div>
        <Link href="/runner/dashboard">
          <Button variant="outline" themed>
            ← Dashboard
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        <StatCard
          icon={<Wallet className="w-6 h-6" />}
          label="Wallet Balance"
          value={formatCurrency(earnings?.wallet?.balance)}
          color="blue"
        />
        <StatCard
          icon={<DollarSign className="w-6 h-6" />}
          label="Total Revenue"
          value={formatCurrency(earnings?.totalRevenue)}
          color="green"
        />
        <StatCard
          icon={<Package className="w-6 h-6" />}
          label="Orders Completed"
          value={earnings?.totalOrders || 0}
          color="purple"
        />
        <StatCard
          icon={<TrendingUp className="w-6 h-6" />}
          label="Rating"
          value={(earnings?.rating || 0).toFixed(1)}
          color="yellow"
        />
      </div>

      {/* Wallet Info */}
      <div
        className="rounded-xl p-6"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--card-border)",
        }}
      >
        <h2
          className="text-xl font-bold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          💰 Your Wallet
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div
            className="p-4 rounded-lg"
            style={{ backgroundColor: "var(--card-bg)" }}
          >
            <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
              Available Balance
            </p>
            <p
              className="text-2xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {formatCurrency(earnings?.wallet?.balance)}
            </p>
          </div>
          <div
            className="p-4 rounded-lg"
            style={{ backgroundColor: "var(--card-bg)" }}
          >
            <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
              Pending
            </p>
            <p
              className="text-2xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {formatCurrency(earnings?.wallet?.pending)}
            </p>
          </div>
          <div
            className="p-4 rounded-lg"
            style={{ backgroundColor: "var(--card-bg)" }}
          >
            <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
              Total Earned
            </p>
            <p className="text-2xl font-bold text-green-500">
              {formatCurrency(earnings?.totalRevenue)}
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <Button themed disabled={!(earnings?.wallet?.balance > 0)}>
            💸 Request Withdrawal
          </Button>
          <Button variant="outline" themed>
            📊 View Statement
          </Button>
        </div>
      </div>

      {/* Recent Transactions */}
      <div
        className="rounded-xl p-6"
        style={{
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        <h2
          className="text-xl font-bold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Recent Transactions
        </h2>
        {earnings?.recentTransactions?.length === 0 ? (
          <p
            className="text-center py-8"
            style={{ color: "var(--text-secondary)" }}
          >
            No transactions yet
          </p>
        ) : (
          <div className="space-y-3">
            {earnings?.recentTransactions?.map((tx: any) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor:
                        tx.type === "CREDIT"
                          ? "rgba(34, 197, 94, 0.1)"
                          : "rgba(239, 68, 68, 0.1)",
                    }}
                  >
                    {tx.type === "CREDIT" ? "💰" : "💸"}
                  </div>
                  <div>
                    <p
                      className="font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {tx.type === "CREDIT"
                        ? "Commission Earned"
                        : "Withdrawal"}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <p
                  className={`font-bold ${
                    tx.type === "CREDIT" ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {tx.type === "CREDIT" ? "+" : "-"}
                  {formatCurrency(tx.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Orders */}
      <div
        className="rounded-xl p-6"
        style={{
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        <h2
          className="text-xl font-bold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Recent Orders
        </h2>
        {earnings?.recentOrders?.length === 0 ? (
          <p
            className="text-center py-8"
            style={{ color: "var(--text-secondary)" }}
          >
            No completed orders yet
          </p>
        ) : (
          <div className="space-y-3">
            {earnings?.recentOrders?.map((order: any) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <div>
                  <p
                    className="font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Order #{order.id.slice(-8)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <p className="font-bold text-green-500">
                  +{formatCurrency(order.totalAmount * 0.1)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: any) {
  return (
    <div
      className="p-6 rounded-xl"
      style={{
        backgroundColor: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div style={{ color: `var(--accent)` }}>{icon}</div>
      </div>
      <p
        className="text-2xl font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
    </div>
  );
}

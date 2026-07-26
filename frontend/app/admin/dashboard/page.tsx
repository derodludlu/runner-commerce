"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { useAdminGuard } from "@/hooks/useRoleGuard";
import {
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  TrendingUp,
  Truck,
  Store,
  Star,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topRunners, setTopRunners] = useState<any[]>([]);
  const { user, isReady } = useAdminGuard();

  useEffect(() => {
    if (!isReady || !user) return;

    const loadData = async () => {
      try {
        const [statsRes, analyticsRes, productsRes, runnersRes] =
          await Promise.all([
            adminApi.getDashboard(),
            adminApi.getUserAnalytics(),
            adminApi.getTopProducts(5),
            adminApi.getTopRunners(5),
          ]);

        setStats(statsRes.data);
        setAnalytics(analyticsRes.data);
        setTopProducts(productsRes.data || []);
        setTopRunners(runnersRes.data || []);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      }
    };

    loadData();
  }, [isReady, user]);

  if (!isReady) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={<DollarSign className="w-8 h-8" />}
          title="Total Revenue"
          value={formatCurrency(stats?.revenue)}
          color="bg-green-500"
        />
        <StatCard
          icon={<ShoppingCart className="w-8 h-8" />}
          title="Total Orders"
          value={stats?.orders || 0}
          color="bg-blue-500"
        />
        <StatCard
          icon={<Users className="w-8 h-8" />}
          title="Total Users"
          value={stats?.users || 0}
          color="bg-purple-500"
        />
        <StatCard
          icon={<Package className="w-8 h-8" />}
          title="Total Products"
          value={stats?.products || 0}
          color="bg-orange-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={<Store className="w-8 h-8" />}
          title="Total Shops"
          value={stats?.shops || 0}
          color="bg-pink-500"
        />
        <StatCard
          icon={<Truck className="w-8 h-8" />}
          title="Total Runners"
          value={stats?.runners || 0}
          color="bg-cyan-500"
        />
        <StatCard
          icon={<TrendingUp className="w-8 h-8" />}
          title="Completed Orders"
          value={stats?.completedOrders || 0}
          color="bg-emerald-500"
        />
        <StatCard
          icon={<ShoppingCart className="w-8 h-8" />}
          title="Pending Orders"
          value={stats?.pendingOrders || 0}
          color="bg-yellow-500"
        />
      </div>

      {/* User Analytics */}
      {analytics && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">User Analytics</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <AnalyticsItem label="Total Users" value={analytics.totalUsers} />
            <AnalyticsItem label="New Today" value={analytics.newUsersToday} />
            <AnalyticsItem
              label="New This Week"
              value={analytics.newUsersThisWeek}
            />
            <AnalyticsItem
              label="New This Month"
              value={analytics.newUsersThisMonth}
            />
            <AnalyticsItem
              label="Active Runners"
              value={analytics.activeRunners}
            />
            <AnalyticsItem label="Active Shops" value={analytics.activeShops} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Products */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Top Selling Products
          </h2>
          <div className="space-y-3">
            {topProducts.map((product, index) => (
              <div
                key={product.product?.id}
                className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
              >
                <span className="text-2xl font-bold text-gray-400">
                  #{index + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{product.product?.name}</p>
                  <p className="text-sm text-gray-500">
                    {product.product?.shop?.name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {product.totalQuantity || 0} sold
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Runners */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5 text-cyan-500" />
            Top Performers
          </h2>
          <div className="space-y-3">
            {topRunners.map((runner, index) => (
              <div
                key={runner.id}
                className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
              >
                <span className="text-2xl font-bold text-gray-400">
                  #{index + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{runner.name}</p>
                  <p className="text-sm text-gray-500">{runner.email}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{runner.totalOrders} orders</p>
                  <p className="text-sm text-green-600">
                    {formatCurrency(runner.totalEarnings)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-4">
        <div className={`${color} text-white p-3 rounded-lg`}>{icon}</div>
        <div>
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function AnalyticsItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-3 bg-gray-50 rounded-lg">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

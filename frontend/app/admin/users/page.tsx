"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "@/hooks/useRoleGuard";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  KeyRound,
  Copy,
  X,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  passwordResetRequired: boolean;
  createdAt: string;
  runner: { id: string; status: string; totalOrders: number } | null;
  _count: { orders: number; shops: number };
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-800",
  SHOP_OWNER: "bg-blue-100 text-blue-800",
  RUNNER: "bg-green-100 text-green-800",
  CUSTOMER: "bg-gray-100 text-gray-800",
};

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState("");
  const [resetCredential, setResetCredential] = useState<{
    name: string;
    phone: string;
    temporaryPassword: string;
    delivery: {
      status: string;
      bridgeName: string;
      bridgeStatus: string;
      expiresAt: string;
    };
  } | null>(null);
  const { user, isReady } = useAdminGuard();

  useEffect(() => {
    if (!isReady || !user) return;
    loadUsers();
  }, [search, roleFilter, page, isReady]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getUsers({
        role: roleFilter || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setUsers(res.data.users || []);
      setTotal(res.data.total || 0);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
  };

  const updateUserRole = async (
    targetUser: AdminUser,
    role: "CUSTOMER" | "RUNNER" | "SHOP_OWNER",
  ) => {
    if (targetUser.role === role) return;
    if (targetUser.id === user?.id) {
      toast.error("You cannot change your own role here");
      return;
    }

    const shopCount = targetUser._count?.shops || 0;
    const warning =
      shopCount > 0 && role !== "SHOP_OWNER"
        ? `\n\nThis account owns ${shopCount} shop(s). Active shops will be paused when the role changes.`
        : "";

    const confirmed = window.confirm(
      `Change ${targetUser.name || targetUser.phone} from ${targetUser.role} to ${role}?${warning}`,
    );
    if (!confirmed) return;

    setUpdatingUserId(targetUser.id);
    try {
      const response = await adminApi.updateUserRole(targetUser.id, role);
      toast.success(
        response.data?.pausedShops
          ? `Role updated. Paused ${response.data.pausedShops} shop(s).`
          : "Role updated",
      );
      await loadUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update role");
    } finally {
      setUpdatingUserId("");
    }
  };

  const deleteUser = async (targetUser: AdminUser) => {
    if (targetUser.id === user?.id) {
      toast.error("You cannot delete your own account here");
      return;
    }

    const shopCount = targetUser._count?.shops || 0;
    const orderCount = targetUser._count?.orders || 0;
    const typed = window.prompt(
      `Delete ${targetUser.name || targetUser.phone}?\n\nOwned shops: ${shopCount}\nOrders: ${orderCount}\n\nThis can remove owned shops and dependent shop data. Type DELETE to confirm.`,
    );
    if (typed !== "DELETE") return;

    setUpdatingUserId(targetUser.id);
    try {
      const response = await adminApi.deleteUser(targetUser.id);
      toast.success(response.data?.message || "User deleted");
      await loadUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to delete user");
    } finally {
      setUpdatingUserId("");
    }
  };

  const resetPassword = async (targetUser: AdminUser) => {
    if (targetUser.id === user?.id) {
      toast.error("Use Account Security to change your own password");
      return;
    }
    if (
      !window.confirm(
        `Reset the password for ${targetUser.name || targetUser.phone}? Their current password will stop working immediately.`,
      )
    ) {
      return;
    }

    setUpdatingUserId(targetUser.id);
    try {
      const response = await adminApi.resetUserPassword(targetUser.id);
      setResetCredential(response.data);
      toast.success(
        `Temporary password queued through ${response.data.delivery.bridgeName}`,
      );
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Password reset failed");
    } finally {
      setUpdatingUserId("");
    }
  };

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
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-2">
        <Users className="w-8 h-8" />
        User Management
      </h1>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {["CUSTOMER", "RUNNER", "SHOP_OWNER", "ADMIN"].map((role) => {
          const count = users.filter((u) => u.role === role).length;
          return (
            <button
              key={role}
              onClick={() => {
                setRoleFilter(roleFilter === role ? "" : role);
                setPage(0);
              }}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                roleFilter === role
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="text-2xl font-bold">
                {roleFilter === role ? users.length : "—"}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {role.replace("_", " ")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <form onSubmit={handleSearch} className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, email, phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </form>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(0);
          }}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Roles</option>
          <option value="CUSTOMER">Customer</option>
          <option value="RUNNER">Runner</option>
          <option value="SHOP_OWNER">Shop Owner</option>
          <option value="ADMIN">Admin</option>
        </select>
        <span className="flex items-center text-sm text-gray-500 self-center">
          {total} user{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-sm">
                  User
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm">
                  Contact
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm">
                  Role
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm">
                  Orders
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm">
                  Runner Status
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm">
                  Joined
                </th>
                <th className="text-right px-4 py-3 font-semibold text-sm">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {u.phone || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          ROLE_COLORS[u.role] || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {u.role.replace("_", " ")}
                      </span>
                      {(u._count?.shops || 0) > 0 && (
                        <div className="mt-1 text-xs text-gray-500">
                          {u._count.shops} shop
                          {u._count.shops !== 1 ? "s" : ""}
                        </div>
                      )}
                      {u.status !== "ACTIVE" && (
                        <div className="mt-1 text-xs font-medium text-red-700">
                          {u.status}
                        </div>
                      )}
                      {u.passwordResetRequired && (
                        <div className="mt-1 text-xs font-medium text-amber-700">
                          Temporary password active
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {u._count?.orders ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      {u.runner ? (
                        <div className="text-sm">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              u.runner.status === "ACTIVE"
                                ? "bg-green-100 text-green-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {u.runner.status}
                          </span>
                          <span className="text-gray-500 text-xs ml-2">
                            {u.runner.totalOrders} orders
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={u.role}
                          disabled={
                            updatingUserId === u.id || u.id === user?.id
                          }
                          onChange={(event) =>
                            updateUserRole(
                              u,
                              event.target.value as
                                "CUSTOMER" | "RUNNER" | "SHOP_OWNER",
                            )
                          }
                          className="rounded-lg border px-2 py-1 text-xs"
                          title="Change role"
                        >
                          <option value="CUSTOMER">Customer</option>
                          <option value="RUNNER">Runner</option>
                          <option value="SHOP_OWNER">Shop Owner</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => resetPassword(u)}
                          disabled={
                            updatingUserId === u.id || u.id === user?.id
                          }
                          className="rounded-lg border border-amber-300 p-2 text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Reset password"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteUser(u)}
                          disabled={
                            updatingUserId === u.id || u.id === user?.id
                          }
                          className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {resetCredential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Temporary password"
            className="w-full max-w-md rounded-lg border p-6 shadow-2xl"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--card-border)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Temporary Password</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {resetCredential.name} · {resetCredential.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetCredential(null)}
                className="rounded-md p-2 hover:bg-black/5"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm">
              This password is shown once. The user must change it after login.
            </p>
            <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
              WhatsApp delivery: {resetCredential.delivery.status} via{" "}
              {resetCredential.delivery.bridgeName}
              {resetCredential.delivery.bridgeStatus !== "ONLINE" && (
                <div className="mt-1 font-medium text-amber-800">
                  The bridge is {resetCredential.delivery.bridgeStatus}; the
                  message will send when it reconnects, before expiry.
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-md border bg-gray-50 p-3">
              <code className="min-w-0 flex-1 break-all text-base font-bold text-gray-950">
                {resetCredential.temporaryPassword}
              </code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    resetCredential.temporaryPassword,
                  );
                  toast.success("Temporary password copied");
                }}
                className="rounded-md border p-2 text-gray-800 hover:bg-white"
                title="Copy password"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setResetCredential(null)}
              className="mt-5 w-full rounded-md px-4 py-2 font-bold text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

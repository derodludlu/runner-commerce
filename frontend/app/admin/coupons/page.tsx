"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "@/hooks/useRoleGuard";
import { couponsApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import { Tag, Plus, Trash2, Edit2, X, Check } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usageCount: number;
  perUserLimit: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
}

const emptyForm = {
  code: "",
  description: "",
  discountType: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
  discountValue: 10,
  minOrderAmount: 0,
  maxDiscount: "",
  usageLimit: "",
  perUserLimit: 1,
  validFrom: new Date().toISOString().split("T")[0],
  validUntil: "",
};

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, isReady } = useAdminGuard();

  useEffect(() => {
    if (!isReady || !user) return;
    loadCoupons();
  }, [isReady]);

  const loadCoupons = async () => {
    try {
      const res = await couponsApi.getAll();
      setCoupons(res.data || []);
    } catch {
      toast.error("Failed to load coupons");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: any = {
        code: form.code.toUpperCase(),
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderAmount: Number(form.minOrderAmount) || 0,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        perUserLimit: Number(form.perUserLimit) || 1,
        validFrom: new Date(form.validFrom).toISOString(),
        validUntil: form.validUntil
          ? new Date(form.validUntil).toISOString()
          : undefined,
      };

      if (editingId) {
        await couponsApi.update(editingId, payload);
        toast.success("Coupon updated");
      } else {
        await couponsApi.create(payload);
        toast.success("Coupon created");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      loadCoupons();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save coupon");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (coupon: Coupon) => {
    setForm({
      code: coupon.code,
      description: coupon.description || "",
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minOrderAmount: coupon.minOrderAmount,
      maxDiscount: coupon.maxDiscount?.toString() || "",
      usageLimit: coupon.usageLimit?.toString() || "",
      perUserLimit: coupon.perUserLimit,
      validFrom: coupon.validFrom.split("T")[0],
      validUntil: coupon.validUntil ? coupon.validUntil.split("T")[0] : "",
    });
    setEditingId(coupon.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    try {
      await couponsApi.delete(id);
      toast.success("Coupon deleted");
      loadCoupons();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete coupon");
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
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

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <Tag className="w-16 h-16 mx-auto text-gray-300 animate-pulse" />
          <p className="mt-4 text-gray-500">Loading coupons...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Tag className="w-8 h-8" />
          Coupon Management
        </h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Coupon
          </button>
        )}
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">
              {editingId ? "Edit Coupon" : "Create Coupon"}
            </h2>
            <button
              onClick={cancelForm}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1">Code *</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                className="w-full border rounded-lg px-3 py-2"
                placeholder="SUMMER20"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Description
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Summer sale discount"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Discount Type *
              </label>
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discountType: e.target.value as "PERCENTAGE" | "FIXED",
                  })
                }
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (R)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Discount Value *{" "}
                {form.discountType === "PERCENTAGE" ? "(%)" : "(R)"}
              </label>
              <input
                type="number"
                value={form.discountValue}
                onChange={(e) =>
                  setForm({ ...form, discountValue: Number(e.target.value) })
                }
                className="w-full border rounded-lg px-3 py-2"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Min Order Amount (R)
              </label>
              <input
                type="number"
                value={form.minOrderAmount}
                onChange={(e) =>
                  setForm({ ...form, minOrderAmount: Number(e.target.value) })
                }
                className="w-full border rounded-lg px-3 py-2"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Max Discount (R, optional)
              </label>
              <input
                type="number"
                value={form.maxDiscount}
                onChange={(e) =>
                  setForm({ ...form, maxDiscount: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2"
                min="0"
                step="0.01"
                placeholder="No limit"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Total Usage Limit (optional)
              </label>
              <input
                type="number"
                value={form.usageLimit}
                onChange={(e) =>
                  setForm({ ...form, usageLimit: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2"
                min="1"
                placeholder="Unlimited"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Per User Limit
              </label>
              <input
                type="number"
                value={form.perUserLimit}
                onChange={(e) =>
                  setForm({ ...form, perUserLimit: Number(e.target.value) })
                }
                className="w-full border rounded-lg px-3 py-2"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Valid From *
              </label>
              <input
                type="date"
                value={form.validFrom}
                onChange={(e) =>
                  setForm({ ...form, validFrom: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Valid Until (optional)
              </label>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) =>
                  setForm({ ...form, validUntil: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button
                type="button"
                onClick={cancelForm}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-primary text-white px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {isSubmitting ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Coupons Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-sm">
                Code
              </th>
              <th className="text-left px-4 py-3 font-semibold text-sm">
                Discount
              </th>
              <th className="text-left px-4 py-3 font-semibold text-sm">
                Min Order
              </th>
              <th className="text-left px-4 py-3 font-semibold text-sm">
                Usage
              </th>
              <th className="text-left px-4 py-3 font-semibold text-sm">
                Valid Until
              </th>
              <th className="text-left px-4 py-3 font-semibold text-sm">
                Status
              </th>
              <th className="text-right px-4 py-3 font-semibold text-sm">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-500">
                  No coupons yet. Create one above.
                </td>
              </tr>
            ) : (
              coupons.map((coupon) => (
                <tr
                  key={coupon.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-primary">
                      {coupon.code}
                    </span>
                    {coupon.description && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {coupon.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {coupon.discountType === "PERCENTAGE"
                      ? `${coupon.discountValue}%`
                      : formatCurrency(coupon.discountValue)}
                    {coupon.maxDiscount && (
                      <span className="text-xs text-gray-500 block">
                        max {formatCurrency(coupon.maxDiscount)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {coupon.minOrderAmount > 0
                      ? formatCurrency(coupon.minOrderAmount)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {coupon.usageCount}
                    {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {coupon.validUntil
                      ? new Date(coupon.validUntil).toLocaleDateString()
                      : "No expiry"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        coupon.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {coupon.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(coupon)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(coupon.id, coupon.code)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

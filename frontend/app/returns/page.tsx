"use client";

import { useEffect, useState } from "react";
import { returnsApi, ordersApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Package, ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface ReturnRequest {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  refundAmount: number;
  refundMode?: string;
  refundStatus?: string;
  approvedRefundAmount?: number | null;
  rmaNumber: string;
  createdAt: string;
  order?: {
    customerPhone: string;
    totalAmount: number;
  };
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const [formData, setFormData] = useState({
    orderId: "",
    reason: "",
    description: "",
    refundType: "ORIGINAL_PAYMENT" as const,
  });

  useEffect(() => {
    if (!user) {
      router.push("/login?redirect=/returns");
      return;
    }
    loadReturns();
  }, [user]);

  const loadReturns = async () => {
    try {
      const response = await returnsApi.getMyReturns();
      setReturns(response.data || []);
    } catch (error) {
      toast.error("Failed to load returns");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await returnsApi.createReturn(formData);
      toast.success("Return request submitted");
      setShowCreateForm(false);
      setFormData({
        orderId: "",
        reason: "",
        description: "",
        refundType: "ORIGINAL_PAYMENT",
      });
      loadReturns();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to create return");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "APPROVED":
        return "bg-green-100 text-green-800";
      case "REJECTED":
        return "bg-red-100 text-red-800";
      case "REFUNDED":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const refundStatusLabel = (ret: ReturnRequest) => {
    const status = ret.refundStatus || "NOT_STARTED";
    if (status === "COMPLETED") return "Refund completed";
    if (status === "MANUAL_ACTION_REQUIRED") {
      return "Manual refund being arranged";
    }
    if (status === "STORE_CREDIT_PENDING") {
      return "Store credit or exchange pending";
    }
    if (status === "ACTION_REQUIRED") {
      return "Refund needs admin follow-up";
    }
    return "Refund not started";
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/orders" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Package className="w-8 h-8" />
            Returns & Refunds
          </h1>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Request Return
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg shadow-md p-6 mb-8"
        >
          <h2 className="text-xl font-bold mb-4">Create Return Request</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Order ID</label>
              <input
                type="text"
                value={formData.orderId}
                onChange={(e) =>
                  setFormData({ ...formData, orderId: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Enter order ID"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reason</label>
              <select
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              >
                <option value="">Select reason</option>
                <option value="DEFECTIVE">Defective/Damaged item</option>
                <option value="NOT_AS_DESCRIBED">Not as described</option>
                <option value="WRONG_ITEM">Wrong item received</option>
                <option value="NOT_NEEDED">No longer needed</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                rows={4}
                placeholder="Describe the issue..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Refund Type
              </label>
              <select
                value={formData.refundType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    refundType: e.target.value as any,
                  })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="ORIGINAL_PAYMENT">
                  Original Payment Method
                </option>
                <option value="STORE_CREDIT">Store Credit</option>
                <option value="EXCHANGE">Exchange</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="bg-primary text-white px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Submit Request
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto text-gray-300 animate-pulse" />
          <p className="mt-4 text-gray-500">Loading your returns...</p>
        </div>
      ) : returns.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Package className="w-16 h-16 mx-auto text-gray-300" />
          <h2 className="mt-4 text-xl font-semibold text-gray-700">
            No return requests
          </h2>
          <p className="mt-2 text-gray-500">
            You haven't made any return requests yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {returns.map((ret) => (
            <div key={ret.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-bold text-lg">
                      RMA: {ret.rmaNumber}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                        ret.status,
                      )}`}
                    >
                      {ret.status}
                    </span>
                  </div>
                  <p className="text-gray-600">Order: {ret.orderId}</p>
                  <p className="text-gray-500 mt-1">Reason: {ret.reason}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {refundStatusLabel(ret)}
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    Created: {new Date(ret.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(ret.refundAmount)}
                  </p>
                  <p className="text-sm text-gray-500">Refund Amount</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

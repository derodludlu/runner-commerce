"use client";

import { useState } from "react";
import { couponsApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { Tag, Check, X } from "lucide-react";
import { toast } from "sonner";

interface CouponComponentProps {
  orderAmount: number;
  shopId?: string;
  category?: string;
  onCouponApplied: (discount: number, code: string) => void;
}

export default function CouponComponent({
  orderAmount,
  shopId,
  category,
  onCouponApplied,
}: CouponComponentProps) {
  const [couponCode, setCouponCode] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount: number;
  } | null>(null);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Please enter a coupon code");
      return;
    }

    setIsApplying(true);
    try {
      const response = await couponsApi.apply(
        couponCode.toUpperCase(),
        orderAmount,
        shopId,
        category,
      );

      const { discount, code } = response.data;
      setAppliedCoupon({ code, discount });
      onCouponApplied(discount, code);
      toast.success(`Coupon applied! You saved ${formatCurrency(discount)}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Invalid or expired coupon");
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    onCouponApplied(0, "");
    setCouponCode("");
    toast.info("Coupon removed");
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Tag className="w-5 h-5" />
        Have a coupon code?
      </h3>

      {appliedCoupon ? (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">
                {appliedCoupon.code} applied
              </p>
              <p className="text-sm text-green-600">
                You saved {formatCurrency(appliedCoupon.discount)}
              </p>
            </div>
          </div>
          <button
            onClick={handleRemoveCoupon}
            className="text-red-500 hover:text-red-700 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            placeholder="Enter coupon code"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent uppercase"
            disabled={isApplying}
          />
          <button
            onClick={handleApplyCoupon}
            disabled={isApplying || !couponCode.trim()}
            className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApplying ? "Applying..." : "Apply"}
          </button>
        </div>
      )}
    </div>
  );
}

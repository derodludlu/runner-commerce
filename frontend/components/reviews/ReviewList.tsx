// frontend/components/reviews/ReviewList.tsx

"use client";

import { useEffect, useState } from "react";
import { reviewsApi } from "@/lib/api";
import StarRating from "./StarRating";
import { CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

interface Review {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  verified: boolean;
  createdAt: string;
  customer: {
    id: string;
    name: string;
  };
}

interface ReviewListProps {
  productId: string;
}

export default function ReviewList({ productId }: ReviewListProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [average, setAverage] = useState({ average: 0, count: 0 });
  const { user } = useAuth();

  useEffect(() => {
    fetchReviews();
  }, [productId]);

  const fetchReviews = async () => {
    try {
      console.log("📚 Fetching reviews for product:", productId);
      const [reviewsRes, avgRes] = await Promise.all([
        reviewsApi.getByProduct(productId, 20, 0),
        reviewsApi.getAverage(productId),
      ]);

      console.log("📚 Reviews response:", reviewsRes.data);
      console.log("📚 Average response:", avgRes.data);

      setReviews(reviewsRes.data.data || []);
      setAverage(avgRes.data);

      if (reviewsRes.data.data?.length === 0) {
        console.log("ℹ️ No reviews found for this product");
      } else {
        console.log("✅ Loaded", reviewsRes.data.data.length, "reviews");
      }
    } catch (error: any) {
      console.error(
        "❌ Failed to fetch reviews:",
        error?.response?.data || error,
      );
      toast.error("Failed to load reviews");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!confirm("Are you sure you want to delete this review?")) return;

    try {
      await reviewsApi.delete(reviewId);
      toast.success("Review deleted");
      fetchReviews();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete review");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <p style={{ color: "var(--text-secondary)" }}>Loading reviews...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div
        className="p-6 rounded-xl"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--card-border)",
        }}
      >
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div
              className="text-4xl font-bold"
              style={{ color: "var(--accent)" }}
            >
              {average.average.toFixed(1)}
            </div>
            <StarRating rating={average.average} size="sm" showNumber={false} />
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              {average.count} review{average.count !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Reviews */}
      {reviews.length === 0 ? (
        <div className="text-center py-8">
          <p style={{ color: "var(--text-secondary)" }}>
            No reviews yet. Be the first to review!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="p-4 rounded-xl"
              style={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--card-border)",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <StarRating rating={review.rating} size="sm" />
                    {review.verified && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        Verified Purchase
                      </span>
                    )}
                  </div>

                  {review.title && (
                    <h4
                      className="font-semibold mb-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {review.title}
                    </h4>
                  )}

                  {review.comment && (
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {review.comment}
                    </p>
                  )}

                  <div
                    className="flex items-center gap-2 mt-3 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span
                      className="font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {review.customer.name}
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {user &&
                  (review.customer.id === user.id || user.role === "ADMIN") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(review.id)}
                      className="text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

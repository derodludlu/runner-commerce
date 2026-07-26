// frontend/components/reviews/ReviewForm.tsx

"use client";

import { useState } from "react";
import { reviewsApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Star } from "lucide-react";
import { toast } from "sonner";

interface ReviewFormProps {
  productId: string;
  orderId?: string;
  onSuccess?: () => void;
}

export default function ReviewForm({
  productId,
  orderId,
  onSuccess,
}: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      toast.error("Please select a star rating");
      return;
    }

    setIsLoading(true);

    try {
      console.log("📝 Submitting review for product:", productId);
      await reviewsApi.create({
        productId,
        rating,
        title: title || undefined,
        comment: comment || undefined,
        orderId,
      });

      console.log("✅ Review submitted successfully");
      toast.success("Review submitted successfully!");
      setRating(0);
      setTitle("");
      setComment("");
      onSuccess?.();
    } catch (error: any) {
      console.error("❌ Review submission error:", error?.response?.data);
      toast.error(error?.response?.data?.message || "Failed to submit review");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Your Rating *
        </label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`w-8 h-8 ${
                  star <= (hoverRating || rating)
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-gray-200 text-gray-300"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Title (optional)
        </label>
        <Input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Summarize your experience"
          style={{
            backgroundColor: "var(--input-bg)",
            color: "var(--text-primary)",
            borderColor: "var(--input-border)",
          }}
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Your Review (optional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What did you like or dislike? Would you recommend this product?"
          rows={4}
          className="w-full rounded-lg border-2 px-4 py-3 text-base font-medium transition-all duration-300 focus:outline-none focus:ring-2"
          style={{
            backgroundColor: "var(--input-bg)",
            color: "var(--text-primary)",
            borderColor: "var(--input-border)",
          }}
        />
      </div>

      <Button
        type="submit"
        themed
        isLoading={isLoading}
        disabled={rating === 0}
      >
        {isLoading ? "Submitting..." : "Submit Review"}
      </Button>
    </form>
  );
}

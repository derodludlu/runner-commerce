// frontend/components/reviews/StarRating.tsx

"use client";

import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number;
  size?: "sm" | "md" | "lg";
  showNumber?: boolean;
}

export default function StarRating({ rating, size = "md", showNumber = true }: StarRatingProps) {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${sizeClasses[size]} ${
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "fill-gray-200 text-gray-200"
            }`}
          />
        ))}
      </div>
      {showNumber && (
        <span className="text-sm font-medium ml-1" style={{ color: 'var(--text-secondary)' }}>
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

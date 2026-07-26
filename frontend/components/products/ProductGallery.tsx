// frontend/components/products/ProductGallery.tsx

"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isVideoMedia, parseProductMedia } from "@/lib/productMedia";

interface ProductGalleryProps {
  images: string[];
  productName: string;
}

export default function ProductGallery({
  images,
  productName,
}: ProductGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const validImages = parseProductMedia(images);

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % validImages.length);
  };

  const prevImage = () => {
    setCurrentIndex(
      (prev) => (prev - 1 + validImages.length) % validImages.length,
    );
  };

  if (!validImages || validImages.length === 0) {
    return (
      <div className="w-full h-96 bg-gray-200 rounded-xl flex items-center justify-center">
        <p className="text-gray-600 font-medium">No images available</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Main Image */}
      <div className="relative w-full h-96 bg-gray-200 rounded-xl overflow-hidden">
        {isVideoMedia(validImages[currentIndex]) ? (
          <video
            src={validImages[currentIndex]}
            className="w-full h-full object-cover"
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={validImages[currentIndex]}
            alt={`${productName} - Image ${currentIndex + 1}`}
            className="w-full h-full object-cover"
          />
        )}

        {/* Navigation Arrows */}
        {validImages.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={prevImage}
              className="absolute left-2 top-1/2 -translate-y-1/2"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={nextImage}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </>
        )}
      </div>

      {/* Thumbnail Strip */}
      {validImages.length > 1 && (
        <div className="flex gap-2 mt-4 overflow-x-auto">
          {validImages.map((image, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                index === currentIndex
                  ? "border-indigo-600"
                  : "border-transparent hover:border-gray-300"
              }`}
            >
              {isVideoMedia(image) ? (
                <video
                  src={image}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={image}
                  alt={`${productName} thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Image Counter */}
      {validImages.length > 1 && (
        <p className="text-sm font-medium text-gray-600 text-center mt-2">
          {currentIndex + 1} / {validImages.length}
        </p>
      )}
    </div>
  );
}

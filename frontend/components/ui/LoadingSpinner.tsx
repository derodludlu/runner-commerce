"use client";

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div
        className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
        style={{
          borderColor: "var(--card-border)",
          borderTopColor: "var(--accent)",
        }}
      />
    </div>
  );
}

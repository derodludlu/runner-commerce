"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useEffect } from "react";

export default function UnauthorizedPage() {
  const router = useRouter();

  useEffect(() => {
    // Set document title for better UX
    document.title = "Access Denied - Runner Commerce";
  }, []);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="mb-6">
          <ShieldAlert className="w-24 h-24 mx-auto" style={{ color: "var(--accent)" }} />
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
          403
        </h1>
        <h2 className="text-2xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Access Denied
        </h2>

        {/* Message */}
        <p className="text-gray-500 mb-8">
          You don't have permission to access this page. Please check your role and try again.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="transition-all hover:scale-105"
            style={{
              backgroundColor: "transparent",
              borderColor: "var(--accent)",
              color: "var(--accent)",
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Link href="/">
            <Button
              themed
              className="transition-all hover:scale-105"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

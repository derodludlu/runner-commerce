"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function RunnerMarketplaceRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/runner/phase1");
  }, [router]);

  return (
    <div className="py-12 text-center">
      <LoadingSpinner />
    </div>
  );
}

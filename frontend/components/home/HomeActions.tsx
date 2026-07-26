"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";

export function HomeActions() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const isRunner = user?.role === "RUNNER";

  useEffect(() => {
    if (!isLoading && isRunner) router.replace("/runner/dashboard");
  }, [isLoading, isRunner, router]);

  return (
    <div className="mt-7 flex flex-wrap gap-3">
      <Link href={isRunner ? "/runner/dashboard" : "/products"}>
        <Button size="lg" className="bg-white text-zinc-950 hover:bg-zinc-100">
          {isRunner ? "Runner dashboard" : "Browse products"}
        </Button>
      </Link>
      {!isLoading && !user && (
        <Link href="/register?next=runner">
          <Button size="lg" variant="outline" className="border-white bg-black/30 text-white hover:bg-black/50">
            Register as a runner
          </Button>
        </Link>
      )}
    </div>
  );
}

"use client";

import { useAdminGuard } from "@/hooks/useRoleGuard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import dynamic from "next/dynamic";

const WhatsAppGroupMappingsManager = dynamic(
  () => import("@/components/whatsapp/WhatsAppGroupMappingsManager"),
  { loading: () => <LoadingSpinner /> },
);

export default function AdminWhatsAppGroupsPage() {
  const { isReady } = useAdminGuard();

  if (!isReady) {
    return (
      <div className="py-16 text-center">
        <LoadingSpinner />
      </div>
    );
  }

  return <WhatsAppGroupMappingsManager scope="admin" />;
}

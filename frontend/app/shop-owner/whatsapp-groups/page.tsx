"use client";

import { useShopOwnerGuard } from "@/hooks/useRoleGuard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import dynamic from "next/dynamic";

const WhatsAppGroupMappingsManager = dynamic(
  () => import("@/components/whatsapp/WhatsAppGroupMappingsManager"),
  { loading: () => <LoadingSpinner /> },
);

export default function ShopOwnerWhatsAppGroupsPage() {
  const { isReady } = useShopOwnerGuard();

  if (!isReady) {
    return (
      <div className="py-16 text-center">
        <LoadingSpinner />
      </div>
    );
  }

  return <WhatsAppGroupMappingsManager scope="shop-owner" />;
}

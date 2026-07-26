"use client";

import { MessageCircle } from "lucide-react";
import { resolveMediaUrl } from "@/lib/mediaUrl";

export interface ShopWhatsAppGroupAvatar {
  id?: string;
  groupId?: string;
  name?: string | null;
  participants?: number | null;
  status?: string | null;
  groupRole?: string | null;
  isPrimarySource?: boolean | null;
  profileImageUrl?: string | null;
  lastSeenAt?: string | null;
}

interface ShopWhatsAppAvatarsProps {
  shopName: string;
  groups?: ShopWhatsAppGroupAvatar[] | null;
  max?: number;
  size?: "sm" | "md" | "lg";
  variant?: "stack" | "buttons" | "feature";
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export default function ShopWhatsAppAvatars({
  shopName,
  groups,
  max = 4,
  size = "md",
  variant = "stack",
  showLabel = true,
  className = "",
}: ShopWhatsAppAvatarsProps) {
  const visibleGroups = (groups || []).filter(Boolean).slice(0, max);
  const extraCount = Math.max(0, (groups?.length || 0) - visibleGroups.length);
  const primaryGroup =
    visibleGroups.find((group) => group.isPrimarySource) || visibleGroups[0];

  if (variant === "feature") {
    return (
      <div
        className={`flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center ${className}`}
      >
        <LargeGroupImage group={primaryGroup} shopName={shopName} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-gray-900">
            {primaryGroup?.name || "No WhatsApp group linked"}
          </div>
          <div className="mt-1 text-xs font-medium text-gray-500">
            {primaryGroup
              ? `${primaryGroup.participants || 0} participants${primaryGroup.isPrimarySource ? " - primary source" : ""}`
              : "Link a WhatsApp group to give this shop a visual identity"}
          </div>
          {visibleGroups.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {visibleGroups.slice(1).map((group) => (
                <span
                  key={group.groupId || group.id || group.name}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700"
                  title={group.name || "WhatsApp group"}
                >
                  <GroupAvatar group={group} shopName={shopName} size="sm" />
                  <span className="max-w-[12rem] truncate">{group.name}</span>
                </span>
              ))}
              {extraCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">
                  +{extraCount} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (variant === "buttons") {
    return (
      <div className={`flex min-w-0 flex-wrap gap-2 ${className}`}>
        {visibleGroups.length > 0 ? (
          visibleGroups.map((group) => (
            <GroupButton
              key={group.groupId || group.id || group.name}
              group={group}
              shopName={shopName}
            />
          ))
        ) : (
          <GroupButton shopName={shopName} />
        )}
        {extraCount > 0 && (
          <span
            className="inline-flex h-16 min-w-16 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-700"
            title={`${extraCount} more WhatsApp group${extraCount === 1 ? "" : "s"}`}
          >
            +{extraCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <div className="flex shrink-0 -space-x-2">
        {visibleGroups.length > 0 ? (
          visibleGroups.map((group) => (
            <GroupAvatar
              key={group.groupId || group.id || group.name}
              group={group}
              shopName={shopName}
              size={size}
            />
          ))
        ) : (
          <GroupAvatar shopName={shopName} size={size} />
        )}
        {extraCount > 0 && (
          <span
            className={`${sizeClasses[size]} inline-flex items-center justify-center rounded-full border-2 border-white bg-gray-100 font-bold text-gray-700 shadow-sm`}
            title={`${extraCount} more WhatsApp group${extraCount === 1 ? "" : "s"}`}
          >
            +{extraCount}
          </span>
        )}
      </div>

      {showLabel && (
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-gray-700">
            {primaryGroup?.name || "No WhatsApp group linked"}
          </div>
          <div className="truncate text-[11px] text-gray-500">
            {visibleGroups.length > 0
              ? `${groups?.length || 0} linked group${(groups?.length || 0) === 1 ? "" : "s"}`
              : "Link a group to enrich this shop"}
          </div>
        </div>
      )}
    </div>
  );
}

function LargeGroupImage({
  group,
  shopName,
}: {
  group?: ShopWhatsAppGroupAvatar;
  shopName: string;
}) {
  const label = group?.name || shopName;

  return (
    <span
      className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-green-100 text-xl font-bold text-green-800 shadow-sm"
      title={label}
    >
      {group?.profileImageUrl ? (
        <img
          src={resolveMediaUrl(group.profileImageUrl, group.lastSeenAt)}
          alt={label}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : group ? (
        <MessageCircle className="h-10 w-10" />
      ) : (
        initials(shopName)
      )}
      {group?.isPrimarySource && (
        <span className="absolute bottom-2 right-2 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
          Source
        </span>
      )}
    </span>
  );
}

function GroupButton({
  group,
  shopName,
}: {
  group?: ShopWhatsAppGroupAvatar;
  shopName: string;
}) {
  const label = group?.name || shopName;
  const titleParts = [
    label,
    group?.isPrimarySource ? "Primary source" : group?.groupRole,
    group?.participants ? `${group.participants} participants` : null,
  ].filter(Boolean);

  return (
    <span
      className="group relative inline-flex min-h-16 min-w-[13rem] max-w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 text-left shadow-sm transition-colors hover:border-green-300 hover:bg-green-50"
      title={titleParts.join(" - ")}
    >
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-green-100 font-bold text-green-800">
        {group?.profileImageUrl ? (
          <img
            src={resolveMediaUrl(group.profileImageUrl, group.lastSeenAt)}
            alt={label}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : group ? (
          <MessageCircle className="h-6 w-6" />
        ) : (
          initials(shopName)
        )}
        {group?.isPrimarySource && (
          <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border border-white bg-green-500" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-gray-900">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">
          {group
            ? `${group.participants || 0} participants${group.isPrimarySource ? " - source" : ""}`
            : "No WhatsApp group linked"}
        </span>
      </span>
    </span>
  );
}

function GroupAvatar({
  group,
  shopName,
  size,
}: {
  group?: ShopWhatsAppGroupAvatar;
  shopName: string;
  size: "sm" | "md" | "lg";
}) {
  const label = group?.name || shopName;
  const titleParts = [
    label,
    group?.isPrimarySource ? "Primary source" : group?.groupRole,
    group?.participants ? `${group.participants} participants` : null,
  ].filter(Boolean);

  return (
    <span
      className={`${sizeClasses[size]} relative inline-flex items-center justify-center overflow-hidden rounded-full border-2 border-white bg-green-50 font-bold text-green-800 shadow-sm`}
      title={titleParts.join(" - ")}
    >
      {group?.profileImageUrl ? (
        <img
          src={resolveMediaUrl(group.profileImageUrl, group.lastSeenAt)}
          alt={label}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : group ? (
        <MessageCircle className="h-1/2 w-1/2" />
      ) : (
        initials(shopName)
      )}
      {group?.isPrimarySource && (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white bg-green-500" />
      )}
    </span>
  );
}

function initials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const text = words
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return text || "S";
}

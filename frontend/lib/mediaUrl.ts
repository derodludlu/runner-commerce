const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function proxiedUploadUrl(media: URL) {
  return `/api/backend${media.pathname}${media.search}${media.hash}`;
}

function apiBaseUrl() {
  try {
    const configured = new URL(configuredApiUrl);
    if (
      typeof window !== "undefined" &&
      ["localhost", "127.0.0.1"].includes(configured.hostname) &&
      !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ) {
      configured.hostname = window.location.hostname;
    }
    return configured.toString().replace(/\/$/, "");
  } catch {
    return configuredApiUrl.replace(/\/$/, "");
  }
}

export function resolveMediaUrl(
  value?: string | null,
  cacheVersion?: string | null,
) {
  const source = String(value || "").trim();
  if (!source) return "";

  let resolved = source;
  try {
    const apiBase = new URL(apiBaseUrl());
    const media = new URL(source, apiBase);
    const isLocalStoredUrl = ["localhost", "127.0.0.1"].includes(
      media.hostname,
    );
    const isUploadPath = media.pathname.startsWith("/uploads/");

    if (isLocalStoredUrl && isUploadPath) {
      media.protocol = apiBase.protocol;
      media.hostname = apiBase.hostname;
      media.port = apiBase.port;
    }

    if (cacheVersion && isUploadPath) {
      media.searchParams.set("v", cacheVersion);
    }

    const isBackendUpload =
      isUploadPath &&
      (media.origin === apiBase.origin ||
        isLocalStoredUrl ||
        source.startsWith("/uploads/"));

    resolved = isBackendUpload ? proxiedUploadUrl(media) : media.toString();
  } catch {
    resolved = source.startsWith("/uploads/")
      ? `/api/backend${source}`
      : source.startsWith("/")
        ? `${apiBaseUrl()}${source}`
        : source;
  }

  return resolved;
}

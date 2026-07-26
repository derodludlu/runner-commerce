const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

    if (isLocalStoredUrl && media.pathname.startsWith("/uploads/")) {
      media.protocol = apiBase.protocol;
      media.hostname = apiBase.hostname;
      media.port = apiBase.port;
    }

    if (cacheVersion && media.pathname.startsWith("/uploads/")) {
      media.searchParams.set("v", cacheVersion);
    }
    resolved = media.toString();
  } catch {
    resolved = source.startsWith("/") ? `${apiBaseUrl()}${source}` : source;
  }

  return resolved;
}

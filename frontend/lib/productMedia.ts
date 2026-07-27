import { resolveMediaUrl } from "./mediaUrl";

const cleanMedia = (items: unknown[]) =>
  items
    .filter((item): item is string => typeof item === "string")
    .map((item) => resolveMediaUrl(item))
    .filter(Boolean);

export const parseProductMedia = (media: unknown): string[] => {
  if (!media) return [];
  if (Array.isArray(media)) {
    return cleanMedia(media);
  }

  if (typeof media === "string") {
    try {
      const parsed = JSON.parse(media);
      return Array.isArray(parsed) ? cleanMedia(parsed) : [];
    } catch {
      return [];
    }
  }

  return [];
};

export const isVideoMedia = (url: string) =>
  /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(url);

export const isImageMedia = (url: string) =>
  /\.(jpe?g|png|webp|gif)(?:[?#].*)?$/i.test(url);

export const mediaFileExtension = (url: string) => {
  const extension = url.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
};

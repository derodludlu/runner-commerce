export const parseProductMedia = (media: unknown): string[] => {
  if (!media) return [];
  if (Array.isArray(media)) {
    return media.filter((item): item is string => typeof item === "string");
  }

  if (typeof media === "string") {
    try {
      const parsed = JSON.parse(media);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
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

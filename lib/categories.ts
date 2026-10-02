// Fixed set so the gallery sections stay stable. Shared by the gallery, the
// admin editor and the AI classifier, so it must not import server-only code.
export const PHOTO_CATEGORIES = [
  "nature",
  "city",
  "heritage",
  "people",
  "animals",
  "food",
  "documents",
  "other",
] as const;

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export function isPhotoCategory(value: unknown): value is PhotoCategory {
  return (PHOTO_CATEGORIES as readonly unknown[]).includes(value);
}

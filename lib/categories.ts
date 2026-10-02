// Category rules shared by the gallery, the admin UI, the classifier and the
// Node scripts. Pure functions only: no database or server-only imports.

export type CategorySource = "seed" | "admin" | "ai";

export interface Category {
  slug: string;
  label: string;
  source: CategorySource;
  hidden: boolean;
}

// Starting set, inserted into the categories table the first time it's read
export const DEFAULT_CATEGORIES = [
  "nature",
  "city",
  "heritage",
  "people",
  "animals",
  "food",
  "documents",
  "other",
] as const;

// AI-created categories stay off the gallery until this many photos use them,
// so one odd photo doesn't create a tab
export const AI_CATEGORY_MIN_PHOTOS = 3;

// "Street Art!" -> "street-art". Returns null for names that can't be a category.
export function toCategorySlug(name: string): string | null {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 2) return null;
  const slug = words.join("-");
  return slug.length >= 3 && slug.length <= 24 ? slug : null;
}

// "street-art" -> "Street Art"
export function labelFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Rough singular form so "sculptures" matches "sculpture" and "cities" matches "city"
function singular(slug: string): string {
  if (slug.endsWith("ies")) return slug.slice(0, -3) + "y";
  if (slug.endsWith("ses") || slug.endsWith("xes")) return slug.slice(0, -2);
  if (slug.endsWith("s") && !slug.endsWith("ss")) return slug.slice(0, -1);
  return slug;
}

// Existing category this name refers to (by slug, label or singular/plural form)
export function matchCategory(name: string, existing: Category[]): string | null {
  const slug = toCategorySlug(name);
  if (!slug) return null;
  const target = singular(slug);
  const hit = existing.find(
    (c) => singular(c.slug) === target || singular(toCategorySlug(c.label) ?? "") === target
  );
  return hit?.slug ?? null;
}

// Map names returned by the AI to category slugs. Known names map to existing
// categories; at most one genuinely new category is accepted per photo.
export function resolveCategories(
  names: string[],
  existing: Category[]
): { slugs: string[]; created: string[] } {
  const slugs: string[] = [];
  const created: string[] = [];
  for (const name of names) {
    const match = matchCategory(name, existing);
    if (match) {
      slugs.push(match);
    } else if (created.length === 0) {
      const slug = toCategorySlug(name);
      if (slug) {
        slugs.push(slug);
        created.push(slug);
      }
    }
  }
  return { slugs: [...new Set(slugs)], created };
}

// Whether a category gets a tab on the public gallery
export function isCategoryVisible(category: Category, photoCount: number): boolean {
  if (category.hidden || photoCount === 0) return false;
  return category.source !== "ai" || photoCount >= AI_CATEGORY_MIN_PHOTOS;
}

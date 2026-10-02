import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/index";
import { categories } from "@/lib/schema";
import {
  DEFAULT_CATEGORIES,
  labelFromSlug,
  type Category,
  type CategorySource,
} from "@/lib/categories";

// Server-side access to the categories table

let seeded = false;

// Insert the default categories the first time the table is read (no-op after)
async function ensureSeeded() {
  if (seeded) return;
  await db
    .insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((slug, i) => ({
        slug,
        label: labelFromSlug(slug),
        source: "seed",
        sortOrder: i,
      }))
    )
    .onConflictDoNothing();
  seeded = true;
}

export async function listCategories(): Promise<Category[]> {
  await ensureSeeded();
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.createdAt));
  return rows.map((r) => ({
    slug: r.slug,
    label: r.label,
    source: r.source as CategorySource,
    hidden: r.hidden,
  }));
}

export async function addCategories(slugs: string[], source: CategorySource) {
  if (slugs.length === 0) return;
  await db
    .insert(categories)
    .values(slugs.map((slug) => ({ slug, label: labelFromSlug(slug), source })))
    .onConflictDoNothing();
}

// Photo counts per category slug (all photos, public and restricted)
export async function countPhotosByCategory(): Promise<Record<string, number>> {
  const rows = await db.execute<{ slug: string; count: number }>(
    sql`select unnest(categories) as slug, count(*)::int as count from photos group by 1`
  );
  return Object.fromEntries(rows.map((r) => [r.slug, r.count]));
}

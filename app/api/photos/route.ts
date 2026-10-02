import { db } from "@/lib/index";
import { photos } from "@/lib/schema";
import { NextRequest, NextResponse } from "next/server";
import { sql, getTableColumns, type SQL } from "drizzle-orm";
import { decodeCursor, encodeCursor, parseLimit, withoutSortKey } from "@/lib/pagination";

// Newest first: capture date, falling back to upload date for photos without EXIF
const sortExpr = sql`coalesce(${photos.takenAt}, ${photos.uploadedAt})`;
// Exact text form of the sort key, used in cursors (avoids timezone drift)
const sortKeyExpr = sql<string>`to_char(${sortExpr}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

// Public gallery, one page at a time.
// Query: year, place, category, cursor, limit (default 24).
// The first page (no cursor) also returns `total` and `categoryCounts` for the
// year/place filter, so the tabs can show counts without loading every photo.
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const year = searchParams.get("year");
    const place = searchParams.get("place");
    const category = searchParams.get("category");
    const cursor = decodeCursor(searchParams.get("cursor"));
    const limit = parseLimit(searchParams.get("limit"));

    // Filters shared by the page query and the counts (category excluded)
    let baseWhere: SQL = sql`${photos.visibility} = 'public'`;

    if (year && /^\d{4}$/.test(year)) {
      const startDate = new Date(`${year}-01-01`).toISOString();
      const endDate = new Date(`${year}-12-31`).toISOString();
      baseWhere = sql`${baseWhere} AND ((${photos.takenAt} >= ${startDate} AND ${photos.takenAt} <= ${endDate}) OR (${photos.takenAt} IS NULL AND ${photos.uploadedAt} >= ${startDate} AND ${photos.uploadedAt} <= ${endDate}))`;
    }

    if (place) {
      baseWhere = sql`${baseWhere} AND ${photos.place} ILIKE ${`%${place}%`}`;
    }

    let pageWhere = baseWhere;
    if (category) {
      pageWhere = sql`${pageWhere} AND ${category} = any(${photos.categories})`;
    }
    if (cursor) {
      pageWhere = sql`${pageWhere} AND (${sortExpr}, ${photos.id}) < (${cursor.sortKey}::timestamp, ${cursor.id}::uuid)`;
    }

    // Fetch one extra row to know whether there's another page
    const rows = await db
      .select({ ...getTableColumns(photos), sortKey: sortKeyExpr })
      .from(photos)
      .where(pageWhere)
      .orderBy(sql`${sortExpr} desc, ${photos.id} desc`)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ sortKey: last.sortKey, id: last.id }) : null;

    const body: {
      photos: Omit<(typeof page)[number], "sortKey">[];
      nextCursor: string | null;
      total?: number;
      categoryCounts?: Record<string, number>;
    } = {
      photos: page.map(withoutSortKey),
      nextCursor,
    };

    if (!cursor) {
      const [totals, counts] = await Promise.all([
        db.execute<{ total: number }>(sql`select count(*)::int as total from ${photos} where ${baseWhere}`),
        db.execute<{ slug: string; count: number }>(
          sql`select unnest(${photos.categories}) as slug, count(*)::int as count from ${photos} where ${baseWhere} group by 1`
        ),
      ]);
      body.total = totals[0]?.total ?? 0;
      body.categoryCounts = Object.fromEntries(counts.map((r) => [r.slug, r.count]));
    }

    // Shared CDN cache: a burst of visitors costs one database query per minute.
    // New uploads and edits show up on the gallery within about a minute.
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("Error fetching photos:", error);
    return NextResponse.json(
      { error: "Failed to fetch photos" },
      { status: 500 }
    );
  }
}

import { sql, getTableColumns } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/index";
import { photos } from "@/lib/schema";
import { decodeCursor, encodeCursor, parseLimit, withoutSortKey } from "@/lib/pagination";

const sortKeyExpr = sql<string>`to_char(${photos.uploadedAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

// Admin list: every photo (public and restricted), newest uploads first, one page
// at a time (?cursor, ?limit, default 50). Never cached, so edits and deletes show
// up immediately. The public /api/photos is CDN-cached.
export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cursor = decodeCursor(request.nextUrl.searchParams.get("cursor"));
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 50);

    const rows = await db
      .select({ ...getTableColumns(photos), sortKey: sortKeyExpr })
      .from(photos)
      .where(
        cursor
          ? sql`(${photos.uploadedAt}, ${photos.id}) < (${cursor.sortKey}::timestamp, ${cursor.id}::uuid)`
          : undefined
      )
      .orderBy(sql`${photos.uploadedAt} desc, ${photos.id} desc`)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];

    const body: { photos: unknown[]; nextCursor: string | null; total?: number } = {
      photos: page.map(withoutSortKey),
      nextCursor: hasMore && last ? encodeCursor({ sortKey: last.sortKey, id: last.id }) : null,
    };
    if (!cursor) {
      const totals = await db.execute<{ total: number }>(sql`select count(*)::int as total from ${photos}`);
      body.total = totals[0]?.total ?? 0;
    }

    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error fetching photos:", error);
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}

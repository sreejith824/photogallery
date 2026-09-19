import { auth } from "@/lib/auth";
import { db } from "@/lib/index";
import { photos } from "@/lib/schema";
import { NextRequest, NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const year = searchParams.get("year");
    const place = searchParams.get("place");

    let whereClause = sql`${photos.visibility} = 'public'`;

    if (year && /^\d{4}$/.test(year)) {
      const startDate = new Date(`${year}-01-01`).toISOString();
      const endDate = new Date(`${year}-12-31`).toISOString();
      whereClause = sql`${whereClause} AND ((${photos.takenAt} >= ${startDate} AND ${photos.takenAt} <= ${endDate}) OR (${photos.takenAt} IS NULL AND ${photos.uploadedAt} >= ${startDate} AND ${photos.uploadedAt} <= ${endDate}))`;
    }

    if (place) {
      whereClause = sql`${whereClause} AND ${photos.place} ILIKE ${`%${place}%`}`;
    }

    const result = await db
      .select()
      .from(photos)
      .where(whereClause);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching photos:", error);
    return NextResponse.json(
      { error: "Failed to fetch photos" },
      { status: 500 }
    );
  }
}

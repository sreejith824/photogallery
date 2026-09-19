import { db } from "@/lib/index";
import { photos } from "@/lib/schema";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const allPhotos = await db.select().from(photos);
    return NextResponse.json({
      count: allPhotos.length,
      photos: allPhotos.map(p => ({
        id: p.id,
        caption: p.caption,
        r2_key: p.r2Key,
        thumbnail_key: p.thumbnailKey,
        uploaded_at: p.uploadedAt,
        taken_at: p.takenAt,
        taken_at_year: p.takenAt ? new Date(p.takenAt).getFullYear() : null,
        place: p.place,
        visibility: p.visibility,
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

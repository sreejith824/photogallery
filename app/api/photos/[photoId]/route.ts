import { db } from "@/lib/index";
import { photos, accessRequests } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { generatePresignedGetUrl } from "@/lib/r2";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    const { photoId } = await params;

    const photo = await db
      .select()
      .from(photos)
      .where(eq(photos.id, photoId))
      .limit(1);

    if (!photo || photo.length === 0) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const photoData = photo[0];

    // Generate presigned URL for the full-size image
    const imageUrl = await generatePresignedGetUrl(photoData.r2Key, 86400); // 24 hours

    // Public photos can be cached at the CDN (well within the 24h image URL);
    // restricted ones must never be shared from a cache
    return NextResponse.json(
      { ...photoData, imageUrl },
      {
        headers: {
          "Cache-Control":
            photoData.visibility === "public"
              ? "public, s-maxage=3600, stale-while-revalidate=600"
              : "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching photo:", error);
    return NextResponse.json(
      { error: "Failed to fetch photo" },
      { status: 500 }
    );
  }
}

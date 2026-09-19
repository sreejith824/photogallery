import { db } from "@/lib/index";
import { photos } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { generatePresignedGetUrl } from "@/lib/r2";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    const { photoId } = await params;

    // Get photo from DB
    const photo = await db
      .select()
      .from(photos)
      .where(eq(photos.id, photoId))
      .limit(1);

    if (!photo || photo.length === 0) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    // Get thumbnail URL
    if (!photo[0].thumbnailKey) {
      return NextResponse.json(
        { error: "Thumbnail not available" },
        { status: 404 }
      );
    }

    const presignedUrl = await generatePresignedGetUrl(photo[0].thumbnailKey);
    return NextResponse.redirect(presignedUrl);
  } catch (error) {
    console.error("Error serving thumbnail:", error);
    return NextResponse.json(
      { error: "Failed to serve thumbnail" },
      { status: 500 }
    );
  }
}

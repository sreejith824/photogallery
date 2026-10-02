import { db } from "@/lib/index";
import { photos } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getObject } from "@/lib/r2";
import { NextRequest, NextResponse } from "next/server";

// Thumbnail keys are unique per upload and never change, so responses can be
// cached hard. The browser keeps them for a day and Vercel's CDN for a week, so
// repeat views don't touch the function, the database or R2. Trade-off: a
// deleted photo's thumbnail can stay reachable at its URL until the CDN copy
// expires.
const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    const { photoId } = await params;

    const photo = await db
      .select({ thumbnailKey: photos.thumbnailKey })
      .from(photos)
      .where(eq(photos.id, photoId))
      .limit(1);

    if (!photo[0]?.thumbnailKey) {
      return NextResponse.json({ error: "Thumbnail not available" }, { status: 404 });
    }

    const { body, contentType } = await getObject(photo[0].thumbnailKey);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType ?? "image/webp",
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error("Error serving thumbnail:", error);
    return NextResponse.json({ error: "Failed to serve thumbnail" }, { status: 500 });
  }
}

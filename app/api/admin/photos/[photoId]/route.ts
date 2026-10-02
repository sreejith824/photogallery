import { getAdminSession } from "@/lib/auth";
import { listCategories } from "@/lib/category-store";
import { db } from "@/lib/index";
import { photos } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

const s3Client = new S3Client({
  region: "auto",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY || "",
    secretAccessKey: process.env.R2_SECRET_KEY || "",
  },
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});

// Edit caption and/or categories. Either field may be omitted.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    if (!(await getAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { photoId } = await params;
    const body = await request.json();
    const updates: { caption?: string | null; categories?: string[]; tagsPending?: number } = {};

    if ("caption" in body) {
      if (body.caption !== null && typeof body.caption !== "string") {
        return NextResponse.json({ error: "caption must be a string" }, { status: 400 });
      }
      const caption = body.caption?.trim() ?? "";
      if (caption.length > 500) {
        return NextResponse.json({ error: "caption is too long (max 500)" }, { status: 400 });
      }
      updates.caption = caption || null;
    }

    if ("categories" in body) {
      const known = new Set((await listCategories()).map((c) => c.slug));
      if (!Array.isArray(body.categories) || !body.categories.every((c: unknown) => typeof c === "string" && known.has(c))) {
        return NextResponse.json({ error: "categories contains an unknown category" }, { status: 400 });
      }
      updates.categories = [...new Set<string>(body.categories)];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // Mark as reviewed so scripts/classify-pending.mjs won't overwrite manual edits
    updates.tagsPending = 0;

    const updated = await db
      .update(photos)
      .set(updates)
      .where(eq(photos.id, photoId))
      .returning({ id: photos.id, caption: photos.caption, categories: photos.categories });

    if (updated.length === 0) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (error) {
    console.error("Error updating photo:", error);
    return NextResponse.json({ error: "Failed to update photo" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    if (!(await getAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const photoData = photo[0];

    // Delete from R2
    if (photoData.r2Key) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: photoData.r2Key,
          })
        );
      } catch (error) {
        console.error("Error deleting original from R2:", error);
      }
    }

    if (photoData.thumbnailKey) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: photoData.thumbnailKey,
          })
        );
      } catch (error) {
        console.error("Error deleting thumbnail from R2:", error);
      }
    }

    // Delete from DB
    await db.delete(photos).where(eq(photos.id, photoId));

    return NextResponse.json({
      success: true,
      message: "Photo deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting photo:", error);
    return NextResponse.json(
      { error: "Failed to delete photo", details: String(error) },
      { status: 500 }
    );
  }
}

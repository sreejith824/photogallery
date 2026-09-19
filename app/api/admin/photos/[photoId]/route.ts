import { auth } from "@/lib/auth";
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.email || session.user.email !== process.env.ADMIN_EMAIL) {
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

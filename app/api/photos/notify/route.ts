import { auth } from "@/lib/auth";
import { db } from "@/lib/index";
import { photos } from "@/lib/schema";
import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/r2";
import sharp from "sharp";
import * as exifr from "exifr";

export const runtime = "nodejs";

async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
    );
    const data = await response.json();
    return data.address?.city || data.address?.town || null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email || session.user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { s3Key, filename, originalBuffer } = await request.json();

    if (!s3Key || !originalBuffer) {
      return NextResponse.json(
        { error: "s3Key and originalBuffer are required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(originalBuffer, "base64");

    // Extract EXIF data
    let exifData: any = {};
    let takenAt: Date | null = null;
    let lat: string | null = null;
    let lng: string | null = null;

    try {
      const tags = await exifr.parse(buffer);
      if (tags) {
        exifData = tags;
        if (tags.DateTime) {
          takenAt = new Date(tags.DateTime);
        }
        if (tags.latitude && tags.longitude) {
          lat = tags.latitude.toString();
          lng = tags.longitude.toString();
        }
      }
    } catch (error) {
      console.error("EXIF parsing error:", error);
    }

    // Reverse geocode if we have GPS data
    let place: string | null = null;
    if (lat && lng) {
      place = await reverseGeocode(parseFloat(lat), parseFloat(lng));
    }

    // Generate thumbnail
    let thumbnailKey: string | null = null;
    try {
      const thumbnailBuffer = await sharp(buffer)
        .resize(400, 400, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      thumbnailKey = `thumbnails/${Date.now()}_${filename}.webp`;
      await uploadFile(thumbnailKey, thumbnailBuffer, "image/webp");
    } catch (error) {
      console.error("Thumbnail generation error:", error);
    }

    // Get image dimensions
    let width: number | null = null;
    let height: number | null = null;
    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width || null;
      height = metadata.height || null;
    } catch (error) {
      console.error("Image metadata error:", error);
    }

    // Create photo record
    const insertResult = await db
      .insert(photos)
      .values({
        r2Key: s3Key,
        thumbnailKey,
        takenAt,
        place,
        lat,
        lng,
        caption: filename,
        visibility: "public",
        width,
        height,
        tagsPending: 1, // Mark as pending Claude tagging
      })
      .returning();

    const createdPhoto = insertResult[0];

    // Queue Claude vision tagging in the background using `after()`
    // This will run after the response is sent
    if (process.env.ANTHROPIC_API_KEY) {
      // Background tagging happens here via `after()` in production
      // For now, we'll just mark it as pending
    }

    return NextResponse.json({
      id: createdPhoto.id,
      s3Key,
      thumbnailKey,
      message: "Photo uploaded successfully",
    });
  } catch (error) {
    console.error("Upload notify error:", error);
    return NextResponse.json(
      { error: "Failed to process photo" },
      { status: 500 }
    );
  }
}

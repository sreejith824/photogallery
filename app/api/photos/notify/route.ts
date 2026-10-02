import { auth } from "@/lib/auth";
import { db } from "@/lib/index";
import { photos } from "@/lib/schema";
import { NextRequest, NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { uploadFile } from "@/lib/r2";
import { getCaptureDate, buildAutoTags, type CaptureDate } from "@/lib/exif";
import { classifyPhoto } from "@/lib/classify";
import sharp from "sharp";
import * as exifr from "exifr";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";
// Leaves room for the background classification call in after()
export const maxDuration = 60;

const s3Client = new S3Client({
  region: "auto",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY || "",
    secretAccessKey: process.env.R2_SECRET_KEY || "",
  },
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});

async function getFileFromR2(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });
  const response = await s3Client.send(command);
  return Buffer.from(await response.Body!.transformToByteArray());
}

interface GeocodeResult {
  place: string | null;
  locality: string | null;
  country: string | null;
}

async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  const empty = { place: null, locality: null, country: null };
  try {
    // Nominatim rejects requests without an identifying User-Agent (403)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=en`,
      { headers: { "User-Agent": "photogallery/1.0 (personal photo gallery)" } }
    );
    if (!response.ok) {
      console.error("Geocoding failed:", response.status);
      return empty;
    }
    const data = await response.json();
    const a = data.address || {};
    // Rural spots often have no city/town, so fall back to smaller/larger units
    const locality: string | null =
      a.city || a.town || a.village || a.hamlet || a.municipality || a.county || null;
    const country: string | null = a.country || null;
    const place = [locality, country].filter(Boolean).join(", ") || null;
    return { place, locality, country };
  } catch (error) {
    console.error("Geocoding error:", error);
    return empty;
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email || session.user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { s3Key, filename, caption: rawCaption } = await request.json();
    const caption =
      typeof rawCaption === "string" && rawCaption.trim()
        ? rawCaption.trim().slice(0, 500)
        : filename;

    if (!s3Key) {
      return NextResponse.json(
        { error: "s3Key is required" },
        { status: 400 }
      );
    }

    // Download file from R2
    console.log("Downloading from R2:", s3Key);
    const buffer = await getFileFromR2(s3Key);
    console.log("Downloaded buffer size:", buffer.length);

    // Extract EXIF data
    let exifData: any = {};
    let takenAt: Date | null = null;
    let capture: CaptureDate | null = null;
    let lat: string | null = null;
    let lng: string | null = null;

    try {
      console.log("Starting EXIF extraction...");
      const tags = await exifr.parse(buffer);
      if (tags) {
        exifData = tags;
        capture = await getCaptureDate(buffer);
        takenAt = capture?.takenAt ?? null;
        if (takenAt) {
          console.log("✓ EXIF capture date found:", takenAt);
        } else {
          console.log("⊘ No capture date in EXIF, using uploadedAt as fallback");
          takenAt = new Date();
        }
        if (tags.latitude && tags.longitude) {
          lat = tags.latitude.toString();
          lng = tags.longitude.toString();
        }
      } else {
        console.log("⊘ No EXIF data found, using uploadedAt as fallback");
        takenAt = new Date();
      }
    } catch (error) {
      console.error("EXIF parsing error:", error);
      takenAt = new Date(); // Fallback to current time
    }

    // Reverse geocode if we have GPS data
    let geo: GeocodeResult = { place: null, locality: null, country: null };
    if (lat && lng) {
      geo = await reverseGeocode(parseFloat(lat), parseFloat(lng));
    }
    const place = geo.place;
    const tags = buildAutoTags(capture, geo.locality, geo.country);

    // Generate thumbnail
    let thumbnailKey: string | null = null;
    try {
      console.log("Starting thumbnail generation...");
      const thumbnailBuffer = await sharp(buffer)
        .resize(400, 400, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      console.log("Thumbnail buffer created, size:", thumbnailBuffer.length);
      thumbnailKey = `thumbnails/${Date.now()}_${filename}.webp`;
      console.log("Uploading thumbnail to R2:", thumbnailKey);
      await uploadFile(thumbnailKey, thumbnailBuffer, "image/webp");
      console.log("✓ Thumbnail uploaded successfully");
    } catch (error) {
      console.error("✗ Thumbnail generation error:", error);
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
        tags,
        caption,
        visibility: "public",
        width,
        height,
        tagsPending: 1,
      })
      .returning();

    const createdPhoto = insertResult[0];
    const hasUserCaption = caption !== filename;

    // Classify with Claude after the response is sent, so uploads stay fast
    after(async () => {
      try {
        const result = await classifyPhoto(buffer);
        if (!result) return;
        await db
          .update(photos)
          .set({
            categories: result.categories,
            tags: [...new Set([...tags, ...result.tags])],
            ...(hasUserCaption ? {} : { caption: result.caption }),
            tagsPending: 0,
          })
          .where(eq(photos.id, createdPhoto.id));
        console.log("✓ Classified", createdPhoto.id, result.categories);
      } catch (error) {
        // tagsPending stays 1, so the photo can be retried by the backfill script
        console.error("✗ Classification error:", error);
      }
    });

    return NextResponse.json({
      id: createdPhoto.id,
      s3Key,
      thumbnailKey,
      message: "Photo uploaded successfully",
    });
  } catch (error) {
    console.error("Upload notify error:", error);
    return NextResponse.json(
      { error: "Failed to process photo", details: String(error) },
      { status: 500 }
    );
  }
}

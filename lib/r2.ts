import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const client = new S3Client({
  region: "auto",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY || "",
    secretAccessKey: process.env.R2_SECRET_KEY || "",
  },
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});

const bucket = process.env.R2_BUCKET_NAME || "photogallery";
const publicUrl = process.env.R2_PUBLIC_URL || "";

/**
 * Generate a presigned PUT URL for direct browser upload
 */
export async function generatePresignedPutUrl(
  key: string,
  contentType?: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn: 3600 });
  return url;
}

/**
 * Generate a presigned GET URL for restricted photo access
 */
export async function generatePresignedGetUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return url;
}

/**
 * Get public URL for a photo (for public photos)
 */
export function getPublicUrl(key: string): string {
  return `${publicUrl}/${key}`;
}

/**
 * Upload a file to R2
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);
}

export default {
  generatePresignedPutUrl,
  generatePresignedGetUrl,
  getPublicUrl,
  uploadFile,
};

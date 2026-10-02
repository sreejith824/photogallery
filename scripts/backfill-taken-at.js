// One-off: re-read EXIF capture dates for existing photos (they were stored as
// upload time because the old code looked for DateTime instead of DateTimeOriginal).
// Usage: npx dotenv -e .env.local -- node scripts/backfill-taken-at.js
const postgres = require("postgres");
const exifr = require("exifr");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const sql = postgres(process.env.DATABASE_URL);
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

// Same logic as lib/exif.ts getCaptureDate()
async function getTakenAt(buffer) {
  const tags = await exifr.parse(buffer, {
    pick: ["DateTimeOriginal", "CreateDate", "ModifyDate", "OffsetTimeOriginal", "OffsetTime"],
    reviveValues: false,
  });
  const raw = tags?.DateTimeOriginal || tags?.CreateDate || tags?.ModifyDate;
  const match = raw?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  const offset = tags.OffsetTimeOriginal || tags.OffsetTime || "";
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}${offset}`);
  return isNaN(date.getTime()) ? null : date;
}

async function main() {
  const rows = await sql`select id, r2_key, caption, taken_at from photos`;
  console.log(`${rows.length} photos to check`);

  for (const row of rows) {
    try {
      const res = await s3.send(
        new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: row.r2_key })
      );
      const takenAt = await getTakenAt(Buffer.from(await res.Body.transformToByteArray()));
      if (!takenAt) {
        console.log(`⊘ ${row.caption}: no EXIF date, left as is`);
        continue;
      }
      await sql`update photos set taken_at = ${takenAt} where id = ${row.id}`;
      console.log(`✓ ${row.caption}: ${row.taken_at.toISOString()} → ${takenAt.toISOString()}`);
    } catch (error) {
      console.error(`✗ ${row.caption}:`, error.message);
    }
  }

  await sql.end();
}

main();

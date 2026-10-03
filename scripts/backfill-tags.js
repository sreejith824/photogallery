// One-off: add date and place tags (e.g. "2026", "August 2026", "Øyer", "Norway")
// to existing photos. Merges with existing tags, so it's safe to re-run.
// Usage: npx dotenv -o -e .env.local -- node scripts/backfill-tags.js
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Same logic as lib/exif.ts getCaptureDate(), year/month only
async function getYearMonth(buffer) {
  const tags = await exifr.parse(buffer, {
    pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    reviveValues: false,
  });
  const raw = tags?.DateTimeOriginal || tags?.CreateDate || tags?.ModifyDate;
  const match = raw?.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return match ? { year: match[1], month: MONTHS[Number(match[2]) - 1] } : null;
}

// Same logic as reverseGeocode() in app/api/photos/notify/route.ts
async function reverseGeocode(lat, lng) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=en`,
    { headers: { "User-Agent": "photogallery/1.0 (personal photo gallery)" } }
  );
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const a = (await response.json()).address || {};
  return {
    locality: a.city || a.town || a.village || a.hamlet || a.municipality || a.county || null,
    country: a.country || null,
  };
}

async function main() {
  const rows = await sql`select id, r2_key, caption, lat, lng, tags from photos`;
  console.log(`${rows.length} photos to tag`);

  for (const row of rows) {
    try {
      const res = await s3.send(
        new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: row.r2_key })
      );
      const date = await getYearMonth(Buffer.from(await res.Body.transformToByteArray()));

      let geo = { locality: null, country: null };
      if (row.lat && row.lng) {
        geo = await reverseGeocode(row.lat, row.lng);
        // Nominatim usage policy: max 1 request per second
        await new Promise((r) => setTimeout(r, 1100));
      }

      const auto = [];
      if (date) auto.push(date.year, `${date.month} ${date.year}`);
      if (geo.locality) auto.push(geo.locality);
      if (geo.country && geo.country !== geo.locality) auto.push(geo.country);

      const tags = [...new Set([...(row.tags || []), ...auto])];
      await sql`update photos set tags = ${tags} where id = ${row.id}`;
      console.log(`✓ ${row.caption}: ${JSON.stringify(tags)}`);
    } catch (error) {
      console.error(`✗ ${row.caption}:`, error.message);
    }
  }

  await sql.end();
}

main();

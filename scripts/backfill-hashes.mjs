// Compute duplicate-detection fingerprints for existing photos and report
// duplicates already in the gallery. Doesn't delete anything.
// Usage: npx dotenv -e .env.local -- node scripts/backfill-hashes.mjs
import postgres from "postgres";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { sha256Hex, differenceHash, hammingDistance, LOOKALIKE_MAX_DISTANCE } from "../lib/image-hash.ts";

const sql = postgres(process.env.DATABASE_URL);
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const label = (row) => `${row.caption ?? "Untitled"} (${row.id.slice(0, 8)})`;

// Oldest first, so the original keeps the content hash and later copies are reported
const rows = await sql`
  select id, r2_key, caption, content_hash, perceptual_hash from photos order by uploaded_at
`;
console.log(`${rows.length} photos`);

const byHash = new Map(rows.filter((r) => r.content_hash).map((r) => [r.content_hash, r]));
const exactDuplicates = [];

for (const row of rows) {
  if (row.content_hash && row.perceptual_hash) continue;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: row.r2_key }));
    const buffer = Buffer.from(await res.Body.transformToByteArray());
    const contentHash = sha256Hex(buffer);
    row.perceptual_hash = await differenceHash(buffer);

    const original = byHash.get(contentHash);
    if (original && original.id !== row.id) {
      // Unique index: only the original keeps the hash
      exactDuplicates.push([original, row]);
      await sql`update photos set perceptual_hash = ${row.perceptual_hash} where id = ${row.id}`;
    } else {
      byHash.set(contentHash, row);
      await sql`update photos set content_hash = ${contentHash}, perceptual_hash = ${row.perceptual_hash} where id = ${row.id}`;
    }
    console.log(`✓ ${label(row)}`);
  } catch (error) {
    console.error(`✗ ${label(row)}:`, error.message);
  }
}

console.log("\nExact duplicates (same file):");
for (const [original, copy] of exactDuplicates) console.log(`  ${label(copy)} is a copy of ${label(original)}`);
if (exactDuplicates.length === 0) console.log("  none");

console.log(`\nLookalikes (difference ≤ ${LOOKALIKE_MAX_DISTANCE} of 64 bits):`);
const hashed = rows.filter((r) => r.perceptual_hash);
let lookalikes = 0;
for (let i = 0; i < hashed.length; i++) {
  for (let j = i + 1; j < hashed.length; j++) {
    const distance = hammingDistance(hashed[i].perceptual_hash, hashed[j].perceptual_hash);
    if (distance <= LOOKALIKE_MAX_DISTANCE) {
      lookalikes++;
      console.log(`  ${label(hashed[i])} ~ ${label(hashed[j])} (distance ${distance})`);
    }
  }
}
if (lookalikes === 0) console.log("  none");
console.log("\nDelete unwanted copies in Admin → Manage Photos.");

await sql.end();

// Classify photos that haven't been classified yet (tags_pending = 1), e.g.
// photos uploaded before classification existed or where the background call failed.
// Usage: npx dotenv -e .env.local -- node scripts/classify-pending.mjs
import postgres from "postgres";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { classifyPhoto } from "../lib/classify.ts";
import { DEFAULT_CATEGORIES, labelFromSlug } from "../lib/categories.ts";

const sql = postgres(process.env.DATABASE_URL);
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

// Same seeding as lib/category-store.ts, in case the app hasn't run yet
for (const [i, slug] of DEFAULT_CATEGORIES.entries()) {
  await sql`insert into categories (slug, label, source, sort_order)
    values (${slug}, ${labelFromSlug(slug)}, 'seed', ${i}) on conflict do nothing`;
}
const loadCategories = () =>
  sql`select slug, label, source, hidden from categories order by sort_order, created_at`;
let categories = await loadCategories();

const rows = await sql`
  select id, r2_key, caption, tags from photos
  where tags_pending = 1 or categories is null or cardinality(categories) = 0
`;
console.log(`${rows.length} photos to classify`);

for (const row of rows) {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: row.r2_key })
    );
    const result = await classifyPhoto(Buffer.from(await res.Body.transformToByteArray()), categories);
    if (!result) {
      console.log(`⊘ ${row.caption}: not classified`);
      continue;
    }

    for (const slug of result.newCategories) {
      await sql`insert into categories (slug, label, source)
        values (${slug}, ${labelFromSlug(slug)}, 'ai') on conflict do nothing`;
      console.log(`  + new AI category: ${slug}`);
    }
    if (result.newCategories.length) categories = await loadCategories();

    // Only replace captions that are just the uploaded file name
    const captionIsFilename = !row.caption || row.r2_key.endsWith(`_${row.caption}`);
    const caption = captionIsFilename ? result.caption : row.caption;
    const tags = [...new Set([...(row.tags || []), ...result.tags])];

    await sql`
      update photos
      set categories = ${result.categories}, tags = ${tags}, caption = ${caption}, tags_pending = 0
      where id = ${row.id}
    `;
    console.log(`✓ ${row.caption} → [${result.categories}] "${caption}" ${JSON.stringify(result.tags)}`);
  } catch (error) {
    console.error(`✗ ${row.caption}:`, error.message);
  }
}

await sql.end();

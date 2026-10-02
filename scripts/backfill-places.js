// One-off: fill photos.place for rows that have GPS coordinates but no place.
// Usage: npx dotenv -e .env.local -- node scripts/backfill-places.js
const postgres = require("postgres");

const sql = postgres(process.env.DATABASE_URL);

async function reverseGeocode(lat, lng) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=en`,
    { headers: { "User-Agent": "photogallery/1.0 (personal photo gallery)" } }
  );
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const a = (await response.json()).address || {};
  const locality =
    a.city || a.town || a.village || a.hamlet || a.municipality || a.county;
  return [locality, a.country].filter(Boolean).join(", ") || null;
}

async function main() {
  const rows = await sql`
    select id, lat, lng from photos
    where lat is not null and lng is not null and place is null
  `;
  console.log(`${rows.length} photos to backfill`);

  for (const row of rows) {
    try {
      const place = await reverseGeocode(row.lat, row.lng);
      await sql`update photos set place = ${place} where id = ${row.id}`;
      console.log(`✓ ${row.id} → ${place}`);
    } catch (error) {
      console.error(`✗ ${row.id}:`, error.message);
    }
    // Nominatim usage policy: max 1 request per second
    await new Promise((r) => setTimeout(r, 1100));
  }

  await sql.end();
}

main();

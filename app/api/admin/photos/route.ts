import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/index";
import { photos } from "@/lib/schema";

// Admin list: every photo (public and restricted), never cached, so edits and
// deletes show up immediately. The public /api/photos is CDN-cached.
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db.select().from(photos).orderBy(desc(photos.uploadedAt));
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error fetching photos:", error);
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}

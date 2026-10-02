import { inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/index";
import { photos } from "@/lib/schema";

// Which of these SHA-256 file hashes are already in the gallery? The upload page
// calls this before uploading, so exact duplicates never get uploaded.
export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { hashes } = await request.json();
    if (
      !Array.isArray(hashes) ||
      hashes.length > 500 ||
      !hashes.every((h) => typeof h === "string" && /^[0-9a-f]{64}$/.test(h))
    ) {
      return NextResponse.json({ error: "hashes must be up to 500 SHA-256 hex strings" }, { status: 400 });
    }
    if (hashes.length === 0) return NextResponse.json({});

    const rows = await db
      .select({ id: photos.id, caption: photos.caption, contentHash: photos.contentHash })
      .from(photos)
      .where(inArray(photos.contentHash, hashes));

    return NextResponse.json(
      Object.fromEntries(rows.map((r) => [r.contentHash, { id: r.id, caption: r.caption }]))
    );
  } catch (error) {
    console.error("Error checking duplicates:", error);
    return NextResponse.json({ error: "Failed to check duplicates" }, { status: 500 });
  }
}

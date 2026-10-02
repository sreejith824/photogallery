import { NextResponse } from "next/server";
import { listCategories } from "@/lib/category-store";

// Public: categories that aren't hidden. The gallery applies the photo-count rule
// (isCategoryVisible) itself, since it already has the photos.
export async function GET() {
  try {
    const categories = (await listCategories()).filter((c) => !c.hidden);
    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

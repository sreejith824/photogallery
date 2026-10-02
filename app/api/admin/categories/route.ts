import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { listCategories, addCategories, countPhotosByCategory } from "@/lib/category-store";
import { matchCategory, toCategorySlug } from "@/lib/categories";

// All categories, including hidden ones, with photo counts
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [categories, counts] = await Promise.all([listCategories(), countPhotosByCategory()]);
    return NextResponse.json(categories.map((c) => ({ ...c, photoCount: counts[c.slug] ?? 0 })));
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

// Create a category by name
export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name } = await request.json();
    const slug = typeof name === "string" ? toCategorySlug(name) : null;
    if (!slug) {
      return NextResponse.json(
        { error: "Use 1-2 words, letters and numbers only (3-24 characters)" },
        { status: 400 }
      );
    }

    const existing = matchCategory(name, await listCategories());
    if (existing) {
      return NextResponse.json({ error: `"${existing}" already exists` }, { status: 409 });
    }

    await addCategories([slug], "admin");
    return NextResponse.json({ slug }, { status: 201 });
  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}

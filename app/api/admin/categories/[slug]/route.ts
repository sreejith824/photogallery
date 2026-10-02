import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/index";
import { categories } from "@/lib/schema";

type Params = { params: Promise<{ slug: string }> };

// Rename (label only; the slug stays so photos keep pointing at it) and/or hide
export async function PATCH(request: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { slug } = await params;
    const body = await request.json();
    const updates: { label?: string; hidden?: boolean } = {};

    if ("label" in body) {
      const label = typeof body.label === "string" ? body.label.trim() : "";
      if (!label || label.length > 60) {
        return NextResponse.json({ error: "Label must be 1-60 characters" }, { status: 400 });
      }
      updates.label = label;
    }
    if ("hidden" in body) {
      if (typeof body.hidden !== "boolean") {
        return NextResponse.json({ error: "hidden must be true or false" }, { status: 400 });
      }
      updates.hidden = body.hidden;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await db
      .update(categories)
      .set(updates)
      .where(eq(categories.slug, slug))
      .returning();
    if (updated.length === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    return NextResponse.json(updated[0]);
  } catch (error) {
    console.error("Error updating category:", error);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

// Delete a category. With ?mergeInto=<slug>, its photos move to that category
// instead of just losing it.
export async function DELETE(request: NextRequest, { params }: Params) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { slug } = await params;
    const mergeInto = request.nextUrl.searchParams.get("mergeInto");

    const [source] = await db.select().from(categories).where(eq(categories.slug, slug));
    if (!source) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    if (mergeInto) {
      if (mergeInto === slug) {
        return NextResponse.json({ error: "Can't merge a category into itself" }, { status: 400 });
      }
      const [target] = await db.select().from(categories).where(eq(categories.slug, mergeInto));
      if (!target) {
        return NextResponse.json({ error: "Target category not found" }, { status: 404 });
      }
      // Replace the slug and drop duplicates in case a photo already had both
      await db.execute(sql`
        update photos
        set categories = (select array_agg(distinct c) from unnest(array_replace(categories, ${slug}, ${mergeInto})) c)
        where ${slug} = any(categories)
      `);
    } else {
      await db.execute(sql`
        update photos set categories = array_remove(categories, ${slug})
        where ${slug} = any(categories)
      `);
    }

    await db.delete(categories).where(eq(categories.slug, slug));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}

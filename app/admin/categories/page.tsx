"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AI_CATEGORY_MIN_PHOTOS, type Category } from "@/lib/categories";

interface AdminCategory extends Category {
  photoCount: number;
}

const SOURCE_LABEL: Record<Category["source"], string> = {
  seed: "Default",
  admin: "Admin",
  ai: "AI",
};

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ slug: string; label: string } | null>(null);

  // Reload after a change
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/categories");
    if (response.ok) setCategories(await response.json());
  }, []);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load categories");
        return r.json();
      })
      .then(setCategories)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Run an API call, show its error if any, then reload the list
  const run = async (key: string, request: () => Promise<Response>) => {
    setBusy(key);
    setError(null);
    try {
      const response = await request();
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run("create", () =>
      fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      })
    );
    if (ok) setNewName("");
  };

  const update = (slug: string, body: { label?: string; hidden?: boolean }) =>
    run(slug, () =>
      fetch(`/api/admin/categories/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );

  const saveLabel = async () => {
    if (!editing) return;
    const ok = await update(editing.slug, { label: editing.label });
    if (ok) setEditing(null);
  };

  const remove = (category: AdminCategory, mergeInto?: string) => {
    const message = mergeInto
      ? `Merge "${category.label}" into "${categories.find((c) => c.slug === mergeInto)?.label}"? Its ${category.photoCount} photo(s) move over and "${category.label}" is deleted.`
      : `Delete "${category.label}"? It will be removed from ${category.photoCount} photo(s).`;
    if (!confirm(message)) return;
    const query = mergeInto ? `?mergeInto=${encodeURIComponent(mergeInto)}` : "";
    run(category.slug, () =>
      fetch(`/api/admin/categories/${category.slug}${query}`, { method: "DELETE" })
    );
  };

  const galleryStatus = (c: AdminCategory) => {
    if (c.hidden) return { text: "Hidden", className: "text-gray-500" };
    if (c.photoCount === 0) return { text: "No photos yet", className: "text-gray-400" };
    if (c.source === "ai" && c.photoCount < AI_CATEGORY_MIN_PHOTOS) {
      return {
        text: `Shows at ${AI_CATEGORY_MIN_PHOTOS} photos`,
        className: "text-amber-600",
      };
    }
    return { text: "Visible", className: "text-green-700" };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading categories...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <Link href="/admin" className="text-blue-600 hover:text-blue-700">
            ← Back to Admin
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <p className="mb-6 max-w-3xl text-sm text-gray-600">
          The AI reuses these categories and only creates a new one when nothing fits. New AI
          categories appear on the gallery once {AI_CATEGORY_MIN_PHOTOS} photos use them. Rename
          changes the displayed name only; merge moves photos into another category.
        </p>

        <form onSubmit={create} className="mb-6 flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category, e.g. Street Art"
            maxLength={40}
            className="w-72 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!newName.trim() || busy === "create"}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300"
          >
            Add category
          </button>
        </form>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Photos</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gallery</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {categories.map((c) => {
                const status = galleryStatus(c);
                const isEditing = editing?.slug === c.slug;
                return (
                  <tr key={c.slug} className={busy === c.slug ? "opacity-50" : ""}>
                    <td className="px-6 py-4 text-sm">
                      {isEditing ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveLabel();
                          }}
                          className="flex gap-2"
                        >
                          <input
                            autoFocus
                            value={editing.label}
                            onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                            onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                            maxLength={60}
                            className="w-44 px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <button type="submit" className="text-blue-600 hover:text-blue-700">
                            Save
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className="text-gray-500">
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="font-medium text-gray-900">{c.label}</span>
                          <span className="ml-2 font-mono text-xs text-gray-400">{c.slug}</span>
                        </>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.source === "ai" ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {SOURCE_LABEL[c.source]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{c.photoCount}</td>
                    <td className={`px-6 py-4 text-sm ${status.className}`}>{status.text}</td>
                    <td className="px-6 py-4 text-right text-sm whitespace-nowrap">
                      <button
                        onClick={() => setEditing({ slug: c.slug, label: c.label })}
                        disabled={busy !== null}
                        className="mr-4 text-blue-600 hover:text-blue-700"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => update(c.slug, { hidden: !c.hidden })}
                        disabled={busy !== null}
                        className="mr-4 text-blue-600 hover:text-blue-700"
                      >
                        {c.hidden ? "Show" : "Hide"}
                      </button>
                      <select
                        value=""
                        onChange={(e) => e.target.value && remove(c, e.target.value)}
                        disabled={busy !== null}
                        aria-label={`Merge ${c.label} into`}
                        className="mr-4 border border-gray-300 rounded px-1 py-0.5 text-sm text-gray-700"
                      >
                        <option value="">Merge into…</option>
                        {categories
                          .filter((t) => t.slug !== c.slug)
                          .map((t) => (
                            <option key={t.slug} value={t.slug}>
                              {t.label}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => remove(c)}
                        disabled={busy !== null}
                        className="text-red-600 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { Category } from "@/lib/categories";

export interface EditablePhoto {
  id: string;
  caption: string | null;
  categories: string[] | null;
  thumbnailKey: string | null;
}

interface EditPhotoDialogProps {
  photo: EditablePhoto;
  onClose: () => void;
  onSaved: (photo: { id: string; caption: string | null; categories: string[] }) => void;
}

export default function EditPhotoDialog({ photo, onClose, onSaved }: EditPhotoDialogProps) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [categories, setCategories] = useState<string[]>(photo.categories ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allCategories, setAllCategories] = useState<Category[]>([]);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAllCategories)
      .catch(() => setAllCategories([]));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleCategory = (category: string) =>
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Keep the stored order consistent with the gallery's category order
        body: JSON.stringify({
          caption,
          categories: allCategories.length
            ? allCategories.map((c) => c.slug).filter((slug) => categories.includes(slug))
            : categories,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save");
      onSaved(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit photo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex gap-4">
          <div className="h-24 w-24 flex-none overflow-hidden rounded bg-gray-100">
            {photo.thumbnailKey && (
              <img
                src={`/api/photos/${photo.id}/thumbnail`}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Edit photo</h2>
            <label className="mt-3 block text-sm font-medium text-gray-700" htmlFor="caption">
              Caption
            </label>
            <input
              id="caption"
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={500}
              autoFocus
              placeholder="Untitled"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-gray-700">Categories</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {allCategories.map(({ slug, label, hidden }) => {
              const active = categories.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => toggleCategory(slug)}
                  title={hidden ? "Hidden from the gallery" : undefined}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-sm transition ${hidden ? "border-dashed " : ""}${
                    active
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-300 text-gray-700 hover:border-gray-400"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {categories.length === 0 && (
            <p className="mt-2 text-xs text-gray-500">
              No category: the photo only shows under &ldquo;All&rdquo;.
            </p>
          )}
        </fieldset>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Lightbox from "@/components/Lightbox";
import EditPhotoDialog from "@/components/EditPhotoDialog";

interface Photo {
  id: string;
  caption: string | null;
  r2Key: string;
  visibility: string;
  uploadedAt: string;
  takenAt: string | null;
  place: string | null;
  thumbnailKey: string | null;
  categories: string[] | null;
}

export default function AdminPhotosPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const allSelected = photos.length > 0 && selected.size === photos.length;
  const previewIndex = photos.findIndex((p) => p.id === previewId);
  const editingPhoto = photos.find((p) => p.id === editingId);

  // Show the header checkbox as "partly selected" when only some rows are ticked
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && !allSelected;
    }
  }, [selected, allSelected]);

  const toggleSelected = (photoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(photos.map((p) => p.id)));
  };

  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        const response = await fetch("/api/photos?limit=1000");
        if (!response.ok) throw new Error("Failed to fetch photos");
        const data = await response.json();
        setPhotos(data);
      } catch (error) {
        console.error("Error fetching photos:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPhotos();
  }, []);

  const handleDelete = async (photoId: string) => {
    if (!confirm("Delete this photo? This cannot be undone.")) return;

    setDeleting(photoId);
    try {
      const response = await fetch(`/api/admin/photos/${photoId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");

      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete photo");
    } finally {
      setDeleting(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!confirm(`Delete ${ids.length} photo${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;

    setBulkDeleting(true);
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const response = await fetch(`/api/admin/photos/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error(`Failed to delete ${id}`);
        return id;
      })
    );

    const deleted = new Set(
      results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
    );
    setPhotos((prev) => prev.filter((p) => !deleted.has(p.id)));
    // Keep failed ones selected so they can be retried
    setSelected((prev) => new Set([...prev].filter((id) => !deleted.has(id))));
    setBulkDeleting(false);

    const failed = ids.length - deleted.size;
    if (failed > 0) alert(`${failed} photo${failed === 1 ? "" : "s"} could not be deleted`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading photos...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">All Photos</h1>
          <Link
            href="/admin"
            className="text-blue-600 hover:text-blue-700"
          >
            ← Back to Admin
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {photos.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg">
            <p className="text-gray-500">No photos yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Bulk actions */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
              <span className="text-sm text-gray-600">
                {selected.size > 0
                  ? `${selected.size} of ${photos.length} selected`
                  : `${photos.length} photos`}
              </span>
              <button
                onClick={handleBulkDelete}
                disabled={selected.size === 0 || bulkDeleting}
                className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:bg-gray-300"
              >
                {bulkDeleting ? "Deleting..." : `Delete selected${selected.size ? ` (${selected.size})` : ""}`}
              </button>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-12 pl-6 py-3 text-left">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all photos"
                      className="h-4 w-4 cursor-pointer accent-blue-600"
                    />
                  </th>
                  <th className="w-20 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preview</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Caption</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categories</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Visibility</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {photos.map((photo) => (
                  <tr
                    key={photo.id}
                    className={selected.has(photo.id) ? "bg-blue-50" : "hover:bg-gray-50"}
                  >
                    <td className="w-12 pl-6 py-4">
                      <input
                        type="checkbox"
                        checked={selected.has(photo.id)}
                        onChange={() => toggleSelected(photo.id)}
                        aria-label={`Select ${photo.caption || "photo"}`}
                        className="h-4 w-4 cursor-pointer accent-blue-600"
                      />
                    </td>
                    <td className="w-20 px-3 py-2">
                      <button
                        onClick={() => setPreviewId(photo.id)}
                        aria-label={`Preview ${photo.caption || "photo"}`}
                        className="block h-14 w-14 overflow-hidden rounded bg-gray-100 ring-blue-500 transition hover:ring-2"
                      >
                        {photo.thumbnailKey ? (
                          <img
                            src={`/api/photos/${photo.id}/thumbnail`}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                            None
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      <button
                        onClick={() => setPreviewId(photo.id)}
                        className="text-blue-600 hover:text-blue-700 truncate max-w-xs block text-left"
                      >
                        {photo.caption || "(Untitled)"}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {photo.categories?.length ? (
                          photo.categories.map((c) => (
                            <span
                              key={c}
                              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-700"
                            >
                              {c}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        photo.visibility === "public"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                        {photo.visibility}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(photo.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right text-sm whitespace-nowrap">
                      <button
                        onClick={() => setEditingId(photo.id)}
                        className="mr-4 text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(photo.id)}
                        disabled={deleting === photo.id}
                        className="text-red-600 hover:text-red-700 disabled:text-gray-400 font-medium"
                      >
                        {deleting === photo.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingPhoto && (
        <EditPhotoDialog
          photo={editingPhoto}
          onClose={() => setEditingId(null)}
          onSaved={(saved) => {
            setPhotos((prev) =>
              prev.map((p) =>
                p.id === saved.id
                  ? { ...p, caption: saved.caption, categories: saved.categories }
                  : p
              )
            );
            setEditingId(null);
          }}
        />
      )}

      {previewIndex >= 0 && (
        <Lightbox
          photos={photos}
          index={previewIndex}
          label="Manage"
          onIndexChange={(i) => setPreviewId(photos[i].id)}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}

"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import Link from "next/link";

interface Photo {
  id: string;
  r2Key: string;
  thumbnailKey: string | null;
  caption: string | null;
  takenAt: string | null;
  place: string | null;
  tags: string[];
  visibility: string;
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ year?: string; place?: string }>({});

  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        const params = new URLSearchParams();
        if (filter.year) params.append("year", filter.year);
        if (filter.place) params.append("place", filter.place);

        const response = await fetch(`/api/photos?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch photos");

        const data = await response.json();
        setPhotos(data);
      } catch (error) {
        console.error("Failed to fetch photos:", error);
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPhotos();
  }, [filter]);

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
          <h1 className="text-2xl font-bold text-gray-900">PhotoGallery</h1>
          <Link href="/admin" className="text-blue-600 hover:text-blue-700">
            Admin
          </Link>
        </div>
      </nav>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-4 flex-wrap">
          <input
            type="number"
            placeholder="Filter by year"
            onChange={(e) =>
              setFilter((prev) => ({ ...prev, year: e.target.value }))
            }
            className="px-4 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="text"
            placeholder="Filter by place"
            onChange={(e) =>
              setFilter((prev) => ({ ...prev, place: e.target.value }))
            }
            className="px-4 py-2 border border-gray-300 rounded-lg"
          />
          <button
            onClick={() => setFilter({})}
            className="px-4 py-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {photos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No photos yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {photos.map((photo) => (
              <Link key={photo.id} href={`/photo/${photo.id}`}>
                <div className="bg-white rounded-lg overflow-hidden shadow hover:shadow-lg transition cursor-pointer">
                  <div className="aspect-square bg-gray-200 relative">
                    {photo.thumbnailKey ? (
                      <Image
                        src={`/api/photos/${photo.id}/thumbnail`}
                        alt={photo.caption || "Photo"}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        No thumbnail
                      </div>
                    )}
                    {photo.visibility === "restricted" && (
                      <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 text-xs rounded">
                        🔒 Restricted
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {photo.caption || "Untitled"}
                    </h3>
                    {photo.place && (
                      <p className="text-xs text-gray-500">{photo.place}</p>
                    )}
                    {photo.takenAt && (
                      <p className="text-xs text-gray-400">
                        {new Date(photo.takenAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

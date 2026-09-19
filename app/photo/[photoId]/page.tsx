"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import RequestAccessForm from "@/components/RequestAccessForm";

interface Photo {
  id: string;
  r2Key: string;
  thumbnailKey: string | null;
  caption: string | null;
  takenAt: string | null;
  place: string | null;
  tags: string[];
  visibility: string;
  imageUrl: string;
}

export default function PhotoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const photoId = params.photoId as string;

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPhoto = async () => {
      try {
        const response = await fetch(`/api/photos/${photoId}`);
        if (!response.ok) {
          throw new Error("Photo not found");
        }
        const data = await response.json();
        setPhoto(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load photo");
      } finally {
        setLoading(false);
      }
    };

    fetchPhoto();
  }, [photoId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error || !photo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "Photo not found"}</p>
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-700"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-700"
          >
            ← Back to gallery
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {photo.visibility === "restricted" ? (
          <div className="bg-white rounded-lg shadow p-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                🔒 This photo is restricted
              </h1>
              <p className="text-gray-600 mb-6">
                To view this photo, please request access from the owner.
              </p>
              <RequestAccessForm photoId={photoId} />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Image */}
            <div className="relative w-full">
              <img
                src={photo.imageUrl}
                alt={photo.caption || "Photo"}
                className="w-full h-auto"
              />
            </div>

            {/* Info */}
            <div className="p-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                {photo.caption || "Untitled"}
              </h1>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {photo.takenAt && (
                  <div>
                    <p className="text-sm text-gray-500">Date taken</p>
                    <p className="text-lg font-medium text-gray-900">
                      {new Date(photo.takenAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                )}
                {photo.place && (
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="text-lg font-medium text-gray-900">
                      {photo.place}
                    </p>
                  </div>
                )}
              </div>

              {/* Tags */}
              {photo.tags && photo.tags.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {photo.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

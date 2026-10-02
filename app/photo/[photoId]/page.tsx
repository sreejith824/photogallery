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
      <div className="grain min-h-screen bg-background flex items-center justify-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted animate-pulse">
          Developing…
        </p>
      </div>
    );
  }

  if (error || !photo) {
    return (
      <div className="grain min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <p className="font-display text-5xl italic mb-6">
            {error || "Photo not found"}
          </p>
          <button
            onClick={() => router.back()}
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent hover:underline underline-offset-4"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  const takenAt =
    photo.takenAt &&
    new Date(photo.takenAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  return (
    <div className="grain min-h-screen bg-background text-foreground">
      {/* Header */}
      <nav className="flex items-center justify-between px-5 sm:px-10 py-6 font-mono text-[11px] uppercase tracking-[0.2em]">
        <button
          onClick={() => router.back()}
          className="group flex items-center gap-2"
        >
          <span className="transition-transform duration-300 group-hover:-translate-x-1">
            ←
          </span>
          Back to gallery
        </button>
        <span className="text-muted">Photo Pond</span>
      </nav>

      {photo.visibility === "restricted" ? (
        <main className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-10 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div className="rise">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              Private frame
            </p>
            <h1 className="mt-4 font-display text-6xl sm:text-7xl leading-[0.9] tracking-[-0.03em]">
              This one is <span className="italic">kept close.</span>
            </h1>
            <p className="mt-6 max-w-sm text-lg leading-snug text-foreground/70">
              Leave your details and a note. If the owner says yes, you&apos;ll
              get a private link by email.
            </p>
          </div>
          <div className="rise [animation-delay:150ms]">
            <RequestAccessForm photoId={photoId} />
          </div>
        </main>
      ) : (
        <main>
          {/* Image */}
          <div className="develop flex justify-center px-2 sm:px-10">
            <img
              src={photo.imageUrl}
              alt={photo.caption || "Photo"}
              className="max-h-[82vh] w-auto max-w-full object-contain shadow-[0_30px_60px_-30px_rgba(0,0,0,0.45)]"
            />
          </div>

          {/* Info */}
          <section className="mx-auto mt-14 grid max-w-6xl gap-10 border-t border-rule px-5 sm:px-10 pt-10 pb-24 md:grid-cols-[2fr_1fr]">
            <h1 className="rise font-display text-5xl sm:text-7xl leading-[0.9] tracking-[-0.03em] break-words [animation-delay:200ms]">
              {photo.caption || <span className="italic">Untitled</span>}
            </h1>

            <dl className="rise space-y-5 font-mono text-[11px] uppercase tracking-[0.2em] [animation-delay:300ms]">
              {takenAt && (
                <div className="flex justify-between gap-4 border-b border-rule pb-3">
                  <dt className="text-muted">Date</dt>
                  <dd className="text-right">{takenAt}</dd>
                </div>
              )}
              {photo.place && (
                <div className="flex justify-between gap-4 border-b border-rule pb-3">
                  <dt className="text-muted">Place</dt>
                  <dd className="text-right">{photo.place}</dd>
                </div>
              )}
              {photo.tags && photo.tags.length > 0 && (
                <div>
                  <dt className="mb-3 text-muted">Tags</dt>
                  <dd className="flex flex-wrap gap-2">
                    {photo.tags.map((tag) => (
                      <span
                        key={tag}
                        className="border border-foreground/20 px-2.5 py-1 normal-case tracking-normal"
                      >
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </main>
      )}
    </div>
  );
}

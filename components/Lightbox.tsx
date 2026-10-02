"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

export interface LightboxPhoto {
  id: string;
  thumbnailKey: string | null;
  caption: string | null;
  takenAt: string | null;
  place: string | null;
}

interface LightboxProps {
  photos: LightboxPhoto[];
  index: number;
  label: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  // Paginated lists: more photos exist beyond `photos`
  hasMore?: boolean;
  onNeedMore?: () => void;
  // Total across all pages, for the counter
  total?: number;
}

// Full-size URLs are presigned per photo, so fetch them lazily and cache by id
const imageUrlCache = new Map<string, Promise<string | null>>();

function getImageUrl(id: string): Promise<string | null> {
  let cached = imageUrlCache.get(id);
  if (!cached) {
    cached = fetch(`/api/photos/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.imageUrl ?? null)
      .catch(() => null);
    imageUrlCache.set(id, cached);
  }
  return cached;
}

function preload(id: string) {
  getImageUrl(id).then((url) => {
    if (url) new Image().src = url;
  });
}

export default function Lightbox({
  photos,
  index,
  label,
  onIndexChange,
  onClose,
  hasMore = false,
  onNeedMore,
  total,
}: LightboxProps) {
  const photo = photos[index];
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null);
  const touchStartX = useRef<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (delta: number) => {
      // At the end of a paginated list, load the next page instead of wrapping
      if (delta > 0 && index === photos.length - 1 && hasMore) {
        onNeedMore?.();
        return;
      }
      // Wrap around at both ends
      onIndexChange((index + delta + photos.length) % photos.length);
    },
    [index, photos.length, onIndexChange, hasMore, onNeedMore]
  );

  // Fetch the next page a few photos before the end, so stepping stays smooth
  useEffect(() => {
    if (hasMore && index >= photos.length - 3) onNeedMore?.();
  }, [index, photos.length, hasMore, onNeedMore]);

  // Load the current photo and warm up its neighbours
  useEffect(() => {
    let cancelled = false;
    getImageUrl(photo.id).then((url) => {
      if (!cancelled && url) setLoaded({ id: photo.id, url });
    });
    if (photos.length > 1) {
      preload(photos[(index + 1) % photos.length].id);
      preload(photos[(index - 1 + photos.length) % photos.length].id);
    }
    return () => {
      cancelled = true;
    };
  }, [photo.id, index, photos]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Lock page scroll while open
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Keep the active thumbnail in view
  useEffect(() => {
    stripRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);

  const fullUrl = loaded?.id === photo.id ? loaded.url : null;
  const meta = [
    photo.place,
    photo.takenAt &&
      new Date(photo.takenAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
  ].filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[60] flex flex-col bg-[#0d0d0c] text-white"
      onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchStartX.current = null;
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 sm:px-8 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
        <span>
          <span className="text-white">{label}</span>
          <span className="mx-3 text-white/30">/</span>
          {String(index + 1).padStart(2, "0")} — {String(total ?? photos.length).padStart(2, "0")}
        </span>
        <div className="flex items-center gap-6">
          <Link href={`/photo/${photo.id}`} className="hover:text-white">
            Details
          </Link>
          <button onClick={onClose} className="hover:text-white" aria-label="Close">
            Close ✕
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-20">
        {/* Thumbnail stands in until the full image arrives */}
        {!fullUrl && photo.thumbnailKey && (
          <img
            src={`/api/photos/${photo.id}/thumbnail`}
            alt=""
            className="max-h-full max-w-full scale-95 object-contain opacity-60 blur-sm"
          />
        )}
        {fullUrl && (
          <img
            key={photo.id}
            src={fullUrl}
            alt={photo.caption || "Photo"}
            className="develop max-h-full max-w-full object-contain"
          />
        )}

        {photos.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="group absolute inset-y-0 left-0 hidden w-20 items-center justify-center sm:flex"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-xl transition group-hover:border-white group-hover:bg-white group-hover:text-black">
                ←
              </span>
            </button>
            <button
              onClick={() => go(1)}
              aria-label="Next photo"
              className="group absolute inset-y-0 right-0 hidden w-20 items-center justify-center sm:flex"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-xl transition group-hover:border-white group-hover:bg-white group-hover:text-black">
                →
              </span>
            </button>
          </>
        )}
      </div>

      {/* Caption */}
      <div className="px-5 sm:px-8 pt-5 text-center">
        <h2 className="font-display text-3xl sm:text-4xl leading-tight">
          {photo.caption || <span className="italic text-white/50">Untitled</span>}
        </h2>
        {meta.length > 0 && (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
            {meta.join(" · ")}
          </p>
        )}
      </div>

      {/* Filmstrip */}
      {photos.length > 1 && (
        <div
          ref={stripRef}
          className="mx-auto flex max-w-full gap-1.5 overflow-x-auto px-5 py-4 [scrollbar-width:none]"
        >
          {photos.map((p, i) => (
            <button
              key={p.id}
              data-index={i}
              onClick={() => onIndexChange(i)}
              aria-label={`Show ${p.caption || `photo ${i + 1}`}`}
              className={`h-14 w-14 flex-none overflow-hidden transition ${
                i === index
                  ? "opacity-100 ring-2 ring-accent ring-offset-2 ring-offset-[#0d0d0c]"
                  : "opacity-40 hover:opacity-80"
              }`}
            >
              {p.thumbnailKey && (
                <img
                  src={`/api/photos/${p.id}/thumbnail`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

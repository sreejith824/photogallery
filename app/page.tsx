"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Lightbox from "@/components/Lightbox";
import { isCategoryVisible, labelFromSlug, type Category } from "@/lib/categories";

interface Photo {
  id: string;
  r2Key: string;
  thumbnailKey: string | null;
  caption: string | null;
  takenAt: string | null;
  place: string | null;
  tags: string[];
  categories: string[] | null;
  visibility: string;
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ year?: string; place?: string }>({});
  const [category, setCategory] = useState<string | null>(null);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [categoryList, setCategoryList] = useState<Category[]>([]);

  // Categories come from the database (seeded, admin-made or AI-made)
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCategoryList)
      .catch(() => setCategoryList([]));
  }, []);

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

  const hasFilter = Boolean(filter.year || filter.place);

  const categoryCounts = categoryList
    .map((c) => ({
      name: c.slug,
      label: c.label,
      count: photos.filter((p) => p.categories?.includes(c.slug)).length,
      category: c,
    }))
    .filter((c) => isCategoryVisible(c.category, c.count));
  const categoryLabel = category
    ? (categoryList.find((c) => c.slug === category)?.label ?? labelFromSlug(category))
    : "All";
  const visiblePhotos = category
    ? photos.filter((p) => p.categories?.includes(category))
    : photos;
  // The carousel walks through what's on screen; private photos open their own page
  const carouselPhotos = visiblePhotos.filter((p) => p.visibility !== "restricted");
  const openIndex = carouselPhotos.findIndex((p) => p.id === openPhotoId);

  return (
    <div className="grain min-h-screen bg-background text-foreground">
      {/* Header */}
      <nav className="flex items-center justify-between px-5 sm:px-10 pt-6 font-mono text-[11px] uppercase tracking-[0.2em]">
        <span className="rise">Index</span>
        <Link
          href="/admin"
          className="rise group relative [animation-delay:100ms]"
        >
          Admin
          <span className="absolute -bottom-1 left-0 h-px w-0 bg-foreground transition-all duration-300 group-hover:w-full" />
        </Link>
      </nav>

      {/* Masthead */}
      <header className="px-5 sm:px-10 pt-12 sm:pt-16 pb-8 sm:pb-12">
        <h1 className="rise font-display leading-[0.85] tracking-[-0.03em] text-[clamp(3.5rem,10vw,9rem)] [animation-delay:150ms]">
          Photo <span className="italic text-accent">pond</span>
        </h1>
        <div className="mt-8 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <p className="rise max-w-md text-lg leading-snug text-foreground/80 [animation-delay:300ms]">
            Moments, places and the light in between. A personal archive,
            kept slowly.
          </p>
          <p className="rise font-mono text-[11px] uppercase tracking-[0.2em] text-muted [animation-delay:400ms]">
            {loading ? "—" : String(visiblePhotos.length).padStart(3, "0")} frames
          </p>
        </div>
      </header>

      {/* Categories */}
      {categoryCounts.length > 0 && (
        <nav className="rise flex flex-wrap items-baseline gap-x-7 gap-y-2 px-5 sm:px-10 pb-8 [animation-delay:450ms]">
          {[{ name: null, label: "All", count: photos.length }, ...categoryCounts].map((c) => {
            const active = category === c.name;
            return (
              <button
                key={c.name ?? "all"}
                onClick={() => setCategory(c.name)}
                className={`group flex items-baseline gap-1.5 font-display text-3xl sm:text-4xl leading-none transition-colors ${
                  active ? "italic text-accent" : "text-foreground/45 hover:text-foreground"
                }`}
              >
                {c.label}
                <sup className="font-mono text-[10px] not-italic tracking-[0.15em] text-muted">
                  {String(c.count).padStart(2, "0")}
                </sup>
              </button>
            );
          })}
        </nav>
      )}

      {/* Filters */}
      <div className="rise sticky top-0 z-40 border-y border-rule bg-background/85 backdrop-blur-md [animation-delay:500ms]">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 sm:px-10 py-3 font-mono text-[11px] uppercase tracking-[0.2em]">
          <span className="text-muted">Filter</span>
          <label className="flex items-center gap-2">
            <span className="text-muted">Year</span>
            <input
              type="number"
              placeholder="any"
              value={filter.year ?? ""}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, year: e.target.value }))
              }
              className="w-20 border-b border-transparent bg-transparent py-1 outline-none placeholder:text-foreground/30 focus:border-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted">Place</span>
            <input
              type="text"
              placeholder="anywhere"
              value={filter.place ?? ""}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, place: e.target.value }))
              }
              className="w-36 border-b border-transparent bg-transparent py-1 uppercase outline-none placeholder:text-foreground/30 focus:border-foreground"
            />
          </label>
          {hasFilter && (
            <button
              onClick={() => setFilter({})}
              className="ml-auto text-accent hover:underline underline-offset-4"
            >
              Clear ×
            </button>
          )}
        </div>
      </div>

      {/* Gallery Grid */}
      <main className="px-1.5 sm:px-2 py-1.5 sm:py-2">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5 sm:gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse bg-rule/50"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        ) : visiblePhotos.length === 0 ? (
          <div className="px-4 py-32 text-center">
            <p className="font-display text-4xl italic text-muted">
              {hasFilter || category ? "Nothing matches that." : "The darkroom is empty."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5 sm:gap-2">
            {visiblePhotos.map((photo, i) => (
              <Link
                key={`${category ?? "all"}-${photo.id}`}
                href={`/photo/${photo.id}`}
                className="develop group relative block aspect-square overflow-hidden bg-rule/40"
                style={{ animationDelay: `${Math.min(i, 12) * 70}ms` }}
                onClick={(e) => {
                  // Plain clicks open the carousel; cmd/ctrl-click still opens the page
                  if (photo.visibility === "restricted" || e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  setOpenPhotoId(photo.id);
                }}
              >
                {photo.thumbnailKey ? (
                  <img
                    src={`/api/photos/${photo.id}/thumbnail`}
                    alt={photo.caption || "Photo"}
                    loading="lazy"
                    className={`h-full w-full object-cover transition duration-[900ms] ease-out group-hover:scale-[1.06] ${
                      photo.visibility === "restricted"
                        ? "blur-md grayscale"
                        : ""
                    }`}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                    No preview
                  </div>
                )}

                {/* Frame number */}
                <span className="absolute left-3 top-3 font-mono text-[10px] tracking-[0.2em] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                  {String(i + 1).padStart(3, "0")}
                </span>

                {photo.visibility === "restricted" && (
                  <span className="absolute right-3 top-3 bg-foreground px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-background">
                    Private
                  </span>
                )}

                {/* Hover caption */}
                <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4 pt-12 text-white transition-transform duration-500 ease-out group-hover:translate-y-0">
                  <h3 className="truncate font-display text-2xl leading-tight">
                    {photo.caption || "Untitled"}
                  </h3>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">
                    {[
                      photo.place,
                      photo.takenAt &&
                        new Date(photo.takenAt).getFullYear().toString(),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "View"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {openIndex >= 0 && (
        <Lightbox
          photos={carouselPhotos}
          index={openIndex}
          label={categoryLabel}
          onIndexChange={(i) => setOpenPhotoId(carouselPhotos[i].id)}
          onClose={() => setOpenPhotoId(null)}
        />
      )}

      {/* Footer */}
      <footer className="mt-24 border-t border-rule px-5 sm:px-10 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <p className="font-display text-5xl sm:text-6xl leading-none tracking-[-0.02em]">
            Thanks for <span className="italic">looking.</span>
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            © {new Date().getFullYear()} Photo Pond
          </p>
        </div>
      </footer>
    </div>
  );
}

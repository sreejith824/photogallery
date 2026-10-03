"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Lightbox from "@/components/Lightbox";
import { isCategoryVisible, labelFromSlug, type Category } from "@/lib/categories";
import { parseSearch } from "@/lib/search";

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

interface PhotoPage {
  photos: Photo[];
  nextCursor: string | null;
  total?: number;
  categoryCounts?: Record<string, number>;
}

// Everything loaded for one query (search + category). Keyed so responses for
// an older query are ignored.
interface GalleryResult {
  key: string;
  photos: Photo[];
  nextCursor: string | null;
  total: number;
  categoryCounts: Record<string, number>;
}

export default function GalleryPage() {
  // What's typed, and the search actually applied (debounced)
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  // Phone only: the category list is folded behind a toggle
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [result, setResult] = useState<GalleryResult | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Cursor currently being fetched. A ref, so callers firing in the same tick
  // (scroll observer + carousel) don't fetch the same page twice.
  const inFlightCursor = useRef<string | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (category) params.set("category", category);
  const queryKey = params.toString();
  const queryKeyRef = useRef(queryKey);

  // Categories come from the database (seeded, admin-made or AI-made)
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCategoryList)
      .catch(() => setCategoryList([]));
  }, []);

  // Apply the search once typing pauses
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  // First page whenever the search or category change
  useEffect(() => {
    queryKeyRef.current = queryKey;
    fetch(`/api/photos?${queryKey}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch photos");
        return r.json() as Promise<PhotoPage>;
      })
      .then((page) => ({
        key: queryKey,
        photos: page.photos,
        nextCursor: page.nextCursor,
        total: page.total ?? page.photos.length,
        categoryCounts: page.categoryCounts ?? {},
      }))
      .catch((error) => {
        console.error("Failed to fetch photos:", error);
        return { key: queryKey, photos: [], nextCursor: null, total: 0, categoryCounts: {} };
      })
      .then((next) => {
        if (queryKeyRef.current === next.key) setResult(next);
      });
  }, [queryKey]);

  const current = result?.key === queryKey ? result : null;
  const loading = !current;
  const nextCursor = current?.nextCursor ?? null;

  const loadMore = useCallback(async () => {
    if (!current?.nextCursor || inFlightCursor.current === current.nextCursor) return;
    inFlightCursor.current = current.nextCursor;
    setLoadingMore(true);
    try {
      const query = new URLSearchParams(current.key);
      query.set("cursor", current.nextCursor);
      const response = await fetch(`/api/photos?${query.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch photos");
      const page: PhotoPage = await response.json();
      setResult((prev) => {
        if (!prev || prev.key !== current.key) return prev;
        const seen = new Set(prev.photos.map((p) => p.id));
        return {
          ...prev,
          photos: [...prev.photos, ...page.photos.filter((p) => !seen.has(p.id))],
          nextCursor: page.nextCursor,
        };
      });
    } catch (error) {
      console.error("Failed to load more photos:", error);
    } finally {
      inFlightCursor.current = null;
      setLoadingMore(false);
    }
  }, [current]);

  // Infinite scroll: load the next page when the end of the grid comes into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(),
      { rootMargin: "800px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadMore]);

  const photos = current?.photos ?? [];
  const counts = current?.categoryCounts ?? {};
  // How the search was read, shown as removable chips
  const chips = search ? parseSearch(search, categoryList).chips : [];
  const applySearch = (text: string) => {
    setQuery(text);
    setSearch(text.trim());
  };

  const categoryCounts = categoryList
    .map((c) => ({
      name: c.slug,
      label: c.label,
      count: counts[c.slug] ?? 0,
      category: c,
    }))
    .filter((c) => isCategoryVisible(c.category, c.count));
  const categoryLabel = category
    ? (categoryList.find((c) => c.slug === category)?.label ?? labelFromSlug(category))
    : "All";
  // Photos matching the current view across all pages (not just those loaded)
  const frameCount = category ? (counts[category] ?? 0) : (current?.total ?? 0);
  // The server already filtered by category
  const visiblePhotos = photos;
  // The carousel walks through what's on screen; private photos open their own page
  const carouselPhotos = visiblePhotos.filter((p) => p.visibility !== "restricted");
  const openIndex = carouselPhotos.findIndex((p) => p.id === openPhotoId);

  return (
    <div className="grain min-h-screen bg-background text-foreground">
      {/* Header */}
      <nav className="flex items-center justify-end px-5 sm:px-10 pt-6 font-mono text-[11px] uppercase tracking-[0.2em]">
        <Link
          href="/admin"
          className="rise group relative [animation-delay:100ms]"
        >
          Admin
          <span className="absolute -bottom-1 left-0 h-px w-0 bg-foreground transition-all duration-300 group-hover:w-full" />
        </Link>
      </nav>

      {/* Masthead */}
      <header className="px-5 sm:px-10 pt-4 sm:pt-6 pb-8 sm:pb-12">
        <h1 className="rise font-display leading-[0.85] tracking-[-0.03em] text-[clamp(2.5rem,7vw,6rem)] [animation-delay:150ms]">
          Photo <span className="italic text-accent">pond</span>
        </h1>
        <p className="rise mt-6 max-w-md text-lg leading-snug text-foreground/80 [animation-delay:300ms]">
          Moments, places and the light in between. A personal archive, kept
          slowly.
        </p>
      </header>

      {/* Categories */}
      {categoryCounts.length > 0 && (
        <nav className="rise px-5 sm:px-10 pb-6 sm:pb-8 [animation-delay:450ms]">
          {/* Phone: show the current category, expand the full list on tap */}
          <button
            onClick={() => setCategoriesOpen((open) => !open)}
            aria-expanded={categoriesOpen}
            className="flex w-full items-baseline gap-1.5 sm:hidden"
          >
            <span className="font-display text-3xl italic leading-none text-accent">
              {categoryLabel}
            </span>
            <sup className="font-mono text-[10px] tracking-[0.15em] text-muted">
              {String(frameCount).padStart(2, "0")}
            </sup>
            <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
              {categoriesOpen ? "Close ×" : "Categories ≡"}
            </span>
          </button>
          <div
            className={`${categoriesOpen ? "flex" : "hidden"} mt-4 flex-wrap items-baseline gap-x-6 gap-y-2 sm:mt-0 sm:flex sm:gap-x-7`}
          >
            {[{ name: null, label: "All", count: current?.total ?? 0 }, ...categoryCounts].map((c) => {
              const active = category === c.name;
              return (
                <button
                  key={c.name ?? "all"}
                  onClick={() => {
                    setCategory(c.name);
                    setCategoriesOpen(false);
                  }}
                  className={`group flex items-baseline gap-1.5 font-display text-2xl sm:text-4xl leading-none transition-colors ${
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
          </div>
        </nav>
      )}

      {/* Search */}
      <div className="rise sticky top-0 z-40 border-y border-rule bg-background/85 backdrop-blur-md [animation-delay:500ms]">
        <div className="px-5 sm:px-10 py-3">
          <div className="flex items-center gap-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch(query)}
              placeholder="Search — nature, summer 2018, oslo…"
              aria-label="Search photos"
              className="min-w-0 flex-1 border-b border-transparent bg-transparent py-1 font-mono text-[13px] outline-none placeholder:text-foreground/35 focus:border-foreground [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query && (
              <button
                onClick={() => applySearch("")}
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent hover:underline underline-offset-4"
              >
                Clear ×
              </button>
            )}
          </div>
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {chips.map((chip, i) => (
                <button
                  key={`${chip.label}-${i}`}
                  onClick={() =>
                    applySearch(chips.filter((_, j) => j !== i).flatMap((c) => c.words).join(" "))
                  }
                  aria-label={`Remove ${chip.label}`}
                  className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70 transition-colors hover:border-accent hover:text-accent"
                >
                  {chip.label} ×
                </button>
              ))}
            </div>
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
              {search || category ? "Nothing matches that." : "The darkroom is empty."}
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
        {/* Infinite scroll trigger, with a button in case the observer doesn't fire */}
        <div ref={sentinelRef} />
        {nextCursor && (
          <div className="flex justify-center py-10">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-foreground disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
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
          hasMore={Boolean(nextCursor)}
          onNeedMore={loadMore}
          total={frameCount}
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

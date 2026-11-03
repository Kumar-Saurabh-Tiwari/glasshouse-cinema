/**
 * VideoLibrary — the main screen: header, smart search (debounced, partial
 * match), the responsive grid of glass movie cards, and the glass player
 * overlay. Loads the library from /api/videos.
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FolderOpen, Search, TriangleAlert, X } from "lucide-react";

import type { VideoMeta, VideosResponse } from "@/lib/types";
import { formatBytes, formatDuration } from "@/lib/format";
import { MovieCard } from "@/components/MovieCard";
import { VideoPlayer } from "@/components/VideoPlayer";

export function VideoLibrary() {
  const [videos, setVideos] = useState<VideoMeta[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceDir, setSourceDir] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<VideoMeta | null>(null);

  /* Load the library once on mount. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/videos")
      .then((response) => response.json())
      .then((data: VideosResponse) => {
        if (cancelled) return;
        setVideos(data.videos);
        setSourceDir(data.sourceDir);
        setLoadError(data.error);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load the video library.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Smart search: debounced input (250ms) so typing feels instant but the
     filter work stays cheap even on large libraries. */
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQuery(query.trim().toLowerCase()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    if (!videos) return [];
    if (!debouncedQuery) return videos;
    return videos.filter((video) =>
      video.title.toLowerCase().includes(debouncedQuery),
    );
  }, [videos, debouncedQuery]);

  /* Close the player with Escape. */
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [selected]);

  const searching = debouncedQuery.length > 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-6 pt-14 pb-10 sm:pt-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.3em] text-primary/80 uppercase">
              Private Screening
            </p>
            <h1 className="font-display mt-2 text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
              Lumen
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
              Your movies, your machine, your theatre. Pick a film below and
              press play.
            </p>
          </div>
          {videos && (
            <div className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm text-muted-foreground">
              <span className="font-display text-2xl font-bold text-foreground">
                {videos.length}
              </span>
              {videos.length === 1 ? "movie" : "movies"} in the library
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search movies by title…"
            aria-label="Search movies by title"
            className="glass focus:glow-primary w-full rounded-2xl py-3.5 pr-11 pl-12 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none sm:text-base"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-3 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Folder notice / warnings */}
        {sourceDir && !loadError && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground/70">
            <FolderOpen className="h-3.5 w-3.5" />
            Reading from {sourceDir}
          </p>
        )}
        {loadError && videos && videos.length === 0 && (
          <div className="glass flex items-start gap-3 rounded-2xl border-destructive/40 p-4 text-sm">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-foreground">
                Library problem
              </p>
              <p className="mt-1 text-muted-foreground">
                {loadError} Set the <code className="text-primary">VIDEOS_DIRECTORY</code>{" "}
                environment variable to your movies folder (for example
                <code className="text-primary"> C:\Users\Saurabh\Videos\UXU</code>) and restart.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Grid */}
      {videos === null ? (
        <SkeletonGrid />
      ) : filtered.length > 0 ? (
        <motion.div
          layout
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-7 xl:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((video) => (
              <MovieCard key={video.id} video={video} onSelect={setSelected} />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl py-24 text-center">
          <Search className="h-10 w-10 text-muted-foreground/60" />
          <p className="font-display text-lg font-semibold text-foreground">
            {searching ? "No movies match your search" : "No videos found"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {searching
              ? `Nothing titled like “${debouncedQuery}”. Try a shorter or partial word.`
              : loadError ?? "Add video files to the configured folder and refresh."}
          </p>
        </div>
      )}

      {/* Player overlay */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key="player-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSelected(null)}
            className="overlay-scrim fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-xl sm:p-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 28 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 28 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              onClick={(event) => event.stopPropagation()}
              className="glass-strong w-full max-w-5xl rounded-3xl p-4 sm:p-6"
            >
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-display truncate text-xl font-bold text-foreground sm:text-2xl">
                    {selected.title}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
                    {selected.fileName} · {formatBytes(selected.sizeBytes)} ·{" "}
                    {formatDuration(selected.durationSeconds)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close player"
                  onClick={() => setSelected(null)}
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <VideoPlayer
                src={selected.streamUrl}
                title={selected.title}
                poster={selected.thumbnailUrl}
              />
              <p className="mt-3 hidden text-center text-xs text-muted-foreground/70 sm:block">
                Shortcuts: space play · ← → seek · j/l skip 10s · ↑ ↓ volume · m
                mute · f fullscreen
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-7 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="glass aspect-video animate-pulse rounded-3xl"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}

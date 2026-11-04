/**
 * VideoLibrary — the main screen: header, smart search (debounced, partial
 * match), the responsive grid of glass movie cards, and the glass player
 * overlay. Loads the library from /api/videos.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import {
  Check,
  FolderOpen,
  Grid2X2,
  Globe2,
  Info,
  LayoutGrid,
  List,
  Search,
  Settings2,
  SlidersHorizontal,
  Sun,
  TriangleAlert,
  X,
} from "lucide-react";

import type { VideoMeta, VideosResponse } from "@/lib/types";
import { formatBytes, formatDuration } from "@/lib/format";
import { MovieCard } from "@/components/MovieCard";
import { VideoPlayer } from "@/components/VideoPlayer";
import { readWatchHistory, removeWatchHistory, type WatchHistoryEntry } from "@/lib/watch-history";

type LibraryView = "grid" | "cards" | "list";
type LibraryTheme = "dark" | "light";
const LIBRARY_SETTINGS_KEY = "lumen-library-settings";
const PATH_HISTORY_KEY = "lumen-video-path-history";
const PLAYER_SETTINGS_KEY = "lumen-player-settings-v2";

export function VideoLibrary() {
  const [videos, setVideos] = useState<VideoMeta[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceDir, setSourceDir] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [pathLoading, setPathLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [resolutionFilter, setResolutionFilter] = useState("all");
  const [durationFilter, setDurationFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("title-asc");
  const [visibleCount, setVisibleCount] = useState(15);
  const [selected, setSelected] = useState<VideoMeta | null>(null);
  const [detailsVideo, setDetailsVideo] = useState<VideoMeta | null>(null);
  const [view, setView] = useState<LibraryView>("grid");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<LibraryTheme>("dark");
  const [defaultSubtitles, setDefaultSubtitles] = useState(false);
  const [defaultEnhancement, setDefaultEnhancement] = useState(false);
  const [defaultUpscaling, setDefaultUpscaling] = useState(false);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryEntry[]>([]);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LIBRARY_SETTINGS_KEY) ?? "{}") as {
        view?: LibraryView;
        theme?: LibraryTheme;
        videoPath?: string;
      };
      if (saved.view === "grid" || saved.view === "cards" || saved.view === "list") {
        setView(saved.view);
      }
      if (saved.theme === "light" || saved.theme === "dark") setTheme(saved.theme);
      if (saved.videoPath) setPathInput(saved.videoPath);
      const savedPaths = JSON.parse(localStorage.getItem(PATH_HISTORY_KEY) ?? "[]") as unknown;
      if (Array.isArray(savedPaths)) {
        setPathHistory(savedPaths.filter((item): item is string => typeof item === "string").slice(0, 10));
      }
      const player = JSON.parse(localStorage.getItem(PLAYER_SETTINGS_KEY) ?? "{}") as {
        subtitlesEnabled?: boolean;
        enhanced?: boolean;
        upscaled?: boolean;
      };
      setDefaultSubtitles(Boolean(player.subtitlesEnabled));
      setDefaultEnhancement(Boolean(player.enhanced));
      setDefaultUpscaling(Boolean(player.upscaled));
    } catch {
      // Use defaults when local storage is unavailable or malformed.
    }
  }, []);

  useEffect(() => {
    const refreshHistory = () => setWatchHistory(readWatchHistory());
    refreshHistory();
    window.addEventListener("storage", refreshHistory);
    const timer = window.setInterval(refreshHistory, 1000);
    return () => {
      window.removeEventListener("storage", refreshHistory);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  const saveLibraryView = (nextView: LibraryView) => {
    setView(nextView);
    try {
      const current = JSON.parse(localStorage.getItem(LIBRARY_SETTINGS_KEY) ?? "{}");
      localStorage.setItem(
        LIBRARY_SETTINGS_KEY,
        JSON.stringify({ ...current, view: nextView, theme }),
      );
    } catch {
      // Preferences remain active for this session.
    }
  };

  const saveTheme = (nextTheme: LibraryTheme) => {
    setTheme(nextTheme);
    try {
      const current = JSON.parse(localStorage.getItem(LIBRARY_SETTINGS_KEY) ?? "{}");
      localStorage.setItem(
        LIBRARY_SETTINGS_KEY,
        JSON.stringify({ ...current, theme: nextTheme, view }),
      );
    } catch {
      // Preferences remain active for this session.
    }
  };

  const savePlayerDefaults = (changes: Record<string, boolean>) => {
    try {
      const current = JSON.parse(localStorage.getItem(PLAYER_SETTINGS_KEY) ?? "{}");
      localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify({ ...current, ...changes }));
    } catch {
      // Preferences remain active for this session.
    }
  };

  const updateDefault = (key: "subtitlesEnabled" | "enhanced" | "upscaled", value: boolean) => {
    if (key === "subtitlesEnabled") setDefaultSubtitles(value);
    if (key === "enhanced") setDefaultEnhancement(value);
    if (key === "upscaled") setDefaultUpscaling(value);
    savePlayerDefaults({ [key]: value });
  };

  const loadLibrary = (directory?: string) => {
    setPathLoading(true);
    setLoadError(null);
    setVideos(null);
    const query = directory?.trim() ? `?path=${encodeURIComponent(directory.trim())}` : "";
    fetch(`/api/videos${query}`)
      .then((response) => response.json())
      .then((data: VideosResponse) => {
        setVideos(data.videos);
        setSourceDir(data.sourceDir);
        setLoadError(data.error);
        setPathLoading(false);
      })
      .catch(() => {
        setLoadError("Couldn't load the video library.");
        setPathLoading(false);
      });
  };

  const savePath = (directory: string) => {
    const normalized = directory.trim();
    const nextHistory = normalized
      ? [normalized, ...pathHistory.filter((item) => item !== normalized)].slice(0, 10)
      : pathHistory;
    setPathInput(normalized);
    setPathHistory(nextHistory);
    try {
      localStorage.setItem(PATH_HISTORY_KEY, JSON.stringify(nextHistory));
      const current = JSON.parse(localStorage.getItem(LIBRARY_SETTINGS_KEY) ?? "{}");
      localStorage.setItem(LIBRARY_SETTINGS_KEY, JSON.stringify({ ...current, videoPath: normalized }));
    } catch {
      // The selected path remains active for this session.
    }
    loadLibrary(normalized || undefined);
  };

  /* Load the library once on mount. */
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(LIBRARY_SETTINGS_KEY) ?? "{}") as {
      videoPath?: string;
    };
    loadLibrary(saved.videoPath);
  }, []);

  /* Smart search: debounced input (250ms) so typing feels instant but the
     filter work stays cheap even on large libraries. */
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    if (!videos) return [];
    const matching = videos.filter((video) => {
      const matchesTitle = !debouncedQuery || video.title.toLowerCase().includes(debouncedQuery);
      const matchesResolution = resolutionFilter === "all" || video.resolution === resolutionFilter;
      const matchesDuration =
        durationFilter === "all" ||
        (video.durationSeconds !== null &&
          (durationFilter === "short"
            ? video.durationSeconds < 30 * 60
            : durationFilter === "medium"
              ? video.durationSeconds >= 30 * 60 && video.durationSeconds <= 2 * 60 * 60
              : video.durationSeconds > 2 * 60 * 60));
      const matchesSize =
        sizeFilter === "all" ||
        (sizeFilter === "small"
          ? video.sizeBytes < 1024 ** 3
          : sizeFilter === "medium"
            ? video.sizeBytes >= 1024 ** 3 && video.sizeBytes < 5 * 1024 ** 3
            : video.sizeBytes >= 5 * 1024 ** 3);
      return matchesTitle && matchesResolution && matchesDuration && matchesSize;
    });
    return [...matching].sort((a, b) => {
      switch (sortBy) {
        case "latest":
          return b.modifiedAt - a.modifiedAt;
        case "oldest":
          return a.modifiedAt - b.modifiedAt;
        case "largest":
          return b.sizeBytes - a.sizeBytes;
        case "smallest":
          return a.sizeBytes - b.sizeBytes;
        case "longest":
          return (b.durationSeconds ?? -1) - (a.durationSeconds ?? -1);
        case "shortest":
          return (a.durationSeconds ?? Number.MAX_SAFE_INTEGER) - (b.durationSeconds ?? Number.MAX_SAFE_INTEGER);
        case "title-desc":
          return b.title.localeCompare(a.title);
        default:
          return a.title.localeCompare(b.title);
      }
    });
  }, [videos, debouncedQuery, resolutionFilter, durationFilter, sizeFilter, sortBy]);

  useEffect(() => {
    setVisibleCount(15);
  }, [debouncedQuery, resolutionFilter, durationFilter, sizeFilter, sortBy]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || visibleCount >= filtered.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((count) => Math.min(count + 15, filtered.length));
      },
      { rootMargin: "600px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount]);

  const resolutions = useMemo(
    () =>
      Array.from(new Set((videos ?? []).map((video) => video.resolution).filter(Boolean))).sort(
        (a, b) => (a ?? "").localeCompare(b ?? ""),
      ),
    [videos],
  );

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
  const historyVideos = watchHistory
    .map((entry) => ({
      entry,
      video: (videos ?? []).find((video) => video.fileName === entry.fileName),
    }))
    .filter((item): item is { entry: WatchHistoryEntry; video: VideoMeta } => Boolean(item.video))
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-24 sm:px-6 lg:px-10">
      {/* Compact sticky library header */}
      <header className="sticky top-0 z-30 -mx-4 mb-8 border-b border-white/10 bg-background/75 px-4 py-4 shadow-[0_16px_40px_-28px_oklch(0_0_0/90%)] backdrop-blur-2xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.28em] text-primary/80 uppercase">
                Private Screening
              </p>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
                Lumen
              </h1>
            </div>
            {videos && (
              <div className="glass rounded-full px-3 py-1.5 text-xs text-muted-foreground">
                <span className="font-display mr-1 text-lg font-bold text-foreground">
                  {filtered.length}
                </span>
                of {videos.length}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sourceDir && !loadError && (
              <p className="hidden items-center gap-2 text-xs text-muted-foreground/70 lg:flex">
                <FolderOpen className="h-3.5 w-3.5" />
                {sourceDir}
              </p>
            )}
            <div className="relative">
              <button
                type="button"
                aria-label="Open library settings"
                onClick={() => setSettingsOpen((open) => !open)}
                className={`glass flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-accent ${settingsOpen ? "text-primary" : "text-muted-foreground"}`}
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <AnimatePresence>
                {settingsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    className="glass-strong absolute top-12 right-0 z-40 w-72 rounded-2xl p-4 shadow-2xl"
                  >
                    <p className="font-display text-sm font-semibold text-foreground">
                      Default settings
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Saved for your next video.</p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="border-b border-white/10 pb-3">
                        <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground uppercase">
                          <FolderOpen className="h-3.5 w-3.5 text-primary" />
                          Video folder
                        </p>
                        <form
                          className="space-y-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            savePath(pathInput);
                          }}
                        >
                          <input
                            type="text"
                            value={pathInput}
                            onChange={(event) => setPathInput(event.target.value)}
                            placeholder="C:\\Videos"
                            aria-label="Video folder path"
                            className="h-9 w-full rounded-lg border border-border/60 bg-background/50 px-2.5 text-xs text-foreground outline-none focus:border-primary/60"
                          />
                          <button
                            type="submit"
                            disabled={pathLoading}
                            className="w-full rounded-lg bg-primary/15 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                          >
                            {pathLoading ? "Loading folder…" : "Load folder"}
                          </button>
                        </form>
                        {pathHistory.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-[11px] text-muted-foreground">Recent folders</p>
                            {pathHistory.map((directory) => (
                              <button
                                key={directory}
                                type="button"
                                onClick={() => savePath(directory)}
                                className="block w-full truncate rounded px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                title={directory}
                              >
                                {directory}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="border-b border-white/10 pb-3">
                        <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground uppercase">
                          <Sun className="h-3.5 w-3.5 text-primary" />
                          Appearance
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {(["dark", "light"] as const).map((value) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => saveTheme(value)}
                              className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                                theme === value
                                  ? "border-primary/60 bg-primary/15 text-primary"
                                  : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                              }`}
                            >
                              {value === "light" ? "Warm light" : "Cinema dark"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {[
                        ["Subtitles", defaultSubtitles, "subtitlesEnabled"],
                        ["Quality enhancement", defaultEnhancement, "enhanced"],
                        ["Upscaling", defaultUpscaling, "upscaled"],
                      ].map(([label, checked, key]) => (
                        <label
                          key={key as string}
                          className="flex cursor-pointer items-center justify-between gap-3 text-muted-foreground"
                        >
                          <span>{label as string}</span>
                          <input
                            type="checkbox"
                            checked={checked as boolean}
                            onChange={(event) =>
                              updateDefault(
                                key as "subtitlesEnabled" | "enhanced" | "upscaled",
                                event.target.checked,
                              )
                            }
                            className="accent-primary"
                          />
                        </label>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Link
              to="/web"
              aria-label="Open web viewer"
              title="Open web viewer"
              className="glass flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Globe2 className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-4 flex max-w-[1600px] flex-col gap-2 sm:flex-row sm:flex-wrap">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search movies by title…"
              aria-label="Search movies by title"
              className="glass focus:glow-primary h-11 w-full rounded-xl pr-10 pl-10 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <label className="glass flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground sm:w-44">
            <SlidersHorizontal className="h-4 w-4 text-primary/80" />
            <span className="sr-only">Filter by resolution</span>
            <select
              value={resolutionFilter}
              onChange={(event) => setResolutionFilter(event.target.value)}
              aria-label="Filter by resolution"
              className="w-full cursor-pointer bg-transparent text-foreground outline-none"
            >
              <option value="all">All resolutions</option>
              {resolutions.map((resolution) => (
                <option key={resolution} value={resolution ?? ""}>
                  {resolution}
                </option>
              ))}
            </select>
          </label>
          <label className="glass flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground sm:w-40">
            <span className="sr-only">Filter by duration</span>
            <select
              value={durationFilter}
              onChange={(event) => setDurationFilter(event.target.value)}
              aria-label="Filter by duration"
              className="w-full cursor-pointer bg-transparent text-foreground outline-none"
            >
              <option value="all">Any duration</option>
              <option value="short">Under 30 min</option>
              <option value="medium">30 min–2 hr</option>
              <option value="long">Over 2 hours</option>
            </select>
          </label>
          <label className="glass flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground sm:w-36">
            <span className="sr-only">Filter by file size</span>
            <select
              value={sizeFilter}
              onChange={(event) => setSizeFilter(event.target.value)}
              aria-label="Filter by file size"
              className="w-full cursor-pointer bg-transparent text-foreground outline-none"
            >
              <option value="all">Any size</option>
              <option value="small">Under 1 GB</option>
              <option value="medium">1–5 GB</option>
              <option value="large">Over 5 GB</option>
            </select>
          </label>
          <label className="glass flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground sm:w-44">
            <span className="sr-only">Sort videos</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              aria-label="Sort videos"
              className="w-full cursor-pointer bg-transparent text-foreground outline-none"
            >
              <option value="title-asc">Title (A–Z)</option>
              <option value="title-desc">Title (Z–A)</option>
              <option value="latest">Latest modified</option>
              <option value="oldest">Oldest modified</option>
              <option value="largest">Largest file</option>
              <option value="smallest">Smallest file</option>
              <option value="longest">Longest duration</option>
              <option value="shortest">Shortest duration</option>
            </select>
          </label>
          <div className="glass flex h-11 shrink-0 items-center gap-1 rounded-xl p-1">
            {(
              [
                ["grid", LayoutGrid, "Grid view"],
                ["cards", Grid2X2, "Card view"],
                ["list", List, "List view"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                title={label}
                onClick={() => saveLibraryView(value)}
                className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors ${view === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        {loadError && videos && videos.length === 0 && (
          <div className="glass mx-auto mt-3 flex max-w-[1600px] items-start gap-3 rounded-xl border-destructive/40 p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-foreground">Library problem</p>
              <p className="mt-1 text-muted-foreground">
                {loadError} Set the <code className="text-primary">VIDEOS_DIRECTORY</code>{" "}
                environment variable and restart.
              </p>
            </div>
          </div>
        )}
      </header>

      {historyVideos.length > 0 && !searching && (
        <section className="mb-8" aria-label="Continue watching">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-foreground">Continue watching</h2>
            <span className="text-xs text-muted-foreground">This session</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {historyVideos.map(({ entry, video }) => (
              <div
                key={video.id}
                className="glass group relative overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-1"
              >
                <button
                  type="button"
                  onClick={() => setSelected(video)}
                  className="block w-full text-left"
                  aria-label={`Continue watching ${video.title}`}
                >
                  <div className="relative aspect-video">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-primary/10" />
                    )}
                    <span className="absolute right-2 bottom-2 rounded-md bg-black/75 px-2 py-1 text-[11px] font-medium text-white">
                      {formatDuration(entry.duration - entry.currentTime)} left
                    </span>
                  </div>
                  <p className="truncate p-3 text-sm font-semibold text-foreground">
                    {video.title}
                  </p>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${video.title} from history`}
                  title="Remove from history"
                  onClick={() => {
                    removeWatchHistory(video.fileName);
                    setWatchHistory(readWatchHistory());
                  }}
                  className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-sm text-white/80 opacity-0 transition-opacity hover:bg-destructive hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grid */}
      {videos === null ? (
        <SkeletonGrid />
      ) : filtered.length > 0 ? (
        <>
          <motion.div
            className={
              view === "list"
                ? "grid grid-cols-1 gap-4"
                : view === "cards"
                  ? "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  : "grid grid-cols-1 gap-7 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3 xl:gap-9"
            }
          >
            <AnimatePresence initial={false}>
              {filtered.slice(0, visibleCount).map((video) => (
                <MovieCard
                  key={video.id}
                  video={video}
                  onSelect={setSelected}
                  onDetails={setDetailsVideo}
                  view={view}
                />
              ))}
            </AnimatePresence>
          </motion.div>
          <div
            ref={loadMoreRef}
            className="flex min-h-16 items-center justify-center"
            aria-live="polite"
          >
            {visibleCount < filtered.length && (
              <p className="text-xs text-muted-foreground">
                Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} videos…
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl py-24 text-center">
          <Search className="h-10 w-10 text-muted-foreground/60" />
          <p className="font-display text-lg font-semibold text-foreground">
            {searching ? "No movies match your search" : "No videos found"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {searching
              ? `Nothing titled like “${debouncedQuery}”. Try a shorter or partial word.`
              : (loadError ?? "Add video files to the configured folder and refresh.")}
          </p>
        </div>
      )}

      <AnimatePresence>
        {detailsVideo && (
          <motion.aside
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 32 }}
            className="glass-strong fixed top-4 right-4 bottom-4 z-40 w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-3xl p-5 shadow-2xl sm:p-6"
            aria-label="Video details"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-bold text-foreground">Details</h2>
              </div>
              <button
                type="button"
                aria-label="Close details"
                onClick={() => setDetailsVideo(null)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <h3 className="font-display mt-8 text-lg font-semibold leading-snug text-foreground">
              {detailsVideo.title}
            </h3>
            <dl className="mt-6 space-y-4 text-sm">
              <DetailRow label="Resolution" value={detailsVideo.resolution ?? "Unavailable"} />
              <DetailRow label="Duration" value={formatDuration(detailsVideo.durationSeconds)} />
              <DetailRow label="File size" value={formatBytes(detailsVideo.sizeBytes)} />
              <DetailRow label="File name" value={detailsVideo.fileName} />
            </dl>
            <button
              type="button"
              onClick={() => {
                setDetailsVideo(null);
                setSelected(detailsVideo);
              }}
              className="mt-8 flex w-full cursor-pointer items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Play video
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

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
                fileName={selected.fileName}
                title={selected.title}
                poster={selected.thumbnailUrl}
              />
              <p className="mt-3 hidden text-center text-xs text-muted-foreground/70 sm:block">
                Shortcuts: space play · ← → seek · j/l skip 10s · ↑ ↓ volume · m mute · f fullscreen
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/10 pb-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{value}</dd>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3 xl:gap-9">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="glass skeleton-shimmer aspect-[16/10] overflow-hidden rounded-3xl"
          style={{ animationDelay: `${index * 90}ms` }}
        >
          <div className="flex h-full flex-col justify-end gap-3 p-5">
            <div className="h-5 w-3/4 rounded-full bg-foreground/10" />
            <div className="h-3 w-1/2 rounded-full bg-foreground/8" />
          </div>
        </div>
      ))}
    </div>
  );
}

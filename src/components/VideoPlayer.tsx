/**
 * VideoPlayer — custom HTML5 video wrapper with a full glass control bar.
 *
 * Controls: play/pause, seek (click + drag), skip ±10s, volume (slider +
 * mute), playback speed menu, fullscreen. Keyboard shortcuts: space/k play,
 * ←/→ seek 5s, j/l seek 10s, ↑/↓ volume, m mute, f fullscreen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Gauge,
  Loader2,
  Maximize,
  Minus,
  Minimize,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Scaling,
  Settings,
  Subtitles,
  Volume1,
  Volume2,
  VolumeX,
  WandSparkles,
} from "lucide-react";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const SUBTITLE_CHUNK_SECONDS = 60;
const SUBTITLE_CACHE_VERSION = "v16";
const PLAYER_SETTINGS_KEY = "lumen-player-settings-v2";

interface PlayerSettings {
  enhanced: boolean;
  upscaled: boolean;
  enhancementIntensity: number;
  upscaleIntensity: number;
  subtitlesEnabled: boolean;
  subtitleSize: number;
  volume: number;
  muted: boolean;
  speed: number;
}

const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  enhanced: false,
  upscaled: false,
  enhancementIntensity: 60,
  upscaleIntensity: 60,
  subtitlesEnabled: false,
  subtitleSize: 1.25,
  volume: 1,
  muted: false,
  speed: 1,
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function getActiveSubtitle(chunks: Array<{ text: string }>, current: number): string {
  for (const chunk of chunks) {
    const blocks = chunk.text.replace(/^WEBVTT\s*/i, "").trim().split(/\r?\n\r?\n/);
    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) continue;
      const timing = lines[timingIndex].match(
        /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/,
      );
      if (!timing) continue;
      const start =
        Number(timing[1]) * 3600 +
        Number(timing[2]) * 60 +
        Number(timing[3]) +
        Number(timing[4]) / 1000;
      const end =
        Number(timing[5]) * 3600 +
        Number(timing[6]) * 60 +
        Number(timing[7]) +
        Number(timing[8]) / 1000;
      if (current >= start && current <= end) {
        return lines
          .slice(timingIndex + 1)
          .join(" ")
          .replace(/<[^>]+>/g, "")
          .trim();
      }
    }
  }
  return "";
}

interface VideoPlayerProps {
  src: string;
  fileName: string;
  title: string;
  poster?: string | null;
  autoPlay?: boolean;
}

export function VideoPlayer({ src, fileName, title, poster, autoPlay = true }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [upscaled, setUpscaled] = useState(false);
  const [enhancementIntensity, setEnhancementIntensity] = useState(60);
  const [upscaleIntensity, setUpscaleIntensity] = useState(60);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsLoadedRef = useRef(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [subtitleSize, setSubtitleSize] = useState(1.25);
  const [subtitleChunks, setSubtitleChunks] = useState<Array<{ start: number; text: string }>>([]);
  const activeSubtitle = subtitlesEnabled ? getActiveSubtitle(subtitleChunks, current) : "";
  const subtitleCacheKey = `lumen-subtitles-${SUBTITLE_CACHE_VERSION}:${fileName}`;
  const subtitleChunkRef = useRef(0);
  const subtitleLoadedRef = useRef(new Set<number>());
  const subtitleInFlightRef = useRef(new Set<number>());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PLAYER_SETTINGS_KEY);
      const settings = saved
        ? { ...DEFAULT_PLAYER_SETTINGS, ...(JSON.parse(saved) as Partial<PlayerSettings>) }
        : DEFAULT_PLAYER_SETTINGS;
      setEnhanced(settings.enhanced);
      setUpscaled(settings.upscaled);
      setEnhancementIntensity(settings.enhancementIntensity);
      setUpscaleIntensity(settings.upscaleIntensity);
      setSubtitlesEnabled(settings.subtitlesEnabled);
      setSubtitleSize(settings.subtitleSize);
      setVolume(settings.volume);
      setMuted(settings.muted);
      setSpeed(settings.speed);
    } catch {
      // Keep safe defaults when browser storage is unavailable or malformed.
    } finally {
      settingsLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    const settings: PlayerSettings = {
      enhanced,
      upscaled,
      enhancementIntensity,
      upscaleIntensity,
      subtitlesEnabled,
      subtitleSize,
      volume,
      muted,
      speed,
    };
    localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(settings));
  }, [
    enhanced,
    upscaled,
    enhancementIntensity,
    upscaleIntensity,
    subtitlesEnabled,
    subtitleSize,
    volume,
    muted,
    speed,
  ]);

  /* Wire media element events to React state. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoaded = () => {
      setDuration(video.duration || 0);
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onTime = () => setCurrent(video.currentTime);
    const onDuration = () => setDuration(video.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onError = () =>
      setError(
        "This file can't be played here. MP4 (H.264) and WebM work everywhere; some AVI, MKV or MOV files use codecs browsers don't support.",
      );

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onPause);
    video.addEventListener("progress", onProgress);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("ended", onPause);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("error", onError);
    };
  }, [src]);

  /* Reset transient state when a different video is loaded. */
  useEffect(() => {
    setCurrent(0);
    setDuration(0);
    setBufferedEnd(0);
    setError(null);
    setWaiting(false);
    setPlaying(false);
    setSubtitlesEnabled(false);
    setSubtitleLoading(false);
    setSubtitleChunks([]);
    subtitleChunkRef.current = 0;
    subtitleLoadedRef.current.clear();
    subtitleInFlightRef.current.clear();
  }, [src]);

  /* Keep fullscreen state in sync when the user exits with ESC/system UI. */
  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  /* Auto-hide the control bar after 2.5s of inactivity while playing. */
  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) setControlsVisible(false);
    }, 2500);
  }, []);

  useEffect(
    () => () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    },
    [],
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const next = Math.min(Math.max(video.currentTime + delta, 0), video.duration);
    video.currentTime = next;
    setCurrent(next);
  }, []);

  const changeVolume = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    setVolume(value);
    if (value > 0 && video.muted) {
      video.muted = false;
      setMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const applySpeed = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = value;
    setSpeed(value);
    setSpeedOpen(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await shell.requestFullscreen();
      }
    } catch {
      /* Fullscreen can be blocked by the browser — ignore. */
    }
  }, []);

  /* Keyboard shortcuts (active while the player is mounted). */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case " ":
        case "k":
          event.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          event.preventDefault();
          seekBy(5);
          break;
        case "ArrowLeft":
          event.preventDefault();
          seekBy(-5);
          break;
        case "l":
          seekBy(10);
          break;
        case "j":
          seekBy(-10);
          break;
        case "ArrowUp":
          event.preventDefault();
          changeVolume(Math.min((videoRef.current?.volume ?? 1) + 0.1, 1));
          break;
        case "ArrowDown":
          event.preventDefault();
          changeVolume(Math.max((videoRef.current?.volume ?? 1) - 0.1, 0));
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          void toggleFullscreen();
          break;
        default:
          return;
      }
      bumpControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, changeVolume, toggleMute, toggleFullscreen, bumpControls]);

  /* Seek bar: click or drag anywhere on the track. */
  const seekFromClientX = (clientX: number) => {
    const bar = barRef.current;
    const video = videoRef.current;
    if (!bar || !video || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const next = ratio * duration;
    video.currentTime = next;
    setCurrent(next);
  };

  const progressPct = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (bufferedEnd / duration) * 100 : 0;
  const shownControls = controlsVisible || !playing || scrubbing;
  const effectiveVolume = muted ? 0 : volume;
  const subtitleSizeClass =
    subtitleSize < 1
      ? "subtitle-size-small"
      : subtitleSize > 1.35
        ? "subtitle-size-large"
        : "subtitle-size-medium";

  const loadSubtitleChunk = useCallback(
    async (start: number) => {
      if (subtitleLoadedRef.current.has(start) || subtitleInFlightRef.current.has(start)) {
        return;
      }
      subtitleInFlightRef.current.add(start);
      try {
        const response = await fetch(
          `/api/videos/subtitles?file=${encodeURIComponent(fileName)}&start=${Math.floor(start)}&duration=${SUBTITLE_CHUNK_SECONDS}`,
        );
        if (!response.ok) throw new Error(await response.text());
        const text = await response.text();
        subtitleLoadedRef.current.add(start);
        setSubtitleChunks((chunks) =>
          [...chunks, { start, text }].sort((a, b) => a.start - b.start),
        );
        subtitleChunkRef.current = Math.max(
          subtitleChunkRef.current,
          start + SUBTITLE_CHUNK_SECONDS,
        );
      } finally {
        subtitleInFlightRef.current.delete(start);
      }
    },
    [fileName],
  );

  useEffect(() => {
    if (!subtitlesEnabled || subtitleLoading || !Number.isFinite(current)) {
      return;
    }
    const currentChunk = Math.floor(current / SUBTITLE_CHUNK_SECONDS) * SUBTITLE_CHUNK_SECONDS;
    const nextChunk = currentChunk + SUBTITLE_CHUNK_SECONDS;
    void (async () => {
      try {
        await loadSubtitleChunk(currentChunk);
        await loadSubtitleChunk(nextChunk);
      } catch (subtitleError) {
        if (subtitleLoadedRef.current.has(currentChunk)) return;
        setError(
          subtitleError instanceof Error ? subtitleError.message : "Subtitle generation failed.",
        );
      }
    })();
  }, [current, loadSubtitleChunk, subtitleLoading, subtitlesEnabled]);

  useEffect(() => {
    if (!settingsLoadedRef.current || !subtitlesEnabled || subtitleChunks.length > 0) return;
    const start = Math.floor(current / SUBTITLE_CHUNK_SECONDS) * SUBTITLE_CHUNK_SECONDS;
    setSubtitleLoading(true);
    void loadSubtitleChunk(start)
      .catch((subtitleError) => {
        setError(
          subtitleError instanceof Error ? subtitleError.message : "Subtitle generation failed.",
        );
      })
      .finally(() => setSubtitleLoading(false));
  }, [current, loadSubtitleChunk, subtitleChunks.length, subtitlesEnabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    video.playbackRate = speed;
  }, [muted, speed, volume]);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(subtitleCacheKey);
      if (!cached) return;
      const chunks = JSON.parse(cached) as Array<{ start: number; text: string }>;
      chunks.forEach((chunk) => subtitleLoadedRef.current.add(chunk.start));
      setSubtitleChunks(chunks);
      subtitleChunkRef.current = chunks.reduce(
        (next, chunk) => Math.max(next, chunk.start + SUBTITLE_CHUNK_SECONDS),
        0,
      );
    } catch {
      localStorage.removeItem(subtitleCacheKey);
    }
  }, [subtitleCacheKey]);

  useEffect(() => {
    if (subtitleChunks.length === 0) return;
    try {
      localStorage.setItem(subtitleCacheKey, JSON.stringify(subtitleChunks));
    } catch {
      // Subtitle caching is best effort when browser storage is unavailable.
    }
  }, [subtitleCacheKey, subtitleChunks]);

  const toggleSubtitles = useCallback(async () => {
    if (subtitlesEnabled) {
      setSubtitlesEnabled((value) => !value);
      return;
    }

    setSubtitleLoading(true);
    setError(null);
    try {
      subtitleChunkRef.current =
        Math.floor(current / SUBTITLE_CHUNK_SECONDS) * SUBTITLE_CHUNK_SECONDS;
      await loadSubtitleChunk(subtitleChunkRef.current);
      setSubtitlesEnabled(true);
    } catch (subtitleError) {
      setError(
        subtitleError instanceof Error ? subtitleError.message : "Subtitle generation failed.",
      );
    } finally {
      setSubtitleLoading(false);
    }
  }, [current, loadSubtitleChunk, subtitlesEnabled]);

  return (
    <div
      ref={shellRef}
      onPointerMove={bumpControls}
      onPointerDown={bumpControls}
      className="video-player-shell relative aspect-video w-full overflow-hidden rounded-2xl bg-card select-none"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        autoPlay={autoPlay}
        playsInline
        className={`h-full w-full object-contain transition-[filter] duration-300 ${subtitleSizeClass}`}
        style={{
          filter:
            [
              enhanced
                ? `brightness(${1 + enhancementIntensity * 0.001}) contrast(${1 + enhancementIntensity * 0.0025}) saturate(${1 + enhancementIntensity * 0.0025})`
                : "",
              upscaled
                ? `contrast(${1 + upscaleIntensity * 0.0015}) saturate(${1 + upscaleIntensity * 0.0012})`
                : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined,
          transform: upscaled ? `scale(${1 + upscaleIntensity * 0.00015})` : undefined,
          willChange: upscaled || enhanced ? "filter, transform" : undefined,
        }}
        onClick={togglePlay}
        onDoubleClick={() => void toggleFullscreen()}
      >
      </video>

      {activeSubtitle && (
        <div
          className={`subtitle-overlay pointer-events-none absolute right-[8%] bottom-[12%] left-[8%] z-10 text-center font-semibold text-foreground ${subtitleSizeClass}`}
          aria-live="polite"
        >
          <span className="inline-block rounded-xl border border-white/20 bg-black/75 px-3 py-1.5 text-[clamp(1.25rem,2.4vw,2rem)] leading-tight text-white shadow-lg">
            {activeSubtitle}
          </span>
        </div>
      )}

      {/* Buffering spinner */}
      {waiting && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary/80" />
        </div>
      )}

      {/* Unplayable codec / missing file */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card/80 p-8 text-center backdrop-blur-md">
          <p className="font-display text-lg font-semibold text-foreground">
            {title} can't be played
          </p>
          <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {/* Big center play button when paused */}
      <AnimatePresence>
        {!playing && !error && !waiting && (
          <motion.button
            key="center-play"
            type="button"
            aria-label="Play"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={togglePlay}
            className="glass-strong glow-primary absolute top-1/2 left-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-primary"
          >
            <Play className="h-8 w-8 translate-x-0.5 fill-current" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Control bar */}
      <AnimatePresence>
        {shownControls && !error && (
          <motion.div
            key="controls"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 bottom-0 z-10 px-3 pb-3 sm:px-4 sm:pb-4"
          >
            <div className="glass-strong rounded-2xl px-3 pt-2 pb-2 sm:px-4">
              {/* Seek track */}
              <div
                ref={barRef}
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(current)}
                tabIndex={0}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setScrubbing(true);
                  seekFromClientX(event.clientX);
                }}
                onPointerMove={(event) => {
                  if (scrubbing) seekFromClientX(event.clientX);
                }}
                onPointerUp={() => setScrubbing(false)}
                onPointerCancel={() => setScrubbing(false)}
                className="group/bar relative my-1 flex h-6 cursor-pointer items-center"
              >
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary/25"
                    style={{ width: `${bufferedPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-primary"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div
                  className="absolute h-3.5 w-3.5 rounded-full bg-primary opacity-0 shadow-md transition-opacity group-hover/bar:opacity-100"
                  style={{
                    left: `calc(${progressPct}% - 0.4375rem)`,
                    opacity: scrubbing ? 1 : undefined,
                  }}
                />
              </div>

              {/* Buttons row */}
              <div className="flex items-center gap-1 text-foreground sm:gap-1.5">
                <ControlButton label={playing ? "Pause" : "Play"} onClick={togglePlay}>
                  {playing ? (
                    <Pause className="h-5 w-5 fill-current" />
                  ) : (
                    <Play className="h-5 w-5 fill-current" />
                  )}
                </ControlButton>

                <ControlButton label="Back 10 seconds" onClick={() => seekBy(-10)}>
                  <RotateCcw className="h-5 w-5" />
                </ControlButton>
                <ControlButton label="Forward 10 seconds" onClick={() => seekBy(10)}>
                  <RotateCw className="h-5 w-5" />
                </ControlButton>

                <span className="ml-1 font-mono text-xs tabular-nums text-muted-foreground sm:text-sm">
                  {formatTime(current)} / {formatTime(duration)}
                </span>

                <div className="flex-1" />

                {/* Volume: mute toggle + slider */}
                <div className="group/vol flex items-center gap-1.5">
                  <ControlButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
                    {muted || volume === 0 ? (
                      <VolumeX className="h-5 w-5" />
                    ) : effectiveVolume < 0.5 ? (
                      <Volume1 className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </ControlButton>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={effectiveVolume}
                    onChange={(event) => changeVolume(Number.parseFloat(event.target.value))}
                    aria-label="Volume"
                    className="volume-slider w-0 opacity-0 transition-all duration-300 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100 sm:group-hover/vol:w-24"
                  />
                </div>

                {/* Playback speed menu */}
                <div className="relative">
                  <ControlButton
                    label="Playback speed"
                    active={speed !== 1 || speedOpen}
                    onClick={() => setSpeedOpen((open) => !open)}
                  >
                    <Gauge className="h-5 w-5" />
                  </ControlButton>
                  <AnimatePresence>
                    {speedOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="glass-strong absolute right-0 bottom-full z-20 mb-3 w-28 overflow-hidden rounded-xl py-1 text-sm"
                      >
                        {SPEEDS.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => applySpeed(value)}
                            className={`flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-accent ${
                              speed === value ? "font-semibold text-primary" : "text-foreground"
                            }`}
                          >
                            <span>{value}×</span>
                            {speed === value && <span className="text-xs text-primary">✓</span>}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <ControlButton
                  label={enhanced ? "Disable quality enhancement" : "Enhance video quality"}
                  active={enhanced}
                  onClick={() => setEnhanced((value) => !value)}
                >
                  <WandSparkles className="h-5 w-5" />
                </ControlButton>

                <ControlButton
                  label="Decrease subtitle size"
                  onClick={() => setSubtitleSize((value) => Math.max(0.8, value - 0.1))}
                >
                  <Minus className="h-4 w-4" />
                </ControlButton>
                <ControlButton
                  label="Increase subtitle size"
                  onClick={() => setSubtitleSize((value) => Math.min(1.5, value + 0.1))}
                >
                  <Plus className="h-4 w-4" />
                </ControlButton>

                <ControlButton
                  label={upscaled ? "Disable upscale preview" : "Enable upscale preview"}
                  active={upscaled}
                  onClick={() => setUpscaled((value) => !value)}
                >
                  <Scaling className="h-5 w-5" />
                </ControlButton>

                <div className="relative">
                  <ControlButton
                    label="Player settings"
                    active={settingsOpen}
                    onClick={() => setSettingsOpen((value) => !value)}
                  >
                    <Settings className="h-5 w-5" />
                  </ControlButton>
                  <AnimatePresence>
                    {settingsOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        className="glass-strong absolute right-0 bottom-full z-20 mb-3 w-64 rounded-xl p-3 text-xs"
                      >
                        <p className="mb-3 font-semibold text-foreground">Playback settings</p>
                        <SettingSlider
                          label={`Enhancement ${enhancementIntensity}%`}
                          value={enhancementIntensity}
                          onChange={setEnhancementIntensity}
                        />
                        <SettingSlider
                          label={`Upscaling ${upscaleIntensity}%`}
                          value={upscaleIntensity}
                          onChange={setUpscaleIntensity}
                        />
                        <label className="mt-3 flex items-center justify-between gap-3 text-muted-foreground">
                          <span>Subtitles by default</span>
                          <input
                            type="checkbox"
                            checked={subtitlesEnabled}
                            onChange={(event) => setSubtitlesEnabled(event.target.checked)}
                            className="accent-primary"
                          />
                        </label>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <ControlButton
                  label={
                    subtitleLoading
                      ? "Generating English subtitles"
                      : subtitlesEnabled
                        ? "Disable English subtitles"
                        : "Generate English subtitles"
                  }
                  active={subtitlesEnabled}
                  onClick={() => void toggleSubtitles()}
                >
                  {subtitleLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Subtitles className="h-5 w-5" />
                  )}
                </ControlButton>

                <ControlButton
                  label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  onClick={() => void toggleFullscreen()}
                >
                  {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </ControlButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-accent ${
        active ? "text-primary" : "text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SettingSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mb-3 block text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      <input
        type="range"
        min={10}
        max={100}
        step={5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="volume-slider w-full"
      />
    </label>
  );
}

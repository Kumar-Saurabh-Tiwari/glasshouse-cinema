/**
 * MovieCard — a large glassmorphism card for one video.
 * Framer Motion handles entrance, hover lift and layout animations while
 * the library filters; the thumbnail zooms and a play chip fades in on hover.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Clapperboard, Play } from "lucide-react";

import type { VideoMeta } from "@/lib/types";
import { formatDuration } from "@/lib/format";

interface MovieCardProps {
  video: VideoMeta;
  onSelect: (video: VideoMeta) => void;
}

export function MovieCard({ video, onSelect }: MovieCardProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [generatedThumb, setGeneratedThumb] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const fallbackRef = useRef<HTMLVideoElement>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const captureBrowserThumbnail = () => {
    const preview = fallbackRef.current;
    if (!preview || preview.videoWidth === 0 || preview.videoHeight === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = preview.videoWidth;
    canvas.height = preview.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(preview, 0, 0, canvas.width, canvas.height);
    setGeneratedThumb(canvas.toDataURL("image/jpeg", 0.82));
  };

  const thumbnailUrl = thumbFailed ? generatedThumb : video.thumbnailUrl;

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const stopPreview = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    const preview = previewRef.current;
    if (preview) {
      preview.pause();
      preview.currentTime = 0;
    }
    setPreviewing(false);
  };

  const startPreview = () => {
    hoverTimerRef.current = window.setTimeout(() => {
      setPreviewing(true);
      const preview = previewRef.current;
      if (preview?.readyState && preview.readyState >= HTMLMediaElement.HAVE_METADATA) {
        preview.currentTime = 30;
        void preview.play();
      }
    }, 3000);
  };

  const seekAndPlayPreview = () => {
    const preview = previewRef.current;
    if (!preview || !previewing) return;
    preview.currentTime = Math.min(30, preview.duration || 30);
    void preview.play();
  };

  return (
    <motion.button
      layout
      type="button"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      whileHover={{ y: -8 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(video)}
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      className="glass card-glow group relative block w-full cursor-pointer overflow-hidden rounded-3xl border-white/5 text-left transition-[border-color,box-shadow] duration-300 hover:border-primary/25 hover:shadow-[0_30px_70px_-30px_oklch(0_0_0/80%),var(--glow-primary)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={video.title}
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : thumbFailed || !video.thumbnailUrl ? (
          <video
            ref={fallbackRef}
            src={video.streamUrl}
            muted
            playsInline
            preload="auto"
            aria-label={`${video.title} preview`}
            onLoadedData={captureBrowserThumbnail}
            onError={() => setThumbFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 via-transparent to-chart-2/20">
            <Clapperboard className="h-12 w-12 text-muted-foreground/60" />
          </div>
        )}
        <video
          ref={previewRef}
          src={video.streamUrl}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          onLoadedMetadata={seekAndPlayPreview}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            previewing ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />

        {/* Readability scrim + duration badge */}
        <div className="scrim pointer-events-none absolute inset-0" />
        <span className="glass absolute top-3 right-3 rounded-full px-2.5 py-1 text-xs font-medium text-foreground/90">
          {formatDuration(video.durationSeconds)}
        </span>
        {video.resolution && (
          <span className="glass absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-medium text-foreground/90">
            {video.resolution}
          </span>
        )}

        {/* Play chip on hover */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="glass-strong glow-primary flex h-16 w-16 items-center justify-center rounded-full text-primary">
            <Play className="h-7 w-7 translate-x-0.5 fill-current" />
          </span>
        </div>

        {/* Title block */}
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <h3 className="font-display line-clamp-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {video.title}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:text-sm">
            {video.fileName}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

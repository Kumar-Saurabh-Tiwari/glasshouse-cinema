/**
 * Server-only helpers for the video library.
 *
 * Responsibilities:
 *  - Resolve the configured videos folder (VIDEOS_DIRECTORY env var).
 *  - Scan it for common video files and build metadata (title from filename).
 *  - Generate thumbnails server-side with ffmpeg, cached on disk.
 *  - Resolve request-supplied filenames safely (no path traversal).
 *
 * This module is imported ONLY from /api/* server routes — never from
 * components — because it uses Node built-ins (fs, child_process).
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { VideoMeta, VideosResponse } from "@/lib/types";

const execFileAsync = promisify(execFile);

/** File extensions treated as playable videos. */
export const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".avi",
  ".mov",
  ".mkv",
  ".m4v",
  ".ogv",
]);

const FFMPEG_BIN = () => process.env["FFMPEG_PATH"] || "ffmpeg";
const FFPROBE_BIN = () => process.env["FFPROBE_PATH"] || "ffprobe";

/**
 * The folder to scan. Configurable through VIDEOS_DIRECTORY; falls back to
 * ./videos inside the project so a fresh clone works out of the box.
 * Examples: VIDEOS_DIRECTORY=C:\Users\Saurabh\Videos\UXU (Windows)
 *           VIDEOS_DIRECTORY=/Users/saurabh/Videos (macOS)
 */
export function getVideosDirectory(): string {
  const configured = process.env["VIDEOS_DIRECTORY"];
  if (configured && configured.trim().length > 0) {
    return path.resolve(configured.trim());
  }
  return path.join(process.cwd(), "videos");
}

/** Content-Type for a video extension, for correct playback in browsers. */
export function contentTypeFor(extension: string): string {
  switch (extension.toLowerCase()) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".ogv":
      return "video/ogg";
    case ".mov":
      return "video/quicktime";
    case ".avi":
      return "video/x-msvideo";
    case ".mkv":
      return "video/x-matroska";
    default:
      return "application/octet-stream";
  }
}

/**
 * Safely resolve a user-supplied filename inside the videos folder.
 * Returns null when the path escapes the folder (path traversal attempt).
 */
export function safeResolveVideoPath(fileName: string): string | null {
  const dir = getVideosDirectory();
  const resolved = path.resolve(dir, fileName);
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) return null;
  return resolved;
}

/** Probe duration (seconds) with ffprobe; null when unavailable. */
async function probeDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      FFPROBE_BIN(),
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { timeout: 10_000 },
    );
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * Generate (or reuse from cache) a JPEG thumbnail for a video.
 * The frame is grabbed ~10% into the file with ffmpeg; the cache key includes
 * file size + mtime so edited videos get fresh thumbnails automatically.
 * Returns the absolute path of the cached JPEG, or null on failure.
 */
export async function getThumbnailPath(fileName: string): Promise<string | null> {
  const filePath = safeResolveVideoPath(fileName);
  if (!filePath) return null;

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat || !fileStat.isFile()) return null;

  const cacheDir =
    process.env["THUMBNAIL_CACHE_DIR"] ||
    path.join(tmpdir(), "lumen-video-thumbnails");
  await mkdir(cacheDir, { recursive: true });

  const key = createHash("sha1")
    .update(`${fileName}:${fileStat.size}:${fileStat.mtimeMs}`)
    .digest("hex");
  const outputPath = path.join(cacheDir, `${key}.jpg`);
  if (existsSync(outputPath)) return outputPath;

  const duration = await probeDuration(filePath);
  // Grab a representative frame: ~10% in, clamped for very short/long files.
  const seekAt =
    duration && duration > 4
      ? Math.min(duration * 0.1, 60)
      : Math.max((duration ?? 4) * 0.25, 0);

  try {
    await execFileAsync(
      FFMPEG_BIN(),
      [
        "-ss", seekAt.toFixed(2),
        "-i", filePath,
        "-frames:v", "1",
        "-vf", "scale=640:-2",
        "-q:v", "4",
        "-y",
        outputPath,
      ],
      { timeout: 30_000 },
    );
  } catch {
    return null;
  }
  return existsSync(outputPath) ? outputPath : null;
}

/**
 * Scan the videos folder and build the metadata list shown in the UI.
 * Never throws: unreadable folders and unreadable files are reported as
 * data (error string / skipped entry) so the UI can show a friendly state.
 */
export async function listVideos(): Promise<VideosResponse> {
  const dir = getVideosDirectory();

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const detail =
      code === "ENOENT"
        ? `The configured videos folder doesn't exist: ${dir}`
        : `The videos folder couldn't be read: ${dir}`;
    return { videos: [], sourceDir: dir, error: detail };
  }

  const videoFiles = entries.filter(
    (entry) =>
      entry.isFile() &&
      VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
  );

  const metas = await Promise.all(
    videoFiles.map(async (entry): Promise<VideoMeta | null> => {
      const filePath = path.join(dir, entry.name);
      const fileStat = await stat(filePath).catch(() => null);
      if (!fileStat || !fileStat.isFile()) return null; // unreadable → skip

      const extension = path.extname(entry.name);
      const title = path.basename(entry.name, extension);
      const query = `?file=${encodeURIComponent(entry.name)}`;
      const duration = await probeDuration(filePath);

      return {
        id: `${title.toLowerCase().replace(/\s+/g, "-")}-${fileStat.size}`,
        title,
        fileName: entry.name,
        sizeBytes: fileStat.size,
        durationSeconds: duration,
        streamUrl: `/api/videos/stream${query}`,
        thumbnailUrl: `/api/videos/thumbnail${query}`,
      };
    }),
  );

  const videos = metas
    .filter((meta): meta is VideoMeta => meta !== null)
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    videos,
    sourceDir: dir,
    error:
      videos.length === 0 ? `No video files found in ${dir}` : null,
  };
}

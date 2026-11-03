/**
 * Shared, client-safe types for the video library.
 * Kept separate from the server module so UI components never import Node code.
 */

export interface VideoMeta {
  /** Stable id derived from the title (used for keys / layout animations). */
  id: string;
  /** Filename without its extension — shown as the movie title. */
  title: string;
  /** Original filename on disk (the `file` query param for the API routes). */
  fileName: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Duration in seconds, or null when ffprobe could not read it. */
  durationSeconds: number | null;
  /** Video resolution, such as 720p or 1920x1080, when available. */
  resolution: string | null;
  /** Streaming endpoint that supports HTTP range requests. */
  streamUrl: string;
  /** Server-generated thumbnail endpoint (null-able on the client is not needed). */
  thumbnailUrl: string | null;
}

export interface VideosResponse {
  videos: VideoMeta[];
  /** Absolute folder that was scanned — shown so users can verify the config. */
  sourceDir: string;
  /** Human-readable problem (missing folder, empty folder), or null. */
  error: string | null;
}

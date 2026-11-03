import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, stat, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { safeResolveVideoPath } from "@/server/videos";

const execFileAsync = promisify(execFile);
const subtitleJobs = new Map<string, Promise<string>>();

interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

function formatVttTime(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const remaining = milliseconds % 60_000;
  const secondsPart = Math.floor(remaining / 1000);
  const millisPart = remaining % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(secondsPart).padStart(2, "0")}.${String(millisPart).padStart(3, "0")}`;
}

function toVtt(segments: SubtitleSegment[]): string {
  return [
    "WEBVTT",
    "",
    ...segments.flatMap((segment, index) => [
      String(index + 1),
      `${formatVttTime(segment.start)} --> ${formatVttTime(segment.end)} line: -5`,
      segment.text.replace(/\r?\n/g, " "),
      "",
    ]),
  ].join("\n");
}

async function generateSubtitleFile(
  filePath: string,
  cachePath: string,
  start: number,
  duration: number,
) {
  const python = process.env["PYTHON_PATH"] || "python";
  const scriptPath = path.join(process.cwd(), "scripts", "generate_subtitles.py");
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      python,
      [scriptPath, filePath, String(start), String(duration)],
      {
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30 * 60 * 1000,
      },
    ));
  } catch (error) {
    console.error("[subtitles] local Whisper generation failed:", error);
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr).trim().split(/\r?\n/).slice(-1)[0]
        : "";
    throw new Error(
      detail
        ? `Local subtitle generation failed: ${detail}`
        : "Local subtitles are not ready. Install requirements-subtitles.txt and ensure Python can run faster-whisper.",
    );
  }

  const segments = JSON.parse(stdout.trim()) as SubtitleSegment[];
  await writeFile(cachePath, toVtt(segments), "utf8");
  return cachePath;
}

export async function getSubtitlePath(fileName: string, start = 0, duration = 60): Promise<string> {
  const filePath = safeResolveVideoPath(fileName);
  if (!filePath) throw new Error("Invalid video file path");

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat || !fileStat.isFile()) throw new Error("Video not found");

  const cacheDir = path.join(
    process.env["SUBTITLE_CACHE_DIR"] || path.join(tmpdir(), "lumen-subtitles"),
  );
  await mkdir(cacheDir, { recursive: true });

  const cacheKey = createHash("sha1")
    .update(
      `${fileName}:${fileStat.size}:${fileStat.mtimeMs}:${start}:${duration}:${process.env["WHISPER_MODEL"] || "base"}:${process.env["WHISPER_LANGUAGE"] || "ja"}`,
    )
    .digest("hex");
  const cachePath = path.join(cacheDir, `${cacheKey}.vtt`);
  if (await stat(cachePath).catch(() => null)) return cachePath;

  const existingJob = subtitleJobs.get(cacheKey);
  if (existingJob) return existingJob;

  const job = generateSubtitleFile(filePath, cachePath, start, duration).finally(() => {
    subtitleJobs.delete(cacheKey);
  });
  subtitleJobs.set(cacheKey, job);
  return job;
}

export async function readSubtitleFile(
  fileName: string,
  start = 0,
  duration = 60,
): Promise<string> {
  return readFile(await getSubtitlePath(fileName, start, duration), "utf8");
}

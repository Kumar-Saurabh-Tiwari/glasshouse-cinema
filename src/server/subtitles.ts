import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { safeResolveVideoPath } from "@/server/videos";

const execFileAsync = promisify(execFile);
const subtitleJobs = new Map<string, Promise<string>>();
const SUBTITLE_CACHE_VERSION = "v8";

interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

function cleanSubtitleText(value: string): string {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return "";

  for (
    let phraseWords = Math.min(24, Math.floor(words.length / 2));
    phraseWords >= 3;
    phraseWords -= 1
  ) {
    const phrase = words.slice(0, phraseWords).join(" ").toLocaleLowerCase();
    let repetitions = 1;
    while (
      repetitions * phraseWords + phraseWords <= words.length &&
      words
        .slice(repetitions * phraseWords, (repetitions + 1) * phraseWords)
        .join(" ")
        .toLocaleLowerCase() === phrase
    ) {
      repetitions += 1;
    }
    if (repetitions >= 2) {
      return [...words.slice(0, phraseWords), ...words.slice(repetitions * phraseWords)]
        .join(" ")
        .slice(0, 240)
        .trim();
    }
  }

  return words.join(" ").slice(0, 240).trim();
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
      cleanSubtitleText(segment.text.replace(/\r?\n/g, " ")),
      "",
    ]),
  ].join("\n");
}

async function polishWithGroq(
  apiKey: string,
  segments: SubtitleSegment[],
): Promise<SubtitleSegment[]> {
  const model = process.env["GROQ_MODEL"];
  if (!model || segments.length === 0) return segments;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You edit English subtitle lines. Return only a JSON array of strings with exactly one item for each input line, in the same order. Preserve meaning, names, tone, and short subtitle style. Do not merge, split, explain, or add text.",
        },
        {
          role: "user",
          content: JSON.stringify(segments.map((segment) => segment.text)),
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Groq chat model returned ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Groq chat model returned no subtitle text");
  const json = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const translated = JSON.parse(json) as unknown;
  if (
    !Array.isArray(translated) ||
    translated.length !== segments.length ||
    translated.some((text) => typeof text !== "string" || !text.trim())
  ) {
    throw new Error("Groq chat model returned an invalid subtitle list");
  }
  return segments.map((segment, index) => ({
    ...segment,
    text: cleanSubtitleText(translated[index] as string),
  }));
}

async function translateCaption(text: string): Promise<string> {
  const query = new URLSearchParams({
    client: "gtx",
    sl: process.env["WHISPER_LANGUAGE"] || "ja",
    tl: "en",
    dt: "t",
    q: text,
  });
  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${query}`);
  if (!response.ok) {
    throw new Error(`Google translation returned ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new Error("Google translation returned an invalid response");
  }
  const translation = payload[0]
    .filter(
      (segment): segment is [string] => Array.isArray(segment) && typeof segment[0] === "string",
    )
    .map(([segment]) => segment)
    .join("")
    .trim();
  if (!translation) throw new Error("Google translation returned no text");
  return translation;
}

async function translateSegments(segments: SubtitleSegment[]): Promise<SubtitleSegment[]> {
  const translated: SubtitleSegment[] = [];
  for (const segment of segments) {
    translated.push({
      ...segment,
      text: cleanSubtitleText(await translateCaption(segment.text)),
    });
  }
  return translated;
}

async function generateSubtitleFile(
  filePath: string,
  cachePath: string,
  start: number,
  duration: number,
) {
  const groqKey = process.env["GROQ_API_KEY"];
  if (groqKey) {
    try {
      return await generateWithGroq(groqKey, filePath, cachePath, start, duration);
    } catch (error) {
      console.warn("[subtitles] Groq transcription failed; using local Whisper fallback:", error);
    }
  }
  return generateWithLocalWhisper(filePath, cachePath, start, duration);
}

async function generateWithGroq(
  apiKey: string,
  filePath: string,
  cachePath: string,
  start: number,
  duration: number,
) {
  const python = process.env["PYTHON_PATH"] || "python";
  const extractScript = path.join(process.cwd(), "scripts", "extract_audio.py");
  const audioPath = path.join(tmpdir(), `lumen-subtitle-${process.pid}-${Date.now()}.wav`);
  try {
    await execFileAsync(
      python,
      [extractScript, filePath, audioPath, String(start), String(duration)],
      {
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
        encoding: "utf8",
        timeout: 5 * 60 * 1000,
      },
    );
    const form = new FormData();
    form.append("file", new Blob([await readFile(audioPath)], { type: "audio/wav" }), "audio.wav");
    form.append("model", process.env["GROQ_TRANSCRIPTION_MODEL"] || "whisper-large-v3-turbo");
    form.append("response_format", "verbose_json");
    const formLanguage = (process.env["WHISPER_LANGUAGE"] || "ja").split("-")[0];
    form.append("language", formLanguage);
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`Groq returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const payload = (await response.json()) as {
      text?: string;
      duration?: number;
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    };
    const timestampedSegments = (payload.segments ?? [])
      .filter((segment) => typeof segment.start === "number" && typeof segment.end === "number")
      .map((segment) => ({
        start: start + (segment.start as number),
        end: start + (segment.end as number),
        text: cleanSubtitleText(String(segment.text ?? "")),
      }))
      .filter((segment) => segment.text.length > 0);
    const segments =
      timestampedSegments.length > 0
        ? timestampedSegments
        : payload.text?.trim()
          ? [
              {
                start,
                end: start + Math.max(1, Math.min(duration, payload.duration || duration)),
                text: cleanSubtitleText(payload.text),
              },
            ]
          : [];
    if (segments.length === 0) throw new Error("Groq returned no timestamped subtitle segments");
    let finalSegments = await translateSegments(segments);
    if (process.env["GROQ_SUBTITLE_POLISH"] === "true" && process.env["GROQ_MODEL"]) {
      try {
        finalSegments = await polishWithGroq(apiKey, finalSegments);
      } catch (error) {
        console.warn("[subtitles] Groq chat polishing failed; keeping Whisper translation:", error);
      }
    }
    await writeFile(cachePath, toVtt(finalSegments), "utf8");
    return cachePath;
  } finally {
    await unlink(audioPath).catch(() => undefined);
  }
}

async function generateWithLocalWhisper(
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

  const segments = (JSON.parse(stdout.trim()) as SubtitleSegment[]).map((segment) => ({
    ...segment,
    start: start + segment.start,
    end: start + segment.end,
  }));
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
      `${SUBTITLE_CACHE_VERSION}:${fileName}:${fileStat.size}:${fileStat.mtimeMs}:${start}:${duration}:${process.env["GROQ_MODEL"] || "none"}:${process.env["GROQ_SUBTITLE_POLISH"] || "false"}:${process.env["GROQ_TRANSCRIPTION_MODEL"] || "whisper-large-v3-turbo"}:${process.env["WHISPER_MODEL"] || "base"}:${process.env["WHISPER_LANGUAGE"] || "ja"}`,
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

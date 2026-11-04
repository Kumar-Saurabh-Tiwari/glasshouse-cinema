/**
 * GET /api/videos/stream?file=<name> — stream a video file.
 * Supports HTTP range requests so the browser can seek instantly and
 * scrub through large files without downloading them whole.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { createFileRoute } from "@tanstack/react-router";

import { contentTypeFor, safeResolveVideoPath } from "@/server/videos";

export const Route = createFileRoute("/api/videos/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const fileName = new URL(request.url).searchParams.get("file");
        const directory = new URL(request.url).searchParams.get("path") ?? undefined;
        if (!fileName) {
          return new Response("Missing `file` query parameter", { status: 400 });
        }

        const filePath = safeResolveVideoPath(fileName, directory);
        if (!filePath) {
          return new Response("Invalid file path", { status: 400 });
        }

        const fileStat = await stat(filePath).catch(() => null);
        if (!fileStat || !fileStat.isFile()) {
          return new Response("Video not found", { status: 404 });
        }

        const contentType = contentTypeFor(path.extname(filePath));
        const rangeHeader = request.headers.get("range");

        // Partial content: serve just the requested byte range (seeking).
        if (rangeHeader) {
          const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
          const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
          const end = match?.[2]
            ? Math.min(Number.parseInt(match[2], 10), fileStat.size - 1)
            : fileStat.size - 1;

          if (start >= fileStat.size || start > end) {
            return new Response("Requested range not satisfiable", {
              status: 416,
              headers: { "Content-Range": `bytes */${fileStat.size}` },
            });
          }

          const nodeStream = createReadStream(filePath, { start, end });
          return new Response(
            Readable.toWeb(nodeStream) as unknown as ReadableStream,
            {
              status: 206,
              headers: {
                "Content-Type": contentType,
                "Content-Length": String(end - start + 1),
                "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-store",
              },
            },
          );
        }

        // Full file.
        const nodeStream = createReadStream(filePath);
        return new Response(
          Readable.toWeb(nodeStream) as unknown as ReadableStream,
          {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Content-Length": String(fileStat.size),
              "Accept-Ranges": "bytes",
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
  },
});

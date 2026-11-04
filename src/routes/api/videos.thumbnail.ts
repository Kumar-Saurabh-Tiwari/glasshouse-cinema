/**
 * GET /api/videos/thumbnail?file=<name> — server-generated poster image.
 * The frame is extracted with ffmpeg (cached on disk by the helper) and
 * returned as a JPEG the browser can cache for a day.
 */
import { readFile } from "node:fs/promises";

import { createFileRoute } from "@tanstack/react-router";

import { getThumbnailPath } from "@/server/videos";

export const Route = createFileRoute("/api/videos/thumbnail")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const fileName = new URL(request.url).searchParams.get("file");
        const directory = new URL(request.url).searchParams.get("path") ?? undefined;
        if (!fileName) {
          return new Response("Missing `file` query parameter", { status: 400 });
        }

        const thumbnailPath = await getThumbnailPath(fileName, directory);
        if (!thumbnailPath) {
          return new Response("Thumbnail unavailable for this file", {
            status: 404,
          });
        }

        const jpeg = await readFile(thumbnailPath);
        return new Response(new Uint8Array(jpeg), {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=86400, immutable",
          },
        });
      },
    },
  },
});

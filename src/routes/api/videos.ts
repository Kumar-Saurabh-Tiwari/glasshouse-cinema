/**
 * GET /api/videos — list every video in the configured folder.
 * Returns metadata for each file: title (filename without extension),
 * size, duration, and URLs for streaming + server-generated thumbnails.
 */
import { createFileRoute } from "@tanstack/react-router";

import { listVideos } from "@/server/videos";

export const Route = createFileRoute("/api/videos")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await listVideos();
          return Response.json(result);
        } catch (err) {
          console.error("[api/videos] failed to list videos:", err);
          return Response.json(
            {
              videos: [],
              sourceDir: "",
              error: "Unexpected error while reading the videos folder.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});

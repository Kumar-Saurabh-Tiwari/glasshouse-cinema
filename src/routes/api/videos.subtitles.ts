import { createFileRoute } from "@tanstack/react-router";

import { readSubtitleFile } from "@/server/subtitles";

export const Route = createFileRoute("/api/videos/subtitles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const fileName = new URL(request.url).searchParams.get("file");
        if (!fileName) {
          return new Response("Missing `file` query parameter", { status: 400 });
        }
        const start = Math.max(
          0,
          Number.parseFloat(new URL(request.url).searchParams.get("start") ?? "0") || 0,
        );
        const duration = Math.min(
          90,
          Math.max(
            30,
            Number.parseFloat(new URL(request.url).searchParams.get("duration") ?? "60") || 60,
          ),
        );

        try {
          const vtt = await readSubtitleFile(fileName, start, duration);
          return new Response(vtt, {
            headers: {
              "Content-Type": "text/vtt; charset=utf-8",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        } catch (error) {
          console.error("[api/videos/subtitles] failed:", error);
          return new Response(
            error instanceof Error ? error.message : "Subtitle generation failed",
            { status: 503 },
          );
        }
      },
    },
  },
});

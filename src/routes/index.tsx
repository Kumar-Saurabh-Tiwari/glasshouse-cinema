import { createFileRoute } from "@tanstack/react-router";

import { VideoLibrary } from "@/components/VideoLibrary";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Lumen — Your Personal Cinema",
      },
      {
        name: "description",
        content:
          "A glassmorphism movie library that plays the videos on your machine, with server-generated thumbnails, a custom player and instant search.",
      },
      {
        property: "og:title",
        content: "Lumen — Your Personal Cinema",
      },
      {
        property: "og:description",
        content:
          "Browse and play your local video library with a premium glassmorphism interface.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="ambient-bg min-h-screen">
      <VideoLibrary />
    </main>
  );
}

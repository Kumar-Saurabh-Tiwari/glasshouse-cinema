import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Expand, History, Globe2, Minimize, X } from "lucide-react";

const WEB_HISTORY_KEY = "lumen-embedded-page-history";

export const Route = createFileRoute("/web")({
  head: () => ({
    meta: [
      { title: "Lumen — Web Viewer" },
      { name: "description", content: "Open and revisit web pages inside Lumen." },
    ],
  }),
  component: WebViewer,
});

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function WebViewer() {
  const [input, setInput] = useState("");
  const [activeUrl, setActiveUrl] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const frameShellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(WEB_HISTORY_KEY) ?? "[]") as unknown;
      if (Array.isArray(saved)) {
        setHistory(saved.filter((item): item is string => typeof item === "string").slice(0, 20));
      }
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === frameShellRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!frameShellRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await frameShellRef.current.requestFullscreen();
  };

  const openUrl = (value: string) => {
    const normalized = value.trim();
    if (!isWebUrl(normalized)) {
      setError("Enter a valid website URL beginning with http:// or https://.");
      return;
    }
    setError("");
    setInput(normalized);
    setActiveUrl(normalized);
    setHistory((previous) => {
      const next = [normalized, ...previous.filter((item) => item !== normalized)].slice(0, 20);
      try {
        localStorage.setItem(WEB_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // The current page still works when storage is unavailable.
      }
      return next;
    });
  };

  const removeHistoryItem = (value: string) => {
    setHistory((previous) => {
      const next = previous.filter((item) => item !== value);
      localStorage.setItem(WEB_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <main className="ambient-bg min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-4 pb-6 sm:px-6 lg:px-10">
        <header className="sticky top-0 z-30 -mx-4 border-b border-white/10 bg-background/75 px-4 py-4 shadow-[0_16px_40px_-28px_oklch(0_0_0/90%)] backdrop-blur-2xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/"
              className="glass inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Library
            </Link>
            <div className="mr-auto flex items-center gap-2">
              <Globe2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-[10px] font-semibold tracking-[0.25em] text-primary/80 uppercase">
                  Private browsing
                </p>
                <h1 className="font-display text-xl font-bold text-foreground">Web Viewer</h1>
              </div>
            </div>
            {activeUrl && (
              <a
                href={activeUrl}
                target="_blank"
                rel="noreferrer"
                className="glass inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
                Open externally
              </a>
            )}
          </div>

          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              openUrl(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste a website URL…"
              aria-label="Website URL"
              className="glass h-11 min-w-0 flex-1 rounded-xl px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
              inputMode="url"
            />
            <button
              type="submit"
              className="h-11 cursor-pointer rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open page
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 pt-5 lg:flex-row">
          <aside className="glass-strong order-2 rounded-2xl p-4 lg:order-1 lg:w-72 lg:shrink-0">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="h-4 w-4 text-primary" />
              Recent pages
            </div>
            {history.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Opened pages will appear here and stay available on this device.
              </p>
            ) : (
              <div className="space-y-1.5">
                {history.map((url) => (
                  <div key={url} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openUrl(url)}
                      title={url}
                      className="min-w-0 flex-1 cursor-pointer truncate rounded-lg px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {url}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${url} from history`}
                      onClick={() => removeHistoryItem(url)}
                      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>

          <section
            ref={frameShellRef}
            className="glass-strong group/frame relative order-1 flex min-h-[60vh] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl lg:order-2"
          >
            {activeUrl ? (
              <>
                <iframe
                  key={activeUrl}
                  src={activeUrl}
                  title="Embedded web page"
                  className="min-h-[70vh] w-full flex-1 border-0 bg-white"
                  allow="fullscreen; autoplay; clipboard-read; clipboard-write"
                />
                <button
                  type="button"
                  aria-label={fullscreen ? "Exit fullscreen" : "View page fullscreen"}
                  title={fullscreen ? "Exit fullscreen" : "View page fullscreen"}
                  onClick={() => void toggleFullscreen()}
                  className="glass-strong absolute top-3 right-3 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-foreground opacity-0 shadow-xl transition-opacity group-hover/frame:opacity-100 focus-visible:opacity-100 hover:bg-accent"
                >
                  {fullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                </button>
              </>
            ) : (
              <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <Globe2 className="h-12 w-12 text-primary/60" />
                <h2 className="font-display text-xl font-semibold text-foreground">
                  Open a page inside Lumen
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  Paste a URL above to view it here. Some sites may block embedded viewing; use
                  “Open externally” when that happens.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

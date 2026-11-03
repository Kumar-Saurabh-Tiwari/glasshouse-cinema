export interface WatchHistoryEntry {
  fileName: string;
  currentTime: number;
  duration: number;
  lastWatched: number;
}

export const WATCH_HISTORY_KEY = "lumen-watch-history-v1";

export function readWatchHistory(): WatchHistoryEntry[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(WATCH_HISTORY_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWatchHistoryEntry).sort((a, b) => b.lastWatched - a.lastWatched);
  } catch {
    return [];
  }
}

export function saveWatchProgress(fileName: string, currentTime: number, duration: number): void {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || currentTime < 5) return;
  const history = readWatchHistory().filter((entry) => entry.fileName !== fileName);
  if (currentTime >= duration - 10) {
    try {
      sessionStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Session history is best effort when browser storage is unavailable.
    }
    return;
  }
  history.unshift({ fileName, currentTime, duration, lastWatched: Date.now() });
  try {
    sessionStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
  } catch {
    // Session history is best effort when browser storage is unavailable.
  }
}

function isWatchHistoryEntry(value: unknown): value is WatchHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<WatchHistoryEntry>;
  return (
    typeof entry.fileName === "string" &&
    typeof entry.currentTime === "number" &&
    typeof entry.duration === "number" &&
    typeof entry.lastWatched === "number"
  );
}

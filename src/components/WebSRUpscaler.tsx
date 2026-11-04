"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type UpscalerStatus = "idle" | "loading" | "ready" | "unsupported" | "error";

interface WebSRUpscalerProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  scale: 1 | 2;
  hdr: boolean;
  onReadyChange: (ready: boolean) => void;
}

export function WebSRUpscaler({
  videoRef,
  enabled,
  scale,
  hdr,
  onReadyChange,
}: WebSRUpscalerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const frameRequestRef = useRef<number | null>(null);
  const frameInFlightRef = useRef(false);
  const [status, setStatus] = useState<UpscalerStatus>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    onReadyChange(false);
    if (!enabled) {
      setStatus("idle");
      return;
    }

    if (!navigator.gpu) {
      setStatus("unsupported");
      setMessage("WebGPU is unavailable. Showing the original video.");
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const worker = new Worker(new URL("../workers/websr.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    setStatus("loading");
    setMessage("Starting WebSR on WebGPU…");

    const onWorkerMessage = (
      event: MessageEvent<{ type: string; message?: string; mode?: "websr" | "fallback" }>,
    ) => {
      if (event.data.type === "ready") {
        setStatus("ready");
        setMessage(
          event.data.mode === "fallback"
            ? "WebSR is unavailable in this browser; using high-quality 2× scaling."
            : "",
        );
        onReadyChange(true);
      } else if (event.data.type === "unsupported") {
        setStatus("unsupported");
        setMessage("WebGPU is unavailable. Showing the original video.");
      } else if (event.data.type === "error") {
        setStatus("error");
        setMessage(event.data.message ?? "WebSR could not start. Showing the original video.");
        onReadyChange(false);
      } else if (event.data.type === "frameDone") {
        frameInFlightRef.current = false;
      }
    };

    const sendFrame = () => {
      if (
        workerRef.current &&
        !frameInFlightRef.current &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        frameInFlightRef.current = true;
        createImageBitmap(video)
          .then((frame) => {
            workerRef.current?.postMessage({ type: "frame", frame }, [frame]);
          })
          .catch(() => {
            frameInFlightRef.current = false;
          });
      }
      frameRequestRef.current = video.requestVideoFrameCallback(sendFrame);
    };

    const offscreen = canvas.transferControlToOffscreen();
    worker.addEventListener("message", onWorkerMessage);
    worker.postMessage({ type: "init", canvas: offscreen, scale }, [offscreen]);
    frameRequestRef.current = video.requestVideoFrameCallback(sendFrame);

    return () => {
      if (frameRequestRef.current !== null) video.cancelVideoFrameCallback(frameRequestRef.current);
      worker.removeEventListener("message", onWorkerMessage);
      worker.terminate();
      workerRef.current = null;
      onReadyChange(false);
    };
  }, [enabled, onReadyChange, scale, videoRef]);

  return (
    <>
      {enabled && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain ${
            status === "ready" ? "opacity-100" : "opacity-0"
          }`}
          style={{
            filter: hdr ? "brightness(1.06) contrast(1.12) saturate(1.18)" : undefined,
          }}
        />
      )}
      {enabled && status !== "ready" && message && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-white/15 bg-black/75 px-3 py-1.5 text-xs text-white/85">
          {message}
        </div>
      )}
    </>
  );
}

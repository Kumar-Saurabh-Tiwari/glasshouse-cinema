type InitMessage = {
  type: "init";
  canvas: OffscreenCanvas;
  scale: 1 | 2;
};

type FrameMessage = {
  type: "frame";
  frame: ImageBitmap;
};

type FrameRenderer = {
  render: (frame: ImageBitmap) => Promise<void>;
};

let renderer: FrameRenderer | null = null;
let outputCanvas: OffscreenCanvas | null = null;
let hasRenderedFrame = false;
let rendererMode: "websr" | "fallback" = "websr";

self.onmessage = async (event: MessageEvent<InitMessage | FrameMessage>) => {
  try {
    if (event.data.type === "init") {
      outputCanvas = event.data.canvas;
      if (event.data.scale !== 2) {
        self.postMessage({ type: "ready", scale: event.data.scale });
        return;
      }

      const gpuAdapter = await navigator.gpu.requestAdapter();
      const gpu = gpuAdapter ? await gpuAdapter.requestDevice() : null;
      if (!gpu) {
        self.postMessage({ type: "unsupported" });
        return;
      }

      const weights = await fetch("/models/cnn-2x-s-rl.json").then(async (response) => {
        if (!response.ok) throw new Error("WebSR model weights could not be loaded.");
        return response.json();
      });

      try {
        const { default: WebSR } = await import("@websr/websr");
        const context = outputCanvas.getContext("webgpu");
        if (!context) throw new Error("WebGPU context could not be created in the worker.");
        const workerGlobals = globalThis as Record<string, unknown>;
        if (typeof workerGlobals.GPUCanvasContext === "undefined") {
          workerGlobals.GPUCanvasContext = context.constructor;
        }

        const websr = new WebSR({
          network_name: "anime4k/cnn-2x-s",
          weights,
          gpu,
          canvas: outputCanvas as unknown as HTMLCanvasElement,
        });
        renderer = websr;
      } catch {
        const context = outputCanvas.getContext("2d");
        if (!context) throw new Error("No canvas renderer is available for upscaling.");
        rendererMode = "fallback";
        renderer = {
          render: async (frame) => {
            const width = frame.width * 2;
            const height = frame.height * 2;
            if (outputCanvas.width !== width || outputCanvas.height !== height) {
              outputCanvas.width = width;
              outputCanvas.height = height;
            }
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.drawImage(frame, 0, 0, width, height);
          },
        };
      }
      self.postMessage({ type: "initialized", scale: event.data.scale });
      return;
    }

    if (event.data.type === "frame" && !renderer) {
      event.data.frame.close();
      self.postMessage({ type: "frameDone" });
      return;
    }

    if (event.data.type === "frame" && renderer) {
      try {
        await renderer.render(event.data.frame);
        if (!hasRenderedFrame) {
          hasRenderedFrame = true;
          self.postMessage({ type: "ready", mode: rendererMode });
        }
      } finally {
        event.data.frame.close();
        self.postMessage({ type: "frameDone" });
      }
    }
  } catch (error) {
    hasRenderedFrame = false;
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "WebSR upscaling failed.",
    });
  }
};

import { FULL_CROP, cropToPixels } from "./screen-crop";
import { maskPixels, resolveContent, type PixelRect } from "./stage-geometry";
import type { HoldSlideId, LayerRect, StageLayout } from "./stage-layout";
import { SOURCES, type SourceId } from "./sources";

export type SourceStreams = Partial<Record<SourceId, MediaStream | null>>;
/** One program bus: thumbnails/editor never enter this canvas or its outgoing stream. */
export class ProgramPipeline {
  readonly canvas = document.createElement("canvas");
  readonly stream: MediaStream;
  private ctx: CanvasRenderingContext2D;
  private videos = new Map<SourceId, { stream: MediaStream; video: HTMLVideoElement }>();
  private layerBuffers = new Map<SourceId, HTMLCanvasElement>();
  private images = new Map<string, HTMLImageElement>();
  private worker: Worker;
  private workerUrl: string;
  private layout: StageLayout;
  private caption = "";
  private previous: HTMLCanvasElement | null = null;
  private transitionFrame = document.createElement("canvas");
  private transitionAt = 0;
  private holdKey = "";
  constructor(layout: StageLayout) {
    this.layout = layout;
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.ctx = this.canvas.getContext("2d")!;
    this.stream = this.canvas.captureStream(30);
    const track = this.stream.getVideoTracks()[0];
    if (track) track.contentHint = "detail";
    this.workerUrl = URL.createObjectURL(
      new Blob(["setInterval(()=>postMessage(0),33)"], { type: "text/javascript" }),
    );
    this.worker = new Worker(this.workerUrl);
    this.worker.onmessage = () => this.draw();
  }
  update(layout: StageLayout, streams: SourceStreams, caption: string) {
    const key = layout.hold ? `${layout.hold.id}:${layout.hold.target}` : "";
    if (key !== this.holdKey && layout.transition !== "cut" && !layout.blackout) {
      const snapshot = document.createElement("canvas");
      snapshot.width = this.canvas.width;
      snapshot.height = this.canvas.height;
      snapshot.getContext("2d")!.drawImage(this.canvas, 0, 0);
      this.previous = snapshot;
      this.transitionAt = performance.now();
    }
    if (layout.blackout) this.previous = null;
    this.holdKey = key;
    this.layout = layout;
    this.caption = caption;
    for (const { id } of SOURCES) {
      const stream = streams[id];
      const existing = this.videos.get(id);
      if (!stream) {
        if (existing) existing.video.srcObject = null;
        this.videos.delete(id);
        continue;
      }
      if (existing?.stream === stream) continue;
      if (existing) existing.video.srcObject = null;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      void video.play().catch(() => {});
      this.videos.set(id, { stream, video });
    }
    const activeImages = new Set(Object.values(layout.holdImages ?? {}));
    for (const url of this.images.keys()) if (!activeImages.has(url)) this.images.delete(url);
    for (const url of Object.values(layout.holdImages ?? {}))
      if (url && !this.images.has(url)) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = url;
        this.images.set(url, image);
      }
  }
  private text(
    text: string,
    box: PixelRect,
    size: number,
    y: number,
    weight = 600,
    color = "#f7faf7",
    c = this.ctx,
  ) {
    c.font = `${weight} ${size}px system-ui, sans-serif`;
    c.fillStyle = color;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const lines: string[] = [];
    let line = "";
    for (const char of text) {
      if (char === "\n" || c.measureText(line + char).width > box.width * 0.88) {
        lines.push(line);
        line = char === "\n" ? "" : char;
      } else line += char;
    }
    if (line) lines.push(line);
    lines
      .slice(0, 6)
      .forEach((value, i) =>
        c.fillText(
          value,
          box.x + box.width / 2,
          y + (i - (Math.min(lines.length, 6) - 1) / 2) * size * 1.3,
        ),
      );
  }
  private hold(id: HoldSlideId, box: PixelRect, c = this.ctx) {
    const layout = this.layout,
      image = this.images.get(layout.holdImages?.[id] ?? "");
    c.save();
    c.beginPath();
    c.rect(box.x, box.y, box.width, box.height);
    c.clip();
    c.fillStyle = "#000";
    c.fillRect(box.x, box.y, box.width, box.height);
    if (image?.complete && image.naturalWidth) {
      const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
      const w = image.naturalWidth * scale,
        h = image.naturalHeight * scale;
      c.drawImage(image, box.x + (box.width - w) / 2, box.y + (box.height - h) / 2, w, h);
    } else {
      const gradient = c.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height);
      gradient.addColorStop(0, id === "technical" ? "#293126" : "#123d2c");
      gradient.addColorStop(1, "#061b12");
      c.fillStyle = gradient;
      c.fillRect(box.x, box.y, box.width, box.height);
      const size = Math.min(box.width * 0.06, box.height * 0.12);
      this.text(
        layout.holdTexts[id].title,
        box,
        size,
        box.y + box.height * 0.46,
        750,
        "#f7faf7",
        c,
      );
      this.text(
        layout.holdTexts[id].subtitle,
        box,
        size * 0.43,
        box.y + box.height * 0.65,
        400,
        "#b5c6b9",
        c,
      );
      this.text("BOTNOI LIVE RELAY", box, size * 0.2, box.y + box.height * 0.86, 600, "#dce44b", c);
    }
    c.restore();
  }
  private layer(id: SourceId, layer: LayerRect) {
    if (!layer.visible) return;
    const output = this.ctx,
      mask = maskPixels(layer, this.layout.aspect);
    let buffer = this.layerBuffers.get(id);
    if (!buffer) {
      buffer = document.createElement("canvas");
      this.layerBuffers.set(id, buffer);
    }
    const width = Math.max(1, Math.ceil((mask.width * this.canvas.width) / this.layout.aspect.w));
    const height = Math.max(
      1,
      Math.ceil((mask.height * this.canvas.height) / this.layout.aspect.h),
    );
    if (buffer.width !== width || buffer.height !== height) {
      buffer.width = width;
      buffer.height = height;
    }
    const c = buffer.getContext("2d")!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, width, height);
    c.setTransform(
      width / mask.width,
      0,
      0,
      height / mask.height,
      (-mask.x * width) / mask.width,
      (-mask.y * height) / mask.height,
    );
    c.save();
    c.beginPath();
    c.rect(mask.x, mask.y, mask.width, mask.height);
    c.clip();
    // Compose the entire masked layer before applying group opacity/blending once.
    if (this.layout.hold?.target === id) this.hold(this.layout.hold.id, mask, c);
    else {
      c.fillStyle = "#000";
      c.fillRect(mask.x, mask.y, mask.width, mask.height);
      const source = this.videos.get(id),
        video = source?.video;
      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth &&
        video.videoHeight &&
        source!.stream.getVideoTracks().some((t) => t.readyState === "live")
      ) {
        const crop = cropToPixels(
          layer.sourceCrop ?? FULL_CROP,
          video.videoWidth,
          video.videoHeight,
        );
        const content = resolveContent(layer, this.layout.aspect, {
          w: video.videoWidth,
          h: video.videoHeight,
        });
        c.drawImage(
          video,
          crop.x,
          crop.y,
          crop.w,
          crop.h,
          content.x,
          content.y,
          content.width,
          content.height,
        );
      } else if (id === "translation" && this.caption) {
        const content = resolveContent(layer, this.layout.aspect);
        this.text(
          this.caption,
          content,
          (content.width * 0.024 * this.layout.fontScale) / 50,
          content.y + content.height / 2,
          600,
          "#fff",
          c,
        );
      }
    }
    c.restore();
    output.save();
    output.globalAlpha = (layer.opacity ?? 100) / 100;
    output.globalCompositeOperation = layer.knockout ? "screen" : "source-over";
    output.drawImage(buffer, mask.x, mask.y, mask.width, mask.height);
    output.restore();
  }
  draw() {
    const { aspect, blackout, hold } = this.layout,
      c = this.ctx;
    const scale = Math.min(1, 1920 / aspect.w, 1080 / aspect.h);
    const w = Math.max(2, Math.round((aspect.w * scale) / 2) * 2),
      h = Math.max(2, Math.round((aspect.h * scale) / 2) * 2);
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.previous = null;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.fillStyle = "#000";
    c.fillRect(0, 0, w, h);
    if (blackout) return;
    c.setTransform(w / aspect.w, 0, 0, h / aspect.h, 0, 0);
    if (hold?.target === "stage")
      this.hold(hold.id, { x: 0, y: 0, width: aspect.w, height: aspect.h });
    else
      SOURCES.map((s) => s.id)
        .sort((a, b) => this.layout.layers[a].z - this.layout.layers[b].z)
        .forEach((id) => this.layer(id, this.layout.layers[id]));
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.previous) {
      const progress = Math.min(1, (performance.now() - this.transitionAt) / 450);
      if (progress < 1) {
        if (this.layout.transition === "slide" || this.layout.transition === "zoom") {
          this.transitionFrame.width = w;
          this.transitionFrame.height = h;
          this.transitionFrame.getContext("2d")!.drawImage(this.canvas, 0, 0);
          c.fillStyle = "#000";
          c.fillRect(0, 0, w, h);
          if (this.layout.transition === "slide") {
            c.drawImage(this.previous, 0, -h * progress, w, h);
            c.drawImage(this.transitionFrame, 0, h * (1 - progress), w, h);
          } else {
            const zoom = 0.94 + 0.06 * progress;
            c.drawImage(
              this.transitionFrame,
              (w * (1 - zoom)) / 2,
              (h * (1 - zoom)) / 2,
              w * zoom,
              h * zoom,
            );
            c.globalAlpha = 1 - progress;
            c.drawImage(this.previous, 0, 0, w, h);
          }
        } else {
          c.globalAlpha = 1 - progress;
          c.drawImage(this.previous, 0, 0, w, h);
        }
        c.globalAlpha = 1;
      } else this.previous = null;
    }
  }
  stop() {
    this.worker.terminate();
    URL.revokeObjectURL(this.workerUrl);
    this.videos.forEach(({ video }) => {
      video.pause();
      video.srcObject = null;
    });
    this.videos.clear();
    this.stream.getTracks().forEach((t) => t.stop());
    this.images.clear();
    this.layerBuffers.clear();
  }
}

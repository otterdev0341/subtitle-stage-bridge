import { cropToPixels, type CropRect } from "./screen-crop";

const MAX_W = 1920;

/** Draws a cropped region of a captured screen into a canvas and exposes it as a stream. Uses a worker timer so it keeps running in background tabs. */
export class CropPipeline {
  readonly stream: MediaStream;
  crop: CropRect;
  paused = false;
  outSize = { w: 0, h: 0 };
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private worker: Worker;
  private workerUrl: string;

  constructor(raw: MediaStream, crop: CropRect, fps = 30) {
    this.crop = crop;
    this.video = document.createElement("video");
    this.video.muted = true; this.video.playsInline = true; this.video.srcObject = raw;
    void this.video.play().catch(() => undefined);
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1280; this.canvas.height = 720;
    const context = this.canvas.getContext("2d");
    if (!context) {
      this.video.srcObject = null;
      throw new Error("สร้างภาพสำหรับส่งไม่สำเร็จ");
    }
    this.ctx = context;
    this.stream = this.canvas.captureStream(fps);
    const track = this.stream.getVideoTracks()[0];
    if (track && "contentHint" in track) track.contentHint = "detail";
    this.workerUrl = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${Math.round(1000 / fps)});`], { type: "text/javascript" }));
    this.worker = new Worker(this.workerUrl);
    this.worker.onmessage = () => this.draw();
  }

  private draw() {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const px = cropToPixels(this.crop, vw, vh);
    const scale = Math.min(1, MAX_W / px.w);
    const ow = Math.max(2, Math.round(px.w * scale / 2) * 2), oh = Math.max(2, Math.round(px.h * scale / 2) * 2);
    if (this.canvas.width !== ow || this.canvas.height !== oh) { this.canvas.width = ow; this.canvas.height = oh; }
    this.outSize = { w: ow, h: oh };
    if (this.paused) { this.ctx.fillStyle = "#000"; this.ctx.fillRect(0, 0, ow, oh); return; }
    this.ctx.drawImage(this.video, px.x, px.y, px.w, px.h, 0, 0, ow, oh);
  }

  stop() {
    this.worker.terminate();
    URL.revokeObjectURL(this.workerUrl);
    this.stream.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }
}

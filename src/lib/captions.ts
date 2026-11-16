export type CaptionStyle = {
  fontSize: number;
  maxLines: number;
  bottom: number;
  background: number;
  bilingual: boolean;
  readingSeconds: number;
};
export type CaptionTrack = {
  sequence: number;
  segmentId: string;
  revision: number;
  source: string;
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  visible: boolean;
  held: boolean;
  expiresAt: number | null;
  style: CaptionStyle;
};
export const defaultCaption = (): CaptionTrack => ({
  sequence: 0,
  segmentId: "",
  revision: 0,
  source: "",
  text: "",
  sourceLanguage: "th",
  targetLanguage: "en",
  visible: true,
  held: false,
  expiresAt: null,
  style: {
    fontSize: 48,
    maxLines: 2,
    bottom: 6,
    background: 85,
    bilingual: false,
    readingSeconds: 12,
  },
});
export function publishCaption(
  current: CaptionTrack,
  source: string,
  text: string,
  now = Date.now(),
): CaptionTrack {
  return {
    ...current,
    sequence: current.sequence + 1,
    segmentId: crypto.randomUUID(),
    revision: 0,
    source: source.slice(0, 2000),
    text: text.slice(0, 2000),
    expiresAt: current.style.readingSeconds ? now + current.style.readingSeconds * 1000 : null,
  };
}
export function captionIsVisible(track: CaptionTrack, now = Date.now()) {
  return (
    track.visible &&
    !!track.text &&
    (track.held || track.expiresAt === null || now < track.expiresAt)
  );
}

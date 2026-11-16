export const SOURCES = [
  { id: "presentation", letter: "A", name: "Presentation", color: "#4bafff" },
  { id: "translation", letter: "B", name: "Translation", color: "#e6e84b" },
  { id: "source-c", letter: "C", name: "Source C", color: "#c598ff" },
  { id: "source-d", letter: "D", name: "Source D", color: "#ffac65" },
  { id: "source-e", letter: "E", name: "Source E", color: "#74dfbf" },
] as const;
export type SourceId = (typeof SOURCES)[number]["id"];
export const isSourceId = (id: unknown): id is SourceId =>
  SOURCES.some((source) => source.id === id);
export const sourceInfo = (id: SourceId) => SOURCES.find((source) => source.id === id)!;
export const sourceTitle = (id: SourceId, name?: string) =>
  `${sourceInfo(id).letter} · ${name || sourceInfo(id).name}`;
export const emptyStreams = (): Record<SourceId, MediaStream | null> =>
  Object.fromEntries(SOURCES.map((s) => [s.id, null])) as Record<SourceId, MediaStream | null>;

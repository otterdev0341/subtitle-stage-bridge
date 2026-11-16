import type { StageLayout } from "./stage-layout";

/** Commit composition, never overwrite live transport, caption or emergency controls. */
export function takeScene(program: StageLayout, draft: StageLayout): StageLayout {
  return {
    ...program,
    layers: structuredClone(draft.layers),
    aspect: { ...draft.aspect },
    fontScale: draft.fontScale,
    arrangement: draft.arrangement ?? "overlay",
    split: draft.split ?? 75,
    splitSwap: draft.splitSwap ?? false,
    transition: draft.transition,
    holdTexts: structuredClone(draft.holdTexts),
    holdImages: structuredClone(draft.holdImages ?? {}),
    ...(draft.quickSlots ? { quickSlots: structuredClone(draft.quickSlots) } : {}),
  };
}
export function sceneIsDirty(program: StageLayout, draft: StageLayout) {
  const composition = (l: StageLayout) =>
    JSON.stringify([
      l.layers,
      l.aspect,
      l.arrangement ?? "overlay",
      l.split ?? 75,
      l.splitSwap ?? false,
      l.transition,
      l.fontScale,
      l.holdTexts,
      l.holdImages ?? {},
      l.quickSlots,
    ]);
  return composition(program) !== composition(draft);
}

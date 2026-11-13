import { useCallback, useRef, useState, type SetStateAction } from "react";
import { defaultLayout, type StageLayout } from "@/lib/stage-layout";

const composition = (l: StageLayout) =>
  JSON.stringify([l.layers, l.aspect, l.arrangement, l.split, l.splitSwap, l.fontScale]);
export function useStageHistory() {
  const [layout, publish] = useState(defaultLayout);
  const current = useRef(layout);
  const past = useRef<StageLayout[]>([]),
    future = useRef<StageLayout[]>([]);
  const gesture = useRef(false),
    recorded = useRef(false);
  const setLayout = useCallback((action: SetStateAction<StageLayout>) => {
    const before = current.current;
    const next = typeof action === "function" ? action(before) : action;
    if (composition(before) !== composition(next)) {
      if (!gesture.current || !recorded.current)
        past.current = [...past.current.slice(-49), before];
      future.current = [];
      recorded.current = true;
    }
    current.current = next;
    publish(next);
    return next;
  }, []);
  // Restore composition only: undoing a move must never dismiss an active hold/blackout.
  const restore = (saved: StageLayout) => {
    const next = {
      ...current.current,
      layers: saved.layers,
      aspect: saved.aspect,
      fontScale: saved.fontScale,
      arrangement: saved.arrangement ?? "overlay",
      split: saved.split ?? 75,
      splitSwap: saved.splitSwap ?? false,
    };
    current.current = next;
    publish(next);
  };
  return {
    layout,
    setLayout,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    beginEdit: () => {
      gesture.current = true;
      recorded.current = false;
    },
    endEdit: () => {
      gesture.current = false;
      recorded.current = false;
    },
    undo: () => {
      const saved = past.current.pop();
      if (saved) {
        future.current.push(current.current);
        restore(saved);
      }
    },
    redo: () => {
      const saved = future.current.pop();
      if (saved) {
        past.current.push(current.current);
        restore(saved);
      }
    },
  };
}

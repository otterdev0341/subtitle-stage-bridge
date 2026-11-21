import { useEffect } from "react";
import { commandForKey, type ShowCommand } from "@/lib/show-controls";

export function useShowKeyboard(
  execute: (command: ShowCommand) => void,
  fullscreen: () => void,
  undo?: () => void,
  redo?: () => void,
  take?: () => void,
) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : document.activeElement;
      if (
        target?.closest(
          "input,textarea,select,[contenteditable],[role=textbox],[role=slider],[role=tab]",
        ) ||
        event.repeat ||
        event.isComposing
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) redo?.();
        else undo?.();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "KeyF") {
        event.preventDefault();
        fullscreen();
        return;
      }
      if (
        event.code === "Space" &&
        take &&
        !(target instanceof Element && target.closest("button,a"))
      ) {
        event.preventDefault();
        take();
        return;
      }
      const command = commandForKey(event);
      if (command) {
        event.preventDefault();
        execute(command);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [execute, fullscreen, undo, redo, take]);
}

import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourcePreview } from "@/components/stage/SourcePreview";
import { SOURCES, emptyStreams } from "@/lib/sources";
import {
  defaultLayout,
  normalizeLayout,
  BUILT_IN_TEMPLATES,
  applyTemplate,
  bringToFront,
  sendToBack,
} from "@/lib/stage-layout";
import { parseRoomView, roomPath } from "@/lib/room-links";
import { reduceShowCommand } from "@/lib/show-controls";

afterEach(cleanup);
describe("five source control room", () => {
  it("upgrades old two-input layouts without making new inputs visible", () => {
    const old = defaultLayout();
    const legacy = {
      ...old,
      layers: { presentation: old.layers.presentation, translation: old.layers.translation },
    };
    const migrated = normalizeLayout(legacy as typeof old);
    expect(Object.keys(migrated.layers)).toHaveLength(5);
    expect(migrated.layers.presentation).toEqual(old.layers.presentation);
    expect(migrated.layers["source-e"].visible).toBe(false);
    expect(
      applyTemplate(
        old,
        BUILT_IN_TEMPLATES.find((t) => t.id === "builtin-five")!,
      ).layers["source-e"].visible,
    ).toBe(true);
  });
  it("uses stable A–E links, preserves old invitations, and has a separate Presenter view", () => {
    expect(roomPath("room", "presentation")).toBe("/room/room?view=presentation");
    expect(roomPath("room", "source-e")).toBe("/room/room?view=source&slot=E");
    expect(parseRoomView({ view: "source", slot: "D" })).toBe("source-d");
    expect(parseRoomView({ view: "presenter" })).toBe("presenter");
    expect(parseRoomView({ view: "source", slot: "F" })).toBe("presentation");
  });
  it("orders every layer, including hidden sources, without losing content/mask data", () => {
    const original = defaultLayout().layers;
    const front = bringToFront(original, "source-d");
    expect(front["source-d"].z).toBe(5);
    expect(sendToBack(front, "source-d")["source-d"].z).toBe(1);
    expect(Object.keys(front)).toHaveLength(5);
  });
  it("selection does not toggle visibility and toggling does not change the edit target", () => {
    const layout = defaultLayout(),
      onSelect = vi.fn(),
      onToggle = vi.fn();
    const preview = (activeLayer = layout.activeLayer) => (
      <SourcePreview
        layout={{ ...layout, activeLayer }}
        streams={emptyStreams()}
        onSelect={onSelect}
        onToggle={onToggle}
        onCopy={() => {}}
        copied={null}
        onSize={() => {}}
        candidates={[]}
        onReplace={() => {}}
        health={{}}
        onHealth={() => {}}
      />
    );
    const { rerender } = render(preview());
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "จอ E · Source E" }));
    expect(onSelect).toHaveBeenCalledWith("source-e");
    expect(onToggle).not.toHaveBeenCalled();
    rerender(preview("source-e"));
    expect(screen.getByRole("tab", { name: "จอ E · Source E" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "แสดงจอ E ใน LIVE" }));
    expect(onToggle).toHaveBeenCalledWith("source-e");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(layout.activeLayer).toBe("translation");
    fireEvent.keyDown(screen.getByRole("tab", { name: "จอ E · Source E" }), { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith("presentation");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
  it("supports C–E hide shortcuts without changing their geometry", () => {
    for (const [command, id] of [
      ["toggleC", "source-c"],
      ["toggleD", "source-d"],
      ["toggleE", "source-e"],
    ] as const) {
      const layout = defaultLayout(),
        original = layout.layers[id];
      const toggled = reduceShowCommand(layout, command);
      expect(toggled.layers[id]).toEqual({ ...original, visible: true });
      expect(toggled.activeLayer).toBe(layout.activeLayer);
    }
    expect(SOURCES).toHaveLength(5);
  });
});

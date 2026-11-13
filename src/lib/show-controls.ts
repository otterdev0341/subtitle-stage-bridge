import { applyTemplate, BUILT_IN_TEMPLATES, type StageLayout } from "./stage-layout";

export const SHOW_ACTIONS = [
  ["live", "LIVE", "0"],
  ["wait", "กรุณารอสักครู่", "1"],
  ["title", "ชื่อเรื่อง", "2"],
  ["technical", "ขัดข้องทางเทคนิค", "3"],
  ["slot1", "Layout 1", "4"],
  ["slot2", "Layout 2", "5"],
  ["slot3", "Layout 3", "6"],
  ["slot4", "Layout 4", "7"],
  ["slot5", "Layout 5", "8"],
  ["toggleB", "แสดง/ซ่อน B", "H"],
  ["toggleA", "แสดง/ซ่อน A", "P"],
  ["blackout", "จอดำ", "K"],
] as const;
export type ShowCommand = (typeof SHOW_ACTIONS)[number][0];
export const isShowCommand = (value: unknown): value is ShowCommand =>
  SHOW_ACTIONS.some(([id]) => id === value);
export function commandForKey(event: Pick<KeyboardEvent, "key" | "code">): ShowCommand | undefined {
  return SHOW_ACTIONS.find(
    ([, , key]) =>
      event.key.toUpperCase() === key ||
      event.code === (/[0-9]/.test(key) ? `Digit${key}` : `Key${key}`),
  )?.[0];
}
export function reduceShowCommand(layout: StageLayout, command: ShowCommand): StageLayout {
  if (command === "live") return { ...layout, hold: null, blackout: false };
  if (command === "blackout") return { ...layout, blackout: !layout.blackout };
  if (command === "wait" || command === "title" || command === "technical")
    return { ...layout, hold: { id: command, target: "stage" }, blackout: false };
  if (command === "toggleA" || command === "toggleB") {
    const name = command === "toggleA" ? "presentation" : "translation";
    return {
      ...layout,
      layers: {
        ...layout.layers,
        [name]: { ...layout.layers[name], visible: !layout.layers[name].visible },
      },
    };
  }
  const template = (layout.quickSlots ?? BUILT_IN_TEMPLATES)[Number(command.slice(-1)) - 1];
  return template ? applyTemplate(layout, template) : layout;
}

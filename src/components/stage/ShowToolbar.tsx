import { SHOW_ACTIONS, type ShowCommand } from "@/lib/show-controls";
import type { StageLayout } from "@/lib/stage-layout";
import type { SourceId } from "@/lib/sources";

export function ShowToolbar({
  layout,
  execute,
  disabled = false,
}: {
  layout: StageLayout;
  execute: (command: ShowCommand) => void;
  disabled?: boolean;
}) {
  return (
    <div className="control-show-toolbar" role="group" aria-label="คำสั่งขึ้น LIVE ทันที">
      {SHOW_ACTIONS.map(([command, label, key]) => {
        const source = (
          {
            toggleA: "presentation",
            toggleB: "translation",
            toggleC: "source-c",
            toggleD: "source-d",
            toggleE: "source-e",
          } as Partial<Record<ShowCommand, SourceId>>
        )[command];
        const active = source
          ? layout.layers[source].visible
          : command === "blackout"
            ? !!layout.blackout
            : command === "live"
              ? !layout.blackout && !layout.hold
              : command === "captions"
                ? layout.captions?.visible
                : command === "wait" || command === "title" || command === "technical"
                  ? layout.hold?.id === command && !layout.blackout
                  : false;
        return (
          <button
            key={command}
            type="button"
            disabled={disabled}
            aria-pressed={!!active}
            onClick={() => execute(command)}
          >
            {command.startsWith("slot")
              ? `${label} · ${(layout.quickSlots ?? [])[Number(command.slice(-1)) - 1]?.name ?? "ฉากเริ่มต้น"}`
              : label}
            <kbd>{key}</kbd>
          </button>
        );
      })}
    </div>
  );
}

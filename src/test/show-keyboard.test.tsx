import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useShowKeyboard } from "@/hooks/use-show-keyboard";

afterEach(cleanup);
it("does not execute show commands while editing text, and handles commands outside editors", () => {
  const execute = vi.fn(),
    fullscreen = vi.fn(),
    take = vi.fn();
  function Harness() {
    useShowKeyboard(execute, fullscreen, undefined, undefined, take);
    return (
      <>
        <textarea aria-label="Caption editor" />
        <button role="tab">Source tab</button>
        <div data-testid="workspace" tabIndex={0}>
          Workspace
        </div>
      </>
    );
  }
  const view = render(<Harness />);
  fireEvent.keyDown(view.getByLabelText("Caption editor"), { key: "k", code: "KeyK" });
  fireEvent.keyDown(view.getByRole("tab"), { key: "s", code: "KeyS" });
  expect(execute).not.toHaveBeenCalled();
  fireEvent.keyDown(view.getByTestId("workspace"), { key: "k", code: "KeyK" });
  expect(execute).toHaveBeenCalledWith("blackout");
  fireEvent.keyDown(view.getByTestId("workspace"), { key: " ", code: "Space" });
  expect(take).toHaveBeenCalledTimes(1);
});

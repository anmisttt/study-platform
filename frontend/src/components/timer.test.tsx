import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Timer from "./timer";

describe("Timer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pauses externally without resetting elapsed time", () => {
    vi.useFakeTimers();
    const view = render(<Timer initialSeconds={3} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("00:02")).toBeTruthy();

    view.rerender(<Timer initialSeconds={3} paused />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("00:02")).toBeTruthy();

    view.rerender(<Timer initialSeconds={3} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("00:01")).toBeTruthy();
  });

  it("resets through its button and through a new component key", () => {
    vi.useFakeTimers();
    const view = render(<Timer key="first" initialSeconds={3} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("00:01")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset timer" }));
    expect(screen.getByText("00:03")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    view.rerender(<Timer key="second" initialSeconds={5} />);
    expect(screen.getByText("00:05")).toBeTruthy();
  });
});

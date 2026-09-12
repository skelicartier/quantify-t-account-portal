import { act, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { LiveRefresh } from "@/components/shell/live-refresh";

/** jsdom reports `document.hidden` from `visibilityState`, which is writable only here. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

function tick(seconds: number): void {
  act(() => {
    vi.advanceTimersByTime(seconds * 1_000);
  });
}

/** `fireEvent` rather than `userEvent`: the latter waits on real timers these tests fake. */
function toggle(): void {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: /updates/ }));
  });
}

describe("LiveRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.refresh.mockClear();
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks the server for a fresh render on its interval", () => {
    // Every page here is force-dynamic and every fetch is no-store, so the only thing
    // missing was anything that asks.
    render(<LiveRefresh label="Queue" intervalSeconds={30} />);

    tick(30);

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the tab is hidden", () => {
    // A desk leaves the queue open all day. Polling a background tab spends the operator's
    // battery and the service's rate limit to redraw something nobody is looking at.
    render(<LiveRefresh label="Queue" intervalSeconds={30} />);
    setHidden(true);

    tick(120);

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("refreshes the moment the tab comes back", () => {
    // Returning is when the page is most likely to be stale and most likely to be read.
    render(<LiveRefresh label="Queue" intervalSeconds={30} />);
    setHidden(true);
    tick(120);

    setHidden(false);

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not re-render the tree while somebody is typing", async () => {
    // A half-written reply is the one thing on these pages worth protecting.
    render(
      <>
        <textarea aria-label="Reply" />
        <LiveRefresh label="Queue" intervalSeconds={30} />
      </>,
    );
    screen.getByRole("textbox", { name: "Reply" }).focus();

    tick(60);

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("resumes once the box loses focus", () => {
    render(
      <>
        <textarea aria-label="Reply" />
        <LiveRefresh label="Queue" intervalSeconds={30} />
      </>,
    );
    const box = screen.getByRole("textbox", { name: "Reply" });
    box.focus();
    tick(30);
    box.blur();

    tick(30);

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("can be turned off, and says so", () => {
    // A live view with no off switch is one people work around by closing the page.
    render(<LiveRefresh label="Queue" intervalSeconds={30} />);

    toggle();
    tick(120);

    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Queue updates paused" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("can be turned back on", () => {
    render(<LiveRefresh label="Queue" intervalSeconds={30} />);

    toggle();
    toggle();
    tick(30);

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("will not poll faster than the floor, whatever it is asked for", () => {
    // A caller passing 0 or 1 would otherwise turn a convenience into a load generator.
    render(<LiveRefresh label="Queue" intervalSeconds={0} />);

    tick(4);

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("stops when the page it belongs to goes away", () => {
    const view = render(<LiveRefresh label="Queue" intervalSeconds={30} />);

    view.unmount();
    tick(120);

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("names what it is keeping current", () => {
    render(<LiveRefresh label="Conversation" intervalSeconds={15} />);

    expect(
      screen.getByRole("button", { name: "Conversation updates automatically" }),
    ).toBeInTheDocument();
  });
});

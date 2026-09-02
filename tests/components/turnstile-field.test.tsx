import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { TurnstileField } from "@/components/auth/turnstile-field";
import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";

vi.mock("next/script", () => ({
  default: function ScriptStub({
    onReady,
    onError,
  }: {
    onReady?: () => void;
    onError?: () => void;
  }) {
    return (
      <div data-testid="script-stub">
        <button type="button" onClick={() => onReady?.()}>
          script ready
        </button>
        <button type="button" onClick={() => onError?.()}>
          script error
        </button>
      </div>
    );
  },
}));

type CapturedOptions = {
  callback(token: string): void;
  "expired-callback"(): void;
  "error-callback"(): void;
};

function hiddenToken(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[name="${CHALLENGE_FIELD_NAME}"]`);
  if (!input) throw new Error("Turnstile token input was not rendered.");
  return input;
}

describe("Turnstile field lifecycle", () => {
  afterEach(() => {
    delete window.turnstile;
  });

  it("invalidates the token after every completed submission, including equal failures", async () => {
    let options: CapturedOptions | undefined;
    const reset = vi.fn();
    const remove = vi.fn();
    window.turnstile = {
      render: vi.fn((_container, suppliedOptions) => {
        options = suppliedOptions;
        return "widget-1";
      }),
      reset,
      remove,
    };

    const view = render(
      <TurnstileField siteKey="public-site-key" error="The same generic failure" />,
    );
    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledOnce());

    act(() => options?.callback("first-one-time-token"));
    expect(hiddenToken(view.container)).toHaveValue("first-one-time-token");

    view.rerender(
      <TurnstileField siteKey="public-site-key" error="The same generic failure" disabled />,
    );
    view.rerender(<TurnstileField siteKey="public-site-key" error="The same generic failure" />);
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
    expect(reset).toHaveBeenLastCalledWith("widget-1");
    expect(hiddenToken(view.container)).toHaveValue("");

    act(() => options?.callback("second-one-time-token"));
    expect(hiddenToken(view.container)).toHaveValue("second-one-time-token");

    view.rerender(
      <TurnstileField siteKey="public-site-key" error="The same generic failure" disabled />,
    );
    view.rerender(<TurnstileField siteKey="public-site-key" error="The same generic failure" />);
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(2));
    expect(hiddenToken(view.container)).toHaveValue("");

    view.unmount();
    expect(remove).toHaveBeenCalledWith("widget-1");
  });

  it("clears expired/error tokens and reports widget or script failure", async () => {
    let options: CapturedOptions | undefined;
    window.turnstile = {
      render: vi.fn((_container, suppliedOptions) => {
        options = suppliedOptions;
        return "widget-2";
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };

    const view = render(<TurnstileField siteKey="public-site-key" />);
    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledOnce());

    act(() => options?.callback("short-lived-token"));
    act(() => options?.["expired-callback"]());
    expect(hiddenToken(view.container)).toHaveValue("");

    act(() => options?.callback("replacement-token"));
    act(() => options?.["error-callback"]());
    expect(hiddenToken(view.container)).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent("Security verification is unavailable");

    fireEvent.click(screen.getByRole("button", { name: "script error" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Security verification is unavailable");
  });
});

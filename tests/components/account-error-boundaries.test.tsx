import { render, screen } from "@testing-library/react";

import AccountError from "@/app/account/error";
import RootError from "@/app/error";

const providerDetail = new Error(
  "permission denied for relation app_profiles at https://project.supabase.co (hint: check RLS)",
);

describe("account error boundaries", () => {
  it.each([
    ["root", RootError, "This secure view could not load"],
    ["account segment", AccountError, "We could not refresh this account view"],
  ])("renders generic %s copy with a retry control", (_label, Boundary, heading) => {
    const reset = vi.fn();

    render(<Boundary error={providerDetail} reset={reset} />);

    expect(screen.getByRole("heading", { level: 1, name: new RegExp(heading, "i") })).toBeVisible();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeEnabled();
  });

  it.each([
    ["root", RootError],
    ["account segment", AccountError],
  ])("never renders provider detail from the %s boundary", (_label, Boundary) => {
    const { container } = render(<Boundary error={providerDetail} reset={vi.fn()} />);

    const rendered = container.textContent ?? "";
    expect(rendered).not.toContain("permission denied");
    expect(rendered).not.toContain("app_profiles");
    expect(rendered).not.toContain("supabase.co");
    expect(rendered).not.toContain("hint");
  });

  it("invokes reset so a transient outage can be retried in place", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    const reset = vi.fn();

    render(<AccountError error={providerDetail} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(reset).toHaveBeenCalledOnce();
  });
});

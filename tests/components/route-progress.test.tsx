import { act, render, screen } from "@testing-library/react";

import { RouteProgress } from "@/components/shell/route-progress";

const navigation = vi.hoisted(() => ({ pathname: "/account", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

describe("RouteProgress", () => {
  beforeEach(() => {
    navigation.pathname = "/account";
    navigation.search = "";
  });

  it("shows while a same-origin link is loading and hides once the location changes", () => {
    const view = render(
      <>
        <RouteProgress />
        <a href="/directory-archive?limit=25">Users</a>
        <a href="https://www.quantifyterminal.com/">Site</a>
      </>,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    act(() => {
      screen
        .getByRole("link", { name: "Site" })
        .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    act(() => {
      screen
        .getByRole("link", { name: "Users" })
        .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(screen.getByRole("progressbar", { name: "Loading page" })).toBeInTheDocument();
    // And the spinner in the middle of the page, so a page that takes a moment visibly is
    // doing something.
    expect(document.querySelector(".page-loading--late .spinner--block")).not.toBeNull();

    navigation.pathname = "/directory-archive";
    navigation.search = "limit=25";
    view.rerender(
      <>
        <RouteProgress />
        <a href="/directory-archive?limit=25">Users</a>
        <a href="https://www.quantifyterminal.com/">Site</a>
      </>,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(document.querySelector(".page-loading")).toBeNull();
  });
});

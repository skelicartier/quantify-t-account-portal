import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { act, render, screen } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ pathname: "/account", search: "" }));
const nextLink = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("next/link", () => ({
  default: ({ prefetch, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => {
    nextLink.props.push({ prefetch, ...rest });
    return <a {...(rest as Record<string, string>)}>{children}</a>;
  },
}));

import { RouteProgress } from "@/components/shell/route-progress";
import { setPendingPath } from "@/components/shell/pending-route";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import Link from "@/components/ui/link";

const ROOT = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(name) ? [path] : [];
  });
}

function Icon() {
  return <svg aria-hidden="true" />;
}

const LINKS = [
  { href: "/account", label: "Overview", icon: Icon },
  { href: "/account/security", label: "Security", icon: Icon },
  { href: "/admin/users", label: "Users", icon: Icon, activePrefix: "/admin/users" },
] as never;

function press(name: string) {
  act(() => {
    screen
      .getByRole("link", { name })
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  navigation.pathname = "/account";
  navigation.search = "";
  nextLink.props.length = 0;
  act(() => setPendingPath(null));
});

describe("links do not load pages in the background", () => {
  it("is off unless a link asks for it", () => {
    render(
      <>
        <Link href="/account/security">Security</Link>
        <Link href="/login" prefetch>
          Sign in
        </Link>
      </>,
    );

    expect(nextLink.props.map((props) => props.prefetch)).toEqual([false, true]);
  });

  it("is the only way the console makes a link", () => {
    // A direct import of next/link brings background loading back for that link: every
    // such link asks the server, and through it the Account API, whether or not anybody
    // ever presses it.
    const direct = sourceFiles(join(ROOT, "src"))
      .filter((path) => relative(ROOT, path) !== join("src", "components", "ui", "link.tsx"))
      .filter((path) => /from "next\/link"/u.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path));

    expect(direct).toEqual([]);
  });
});

describe("a pressed link answers at once", () => {
  it("tints the section being opened from the press, not from when its page arrives", () => {
    render(
      <>
        <RouteProgress />
        <SidebarNav label="Account sections" heading="Account" links={LINKS} />
      </>,
    );
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");

    press("Security");

    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(document.querySelector(".page-veil")).not.toBeNull();
    expect(document.querySelector(".page-loading .spinner--block")).not.toBeNull();
  });

  it("answers a link that handles its own press, as every link the console makes does", () => {
    // Next's link takes the press, marks it handled and starts the page change itself. A
    // listener that only acted on unhandled presses never saw one.
    render(
      <>
        <RouteProgress />
        <a href="/account/security" onClick={(event) => event.preventDefault()}>
          Security
        </a>
      </>,
    );

    press("Security");

    expect(document.querySelector(".page-veil")).not.toBeNull();
    expect(screen.getByRole("progressbar", { name: "Loading page" })).toBeInTheDocument();
  });

  it("hands back to the real address once the page starts to arrive", () => {
    const view = render(
      <>
        <RouteProgress />
        <SidebarNav label="Account sections" heading="Account" links={LINKS} />
      </>,
    );
    press("Security");

    navigation.pathname = "/account/security";
    view.rerender(
      <>
        <RouteProgress />
        <SidebarNav label="Account sections" heading="Account" links={LINKS} />
      </>,
    );

    expect(document.querySelector(".page-veil")).toBeNull();
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
  });

  it("gives up after ten seconds rather than hold an empty pane for ever", () => {
    vi.useFakeTimers();
    try {
      render(
        <>
          <RouteProgress />
          <SidebarNav label="Account sections" heading="Account" links={LINKS} />
        </>,
      );
      press("Security");
      expect(document.querySelector(".page-veil")).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(10_001);
      });

      expect(document.querySelector(".page-veil")).toBeNull();
      expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a link that does not lead to a page alone", () => {
    render(
      <>
        <RouteProgress />
        <a href="/admin/users/export" download data-no-progress>
          Export CSV
        </a>
        <span data-no-progress>
          <a href="/files/report">Report file</a>
        </span>
        <a href="/account/security" target="_blank" rel="noreferrer">
          New tab
        </a>
        <a href="/account">This page</a>
      </>,
    );

    for (const name of ["Export CSV", "Report file", "New tab", "This page"]) {
      press(name);
      expect(document.querySelector(".page-veil"), name).toBeNull();
    }
  });
});

describe("where the console's server runs", () => {
  it("is Mumbai, beside the Account API and its database", () => {
    // Every page makes several calls to the Account API. From the default region
    // (Washington) each one crossed the world and back.
    const config = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as { regions?: string[] };

    expect(config.regions).toEqual(["bom1"]);
  });
});

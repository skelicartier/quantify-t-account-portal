import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { useActionState } from "react";
import userEvent from "@testing-library/user-event";

import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { PageSpinner, Spinner } from "@/components/ui/spinner";

describe("Spinner", () => {
  it("is eight lines round a centre, hidden from assistive technology unless it is given a name", () => {
    const { container, rerender } = render(<Spinner />);
    const mark = container.querySelector(".spinner");
    expect(mark).not.toBeNull();
    expect(mark?.querySelectorAll("span")).toHaveLength(8);
    expect(mark).toHaveAttribute("aria-hidden", "true");

    rerender(<Spinner size="block" label="Loading accounts" />);
    expect(screen.getByRole("img", { name: "Loading accounts" })).toHaveClass("spinner--block");
  });

  it("has a place, a turn and a still form for every one of its lines", () => {
    // The lines are placed by stylesheet rules, one per line. A ninth line with no rule
    // would sit on top of the first; a missing rule would leave a gap in the ring.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (let line = 1; line <= 8; line += 1) {
      const rule = new RegExp(
        `\\.spinner > span:nth-child\\(${line}\\) \\{\\s+transform: rotate\\(${(line - 1) * 45}deg\\);\\s+animation-delay: ${(line - 1) * 100 - 800}ms;`,
        "u",
      );
      expect(css).toMatch(rule);
    }
    expect(css).not.toMatch(/\.spinner > span:nth-child\(9\)/u);
    expect(css).toMatch(/@keyframes spinner-fade/u);
  });

  it("is held in the middle of the content pane, not at the top of the page", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const rule = css.slice(css.indexOf("  .page-loading {"), css.indexOf("  .page-loading--late {"));

    expect(rule).toMatch(/position: fixed;/u);
    expect(rule).toMatch(/top: 50%;/u);
    expect(rule).toMatch(/left: calc\(50% \+ var\(--rail-width\) \/ 2\);/u);
  });

  it("clears the content pane beside the rail and under the top bar, and nothing else", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const rule = css.slice(css.indexOf("  .page-veil {"), css.indexOf("  .nav-toggle {"));

    expect(rule).toMatch(/inset: 0 0 0 var\(--rail-width\);/u);
    expect(rule).toMatch(/background: var\(--bg\);/u);
    // Under the top bar (30) and the rail (40), so both stay visible and usable.
    expect(rule).toMatch(/z-index: 20;/u);
  });

  it("is all a page that has not arrived yet shows: a cleared pane and the one spinner", () => {
    const { container } = render(<PageSkeleton variant="admin" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".page-loading .spinner--block")).toHaveLength(1);
    // No grey blocks standing in for the page: a press shows the same spinner in the same
    // place, and a second layout flashing in between would read as two loads.
    expect(container.querySelector(".skeleton")).toBeNull();

    const pressed = render(<PageSpinner />);
    expect(pressed.container.querySelector(".page-loading .spinner--block")).not.toBeNull();
  });
});

describe("Button", () => {
  it("shows nothing moving while idle", () => {
    const { container } = render(<Button type="submit">Save</Button>);
    expect(container.querySelector(".spinner")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-busy");
  });

  it("shows the spinner when told it is busy", () => {
    const { container } = render(<Button busy>Checking</Button>);
    expect(container.querySelector(".btn > .spinner")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Checking" })).toHaveAttribute("aria-busy", "true");
  });

  it("shows the spinner by itself while the form it submits is sending", async () => {
    let release: () => void = () => {};
    const sent = new Promise<void>((resolve) => {
      release = resolve;
    });

    function Form() {
      const [, action] = useActionState(async () => {
        await sent;
        return null;
      }, null);
      return (
        <form action={action}>
          <Button type="submit">Save</Button>
          <Button>Cancel</Button>
        </form>
      );
    }

    const { container } = render(<Form />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const save = await screen.findByRole("button", { name: "Save", busy: true });
    expect(save.querySelector(".spinner")).not.toBeNull();
    // A button that does not submit the form stays as it was.
    expect(screen.getByRole("button", { name: "Cancel" }).querySelector(".spinner")).toBeNull();

    release();
    await screen.findByRole("button", { name: "Save", busy: false });
    expect(container.querySelector(".spinner")).toBeNull();
  });
});

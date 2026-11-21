import { render, screen } from "@testing-library/react";
import { useActionState } from "react";
import userEvent from "@testing-library/user-event";

import { Button } from "@/components/ui/button";
import { LoadingBars } from "@/components/ui/loading-bars";
import { PageSkeleton } from "@/components/ui/skeleton";

describe("LoadingBars", () => {
  it("is five strips, hidden from assistive technology unless it is given a name", () => {
    const { container, rerender } = render(<LoadingBars />);
    const mark = container.querySelector(".bars");
    expect(mark).not.toBeNull();
    expect(mark?.querySelectorAll("span")).toHaveLength(5);
    expect(mark).toHaveAttribute("aria-hidden", "true");

    rerender(<LoadingBars size="block" label="Loading accounts" />);
    expect(screen.getByRole("img", { name: "Loading accounts" })).toHaveClass("bars--block");
  });

  it("heads a page that has not arrived yet", () => {
    const { container } = render(<PageSkeleton variant="admin" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".skeleton-page__status .bars--block")).not.toBeNull();
  });
});

describe("Button", () => {
  it("shows nothing moving while idle", () => {
    const { container } = render(<Button type="submit">Save</Button>);
    expect(container.querySelector(".bars")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-busy");
  });

  it("shows the strips when told it is busy", () => {
    const { container } = render(<Button busy>Checking</Button>);
    expect(container.querySelector(".btn > .bars")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Checking" })).toHaveAttribute("aria-busy", "true");
  });

  it("shows the strips by itself while the form it submits is sending", async () => {
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
    expect(save.querySelector(".bars")).not.toBeNull();
    // A button that does not submit the form stays as it was.
    expect(screen.getByRole("button", { name: "Cancel" }).querySelector(".bars")).toBeNull();

    release();
    await screen.findByRole("button", { name: "Save", busy: false });
    expect(container.querySelector(".bars")).toBeNull();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  SEARCH_TYPING_DELAY_MS,
  UsersDirectory,
  usersHref,
} from "@/components/admin/users-directory";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/admin/users",
  useSearchParams: () => new URLSearchParams(),
}));

describe("usersHref", () => {
  it("keeps only the filters that are set and a non-default limit", () => {
    expect(usersHref({})).toBe("/admin/users");
    expect(usersHref({ q: "priya", status: "active" }, 50)).toBe(
      "/admin/users?q=priya&status=active",
    );
    expect(usersHref({ status: "inactive" }, 25)).toBe("/admin/users?status=inactive&limit=25");
    expect(usersHref({ access: "pending" })).toBe("/admin/users?access=pending");
    expect(usersHref({ q: "priya", access: "declined" }, 25)).toBe(
      "/admin/users?q=priya&access=declined&limit=25",
    );
  });
});

describe("UsersDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches after typing pauses without leaving the page, then on submit", async () => {
    const user = userEvent.setup();
    render(
      <UsersDirectory filters={{}} limit={50}>
        <p>rows</p>
      </UsersDirectory>,
    );

    const box = screen.getByRole("searchbox", { name: "Search" });
    await user.type(box, "pri");
    // Nothing fires per keystroke; the search waits for the typing pause.
    expect(router.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/users?q=pri"), {
      timeout: SEARCH_TYPING_DELAY_MS * 4,
    });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(box).toHaveValue("pri");
    expect(screen.getByText("rows")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(router.push).toHaveBeenCalledWith("/admin/users?q=pri");
  });

  it("applies a status change immediately and clears everything with one click", async () => {
    const user = userEvent.setup();
    render(
      <UsersDirectory filters={{ q: "owner" }} limit={25}>
        <p>rows</p>
      </UsersDirectory>,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "inactive");
    expect(router.push).toHaveBeenCalledWith("/admin/users?q=owner&status=inactive&limit=25");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(router.push).toHaveBeenLastCalledWith("/admin/users?limit=25");
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
  });

  it("filters by application, keeps the other filters, and follows a filter applied from elsewhere", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <UsersDirectory filters={{ q: "owner", status: "active" }} limit={50}>
        <p>rows</p>
      </UsersDirectory>,
    );

    const application = screen.getByRole("combobox", { name: "Application" });
    expect(application).toHaveValue("");
    await user.selectOptions(application, "pending");
    expect(router.push).toHaveBeenCalledWith("/admin/users?q=owner&status=active&access=pending");

    // "Review applications" elsewhere on the page changes the applied filter, not this control.
    rerender(
      <UsersDirectory filters={{ access: "declined" }} limit={50}>
        <p>rows</p>
      </UsersDirectory>,
    );
    expect(screen.getByRole("combobox", { name: "Application" })).toHaveValue("declined");
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
  });
});

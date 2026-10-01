import { render, screen, within } from "@testing-library/react";

import { AccountOvernight, CARD_BLOCKS, selectedRow } from "@/components/account/account-overnight";
import { overnightBriefSchema } from "@/lib/admin/account-api";

import { brief, mornings, quiet } from "../fixtures/overnight";

const ready = { status: "ready" as const, mornings, keep: 30 };

function show(props: Partial<Parameters<typeof AccountOvernight>[0]> = {}) {
  return render(
    <AccountOvernight
      view={ready}
      date="2026-09-19"
      brief={{ status: "ready", brief, receivedAt: "2026-09-19T06:15:00Z" }}
      tab="today"
      {...props}
    />,
  );
}

describe("AccountOvernight", () => {
  it("opens the morning on its first item, with the six blocks in the terminal's order", () => {
    show();

    expect(screen.getByRole("heading", { level: 1, name: "Overnight" })).toBeVisible();
    expect(screen.getByText(brief.count_line)).toBeVisible();
    const stats = screen.getByRole("list", { name: "This morning" });
    expect(within(stats).getByText("Documents").nextSibling).toHaveTextContent("4");
    expect(within(stats).getByText("Moved").nextSibling).toHaveTextContent("2");

    const rail = screen.getByRole("navigation", { name: "This morning's items" });
    expect(within(rail).getByRole("heading", { name: /Moved an assumption/ })).toHaveTextContent(
      "2",
    );
    expect(within(rail).getByRole("heading", { name: /Read and held/ })).toHaveTextContent("2");
    const first = within(rail).getByRole("link", { name: /NRTH\s+Northvale Systems/ });
    expect(first).toHaveAttribute("aria-current", "true");
    expect(first).toHaveAttribute("href", "/account/overnight?date=2026-09-19&item=1");

    const detail = screen.getByRole("article", { name: /Northvale Systems/ });
    const blocks = within(detail)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(blocks.slice(0, 6)).toEqual([...CARD_BLOCKS]);
    // The terminal's sentences, verbatim: the page lays them out and re-derives nothing.
    for (const line of [
      brief.items[0]!.lines.belief,
      brief.items[0]!.lines.hits,
      brief.items[0]!.lines.cost,
    ]) {
      // The terminal separates with two spaces; the page collapses them as HTML does.
      expect(within(detail).getByText(line.replace(/\s+/gu, " "))).toBeVisible();
    }
    expect(within(detail).getByText("0.512 is below 0.55")).toBeVisible();
    expect(within(detail).getByText("Breached")).toBeVisible();
    expect(
      within(detail).getByRole("region", { name: "Where it hits, Northvale Systems" }),
    ).toHaveTextContent("94.00");
    expect(within(detail).getByText(/The cells that moved: 2 of 414 recomputed/)).toBeVisible();
    const source = within(detail).getByRole("link", { name: /Open the source/ });
    expect(source).toHaveAttribute("href", "https://www.sec.gov/Archives/northvale-10q.htm");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    // Decisions stay in the terminal, and no order is ever placed from either.
    expect(within(detail).getByText(/No order is ever placed/)).toBeVisible();
    expect(screen.getByText("Sources: Filings: SEC EDGAR")).toBeVisible();
  });

  it("opens a document by its row, saying who read it and why nothing moved", () => {
    show({ doc: "1" });

    const detail = screen.getByRole("article", { name: /Orbital Freight/ });
    expect(within(detail).getByText("1 held")).toBeVisible();
    expect(
      within(detail).getByText("Revenue grows at least 12% a year (FY2026Q3: 14.10%)"),
    ).toBeVisible();
    expect(within(detail).getByRole("heading", { name: "Why nothing moved" })).toBeVisible();

    const unread = selectedRow(brief, undefined, "2");
    expect(unread).toEqual({ kind: "doc", index: 1 });
  });

  it("says a quiet morning is quiet rather than drawing an empty list", () => {
    show({ date: "2026-09-17", brief: { status: "ready", brief: quiet, receivedAt: null } });
    expect(
      screen.getByText("Nothing landed on this book overnight, so there is nothing to open."),
    ).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "This morning's items" }),
    ).not.toBeInTheDocument();
  });

  it("tells an account with no brief yet how one arrives", () => {
    show({ view: { status: "ready", mornings: [], keep: 30 }, date: undefined, brief: null });
    expect(screen.getByText("No morning brief has arrived yet.")).toBeVisible();
    expect(screen.getByText(/Sign in to the terminal with this account/)).toBeVisible();
  });

  it("keeps an outage, an old link and a missing morning apart", () => {
    const { unmount } = show({ view: { status: "unavailable" }, brief: null });
    expect(screen.getByRole("alert")).toHaveTextContent("The account service could not be reached");
    unmount();

    show({ date: "2026-08-01", brief: { status: "missing" } });
    expect(screen.getByText("There is no brief for that morning")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open the latest" })).toHaveAttribute(
      "href",
      "/account/overnight",
    );
  });

  it("lists the blind spots by section and counts the rows it does not carry", () => {
    show({ tab: "blind-spots" });
    expect(screen.getByRole("heading", { name: "Unbelieved variables" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Stale beliefs" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "No thesis recorded" })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 3; the terminal lists every one.")).toBeVisible();
  });

  it("links every earlier morning, and switches mornings without leaving the view", () => {
    show({ tab: "mornings", brief: null });
    const table = screen.getByRole("region", { name: "Earlier mornings" });
    expect(within(table).getByRole("link", { name: "19 Sep 2026" })).toHaveAttribute(
      "href",
      "/account/overnight?date=2026-09-19",
    );
    expect(screen.getByText("The last 30 mornings are kept.")).toBeVisible();
  });
});

describe("the brief's schema", () => {
  it("accepts the morning and refuses a link that is not plain http(s)", () => {
    expect(overnightBriefSchema.safeParse(brief).success).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "https://user:pw@example.test/x",
      "file:///etc/passwd",
    ]) {
      const bad = structuredClone(brief);
      bad.documents[0]!.url = url;
      expect(overnightBriefSchema.safeParse(bad).success, url).toBe(false);
    }
    const extra = { ...structuredClone(brief), quote: "verbatim filing text" };
    expect(overnightBriefSchema.safeParse(extra).success).toBe(false);
  });
});

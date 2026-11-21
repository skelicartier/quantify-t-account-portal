import { render, screen, within } from "@testing-library/react";

import { BarChart } from "@/components/ui/bar-chart";

describe("BarChart", () => {
  const points = [
    { label: "2026-09-09", values: { success: 4, failure: 1 } },
    { label: "2026-09-10", values: { success: 0, failure: 0 } },
    { label: "2026-09-11", values: { success: 6, failure: 2 } },
  ];
  const segments = [
    { key: "success", label: "Success", tone: "success" as const },
    { key: "failure", label: "Failed", tone: "danger" as const },
  ];

  it("names the figure with its total and repeats every value in a hidden table", () => {
    render(<BarChart title="Sign-ins" description="per day" segments={segments} points={points} />);

    expect(screen.getByRole("img", { name: "Sign-ins: 13 across 3 periods" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Sign-ins" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("rowheader", { name: "2026-09-11" })).toBeInTheDocument();
    expect(screen.getByText("13")).toBeVisible();
  });

  it("draws one bar per segment with a readable tooltip and a floor mark for empty days", () => {
    const { container } = render(<BarChart title="Sign-ins" segments={segments} points={points} />);

    expect(container.querySelectorAll("rect.chart__bar--success")).toHaveLength(3);
    expect(container.querySelectorAll("rect.chart__bar--empty")).toHaveLength(1);
    const titles = Array.from(container.querySelectorAll("rect > title")).map((t) => t.textContent);
    expect(titles).toContain("11 Sep · Success: 6");
    expect(titles).toContain("9 Sep · Failed: 1");
  });

  it("renders without points", () => {
    render(<BarChart title="Nothing yet" segments={segments} points={[]} />);
    expect(
      screen.getByRole("img", { name: "Nothing yet: 0 across 0 periods" }),
    ).toBeInTheDocument();
  });
});

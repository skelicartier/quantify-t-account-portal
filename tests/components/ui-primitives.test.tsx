import { render, screen } from "@testing-library/react";

import { Checkbox, Field, Input } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { ShortId } from "@/components/ui/short-id";
import { StatusPill, statusLabel, statusTone } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";

describe("StatusPill", () => {
  it.each([
    ["active", "live", "Active"],
    ["sent", "live", "Sent"],
    ["retry", "attention", "Retrying"],
    ["dead", "danger", "Failed"],
    ["failure", "danger", "Failed"],
    ["revoked", "danger", "Revoked"],
    ["queued", "neutral", "Queued"],
    ["source-locked", "attention", "Locked at source"],
    ["", "neutral", "Unknown"],
  ])("maps %s to the %s tone labelled %s", (value, tone, label) => {
    expect(statusTone(value)).toBe(tone);
    expect(statusLabel(value)).toBe(label);
    const { container } = render(<StatusPill value={value} />);
    expect(container.firstChild).toHaveClass(`pill--${tone}`);
    expect(screen.getByText(label)).toBeVisible();
  });
});

describe("ShortId", () => {
  it("keeps the full identifier in the DOM and the tooltip", () => {
    render(<ShortId value="860aac31-73fb-4e10-8f3f-bfcf22a71c11" />);
    const code = screen.getByText("860aac31-73fb-4e10-8f3f-bfcf22a71c11");
    expect(code).toHaveAttribute("title", "860aac31-73fb-4e10-8f3f-bfcf22a71c11");
  });

  it("links to the target when given an href", () => {
    render(<ShortId value="abc" href="/admin/users/abc" />);
    expect(screen.getByRole("link", { name: "abc" })).toHaveAttribute("href", "/admin/users/abc");
  });
});

describe("Timestamp", () => {
  const now = Date.parse("2026-09-11T12:00:00Z");

  it("renders a machine-readable time with a relative label when now is known", () => {
    render(<Timestamp value="2026-09-11T11:00:00Z" now={now} />);
    const time = screen.getByText("1 hour ago");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", "2026-09-11T11:00:00.000Z");
    expect(time).toHaveAttribute("title", "11 Sep 2026, 11:00 UTC");
  });

  it("falls back to the absolute form without a reference instant", () => {
    render(<Timestamp value="2026-09-11T11:00:00Z" />);
    expect(screen.getByText("11 Sep 2026, 11:00 UTC")).toBeVisible();
  });

  it("shows both forms and a fallback for missing values", () => {
    render(
      <>
        <Timestamp value="2026-09-11T11:00:00Z" now={now} mode="both" />
        <Timestamp value={null} fallback="Never" />
      </>,
    );
    expect(screen.getByText("1 hour ago")).toBeVisible();
    expect(screen.getByText("11 Sep 2026, 11:00 UTC")).toBeVisible();
    expect(screen.getByText("Never")).toBeVisible();
  });
});

describe("Pagination", () => {
  it("builds hrefs through the caller and summarises the page", () => {
    render(
      <Pagination
        offset={25}
        limit={25}
        returned={25}
        hasMore
        nextOffset={50}
        buildHref={(offset, limit) => `/admin/users?offset=${offset}&limit=${limit}`}
        noun="accounts"
      />,
    );
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/admin/users?offset=0&limit=25",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/admin/users?offset=50&limit=25",
    );
    expect(screen.getByText("Showing 26–50 of more accounts")).toBeVisible();
  });
});

describe("Field", () => {
  it("wires label, hint and error to the control", () => {
    render(
      <Field
        id="email"
        label="Email address"
        note="Required"
        hint="We never share it."
        error="Enter an email."
      >
        <Input id="email" invalid aria-describedby="email-error email-hint" />
      </Field>,
    );
    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter an email. We never share it.");
  });

  it("gives a checkbox exactly its label as the accessible name", () => {
    render(<Checkbox id="active" name="active" label="Active" description="Shown to everyone." />);
    expect(screen.getByRole("checkbox", { name: "Active" })).toHaveAccessibleDescription(
      "Shown to everyone.",
    );
  });
});

describe("DataTable", () => {
  const columns = [
    { key: "a", label: "A" },
    { key: "b", label: "B" },
  ];

  it("renders the empty state instead of an empty table", () => {
    render(
      <DataTable
        columns={columns}
        caption="Things"
        isEmpty
        empty={<EmptyState title="Nothing here" />}
      >
        {null}
      </DataTable>,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing here")).toBeVisible();
  });

  it("renders a table with column headers when there are rows", () => {
    render(
      <DataTable columns={columns} caption="Things">
        <tr>
          <td>one</td>
          <td>two</td>
        </tr>
      </DataTable>,
    );
    expect(screen.getByRole("table", { name: "Things" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "A" })).toBeVisible();
  });
});

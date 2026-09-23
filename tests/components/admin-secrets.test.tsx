import { render, screen, within } from "@testing-library/react";

import { AdminSecrets } from "@/components/admin/admin-secrets";
import type { AdminSecretsAccess } from "@/lib/admin/access";
import type { AccountApiAdminSecrets, AccountApiMe } from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";

const NOW = Date.parse("2026-09-12T12:00:00Z");

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-correlation",
  user: {
    user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    email: "owner@example.test",
    is_active: true,
  },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "",
    break_glass: false,
  },
  capabilities: ["account:read-any", "secrets:read", "secrets:write"],
  environment: "production",
};

const assurance: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: "aal2",
  requiredLevel: "aal2",
  mfaEnrolled: true,
  challengeRequired: false,
  levelReadable: true,
  factorsReadable: true,
};

function entry(overrides: Record<string, unknown> = {}) {
  return {
    fingerprint: "a1b2c3d4e5f60718",
    prefix: "",
    length: 20,
    position: 0,
    set_by: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    set_at: "2026-09-10T09:00:00Z",
    verification: { state: "unverified" as const, checked_at: null },
    ...overrides,
  };
}

function slot(overrides: Record<string, unknown> = {}) {
  return {
    slot: "FMP_API_KEY",
    namespace: "api" as const,
    label: "Financial Modeling Prep",
    kind: "single" as const,
    group: null,
    hint: "",
    blast_radius: "Dividends, IPO calendar and statement history.",
    is_secret: true,
    configured: true,
    distribution: "every-device" as const,
    distribution_certain: false,
    entries: [entry()],
    ...overrides,
  };
}

function inventory(overrides: Partial<AccountApiAdminSecrets> = {}): AccountApiAdminSecrets {
  return {
    ok: true,
    correlation_id: "qt-secrets",
    generated_at: "2026-09-12T11:59:00Z",
    store: { state: "ready" },
    slots: [slot()],
    ...overrides,
  } as AccountApiAdminSecrets;
}

function authorized(overrides: Partial<AccountApiAdminSecrets> = {}, canWrite = true) {
  return {
    status: "authorized",
    me,
    assurance,
    secrets: inventory(overrides),
    canWrite,
  } satisfies AdminSecretsAccess;
}

describe("AdminSecrets", () => {
  it("never renders a credential, because it is never given one", () => {
    /**
     * The page's whole guarantee. Asserted against the rendered text rather than field by
     * field, because the risk is not one careless binding — it is any future field that
     * happens to carry a value reaching a surface that is screenshotted, serialized into
     * the payload the browser receives, and read aloud by a screen reader.
     */
    render(<AdminSecrets access={authorized()} now={NOW} />);

    const body = document.body.textContent ?? "";
    expect(body).not.toContain("fmp-secret");
    expect(body.toLowerCase()).not.toContain("reveal");
    expect(screen.queryByRole("button", { name: /copy/iu })).not.toBeInTheDocument();
    // The fingerprint is what identifies a credential here.
    expect(body).toContain("a1b2c3d4e5f60718");
  });

  it("says plainly when a credential reaches every device", () => {
    /**
     * The operator's risk calculus differs entirely between a key that stays on the server
     * and one that is handed to every install. A page that showed both the same way would
     * invite pasting a high-limit key into something distributed to every machine.
     */
    render(<AdminSecrets access={authorized()} now={NOW} />);
    expect(screen.getByText(/treat as public/iu)).toBeVisible();
  });

  it("describes a rotating pool one key at a time", () => {
    /**
     * A multi-valued credential holds several keys the app rotates across. Rendering the
     * field as a single credential would report a healthy pool as one long key — and an
     * operator reading that during an incident replaces three working keys with one.
     */
    render(
      <AdminSecrets
        access={authorized({
          slots: [
            slot({
              slot: "OPENROUTER_API_KEY",
              label: "OpenRouter",
              kind: "multi",
              entries: [
                entry({ fingerprint: "1111111111111111", prefix: "sk-or-v1-", position: 0 }),
                entry({ fingerprint: "2222222222222222", prefix: "sk-or-v1-", position: 1 }),
                entry({ fingerprint: "3333333333333333", prefix: "sk-or-v1-", position: 2 }),
              ],
            }),
          ],
        })}
        now={NOW}
      />,
    );

    const body = document.body.textContent ?? "";
    for (const fingerprint of ["1111111111111111", "2222222222222222", "3333333333333333"]) {
      expect(body).toContain(fingerprint);
    }
  });

  it("does not treat a registration identifier as a secret", () => {
    /**
     * An OpenSky client id is public by design. Masking it implies a confidentiality it
     * does not have while hiding a value the operator needs to read.
     */
    render(
      <AdminSecrets
        access={authorized({
          slots: [
            slot({
              slot: "opensky_client_id",
              namespace: "geo",
              label: "OpenSky client ID",
              kind: "identifier",
              is_secret: false,
              entries: [entry({ fingerprint: "", length: 13 })],
            }),
          ],
        })}
        now={NOW}
      />,
    );

    expect(screen.getByText(/not a secret/iu)).toBeVisible();
  });

  it("distinguishes an unreadable store from an empty one, and stops offering changes", () => {
    /**
     * The most dangerous thing this page could say is "nothing is configured" when it means
     * "I could not find out". An operator would read twenty-one empty slots, paste a fresh
     * key, watch it succeed, and the real store would go on serving the credential they
     * believed they had just rotated.
     */
    render(
      <AdminSecrets
        access={authorized({ store: { state: "unreadable", dependency: "app-config-store" } })}
        now={NOW}
      />,
    );

    const body = document.body.textContent ?? "";
    expect(body).toMatch(/cannot be read right now/iu);
    // The crucial distinction: the list is the catalogue, not a statement about the store.
    expect(body).toMatch(/from the catalogue, not from what is stored/iu);
    expect(body).toMatch(/changes are turned off/iu);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows a reader the inventory without offering them a way to change it", () => {
    /**
     * Diagnosing a broken credential and replacing one are different acts, and the page has
     * to reflect that rather than show a control that always fails.
     */
    render(<AdminSecrets access={authorized({}, false)} now={NOW} />);

    expect(screen.getAllByText("Financial Modeling Prep").length).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders each refusal as itself rather than as a generic error", () => {
    const variants: AdminSecretsAccess[] = [
      { status: "forbidden", me },
      { status: "mfa-required", me, assurance },
      { status: "capability-required", me, assurance, capability: "secrets:read" },
      { status: "unavailable", me, assurance },
    ];

    for (const access of variants) {
      const { unmount } = render(<AdminSecrets access={access} now={NOW} />);
      // Whatever each state says, none of them may render the credential table.
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(document.body.textContent ?? "").not.toContain("a1b2c3d4e5f60718");
      unmount();
    }
  });

  it("puts what needs attention first", () => {
    /**
     * At 2am the question is "which one is broken", not "what is the alphabetical order of
     * my providers".
     */
    render(
      <AdminSecrets
        access={authorized({
          slots: [
            slot({ slot: "POLYGON_API_KEY", label: "Polygon" }),
            slot({
              slot: "FMP_API_KEY",
              label: "Financial Modeling Prep",
              entries: [
                entry({ verification: { state: "rejected", checked_at: "2026-09-12T10:00:00Z" } }),
              ],
            }),
          ],
        })}
        now={NOW}
      />,
    );

    const table = screen.getAllByRole("table")[0]!;
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Financial Modeling Prep");
  });

  it("tells an operator that no credential document exists, and what that usually means", () => {
    // The failure this covers happened in production: the service was pointed at a storage
    // account the credentials had never been written to, so the page reported a confident
    // "nothing is configured" while eleven live keys sat somewhere else.
    render(
      <AdminSecrets
        access={authorized({ store: { state: "absent", dependency: "app-config-store" } })}
        now={NOW}
      />,
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/no credential document/i);
    expect(notice).toHaveTextContent(/different storage account/i);
    // Not an outage: writes stay available, because setting one here creates the document.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps an unreadable store distinct from an absent one", () => {
    // They demand different actions — fix a connection, or wait — so they must not read
    // the same.
    render(
      <AdminSecrets
        access={authorized({ store: { state: "unreadable", dependency: "app-config-store" } })}
        now={NOW}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/cannot be read right now/i);
    expect(screen.queryByText(/no credential document/i)).not.toBeInTheDocument();
  });
});

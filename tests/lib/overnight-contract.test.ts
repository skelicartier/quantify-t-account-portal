import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { overnightBriefSchema } from "@/lib/admin/account-api";

/**
 * The console reads what the desktop sends. The desktop's suite writes its own rendering of a
 * real sample morning to `tests/fixtures/overnight_brief_v1.json` on every run, and the
 * service's checker accepts it there; this holds the console's schema to the same document.
 * Without the sibling checkout (CI clones one repo) it is skipped loudly, not passed.
 */

const FIXTURE = resolve(
  process.cwd(),
  "../Quantify Terminal/tests/fixtures/overnight_brief_v1.json",
);
const present = existsSync(FIXTURE);
const maybe = present ? describe : describe.skip;

if (!present) {
  console.warn(`[overnight-contract] ${FIXTURE} not found; the contract is not checked here.`);
}

maybe("the desktop's morning brief, as the console reads it", () => {
  it("parses with the console's schema, every field accounted for", () => {
    const document = JSON.parse(readFileSync(FIXTURE, "utf8")) as unknown;
    const parsed = overnightBriefSchema.safeParse(document);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2)).toBe(
      true,
    );
    if (parsed.success) {
      expect(parsed.data.items.length).toBeGreaterThan(0);
      expect(parsed.data.items[0]!.lines.belief).not.toBe("");
    }
  });
});

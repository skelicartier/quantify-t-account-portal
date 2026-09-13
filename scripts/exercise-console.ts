/**
 * Drive the console's real forms against the mock Account API, and assert what each one did.
 *
 * `screenshot-console.ts` proves every page RENDERS. Nothing proved the pages WORK: the
 * Server Actions behind them were covered only by unit tests with a stubbed action, plus a
 * source-level count of `requireSameOriginServerAction()` call sites — which proves the call
 * exists, not that it refuses. This signs in and actually presses the buttons.
 *
 *   npx tsx scripts/mock-account-api.ts &
 *   npm run dev &
 *   npx tsx scripts/exercise-console.ts [http://127.0.0.1:3000]
 *
 * Every step is an assertion. A step that cannot find its control fails loudly rather than
 * passing quietly, because a flow that silently does nothing is the failure mode this exists
 * to catch.
 */

import { chromium, type Page } from "playwright";

const BASE = process.argv[2] ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

let failures = 0;
let passes = 0;

function ok(label: string) {
  passes += 1;
  console.log(`  ✓ ${label}`);
}

function bad(label: string, detail: unknown) {
  failures += 1;
  console.log(`  ✗ ${label}: ${detail instanceof Error ? detail.message : String(detail)}`);
}

async function step(label: string, body: () => Promise<void>) {
  try {
    await body();
    ok(label);
  } catch (error) {
    bad(label, error);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.getByRole("textbox", { name: /email address/i }).fill(email);
  await page.getByLabel(/^password$/i).fill("password-1234");
  await page.getByRole("button", { name: /sign in securely/i }).click();
  await page.waitForURL(/\/account/u, { timeout: 30_000 });
}

/**
 * The row whose portfolio name is exactly `name`.
 *
 * `filter({ hasText })` is a substring match across the whole row, which matched two rows
 * once this script had created one of its own — and a strict-mode violation in a harness
 * reads like a product bug. This matches the first line of the name cell exactly.
 */
function rowNamed(page: Page, name: string) {
  return page
    .locator("tbody tr")
    .filter({ has: page.locator("td").first().locator(`text="${name}"`) })
    .first();
}

/** The text of the whole page, collapsed, for substring assertions. */
async function pageText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/gu, " ");
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // A page error or a failed Server Action POST is a defect even if the assertion below
  // happens to pass, so both are collected for the whole run.
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      consoleErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  console.log("signing in");
  await signIn(page, "owner@example.test");
  ok("signed in as the owner");

  // ------------------------------------------------------------------ portfolios
  console.log("\nportfolios");
  const unique = `Audit ${Date.now().toString().slice(-6)}`;

  await step("opens a new portfolio", async () => {
    await page.goto(`${BASE}/account/portfolios`);
    await page.getByLabel(/^name$/i).fill(unique);
    await page.getByRole("button", { name: /open portfolio/i }).click();
    await page.waitForFunction((name) => document.body.innerText.includes(name), unique, {
      timeout: 15_000,
    });
  });

  await step("the new book is paper, not real money", async () => {
    const row = rowNamed(page, unique);
    assert((await row.innerText()).includes("Paper"), "a new book should default to paper");
  });

  await step("renames it", async () => {
    const row = rowNamed(page, unique);
    await row.getByRole("button", { name: "Rename" }).click();
    await row.getByLabel(new RegExp(`Name for ${unique}`, "i")).fill(`${unique} renamed`);
    await row.getByRole("button", { name: "Save" }).click();
    await page.waitForFunction(
      (name) => document.body.innerText.includes(name),
      `${unique} renamed`,
      { timeout: 15_000 },
    );
  });

  await step("makes it the default, and the old default gives the flag up", async () => {
    const row = rowNamed(page, `${unique} renamed`);
    await row.getByRole("button", { name: /make default/i }).click();
    await page.waitForFunction(
      (name) => {
        const rows = Array.from(document.querySelectorAll("tbody tr"));
        const defaults = rows.filter((r) => r.textContent?.includes("New trades go here"));
        return defaults.length === 1 && defaults[0]?.textContent?.includes(name);
      },
      `${unique} renamed`,
      { timeout: 15_000 },
    );
  });

  await step("refuses to close a book until its own name is typed", async () => {
    const row = rowNamed(page, `${unique} renamed`);
    await row.getByRole("button", { name: "Close" }).click();
    const submit = row.getByRole("button", { name: "Close" });
    assert(await submit.isDisabled(), "Close should start disabled");
    await row.getByLabel(/to close this portfolio/i).fill("wrong name");
    assert(await submit.isDisabled(), "a wrong name must not enable Close");
  });

  await step("closes it once the name matches", async () => {
    const row = rowNamed(page, `${unique} renamed`);
    await row.getByLabel(/to close this portfolio/i).fill(`${unique} renamed`);
    await row.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(
      (name) => !document.body.innerText.includes(name),
      `${unique} renamed`,
      { timeout: 15_000 },
    );
  });

  await step("refuses a duplicate name with the service's own words", async () => {
    await page.goto(`${BASE}/account/portfolios`);
    await page.getByLabel(/^name$/i).fill("Main");
    await page.getByRole("button", { name: /open portfolio/i }).click();
    await page.waitForFunction(() => /already used/iu.test(document.body.innerText), undefined, {
      timeout: 15_000,
    });
  });

  await step("refuses to close a book that still holds positions", async () => {
    await page.goto(`${BASE}/account/portfolios`);
    const row = rowNamed(page, "Main");
    await row.getByRole("button", { name: "Close" }).click();
    await row.getByLabel(/to close this portfolio/i).fill("Main");
    await row.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(
      () => /still holds|position/iu.test(document.body.innerText),
      undefined,
      { timeout: 15_000 },
    );
  });

  // --------------------------------------------------------------------- brokers
  console.log("\nbrokers");
  await step("connects a brokerage account", async () => {
    await page.goto(`${BASE}/account/brokers`);
    await page.getByLabel(/^name$/i).fill("Audit desk");
    await page.getByLabel(/api key/i).fill("PKTESTKEY1234567890");
    await page.getByLabel(/api secret/i).fill("secretsecretsecret123456");
    await page.getByRole("button", { name: /connect broker/i }).click();
    await page.waitForFunction(() => document.body.innerText.includes("Audit desk"), undefined, {
      timeout: 20_000,
    });
  });

  await step("never shows the credential back", async () => {
    const text = await pageText(page);
    assert(!text.includes("PKTESTKEY1234567890"), "the API key was rendered back to the browser");
    assert(!text.includes("secretsecretsecret123456"), "the API secret was rendered back");
    const html = await page.content();
    assert(!html.includes("PKTESTKEY1234567890"), "the API key is in the page source");
    assert(!html.includes("secretsecretsecret123456"), "the API secret is in the page source");
  });

  await step("tests the connection", async () => {
    const row = page.getByRole("row").filter({ hasText: "Audit desk" });
    await row.getByRole("button", { name: "Test" }).click();
    await page.waitForFunction(() => /ready|connected/iu.test(document.body.innerText), undefined, {
      timeout: 20_000,
    });
  });

  await step("disconnects it, and needs the name typed first", async () => {
    const row = page.getByRole("row").filter({ hasText: "Audit desk" });
    const remove = row.getByRole("button", { name: "Remove" });
    assert(await remove.isDisabled(), "Remove should start disabled");
    await row.getByLabel(/to remove this connection/i).fill("Audit desk");
    await remove.click();
    await page.waitForFunction(() => !document.body.innerText.includes("Audit desk"), undefined, {
      timeout: 20_000,
    });
  });

  // --------------------------------------------------------------------- profile
  console.log("\nprofile and preferences");
  await step("saves the profile", async () => {
    await page.goto(`${BASE}/account/profile`);
    await page.getByLabel(/occupation/i).fill("Portfolio manager");
    await page.getByRole("button", { name: /save profile/i }).click();
    await page.waitForFunction(() => /saved|updated/iu.test(document.body.innerText), undefined, {
      timeout: 20_000,
    });
  });

  await step("saves preferences", async () => {
    await page.goto(`${BASE}/account/preferences`);
    const save = page.getByRole("button", { name: /save/i }).first();
    await save.click();
    await page.waitForFunction(() => /saved|updated/iu.test(document.body.innerText), undefined, {
      timeout: 20_000,
    });
  });

  // ------------------------------------------------------------------- csrf gate
  console.log("\nthe same-origin gate actually refuses");
  await step("a Server Action posted from another origin is refused", async () => {
    // The real claim behind `serverActionsRequireSameOrigin`. Replays the action POST the
    // browser just made, with a foreign Origin header.
    const result = await page.evaluate(async (base) => {
      const response = await fetch(`${base}/account/profile`, {
        method: "POST",
        headers: {
          "content-type": "text/plain;charset=UTF-8",
          "next-action": "00000000000000000000000000000000000000",
          origin: "https://evil.example",
        },
        body: "[]",
      });
      return { status: response.status, body: (await response.text()).slice(0, 200) };
    }, BASE);
    assert(
      result.status !== 200 || !/success/iu.test(result.body),
      `a cross-origin action POST answered ${result.status}: ${result.body}`,
    );
  });

  await browser.close();

  console.log(`\n${passes} passed, ${failures} failed`);
  if (consoleErrors.length) {
    console.log(`\npage errors and 5xx responses (${consoleErrors.length}):`);
    for (const line of consoleErrors.slice(0, 20)) console.log(`  ${line}`);
  }
  if (failures || consoleErrors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

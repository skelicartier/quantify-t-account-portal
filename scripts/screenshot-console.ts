/**
 * Drive every console page in a real browser against the mock Account API and save
 * screenshots at desktop and phone widths, asserting no horizontal overflow and no
 * serious/critical axe violations.
 *
 *   npx tsx scripts/mock-account-api.ts &
 *   QT_ACCOUNT_API_URL=http://127.0.0.1:7071/api/v1 npm run dev &
 *   npx tsx scripts/screenshot-console.ts [http://127.0.0.1:3000]
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright";

const BASE = process.argv[2] ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const API = process.env.QT_ACCOUNT_API_URL ?? "http://127.0.0.1:7071/api/v1";
const OUT = join("test-results", "console");

// The desktop handoff, played the way the app plays it: a PKCE pair, a state, and a
// loopback listener that receives the one-time code.
const VERIFIER = randomBytes(32).toString("base64url");
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const STATE = randomBytes(24).toString("base64url");

async function loopbackListener(): Promise<{
  port: number;
  callback: Promise<URL>;
  close(): void;
}> {
  let resolveCallback: (url: URL) => void = () => undefined;
  const callback = new Promise<URL>((resolve) => {
    resolveCallback = resolve;
  });
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<p>You're signed in. Return to Quantify Terminal.</p>");
    resolveCallback(new URL(request.url ?? "/", "http://127.0.0.1"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { port, callback, close: () => server.close() };
}
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 412, height: 915 },
] as const;

const ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/account",
  "/account/profile",
  "/account/preferences",
  "/account/security",
  "/account/sessions",
  "/account/activity",
  "/account/notifications",
  "/account/data",
  "/admin",
  "/admin/users",
  "/admin/users/9d3f5b71-4c6e-4a8b-9c0d-1e3f5a7b9c33",
  "/admin/audit",
  "/admin/reports",
  "/admin/notifications",
  "/admin/email",
  "/admin/configuration",
  "/admin/credentials",
  "/admin/releases",
  "/admin/roles",
] as const;

const LIGHT_ROUTES = [
  "/account",
  "/account/security",
  "/admin",
  "/admin/users",
  "/admin/users/9d3f5b71-4c6e-4a8b-9c0d-1e3f5a7b9c33",
  "/admin/audit",
  "/login",
] as const;

function slugFor(route: string) {
  return route.replace(/^\//u, "").replace(/[^a-z0-9]+/giu, "-") || "root";
}

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.getByRole("textbox", { name: /email address/i }).fill(email);
  await page.getByLabel(/^password$/i).fill("password-1234");
  await page.getByRole("button", { name: /sign in securely/i }).click();
  await page.waitForURL(/\/account/u, { timeout: 30_000 });
}

/** Click a theme option and wait for the Server Action that stores the cookie to answer. */
async function switchTheme(page: Page, label: "Dark" | "Light") {
  const persisted = page.waitForResponse((response) => response.request().method() === "POST");
  await page
    .getByRole("group", { name: "Console theme" })
    .getByRole("button", { name: label })
    .click();
  await persisted;
  await page.waitForFunction(
    (expected) => document.querySelector(".shell")?.getAttribute("data-theme") === expected,
    label.toLowerCase(),
  );
}

async function check(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) console.warn(`  ! ${label}: horizontal overflow ${overflow}px`);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  for (const violation of serious) {
    console.warn(
      `  ! ${label}: axe ${violation.id} (${violation.impact}) × ${violation.nodes.length}`,
    );
  }
  return { overflow, serious: serious.length };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let problems = 0;
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.warn(`  ! page error: ${error.message}`));
    await signIn(page, "owner@example.test");
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      const slug = slugFor(route);
      await page.screenshot({ path: join(OUT, `${slug}-${viewport.name}.png`), fullPage: true });
      const result = await check(page, `${route} @${viewport.name}`);
      problems += result.serious + (result.overflow > 1 ? 1 : 0);
      console.log(`  ✓ ${route} @${viewport.name}`);
    }
    if (viewport.name === "phone") {
      await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Open menu" }).click();
      // Let the overlay finish sliding in so the capture shows the settled state.
      await page
        .locator("#shell-sidebar")
        .evaluate((element) => Promise.all(element.getAnimations().map((a) => a.finished)));
      await page.screenshot({ path: join(OUT, `account-phone-menu.png`) });
      console.log("  ✓ mobile menu open");
    }
    if (viewport.name === "desktop") {
      // Live search: type, wait for the result set to change in place, capture.
      await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
      await page.getByRole("searchbox", { name: "Search" }).fill("priya");
      await page.waitForURL(/q=priya/u, { timeout: 15_000 });
      await page.getByRole("table", { name: "Accounts" }).getByText("Priya Natarajan").waitFor();
      await page.screenshot({ path: join(OUT, "admin-users-search-desktop.png"), fullPage: true });
      const result = await check(page, "/admin/users?q=priya @desktop");
      problems += result.serious + (result.overflow > 1 ? 1 : 0);
      console.log("  ✓ /admin/users live search");

      // The desktop handoff end to end: the connect page, Connect, the loopback callback
      // carrying the code and state, and the code redeemed with the verifier.
      const listener = await loopbackListener();
      await page.goto(
        `${BASE}/connect/desktop?state=${STATE}&port=${listener.port}&challenge=${CHALLENGE}`,
        { waitUntil: "networkidle" },
      );
      await page.getByRole("button", { name: "Connect" }).waitFor();
      await page.screenshot({ path: join(OUT, "connect-desktop-desktop.png"), fullPage: true });
      const connectResult = await check(page, "/connect/desktop @desktop");
      problems += connectResult.serious + (connectResult.overflow > 1 ? 1 : 0);
      await page.getByRole("button", { name: "Connect" }).click();
      const callbackUrl = await listener.callback;
      listener.close();
      const code = callbackUrl.searchParams.get("code") ?? "";
      if (
        callbackUrl.pathname !== "/callback" ||
        callbackUrl.searchParams.get("state") !== STATE ||
        !code
      ) {
        console.warn(
          `  ! /connect/desktop: unexpected callback ${callbackUrl.pathname}${callbackUrl.search}`,
        );
        problems += 1;
      } else {
        const redeemed = await fetch(`${API}/auth/handoff/redeem`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, verifier: VERIFIER }),
        });
        if (!redeemed.ok) {
          console.warn(`  ! /connect/desktop: redeem answered ${redeemed.status}`);
          problems += 1;
        }
      }
      await page.goto(`${BASE}/connect/desktop`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: /connection link is incomplete/i }).waitFor();
      await page.screenshot({
        path: join(OUT, "connect-desktop-invalid-desktop.png"),
        fullPage: true,
      });
      console.log("  ✓ /connect/desktop handoff, callback and redeem");

      // The light console is a per-device choice; the sign-in pages stay dark regardless.
      await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
      await switchTheme(page, "Light");
      for (const route of LIGHT_ROUTES) {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
        const theme = await page.evaluate(
          () => document.querySelector(".shell")?.getAttribute("data-theme") ?? "none",
        );
        if (route.startsWith("/login") ? theme !== "none" : theme !== "light") {
          console.warn(
            `  ! ${route}: expected ${route.startsWith("/login") ? "no shell" : "light"} theme, saw ${theme}`,
          );
          problems += 1;
        }
        await page.screenshot({ path: join(OUT, `${slugFor(route)}-light.png`), fullPage: true });
        const result = await check(page, `${route} @light`);
        problems += result.serious + (result.overflow > 1 ? 1 : 0);
        console.log(`  ✓ ${route} @light`);
      }
      await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
      await switchTheme(page, "Dark");
      console.log("  ✓ theme toggle round trip");
    }
    await context.close();
  }

  // A visitor the desktop app sent here signs in first and is told they'll be returned.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/connect/desktop?state=${STATE}&port=53321&challenge=${CHALLENGE}`, {
    waitUntil: "networkidle",
  });
  await page.waitForURL(/\/login\?next=/u, { timeout: 15_000 });
  await page.getByText(/returned to the app automatically/i).waitFor();
  await page.screenshot({ path: join(OUT, "login-desktop-handoff.png"), fullPage: true });
  console.log("  ✓ /connect/desktop signed out → /login with the handoff");

  // A plain account holder must see the forbidden state, not an error page.
  await signIn(page, "user@example.test");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(OUT, "admin-forbidden-desktop.png"), fullPage: true });
  console.log("  ✓ /admin as plain user");
  await context.close();

  await browser.close();
  console.log(
    problems === 0 ? "console ui check: no problems" : `console ui check: ${problems} problem(s)`,
  );
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "test-results/notifications");
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false,
  envDir: false,
  root: path.join(root, "tests/fixtures/notification-browser"),
  plugins: [react()],
  resolve: { alias: { "@": path.join(root, "src") } },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  const address = server.httpServer!.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
  for (const [name, width, height] of [
    ["desktop", 1280, 900],
    ["mobile", 390, 844],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole("button", { name: "New notification", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Planned service maintenance");
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Services will restart at 09:00 UTC.");
    await page.getByRole("combobox", { name: /^Recipients/ }).selectOption("selected");
    await page.getByLabel("Email addresses", { exact: true }).fill("test@example.test");
    await page.getByRole("button", { name: "Add action", exact: true }).click();
    await page.getByLabel("Label", { exact: true }).fill("Release notes");
    await page.getByLabel("HTTPS URL", { exact: true }).fill("https://example.test/releases");
    await page.screenshot({ path: path.join(output, `${name}-editor.png`), fullPage: true });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${name}: horizontal page overflow`,
    );
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    assert.deepEqual(
      violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })),
      [],
    );
    await page.getByRole("button", { name: "Save notification", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Notification saved." }).waitFor();
    await page.getByRole("row").filter({ hasText: "Planned service maintenance" }).waitFor();
    await page.goto(`${origin}/?account`);
    await page.getByRole("button", { name: "Mark read", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Response recorded." }).waitFor();
    await page.screenshot({ path: path.join(output, `${name}-account.png`), fullPage: true });
    assert.deepEqual(
      (await new AxeBuilder({ page }).analyze()).violations.map((item) => item.id),
      [],
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${name}: publish, receipt, overflow, and accessibility checks passed`);
  }
} finally {
  await browser?.close();
  await server.close();
}

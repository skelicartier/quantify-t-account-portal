import type { Page } from "@playwright/test";

export async function stubTurnstile(page: Page): Promise<void> {
  await page.route("https://challenges.cloudflare.com/turnstile/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.turnstile = {
        render(container, options) {
          container.textContent = "Security verification ready";
          options.callback("playwright-turnstile-response");
          return "playwright-widget";
        },
        remove() {},
        reset() {}
      };`,
    });
  });
}

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { stubTurnstile } from "./turnstile-stub";

const credentialRoutes = [
  ["/login", /sign in to quantify terminal/i],
  ["/signup", /create your account/i],
  ["/forgot-password", /reset your password/i],
  ["/reset-password", /choose a new password/i],
] as const;

for (const [path, heading] of credentialRoutes) {
  test(`${path} is keyboard-addressable and has no serious accessibility violations`, async ({
    page,
  }) => {
    await stubTurnstile(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const seriousViolations = results.violations.filter(({ impact }) =>
      ["serious", "critical"].includes(impact ?? ""),
    );

    expect(seriousViolations).toEqual([]);
  });
}

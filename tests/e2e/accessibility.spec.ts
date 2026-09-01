import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("login foundation is keyboard-addressable and has no serious accessibility violations", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/Sign in.*Quantify Terminal/i);
  await expect(page.getByRole("heading", { name: /sign in to quantify terminal/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const seriousViolations = results.violations.filter(({ impact }) =>
    ["serious", "critical"].includes(impact ?? ""),
  );

  expect(seriousViolations).toEqual([]);
});

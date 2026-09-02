import { expect, test } from "@playwright/test";

import { stubTurnstile } from "./turnstile-stub";

test.beforeEach(async ({ page }) => {
  await stubTurnstile(page);
});

test("an unauthenticated account request fails closed to the login surface", async ({ page }) => {
  await page.goto("/account?source=e2e");

  await expect(page).toHaveURL((url) => {
    return url.pathname === "/login" && url.searchParams.get("next") === "/account?source=e2e";
  });
  await expect(page.getByRole("textbox", { name: /email address/i })).toBeEnabled();
  await expect(page.getByLabel(/^password$/i)).toBeEnabled();
  await expect(page.getByRole("button", { name: /sign in securely/i })).toBeEnabled();
});

test("a malformed confirmation link fails to one generic canonical notice", async ({ page }) => {
  await page.goto("/auth/confirm?flow=signup&next=https://evil.example/steal");

  await expect(page).toHaveURL((url) => {
    return url.pathname === "/login" && url.searchParams.get("notice") === "invalid-auth-link";
  });
  await expect(
    page.getByRole("status").filter({ hasText: /invalid or has expired/i }),
  ).toBeVisible();
});

test("the signup surface contains no web PIN field or copy", async ({ page }) => {
  await page.goto("/signup");

  await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
  await expect(page.getByText(/\bpin\b/i)).toHaveCount(0);
  await expect(page.locator('input[name*="pin" i]')).toHaveCount(0);
});

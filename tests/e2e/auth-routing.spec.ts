import { expect, test } from "@playwright/test";

import { stubTurnstile } from "./turnstile-stub";

test.beforeEach(async ({ page }) => {
  await stubTurnstile(page);
});

test("an unauthenticated account request fails closed to the login surface", async ({ page }) => {
  await page.goto("/account/sessions?source=e2e");

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/login" && url.searchParams.get("next") === "/account/sessions?source=e2e"
    );
  });
  await expect(page.getByRole("textbox", { name: /email address/i })).toBeEnabled();
  await expect(page.getByLabel(/^password$/i)).toBeEnabled();
  await expect(page.getByRole("button", { name: /sign in securely/i })).toBeEnabled();
});

test("an unauthenticated admin request keeps its safe return path", async ({ page }) => {
  await page.goto("/admin/roles?include=matches");

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/login" && url.searchParams.get("next") === "/admin/roles?include=matches"
    );
  });
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

for (const destination of [
  "/account/data",
  "/account/notifications",
  "/admin/notifications",
  "/admin/email",
  "/admin/reports",
  "/admin/configuration",
  "/admin/credentials",
  "/admin/releases",
]) {
  test(`${destination} requires authentication on direct navigation`, async ({ page }) => {
    await page.goto(destination);
    await expect(page).toHaveURL(
      (url) => url.pathname === "/login" && url.searchParams.get("next") === destination,
    );
    await expect(page.getByRole("button", { name: /sign in securely/i })).toBeEnabled();
  });
}

test("the signup surface contains no web PIN field or copy", async ({ page }) => {
  await page.goto("/signup");

  await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
  await expect(page.getByText(/\bpin\b/i)).toHaveCount(0);
  await expect(page.locator('input[name*="pin" i]')).toHaveCount(0);
});

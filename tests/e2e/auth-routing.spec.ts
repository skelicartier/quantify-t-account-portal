import { expect, test } from "@playwright/test";

test("an unauthenticated account request fails closed to the login surface", async ({ page }) => {
  await page.goto("/account?source=e2e");

  await expect(page).toHaveURL((url) => {
    return url.pathname === "/login" && url.searchParams.get("next") === "/account?source=e2e";
  });
  await expect(page.getByRole("textbox", { name: /email address/i })).toBeEnabled();
  await expect(page.getByLabel(/^password$/i)).toBeEnabled();
  await expect(page.getByRole("button", { name: /sign in securely/i })).toBeEnabled();
});

import { expect, test } from "@playwright/test";

// The seed spec proves the setup (a signed-in owner, a running build) and the access gate, from a visitor's point of view.

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a visitor opening the alerts page lands on the sign-in page", async ({ page }) => {
    await page.goto("/dashboard/alerts");

    await expect(page).toHaveURL(/\/auth\/signin$/);
    await expect(page.getByRole("heading", { name: "Zaloguj się", exact: true })).toBeVisible();
  });
});

test("the signed-in owner sees the alert rules page", async ({ page }) => {
  await page.goto("/dashboard/alerts");

  await expect(page.getByRole("heading", { name: "Reguły alertów", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Alerty", exact: true })).toHaveAttribute("aria-current", "page");
});

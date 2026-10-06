import { expect, test, type Page } from "@playwright/test";

// The owner's alert-rules flows, driven through the real forms of /dashboard/alerts. Every test makes its own rule under a
// unique label and removes it through the page. Thresholds are whole minutes below 1000 (no thousands separator in the
// rendered text), drawn from a range reserved per test so parallel tests never collide on kind + threshold.

const KIND_STALE = "Dane z domu są nieaktualne";

function uniqueLabel(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function randomMinutes(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function ruleItem(page: Page, label: string) {
  return page.getByRole("listitem").filter({ hasText: label });
}

async function openAlertsPage(page: Page) {
  await page.goto("/dashboard/alerts");
  await expect(page.getByRole("heading", { name: "Reguły alertów", exact: true })).toBeVisible();
}

// Opens the create form and submits it. The caller waits for the redirect it expects.
async function submitCreateForm(page: Page, label: string, threshold: number) {
  const createForm = page.getByRole("group").filter({ hasText: "Dodaj regułę" });
  await createForm.getByText("Dodaj regułę", { exact: true }).click();
  await createForm.getByLabel("Rodzaj reguły").selectOption({ label: KIND_STALE });
  await createForm.getByLabel("Próg", { exact: true }).fill(String(threshold));
  await createForm.getByLabel("Nazwa (opcjonalnie, do 60 znaków)").fill(label);
  await createForm.getByRole("button", { name: "Dodaj", exact: true }).click();
}

async function createRule(page: Page, label: string, threshold: number) {
  await openAlertsPage(page);
  await submitCreateForm(page, label, threshold);
  await expect(page).toHaveURL(/alert=created$/);
  await expect(page.getByRole("status")).toHaveText("Reguła dodana.");
  await expect(ruleItem(page, label)).toBeVisible();
}

// Starts from a freshly loaded page, so it also works as cleanup after a failure in the middle of a test.
async function deleteRule(page: Page, label: string) {
  await openAlertsPage(page);
  const item = ruleItem(page, label);
  await item.getByText("Usuń", { exact: true }).click();
  await item.getByRole("button", { name: "Na pewno usuń", exact: true }).click();
  await expect(page).toHaveURL(/alert=deleted$/);
  await expect(page.getByRole("status")).toHaveText("Reguła usunięta.");
  await expect(ruleItem(page, label)).toHaveCount(0);
}

test("the owner creates, edits, disables and deletes a rule", async ({ page }) => {
  const label = uniqueLabel();
  const threshold = randomMinutes(15, 299);
  const newThreshold = randomMinutes(300, 599);

  await createRule(page, label, threshold);
  try {
    const item = ruleItem(page, label);
    await expect(item).toContainText(`starsze niż ${threshold} min`);
    await expect(item).toContainText("w normie");

    await item.getByText("Edytuj", { exact: true }).click();
    await item.getByLabel("Próg (minuty, od 15 do 1440)").fill(String(newThreshold));
    await item.getByRole("button", { name: "Zapisz", exact: true }).click();
    await expect(page).toHaveURL(/alert=updated$/);
    await expect(page.getByRole("status")).toHaveText("Reguła zapisana.");
    await expect(item).toContainText(`starsze niż ${newThreshold} min`);

    await item.getByRole("button", { name: "Wyłącz", exact: true }).click();
    await expect(page).toHaveURL(/alert=toggled$/);
    await expect(page.getByRole("status")).toHaveText("Stan reguły zmieniony.");
    await expect(item).toContainText("wyłączona");
    await expect(item.getByRole("button", { name: "Włącz", exact: true })).toBeVisible();
  } finally {
    await deleteRule(page, label);
  }
});

test("the owner is told when a rule has invalid data, and nothing is created", async ({ page }) => {
  const label = uniqueLabel();

  await openAlertsPage(page);
  await submitCreateForm(page, label, 5);

  await expect(page).toHaveURL(/alert=invalid$/);
  await expect(page.getByRole("status")).toHaveText(
    "Reguła ma niepoprawne dane. Sprawdź próg, nazwę i odstęp między przypomnieniami.",
  );
  await expect(ruleItem(page, label)).toHaveCount(0);
});

test("the owner cannot create the same rule twice", async ({ page }) => {
  const label = uniqueLabel();
  const secondLabel = uniqueLabel();
  const threshold = randomMinutes(600, 899);

  await createRule(page, label, threshold);
  try {
    await submitCreateForm(page, secondLabel, threshold);

    await expect(page).toHaveURL(/alert=duplicate$/);
    await expect(page.getByRole("status")).toHaveText("Taka reguła już istnieje: ten sam rodzaj i próg.");
    await expect(ruleItem(page, label)).toBeVisible();
    await expect(ruleItem(page, secondLabel)).toHaveCount(0);
  } finally {
    await deleteRule(page, label);
  }
});

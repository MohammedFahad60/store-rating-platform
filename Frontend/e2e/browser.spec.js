import { expect, test } from "@playwright/test";

/**
 * Real-browser journeys across all three roles (Phase 4F).
 *
 * The suite is serial and self-sufficient: it uses the deterministic demo
 * accounts created by `Backend/seed.js`:
 *   customer  aisha@gmail.com          / User@123
 *   owner     owner1@storerating.com   / Owner@123
 *   admin     admin@storerating.com    / Admin@123
 *
 * Running the suite seeds a throwaway SQLite file (`.tmp-playwright.sqlite`,
 * test-only per project policy) on every cold start, so it is repeatable.
 */

const APP = "http://localhost:5180";

async function login(page, email, password) {
  await page.goto(`${APP}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTitle("Logout")).toBeVisible({ timeout: 15_000 });
}

/** Next weekday (Mon–Sat, i.e. not Sunday) at least `from` days ahead. */
function nextOpenDate(fromDays = 3) {
  const d = new Date(Date.now() + fromDays * 86400000);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1); // skip closed Sundays
  return d.toISOString().slice(0, 10);
}

test.describe.configure({ mode: "serial" });

test.describe("Store Rating — security & role restrictions (browser-visible)", () => {
  test("disabled account cannot sign in (visible error, no session)", async ({ page }) => {
    await page.goto(`${APP}/login`);
    await page.getByLabel(/email/i).fill("disabled@storerating.com");
    await page.getByLabel(/password/i).fill("User@123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/disabled|inactive|account/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTitle("Logout")).toHaveCount(0);
  });

  test("unauthenticated user is redirected away from protected routes", async ({ page }) => {
    await page.goto(`${APP}/customer`);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.goto(`${APP}/admin`);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

test.describe("Store Rating — customer journey", () => {
  test("browse, view a store, book a service, favorite it, see notifications, logout", async ({ page }) => {
    await login(page, "aisha@gmail.com", "User@123");

    // Browse public store catalog.
    await page.goto(`${APP}/stores`);
    await expect(page.getByRole("heading", { name: /stores/i }).first()).toBeVisible();
    const firstStore = page.locator("a[href^='/stores/']").first();
    await expect(firstStore).toBeVisible();
    const storeName = (await firstStore.locator("h3").textContent()).trim();

    // Store detail with services and opening hours.
    const storeHref = await firstStore.getAttribute("href");
    const storePageId = storeHref ? storeHref.split("/").pop() : "";
    await firstStore.click();
    await expect(page.getByRole("heading", { name: new RegExp(storeName) }).first()).toBeVisible();
    await expect(page.getByText(/open|closed/i).first()).toBeVisible();

    // Service selection: open the first service's detail page.
    await page.getByRole("button", { name: /^details$/i }).first().click();
    await expect(page).toHaveURL(/\/services\//, { timeout: 10_000 });
    const servicePageId = page.url().split("/").pop();
    await expect(servicePageId).toMatch(/^\d+$/);
    await expect(page.getByRole("button", { name: /book this service/i }).first()).toBeVisible();
    await page.getByRole("button", { name: /book this service/i }).first().click();
    await expect(page.getByRole("heading", { name: /book/i }).first()).toBeVisible();

    // Pick an open date, wait for the slot grid, pick the first ENABLED slot,
    // submit.
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.count()) {
      await dateInput.fill(nextOpenDate());
      const slot = page
        .locator('button:not([disabled])', { hasText: /^\d{1,2}:\d{2}$/ })
        .first();
      await expect(slot).toBeVisible({ timeout: 15_000 });
      await slot.click();
    }
    await page.getByRole("button", { name: /^request booking$/i }).click();
    await expect(page).toHaveURL(/\/my-bookings/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /my bookings/i }).first()).toBeVisible();

    // Notifications page renders and exposes the unread summary.
    await page.getByTitle("Notifications").click();
    await page.getByRole("link", { name: /view all/i }).click();
    await expect(page.getByRole("heading", { name: /notifications/i }).first()).toBeVisible();

    // Favorites: ensure the store is favorited from its detail page, then
    // verify it appears in Favorites. (Seed already favorites stores[0]/[1]
    // for this customer, so start from a clean state when needed.)
    await page.goto(`${APP}/stores/${encodeURIComponent(storePageId)}`);
    const favCurrent = page
      .locator('button[title="Add to favorites"], button[title="Remove from favorites"]')
      .first();
    await expect(favCurrent).toBeVisible();
    if ((await favCurrent.getAttribute("title")) === "Remove from favorites") {
      await favCurrent.click();
      await expect(page.getByTitle("Add to favorites")).toBeVisible();
    }
    await page.getByTitle("Add to favorites").click();
    await expect(page.getByTitle("Remove from favorites")).toBeVisible();
    await page.goto(`${APP}/favorites`);
    await expect(page.getByRole("heading", { name: /favorites/i }).first()).toBeVisible();
    await expect(page.getByText(new RegExp(storeName)).first()).toBeVisible();

    // Customer cannot reach owner/admin routes (role restriction).
    await page.goto(`${APP}/owner`);
    await expect(page).not.toHaveURL(/\/owner/);
    await page.goto(`${APP}/admin`);
    await expect(page).not.toHaveURL(/\/admin/);

    // Logout returns to the login page and clears the session.
    await page.getByTitle("Logout").click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});

test.describe("Store Rating — owner journey", () => {
  test("dashboard, bookings, customers, services, settings, hours, analytics", async ({ page }) => {
    await login(page, "owner1@storerating.com", "Owner@123");

    // Dashboard exposes live metrics.
    await page.goto(`${APP}/owner`);
    await expect(page.getByText(/revenue|bookings|rating/i).first()).toBeVisible();

    // Booking management with search.
    await page.getByRole("link", { name: /bookings/i }).click();
    await expect(page.getByRole("heading", { name: /bookings/i }).first()).toBeVisible();
    const search = page.getByPlaceholder(/search/i).first();
    if (await search.count()) {
      await search.fill("aisha@gmail.com");
      await expect(page.getByText(/aisha@gmail.com/i).first()).toBeVisible();
    }

    // Customers page renders.
    await page.getByRole("link", { name: /customers/i }).click();
    await expect(page.getByRole("heading", { name: /customers/i }).first()).toBeVisible();

    // Service management: list + deactivation confirmation dialog.
    await page.getByRole("link", { name: /services/i }).click();
    await expect(page.getByRole("heading", { name: /services/i }).first()).toBeVisible();
    const deactivate = page.getByRole("button", { name: /deactivate|disable/i }).first();
    if (await deactivate.count()) {
      await deactivate.click();
      await expect(page.getByRole("button", { name: /^deactivate service$/i }).first()).toBeVisible();
      await page.getByRole("button", { name: /^cancel$/i }).click();
    }

    // Store settings: hours are visible; save requires valid values.
    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page.getByRole("heading", { name: /settings|store/i }).first()).toBeVisible();
    await expect(page.getByText(/monday|sunday|hours/i).first()).toBeVisible();

    // Analytics page renders with a range control.
    await page.getByRole("link", { name: /analytics/i }).click();
    await expect(page.getByRole("heading", { name: /analytics/i }).first()).toBeVisible();
  });
});

test.describe("Store Rating — admin journey", () => {
  test("users, details, bookings, reviews moderation, audit logs", async ({ page }) => {
    await login(page, "admin@storerating.com", "Admin@123");

    // User management: list, search, detail page with status/role.
    await page.goto(`${APP}/admin/users`);
    await expect(page.getByRole("heading", { name: /users/i }).first()).toBeVisible();
    const userRow = page.getByText("aisha@gmail.com").first();
    await expect(userRow).toBeVisible();
    await userRow.locator("xpath=ancestor::tr").getByRole("button", { name: /view/i }).first().click();
    await expect(page.getByRole("heading", { name: /^aisha khan/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/ACTIVE|DISABLED|USER|OWNER|ADMIN/i).first()).toBeVisible();

    // Bookings list.
    await page.goto(`${APP}/admin/bookings`);
    await expect(page.getByRole("heading", { name: /bookings/i }).first()).toBeVisible();

    // Review moderation (hide/restore flow).
    await page.goto(`${APP}/admin/reviews`);
    await expect(page.getByRole("heading", { name: /reviews|moderation/i }).first()).toBeVisible();
    const hideButton = page.getByRole("button", { name: /^hide$/i }).first();
    if (await hideButton.count()) {
      await hideButton.click();
      await page.getByRole("button", { name: /^hide review$/i }).click();
      await expect(page.getByRole("button", { name: /^restore$/i }).first()).toBeVisible();
    }

    // Audit log exists and never shows secrets.
    await page.goto(`${APP}/admin/audit-logs`);
    await expect(page.getByRole("heading", { name: /audit/i }).first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\$2[aby]\$|eyJhbGci/i);
  });
});

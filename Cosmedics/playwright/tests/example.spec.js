const { test, expect } = require('@playwright/test');

/**
 * Placeholder — replace with real Cosmedics web flows once BASE_URL points to your app.
 */
test.describe('Cosmedics web (placeholder)', () => {
  test('loads base URL', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/./);
  });
});

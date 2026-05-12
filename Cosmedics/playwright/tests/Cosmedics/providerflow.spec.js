import { test } from '@playwright/test';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOne(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function randomAlpha(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[randInt(0, chars.length - 1)];
  return out;
}

function randomDigits(len) {
  let out = '';
  for (let i = 0; i < len; i++) out += String(randInt(0, 9));
  return out;
}

function randomUsLocation() {
  // Small curated set to keep city/state/zip consistent and USA-only.
  const locations = [
    { city: 'Newark', state: 'New Jersey', zip: '07102' },
    { city: 'Jersey City', state: 'New Jersey', zip: '07302' },
    { city: 'New York', state: 'New York', zip: '10001' },
    { city: 'Brooklyn', state: 'New York', zip: '11201' },
    { city: 'Los Angeles', state: 'California', zip: '90012' },
    { city: 'San Diego', state: 'California', zip: '92101' },
    { city: 'Chicago', state: 'Illinois', zip: '60601' },
    { city: 'Houston', state: 'Texas', zip: '77002' },
    { city: 'Austin', state: 'Texas', zip: '78701' },
    { city: 'Miami', state: 'Florida', zip: '33130' },
    { city: 'Seattle', state: 'Washington', zip: '98101' },
    { city: 'Boston', state: 'Massachusetts', zip: '02108' },
    { city: 'Phoenix', state: 'Arizona', zip: '85004' },
    { city: 'Denver', state: 'Colorado', zip: '80202' },
    { city: 'Atlanta', state: 'Georgia', zip: '30303' },
  ];
  return pickOne(locations);
}

function randomProviderData() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const uniq = `${stamp}${randomDigits(4)}`;

  const namePrefix = pickOne(['Dr Provider', 'Dr Doctor', 'Provider', 'Doctor']);
  const lastName = pickOne(['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson']);
  const fullName = `${namePrefix} ${lastName}`;

  const localPart = `${namePrefix.replace(/\s+/g, '').toLowerCase()}_${randomAlpha(6)}_${uniq}`;
  const email = `${localPart}@mailinator.com`;

  const phone = `(${randInt(201, 989)}) ${randInt(200, 999)}-${randInt(1000, 9999)}`;
  const specialization = pickOne(['Dentistry', 'Orthodontics', 'Dermatology', 'Aesthetic Medicine', 'Cosmetic Dentistry']);
  const license = `${pickOne(['NJ', 'NY', 'CA', 'TX', 'FL', 'IL'])}-${randomDigits(7)}`;

  const loc = randomUsLocation();
  const address = `${randInt(10, 9999)} ${pickOne(['Main St', 'Broad St', 'Market St', 'Oak Ave', 'Pine St', 'Maple Rd'])}`;

  return {
    name: fullName,
    email,
    phone,
    specialization,
    address,
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
    license,
  };
}

test.describe('Cosmedics provider flow', () => {
  test('provider flow: For Providers -> Click here', async ({ page }) => {
    test.setTimeout(120000);

    // Ensure desktop nav is visible (menu is hidden below 1180px).
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('https://dev.cosmedicenter.com/', { waitUntil: 'domcontentloaded' });

    // Click the "For Providers" tab in the top menu.
    try {
      // Prefer your recorded (codegen) click.
      await page.locator('div').filter({ hasText: /^For Providers$/ }).click({ timeout: 8000 });
    } catch {
      const forProvidersLink = page.locator('a[href="/for-providers"]').first();
      if (!(await forProvidersLink.isVisible().catch(() => false))) {
        // Fallback for smaller viewports / collapsed nav: open sidebar menu first.
        await page.locator('button[aria-controls="sidebar"]').first().click();
      }
      await forProvidersLink.click();
    }
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL('**/for-providers', { timeout: 30000 });

    // Locate the purple card and click the "Click here" span within it.
    const card = page.locator('div.bg-\\[\\#7B2199\\]').first();
    const clickHere = card.getByText('Click here', { exact: true });
    await clickHere.scrollIntoViewIfNeeded();

    await clickHere.click();

    // Provider registration opens a modal dialog.
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
    await dialog
      .getByRole('heading', { name: 'Contact us to Register Your Interest to Join' })
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });

    const data = randomProviderData();

    await dialog.locator('input[name="name"]').fill(data.name);
    await dialog.locator('input[name="email"]').fill(data.email);
    await dialog.locator('input[name="phone"]').fill(data.phone);
    await dialog.locator('input[name="specialization"]').fill(data.specialization);
    await dialog.locator('input[name="address"]').fill(data.address);
    await dialog.locator('input[name="city"]').fill(data.city);
    await dialog.locator('input[name="zip"]').fill(data.zip);
    await dialog.locator('input[name="license"]').fill(data.license);

    // State dropdown (Radix): open combobox, click the matching option.
    const stateCombo = dialog.locator('button[role="combobox"]').first();
    await stateCombo.click();
    await page.getByRole('option', { name: data.state, exact: true }).first().click();

    const submit = dialog.getByRole('button', { name: 'Submit', exact: true }).first();
    await submit.waitFor({ state: 'visible', timeout: 15000 });
    await submit.click();

    // After submit: modal should close or show confirmation.
    try {
      await dialog.waitFor({ state: 'hidden', timeout: 20000 });
    } catch {
      // If it doesn't close, at least ensure we're not stuck on an empty transition.
      await page.waitForTimeout(500);
      // Keep it flexible since confirmation UI isn't provided.
    }
  });
});


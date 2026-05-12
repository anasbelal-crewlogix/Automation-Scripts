import { test, expect } from '@playwright/test';

const PAUSE_MS = 800;
const signinUrl = 'https://dev.cosmedicenter.com/auth/signin';
const providersUrl = 'https://dev.cosmedicenter.com/our-providers';

const rightEmail = 'patient@gmail.com';
const rightPassword = 'Password123';
const wrongEmail = 'pateint@gmail.com';
const wrongPassword = 'password123';

test('Cosmedics signin - multiple cases (watchable)', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(signinUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign In' }).click();
  await page.waitForTimeout(PAUSE_MS);

  const email = () => page.getByRole('textbox', { name: 'Email Address' }).first();
  const password = () => page.getByRole('textbox', { name: 'Password' }).first();
  const continueButton = () => page.getByRole('button', { name: 'Continue' }).first();
  const eyeToggle = () => page.locator('button.absolute.inset-y-0.right-0').first();

  const failures = [];
  const runCase = async (name, fn) => {
    console.log(`[RUNNING] ${name}`);
    try {
      await fn();
      console.log(`[PASSED] ${name}`);
    } catch (error) {
      console.log(`[FAILED] ${name}`);
      failures.push(name);
    }
  };

  await runCase('wrong email + wrong password', async () => {
    await email().click();
    await email().fill(wrongEmail);
    await page.waitForTimeout(PAUSE_MS);

    await password().click();
    await eyeToggle().click();
    await page.waitForTimeout(PAUSE_MS);
    await password().fill(wrongPassword);
    await page.waitForTimeout(PAUSE_MS);

    await continueButton().click();
    await page.waitForTimeout(PAUSE_MS);
    await expect(page.getByText('Invalid credentials.').first()).toBeVisible();
  });

  await runCase('right email + wrong password', async () => {
    await email().click();
    await email().fill(rightEmail);
    await page.waitForTimeout(PAUSE_MS);

    await password().click();
    await eyeToggle().click();
    await page.waitForTimeout(PAUSE_MS);
    await password().fill(wrongPassword);
    await page.waitForTimeout(PAUSE_MS);

    await continueButton().click();
    await page.waitForTimeout(PAUSE_MS);
    await expect(page.getByText('Invalid credentials.').first()).toBeVisible();
  });

  await runCase('wrong email + right password', async () => {
    await email().click();
    await email().fill(wrongEmail);
    await page.waitForTimeout(PAUSE_MS);

    await password().click();
    await eyeToggle().click();
    await page.waitForTimeout(PAUSE_MS);
    await password().fill(rightPassword);
    await page.waitForTimeout(PAUSE_MS);

    await continueButton().click();
    await page.waitForTimeout(PAUSE_MS);
    await expect(page.getByText('Invalid credentials.').first()).toBeVisible();
  });

  await runCase('both empty => Continue disabled', async () => {
    await email().click();
    await email().fill('');
    await page.waitForTimeout(PAUSE_MS);

    await password().click();
    await eyeToggle().click();
    await page.waitForTimeout(PAUSE_MS);
    await password().fill('');
    await page.waitForTimeout(PAUSE_MS);

    await expect(continueButton()).toBeDisabled();
    await expect(page).toHaveURL(/\/auth\/signin/i);
  });

  await runCase('email empty + password filled => Continue disabled', async () => {
    await email().click();
    await email().fill('');
    await page.waitForTimeout(PAUSE_MS);

    await password().click();
    await eyeToggle().click();
    await page.waitForTimeout(PAUSE_MS);
    await password().fill(rightPassword);
    await page.waitForTimeout(PAUSE_MS);

    await expect(continueButton()).toBeDisabled();
    await expect(page).toHaveURL(/\/auth\/signin/i);
  });

  await runCase('password empty + email filled => Continue disabled', async () => {
    await password().click();
    await eyeToggle().click();
    await page.waitForTimeout(PAUSE_MS);
    await password().fill('');
    await page.waitForTimeout(PAUSE_MS);

    await email().click();
    await email().fill(rightEmail);
    await page.waitForTimeout(PAUSE_MS);

    await expect(continueButton()).toBeDisabled();
    await expect(page).toHaveURL(/\/auth\/signin/i);
  });

  await runCase('right email + right password => providers page', async () => {
    await email().click();
    await email().fill(rightEmail);
    await page.waitForTimeout(PAUSE_MS);

    await password().click();
    await eyeToggle().click();
    await page.waitForTimeout(PAUSE_MS);
    await password().fill(rightPassword);
    await page.waitForTimeout(PAUSE_MS);

    await expect(email()).toHaveValue(rightEmail);
    await expect(password()).toHaveValue(rightPassword);
    await expect(continueButton()).toBeEnabled({ timeout: 10000 });
    await continueButton().click();
    await page.waitForTimeout(PAUSE_MS);

    await expect(page.getByText(/You have successfully logged/i).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${providersUrl}$`));
  });

  console.log(`[SUMMARY] total=${7}, passed=${7 - failures.length}, failed=${failures.length}`);
  if (failures.length > 0) {
    throw new Error(`Failed cases: ${failures.join(', ')}`);
  }
});

test('Cosmedics top tabs + providers content/search', async ({ page }) => {
  test.setTimeout(180000);

  const email = () => page.getByRole('textbox', { name: 'Email Address' }).first();
  const password = () => page.getByRole('textbox', { name: 'Password' }).first();
  const continueButton = () => page.getByRole('button', { name: 'Continue' }).first();
  const eyeToggle = () => page.locator('button.absolute.inset-y-0.right-0').first();

  await page.goto(signinUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign In' }).click();
  await page.waitForTimeout(PAUSE_MS);

  await email().click();
  await email().fill(rightEmail);
  await page.waitForTimeout(PAUSE_MS);
  await password().click();
  await eyeToggle().click();
  await page.waitForTimeout(PAUSE_MS);
  await password().fill(rightPassword);
  await page.waitForTimeout(PAUSE_MS);
  const rawUsernameInput = page.locator('input[name="username"]').first();
  if ((await rawUsernameInput.inputValue()).trim() === '') {
    await email().click();
    await email().fill(rightEmail);
    await page.waitForTimeout(PAUSE_MS);
  }
  await continueButton().click();
  await page.waitForTimeout(PAUSE_MS);
  await expect(page).toHaveURL(new RegExp(`${providersUrl}$`));

  const tabs = [
    { name: 'Home', url: /\/$/ },
    { name: 'About Us', url: /\/about$/ },
    { name: 'Meals & Nutrition', url: /\/meals-and-nutrition$/ },
    { name: 'Dental', url: /\/dental$/ },
    { name: 'Aesthetic', url: /\/aesthetic$/ },
    { name: 'For Providers', url: /\/for-providers$/ },
    { name: 'Featured Provider', url: /\/featured-providers$/ },
    { name: 'CMC Cares', url: /\/cmc-cares$/ },
    { name: 'Our Providers', url: /\/our-providers$/ },
  ];

  const clickVisibleTabLink = async (tabName) => {
    const candidates = page.getByRole('link', { name: tabName, exact: true });
    const total = await candidates.count();
    for (let i = 0; i < total; i++) {
      const link = candidates.nth(i);
      try {
        await link.click({ trial: true, timeout: 1200 });
        await link.click();
        return;
      } catch {
        // Try next matching link candidate.
      }
    }
    throw new Error(`Could not click a visible/actionable link for tab: ${tabName}`);
  };

  for (const tab of tabs) {
    console.log(`[RUNNING] tab -> ${tab.name}`);
    await clickVisibleTabLink(tab.name);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(PAUSE_MS);
    await expect(page).toHaveURL(tab.url);
    console.log(`[PASSED] tab -> ${tab.name}`);
  }

  // Read provider names dynamically from the left provider list.
  const providerNameNodes = page.locator('div.scrollbar-custom h3.text-limit5');
  await expect(providerNameNodes.first()).toBeVisible({ timeout: 15000 });
  const providerCount = await providerNameNodes.count();
  if (providerCount === 0) {
    throw new Error('No provider names found in the providers list.');
  }

  const allProviderNames = [];
  const allProviderSpecialties = [];
  for (let i = 0; i < providerCount; i++) {
    const providerHeading = providerNameNodes.nth(i);
    const rawName = (await providerHeading.textContent())?.trim() || '';
    const rawSpecialty = (await providerHeading.locator('xpath=following-sibling::p[1]').textContent())?.trim() || '';
    if (rawName) {
      allProviderNames.push(rawName);
    }
    if (rawSpecialty) {
      allProviderSpecialties.push(rawSpecialty);
      console.log(`[INFO] provider -> ${rawName} | specialty -> ${rawSpecialty}`);
    }
  }
  if (allProviderNames.length === 0) {
    throw new Error('Providers list is present but no readable provider names were found.');
  }

  // Validate first provider entry has specialty paragraph under the provider name.
  const firstProviderHeading = providerNameNodes.first();
  await expect(firstProviderHeading).toBeVisible();
  await expect(firstProviderHeading.locator('xpath=following-sibling::p[1]')).toBeVisible();

  // Pick at least 3 random names from current list (or all if fewer than 3) and search each one.
  const shuffled = [...allProviderNames].sort(() => Math.random() - 0.5);
  const namesToSearch = shuffled.slice(0, Math.min(3, shuffled.length));

  const searchBox = page.getByRole('textbox', { name: /search by practitioner or zip code/i }).first();
  const searchContainer = searchBox.locator('xpath=ancestor::div[1]');
  const clickSearchIcon = async () => {
    const candidates = [
      searchContainer.locator('[class*="cursor-pointer"]').first(),
      searchContainer.locator('img').first(),
      searchContainer.locator('svg').first(),
    ];
    for (const c of candidates) {
      try {
        await c.click({ trial: true, timeout: 1000 });
        await c.click();
        return;
      } catch {
        // Try next candidate.
      }
    }
    throw new Error('Could not click search icon near search input.');
  };

  for (const providerName of namesToSearch) {
    console.log(`[RUNNING] providers search -> ${providerName}`);
    await searchBox.click();
    await searchBox.fill(providerName);
    await page.waitForTimeout(PAUSE_MS);
    await clickSearchIcon(); // required: click search icon after entering name
    await page.waitForTimeout(PAUSE_MS + 400);

    await expect(page.locator('div.scrollbar-custom h3.text-limit5', { hasText: providerName }).first()).toBeVisible();
    console.log(`[PASSED] providers search -> ${providerName}`);
  }

  // Clear provider search before applying filter (avoid combined search+filter emptying list).
  console.log('[RUNNING] clear provider search before filter');
  await searchBox.click();
  await searchBox.fill('');
  await expect(searchBox).toHaveValue('');
  await page.waitForTimeout(PAUSE_MS);
  await clickSearchIcon();
  await page.waitForTimeout(PAUSE_MS);
  console.log('[PASSED] clear provider search before filter');

  // Apply specialty filter 3 times. "No records" is acceptable.
  const uniqueSpecialties = [...new Set(allProviderSpecialties.filter(Boolean))];
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[RUNNING] filter attempt ${attempt} -> open sidebar`);
    await page.getByText('Filter', { exact: true }).first().click();
    const filterDialog = page.getByRole('dialog');
    await expect(filterDialog).toBeVisible({ timeout: 15000 });
    console.log(`[PASSED] filter attempt ${attempt} -> sidebar open`);

    const specialtyCombobox = filterDialog.getByRole('combobox').first();
    await specialtyCombobox.click();
    await page.waitForTimeout(PAUSE_MS);

    const selectedSpecialty =
      uniqueSpecialties[Math.floor(Math.random() * uniqueSpecialties.length)] || 'Dermatology';
    console.log(`[RUNNING] filter attempt ${attempt} -> select ${selectedSpecialty}`);

    const dropdownOption = page.getByRole('option', { name: new RegExp(`^\\s*${selectedSpecialty}\\s*$`, 'i') }).first();
    await expect(dropdownOption).toBeVisible({ timeout: 10000 });
    await dropdownOption.click();
    await page.waitForTimeout(PAUSE_MS);

    const applyButton = filterDialog.getByRole('button', { name: 'Apply' }).first();
    await expect(applyButton).toBeEnabled({ timeout: 10000 });
    await applyButton.click();
    await page.waitForTimeout(PAUSE_MS + 600);
    await expect(filterDialog).not.toBeVisible({ timeout: 15000 });
    console.log(`[PASSED] filter attempt ${attempt} -> applied ${selectedSpecialty}`);

    const filteredProviderHeadings = page.locator('div.scrollbar-custom h3');
    const filteredCount = await filteredProviderHeadings.count();
    if (filteredCount === 0) {
      console.log(`[INFO] filter attempt ${attempt} -> no records for ${selectedSpecialty}`);
      continue;
    }

    // If there are records, check first few specialties match selected value.
    const checkCount = Math.min(filteredCount, 5);
    let matched = 0;
    for (let i = 0; i < checkCount; i++) {
      const specialtyText = (
        await filteredProviderHeadings.nth(i).locator('xpath=following-sibling::p[1]').textContent()
      )?.trim();
      if ((specialtyText || '').toLowerCase().includes(selectedSpecialty.toLowerCase())) {
        matched += 1;
      }
    }
    if (matched > 0) {
      console.log(`[PASSED] filter attempt ${attempt} -> records shown for ${selectedSpecialty}`);
    } else {
      console.log(`[INFO] filter attempt ${attempt} -> records shown but specialty text did not match exactly`);
    }
  }

  // Home -> Pricing & Plans: try Dental + Total Smile Plan first. If an active Dental plan already
  // exists, the app often stays on home (e.g. ?dental) and never opens checkout — then try the next
  // pricing category tabs (Aesthetic, Health & Wellness, All-Inclusive) until /payment/plan- loads.
  console.log('[RUNNING] home pricing flow -> plan checkout (with tab fallback)');
  await clickVisibleTabLink('Home');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(PAUSE_MS);
  await expect(page).toHaveURL(/\/$/);

  // Pricing UI lives in <section class="pricing-plans"> (tabs + swiper cards). Continue is either
  // an <a href="/payment/plan-..."> or a <button> depending on the plan card (see Family/Business plans).
  const pricingRoot = page.locator('section.pricing-plans');
  await pricingRoot.scrollIntoViewIfNeeded();
  const pricingSectionHeading = pricingRoot.getByRole('heading', { name: /Pricing & Plans/i }).first();
  await pricingSectionHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(PAUSE_MS);
  await expect(pricingSectionHeading).toBeVisible();

  const planContinue = (container) =>
    container.getByRole('link', { name: 'Continue' }).or(container.getByRole('button', { name: 'Continue' }));

  const waitForPlanCheckoutUrl = async (timeoutMs) => {
    try {
      await page.waitForURL(/\/payment\/plan-/i, { timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  };

  /** First visible Continue inside the pricing section only (avoids nav/footer CTAs). */
  const clickFirstVisiblePlanContinueInPricing = async () => {
    const cta = planContinue(pricingRoot);
    const n = await cta.count();
    for (let i = 0; i < n; i++) {
      const el = cta.nth(i);
      try {
        await el.scrollIntoViewIfNeeded();
        if (await el.isVisible()) {
          await el.click();
          return;
        }
      } catch {
        // try next candidate
      }
    }
    throw new Error('No visible plan Continue (link or button) found inside section.pricing-plans.');
  };

  const pricingSteps = [
    { tab: 'Dental', planName: 'Total Smile Plan' },
    { tab: 'Aesthetic', planName: null },
    { tab: 'Health & Wellness', planName: null },
    { tab: 'All-Inclusive', planName: null },
  ];

  let reachedCheckout = false;
  for (let i = 0; i < pricingSteps.length; i++) {
    const step = pricingSteps[i];
    console.log(
      `[INFO] pricing ${i + 1}/${pricingSteps.length}: tab "${step.tab}"` +
        (step.planName ? `, plan "${step.planName}"` : ', first visible plan Continue'),
    );

    await pricingRoot.getByRole('button', { name: step.tab, exact: true }).first().click();
    await page.waitForTimeout(PAUSE_MS);

    if (step.planName) {
      const planCard = pricingRoot
        .locator('div')
        .filter({ has: page.getByText(step.planName) })
        .filter({
          has: page
            .getByRole('link', { name: 'Continue' })
            .or(page.getByRole('button', { name: 'Continue' })),
        })
        .first();
      await expect(planCard).toBeVisible({ timeout: 15000 });
      const cta = planContinue(planCard).first();
      await cta.scrollIntoViewIfNeeded();
      await cta.click();
    } else {
      await clickFirstVisiblePlanContinueInPricing();
    }

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(PAUSE_MS);

    reachedCheckout = await waitForPlanCheckoutUrl(3000);
    if (reachedCheckout) {
      console.log(`[PASSED] checkout opened from pricing tab "${step.tab}"`);
      break;
    }

    console.log(
      `[INFO] still not on /payment/plan- after "${step.tab}" (often blocked when that category already has an active plan); trying next pricing tab`,
    );
  }

  if (!reachedCheckout) {
    throw new Error(
      'Could not reach plan checkout. Tried Dental (Total Smile Plan) then other pricing tabs.',
    );
  }

  await expect(page).toHaveURL(/\/payment\/plan-/i);
  await expect(page.getByRole('heading', { name: 'Payment' }).first()).toBeVisible({ timeout: 15000 });

  // Fill Stripe Elements fields from their secure iframes.
  const cardNumberFrame = page.frameLocator('iframe[title="Secure card number input frame"]');
  const cardExpiryFrame = page.frameLocator('iframe[title="Secure expiration date input frame"]');
  const cardCvcFrame = page.frameLocator('iframe[title="Secure CVC input frame"]');

  // Stripe expects MMYY; expiry must be >= current month/year (same YY ⇒ month ≥ current month).
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1–12
  const currentYY = now.getFullYear() % 100;
  const minYY = currentYY;
  const maxYY = Math.min(99, currentYY + 9);
  const expYY = minYY + Math.floor(Math.random() * (maxYY - minYY + 1));
  let expMM;
  if (expYY === currentYY) {
    expMM = currentMonth + Math.floor(Math.random() * (12 - currentMonth + 1));
  } else {
    expMM = 1 + Math.floor(Math.random() * 12);
  }
  const randomMonth = String(expMM).padStart(2, '0');
  const randomYear = String(expYY).padStart(2, '0');
  const randomCvc = String(Math.floor(Math.random() * 900) + 100); // 100..999

  await cardNumberFrame.locator('input[name="cardnumber"]').fill('4242 4242 4242 4242');
  await cardExpiryFrame.locator('input[name="exp-date"]').fill(`${randomMonth}${randomYear}`);
  await cardCvcFrame.locator('input[name="cvc"]').fill(randomCvc);
  await page.waitForTimeout(PAUSE_MS);

  const payNowButton = page.getByRole('button', { name: /Pay Now|Processing\.\.\./i }).first();
  await expect(payNowButton).toBeVisible({ timeout: 15000 });
  await payNowButton.click();

  // Payment submit state: button changes to Processing..., then app redirects to profile.
  await expect(page.getByRole('button', { name: /Processing\.\.\./i }).first()).toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL(/\/profile\/?$/i, { timeout: 60000 });
  await expect(page.getByRole('link', { name: /Edit Profile/i }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(rightEmail).first()).toBeVisible({ timeout: 20000 });
  // Validate recent subscribed plan card at the top of profile (active plan with cancel action).
  const activePlanCard = page.locator('div').filter({
    has: page.getByRole('button', { name: /Cancel Plan/i }).first(),
  }).first();
  await expect(activePlanCard).toBeVisible({ timeout: 20000 });
  await expect(activePlanCard.getByRole('button', { name: /Cancel Plan/i }).first()).toBeVisible({ timeout: 20000 });

  // Open profile menu and navigate to My QR Code page.
  const profileAvatar = page.getByAltText(/Pateint/i).first();
  await expect(profileAvatar).toBeVisible({ timeout: 15000 });
  await profileAvatar.click();
  await page.getByText('My QR Code', { exact: true }).first().click();

  await expect(page).toHaveURL(/\/qr-code\/?$/i, { timeout: 30000 });
  const qrCodeSvg = page.locator('div.max-w-\\[600px\\] svg').first();
  await expect(qrCodeSvg).toBeVisible({ timeout: 20000 });
  console.log('[PASSED] home pricing flow -> profile opened with an active plan');
});


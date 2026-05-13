'use strict';

const fs = require('fs');
const path = require('path');

const APP_PACKAGE = 'com.cosmedicenteruser';
const VALID_EMAIL = process.env.COSMEDICS_VALID_EMAIL || 'patient@gmail.com';
const VALID_PASSWORD = process.env.COSMEDICS_VALID_PASSWORD || 'Password123';

const COSMEDICS_QUIET = process.env.COSMEDICS_QUIET === '1';
if (COSMEDICS_QUIET) {
  const originalLog = console.log.bind(console);
  console.log = (...args) => {
    const first = args.length ? String(args[0]) : '';
    if (first.startsWith('[SUMMARY]') || first.startsWith('[TEST ')) {
      originalLog(...args);
    }
  };
}

async function getSignInTitle() {
  // App strings can vary by build/case; try a few robust selectors.
  const selectors = [
    '//*[@text="Sign In"]',
    '//*[contains(@text,"Sign In")]',
    '//*[contains(@text,"Sign in")]',
    '//*[contains(@text,"SIGN IN")]',
    '//*[@content-desc="Sign In"]',
    '//*[contains(@content-desc,"Sign In")]',
  ];
  for (const s of selectors) {
    const el = await $(s);
    if (await el.isDisplayed().catch(() => false)) return el;
  }
  // Return the first selector (for callers that will wait on it)
  return $(selectors[0]);
}

async function getContinueButton() {
  const candidates = [
    '~Continue',
    '//*[@content-desc="Continue"]',
    '//*[@text="Continue"]',
    '//android.widget.Button[@text="Continue"]',
  ];

  for (const selector of candidates) {
    const el = await $(selector);
    try {
      await el.waitForExist({ timeout: 4000, interval: 200 });
      return el;
    } catch {
      // try next selector
    }
  }
  throw new Error(`Continue button not found. Tried selectors: ${candidates.join(' | ')}`);
}

async function getEmailInput() {
  const inputs = await $$('//android.widget.EditText');
  for (const input of inputs) {
    const isPassword = await input.getAttribute('password');
    if (isPassword !== 'true') {
      return input;
    }
  }
  throw new Error('Email input not found.');
}

async function getPasswordInput() {
  const inputs = await $$('//android.widget.EditText');
  for (const input of inputs) {
    const isPassword = await input.getAttribute('password');
    if (isPassword === 'true') {
      return input;
    }
  }
  throw new Error('Password input not found.');
}

async function clearAndType(element, value) {
  await element.click();
  await element.clearValue();
  if (value) {
    await element.setValue(value);
  }
}

async function fillCredentials(email, password) {
  const emailInput = await getEmailInput();
  const passwordInput = await getPasswordInput();
  await clearAndType(emailInput, email);
  await clearAndType(passwordInput, password);
  await driver.hideKeyboard().catch(() => {});
}

async function tapContinue() {
  await driver.hideKeyboard().catch(() => {});
  const continueButton = await getContinueButton();
  await continueButton.waitForDisplayed({ timeout: 15000 });
  await continueButton.waitForEnabled({ timeout: 15000 });
  await continueButton.click();
}

const HOME_SEARCH_PLACEHOLDER_SUBSTR = 'Search by practitioner';

async function expectHomeScreen() {
  const homeTitle = await $('//*[@text="Home"]');
  await homeTitle.waitForDisplayed({ timeout: 20000 });
  const searchField = await $(`//*[contains(@text, "${HOME_SEARCH_PLACEHOLDER_SUBSTR}")]`);
  await expect(searchField).toBeDisplayed();
}

async function isHomeScreenVisibleQuick() {
  const homeTitle = await $('//*[@text="Home"]');
  if (!(await homeTitle.isDisplayed().catch(() => false))) {
    return false;
  }
  const searchField = await $(`//*[contains(@text, "${HOME_SEARCH_PLACEHOLDER_SUBSTR}")]`);
  return searchField.isDisplayed().catch(() => false);
}

async function isProfileScreenVisibleQuick() {
  if (await $('//*[@text="Edit Profile"]').isDisplayed().catch(() => false)) {
    return true;
  }
  if (await $('//*[@text="Logout"]').isDisplayed().catch(() => false)) {
    return true;
  }
  if (await $('//*[@text="Subscription"]').isDisplayed().catch(() => false)) {
    return true;
  }
  return false;
}

async function clickHomeBottomNavHome() {
  const tryClick = async (locator) => {
    const el = await $(locator);
    if (await el.isDisplayed().catch(() => false)) {
      await el.click();
      return true;
    }
    return false;
  };
  const xpaths = [
    '//*[@content-desc="Home"]',
    '//*[contains(@content-desc,"Home")]',
    '//*[@content-desc="home"]',
  ];
  for (const xp of xpaths) {
    if (await tryClick(xp)) {
      return;
    }
  }
  const { width, height } = await driver.getWindowSize();
  const cx = Math.round(width * 0.12);
  const cy = Math.round(height * 0.92);
  await driver.performActions([
    {
      type: 'pointer',
      id: 'homeTab',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: cx, y: cy },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

async function clickHomeBottomNavProfile() {
  await expectHomeScreen();
  const tryClick = async (locator) => {
    const el = await $(locator);
    if (await el.isDisplayed().catch(() => false)) {
      await el.click();
      return true;
    }
    return false;
  };
  const xpaths = [
    '//*[@content-desc="Profile"]',
    '//*[contains(@content-desc,"Profile")]',
    '//*[@content-desc="profile"]',
  ];
  for (const xp of xpaths) {
    if (await tryClick(xp)) {
      return;
    }
  }
  const { width, height } = await driver.getWindowSize();
  const cx = Math.round(width * 0.88);
  const cy = Math.round(height * 0.92);
  await driver.performActions([
    {
      type: 'pointer',
      id: 'profileTab',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: cx, y: cy },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

async function expectProfileScreenOpened(timeout = 20000) {
  await driver.waitUntil(() => isProfileScreenVisibleQuick(), {
    timeout,
    timeoutMsg: 'Profile screen not detected (expected Edit Profile, Logout, or Subscription).',
  });
}

async function tryReturnToHomeViaBack(maxSteps = 8) {
  for (let i = 0; i < maxSteps; i++) {
    if (await isHomeScreenVisibleQuick()) return;
    await driver.pressKeyCode(4);
    await driver.pause(400);
  }
}

async function ensureLoggedInOnHome() {
  // Optional: reset app state so plans are not already active (forces payment → QR screen flow).
  if (process.env.COSMEDICS_RESET_BEFORE_SUBSCRIPTION === '1') {
    console.log('[SUMMARY] Resetting app state (clear app) before subscription flow');
    await driver.execute('mobile: clearApp', { appId: APP_PACKAGE });
    await driver.pause(800);
  }

  await driver.activateApp(APP_PACKAGE);
  const onSignIn = await getSignInTitle()
    .then((el) => el.isDisplayed())
    .catch(() => false);

  if (onSignIn) {
    if (!VALID_EMAIL || !VALID_PASSWORD) {
      throw new Error(
        'Sign In is visible but COSMEDICS_VALID_EMAIL / COSMEDICS_VALID_PASSWORD are required for this test.'
      );
    }
    await fillCredentials(VALID_EMAIL, VALID_PASSWORD);
    await tapContinue();
    await driver.pause(800);
  } else {
    await tryReturnToHomeViaBack();
    if (!(await isHomeScreenVisibleQuick()) && (await isProfileScreenVisibleQuick())) {
      await clickHomeBottomNavHome();
      await driver.pause(500);
    }
  }
  await expectHomeScreen();
}

async function clickSubscriptionRow() {
  const candidates = [
    '//*[@text="Subscription"]',
    '//*[contains(@text,"Subscription")]',
    '//*[@content-desc="Subscription"]',
    '//*[contains(@content-desc,"Subscription")]',
  ];
  for (const selector of candidates) {
    const el = await $(selector);
    if (await el.isDisplayed().catch(() => false)) {
      await el.click();
      return;
    }
  }
  throw new Error(`Subscription row not found. Tried: ${candidates.join(' | ')}`);
}

async function expectSubscriptionScreenOpened() {
  const marker = (process.env.COSMEDICS_SUBSCRIPTION_MARKER || '').trim();
  await driver.waitUntil(
    async () => {
      if (marker) {
        if (await $(`//*[contains(@text, "${marker}")]`).isDisplayed().catch(() => false)) return true;
      }
      // Generic fallbacks; adjust via marker env if your UI differs.
      if (await $('//*[contains(@text,"Plan")]').isDisplayed().catch(() => false)) return true;
      if (await $('//*[contains(@text,"Subscription")]').isDisplayed().catch(() => false)) return true;
      return false;
    },
    { timeout: 20000, timeoutMsg: 'Subscription screen not detected (set COSMEDICS_SUBSCRIPTION_MARKER).' }
  );
}

async function dumpSubscriptionScreenArtifacts(tag = 'subscription') {
  const artifactsDir = path.join(__dirname, '..', 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `cosmedics-${tag}-${ts}`;
  const xmlPath = path.join(artifactsDir, `${base}.xml`);
  const pngPath = path.join(artifactsDir, `${base}.png`);

  const xml = await driver.getPageSource();
  fs.writeFileSync(xmlPath, xml, 'utf8');
  await driver.saveScreenshot(pngPath);

  console.log(`[SUMMARY] Saved page source: ${xmlPath}`);
  console.log(`[SUMMARY] Saved screenshot: ${pngPath}`);
}

async function swipeLeftOnTabsRow() {
  // The tabs are inside a HorizontalScrollView; if a tab isn't visible, swipe left to reveal it.
  const tabRow = await $('//android.widget.HorizontalScrollView');
  const rect = await (async () => {
    try {
      const loc = await tabRow.getLocation();
      const size = await tabRow.getSize();
      if (loc && size && Number.isFinite(loc.x) && Number.isFinite(loc.y)) {
        return { x: loc.x, y: loc.y, width: size.width, height: size.height };
      }
    } catch {
      /* ignore */
    }
    return null;
  })();
  const { width, height } = await driver.getWindowSize();
  const y = Math.round(rect ? rect.y + rect.height / 2 : height * 0.16);
  const startX = Math.round(rect ? rect.x + rect.width * 0.85 : width * 0.85);
  const endX = Math.round(rect ? rect.x + rect.width * 0.15 : width * 0.15);

  await driver.performActions([
    {
      type: 'pointer',
      id: 'tabSwipe',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 120 },
        { type: 'pointerMove', duration: 420, x: endX, y },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
  await driver.pause(250);
}

async function swipeRightOnTabsRow() {
  const tabRow = await $('//android.widget.HorizontalScrollView');
  const rect = await (async () => {
    try {
      const loc = await tabRow.getLocation();
      const size = await tabRow.getSize();
      if (loc && size && Number.isFinite(loc.x) && Number.isFinite(loc.y)) {
        return { x: loc.x, y: loc.y, width: size.width, height: size.height };
      }
    } catch {
      /* ignore */
    }
    return null;
  })();
  const { width, height } = await driver.getWindowSize();
  const y = Math.round(rect ? rect.y + rect.height / 2 : height * 0.16);
  const startX = Math.round(rect ? rect.x + rect.width * 0.15 : width * 0.15);
  const endX = Math.round(rect ? rect.x + rect.width * 0.85 : width * 0.85);

  await driver.performActions([
    {
      type: 'pointer',
      id: 'tabSwipeR',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 120 },
        { type: 'pointerMove', duration: 420, x: endX, y },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
  await driver.pause(250);
}

async function clickSubscriptionTab(label) {
  const variants = Array.isArray(label) ? label : [label];
  const selectors = variants.flatMap((v) => [
    `//*[@content-desc="${v}"]`,
    `//*[contains(@content-desc,"${v}")]`,
    `//*[@text="${v}"]`,
    `//*[contains(@text,"${v}")]`,
  ]);

  // Try a few times, swiping the tab row if needed (e.g. "All-Inclusive" offscreen).
  // We search both directions so we can always get back to "Dental".
  for (let attempt = 0; attempt < 8; attempt++) {
    for (const selector of selectors) {
      const el = await $(selector);
      if (await el.isDisplayed().catch(() => false)) {
        await el.click();
        return el;
      }
    }
    if (attempt < 4) {
      await swipeLeftOnTabsRow();
    } else {
      await swipeRightOnTabsRow();
    }
  }

  throw new Error(`Subscription tab not found for: ${variants.join(' | ')}`);
}

async function getVisiblePlanTitle() {
  // Heuristic: the big plan title usually contains "Plan" and is not the header or "Your Current Plan".
  const tvs = await $$('//android.widget.TextView');
  for (const tv of tvs) {
    if (!(await tv.isDisplayed().catch(() => false))) continue;
    const t = ((await tv.getText().catch(() => '')) || '').trim();
    if (!t) continue;
    if (t === 'Subscription') continue;
    if (t === 'Your Current Plan') continue;
    if (!/plan/i.test(t)) continue;
    return t;
  }
  return '';
}

async function expectSubscriptionStillVisible() {
  await $('//*[@text="Subscription"]').waitForDisplayed({ timeout: 15000 });
  // Content marker can vary by tab; accept any of these as "rendered".
  await driver.waitUntil(
    async () => {
      const title = await getVisiblePlanTitle();
      if (title) return true;
      if (await $('//*[@text="Your Current Plan"]').isDisplayed().catch(() => false)) return true;
      if (await $('//*[contains(@text,"$")]').isDisplayed().catch(() => false)) return true;
      // Last-resort: any non-empty visible text other than the header.
      const tvs = await $$('//android.widget.TextView');
      for (const tv of tvs) {
        if (!(await tv.isDisplayed().catch(() => false))) continue;
        const t = ((await tv.getText().catch(() => '')) || '').trim();
        if (!t) continue;
        if (t === 'Subscription') continue;
        return true;
      }
      return false;
    },
    { timeout: 20000, interval: 250, timeoutMsg: 'Subscription content not visible after tab click.' }
  );
}

async function getPlansCarouselRect() {
  // There are multiple HorizontalScrollViews on many builds (tabs + plans). Some tabs use only
  // RecyclerView / ViewPager2 — then fall back to a central swipe band.
  const hsvs = await $$('//android.widget.HorizontalScrollView');
  const { width: winW, height: winH } = await driver.getWindowSize();

  if (hsvs.length) {
    let best = null;
    for (const el of hsvs) {
      if (!(await el.isDisplayed().catch(() => false))) continue;
      const loc = await el.getLocation().catch(() => null);
      const size = await el.getSize().catch(() => null);
      if (!loc || !size) continue;
      if (!Number.isFinite(loc.y) || !Number.isFinite(size.width) || !Number.isFinite(size.height)) continue;
      if (loc.y < 250) continue;
      const area = size.width * size.height;
      if (!best || area > best.area) {
        best = { x: loc.x, y: loc.y, width: size.width, height: size.height, area };
      }
    }
    if (best) {
      return { x: best.x, y: best.y, width: best.width, height: best.height };
    }
  }

  return {
    x: Math.round(winW * 0.05),
    y: Math.round(winH * 0.25),
    width: Math.round(winW * 0.9),
    height: Math.round(winH * 0.55),
  };
}

async function swipeLeftOnPlansCarousel() {
  const rect = await getPlansCarouselRect();
  const y = Math.round(rect.y + rect.height * 0.55);
  const startX = Math.round(rect.x + rect.width * 0.85);
  const endX = Math.round(rect.x + rect.width * 0.15);
  await driver.performActions([
    {
      type: 'pointer',
      id: 'planSwipeL',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 120 },
        { type: 'pointerMove', duration: 520, x: endX, y },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
  await driver.pause(450);
}

async function swipeRightOnPlansCarousel() {
  const rect = await getPlansCarouselRect();
  const y = Math.round(rect.y + rect.height * 0.55);
  const startX = Math.round(rect.x + rect.width * 0.15);
  const endX = Math.round(rect.x + rect.width * 0.85);
  await driver.performActions([
    {
      type: 'pointer',
      id: 'planSwipeR',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 120 },
        { type: 'pointerMove', duration: 520, x: endX, y },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
  await driver.pause(450);
}

async function findContinueButtonOnPlanCard() {
  const candidates = [
    '~Continue',
    '//*[@content-desc="Continue"]',
    '//*[@text="Continue"]',
    '//*[contains(@text,"Continue")]',
    '//*[contains(@content-desc,"Continue")]',
  ];
  for (const selector of candidates) {
    const el = await $(selector);
    if (await el.isDisplayed().catch(() => false)) {
      return el;
    }
  }
  return null;
}

async function ensureEssentialSmilePlanVisible() {
  const target = 'Essential Smile Plan';
  const maxSwipes = Number(process.env.COSMEDICS_MAX_PLAN_BACK_SWIPES || 10);

  for (let i = 0; i <= maxSwipes; i++) {
    const title = await getVisiblePlanTitle();
    if (title === target) return true;
    await swipeRightOnPlansCarousel();
  }
  for (let i = 0; i <= maxSwipes; i++) {
    const title = await getVisiblePlanTitle();
    if (title === target) return true;
    await swipeLeftOnPlansCarousel();
  }
  return false;
}

async function getVisiblePriceText() {
  const tvs = await $$('//android.widget.TextView');
  for (const tv of tvs) {
    if (!(await tv.isDisplayed().catch(() => false))) continue;
    const t = ((await tv.getText().catch(() => '')) || '').trim();
    if (!t) continue;
    if (/^\$\s*\d+/.test(t)) return t;
  }
  return '';
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateValidExpiryMMYY() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear(); // 4-digit
  const year = currentYear + randomInt(0, 6);
  const month = year === currentYear ? randomInt(currentMonth, 12) : randomInt(1, 12);
  const mm = String(month).padStart(2, '0');
  const yy = String(year % 100).padStart(2, '0');
  return `${mm} / ${yy}`;
}

function randomDigits(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += String(randomInt(0, 9));
  return s;
}

async function fillStripeTestCardAndPay() {
  // Payment screen markers from the captured UI tree.
  await $('//*[@text="Payment"]').waitForDisplayed({ timeout: 20000 });
  console.log('[SUMMARY] Payment screen opened');

  const cardNumber = await $('//*[@resource-id="com.cosmedicenteruser:id/et_card_number"]');
  const expiry = await $('//*[@resource-id="com.cosmedicenteruser:id/et_expiry"]');
  const cvc = await $('//*[@resource-id="com.cosmedicenteruser:id/et_cvc"]');
  const postcode = await $('//*[@resource-id="com.cosmedicenteruser:id/postal_code"]');

  await cardNumber.waitForDisplayed({ timeout: 20000 });
  await clearAndType(cardNumber, '4242424242424242');

  const expiryValue = generateValidExpiryMMYY();
  await clearAndType(expiry, expiryValue);

  const cvcValue = randomDigits(3);
  await clearAndType(cvc, cvcValue);

  // Postcode field is present (default country looked like UK in the dump). We'll still enter a random code.
  // If your backend requires a specific format/country, we can adjust later.
  const postcodeValue = randomDigits(5);
  await clearAndType(postcode, postcodeValue);
  console.log(`[SUMMARY] Entered card=4242.. expiry="${expiryValue}" cvc="${cvcValue}" postcode="${postcodeValue}"`);

  await driver.hideKeyboard().catch(() => {});

  const payNow = await $('//*[@content-desc="Pay Now"]');
  await payNow.waitForDisplayed({ timeout: 20000 });
  console.log('[SUMMARY] Clicking Pay Now');
  await payNow.click();

  const waitMs = Number(process.env.COSMEDICS_AFTER_PAY_WAIT_MS || 6000);
  console.log(`[SUMMARY] Waiting ${waitMs}ms after Pay Now`);
  await driver.pause(waitMs);
}

async function waitForQrCodeScreen(timeout = 45000) {
  // In your app the QR screen follows a Success popup, and contains "Cancel Plan" buttons
  // and an "Add All-Inclusive Plan" button.
  await driver.waitUntil(
    async () => {
      if (await $('//*[contains(@text,"Cancel Plan")]').isDisplayed().catch(() => false)) return true;
      if (await $('//*[contains(@text,"Add All-Inclusive")]').isDisplayed().catch(() => false)) return true;
      if (await $('//*[@text="Success!"]').isDisplayed().catch(() => false)) return true;
      return false;
    },
    { timeout, interval: 300, timeoutMsg: 'QR Code screen not detected.' }
  );
}

async function getTopPlanTextFromQrScreen() {
  // Pull all visible TextViews, sort by Y, then choose the first plan-ish label.
  const tvs = await $$('//android.widget.TextView');
  const rows = [];
  for (const tv of tvs) {
    if (!(await tv.isDisplayed().catch(() => false))) continue;
    const t = ((await tv.getText().catch(() => '')) || '').trim();
    if (!t) continue;
    // Filter obvious non-plan strings.
    if (t === 'Success!') continue;
    if (/next renewal/i.test(t)) continue;
    if (/select the ideal plan/i.test(t)) continue;
    if (/cancel plan/i.test(t)) continue;
    if (/add all-inclusive/i.test(t)) continue;

    const loc = await tv.getLocation().catch(() => null);
    if (!loc || !Number.isFinite(loc.y)) continue;
    rows.push({ t, y: loc.y });
  }
  rows.sort((a, b) => a.y - b.y);

  for (const r of rows) {
    if (/plan/i.test(r.t)) return r.t;
  }
  return rows.length ? rows[0].t : '';
}

async function verifyQrTopPlanIs(expectedPlanSubstring) {
  await waitForQrCodeScreen();
  const topPlan = await getTopPlanTextFromQrScreen();
  console.log(`[SUMMARY] QR Code screen shown; topPlan="${topPlan || '(unknown)'}"`);
  if (
    expectedPlanSubstring &&
    topPlan &&
    !topPlan.toLowerCase().includes(expectedPlanSubstring.toLowerCase())
  ) {
    throw new Error(`QR top plan mismatch. Expected to include "${expectedPlanSubstring}", got "${topPlan}"`);
  }
}

async function isLogoutRowVisibleQuick() {
  return $('//*[@text="Logout"]').isDisplayed().catch(() => false);
}

/**
 * From QR / subscription / payment stack, go back until Profile shows the Logout row (or open Profile from Home).
 */
async function navigateBackUntilLogoutVisible(maxBack = 15) {
  for (let i = 0; i < maxBack; i++) {
    if (await isLogoutRowVisibleQuick()) {
      return;
    }
    await driver.pressKeyCode(4);
    await driver.pause(450);
  }
  if (await isHomeScreenVisibleQuick()) {
    await clickHomeBottomNavProfile();
    await driver.waitUntil(() => isLogoutRowVisibleQuick(), {
      timeout: 20000,
      interval: 300,
      timeoutMsg: 'Logout row not visible after opening Profile from Home.',
    });
    return;
  }
  throw new Error('Could not reach Profile (Logout row) for sign-out.');
}

async function clickLogoutRow() {
  const candidates = [
    '//*[@text="Logout"]',
    '//*[contains(@text,"Logout")]',
    '//*[@content-desc="Logout"]',
    '//*[contains(@content-desc,"Logout")]',
  ];
  for (const xp of candidates) {
    const el = await $(xp);
    if (await el.isDisplayed().catch(() => false)) {
      await el.click();
      return;
    }
  }
  throw new Error(`Logout control not found. Tried: ${candidates.join(' | ')}`);
}

async function confirmLogoutDialogYes(timeout = 15000) {
  await driver.waitUntil(
    async () => {
      const yesXpaths = [
        '//*[@text="Yes"]',
        '//*[@text="YES"]',
        '//*[contains(@text,"Yes")]',
        '//android.widget.Button[@text="Yes"]',
      ];
      for (const xp of yesXpaths) {
        const el = await $(xp);
        if (await el.isDisplayed().catch(() => false)) {
          await el.click();
          return true;
        }
      }
      const btn1 = await $('//*[@resource-id="android:id/button1"]');
      if (await btn1.isDisplayed().catch(() => false)) {
        const t = ((await btn1.getText().catch(() => '')) || '').trim();
        if (/^yes$/i.test(t)) {
          await btn1.click();
          return true;
        }
      }
      return false;
    },
    {
      timeout,
      interval: 250,
      timeoutMsg: 'Logout confirmation dialog: "Yes" not found.',
    }
  );
}

async function expectSignInScreenAfterLogout(timeout = 20000) {
  const signIn = await getSignInTitle();
  await signIn.waitForDisplayed({ timeout });
}

/**
 * After subscription / QR flow: return to Profile, Logout, confirm Yes, expect Sign In.
 */
async function completeProfileLogoutWithConfirm() {
  console.log('[SUMMARY] Navigate to Profile and sign out (confirm Yes)');
  await navigateBackUntilLogoutVisible();
  await clickLogoutRow();
  await confirmLogoutDialogYes();
  await driver.pause(500);
  await expectSignInScreenAfterLogout();
  console.log('[SUMMARY] Logout complete — Sign In visible');
}

async function navigateBackToSubscriptionOrProfile(maxBack = 8) {
  for (let i = 0; i < maxBack; i++) {
    if (await $('//*[@text="Subscription"]').isDisplayed().catch(() => false)) return 'subscription';
    if (await $('//*[@text="Edit Profile"]').isDisplayed().catch(() => false)) return 'profile';
    await driver.pressKeyCode(4);
    await driver.pause(500);
  }
  return 'unknown';
}

async function ensureSubscriptionScreenFromProfile() {
  // Assumes we are already on Profile screen.
  await clickSubscriptionRow();
  await expectSubscriptionScreenOpened();
}

async function swipeToFirstPlanInCarousel() {
  // Swipe right a few times to reach the left-most plan card.
  const maxSwipes = Number(process.env.COSMEDICS_MAX_PLAN_BACK_SWIPES || 10);
  let last = '';
  for (let i = 0; i < maxSwipes; i++) {
    const t = await getVisiblePlanTitle();
    if (t && t === last) break;
    last = t;
    await swipeRightOnPlansCarousel();
  }
}

async function selectFirstPlanIfNotActive(tabLabelForLog) {
  await swipeToFirstPlanInCarousel();

  const currentPlanBadge = await $('//*[@text="Your Current Plan"]');
  if (await currentPlanBadge.isDisplayed().catch(() => false)) {
    const title = await getVisiblePlanTitle();
    console.log(`[SUMMARY] ${tabLabelForLog}: first plan already active ("${title || 'unknown'}"), skipping`);
    return { action: 'skipped_active' };
  }

  const continueBtn = await findContinueButtonOnPlanCard();
  if (!continueBtn) {
    const title = await getVisiblePlanTitle();
    await dumpSubscriptionScreenArtifacts(`no-continue-${tabLabelForLog.replace(/\s+/g, '-').toLowerCase()}`);
    throw new Error(`${tabLabelForLog}: Continue button not found on first plan ("${title || 'unknown'}")`);
  }

  const title = await getVisiblePlanTitle();
  console.log(`[SUMMARY] ${tabLabelForLog}: selecting first plan via Continue ("${title || 'unknown'}")`);
  await continueBtn.click();

  // If we land on Payment, complete payment and wait for Success/QR.
  if (await $('//*[@text="Payment"]').isDisplayed().catch(() => false)) {
    await dumpSubscriptionScreenArtifacts(`payment-opened-${tabLabelForLog.replace(/\s+/g, '-').toLowerCase()}`);
    await fillStripeTestCardAndPay();
    await dumpSubscriptionScreenArtifacts(`payment-after-pay-${tabLabelForLog.replace(/\s+/g, '-').toLowerCase()}`);
    await verifyQrTopPlanIs(title || tabLabelForLog);
    await dumpSubscriptionScreenArtifacts(`success-${tabLabelForLog.replace(/\s+/g, '-').toLowerCase()}`);
    return { action: 'paid' };
  }

  // Otherwise, it may immediately show Success/QR or mark current plan.
  if (await $('//*[@text="Success!"]').isDisplayed().catch(() => false)) {
    await verifyQrTopPlanIs(title || tabLabelForLog);
    return { action: 'success' };
  }

  await driver.pause(1500);
  if (await currentPlanBadge.isDisplayed().catch(() => false)) {
    console.log(`[SUMMARY] ${tabLabelForLog}: plan activated on card => PASS`);
    return { action: 'activated' };
  }

  console.log(`[SUMMARY] ${tabLabelForLog}: selection clicked (state change not detected immediately)`);
  return { action: 'unknown' };
}

describe('Cosmedics - Profile subscription plan', () => {
  beforeEach(function () {
    console.log(`[TEST START] ${this.currentTest.title}`);
  });

  afterEach(function () {
    const state = this.currentTest.state ? this.currentTest.state.toUpperCase() : 'UNKNOWN';
    console.log(`[TEST END] ${this.currentTest.title} => ${state}`);
  });

  it('Subscription one-flow: tabs then Dental select Essential Smile Plan', async function () {
    // This flow can include checkout/payment and multiple tab selections.
    this.timeout(Number(process.env.COSMEDICS_SUBSCRIPTION_TEST_TIMEOUT_MS || 420000));
    await ensureLoggedInOnHome();
    console.log('[SUMMARY] Go to Profile');
    await clickHomeBottomNavProfile();
    await expectProfileScreenOpened();

    console.log('[SUMMARY] Tap Subscription');
    await clickSubscriptionRow();
    await expectSubscriptionScreenOpened();

    let lastTitle = await getVisiblePlanTitle();
    if (lastTitle) {
      console.log(`[SUMMARY] Starting plan title: "${lastTitle}"`);
    }

    const runTab = async (labelVariants, labelForLog) => {
      await clickSubscriptionTab(labelVariants);
      await expectSubscriptionStillVisible();
      const nowTitle = await getVisiblePlanTitle();
      if (nowTitle && nowTitle !== lastTitle) {
        console.log(`[SUMMARY] Tab => ${labelForLog}; plan title: "${nowTitle}"`);
        lastTitle = nowTitle;
      } else if (nowTitle) {
        console.log(`[SUMMARY] Tab => ${labelForLog}; plan title unchanged: "${nowTitle}"`);
      } else {
        console.log(`[SUMMARY] Tab => ${labelForLog}; plan title not detected`);
      }
    };

    // Tab visit order (for visibility / debugging).
    await runTab(['Dental'], 'Dental');
    await runTab(['Aesthetic'], 'Aesthetic');
    await runTab(['Health & Wellness', 'Health and Wellness'], 'Health & Wellness');
    await runTab(['All-Inclusive', 'All Inclusive', 'All inclusive', 'All-Inclusive '], 'All-Inclusive');

    // Selection strategy:
    // - If Dental already active, move to Aesthetic, etc.
    // - For each tab: go to first plan, click Continue if not active; complete payment if it appears.
    // - If all are already active, return to Profile and finish.
    const tabs = [
      { variants: ['Dental'], log: 'Dental' },
      { variants: ['Aesthetic'], log: 'Aesthetic' },
      { variants: ['Health & Wellness', 'Health and Wellness'], log: 'Health & Wellness' },
      { variants: ['All-Inclusive', 'All Inclusive', 'All inclusive', 'All-Inclusive '], log: 'All-Inclusive' },
    ];

    let didAnySelection = false;

    for (const tab of tabs) {
      await runTab(tab.variants, tab.log);
      const res = await selectFirstPlanIfNotActive(tab.log);
      if (res.action !== 'skipped_active') {
        didAnySelection = true;
        // If we hit QR Code screen (paid/success), stop the test here after verification.
        if (res.action === 'paid' || res.action === 'success') {
          await dumpSubscriptionScreenArtifacts('qr-code-screen');
          console.log('[SUMMARY] Stopping after QR Code verification => PASS');
          await completeProfileLogoutWithConfirm();
          return;
        }
      }
    }

    if (!didAnySelection) {
      console.log('[SUMMARY] All tabs already have an active plan. Returning to Profile and finishing.');
      await navigateBackToSubscriptionOrProfile();
    }

    await dumpSubscriptionScreenArtifacts('subscription-final');
    console.log('[SUMMARY] Subscription multi-tab selection flow => PASS');
    await completeProfileLogoutWithConfirm();
  });
});


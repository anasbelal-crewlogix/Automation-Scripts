
'use strict';

const APP_PACKAGE = 'com.cosmedicenteruser';
const VALID_EMAIL = process.env.COSMEDICS_VALID_EMAIL || 'patient@gmail.com';
const VALID_PASSWORD = process.env.COSMEDICS_VALID_PASSWORD || 'Password123';
const WRONG_EMAIL = 'wrong_email@example.com';
const WRONG_PASSWORD = 'WrongPassword123!';

const COSMEDICS_QUIET = process.env.COSMEDICS_QUIET === '1';
if (COSMEDICS_QUIET) {
  const originalLog = console.log.bind(console);
  console.log = (...args) => {
    const first = args.length ? String(args[0]) : '';
    if (
      first.startsWith('[SUMMARY]') ||
      first.startsWith('[TEST ') ||
      first.startsWith('[INFO]') ||
      first.startsWith('[WARN]') ||
      first.startsWith('[ERROR]')
    ) {
      originalLog(...args);
    }
  };
}

async function getSignInTitle() {
  return $('//*[@text="Sign In"]');
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

  const currentPackage = await driver.getCurrentPackage().catch(() => '(unknown)');
  const currentActivity = await driver.getCurrentActivity().catch(() => '(unknown)');
  throw new Error(
    `Continue button not found. Current app: ${currentPackage}, activity: ${currentActivity}. ` +
      `Tried selectors: ${candidates.join(' | ')}`
  );
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
  // Soft keyboards can cover the Continue button; dismiss to stabilize visibility/clickability.
  try {
    await driver.hideKeyboard();
  } catch {
    // ignore if keyboard isn't shown or driver doesn't support it
  }
}

async function expectOnSignInScreen() {
  const title = await getSignInTitle();
  await expect(title).toBeDisplayed();
}

/** When `noReset` is true, a prior login can leave the app on Home; Sign In tests need a clean auth state. */
async function ensureSignInScreenForSignInDescribe() {
  await driver.activateApp(APP_PACKAGE);
  const onSignIn = await getSignInTitle()
    .then((el) => el.isDisplayed())
    .catch(() => false);
  if (onSignIn) {
    return;
  }
  await driver.execute('mobile: clearApp', { appId: APP_PACKAGE });
  await driver.pause(600);
  await driver.activateApp(APP_PACKAGE);
}

async function tapContinue() {
  try {
    await driver.hideKeyboard();
  } catch {
    // ignore
  }
  const continueButton = await getContinueButton();
  await expect(continueButton).toBeDisplayed();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
}

async function expectLeftSignInScreen() {
  const signInTitle = await getSignInTitle();
  await signInTitle.waitForDisplayed({ reverse: true, timeout: 15000 });
  await expect(signInTitle).not.toBeDisplayed();
}

const HOME_SEARCH_PLACEHOLDER_SUBSTR = 'Search by practitioner';
/** Title on the location picker (see Cosmedics UI). */
const LOCATION_SCREEN_TITLE = 'Enter your location';
/** Placeholder on the white popup when tapping the search row (manual entry). Override with COSMEDICS_LOCATION_MANUAL_HINT if the app string differs. */
const LOCATION_MANUAL_ENTRY_HINT =
  (process.env.COSMEDICS_LOCATION_MANUAL_HINT || 'Location').trim() || 'Location';

/** Typed into the manual popup; override with COSMEDICS_MANUAL_LOCATION_QUERIES=comma,separated */
const DEFAULT_MANUAL_LOCATION_SEARCH_QUERIES = [
  'District of Columbia, USA',
  'Los Angeles, CA, USA',
  'New Jersey, USA',
  'San Diego, CA, USA',
];

function getManualLocationSearchQueries() {
  const fromEnv = (process.env.COSMEDICS_MANUAL_LOCATION_QUERIES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : [...DEFAULT_MANUAL_LOCATION_SEARCH_QUERIES];
}

function pickRandomManualLocationQuery(excludeQuery) {
  const list = getManualLocationSearchQueries();
  if (list.length <= 1) {
    return list[0] || '';
  }
  const filtered = excludeQuery ? list.filter((q) => q !== excludeQuery) : list;
  const pool = filtered.length ? filtered : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function mainLocationBarMatchesManualChoice(mainBarText, chosenSuggestion) {
  const a = mainBarText.toLowerCase().replace(/\s+/g, ' ').trim();
  const b = chosenSuggestion.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!a.length || !b.length) {
    return false;
  }
  return a.includes(b) || b.includes(a);
}

async function getHomeLocationLine() {
  // This row is UI-variant across builds; try a few stable patterns.
  const candidates = [
    '//*[@content-desc="Enter your location"]',
    `//*[contains(@text, "${LOCATION_SCREEN_TITLE}")]`,
    // Common pattern: a tappable row near the Home title / search area.
    '//android.widget.TextView[@text="Home"]/following-sibling::*[1]',
    '//android.widget.TextView[@text="Home"]/following-sibling::android.view.View[1]',
    `//*[contains(@text, "${HOME_SEARCH_PLACEHOLDER_SUBSTR}")]/preceding::*[1]`,
  ];

  for (const selector of candidates) {
    const el = await $(selector);
    if (await el.isDisplayed().catch(() => false)) {
      return el;
    }
  }

  // Last resort: return first match that exists (even if off-screen) so caller can wait/scroll/tap.
  for (const selector of candidates) {
    const el = await $(selector);
    if (await el.isExisting().catch(() => false)) {
      return el;
    }
  }

  throw new Error(`Home location row not found. Tried: ${candidates.join(' | ')}`);
}

async function getElementRect(el) {
  if (typeof el.getRect === 'function') {
    return el.getRect();
  }
  const loc = await el.getLocation();
  const size = await el.getSize();
  return { x: loc.x, y: loc.y, width: size.width, height: size.height };
}

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
  return false;
}

async function isEnterYourLocationVisibleQuick() {
  return $(`//*[@text="${LOCATION_SCREEN_TITLE}"]`).isDisplayed().catch(() => false);
}

/** Bottom nav: Home / dashboard (left). Used when back from location wrongly lands on Profile. */
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
  try {
    const ui = await $('android=new UiSelector().clickable(true).descriptionContains("Home")');
    if (await ui.isDisplayed().catch(() => false)) {
      await ui.click();
      return;
    }
  } catch {
    /* optional */
  }
  console.log('[LOCATION] Home tab not found by content-desc; tapping lower-left nav area (above system bar).');
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

async function tapToolbarBackRegionStaged() {
  const { width, height } = await driver.getWindowSize();
  const fractions = [
    [0.07, 0.068],
    [0.11, 0.068],
    [0.055, 0.095],
    [0.1, 0.1],
  ];
  for (const [fx, fy] of fractions) {
    const cx = Math.round(width * fx);
    const cy = Math.round(height * fy);
    await driver.performActions([
      {
        type: 'pointer',
        id: 'tbBackTap',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: cx, y: cy },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 50 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await driver.releaseActions();
    await driver.pause(160);
  }
}

/**
 * Toolbar / insets back only — does not use KEYCODE_BACK unless `useSystemBackFallback` (avoids Cosmedics routing back to Profile).
 */
async function tryToolbarNavigateUpFromLocationPicker({
  useSystemBackFallback = false,
  skipTitleWait = false,
} = {}) {
  if (!skipTitleWait) {
    await $(`//*[@text="${LOCATION_SCREEN_TITLE}"]`).waitForDisplayed({ timeout: 8000 });
  } else if (!(await isEnterYourLocationVisibleQuick())) {
    return;
  }
  const tryClickIfVisible = async (locator) => {
    const el = await $(locator);
    if (await el.isDisplayed().catch(() => false)) {
      await el.click();
      return true;
    }
    return false;
  };
  const xpathCandidates = [
    '//*[@content-desc="Navigate up"]',
    '//*[@content-desc="Back"]',
    '//*[contains(@content-desc,"Navigate up")]',
    '//*[contains(@content-desc,"navigate up")]',
    '//*[contains(@content-desc,"Back")]',
    '//*[contains(@content-desc,"back")]',
  ];
  for (const xp of xpathCandidates) {
    if (await tryClickIfVisible(xp)) {
      return;
    }
  }
  for (const fragment of ['Back', 'Navigate up']) {
    try {
      const el = await $(`android=new UiSelector().clickable(true).descriptionContains("${fragment}")`);
      if (await el.isDisplayed().catch(() => false)) {
        await el.click();
        return;
      }
    } catch {
      /* optional */
    }
  }
  await tapToolbarBackRegionStaged();
  if (useSystemBackFallback) {
    console.log('[LOCATION] COSMEDICS_ALLOW_SYSTEM_BACK_FROM_LOCATION=1: using Android KEYCODE_BACK as last resort.');
    await driver.pressKeyCode(4);
  } else {
    console.log(
      '[LOCATION] Toolbar / top-left back taps applied (no system KEYCODE_BACK — it was opening Profile before the Profile test step).'
    );
  }
}

/**
 * Return to Home from "Enter your location" using the app back control only.
 * Intentional Profile navigation stays later: after manual location → this → pause → clickHomeBottomNavProfile.
 */
async function leaveLocationPickerForHomeToolbarOnly(contextLine) {
  const startedAt = Date.now();
  await driver.hideKeyboard().catch(() => {});
  // Avoid long waits here; this helper is intended to be fast (bounded by maxMs).
  await $(`//*[@text="${LOCATION_SCREEN_TITLE}"]`).waitForDisplayed({ timeout: 3000 }).catch(() => {});
  const allowSystem = process.env.COSMEDICS_ALLOW_SYSTEM_BACK_FROM_LOCATION === '1';
  const maxMs = Number(process.env.COSMEDICS_LOCATION_LEAVE_MAX_MS || 2000);

  if (!COSMEDICS_QUIET) {
    console.log(`[LOCATION] ${contextLine}`);
    console.log(
      '[LOCATION] Using toolbar / top-left back only (no system back unless COSMEDICS_ALLOW_SYSTEM_BACK_FROM_LOCATION=1 on late attempts).'
    );
  }

  let step = 0;
  while (Date.now() - startedAt < maxMs) {
    if (await isHomeScreenVisibleQuick()) {
      console.log(`[SUMMARY] Returned to Home in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
      return;
    }

    if (await isProfileScreenVisibleQuick()) {
      if (!COSMEDICS_QUIET) {
        console.log(
          '[LOCATION] Landed on Profile while closing the location picker; tapping Home tab (not the Profile test step).'
        );
      }
      await clickHomeBottomNavHome();
      await driver.pause(150);
      step++;
      continue;
    }

    const onLocation = await isEnterYourLocationVisibleQuick();
    if (onLocation || step === 0) {
      const useKey = allowSystem && Date.now() - startedAt > Math.max(0, maxMs - 300);
      await tryToolbarNavigateUpFromLocationPicker({
        useSystemBackFallback: useKey,
        // Keep this helper bounded; do not wait up to 8s for a title that may already be transitioning.
        skipTitleWait: true,
      });
    } else {
      await clickHomeBottomNavHome();
    }

    await driver.pause(150);
    step++;
  }

  // Final bounded check: do NOT wait the full 20s of expectHomeScreen().
  const remaining = Math.max(0, maxMs - (Date.now() - startedAt));
  if (remaining > 0) {
    await driver
      .waitUntil(() => isHomeScreenVisibleQuick(), {
        timeout: remaining,
        interval: 150,
        timeoutMsg: 'Home not visible within leave-location time budget.',
      })
      .catch(() => {});
  }
  if (!(await isHomeScreenVisibleQuick())) {
    const currentPackage = await driver.getCurrentPackage().catch(() => '(unknown)');
    const currentActivity = await driver.getCurrentActivity().catch(() => '(unknown)');
    throw new Error(
      `Failed to return to Home within ${maxMs}ms. Current app: ${currentPackage}, activity: ${currentActivity}.`
    );
  }
  console.log(`[SUMMARY] Returned to Home in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
}

/** Bottom nav: profile tab (far right). Tries accessibility id / description, then a lower-right tap. */
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
  try {
    const ui = await $('android=new UiSelector().clickable(true).descriptionContains("Profile")');
    if (await ui.isDisplayed().catch(() => false)) {
      await ui.click();
      return;
    }
  } catch {
    /* optional */
  }
  console.log(
    '[PROFILE] Profile tab not found by content-desc; tapping lower-right nav area (above system bar).'
  );
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
  await driver.waitUntil(
    async () => {
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
    },
    {
      timeout,
      timeoutMsg: 'Profile screen not detected (expected Edit Profile, Logout, or Subscription).',
    }
  );
}

async function tryReturnToHomeViaBack(maxSteps = 8) {
  for (let i = 0; i < maxSteps; i++) {
    const homeTitle = await $('//*[@text="Home"]');
    if (await homeTitle.isDisplayed().catch(() => false)) {
      return;
    }
    await driver.pressKeyCode(4);
    await driver.pause(400);
  }
}

async function ensureLoggedInOnHome() {
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
    await expectLeftSignInScreen();
  } else {
    await tryReturnToHomeViaBack();
    if (!(await isHomeScreenVisibleQuick()) && (await isProfileScreenVisibleQuick())) {
      console.log('[LOCATION] Session opened on Profile; switching to Home tab.');
      await clickHomeBottomNavHome();
      await driver.pause(500);
    }
  }
  await expectHomeScreen();
}

async function clickHomeLocationLine() {
  try {
    await driver.hideKeyboard();
  } catch {
    // ignore
  }
  await expectHomeScreen();

  const candidates = [
    '//*[@content-desc="Enter your location"]',
    `//*[contains(@text, "${LOCATION_SCREEN_TITLE}")]`,
    '//android.widget.TextView[@text="Home"]/following-sibling::*[1]',
    '//android.widget.TextView[@text="Home"]/following-sibling::android.view.View[1]',
    `//*[contains(@text, "${HOME_SEARCH_PLACEHOLDER_SUBSTR}")]/preceding::*[1]`,
  ];

  const tryTap = async (el) => {
    await el.waitForDisplayed({ timeout: 6000 });
    try {
      await el.click();
    } catch {
      const { x, y, width, height } = await getElementRect(el);
      const cx = Math.round(x + width / 2);
      const cy = Math.round(y + height / 2);
      await driver.performActions([
        {
          type: 'pointer',
          id: 'locTap',
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
  };

  for (const selector of candidates) {
    const el = await $(selector);
    const exists = await el.isExisting().catch(() => false);
    if (!exists) continue;

    await tryTap(el);
    await driver.pause(500);

    if (await isEnterYourLocationVisibleQuick()) return;
    if (await $('//*[@content-desc="Navigate up"]').isDisplayed().catch(() => false)) return;
    if (await $('//*[@content-desc="Back"]').isDisplayed().catch(() => false)) return;

    // If we didn't navigate, keep trying other candidates.
  }

  const currentPackage = await driver.getCurrentPackage().catch(() => '(unknown)');
  const currentActivity = await driver.getCurrentActivity().catch(() => '(unknown)');
  throw new Error(
    `Failed to open location picker from Home. Current app: ${currentPackage}, activity: ${currentActivity}. ` +
      `Tried selectors: ${candidates.join(' | ')}`
  );
}

async function expectLocationScreenOpened() {
  const marker = process.env.COSMEDICS_LOCATION_SCREEN_MARKER;
  await driver.waitUntil(
    async () => {
      if (await $(`//*[@text="${LOCATION_SCREEN_TITLE}"]`).isDisplayed().catch(() => false)) {
        return true;
      }
      if (marker) {
        const byMarker = await $(`//*[contains(@text, "${marker}")]`);
        if (await byMarker.isDisplayed().catch(() => false)) {
          return true;
        }
      }
      if (await $('//*[@content-desc="Navigate up"]').isDisplayed().catch(() => false)) {
        return true;
      }
      if (await $('//*[@content-desc="Back"]').isDisplayed().catch(() => false)) {
        return true;
      }
      const homeSearch = await $(`//*[contains(@text, "${HOME_SEARCH_PLACEHOLDER_SUBSTR}")]`);
      return !(await homeSearch.isDisplayed().catch(() => false));
    },
    {
      timeout: 15000,
      timeoutMsg:
        `Location screen not detected (expected "${LOCATION_SCREEN_TITLE}" or marker/back).`,
    }
  );
}

async function findUseMyCurrentLocationElement() {
  const el = await $('//android.view.ViewGroup[@content-desc="Use my current location"]');
  await el.waitForDisplayed({ timeout: 15000 });
  return el;
}

async function clickUseMyCurrentLocation() {
  const el = await findUseMyCurrentLocationElement();
  await el.waitForDisplayed({ timeout: 15000 });
  try {
    await el.click();
  } catch {
    try {
      await el.scrollIntoView();
    } catch {
      /* optional */
    }
    const { x, y, width, height } = await getElementRect(el);
    const cx = Math.round(x + width / 2);
    const cy = Math.round(y + height / 2);
    await driver.performActions([
      {
        type: 'pointer',
        id: 'useLocTap',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: cx, y: cy },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 80 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await driver.releaseActions();
  }
}

async function getFieldText(field) {
  const t = await field.getText().catch(() => '');
  if (t) {
    return t;
  }
  return (await field.getAttribute('text')) || '';
}

/**
 * On "Enter your location", the address line is a clickable `ViewGroup` with the formatted
 * address in `content-desc` (UI Automator dump), not a separate `EditText`.
 */
async function getLocationAddressLabelText(el) {
  const t = (await getFieldText(el)).trim();
  if (t) {
    return t;
  }
  return ((await el.getAttribute('content-desc')) || '').trim();
}

async function getLocationPickerAddressRow(minContentDescLen = 12) {
  await $(`//*[@text="${LOCATION_SCREEN_TITLE}"]`).waitForDisplayed({ timeout: 15000 });

  const isUsableContentDesc = (cd) => {
    const t = (cd || '').trim();
    if (!t || t === 'Use my current location') {
      return false;
    }
    return t.length >= minContentDescLen;
  };

  const pickFromLocator = async (locator) => {
    const groups = await $$(locator);
    const n = groups.length;
    for (let i = 0; i < n; i++) {
      const g = groups[i];
      let cd = '';
      try {
        cd = ((await g.getAttribute('content-desc')) || '').trim();
      } catch {
        continue;
      }
      if (!isUsableContentDesc(cd)) {
        continue;
      }
      if (!(await g.isDisplayed().catch(() => false))) {
        continue;
      }
      return g;
    }
    return null;
  };

  // Cosmedics builds vary: address may be on clickable ViewGroup, plain ViewGroup, or another widget.
  const locators = [
    '//android.view.ViewGroup[@clickable="true" and @content-desc]',
    '//android.view.ViewGroup[@content-desc]',
    '//*[@clickable="true" and @content-desc]',
    '//android.view.View[@content-desc]',
  ];
  for (const loc of locators) {
    const row = await pickFromLocator(loc);
    if (row) {
      return row;
    }
  }

  const texts = await $$('//android.widget.TextView');
  const tn = texts.length;
  for (let i = 0; i < tn; i++) {
    const tv = texts[i];
    if (!(await tv.isDisplayed().catch(() => false))) {
      continue;
    }
    const t = ((await tv.getText().catch(() => '')) || '').trim();
    if (t.length < minContentDescLen) {
      continue;
    }
    if (t === LOCATION_SCREEN_TITLE) {
      continue;
    }
    if (t.includes('Use my current location')) {
      continue;
    }
    if (!/\d/.test(t) && !t.includes(',')) {
      continue;
    }
    return tv;
  }

  throw new Error(
    `No address/search row on "${LOCATION_SCREEN_TITLE}" (tried View/ViewGroup content-desc and address-like TextView) — check UI dump.`
  );
}

async function getLocationPickerAddressEditText() {
  return getLocationPickerAddressRow(12);
}

/**
 * Search / result row under "Enter your location": real `EditText` / SearchView internals if present,
 * else the same clickable `ViewGroup` Cosmedics uses for the combined search bar (no `EditText` in hierarchy).
 */
async function getLocationScreenSearchFieldElement() {
  await $(`//*[@text="${LOCATION_SCREEN_TITLE}"]`).waitForDisplayed({ timeout: 15000 });
  const types = [
    'android.widget.AutoCompleteTextView',
    'android.widget.MultiAutoCompleteTextView',
    'android.widget.EditText',
  ];
  for (const widget of types) {
    const els = await $$(`//${widget}`);
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!(await el.isDisplayed().catch(() => false))) {
        continue;
      }
      if ((await el.getAttribute('password')) === 'true') {
        continue;
      }
      return el;
    }
  }
  console.log(
    '[LOCATION] No EditText/AutoCompleteTextView on location screen; using clickable address/search ViewGroup row.'
  );
  try {
    return await getLocationPickerAddressRow(8);
  } catch {
    return await getLocationPickerAddressRow(3);
  }
}

async function waitForLocationSearchFieldNonEmpty(timeout = 20000) {
  let lastSearch = null;
  await driver.waitUntil(
    async () => {
      try {
        lastSearch = await getLocationScreenSearchFieldElement();
        return (await getLocationAddressLabelText(lastSearch)).trim().length >= 5;
      } catch {
        return false;
      }
    },
    {
      timeout,
      timeoutMsg:
        'Search/address row did not show a location string (≥5 chars) after Use my current location.',
    }
  );
  return lastSearch;
}

/**
 * After tapping the search row on "Enter your location", a modal opens with a field whose placeholder is "Location".
 * Returns that input element (EditText or AutoCompleteTextView).
 */
async function waitForManualLocationEntryDialog(timeout = 20000) {
  const needle = LOCATION_MANUAL_ENTRY_HINT.toLowerCase();
  let found = null;
  await driver.pause(400);
  await driver.waitUntil(
    async () => {
      const kinds = [
        '//android.widget.EditText',
        '//android.widget.AutoCompleteTextView',
        '//android.widget.MultiAutoCompleteTextView',
      ];
      for (const xp of kinds) {
        const els = await $$(xp);
        for (let i = els.length - 1; i >= 0; i--) {
          const e = els[i];
          if (!(await e.isDisplayed().catch(() => false))) {
            continue;
          }
          if ((await e.getAttribute('password')) === 'true') {
            continue;
          }
          const hint = ((await e.getAttribute('hint')) || '').toLowerCase();
          const desc = ((await e.getAttribute('content-desc')) || '').toLowerCase();
          const shown = (
            (await e.getText().catch(() => '')) ||
            (await e.getAttribute('text')) ||
            ''
          ).trim();
          if (hint.includes(needle) || desc.includes(needle) || shown.toLowerCase() === needle) {
            found = e;
            return true;
          }
        }
      }
      const byHintXPath = await $(
        `//android.widget.EditText[contains(translate(@hint,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),"${needle}")]`
      );
      if (await byHintXPath.isDisplayed().catch(() => false)) {
        found = byHintXPath;
        return true;
      }
      return false;
    },
    {
      timeout,
      timeoutMsg: `Manual location dialog did not open (no visible field with "${LOCATION_MANUAL_ENTRY_HINT}" hint/placeholder).`,
    }
  );
  return found;
}

function collectSuggestionCandidatesBelowInput(manualInputRect) {
  const minY = manualInputRect.y + manualInputRect.height + 24;
  return async () => {
    const texts = await $$('//android.widget.TextView');
    const candidates = [];
    for (let i = 0; i < texts.length; i++) {
      const el = texts[i];
      if (!(await el.isDisplayed().catch(() => false))) {
        continue;
      }
      const t = ((await el.getText()) || '').trim();
      if (t.length < 8) {
        continue;
      }
      if (t === LOCATION_SCREEN_TITLE) {
        continue;
      }
      if (t.replace(/\s/g, '').toLowerCase() === LOCATION_MANUAL_ENTRY_HINT.replace(/\s/g, '').toLowerCase()) {
        continue;
      }
      if (t.includes('Use my current location')) {
        continue;
      }
      const loc = await el.getLocation().catch(() => ({ y: 0 }));
      if (loc.y < minY) {
        continue;
      }
      candidates.push({ el, t, y: loc.y });
    }
    candidates.sort((x, y) => x.y - y.y);
    return candidates;
  };
}

/**
 * After typing in the manual popup, tap the first suggestion row (below the input, not keyboard chips).
 * Returns the primary line of text from that row (for verifying the main search bar later).
 */
async function tapFirstManualLocationSuggestion(manualInput, timeout = 25000) {
  const rect = await getElementRect(manualInput);
  const collect = collectSuggestionCandidatesBelowInput(rect);

  await driver.waitUntil(
    async () => (await collect()).length > 0,
    {
      timeout,
      timeoutMsg: 'No address suggestion list appeared below the manual location field.',
    }
  );

  const candidates = await collect();
  const first = candidates[0];
  const chosenLabel = first.t;
  try {
    await first.el.click();
  } catch {
    const r = await getElementRect(first.el);
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    await driver.performActions([
      {
        type: 'pointer',
        id: 'sugTap',
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
  return chosenLabel;
}

async function waitForManualLocationEntryDialogDismissed(manualInput, timeout = 15000) {
  await driver.waitUntil(
    async () => !(await manualInput.isDisplayed().catch(() => false)),
    {
      timeout,
      timeoutMsg: 'Manual location dialog did not close after choosing a suggestion.',
    }
  );
}

/**
 * Reads fused GPS from the device via Appium (after session exists).
 */
async function readDeviceGeolocation() {
  try {
    if (typeof driver.getGeolocation === 'function') {
      const g = await driver.getGeolocation();
      if (g && Number.isFinite(Number(g.latitude)) && Number.isFinite(Number(g.longitude))) {
        return { latitude: Number(g.latitude), longitude: Number(g.longitude) };
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const g = await driver.execute('mobile: getGeolocation', {});
    if (g && Number.isFinite(Number(g.latitude)) && Number.isFinite(Number(g.longitude))) {
      return { latitude: Number(g.latitude), longitude: Number(g.longitude) };
    }
  } catch {
    /* fall through */
  }
  throw new Error(
    'Could not read device geolocation. Turn on location, grant permission, and ensure Appium supports getGeolocation on this device.'
  );
}

/**
 * Reverse-geocode with OSM Nominatim (1 req/s policy — we wait before calling).
 * Set COSMEDICS_NOMINATIM_USER_AGENT to a contact string per https://operations.osmfoundation.org/policies/nominatim/
 */
async function reverseGeocodeToNeedles(lat, lon) {
  await driver.pause(1100);
  const ua =
    process.env.COSMEDICS_NOMINATIM_USER_AGENT ||
    'CosmedicsAppiumTest/1.0 (https://example.com; cosmedics-automation)';
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': ua, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }
  const data = await res.json();
  const displayName = typeof data.display_name === 'string' ? data.display_name.trim() : '';
  const a = data.address || {};
  const keys = ['city', 'town', 'village', 'hamlet', 'municipality', 'county', 'state', 'country'];
  const needles = [];
  for (const k of keys) {
    const v = a[k];
    if (typeof v === 'string' && v.trim().length >= 3) {
      needles.push(v.trim());
    }
  }
  if (typeof a.state_code === 'string' && a.state_code.trim().length >= 2) {
    needles.push(a.state_code.trim());
  }
  if (typeof a.postcode === 'string' && a.postcode.trim().length >= 3) {
    needles.push(a.postcode.trim());
  }
  if (typeof a.country_code === 'string' && a.country_code.trim().length === 2) {
    needles.push(a.country_code.trim().toUpperCase());
    if (a.country_code.trim().toLowerCase() === 'us') {
      needles.push('USA');
    }
  }
  return { needles: [...new Set(needles)], displayName };
}

/**
 * Reads the device’s current GPS and builds match needles (Nominatim reverse geocode).
 * Call this immediately before "Use my current location" so assertions align with the latest coordinates.
 */
async function captureFreshDevicePlaceNeedles() {
  console.log(
    '[LOCATION] Fetching the latest coordinates from the device (Appium getGeolocation / mobile: getGeolocation).'
  );
  const geo = await readDeviceGeolocation();
  console.log(`[SUMMARY] Device GPS: ${geo.latitude}, ${geo.longitude}`);
  console.log(
    `[LOCATION] Device GPS read succeeded: latitude=${geo.latitude}, longitude=${geo.longitude} (this is what we compare the app to).`
  );
  const { needles: base, displayName } = await reverseGeocodeToNeedles(geo.latitude, geo.longitude);
  console.log(`[SUMMARY] Device address: ${displayName || '(unknown from reverse-geocode)'}`);
  const extra = (process.env.COSMEDICS_LOCATION_EXTRA_NEEDLES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const needles = [...new Set([...base, ...extra])];
  const minHits = needles.length >= 2 ? 2 : 1;
  console.log(
    `[LOCATION] Reverse-geocoded reference labels from that device point (${needles.length}): ${needles.join(' | ')}`
  );
  console.log(
    `[LOCATION] Next: tap "Use my current location"; the app row must match at least ${minHits} of those labels.`
  );
  return { needles, minHits, geo };
}

function countNeedleHitsInText(text, needles) {
  const lower = text.toLowerCase();
  return needles.filter((n) => n && lower.includes(n.toLowerCase())).length;
}

async function expectAddressFieldMatchesDevicePlace(needles, minHits, geo) {
  if (!needles.length) {
    throw new Error('No address strings from reverse geocode to match against.');
  }
  let lastUiText = '';

  const readAddressText = async () => {
    for (const len of [12, 8, 3]) {
      try {
        const row = await getLocationPickerAddressRow(len);
        const text = (await getLocationAddressLabelText(row)).trim();
        if (text.length >= 5) {
          return text;
        }
      } catch {
        /* layout may be mid-transition; try shorter min length or next strategy */
      }
    }
    return '';
  };

  try {
    await driver.waitUntil(
      async () => {
        const text = await readAddressText();
        lastUiText = text;
        if (text.length < 5) {
          return false;
        }
        return countNeedleHitsInText(text, needles) >= minHits;
      },
      {
        timeout: 45000,
        timeoutMsg:
          `App address did not match at least ${minHits} of: ${needles.join(', ')}. ` +
          'App geocoder may differ from Nominatim — set COSMEDICS_LOCATION_EXTRA_NEEDLES (comma-separated substrings).',
      }
    );
  } catch (err) {
    console.log(
      `[LOCATION] Result: FAIL — "Use my current location" did not produce an address that matches the device ` +
        `(${geo.latitude}, ${geo.longitude}) within the timeout.`
    );
    console.log(`[LOCATION] Last address text seen in the app: "${lastUiText || '(empty or unreadable)'}"`);
    console.log(
      `[LOCATION] Expected at least ${minHits} substring hits from labels derived from device GPS: ${needles.join(' | ')}`
    );
    throw err;
  }
  const finalText = await readAddressText();
  const hits = countNeedleHitsInText(finalText, needles);
  expect(hits).toBeGreaterThanOrEqual(minHits);
  console.log(`[SUMMARY] App location: "${finalText}" (hits=${hits}/${minHits}) => PASS`);
  if (!COSMEDICS_QUIET) {
    console.log(`[LOCATION] Current location row in the app after the tap: "${finalText}"`);
    console.log(
      `[LOCATION] Result: PASS — the app shows the same place as the device GPS (${geo.latitude}, ${geo.longitude}); ` +
        `matched ${hits} reference substring(s) (required ≥${minHits}).`
    );
  }
}

describe('Cosmedics - device_location_vs_picker_search', () => {
  beforeEach(function () {
    console.log(`[TEST START] ${this.currentTest.title}`);
  });

  afterEach(function () {
    const state = this.currentTest.state ? this.currentTest.state.toUpperCase() : 'UNKNOWN';
    console.log(`[TEST END] ${this.currentTest.title} => ${state}`);
  });

  it('after sign-in flow, use my current location fills search with the same place as device GPS', async function () {
    this.timeout(Number(process.env.MOCHA_TIMEOUT_MS || 360000));
    await ensureLoggedInOnHome();
    await clickHomeLocationLine();
    await expectLocationScreenOpened();

    const addressSearch = await getLocationPickerAddressEditText();
    await expect(addressSearch).toBeDisplayed();

    let needles;
    let minHits;
    let geo;
    try {
      ({ needles, minHits, geo } = await captureFreshDevicePlaceNeedles());
    } catch (e) {
      console.log(`[LOCATION] Result: SKIPPED — could not read device location or reverse geocode: ${e.message}`);
      this.skip();
    }
    if (!needles.length) {
      console.log('[LOCATION] Result: SKIPPED — no reference labels from reverse geocode.');
      this.skip();
    }

    await clickUseMyCurrentLocation();
    await expectAddressFieldMatchesDevicePlace(needles, minHits, geo);

    const searchAfterUseCurrent = await waitForLocationSearchFieldNonEmpty();
    const searchPreview = (await getLocationAddressLabelText(searchAfterUseCurrent)).trim();
    console.log(`[SUMMARY] Search field after current-location: "${searchPreview}"`);
    console.log('[LOCATION] Waiting 2 seconds after location is shown in the search field...');
    await driver.pause(2000);

    await leaveLocationPickerForHomeToolbarOnly(
      'Leaving location picker for Home after Use my current location (no Profile step yet).'
    );

    let lastManualQuery = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`[LOCATION] Opening location again from Home for manual entry attempt #${attempt}.`);
      await clickHomeLocationLine();
      await expectLocationScreenOpened();

      const searchField = await getLocationScreenSearchFieldElement();
      await expect(searchField).toBeDisplayed();
      console.log(
        `[LOCATION] Manual entry attempt #${attempt}: tapping the search field (not Use my current location).`
      );
      try {
        await searchField.click();
      } catch {
        const { x, y, width, height } = await getElementRect(searchField);
        const cx = Math.round(x + width / 2);
        const cy = Math.round(y + height / 2);
        await driver.performActions([
          {
            type: 'pointer',
            id: 'searchTap',
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

      const manualLocationInput = await waitForManualLocationEntryDialog();
      await expect(manualLocationInput).toBeDisplayed();
      console.log(
        `[LOCATION] Manual entry popup is open — field with "${LOCATION_MANUAL_ENTRY_HINT}" placeholder is displayed (ready for typed address).`
      );

      const manualQuery = pickRandomManualLocationQuery(lastManualQuery);
      lastManualQuery = manualQuery;
      console.log(`[SUMMARY] Manual query #${attempt}: "${manualQuery}"`);
      await clearAndType(manualLocationInput, manualQuery);
      await driver.pause(300);

      const chosenSuggestionLabel = await tapFirstManualLocationSuggestion(manualLocationInput);
      console.log(`[SUMMARY] Picked suggestion #${attempt}: "${chosenSuggestionLabel}"`);
      await waitForManualLocationEntryDialogDismissed(manualLocationInput);

      await $(`//*[@text="${LOCATION_SCREEN_TITLE}"]`).waitForDisplayed({ timeout: 15000 });
      const mainBar = await getLocationScreenSearchFieldElement();
      const mainBarText = (await getLocationAddressLabelText(mainBar)).trim();
      console.log(`[LOCATION] Main "Enter your location" search bar after manual pick: "${mainBarText}"`);

      expect(mainLocationBarMatchesManualChoice(mainBarText, chosenSuggestionLabel)).toBe(true);
      console.log(`[SUMMARY] Manual selection reflected in main bar #${attempt} => PASS`);

      // Keep this short; leave-to-Home handles retries but is capped by COSMEDICS_LOCATION_LEAVE_MAX_MS.
      await driver.pause(2000);

      await leaveLocationPickerForHomeToolbarOnly(
        `Leaving location picker for Home after manual location attempt #${attempt}.`
      );
    }

    const homePauseBeforeProfileMs = Number(process.env.COSMEDICS_HOME_PAUSE_BEFORE_PROFILE_MS || 2000);
    console.log(`[PROFILE] Pausing on Home for ${homePauseBeforeProfileMs}ms before opening Profile.`);
    await driver.pause(homePauseBeforeProfileMs);

    console.log('[PROFILE] Opening Profile from bottom-right tab on Home.');
    await clickHomeBottomNavProfile();
    await expectProfileScreenOpened();
    console.log('[PROFILE] Profile screen is open (Edit Profile / menu list visible).');
  });
});

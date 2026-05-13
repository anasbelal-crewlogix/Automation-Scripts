'use strict';

/**
 * Provider flow: start on the patient Sign In screen (e.g. after patient logout),
 * open Provider access, reach Provider login.
 *
 * Run after patient logout or with app cleared to Sign In:
 *   npm run wdio:android:cosmedics:provider:signin
 *
 * Optional: set COSMEDICS_PROVIDER_EMAIL + COSMEDICS_PROVIDER_PASSWORD to fill fields
 * and tap Continue (does not assert post-login yet).
 *
 * If labels differ by build, set:
 *   COSMEDICS_PROVIDER_ACCESS_TEXT — exact or partial label for the link below Continue
 *   COSMEDICS_PROVIDER_LOGIN_MARKER — substring that appears on Provider login only
 */

const APP_PACKAGE = 'com.cosmedicenteruser';

const PROVIDER_EMAIL = (process.env.COSMEDICS_PROVIDER_EMAIL || '').trim();
const PROVIDER_PASSWORD = (process.env.COSMEDICS_PROVIDER_PASSWORD || '').trim();

async function getPatientSignInTitle() {
  const selectors = [
    '//*[@text="Sign In"]',
    '//*[contains(@text,"Sign In")]',
    '//*[contains(@text,"Sign in")]',
    '//*[@content-desc="Sign In"]',
  ];
  for (const s of selectors) {
    const el = await $(s);
    if (await el.isDisplayed().catch(() => false)) return el;
  }
  return $(selectors[0]);
}

async function ensurePatientSignInScreen() {
  await driver.activateApp(APP_PACKAGE);
  const onSignIn = await getPatientSignInTitle()
    .then((el) => el.isDisplayed())
    .catch(() => false);
  if (onSignIn) {
    return;
  }
  await driver.execute('mobile: clearApp', { appId: APP_PACKAGE });
  await driver.pause(800);
  await driver.activateApp(APP_PACKAGE);
  await (await getPatientSignInTitle()).waitForDisplayed({ timeout: 20000 });
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
      await el.waitForExist({ timeout: 5000, interval: 200 });
      if (await el.isDisplayed().catch(() => false)) {
        return el;
      }
    } catch {
      /* try next */
    }
  }
  throw new Error(`Continue button not found on patient Sign In. Tried: ${candidates.join(' | ')}`);
}

function providerAccessLabelCandidates() {
  const custom = (process.env.COSMEDICS_PROVIDER_ACCESS_TEXT || '').trim();
  const base = [
    custom,
    'Provider access',
    'Provider Access',
    'Provider Login',
    'Provider sign in',
    'Provider Sign In',
  ].filter(Boolean);
  return [...new Set(base)];
}

/**
 * Control below Continue on patient Sign In (link or button).
 */
async function tapProviderAccess() {
  await driver.hideKeyboard().catch(() => {});

  for (const label of providerAccessLabelCandidates()) {
    const xps = [
      `//*[@text="${label}"]`,
      `//*[contains(@text,"${label}")]`,
      `//*[@content-desc="${label}"]`,
      `//*[contains(@content-desc,"${label}")]`,
    ];
    for (const xp of xps) {
      const el = await $(xp);
      if (await el.isDisplayed().catch(() => false)) {
        try {
          await el.click();
        } catch {
          const { x, y, width, height } = await el.getRect();
          const cx = Math.round(x + width / 2);
          const cy = Math.round(y + height / 2);
          await driver.performActions([
            {
              type: 'pointer',
              id: 'provTap',
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
        console.log(`[SUMMARY] Tapped Provider access (matched: "${label}")`);
        return;
      }
    }
  }

  try {
    const ui = await $('android=new UiSelector().clickable(true).textContains("Provider")');
    if (await ui.isDisplayed().catch(() => false)) {
      await ui.click();
      console.log('[SUMMARY] Tapped Provider access (UiSelector textContains Provider)');
      return;
    }
  } catch {
    /* optional */
  }

  try {
    const ui = await $('android=new UiSelector().clickable(true).descriptionContains("Provider")');
    if (await ui.isDisplayed().catch(() => false)) {
      await ui.click();
      console.log('[SUMMARY] Tapped Provider access (UiSelector descriptionContains Provider)');
      return;
    }
  } catch {
    /* optional */
  }

  const continueEl = await getContinueButton();
  await continueEl.waitForDisplayed({ timeout: 15000 });
  const contRect = await continueEl.getRect();
  const { width, height } = await driver.getWindowSize();
  const tapBelowY = Math.min(Math.round(contRect.y + contRect.height + 120), height - 40);
  const tapX = Math.round(contRect.x + contRect.width / 2);
  console.log('[SUMMARY] Fallback: tap below Continue for Provider access');
  await driver.performActions([
    {
      type: 'pointer',
      id: 'belowCont',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: tapX, y: tapBelowY },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

async function expectProviderLoginScreen(timeout = 25000) {
  const marker = (process.env.COSMEDICS_PROVIDER_LOGIN_MARKER || '').trim();

  await driver.waitUntil(
    async () => {
      if (marker) {
        const byMarker = await $(`//*[contains(@text,"${marker}")]`);
        if (await byMarker.isDisplayed().catch(() => false)) {
          return true;
        }
      }

      const combined = await $$(
        '//*[contains(@text,"Provider") and (contains(@text,"Sign") or contains(@text,"Log") or contains(@text,"sign"))]'
      );
      for (let i = 0; i < combined.length; i++) {
        const el = combined[i];
        if (await el.isDisplayed().catch(() => false)) {
          return true;
        }
      }

      const accessStill = await $('//*[contains(@text,"Provider access")]');
      const stillPatientAnchor = await accessStill.isDisplayed().catch(() => false);

      const edits = await $$('//android.widget.EditText');
      let visibleEdits = 0;
      for (let i = 0; i < edits.length; i++) {
        if (await edits[i].isDisplayed().catch(() => false)) {
          visibleEdits++;
        }
      }

      if (!stillPatientAnchor && visibleEdits >= 2) {
        return true;
      }

      return false;
    },
    {
      timeout,
      interval: 300,
      timeoutMsg:
        'Provider login screen not detected. Set COSMEDICS_PROVIDER_LOGIN_MARKER to a visible substring, ' +
        'or COSMEDICS_PROVIDER_ACCESS_TEXT if the entry link label differs.',
    }
  );

  console.log('[SUMMARY] Provider login screen is visible');
}

async function getProviderEmailInput() {
  const inputs = await $$('//android.widget.EditText');
  for (const input of inputs) {
    const isPassword = await input.getAttribute('password');
    if (isPassword !== 'true' && (await input.isDisplayed().catch(() => false))) {
      return input;
    }
  }
  throw new Error('Provider email field not found.');
}

async function getProviderPasswordInput() {
  const inputs = await $$('//android.widget.EditText');
  for (const input of inputs) {
    const isPassword = await input.getAttribute('password');
    if (isPassword === 'true' && (await input.isDisplayed().catch(() => false))) {
      return input;
    }
  }
  throw new Error('Provider password field not found.');
}

async function clearAndType(element, value) {
  await element.click();
  await element.clearValue();
  if (value) {
    await element.setValue(value);
  }
}

async function fillProviderCredentials(email, password) {
  const emailInput = await getProviderEmailInput();
  const passwordInput = await getProviderPasswordInput();
  await clearAndType(emailInput, email);
  await clearAndType(passwordInput, password);
  await driver.hideKeyboard().catch(() => {});
}

async function tapProviderContinue() {
  await driver.hideKeyboard().catch(() => {});
  const candidates = [
    '~Continue',
    '//*[@content-desc="Continue"]',
    '//*[@text="Continue"]',
    '//android.widget.Button[@text="Continue"]',
  ];
  for (const selector of candidates) {
    const el = await $(selector);
    if (await el.isDisplayed().catch(() => false)) {
      await el.waitForEnabled({ timeout: 15000 });
      await el.click();
      console.log('[SUMMARY] Tapped Continue on Provider login');
      return;
    }
  }
  throw new Error(`Provider Continue not found. Tried: ${candidates.join(' | ')}`);
}

describe('Cosmedics - Provider access from patient Sign In', () => {
  it('opens Provider login via Provider access below Continue', async function () {
    this.timeout(Number(process.env.MOCHA_TIMEOUT_MS || 120000));

    await ensurePatientSignInScreen();
    await (await getPatientSignInTitle()).waitForDisplayed({ timeout: 15000 });
    await getContinueButton();

    await tapProviderAccess();
    await expectProviderLoginScreen();

    if (PROVIDER_EMAIL && PROVIDER_PASSWORD) {
      await fillProviderCredentials(PROVIDER_EMAIL, PROVIDER_PASSWORD);
      await tapProviderContinue();
      console.log(
        '[SUMMARY] Provider credentials submitted (set assertions for post-login in a follow-up step).'
      );
    } else {
      console.log(
        '[SUMMARY] COSMEDICS_PROVIDER_EMAIL / COSMEDICS_PROVIDER_PASSWORD not set — stopped at Provider login screen.'
      );
    }
  });
});

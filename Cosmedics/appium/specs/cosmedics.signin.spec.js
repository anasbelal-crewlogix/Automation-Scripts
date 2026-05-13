'use strict';

const APP_PACKAGE = 'com.cosmedicenteruser';
const VALID_EMAIL = (process.env.COSMEDICS_VALID_EMAIL || 'patient@gmail.com').trim();
const VALID_PASSWORD = (process.env.COSMEDICS_VALID_PASSWORD || 'Password123').trim();
const WRONG_EMAIL = 'wrong_email@example.com';
const WRONG_PASSWORD = 'WrongPassword123!';

const SIGN_IN_TITLE_SELECTORS = [
  '//*[@text="Sign In"]',
  '//*[contains(@text,"Sign In")]',
  '//*[contains(@text,"Sign in")]',
  '//*[contains(@text,"SIGN IN")]',
  '//*[@content-desc="Sign In"]',
  '//*[contains(@content-desc,"Sign In")]',
];

async function isSignInScreenVisibleQuick() {
  for (const s of SIGN_IN_TITLE_SELECTORS) {
    const el = await $(s);
    if (await el.isDisplayed().catch(() => false)) return true;
  }
  return false;
}

async function getSignInTitle() {
  for (const s of SIGN_IN_TITLE_SELECTORS) {
    const el = await $(s);
    if (await el.isDisplayed().catch(() => false)) return el;
  }
  return $(SIGN_IN_TITLE_SELECTORS[0]);
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
  if (await isSignInScreenVisibleQuick()) {
    return;
  }
  await driver.execute('mobile: clearApp', { appId: APP_PACKAGE });
  await driver.pause(600);
  await driver.activateApp(APP_PACKAGE);
  await (await getSignInTitle()).waitForDisplayed({ timeout: 20000 });
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
  await driver.waitUntil(async () => !(await isSignInScreenVisibleQuick()), {
    timeout: 20000,
    interval: 300,
    timeoutMsg: 'Expected to leave the Sign In screen (no Sign In title matched).',
  });
}

const POST_BAD_LOGIN_PAUSE_MS = Number(process.env.COSMEDICS_SIGNIN_POST_SUBMIT_MS || 1200);

async function submitAndExpectRemainOnSignIn() {
  const continueButton = await getContinueButton();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  if (POST_BAD_LOGIN_PAUSE_MS > 0) {
    await driver.pause(POST_BAD_LOGIN_PAUSE_MS);
  }
  await expectOnSignInScreen();
}

async function providerAccessLabelCandidates() {
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

describe('Cosmedics - Sign In screen validations', () => {
  before(function () {
    this.timeout(Number(process.env.COSMEDICS_SIGNIN_SPEC_TIMEOUT_MS || 180000));
  });

  beforeEach(function () {
    console.log(`[TEST START] ${this.currentTest.title}`);
  });

  beforeEach(async () => {
    await ensureSignInScreenForSignInDescribe();
    await expectOnSignInScreen();
    await fillCredentials('', '');
  });

  afterEach(function () {
    const state = this.currentTest.state ? this.currentTest.state.toUpperCase() : 'UNKNOWN';
    console.log(`[TEST END] ${this.currentTest.title} => ${state}`);
  });

  describe('Continue button (client-side)', () => {
    it('keeps Continue disabled when both email and password are empty', async () => {
      const continueButton = await getContinueButton();
      await expect(continueButton).not.toBeEnabled();
    });

    it('keeps Continue disabled when email is empty and password is filled', async () => {
      await fillCredentials('', WRONG_PASSWORD);
      const continueButton = await getContinueButton();
      await expect(continueButton).not.toBeEnabled();
    });

    it('keeps Continue disabled when email is filled and password is empty', async () => {
      await fillCredentials(WRONG_EMAIL, '');
      const continueButton = await getContinueButton();
      await expect(continueButton).not.toBeEnabled();
    });

    it('enables Continue when both valid email and password are provided', async function () {
      if (!VALID_EMAIL || !VALID_PASSWORD) {
        this.skip();
      }
      await fillCredentials(VALID_EMAIL, VALID_PASSWORD);
      const continueButton = await getContinueButton();
      await expect(continueButton).toBeEnabled();
    });
  });

  describe('Invalid credentials (stay on Sign In)', () => {
    it('rejects wrong email and wrong password', async () => {
      await fillCredentials(WRONG_EMAIL, WRONG_PASSWORD);
      await submitAndExpectRemainOnSignIn();
    });

    it('rejects wrong email with valid password', async function () {
      if (!VALID_PASSWORD) {
        this.skip();
      }
      await fillCredentials(WRONG_EMAIL, VALID_PASSWORD);
      await submitAndExpectRemainOnSignIn();
    });

    it('rejects valid email with wrong password', async function () {
      if (!VALID_EMAIL) {
        this.skip();
      }
      await fillCredentials(VALID_EMAIL, WRONG_PASSWORD);
      await submitAndExpectRemainOnSignIn();
    });
  });

  describe('Email / password shape (client or server)', () => {
    it('does not complete sign-in when email has no @ (treated as invalid or rejected after submit)', async () => {
      await fillCredentials('notanemail', WRONG_PASSWORD);
      const continueButton = await getContinueButton();
      if (await continueButton.isEnabled()) {
        await submitAndExpectRemainOnSignIn();
      } else {
        await expectOnSignInScreen();
      }
    });

    it('does not complete sign-in for incomplete address (local part only)', async () => {
      await fillCredentials('user@', WRONG_PASSWORD);
      const continueButton = await getContinueButton();
      if (await continueButton.isEnabled()) {
        await submitAndExpectRemainOnSignIn();
      } else {
        await expectOnSignInScreen();
      }
    });

    it('does not leave Sign In when email is only whitespace but password is filled', async () => {
      await fillCredentials('    ', WRONG_PASSWORD);
      const continueButton = await getContinueButton();
      if (await continueButton.isEnabled()) {
        await continueButton.click();
        if (POST_BAD_LOGIN_PAUSE_MS > 0) {
          await driver.pause(POST_BAD_LOGIN_PAUSE_MS);
        }
      }
      await expectOnSignInScreen();
    });

    it('does not leave Sign In when password is only whitespace but email looks valid', async () => {
      await fillCredentials(WRONG_EMAIL, '    ');
      const continueButton = await getContinueButton();
      if (await continueButton.isEnabled()) {
        await continueButton.click();
        if (POST_BAD_LOGIN_PAUSE_MS > 0) {
          await driver.pause(POST_BAD_LOGIN_PAUSE_MS);
        }
      }
      await expectOnSignInScreen();
    });
  });

  describe('Screen content', () => {
    it('shows Provider access entry below the patient sign-in flow', async () => {
      await driver.hideKeyboard().catch(() => {});
      let found = false;
      for (const label of providerAccessLabelCandidates()) {
        const el = await $(`//*[contains(@text,"${label}")]`);
        if (await el.isDisplayed().catch(() => false)) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });
  });

  describe('Happy path', () => {
    it('logs in with valid email and password', async function () {
      if (!VALID_EMAIL || !VALID_PASSWORD) {
        this.skip();
      }
      await fillCredentials(VALID_EMAIL, VALID_PASSWORD);
      await tapContinue();
      await expectLeftSignInScreen();
    });
  });
});

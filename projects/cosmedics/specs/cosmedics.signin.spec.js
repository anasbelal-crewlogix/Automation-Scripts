'use strict';

const APP_PACKAGE = 'com.cosmedicenteruser';
const VALID_EMAIL = process.env.COSMEDICS_VALID_EMAIL || 'patient@gmail.com';
const VALID_PASSWORD = process.env.COSMEDICS_VALID_PASSWORD || 'Password123';
const WRONG_EMAIL = 'wrong_email@example.com';
const WRONG_PASSWORD = 'WrongPassword123!';

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

describe('Cosmedics - Sign In screen validations', () => {
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

  it('tries sign in with wrong email and wrong password', async () => {
    await fillCredentials(WRONG_EMAIL, WRONG_PASSWORD);
    const continueButton = await getContinueButton();
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expectOnSignInScreen();
  });

  it('tries sign in with wrong email and right password', async () => {
    if (!VALID_PASSWORD) {
      console.log('[INFO] COSMEDICS_VALID_PASSWORD is missing, skipping assertion flow.');
      return;
    }

    await fillCredentials(WRONG_EMAIL, VALID_PASSWORD);
    const continueButton = await getContinueButton();
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expectOnSignInScreen();
  });

  it('tries sign in with right email and wrong password', async () => {
    if (!VALID_EMAIL) {
      console.log('[INFO] COSMEDICS_VALID_EMAIL is missing, skipping assertion flow.');
      return;
    }

    await fillCredentials(VALID_EMAIL, WRONG_PASSWORD);
    const continueButton = await getContinueButton();
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expectOnSignInScreen();
  });

  it('enables Continue when both valid email and password are provided', async () => {
    if (!VALID_EMAIL || !VALID_PASSWORD) {
      console.log('[INFO] Valid credentials are missing, skipping assertion flow.');
      return;
    }

    await fillCredentials(VALID_EMAIL, VALID_PASSWORD);
    const continueButton = await getContinueButton();
    await expect(continueButton).toBeEnabled();
  });

  it('logs in with valid email and password', async () => {
    await fillCredentials(VALID_EMAIL, VALID_PASSWORD);
    await tapContinue();
    await expectLeftSignInScreen();
  });
});


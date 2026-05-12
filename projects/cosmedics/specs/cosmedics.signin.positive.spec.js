'use strict';

const APP_PACKAGE = 'com.cosmedicenteruser';
const VALID_EMAIL = process.env.COSMEDICS_VALID_EMAIL || 'patient@gmail.com';
const VALID_PASSWORD = process.env.COSMEDICS_VALID_PASSWORD || 'Password123';

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
    if (await el.isDisplayed().catch(() => false)) return el;
  }
  return $(candidates[0]);
}

async function getEmailInput() {
  const inputs = await $$('//android.widget.EditText');
  for (const input of inputs) {
    const isPassword = await input.getAttribute('password');
    if (isPassword !== 'true') return input;
  }
  throw new Error('Email input not found.');
}

async function getPasswordInput() {
  const inputs = await $$('//android.widget.EditText');
  for (const input of inputs) {
    const isPassword = await input.getAttribute('password');
    if (isPassword === 'true') return input;
  }
  throw new Error('Password input not found.');
}

async function clearAndType(element, value) {
  await element.click();
  await element.clearValue();
  if (value) await element.setValue(value);
}

async function fillCredentials(email, password) {
  const emailInput = await getEmailInput();
  const passwordInput = await getPasswordInput();
  await clearAndType(emailInput, email);
  await clearAndType(passwordInput, password);
  await driver.hideKeyboard().catch(() => {});
}

async function ensureSignInScreen() {
  await driver.activateApp(APP_PACKAGE);
  const onSignIn = await getSignInTitle()
    .then((el) => el.isDisplayed())
    .catch(() => false);
  if (onSignIn) return;
  await driver.execute('mobile: clearApp', { appId: APP_PACKAGE });
  await driver.pause(800);
  await driver.activateApp(APP_PACKAGE);
  await (await getSignInTitle()).waitForDisplayed({ timeout: 20000 });
}

async function tapContinue() {
  await driver.hideKeyboard().catch(() => {});
  const btn = await getContinueButton();
  await btn.waitForDisplayed({ timeout: 20000 });
  await btn.waitForEnabled({ timeout: 20000 });
  await btn.click();
}

async function expectLeftSignInScreen() {
  const signInTitle = await getSignInTitle();
  await signInTitle.waitForDisplayed({ reverse: true, timeout: 20000 });
}

describe('Cosmedics - Sign In (positive only)', () => {
  it('logs in with valid email and password', async () => {
    await ensureSignInScreen();
    await fillCredentials(VALID_EMAIL, VALID_PASSWORD);
    await tapContinue();
    await expectLeftSignInScreen();
  });
});


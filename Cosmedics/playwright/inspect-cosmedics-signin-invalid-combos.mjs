import { chromium } from 'playwright';

const url = 'https://dev.cosmedicenter.com/auth/signin';

const combos = [
  { name: 'wrongEmail + wrongPassword', email: 'pateint@gmail.com', password: 'password123' },
  { name: 'rightEmail + wrongPassword', email: 'patient@gmail.com', password: 'password123' },
  { name: 'wrongEmail + rightPassword', email: 'pateint@gmail.com', password: 'Password123' },
];

const PAUSE = 800;

for (const c of combos) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign In' }).click();
  await page.waitForTimeout(PAUSE);

  await page.getByRole('textbox', { name: 'Email Address' }).click();
  await page.getByRole('textbox', { name: 'Email Address' }).fill(c.email);
  await page.waitForTimeout(PAUSE);

  const usernameAfterEmailFill = await page.locator('input[name="username"]').first().inputValue();
  console.log(JSON.stringify({ combo: c.name, step: 'afterEmailFill', usernameAfterEmailFill }, null, 2));

  await page.getByRole('textbox', { name: 'Password' }).click();
  const eyeToggle = page.locator('button.absolute.inset-y-0.right-0').first();
  await eyeToggle.click();
  await page.waitForTimeout(PAUSE);

  await page.getByRole('textbox', { name: 'Password' }).fill(c.password);
  await page.waitForTimeout(PAUSE);

  const continueButton = page.getByRole('button', { name: 'Continue' }).first();
  const usernameVal = await page.locator('input[name="username"]').first().inputValue();
  const passwordVal = await page.locator('input[name="password"]').first().inputValue();
  const continueDisabled = await continueButton.isDisabled();

  console.log(JSON.stringify({ combo: c.name, step: 'afterPasswordFill', usernameVal, passwordVal, continueDisabled }, null, 2));

  await browser.close();
}


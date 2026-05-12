import { chromium } from 'playwright';

const url = 'https://dev.cosmedicenter.com/auth/signin';
const email = 'patient@gmail.com';
const password = 'Password123';

async function runCase(caseName, applyWriter) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const username = page.locator('input[name="username"]').first();
  const pwd = page.locator('input[name="password"]').first();
  const continueButton = page.locator('button[type="submit"]').filter({ hasText: 'Continue' }).first();

  await page.waitForTimeout(250);
  await applyWriter(username, pwd);
  await page.waitForTimeout(500);

  const usernameVal = await username.inputValue();
  const pwdVal = await pwd.inputValue();
  const continueDisabled = await continueButton.isDisabled();

  console.log(JSON.stringify({ caseName, usernameVal, pwdVal, continueDisabled }, null, 2));

  await browser.close();
}

await runCase('type-without-select', async (username, pwd) => {
  await username.click();
  await username.type(email, { delay: 10 });
  await pwd.click();
  await pwd.type(password, { delay: 10 });
});

await runCase('type-with-ctrl-a', async (username, pwd) => {
  await username.click();
  await username.press('Control+A');
  await username.type(email, { delay: 10 });
  await pwd.click();
  await pwd.press('Control+A');
  await pwd.type(password, { delay: 10 });
});


import { chromium } from 'playwright';

const url = 'https://dev.cosmedicenter.com/auth/signin';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });

const password = page.locator('input[name="password"]').first();
const passwordBox = await password.boundingBox();

// Print all buttons with likely eye/show/hide semantics.
const candidates = await page.$$eval('button', (buttons) =>
  buttons
    .map((b) => {
      const text = (b.textContent || '').trim();
      const ariaLabel = b.getAttribute('aria-label') || '';
      const title = b.getAttribute('title') || '';
      const type = b.getAttribute('type') || '';
      const className = b.getAttribute('class') || '';
      return { text, ariaLabel, title, type, className };
    })
    .filter((x) => /eye|show|hide|password/i.test(`${x.text} ${x.ariaLabel} ${x.title}`)),
);

const allButtons = await page.$$eval('button', (buttons) =>
  buttons.map((b) => {
    const text = (b.textContent || '').trim();
    const ariaLabel = b.getAttribute('aria-label') || '';
    const title = b.getAttribute('title') || '';
    const type = b.getAttribute('type') || '';
    const className = b.getAttribute('class') || '';
    return { text, ariaLabel, title, type, className };
  }),
);

console.log('passwordBox:', passwordBox);
console.log('candidates:', JSON.stringify(candidates, null, 2));
console.log('allButtons:', JSON.stringify(allButtons, null, 2));
console.log('allButtonsCount:', allButtons.length);

await browser.close();


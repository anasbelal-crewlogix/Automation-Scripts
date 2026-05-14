'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Provider flow: patient Sign In → Provider access → Provider login → submit credentials
 * → optional clinic selection (multi-clinic accounts only) → post-login wait.
 *
 * Run:
 *   npm run wdio:android:cosmedics:provider:signin
 *   npm run wdio:android:cosmedics:provider:profile   # profile-only (see COSMEDICS_PROVIDER_START_AT_PROFILE)
 *
 * Credentials default to the shared Mailinator test provider unless overridden:
 *   COSMEDICS_PROVIDER_EMAIL / COSMEDICS_PROVIDER_PASSWORD
 *
 * Multi-clinic: a bottom sheet titled **Choose your clinic** lists options with **radio circles**
 * (tapping the clinic name does not select). The script taps a **random** visible radio, then **Apply**.
 * Detection: first XPath on title text / content-desc; if that misses (some Flutter UIs), a throttled
 * `getPageSource` check for "choose your clinic" plus a bottom **Apply** and a selection control.
 * After clinic Apply (or if no clinic sheet), open **Profile** from the bottom bar
 * (Home, QR/camera, Notifications, **Profile** — far right).
 *
 * Optional UI tuning:
 *   COSMEDICS_PROVIDER_ACCESS_TEXT — link below patient Continue
 *   COSMEDICS_PROVIDER_LOGIN_MARKER — substring unique to provider login
 *   COSMEDICS_CLINIC_SCREEN_MARKER — substring on clinic sheet if title differs from defaults
 *   COSMEDICS_CLINIC_RADIO_MIN_X_FRACTION — 0–1, min X for “circle on the right” fallback (default 0.52)
 *   COSMEDICS_PROVIDER_POST_LOGIN_PAUSE_MS — brief settle after clinic sheet is detected, before tapping a row (default 400, max 2000)
 *   COSMEDICS_PROVIDER_POST_CLINIC_LANDING_PAUSE_MS — pause on dashboard after clinic sheet dismisses, before Profile (default 800, max 2000)
 *   COSMEDICS_CLINIC_SCREEN_WAIT_MS — max time to poll for clinic sheet after login (default 12000)
 *
 * **Profile-only iteration** (sign-in + clinic already verified): set
 *   COSMEDICS_PROVIDER_START_AT_PROFILE=1
 * The spec assumes the app is already on the provider shell (e.g. after manual login or a prior run).
 * Optional: COSMEDICS_PROVIDER_PROFILE_ENTRY_PAUSE_MS (default 1500) — settle wait before tapping Profile.
 * Run: `npm run wdio:android:cosmedics:provider:profile`
 */

const APP_PACKAGE = 'com.cosmedicenteruser';

/** When true, skip patient sign-in, provider login, and clinic handling; test only bottom-nav → Profile. */
const START_AT_PROFILE = /^1|true|yes$/i.test(
  String(process.env.COSMEDICS_PROVIDER_START_AT_PROFILE || '').trim()
);
const PROFILE_ENTRY_PAUSE_MS = Number(process.env.COSMEDICS_PROVIDER_PROFILE_ENTRY_PAUSE_MS || 1500);

const DEFAULT_PROVIDER_EMAIL = 'providertwo@mailinator.com';
const DEFAULT_PROVIDER_PASSWORD = 'Password123';

const PROVIDER_EMAIL = (process.env.COSMEDICS_PROVIDER_EMAIL || DEFAULT_PROVIDER_EMAIL).trim();
const PROVIDER_PASSWORD = (process.env.COSMEDICS_PROVIDER_PASSWORD || DEFAULT_PROVIDER_PASSWORD).trim();

const CLINIC_RADIO_MIN_X_FRACTION = Math.min(
  0.85,
  Math.max(0.42, Number(process.env.COSMEDICS_CLINIC_RADIO_MIN_X_FRACTION || 0.52))
);
const CLINIC_SCREEN_WAIT_MS = Number(process.env.COSMEDICS_CLINIC_SCREEN_WAIT_MS || 12000);
/** After clinic sheet is visible: short settle before collecting hit targets (ms, capped at 2000 in flow). */
const POST_LOGIN_PAUSE_MS = Number(process.env.COSMEDICS_PROVIDER_POST_LOGIN_PAUSE_MS || 400);
/** After Apply dismisses the sheet: pause on landing before bottom-nav Profile (ms, hard max 2000). */
const POST_CLINIC_LANDING_PAUSE_MS = Number(process.env.COSMEDICS_PROVIDER_POST_CLINIC_LANDING_PAUSE_MS || 800);

/** Throttle: page source is heavy; used when XPath cannot see the title (e.g. some Flutter layers). */
let clinicChooserPageSourceCache = { at: 0, text: '' };

async function hierarchyLikelyContainsClinicChooserTitle() {
  const now = Date.now();
  if (now - clinicChooserPageSourceCache.at < 2000 && clinicChooserPageSourceCache.text) {
    return clinicChooserPageSourceCache.text.includes('choose your clinic');
  }
  clinicChooserPageSourceCache.at = now;
  try {
    clinicChooserPageSourceCache.text = (await driver.getPageSource()).toLowerCase();
    return clinicChooserPageSourceCache.text.includes('choose your clinic');
  } catch {
    clinicChooserPageSourceCache.text = '';
    return false;
  }
}

function invalidateClinicChooserPageSourceCache() {
  clinicChooserPageSourceCache = { at: 0, text: '' };
}

async function safeElementRect(el) {
  if (!el) return null;
  try {
    if (typeof el.getRect === 'function') {
      const r = await el.getRect();
      if (r && Number.isFinite(r.width) && Number.isFinite(r.height)) return r;
    }
  } catch {
    /* */
  }
  try {
    if (typeof el.getLocation === 'function' && typeof el.getSize === 'function') {
      const loc = await el.getLocation();
      const size = await el.getSize();
      return {
        x: loc.x,
        y: loc.y,
        width: size.width,
        height: size.height,
      };
    }
  } catch {
    /* */
  }
  return null;
}

async function dumpProviderUiArtifacts(tag) {
  const dir = path.join(__dirname, '..', 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `provider-${tag}-${stamp}`;
  const xmlPath = path.join(dir, `${base}.xml`);
  try {
    const xml = await driver.getPageSource();
    fs.writeFileSync(xmlPath, xml, 'utf8');
    console.log(`[SUMMARY] Saved UI dump: ${xmlPath}`);
  } catch (e) {
    console.log(`[SUMMARY] Could not save page source: ${e.message}`);
  }
  try {
    const pngPath = path.join(dir, `${base}.png`);
    await driver.saveScreenshot(pngPath);
    console.log(`[SUMMARY] Saved screenshot: ${pngPath}`);
  } catch {
    /* optional */
  }
  return xmlPath;
}

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

async function countVisibleEditTexts() {
  const edits = await $$('//android.widget.EditText');
  let n = 0;
  for (let i = 0; i < edits.length; i++) {
    if (await edits[i].isDisplayed().catch(() => false)) {
      n++;
    }
  }
  return n;
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

function clinicScreenTitleCandidates() {
  const custom = (process.env.COSMEDICS_CLINIC_SCREEN_MARKER || '').trim();
  const base = [
    custom,
    'Choose your clinic',
    'Choose Your Clinic',
    'Select clinic',
    'Select a clinic',
    'Select Clinic',
    'Choose clinic',
    'Choose Clinic',
    'Clinic selection',
    'Clinic Selection',
    'Your clinics',
    'Your Clinics',
    'Select your clinic',
    'Which clinic',
    'Pick a clinic',
    'Select location',
    'Choose location',
  ].filter(Boolean);
  return [...new Set(base)];
}

/**
 * Primary: title in accessibility tree (@text / @content-desc).
 * Fallback: **Apply** in the lower part of the screen + hierarchy string contains "choose your clinic"
 * (covers cases where the title is drawn but not exposed as a TextView), + not still on 2-field login,
 * + at least one **clinic row title inside the chooser ScrollView** (not dashboard lists).
 */
async function isClinicSelectionScreenVisible() {
  for (const phrase of clinicScreenTitleCandidates()) {
    if (!phrase) continue;
    const el = await $(`//*[contains(@text,"${phrase}")]`);
    if (await el.isDisplayed().catch(() => false)) {
      return true;
    }
    const cd = await $(`//*[contains(@content-desc,"${phrase}")]`);
    if (await cd.isDisplayed().catch(() => false)) {
      return true;
    }
  }

  const applyCandidates = [
    await $('//*[@text="Apply"]'),
    await $('//*[@text="APPLY"]'),
    await $('//*[contains(@text,"Apply")]'),
  ];
  let applyEl = null;
  for (const a of applyCandidates) {
    if (await a.isDisplayed().catch(() => false)) {
      applyEl = a;
      break;
    }
  }
  if (!applyEl) {
    return false;
  }

  const ar = await safeElementRect(applyEl);
  if (!ar) {
    return false;
  }
  const { height: sh } = await driver.getWindowSize();
  if (ar.y < sh * 0.38) {
    return false;
  }

  if ((await countVisibleEditTexts()) >= 2) {
    return false;
  }

  if (!(await hierarchyLikelyContainsClinicChooserTitle())) {
    return false;
  }

  const rowTitles = await collectClinicRowTitleElementsInSheet();
  return rowTitles.length >= 1;
}

async function waitLeavingProviderLoginOrClinicAppears(
  timeoutMs = Number(process.env.COSMEDICS_PROVIDER_LEAVE_LOGIN_TIMEOUT_MS || 60000)
) {
  await driver.waitUntil(
    async () => {
      if (await isClinicSelectionScreenVisible()) {
        return true;
      }
      const n = await countVisibleEditTexts();
      return n < 2;
    },
    {
      timeout: timeoutMs,
      interval: 150,
      timeoutMsg:
        'After provider Continue: expected clinic selection or leaving the two-field login (still on login?).',
    }
  );
}

async function tapFirstMatchingButton(labels, maxWaitMs = 6000) {
  const end = Date.now() + maxWaitMs;
  while (Date.now() < end) {
    for (const label of labels) {
      const xps = [
        `//*[@text="${label}"]`,
        `//*[contains(@text,"${label}")]`,
        `//*[@content-desc="${label}"]`,
      ];
      for (const xp of xps) {
        const el = await $(xp);
        if (await el.isDisplayed().catch(() => false)) {
          const en = await el.isEnabled().catch(() => true);
          if (en) {
            await el.click();
            return label;
          }
        }
      }
    }
    await driver.pause(150);
  }
  return null;
}

/** Apply is often on a clickable ViewGroup with content-desc; inner TextView is not clickable. */
async function tapClinicSheetApplyButton() {
  const byDesc = await $('//*[@clickable="true" and (@content-desc="Apply" or @content-desc="APPLY")]');
  if (await byDesc.isDisplayed().catch(() => false)) {
    await byDesc.click();
    return true;
  }
  const fromText = await $('//android.widget.TextView[@text="Apply" or @text="APPLY"]');
  if (await fromText.isDisplayed().catch(() => false)) {
    const anc = await fromText.$('./ancestor::*[@clickable="true"][1]');
    if (await anc.isDisplayed().catch(() => false)) {
      await anc.click();
      return true;
    }
  }
  return false;
}

function clinicRowTitleHeuristic(text) {
  const t = (text || '').trim();
  if (t.length < 3 || t.length > 100) return false;
  if (/choose your clinic/i.test(t)) return false;
  if (/^apply$/i.test(t)) return false;
  if (t.includes('\n')) return false;
  if (/\d{5,}/.test(t)) return false;
  if (/,/.test(t)) return false;
  return true;
}

/**
 * Only titles under the clinic **modal** ScrollView (sibling of "Choose your clinic").
 * Avoids matching clinic names on the provider dashboard after the sheet closes.
 */
async function collectClinicRowTitleElementsInSheet() {
  const custom = (process.env.COSMEDICS_CLINIC_SCREEN_MARKER || '').trim();
  const scopedXpaths = [];
  if (custom) {
    scopedXpaths.push(
      `//*[contains(@text,"${custom}")]/following-sibling::android.widget.ScrollView//android.widget.TextView`
    );
  }
  scopedXpaths.push(
    '//*[@text="Choose your clinic"]/following-sibling::android.widget.ScrollView//android.widget.TextView',
    '//*[contains(@text,"Choose your clinic")]/following-sibling::android.widget.ScrollView//android.widget.TextView'
  );

  const out = [];
  for (const xp of scopedXpaths) {
    const nodes = await $$(xp);
    for (let i = 0; i < nodes.length; i++) {
      const tv = nodes[i];
      if (!(await tv.isDisplayed().catch(() => false))) continue;
      const t = ((await tv.getText().catch(() => '')) || '').trim();
      if (!clinicRowTitleHeuristic(t)) continue;
      out.push(tv);
    }
    if (out.length) {
      return out;
    }
  }
  return out;
}

async function tapAtScreenCoords(x, y) {
  await driver.performActions([
    {
      type: 'pointer',
      id: 'clinicCoord',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y) },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

/**
 * Cosmedics clinic sheet draws circles without RadioButton nodes — tap right of the title row.
 */
async function tapClinicSelectionDotToRightOfTitleTextView(tv) {
  const r = await safeElementRect(tv);
  if (!r) return false;
  const { width: sw } = await driver.getWindowSize();
  const tapX = Math.round((r.x + r.width + sw - 32) / 2);
  const tapY = Math.round(r.y + r.height / 2);
  await tapAtScreenCoords(tapX, tapY);
  console.log(`[SUMMARY] Tapped selection area right of clinic title (x=${tapX}, y=${tapY}).`);
  return true;
}

async function tapRandomClinicRowCoordinateFallback() {
  const titles = await collectClinicRowTitleElementsInSheet();
  if (!titles.length) {
    console.log('[SUMMARY] Coordinate fallback: no clinic title TextViews passed heuristic.');
    return false;
  }
  const tv = titles[Math.floor(Math.random() * titles.length)];
  return tapClinicSelectionDotToRightOfTitleTextView(tv);
}

async function tapNamedClinicRowCoordinateFallback(needle) {
  const safe = needle.replace(/"/g, '\\"');
  const xpaths = [
    `//*[@text="Choose your clinic"]/following-sibling::android.widget.ScrollView//android.widget.TextView[contains(@text,"${safe}")]`,
    `//*[contains(@text,"Choose your clinic")]/following-sibling::android.widget.ScrollView//android.widget.TextView[contains(@text,"${safe}")]`,
  ];
  const custom = (process.env.COSMEDICS_CLINIC_SCREEN_MARKER || '').trim();
  if (custom) {
    const c = custom.replace(/"/g, '\\"');
    xpaths.unshift(
      `//*[contains(@text,"${c}")]/following-sibling::android.widget.ScrollView//android.widget.TextView[contains(@text,"${safe}")]`
    );
  }
  for (const xp of xpaths) {
    const scoped = await $(xp);
    if (await scoped.isDisplayed().catch(() => false)) {
      const t = ((await scoped.getText().catch(() => '')) || '').trim();
      if (clinicRowTitleHeuristic(t)) {
        return tapClinicSelectionDotToRightOfTitleTextView(scoped);
      }
    }
  }
  return false;
}

async function collectVisibleClinicRadios() {
  const out = [];
  const xpaths = [
    '//android.widget.RadioButton',
    '//androidx.appcompat.widget.AppCompatRadioButton',
  ];
  for (const xp of xpaths) {
    const radios = await $$(xp);
    for (let i = 0; i < radios.length; i++) {
      const el = radios[i];
      if (await el.isDisplayed().catch(() => false)) {
        out.push(el);
      }
    }
  }
  return out;
}

/** Flutter / custom rows sometimes expose a checkable dot instead of RadioButton. */
async function collectCheckableSelectionDots() {
  const out = [];
  const xpaths = [
    '//*[@clickable="true" and @checkable="true"]',
    '//*[@clickable="true" and (@checked="false" or @checked="true")]',
  ];
  for (const xp of xpaths) {
    const els = await $$(xp);
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!(await el.isDisplayed().catch(() => false))) continue;
      const txt = ((await el.getText().catch(() => '')) || '').trim();
      if (/^apply$/i.test(txt)) continue;
      const r = await safeElementRect(el);
      if (!r || r.width > 200 || r.height > 200) continue;
      out.push(el);
    }
  }
  return out;
}

/**
 * Small clickable controls on the right (radio circles); excludes wide rows and Apply.
 */
async function collectRightSideSelectionTargets() {
  const { width: sw, height: sh } = await driver.getWindowSize();
  const minX = Math.round(sw * CLINIC_RADIO_MIN_X_FRACTION);
  const nodes = await $$('//*[@clickable="true"]');
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!(await el.isDisplayed().catch(() => false))) continue;
    const r = await safeElementRect(el);
    if (!r) continue;
    if (r.x + r.width < minX) continue;
    if (r.y < Math.round(sh * 0.18)) continue;
    if (r.width > 160 || r.height > 160) continue;
    if (r.width < 12 || r.height < 12) continue;
    const txt = ((await el.getText().catch(() => '')) || '').trim();
    if (/^apply$/i.test(txt)) continue;
    out.push(el);
  }
  return out;
}

async function collectAllClinicSelectionHitTargets() {
  const radios = await collectVisibleClinicRadios();
  if (radios.length) return radios;
  const dots = await collectCheckableSelectionDots();
  if (dots.length) return dots;
  return collectRightSideSelectionTargets();
}

/**
 * Select the radio whose vertical center is closest to the clinic name row (name text is not tappable for selection).
 */
async function tapRadioOnRowContainingClinicName(needle) {
  const nameEl = await $(`//*[contains(@text,"${needle}")]`);
  if (!(await nameEl.isDisplayed().catch(() => false))) {
    return false;
  }
  const nameRect = await safeElementRect(nameEl);
  if (!nameRect) {
    return false;
  }
  const nameMidY = nameRect.y + nameRect.height / 2;

  const radios = await collectAllClinicSelectionHitTargets();
  let best = null;
  let bestDy = Infinity;
  for (const r of radios) {
    const rr = await safeElementRect(r);
    if (!rr) continue;
    const rMidY = rr.y + rr.height / 2;
    const dy = Math.abs(rMidY - nameMidY);
    if (dy < bestDy && dy < 72) {
      bestDy = dy;
      best = r;
    }
  }
  if (best) {
    await best.click();
    console.log(`[SUMMARY] Tapped clinic selection control aligned with name containing: "${needle}"`);
    return true;
  }
  return tapNamedClinicRowCoordinateFallback(needle);
}

async function tapRandomClinicRadio() {
  const radios = await collectAllClinicSelectionHitTargets();
  if (!radios.length) {
    console.log('[SUMMARY] No native radio/checkable targets — using coordinate tap right of clinic title.');
    return tapRandomClinicRowCoordinateFallback();
  }
  const idx = Math.floor(Math.random() * radios.length);
  await radios[idx].click();
  console.log(`[SUMMARY] Tapped random clinic selection control (index ${idx} of ${radios.length} candidate(s)).`);
  return true;
}

async function waitClinicChooserDismissed(timeoutMs = 15000) {
  invalidateClinicChooserPageSourceCache();
  await driver.waitUntil(async () => !(await isClinicSelectionScreenVisible()), {
    timeout: timeoutMs,
    interval: 120,
    timeoutMsg: 'Clinic chooser ("Choose your clinic") still visible after Apply.',
  });
}

/**
 * If the **Choose your clinic** sheet is present: tap a clinic **radio** (not the name), then **Apply**.
 * Single-clinic accounts may never see this sheet.
 */
async function handleOptionalClinicSelectionAfterLogin() {
  // Sheet usually appears within a few seconds; poll instead of one long idle first.
  await driver.pause(120);
  const deadline = Date.now() + CLINIC_SCREEN_WAIT_MS;
  let clinicSeen = false;
  while (Date.now() < deadline) {
    if (await isClinicSelectionScreenVisible()) {
      clinicSeen = true;
      break;
    }
    await driver.pause(100);
  }

  if (!clinicSeen) {
    console.log(
      '[SUMMARY] No clinic selection screen detected within wait window — treating as single-clinic or direct post-login.'
    );
    return { clinic: 'absent' };
  }

  await driver.pause(Math.min(2000, Math.max(0, POST_LOGIN_PAUSE_MS)));
  console.log('[SUMMARY] Clinic chooser visible — selecting via control on the row (not the clinic name text).');

  await driver
    .waitUntil(
      async () =>
        (await collectAllClinicSelectionHitTargets()).length > 0 ||
        (await collectClinicRowTitleElementsInSheet()).length > 0,
      {
        timeout: 6000,
        interval: 120,
      }
    )
    .catch(() => {
      console.log('[SUMMARY] No clinic selection control visible yet after sheet open — continuing anyway.');
    });

  const needle = (process.env.COSMEDICS_PROVIDER_CLINIC_NAME || '').trim();
  let picked = false;
  let usedNamedRadio = false;
  if (needle) {
    picked = await tapRadioOnRowContainingClinicName(needle);
    if (picked) {
      usedNamedRadio = true;
    } else {
      console.log(
        `[SUMMARY] Could not match a radio to COSMEDICS_PROVIDER_CLINIC_NAME="${needle}" — falling back to random radio.`
      );
    }
  }
  if (!picked) {
    picked = await tapRandomClinicRadio();
  }

  if (!picked) {
    await dumpProviderUiArtifacts('clinic-no-hit-target');
    throw new Error(
      'Clinic chooser is visible but no selection control could be tapped. See artifacts/provider-clinic-no-hit-target-*.xml'
    );
  }

  await driver.pause(180);
  let applied = await tapClinicSheetApplyButton();
  if (!applied) {
    applied = !!(await tapFirstMatchingButton(['Apply', 'APPLY'], 5000));
  }
  if (!applied) {
    const fallback = await tapFirstMatchingButton(['Confirm', 'Select', 'Done', 'OK', 'Continue'], 3500);
    if (fallback) {
      console.log(`[SUMMARY] No "Apply" button; used "${fallback}" instead.`);
    } else {
      throw new Error('Clinic radio tapped but no Apply/Confirm button found.');
    }
  } else {
    console.log('[SUMMARY] Tapped Apply on clinic chooser.');
  }

  await waitClinicChooserDismissed();
  return { clinic: usedNamedRadio ? 'selected_named_radio_apply' : 'selected_random_radio_apply' };
}

/**
 * Provider shell: bottom nav is Home, QR (camera), Notifications, Profile (far right).
 * Does not require the patient Home search field — only that we are past Sign In.
 */
async function clickProviderBottomNavProfile() {
  await driver.hideKeyboard().catch(() => {});

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
    '//*[@text="Profile" and @clickable="true"]',
  ];
  for (const xp of xpaths) {
    if (await tryClick(xp)) {
      console.log('[SUMMARY] Tapped Profile tab (content-desc or clickable label).');
      return;
    }
  }

  try {
    const ui = await $('android=new UiSelector().clickable(true).descriptionContains("Profile")');
    if (await ui.isDisplayed().catch(() => false)) {
      await ui.click();
      console.log('[SUMMARY] Tapped Profile tab (UiSelector descriptionContains Profile).');
      return;
    }
  } catch {
    /* optional */
  }

  const { width, height } = await driver.getWindowSize();
  const cx = Math.round(width * 0.88);
  const cy = Math.round(height * 0.92);
  console.log('[SUMMARY] Profile tab fallback: tap far-right bottom nav (fourth slot).');
  await driver.performActions([
    {
      type: 'pointer',
      id: 'providerProfileTab',
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

async function expectProviderProfileSectionOpened(timeout = 20000) {
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
      if (await $('//*[@text="Settings"]').isDisplayed().catch(() => false)) {
        return true;
      }
      if (await $('//*[@text="My Profile"]').isDisplayed().catch(() => false)) {
        return true;
      }
      if (await $('//*[contains(@text,"Account")]').isDisplayed().catch(() => false)) {
        return true;
      }
      return false;
    },
    {
      timeout,
      timeoutMsg:
        'Provider Profile section not detected (expected Edit Profile, Logout, Subscription, Settings, or similar).',
    }
  );
}

describe('Cosmedics - Provider access from patient Sign In', () => {
  it('opens Provider login, clinic if needed, then opens Profile from bottom nav', async function () {
    this.timeout(Number(process.env.MOCHA_TIMEOUT_MS || 240000));

    if (START_AT_PROFILE) {
      console.log(
        '[SUMMARY] COSMEDICS_PROVIDER_START_AT_PROFILE — skipping sign-in and clinic; assuming provider shell is visible.'
      );
      await driver.pause(Math.max(0, PROFILE_ENTRY_PAUSE_MS));
    } else {
      if (!PROVIDER_EMAIL || !PROVIDER_PASSWORD) {
        throw new Error('Provider email/password missing (defaults should be set in spec — check env stripping).');
      }

      await ensurePatientSignInScreen();
      await (await getPatientSignInTitle()).waitForDisplayed({ timeout: 15000 });
      await getContinueButton();

      await tapProviderAccess();
      await expectProviderLoginScreen();

      await fillProviderCredentials(PROVIDER_EMAIL, PROVIDER_PASSWORD);
      await tapProviderContinue();

      await waitLeavingProviderLoginOrClinicAppears();
      const clinicOutcome = await handleOptionalClinicSelectionAfterLogin();

      const landingMs = Math.min(2000, Math.max(0, POST_CLINIC_LANDING_PAUSE_MS));
      await driver.pause(landingMs);
      console.log(
        `[SUMMARY] Provider login flow finished. Clinic handling: ${clinicOutcome.clinic} (landing pause ${landingMs}ms, max 2000ms).`
      );
    }

    console.log('[SUMMARY] Bottom nav: open Profile (far right; order Home → QR → Notifications → Profile).');
    await clickProviderBottomNavProfile();
    await expectProviderProfileSectionOpened();
    console.log('[SUMMARY] Provider Profile section is visible.');
  });
});

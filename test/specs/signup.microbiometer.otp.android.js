const { $, expect } = require('@wdio/globals')
const { execSync } = require('node:child_process')

const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS || 1000)
const OTP_TIMEOUT_MS = Number(process.env.OTP_TIMEOUT_MS || 120000)
const OTP_POLL_INTERVAL_MS = Number(process.env.OTP_POLL_INTERVAL_MS || 5000)
const APP_PACKAGE = process.env.APP_PACKAGE || 'com.pes.microbiometer'
const APP_ACTIVITY = process.env.APP_ACTIVITY || 'com.pes.microbiometer.MainActivity'
const UDID = process.env.UDID || '38231FDJH006GC'
const RESET_APP = process.env.RESET_APP === 'true'
const DIGIT_KEYCODE_OFFSET = 7 // Android keycode for '0' is 7

function randomSuffix(length = 6) {
  return Math.random().toString(36).slice(2, 2 + length)
}

function randomUser() {
  const name = `User${randomSuffix(5)}`
  const password = 'Password123'
  return {
    name,
    inbox: name.toLowerCase(),
    email: `${name.toLowerCase()}@mailinator.com`,
    password,
  }
}

async function fetchLatestOtpFromMailinator(inbox) {
  const inboxUrl = `https://www.mailinator.com/api/v2/domains/public/inboxes/${encodeURIComponent(inbox)}`
  const inboxResponse = await fetch(inboxUrl)
  if (!inboxResponse.ok) {
    throw new Error(`Mailinator inbox request failed: ${inboxResponse.status}`)
  }

  const inboxJson = await inboxResponse.json()
  const msgs = inboxJson.msgs || []
  if (!msgs.length) {
    return null
  }

  const latest = msgs[0]
  const messageUrl = `https://www.mailinator.com/api/v2/domains/public/inboxes/${encodeURIComponent(inbox)}/messages/${encodeURIComponent(latest.id)}`
  const messageResponse = await fetch(messageUrl)
  if (!messageResponse.ok) {
    throw new Error(`Mailinator message request failed: ${messageResponse.status}`)
  }

  const messageJson = await messageResponse.json()
  const parts = messageJson.parts || []
  const textPart = parts.find((p) => (p.headers?.['content-type'] || '').includes('text/plain'))
  const body = textPart?.body || ''
  const otpMatch = body.match(/\b(\d{5})\b/)
  return otpMatch ? otpMatch[1] : null
}

async function waitForOtp(inbox) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < OTP_TIMEOUT_MS) {
    console.log(`[STEP] Checking Mailinator inbox: ${inbox}`)
    const otp = await fetchLatestOtpFromMailinator(inbox)
    if (otp) {
      return otp
    }
    await browser.pause(OTP_POLL_INTERVAL_MS)
  }
  throw new Error(`OTP not found within ${OTP_TIMEOUT_MS}ms for inbox "${inbox}"`)
}

async function enterOtpWithKeyEvents(otp) {
  const otpInput = await $('//android.widget.EditText[contains(@hint,"0")]')
  await otpInput.click()
  await otpInput.clearValue()
  await browser.pause(300)

  for (const digit of otp) {
    const keyCode = DIGIT_KEYCODE_OFFSET + Number(digit)
    await driver.pressKeyCode(keyCode)
    await browser.pause(300)
  }
}

async function typeMaskedField(input, value, label) {
  await input.click()
  await input.clearValue()
  await browser.pause(250)
  for (const ch of value) {
    await input.addValue(ch)
    await browser.pause(80)
  }
  const fieldText = (await input.getAttribute('text')) || ''
  await expect(fieldText.length).toBeGreaterThan(0)
  console.log(`[STEP] ${label} entered`)
}

async function forceConfirmPassword(input, value) {
  console.log(`[STEP] Confirm Password value: ${value}`)
  await typeMaskedField(input, value, 'Confirm Password')
  // Extra pass to avoid stale keyboard state on some runs/devices.
  await input.click()
  await input.clearValue()
  await browser.pause(200)
  for (const ch of value) {
    await input.addValue(ch)
    await browser.pause(60)
  }
  const confirmText = (await input.getAttribute('text')) || ''
  await expect(confirmText.length).toBeGreaterThan(0)
  console.log('[STEP] Confirm Password overwrite pass completed')
}

async function togglePasswordVisibility(input, label) {
  const iconLocators = [
    'android=new UiSelector().descriptionMatches("(?i).*show.*password.*|.*hide.*password.*|.*eye.*")',
    'android=new UiSelector().textMatches("(?i).*show.*|.*hide.*|.*eye.*")',
    '//android.widget.ImageView[contains(@content-desc,"password") or contains(@content-desc,"eye") or contains(@content-desc,"Show") or contains(@content-desc,"Hide")]',
  ]

  for (const locator of iconLocators) {
    try {
      const icon = await $(locator)
      if (await icon.isDisplayed()) {
        await icon.click()
        await browser.pause(250)
        console.log(`[STEP] ${label} visibility toggled via icon locator`)
        return
      }
    } catch {
      // Try next locator.
    }
  }

  try {
    const rect = await input.getRect()
    const x = Math.round(rect.x + rect.width - 24)
    const y = Math.round(rect.y + rect.height / 2)
    await browser.execute('mobile: clickGesture', { x, y })
    await browser.pause(250)
    console.log(`[STEP] ${label} visibility toggled via field-right tap`)
  } catch {
    console.log(`[STEP] ${label} visibility toggle not found, continuing`)
  }
}

function resetAndLaunchApp() {
  execSync(`adb -s ${UDID} shell pm clear ${APP_PACKAGE}`, { stdio: 'pipe' })
  execSync(`adb -s ${UDID} shell monkey -p ${APP_PACKAGE} -c android.intent.category.LAUNCHER 1`, { stdio: 'pipe' })
}

async function handleNotificationPermissionIfShown() {
  const allowById = await $('android=new UiSelector().resourceId("com.android.permissioncontroller:id/permission_allow_button")')
  const allowByText = await $('android=new UiSelector().className("android.widget.Button").textMatches("(?i)allow|while using the app|ok")')
  const denyById = await $('android=new UiSelector().resourceId("com.android.permissioncontroller:id/permission_deny_button")')

  if (await allowById.isDisplayed()) {
    console.log('[STEP] Notification permission popup detected, tapping Allow')
    await allowById.click()
    await browser.pause(800)
    return
  }

  if (await allowByText.isDisplayed()) {
    console.log('[STEP] Notification permission popup detected (text match), tapping Allow')
    await allowByText.click()
    await browser.pause(800)
    return
  }

  if (await denyById.isDisplayed()) {
    console.log('[STEP] Permission dialog present without Allow match, falling back to deny')
    await denyById.click()
    await browser.pause(800)
  }
}

async function ensureAppIsForeground(maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    const currentPackage = await driver.getCurrentPackage()
    if (currentPackage === APP_PACKAGE) {
      return
    }
    console.log(`[STEP] App moved to ${currentPackage || 'unknown'}, re-activating ${APP_PACKAGE}`)
    await driver.activateApp(APP_PACKAGE)
    await browser.pause(1000)
  }
  throw new Error(`Unable to keep app in foreground (${APP_PACKAGE})`)
}

async function ensureCreateAccountScreen() {
  for (let i = 0; i < 8; i++) {
    const createAccountHeader = await $('~Create Account')
    if (await createAccountHeader.isDisplayed()) return

    const loginHeader = await $('~Login to Your Account')
    if (await loginHeader.isDisplayed()) {
      console.log('[STEP] Navigating from Login to Create Account')
      const signUpLink = await $('//*[contains(@content-desc,"Sign Up") or contains(@content-desc,"Create Account") or contains(@content-desc,"Already") or contains(@content-desc,"account")]')
      await signUpLink.click()
      await browser.pause(1200)
      continue
    }

    const privacyHeader = await $('~Privacy & Terms')
    if (await privacyHeader.isDisplayed()) {
      console.log('[STEP] Accepting Privacy & Terms')
      const switches = await $$('//android.widget.Switch')
      for (const sw of switches) {
        const checked = await sw.getAttribute('checked')
        if (checked !== 'true') {
          await sw.click()
          await browser.pause(350)
        }
      }
      // Scroll the consent page to reveal Continue.
      await browser.execute('mobile: swipeGesture', {
        left: 0, top: 700, width: 1080, height: 1400, direction: 'up', percent: 0.9,
      })
      await browser.pause(800)
      const continueBtn = await $('~Continue')
      if (await continueBtn.isDisplayed()) {
        await continueBtn.click()
        await browser.pause(1200)
      }
      continue
    }

    const otpHeader = await $('~Enter OTP')
    if (await otpHeader.isDisplayed()) {
      console.log('[STEP] On OTP screen unexpectedly, navigating back to login')
      await driver.back()
      await browser.pause(1000)
      continue
    }

    const selectVersionTitle = await $('~Select Version')
    if (await selectVersionTitle.isDisplayed()) {
      console.log('[STEP] On Select Version screen unexpectedly, navigating back')
      await driver.back()
      await browser.pause(1000)
      continue
    }

    // Unknown state: one back press and retry.
    console.log('[STEP] Unknown startup state, trying back navigation')
    await driver.back()
    await browser.pause(1000)
  }

  throw new Error('Unable to reach Create Account screen from current app state')
}

async function isEmailVerifiedScreenVisible() {
  const headerSelectors = [
    '~Email Verified',
    '~Email verified',
    '//*[contains(@content-desc,"Verified") and (contains(@content-desc,"Email") or contains(@content-desc,"email"))]',
  ]
  for (const sel of headerSelectors) {
    const el = await $(sel)
    try {
      if (await el.isDisplayed()) return true
    } catch {
      /* element not in hierarchy */
    }
  }
  return false
}

async function tapContinueAfterEmailVerified() {
  await ensureAppIsForeground()

  const tryClick = async (label, locator) => {
    const el = typeof locator === 'function' ? await locator() : await locator
    await el.waitForDisplayed({ timeout: 8000 })
    await el.click()
    console.log(`[STEP] Email Verified — tapped Continue (${label})`)
  }

  const locatorAttempts = [
    ['XPath clickable content-desc Continue', () => $('//*[@clickable="true" and contains(@content-desc,"Continue")]')],
    ['UiSelector Button text Continue', () => $('android=new UiSelector().className("android.widget.Button").textMatches("(?i)^Continue$")')],
    ['UiSelector clickable text Continue', () => $('android=new UiSelector().clickable(true).textMatches("(?i)^Continue$")')],
    ['UiSelector text Contains Continue', () => $('android=new UiSelector().textMatches("(?i).*Continue.*")')],
    ['accessibility ~Continue', () => $('~Continue')],
  ]

  for (const [label, getLocator] of locatorAttempts) {
    try {
      await tryClick(label, getLocator)
      return
    } catch (err) {
      console.log(`[STEP] Email Verified Continue strategy "${label}" failed: ${err.message || err}`)
    }
  }

  const continues = await $$('~Continue')
  for (let i = continues.length - 1; i >= 0; i--) {
    const btn = continues[i]
    try {
      if (await btn.isDisplayed()) {
        await btn.click()
        console.log('[STEP] Email Verified — tapped ~Continue instance', i)
        return
      }
    } catch {
      /* try next */
    }
  }

  await browser.execute('mobile: swipeGesture', {
    left: 0, top: 900, width: 1080, height: 900, direction: 'up', percent: 0.65,
  })
  await browser.pause(600)

  for (const [label, getLocator] of locatorAttempts.slice(0, 3)) {
    try {
      await tryClick(`${label} after scroll`, getLocator)
      return
    } catch (err) {
      console.log(`[STEP] After scroll, "${label}" failed: ${err.message || err}`)
    }
  }

  throw new Error('Could not tap Continue on Email Verified screen')
}

async function dismissEmailVerifiedIfShown() {
  const deadline = Date.now() + 22000
  while (Date.now() < deadline) {
    await ensureAppIsForeground()
    const selectVersionEarly = await $('~Select Version')
    try {
      if (await selectVersionEarly.isDisplayed()) return
    } catch {
      /* not on Select Version yet */
    }
    if (await isEmailVerifiedScreenVisible()) {
      console.log('[STEP] Email Verified screen detected, tapping Continue')
      await tapContinueAfterEmailVerified()
      await browser.pause(1500)
      return
    }
    await browser.pause(400)
  }
}

async function waitForEmailVerifiedContinueThenSelectVersion(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let emailVerifiedSeen = false

  while (Date.now() < deadline) {
    await ensureAppIsForeground()

    if (await isEmailVerifiedScreenVisible()) {
      emailVerifiedSeen = true
      console.log('[STEP] Email Verified screen detected, tapping Continue')
      await tapContinueAfterEmailVerified()
      break
    }

    await browser.pause(400)
  }

  if (!emailVerifiedSeen) {
    throw new Error(`Email Verified screen did not appear within ${timeoutMs}ms after OTP submit`)
  }

  const selectVersionTitle = await $('~Select Version')
  await selectVersionTitle.waitForDisplayed({ timeout: timeoutMs })
  await expect(selectVersionTitle).toBeDisplayed()
}

async function clickWithFallback(label, locatorAttempts) {
  for (const [strategy, getLocator] of locatorAttempts) {
    try {
      const el = await getLocator()
      await el.waitForDisplayed({ timeout: 8000 })
      await el.click()
      console.log(`[STEP] ${label} clicked (${strategy})`)
      return
    } catch (err) {
      console.log(`[STEP] ${label} strategy "${strategy}" failed: ${err.message || err}`)
    }
  }
  throw new Error(`${label} not found/clickable with any locator strategy`)
}

async function clickGreenLogoutConfirmation(maxAttempts = 3) {
  const tapBottomRightLogoutArea = async () => {
    const rect = await driver.getWindowRect()
    const x = Math.round(rect.width * 0.78)
    const y = Math.round(rect.height * 0.93)
    await browser.execute('mobile: clickGesture', { x, y })
  }

  const quickStrategies = [
    ['Android Button text Logout', async () => {
      const el = await $('android=new UiSelector().className("android.widget.Button").textMatches("(?i)^Logout$")')
      await el.waitForDisplayed({ timeout: 1200 })
      await el.click()
    }],
    ['XPath button text Logout', async () => {
      const el = await $('//android.widget.Button[contains(@text,"Logout")]')
      await el.waitForDisplayed({ timeout: 1200 })
      await el.click()
    }],
    ['XPath clickable text/content-desc Logout', async () => {
      const el = await $('(//*[@clickable="true" and (contains(@text,"Logout") or contains(@content-desc,"Logout"))])[last()]')
      await el.waitForDisplayed({ timeout: 1200 })
      await el.click()
    }],
    ['accessibility ~Logout', async () => {
      const el = await $('~Logout')
      await el.waitForDisplayed({ timeout: 1200 })
      await el.click()
    }],
    ['UiSelector text exact Logout', async () => {
      const el = await $('android=new UiSelector().textMatches("(?i)^Logout$")')
      await el.waitForDisplayed({ timeout: 1200 })
      await el.click()
    }],
    ['Coordinate tap on popup right button area', async () => {
      await tapBottomRightLogoutArea()
    }],
  ]

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const [label, action] of quickStrategies) {
      try {
        await action()
        console.log(`[STEP] Logout confirmation clicked (${label}) on attempt ${attempt}`)
        await browser.pause(900)
        await ensureAppIsForeground()
        return
      } catch (error) {
        console.log(`[STEP] Logout confirmation strategy "${label}" failed on attempt ${attempt}: ${error.message || error}`)
      }
    }
    await browser.pause(500)
  }
  throw new Error('Green Logout confirmation button not clicked')
}

async function isLoginScreenVisible() {
  const loginHeader = await $('~Login to Your Account')
  const loginButton = await $('//*[contains(@content-desc,"Login") or contains(@text,"Login")]')
  const emailInput = await $('//android.widget.EditText')

  try {
    if (await loginHeader.isDisplayed()) return true
  } catch {}
  try {
    if (await loginButton.isDisplayed()) return true
  } catch {}
  try {
    if (await emailInput.isDisplayed()) return true
  } catch {}
  return false
}

async function detectCurrentScreenLabel() {
  const markers = [
    ['Login', '~Login to Your Account'],
    ['Select Version', '~Select Version'],
    ['Create Account', '~Create Account'],
    ['Enter OTP', '~Enter OTP'],
    ['Privacy & Terms', '~Privacy & Terms'],
    ['Email Verified', '~Email Verified'],
    ['Project Management', '~Project Management'],
  ]

  for (const [label, selector] of markers) {
    const el = await $(selector)
    try {
      if (await el.isDisplayed()) return label
    } catch {
      // ignore and continue
    }
  }
  return 'Other/Unknown'
}

async function logoutThenLoginWithCreatedUser(user) {
  await ensureAppIsForeground()

  await browser.pause(2000)
  await clickWithFallback('Logout', [
    ['XPath top-right clickable icon on Select Version', () => $('//android.view.View[@content-desc="Select Version"]/following-sibling::android.widget.ImageView[@clickable="true"]')],
    ['XPath clickable icon excluding PRO/CLASSIC cards', () => $('//android.widget.ImageView[@clickable="true" and not(@content-desc="PRO") and not(@content-desc="CLASSIC")]')],
    ['accessibility ~Logout', () => $('~Logout')],
    ['UiSelector text Logout', () => $('android=new UiSelector().textMatches("(?i)^Logout$")')],
    ['XPath content-desc contains Logout', () => $('//*[contains(@content-desc,"Logout")]')],
    ['XPath text contains Logout', () => $('//*[contains(@text,"Logout")]')],
  ])

  // Some builds navigate to an intermediate account screen where we must click Logout again.
  await browser.pause(2000)
  await clickGreenLogoutConfirmation(3)

  // After confirming logout, app may show loading and then land on different screens by build/state.
  const loginVisible = await browser.waitUntil(async () => isLoginScreenVisible(), {
    timeout: 15000,
    interval: 500,
    timeoutMsg: 'Login markers not visible yet',
  }).then(() => true).catch(() => false)

  if (!loginVisible) {
    const screenLabel = await detectCurrentScreenLabel()
    console.log(`[STEP] After second logout landed on: ${screenLabel}`)
    console.log('[STEP] Login screen not detected after logout confirmation; continuing without forced login assertion')
    return
  }

  console.log('[STEP] Login screen loaded')

  const inputs = await $$('//android.widget.EditText')
  await expect(inputs.length).toBeGreaterThanOrEqual(2)
  const [emailInput, passwordInput] = inputs

  await emailInput.click()
  await emailInput.clearValue()
  await emailInput.setValue(user.email)

  await passwordInput.click()
  await passwordInput.clearValue()
  await passwordInput.setValue(user.password)
  console.log(`[STEP] Logging in with created user: ${user.email}`)

  try {
    await driver.hideKeyboard()
  } catch {
    // Keyboard may already be hidden.
  }

  await clickWithFallback('Login', [
    ['accessibility ~Login', () => $('~Login')],
    ['UiSelector text Login', () => $('android=new UiSelector().textMatches("(?i)^Login$")')],
    ['XPath content-desc contains Login', () => $('//*[contains(@content-desc,"Login")]')],
    ['XPath text contains Login', () => $('//*[contains(@text,"Login")]')],
  ])
}

describe('MicroBiometer - Signup With Mailinator OTP', () => {
  let user

  beforeEach(async function () {
    user = randomUser()
    console.log(`\n[RUNNING] ${this.currentTest.title}`)
    console.log(`[STEP] Generated user: ${user.name}`)
    console.log(`[STEP] Generated email: ${user.email}`)
    if (RESET_APP) {
      console.log('[STEP] Resetting app data for clean signup flow')
      resetAndLaunchApp()
      await driver.activateApp(APP_PACKAGE)
      await browser.pause(1200)
      await handleNotificationPermissionIfShown()
      await ensureAppIsForeground()
      await handleNotificationPermissionIfShown()
      await ensureAppIsForeground()
    } else {
      await driver.activateApp(APP_PACKAGE)
      await browser.pause(1000)
      await ensureAppIsForeground()
    }
    await ensureCreateAccountScreen()
  })

  afterEach(async function () {
    const status = this.currentTest.state === 'passed' ? 'PASSED' : 'FAILED'
    console.log(`[${status}] ${this.currentTest.title}`)
  })

  it('creates account and verifies OTP from Mailinator', async () => {
    const createAccountHeader = await $('~Create Account')
    await createAccountHeader.waitForDisplayed({ timeout: 20000 })

    const inputs = await $$('//android.widget.EditText')
    await expect(inputs.length).toBeGreaterThanOrEqual(4)
    const [nameInput, emailInput, createPasswordInput, confirmPasswordInput] = inputs

    console.log('[STEP] Filling signup form')
    await nameInput.click()
    await nameInput.clearValue()
    await nameInput.setValue(user.name)
    await expect((await nameInput.getAttribute('text')) || '').toBe(user.name)
    await browser.pause(STEP_DELAY_MS)

    await emailInput.click()
    await emailInput.clearValue()
    await emailInput.setValue(user.email)
    await expect((await emailInput.getAttribute('text')) || '').toBe(user.email)
    await browser.pause(STEP_DELAY_MS)

    console.log(`[STEP] Create Password value: ${user.password}`)
    await typeMaskedField(createPasswordInput, user.password, 'Create Password')
    await togglePasswordVisibility(createPasswordInput, 'Create Password')
    await browser.pause(STEP_DELAY_MS)

    console.log('[STEP] Confirming password with the same value')
    await forceConfirmPassword(confirmPasswordInput, user.password)
    await togglePasswordVisibility(confirmPasswordInput, 'Confirm Password')
    const mismatchError = await $('//*[contains(@content-desc,"Passwords don\'t match")]')
    if (await mismatchError.isDisplayed()) {
      console.log('[STEP] Password mismatch detected, retrying confirm password entry')
      await forceConfirmPassword(confirmPasswordInput, user.password)
    }
    await browser.pause(STEP_DELAY_MS)

    try {
      await driver.hideKeyboard()
    } catch (error) {
      // Keyboard may already be hidden.
    }
    await browser.pause(500)

    const continueButton = await $('~Continue')
    await continueButton.waitForDisplayed({ timeout: 10000 })
    console.log('[STEP] Submitting signup form')
    await continueButton.click()

    const otpHeader = await $('~Enter OTP')
    await otpHeader.waitForDisplayed({ timeout: 30000 })
    console.log('[STEP] OTP screen opened')

    const otp = await waitForOtp(user.inbox)
    console.log(`[STEP] OTP fetched: ${otp}`)
    console.log(`[STEP] Entering OTP: ${otp}`)

    await enterOtpWithKeyEvents(otp)
    await browser.pause(STEP_DELAY_MS)

    const submitButton = await $('~Submit')
    console.log('[STEP] Submitting OTP')
    await submitButton.click()
    await waitForEmailVerifiedContinueThenSelectVersion(30000)

    const selectVersionTitle = await $('~Select Version')
    await selectVersionTitle.waitForDisplayed({ timeout: 30000 })
    await expect(selectVersionTitle).toBeDisplayed()
    await expect(await $('~PRO')).toBeDisplayed()
    await expect(await $('~CLASSIC')).toBeDisplayed()

    console.log('[STEP] Signup completed. Staying on Select Version screen for next test steps.')
  })
})

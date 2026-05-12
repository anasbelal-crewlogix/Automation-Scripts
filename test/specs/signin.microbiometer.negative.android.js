const { $, $$, expect } = require('@wdio/globals')

const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS || 1000)
const POST_SUBMIT_WAIT_MS = Number(process.env.POST_SUBMIT_WAIT_MS || 3000)
const APP_PACKAGE = process.env.APP_PACKAGE || 'com.microbiometer.app'

describe('MicroBiometer - Negative Sign In Suite', () => {
  async function openSignInScreen() {
    await driver.activateApp(APP_PACKAGE)
    await browser.waitUntil(async () => {
      const loginButton = await $('~Login')
      if (await loginButton.isDisplayed()) {
        return true
      }
      const inputs = await $$('//android.widget.EditText')
      return inputs.length >= 2
    }, {
      timeout: 20000,
      timeoutMsg: 'Login screen not detected (Login button or 2 input fields missing)',
    })
  }

  async function getCredentialsInputs() {
    const inputs = await $$('//android.widget.EditText')
    await expect(inputs).toBeElementsArrayOfSize(2)
    return { emailInput: inputs[0], passwordInput: inputs[1] }
  }

  async function clearField(input) {
    await input.click()
    await input.clearValue()
    await browser.pause(300)
  }

  async function typeValue(input, value, label, options = {}) {
    const { isPassword = false } = options
    await clearField(input)
    if (value) {
      await input.setValue(value)
    }
    await browser.pause(STEP_DELAY_MS)
    const actual = (await input.getAttribute('text')) || ''
    if (isPassword && value) {
      // Many apps return masked bullets for secure fields.
      await expect(actual.length).toBeGreaterThan(0)
    } else {
      await expect(actual).toBe(value || '')
    }
    console.log(`[STEP] ${label}: "${value || ''}"`)
  }

  async function signInAndValidateStayedOnScreen() {
    try {
      await driver.hideKeyboard()
      await browser.pause(500)
    } catch (error) {
      // Keyboard might already be hidden on some devices.
    }

    const loginButton = await $('~Login')
    await loginButton.waitForDisplayed({ timeout: 10000 })
    console.log('[STEP] Tapping Login')
    await loginButton.click()
    await browser.pause(POST_SUBMIT_WAIT_MS)
    await loginButton.waitForEnabled({ timeout: 15000 })

    await expect(await driver.getCurrentPackage()).toBe(APP_PACKAGE)

    // Keep assertion flexible when accessibility label differs by app build.
    const inputs = await $$('//android.widget.EditText')
    await expect(inputs.length).toBeGreaterThanOrEqual(1)
  }

  beforeEach(async function () {
    console.log(`\n[RUNNING] ${this.currentTest.title}`)
    await openSignInScreen()
  })

  afterEach(async function () {
    const status = this.currentTest.state === 'passed' ? 'PASSED' : 'FAILED'
    console.log(`[${status}] ${this.currentTest.title}`)
  })

  it('invalid email + invalid password', async () => {
    const { emailInput, passwordInput } = await getCredentialsInputs()
    await typeValue(emailInput, 'invalid-email', 'Email')
    await typeValue(passwordInput, 'wrongPass123', 'Password', { isPassword: true })
    await signInAndValidateStayedOnScreen()
  })

  it('empty email + invalid password', async () => {
    const { emailInput, passwordInput } = await getCredentialsInputs()
    await typeValue(emailInput, '', 'Email')
    await typeValue(passwordInput, 'wrongPass123', 'Password', { isPassword: true })
    await signInAndValidateStayedOnScreen()
  })

  it('invalid email + empty password', async () => {
    const { emailInput, passwordInput } = await getCredentialsInputs()
    await typeValue(emailInput, 'invalid-email', 'Email')
    await typeValue(passwordInput, '', 'Password')
    await signInAndValidateStayedOnScreen()
  })

  it('empty email + empty password', async () => {
    const { emailInput, passwordInput } = await getCredentialsInputs()
    await typeValue(emailInput, '', 'Email')
    await typeValue(passwordInput, '', 'Password')
    await signInAndValidateStayedOnScreen()
  })

  it('eye button toggles password visibility on and off', async () => {
    const { passwordInput } = await getCredentialsInputs()
    await typeValue(passwordInput, 'Secret@123', 'Password', { isPassword: true })

    const eyeButton = await $('(//android.widget.EditText)[2]/following-sibling::android.view.View[1]')
    const beforeToggle = await passwordInput.getAttribute('password')
    await eyeButton.click()
    await browser.pause(STEP_DELAY_MS)
    const afterFirstToggle = await passwordInput.getAttribute('password')

    await eyeButton.click()
    await browser.pause(STEP_DELAY_MS)
    const afterSecondToggle = await passwordInput.getAttribute('password')

    await expect(afterFirstToggle).not.toBe(beforeToggle)
    await expect(afterSecondToggle).toBe(beforeToggle)
  })
})

const { $, $$, expect } = require('@wdio/globals')

const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS || 1000)
const POST_SUBMIT_WAIT_MS = Number(process.env.POST_SUBMIT_WAIT_MS || 3000)

describe('Crewlogix - Negative Sign In Suite', () => {
  const appPackage = 'com.crewlogix.projectPrototype'

  async function openSignInScreen() {
    await driver.activateApp(appPackage)
    const signInHeader = await $('~Sign In')
    await signInHeader.waitForDisplayed({ timeout: 20000 })
    return signInHeader
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

  async function typeValue(input, value, label) {
    await clearField(input)
    if (value) {
      await input.setValue(value)
    }
    await browser.pause(STEP_DELAY_MS)
    const actual = await input.getAttribute('text')
    const expected = value || ''
    await expect(actual || '').toBe(expected)
    console.log(`[STEP] ${label}: "${expected}"`)
  }

  async function signInAndValidateStayedOnScreen() {
    const signInButton = await $('//android.widget.Button[@content-desc="Sign In"]')
    await signInButton.click()
    await browser.pause(POST_SUBMIT_WAIT_MS)
    await signInButton.waitForEnabled({ timeout: 15000 })

    const signInHeader = await $('~Sign In')
    await expect(signInHeader).toBeDisplayed()
    await expect(await driver.getCurrentPackage()).toBe(appPackage)
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
    await typeValue(passwordInput, 'wrongPass123', 'Password')

    await signInAndValidateStayedOnScreen()
  })

  it('empty email + invalid password', async () => {
    const { emailInput, passwordInput } = await getCredentialsInputs()

    await typeValue(emailInput, '', 'Email')
    await typeValue(passwordInput, 'wrongPass123', 'Password')

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

    await clearField(passwordInput)
    await passwordInput.setValue('Secret@123')
    await browser.pause(STEP_DELAY_MS)

    const eyeButton = await $('(//android.widget.EditText)[2]//android.widget.Button')
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

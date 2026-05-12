const { $, $$, driver, expect } = require('@wdio/globals')
const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS || 2500)
const POST_SUBMIT_WAIT_MS = Number(process.env.POST_SUBMIT_WAIT_MS || 5000)

describe('Realtec Kiosk App - Negative Sign In', () => {
  it('should stay on sign-in screen with invalid credentials', async () => {
    console.log(`[DEMO] Waiting ${STEP_DELAY_MS}ms between actions`)

    const signInHeader = await $('~Sign In')
    await signInHeader.waitForDisplayed({ timeout: 20000 })
    await driver.pause(STEP_DELAY_MS)

    const inputs = await $$('//android.widget.EditText')
    await expect(inputs).toBeElementsArrayOfSize(2)

    console.log('[DEMO] Entering invalid username')
    await inputs[0].click()
    await driver.pause(800)
    await inputs[0].setValue('invalid_user')
    await driver.pause(STEP_DELAY_MS)

    console.log('[DEMO] Entering invalid pin')
    await inputs[1].click()
    await driver.pause(800)
    await inputs[1].setValue('0000')
    await driver.pause(STEP_DELAY_MS)

    const signInButton = await $('//android.widget.Button[@content-desc="Sign In"]')
    console.log('[DEMO] Tapping Sign In')
    await signInButton.click()
    console.log(`[DEMO] Waiting ${POST_SUBMIT_WAIT_MS}ms for login response/loading to finish`)
    await driver.pause(POST_SUBMIT_WAIT_MS)

    const currentActivity = await driver.getCurrentActivity()
    console.log(`[DEMO] Current activity after invalid sign in: ${currentActivity}`)

    // Ensure submit control is usable again (loading finished)
    await signInButton.waitForEnabled({ timeout: 15000 })
    await expect(currentActivity).toContain('MainActivity')
    await expect(signInHeader).toBeDisplayed()
  })
})

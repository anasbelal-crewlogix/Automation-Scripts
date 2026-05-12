exports.config = {
  runner: 'local',
  specs: ['./test/specs/**/*.android.js'],
  maxInstances: 1,
  logLevel: 'error',
  logLevels: {
    webdriver: 'error',
    '@wdio/utils': 'error',
    '@wdio/local-runner': 'error',
  },
  bail: 0,
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 1,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: Number(process.env.MOCHA_TIMEOUT_MS || 120000),
  },
  // Start Appium on 4723 when you run `npm run wdio:...` (no separate `appium` terminal).
  // On some Windows setups the first boot can be slow (ADB/SDK warmup), so give Appium more time to come up.
  services: [
    [
      'appium',
      {
        appiumStartTimeout: 120000,
        logPath: './logs',
      },
    ],
  ],
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:udid': process.env.UDID || '5bf59d26',
    'appium:deviceName': process.env.DEVICE_NAME || process.env.UDID || '5bf59d26',
    'appium:appPackage': process.env.APP_PACKAGE || 'com.crewlogix.projectPrototype',
    'appium:appActivity': process.env.APP_ACTIVITY || 'com.crewlogix.projectPrototype.MainActivity',
    'appium:noReset': true,
    'appium:uiautomator2ServerInstallTimeout': 120000,
    'appium:adbExecTimeout': 120000,
    'appium:newCommandTimeout': 120,
    // Avoid UiAutomator2 XPath2 bugs with axes like following:: (see Cosmedics location picker).
    'appium:enforceXPath1': true,
  }],
}

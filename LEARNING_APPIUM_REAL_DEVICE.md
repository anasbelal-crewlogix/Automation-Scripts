# Appium Learning - Real Device (USB)

This guide is for beginners.  
Goal: connect a real Android phone with USB, verify setup, and share the correct app/device details so test automation can be created quickly.

## 1) What You Need

- Android phone
- USB cable (data cable, not charge-only)
- Developer Options enabled on phone
- USB Debugging enabled
- Appium + ADB installed on laptop

## 2) First-Time Phone Setup

1. Open phone `Settings`.
2. Go to `About phone`.
3. Tap `Build number` 7 times (this enables Developer Options).
4. Go to `Developer options`.
5. Turn ON `USB debugging`.
6. Connect phone to laptop using USB.
7. On popup `Allow USB debugging?`, tap `Allow`.
8. Check `Always allow from this computer`.

## 3) Verify Device Connection

Run this in terminal:

```bash
adb devices
```

Expected output should include:

```text
<your-device-id>    device
```

If you see:
- `unauthorized`: unlock phone and accept debug popup
- `offline`: reconnect cable, restart ADB, try again
- no device: check USB mode is file transfer/data, not charge only

## 4) Quick Fix Commands (if connection fails)

```bash
adb kill-server
adb start-server
adb devices
```

## 5) How to Get App Details (Important)

For Android Appium testing, we usually need:

- `deviceName` (can be the device id from adb)
- `udid` (same as device id from adb)
- `platformName` = `Android`
- `automationName` = `UiAutomator2`
- app package name
- app activity name (launch activity)

Helpful commands:

```bash
adb devices
adb shell dumpsys window | findstr mCurrentFocus
```

If app is already open, `mCurrentFocus` usually helps identify package/activity.

## 6) What You Should Send Me Each Time

Use this template:

```text
Scenario:
I want to automate [feature name]

Device:
- platformName: Android
- udid: [from adb devices]
- deviceName: [same as udid or model]
- androidVersion: [optional]

App:
- apk path OR installed app package: [e.g., com.example.app]
- app activity: [e.g., com.example.app.MainActivity]

Test Steps:
1) ...
2) ...
3) ...

Expected Result:
- ...

Evidence (if locator issues):
- screenshot
- page source
```

## 7) Locator Priority (Best Practice)

Use this order:
1. accessibility id / content-desc
2. resource-id
3. text (only if stable)
4. xpath (last option)

## 8) Your Standard Daily Flow

1. Connect phone with USB.
2. Ensure phone is unlocked.
3. Run `adb devices` and confirm status is `device`.
4. Start Appium and run tests.
5. If test fails, share screenshot + page source + error.

## 9) Common Beginner Mistakes

- USB cable supports charging only
- phone screen locked during run
- USB debugging permission not granted
- unstable locators (overusing xpath)
- missing package/activity details

## 10) Next Step

After you confirm `adb devices` shows `device`, we can create your first real test:
- launch app
- verify home screen
- perform one basic action

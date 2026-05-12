# Automation-Scripts

Monorepo for WebdriverIO + Appium automation. Each product has its own folder under `projects/`. Shared Page Object code lives under `shared/`.

## Layout

| Path | Purpose |
|------|---------|
| `projects/cosmedics/` | Cosmedics Android specs (`specs/`), docs, and static UI dumps (`fixtures/`) |
| `projects/crewlogix/` | Crewlogix Android specs |
| `projects/microbiometer/` | Microbiometer Android specs |
| `projects/android-generic/` | Android specs not tied to one branded folder |
| `projects/web-demo/` | Browser demo spec (Chrome / non-Appium default config) |
| `shared/pageobjects/` | Reusable Page Objects (e.g. web demo) |
| `wdio.conf.js` | Default WebdriverIO config (web demo specs) |
| `wdio.android.conf.js` | Android + Appium service (crewlogix, microbiometer, android-generic by default) |

## Adding a new project

1. Create `projects/<name>/specs/` and add your `*.js` spec files.
2. Register the glob in `wdio.android.conf.js` under `specs` (or run only that project with `wdio run ./wdio.android.conf.js --spec ./projects/<name>/specs/your.spec.js`).
3. Add npm scripts in `package.json` if you want one-command runs with env vars.

## Run (from repo root)

```powershell
npm install
npm run wdio:android:cosmedics:signin:positive
```

See `package.json` `scripts` for all entry points. Cosmedics-specific notes: `projects/cosmedics/README.md`.

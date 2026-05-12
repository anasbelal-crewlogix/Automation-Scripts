# Cosmedics — Playwright (web)

## Setup

From this folder:

```powershell
cd cosmedics\playwright
npm install
npm run install:browsers
```

## Configuration

| File | Purpose |
|------|---------|
| `playwright.config.js` | Browsers, reporters, `baseURL`, retries |
| `tests/*.spec.js` | Test files |
| `.env.example` | Copy to `.env` and set `BASE_URL` if you load env in your workflow |

Set the app URL:

```powershell
set BASE_URL=https://your-cosmedics-web-app.example
npm test
```

## Commands

| Script | What it does |
|--------|----------------|
| `npm test` | Run all tests (headless) |
| `npm run test:headed` | Run with visible browser |
| `npm run test:ui` | Playwright UI mode |
| `npm run test:debug` | Step debug |
| `npm run codegen` | Record actions to paste into tests |
| `npm run report` | Open last HTML report |
| `npm run install:browsers` | Download Chromium, Firefox, WebKit |

From **repository root** you can also run:

```powershell
npm run cosmedics:playwright:test
```

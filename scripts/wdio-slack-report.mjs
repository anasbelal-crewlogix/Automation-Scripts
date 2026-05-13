#!/usr/bin/env node
/**
 * Run a WDIO/npm command, then POST an English-only summary to Slack (Incoming Webhooks).
 * Uses logs/wdio-last-result.json from @wdio/json-reporter when available (single WDIO run).
 * Chained npm scripts (e.g. cosmedics:all:positive) use a fixed happy-path bullet list + overall exit code.
 *
 * Usage:
 *   node scripts/wdio-slack-report.mjs --label Cosmedics-subscription -- npm run wdio:android:cosmedics:subscription
 *
 * Env:
 *   SLACK_WEBHOOK_URL / SLACK_WEBHOOK_URLS — webhook URL(s)
 *   SLACK_WDIO_JSON — override path to WDIO JSON report (default: <repo>/logs/wdio-last-result.json)
 *   SLACK_NOTIFY_ON_SUCCESS — set to 0 to only notify on failure
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_JSON = path.join(REPO_ROOT, 'logs', 'wdio-last-result.json');

function loadDotEnv() {
  const p = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function listSlackWebhookUrls() {
  const seen = new Set();
  const add = (raw) => {
    if (!raw || typeof raw !== 'string') return;
    for (const c of raw.split(/[,;\n]+/)) {
      const u = c.trim();
      if (u.startsWith('http') && !seen.has(u)) seen.add(u);
    }
  };
  add(process.env.SLACK_WEBHOOK_URLS || '');
  add(process.env.SLACK_WEBHOOK_URL || '');
  return [...seen];
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let label = 'WDIO';
  const dash = argv.indexOf('--');
  if (dash === -1) {
    console.error('Usage: node scripts/wdio-slack-report.mjs [--label Name] -- <command> [args...]');
    process.exit(2);
  }
  const before = argv.slice(0, dash);
  const cmdParts = argv.slice(dash + 1);
  for (let i = 0; i < before.length; i++) {
    if (before[i] === '--label' && before[i + 1]) {
      label = before[i + 1];
      i++;
    }
  }
  if (!cmdParts.length) {
    console.error('Missing command after --');
    process.exit(2);
  }
  return { label, cmdParts };
}

function formatDurationHuman(secondsStr) {
  const total = Number.parseFloat(secondsStr);
  if (!Number.isFinite(total)) return `${secondsStr}s`;
  if (total < 60) return `${Math.round(total)} seconds`;
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return `${m} min ${s} sec`;
}

function getRunTitle(label, cmdLine) {
  const hay = `${label} ${cmdLine}`.toLowerCase();
  if (hay.includes('all-positive') || hay.includes('all:positive')) return 'Cosmedics — full patient flow (chained run)';
  if (hay.includes('cosmedics:all') && !hay.includes('all-positive')) return 'Cosmedics — full patient flow (chained run)';
  if (hay.includes('subscription') && !hay.includes('provider')) return 'Cosmedics — subscription';
  if (hay.includes('provider')) return 'Cosmedics — provider access';
  if (hay.includes('signin:positive')) return 'Cosmedics — patient sign-in (happy path)';
  if (hay.includes('cosmedics:post') || hay.includes('appium.test')) return 'Cosmedics — location';
  if (hay.includes('signin') && !hay.includes('positive')) return 'Cosmedics — patient sign-in (checks)';
  return label.replace(/-/g, ' ');
}

/**
 * Subscription (and similar) specs use one long Mocha `it()` for the whole journey.
 * JSON then shows a single row with an unhelpful title — prefer the written step bullets instead.
 */
function useHappyStepsInsteadOfJsonTestList(cmdLine, label, tests) {
  if (!Array.isArray(tests) || tests.length !== 1) return false;
  const h = `${label} ${cmdLine}`.toLowerCase();
  return h.includes('subscription') && !h.includes('provider');
}

/** Chained npm scripts run several WDIO processes; JSON file only reflects the last one — use happy-path copy. */
function useHappyFlowNarrativeOnly(cmdLine, label) {
  const h = `${cmdLine} ${label}`.toLowerCase();
  if (h.includes('&&')) return true;
  if (h.includes('all-positive') || h.includes('all:positive')) return true;
  if (/\bcosmedics:all\b/.test(h)) return true;
  return false;
}

function getHappyFlowBullets(cmdLine, label) {
  const hay = `${label} ${cmdLine}`.toLowerCase();
  if (hay.includes('all-positive') || hay.includes('all:positive') || (hay.includes('cosmedics:all') && !hay.includes('provider'))) {
    return [
      'Patient sign-in with valid email and password.',
      'Location checks in the app (current location and manual address entry where the script applies).',
      'Subscription: open Profile → Subscription.',
      'Subscription: open each plan tab in order (Dental, Aesthetic, Health & Wellness, All-Inclusive), then repeat that order to drive selection.',
      'Subscription: on each tab, swipe the plan carousel to the first (left-most) plan; if it is not already “Your Current Plan”, tap Continue on that plan.',
      'Subscription: if Payment appears, fill the Stripe test card and pay; on Success or QR Code, verify the plan shown (including QR header) matches.',
      'Subscription: after checkout/QR (or if every first plan was already active), return to Profile → Logout → confirm “Yes” → expect Sign In.',
    ];
  }
  if (hay.includes('subscription') && !hay.includes('provider')) {
    return [
      'Sign in if the sign-in screen appears; otherwise reach Home (session may already be logged in).',
      'Open Profile from the bottom navigation, then open the Subscription row.',
      'First pass: open each subscription tab in order — Dental, Aesthetic, Health & Wellness, All-Inclusive — so each category’s plans load.',
      'Second pass (same tab order): on each tab, swipe the plan carousel toward the first (left-most) plan card.',
      'If the first plan is not already active (“Your Current Plan”), tap Continue on that plan to start checkout or activation.',
      'If the Payment screen appears, enter the Stripe test card details and complete payment.',
      'If Success or QR Code appears, verify the plan label (including on the QR screen) matches the plan you selected.',
      'When the flow finishes (after payment/QR, or if every tab’s first plan was already active), open Profile, tap Logout, confirm “Yes”, and verify Sign In is shown again.',
    ];
  }
  if (hay.includes('provider')) {
    return [
      'Open the Cosmedics app on the patient sign-in screen.',
      'Tap Provider access (below Continue).',
      'Open the provider login screen.',
      'If provider email and password are configured in the environment, enter them and continue.',
    ];
  }
  if (hay.includes('cosmedics:post') || hay.includes('appium.test')) {
    return [
      'Sign in if needed and reach Home.',
      'Open the location flow from Home.',
      'Use current location when GPS data is available (otherwise that part may be skipped).',
      'Perform manual address searches and pick suggestions.',
      'Return to Home, pause, then open Profile.',
    ];
  }
  if (hay.includes('signin:positive')) {
    return [
      'Open the app on the patient sign-in screen.',
      'Enter a valid email and password.',
      'Tap Continue and confirm you successfully leave the sign-in screen.',
    ];
  }
  return [
    'Run the configured automation against the connected device.',
    'Wait until the script finishes.',
  ];
}

function stateToEnglish(state) {
  if (state === 'passed') return 'Passed';
  if (state === 'failed') return 'Failed';
  if (state === 'skipped') return 'Skipped';
  if (state === 'pending') return 'Pending';
  return String(state || 'Unknown');
}

function stateRank(state) {
  if (state === 'failed') return 4;
  if (state === 'skipped') return 3;
  if (state === 'pending') return 2;
  if (state === 'passed') return 1;
  return 0;
}

function humanizeTestLine(name) {
  const t = (name || '').trim();
  if (!t) return 'Unnamed check';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Merge duplicate test rows (WDIO JSON reporter can list suites more than once).
 */
function collectTestsFromJson(data) {
  if (!data || !Array.isArray(data.suites)) return [];
  const byKey = new Map();
  for (const suite of data.suites) {
    const suiteName = (suite.name || '').trim();
    const prefix = suiteName && suiteName !== '(root)' ? `${suiteName} — ` : '';
    for (const test of suite.tests || []) {
      const key = `${prefix}${test.name || ''}`.trim() || test.name || 'unknown';
      const prev = byKey.get(key);
      const st = test.state;
      if (!prev || stateRank(st) >= stateRank(prev.state)) {
        byKey.set(key, { key, name: key, state: st });
      }
    }
  }
  return [...byKey.values()];
}

function summarizeTests(tests) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;
  for (const t of tests) {
    if (t.state === 'passed') passed++;
    else if (t.state === 'failed') failed++;
    else if (t.state === 'skipped') skipped++;
    else if (t.state === 'pending') pending++;
  }
  const total = tests.length;
  return { passed, failed, skipped, pending, total };
}

function readWdioJsonReport(jsonPath) {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    const raw = fs.readFileSync(jsonPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ensureLogsDir() {
  const logDir = path.join(REPO_ROOT, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function buildSlackPayload({ passed, title, durationHuman, durationSec, reportMode, chained, tests, bullets, exitCode }) {
  const resultEmoji = passed ? ':white_check_mark:' : ':x:';
  const resultWord = passed ? 'Success' : 'Failed';

  let body = '';
  if (reportMode === 'tests' && tests.length) {
    body += '*These automated checks were run:*\n\n';
    for (const t of tests) {
      const line = humanizeTestLine(t.name);
      const st = stateToEnglish(t.state);
      body += `• ${line} => *${st}*\n`;
    }
    const s = summarizeTests(tests);
    body += '\n*Summary*\n';
    body += `• Total checks recorded: *${s.total}*\n`;
    body += `• Passed: *${s.passed}* · Failed: *${s.failed}* · Skipped: *${s.skipped}*`;
    if (s.pending) body += ` · Pending: *${s.pending}*`;
    body += '\n';
    body += `\n*Overall run:* ${passed ? 'The automation finished with *no failing checks*.' : 'At least one check *did not pass* — review the run on the machine or in CI.'}`;
  } else {
    body += '*Happy path — these steps were followed:*\n\n';
    for (const b of bullets) {
      body += `• ${b}\n`;
    }
    body += '\n*Summary*\n';
    body += passed
      ? '• The full script finished *successfully* (exit code 0). All steps in this flow completed without a hard stop from the tool.'
      : '• The script *did not finish successfully*. A step failed or timed out — please open the terminal log on the computer that ran the test.';
    if (chained) {
      body += '\n• _This job chains several test runs in one command; the bullets describe the full journey._';
    }
  }

  body += `\n\n*Time:* ${durationHuman} (${durationSec} seconds)`;

  const mobileFallback = `${resultEmoji} ${resultWord}: ${title}. ${passed ? 'Run completed successfully.' : 'Run failed — see details in Slack.'}`;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${resultEmoji} ${resultWord} — ${title}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: body.slice(0, 2900) },
    },
  ];

  if (body.length > 2900) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: body.slice(2900, 5800) },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `_Exit code ${exitCode} · For full technical logs, see the terminal or CI job that launched this run._`,
      },
    ],
  });

  return { text: mobileFallback, blocks };
}

async function postSlack(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const text = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(`Slack webhook HTTP ${res.status}: ${text || '(empty body)'}`);
  }
  if (text && text !== 'ok') {
    console.warn(`[slack] Unexpected response body: ${text.slice(0, 200)}`);
  }
}

loadDotEnv();

const { label, cmdParts } = parseArgs();
const notifyOnSuccess = process.env.SLACK_NOTIFY_ON_SUCCESS !== '0';
const webhookUrls = listSlackWebhookUrls();
const jsonPath = (process.env.SLACK_WDIO_JSON || DEFAULT_JSON).trim();

ensureLogsDir();

const started = Date.now();
const isWin = process.platform === 'win32';
const program = isWin && cmdParts[0].toLowerCase() === 'npm' ? 'npm.cmd' : cmdParts[0];
const child = spawnSync(program, cmdParts.slice(1), {
  cwd: REPO_ROOT,
  shell: isWin,
  encoding: 'utf-8',
  maxBuffer: 20 * 1024 * 1024,
  env: { ...process.env },
});
const durationSec = ((Date.now() - started) / 1000).toFixed(1);
const exitCode = child.status ?? 1;
const passed = exitCode === 0;
const cmdLine = cmdParts.join(' ');

if (!webhookUrls.length) {
  console.warn(
    '[slack] Set SLACK_WEBHOOK_URL or SLACK_WEBHOOK_URLS — skipping Slack (see .env.example).'
  );
  process.exit(exitCode);
}

if (passed && !notifyOnSuccess) {
  process.exit(exitCode);
}

const title = getRunTitle(label, cmdLine);
const durationHuman = formatDurationHuman(durationSec);

let mode = 'happy';
let tests = [];
let bullets = getHappyFlowBullets(cmdLine, label);

if (!useHappyFlowNarrativeOnly(cmdLine, label)) {
  const data = readWdioJsonReport(jsonPath);
  tests = data ? collectTestsFromJson(data) : [];
  if (tests.length > 0 && useHappyStepsInsteadOfJsonTestList(cmdLine, label, tests)) {
    mode = 'happy';
    tests = [];
    bullets = getHappyFlowBullets(cmdLine, label);
  } else if (tests.length > 0) {
    mode = 'tests';
  } else {
    mode = 'happy';
    if (!bullets.length) bullets = getHappyFlowBullets(cmdLine, label);
  }
} else {
  mode = 'chained';
}

const payload = buildSlackPayload({
  passed,
  title,
  durationHuman,
  durationSec,
  reportMode: mode === 'tests' ? 'tests' : 'happy',
  chained: mode === 'chained',
  tests,
  bullets,
  exitCode,
});

try {
  console.log(`[slack] Posting to ${webhookUrls.length} Slack destination(s).`);
  let sent = 0;
  for (let i = 0; i < webhookUrls.length; i++) {
    try {
      await postSlack(webhookUrls[i], payload);
      sent++;
    } catch (e) {
      console.error(`[slack] Webhook ${i + 1}/${webhookUrls.length} failed:`, e.message);
    }
  }
  if (sent === 0) {
    console.error('[slack] No webhook deliveries succeeded.');
  } else {
    console.log(`[slack] Notification sent to ${sent}/${webhookUrls.length} channel(s).`);
  }
} catch (e) {
  console.error('[slack] Failed to send:', e.message);
}

process.exit(exitCode);

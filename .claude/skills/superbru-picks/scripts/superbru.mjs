// Reads a Superbru URC predictor pool with headless Chromium: the account's pools, a pool's
// members and the members' picks per round. Writes JSON (for build-import-sql.py) and CSV.
// Usage:
//   node superbru.mjs --list-pools
//   node superbru.mjs --pool <id> --out <dir> [--rounds 1,2] [--names]
// --rounds defaults to every completed round plus the active one. --names reads each member's
// real name from their profile dialog (one request per member).
// Credentials come from SUPERBRU_EMAIL and SUPERBRU_PASSWORD. They are never printed or written,
// and no cookies, traces or screenshots are saved. TLS verification stays on.
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { values } = parseArgs({
  options: {
    'list-pools': { type: 'boolean', default: false },
    pool: { type: 'string' },
    out: { type: 'string' },
    rounds: { type: 'string' },
    names: { type: 'boolean', default: false },
  },
});
if (!values['list-pools'] && !(values.pool && values.out)) {
  console.error('Usage: node superbru.mjs --list-pools | --pool <id> --out <dir> [--rounds 1,2] [--names]');
  process.exit(2);
}
for (const key of ['SUPERBRU_EMAIL', 'SUPERBRU_PASSWORD']) {
  if (!process.env[key]) {
    console.error(`${key} is not set.`);
    process.exit(2);
  }
}

const BASE = 'https://www.superbru.com/urc_predictor';
const PAUSE_MS = 1500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Playwright from the working directory, this repository's web app, or the global npm root.
function loadPlaywright() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const bases = [process.cwd(), path.join(repoRoot, 'apps/web')];
  try {
    bases.push(execSync('npm root -g', { encoding: 'utf8' }).trim());
  } catch {}
  for (const base of bases) {
    try {
      return createRequire(path.join(base, 'noop.js'))('playwright');
    } catch {}
  }
  console.error('Playwright not found. Run npm run setup (apps/web) or install it globally.');
  process.exit(2);
}

function scrub(text) {
  let out = String(text);
  for (const key of ['SUPERBRU_EMAIL', 'SUPERBRU_PASSWORD']) out = out.split(process.env[key]).join('[redacted]');
  return out;
}

async function login(chromium) {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  await page.goto('https://www.superbru.com/login', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  // The consent dialog covers the form: More options, Reject all, then Save & exit if still open.
  const consent = (pattern) => page.locator('#qc-cmp2-container button', { hasText: pattern }).first();
  await page.waitForSelector('#qc-cmp2-container button', { timeout: 15000 }).catch(() => {});
  if (await consent(/more options/i).count()) {
    await consent(/more options/i).click();
    await sleep(1500);
  }
  if (await consent(/reject all/i).count()) await consent(/reject all/i).click();
  await sleep(800);
  if ((await page.isVisible('#qc-cmp2-container').catch(() => false)) && (await consent(/save & exit/i).count())) {
    await consent(/save & exit/i).click();
  }
  await page.waitForSelector('#qc-cmp2-container', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.fill('#email-superbru', process.env.SUPERBRU_EMAIL);
  await page.fill('#password-superbru', process.env.SUPERBRU_PASSWORD);
  await page.locator('#password-superbru').locator('xpath=ancestor::form[1]').locator('[type=submit]').first().click({ timeout: 10000 });
  await sleep(6000);
  const text = (await page.innerText('body')).slice(0, 3000);
  if (/\/login/.test(page.url()) || /captcha|verify it'?s you|verification code/i.test(text)) {
    await browser.close();
    throw new Error(`Login did not complete (still at ${page.url()}). Check for a captcha or extra verification and stop.`);
  }
  return { browser, page };
}

async function listPools(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  return page.$$eval('a[href*="pool_view.php"]', (links) => {
    const pools = new Map();
    for (const a of links) {
      const id = (a.href.match(/[?&]p=(\d+)/) || [])[1];
      const name = a.innerText.trim();
      if (id && name && !pools.has(id)) pools.set(id, name);
    }
    return [...pools].map(([id, name]) => ({ id, name }));
  });
}

async function readMembers(page, poolId) {
  await page.goto(`${BASE}/pool.php?p=${poolId}&tab=leaderboard#tab=leaderboard`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const poolName = (await page.title()).split(' - ').pop();
  const playerCount = await page.evaluate(() => (document.body.innerText.match(/(\d+)\s+players/) || [])[1] || null);
  const members = await page.$$eval('[data-bru-tab="leaderboard"] tr', (rows) =>
    rows
      .map((tr) => {
        const name = tr.querySelector('.name[onclick*="showProfile"]');
        if (!name) return null;
        const ids = name.getAttribute('onclick').match(/showProfile\((\d+),(\d+)/);
        const cells = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim());
        return { superbru_name: name.innerText.trim(), member_id: ids[2], tournament_id: ids[1], rank: cells[0], total_points: cells[cells.length - 2] };
      })
      .filter(Boolean),
  );
  return { poolName, playerCount: playerCount && Number(playerCount), members };
}

// The real name the member's profile dialog shows, through the dialog's own request.
async function readRealNames(page, poolId, members, roundId) {
  for (const member of members) {
    const response = await page.request.post(`${BASE}/ajax/player_profile_popup.php`, {
      form: { tournament_id: member.tournament_id, player_id: member.member_id, round_id: String(roundId), pool_id: poolId },
      headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: page.url() },
    });
    try {
      const html = (await response.json()).data.html;
      member.real_name = ((html.match(/class='real-name'>([^<]*)</) || [])[1] || '').trim();
    } catch {
      member.real_name = '';
    }
    await sleep(PAUSE_MS);
  }
}

async function readRounds(page, poolId) {
  await page.goto(`${BASE}/pool.php?p=${poolId}&tab=matches#tab=matches`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  return page.$$eval('li.tab-control[data-bru-tab^="round"]', (items) =>
    items.map((li) => ({
      round: Number(li.getAttribute('data-bru-tab').replace('round', '')),
      complete: li.classList.contains('complete'),
      active: li.classList.contains('active'),
      dates: (li.querySelector('.round-date') || {}).innerText || '',
    })),
  );
}

// One row per member per match of the round, from the pool's Matches tab.
async function readRoundPicks(page, round) {
  const roundTab = page.locator(`li.tab-control[data-bru-tab="round${round}"]`).first();
  if (!(await roundTab.evaluate((li) => li.classList.contains('active')))) {
    await roundTab.click();
    await sleep(4000);
  }
  const games = await page.$$eval(`div.tab.subtab[data-bru-data*="round_id=${round}&"]`, (tabs) => tabs.map((tab) => tab.getAttribute('data-bru-tab')));
  const rows = [];
  for (const game of games) {
    const pane = `div.tab.subtab[data-bru-tab="${game}"]`;
    if (!(await page.$eval(pane, (el) => el.innerHTML.length))) {
      await page.locator(`.subtab-control[data-bru-tab="${game}"]`).first().click();
      await page.waitForFunction((selector) => document.querySelector(selector)?.innerHTML.length > 0, pane, { timeout: 15000 });
      await sleep(PAUSE_MS);
    }
    rows.push(
      ...(await page.$eval(pane, (el, roundNumber) => {
        const card = el.querySelector('[data-bru-teams][data-bru-game-status]');
        const [home, away] = card.getAttribute('data-bru-teams').split(' v ');
        const base = { round: roundNumber, game_id: card.getAttribute('data-bru-game-id'), match: `${home} v ${away}`, home, away, game_status: card.getAttribute('data-bru-game-status') };
        const seen = new Set();
        return [...el.querySelectorAll('tr')]
          .map((tr) => {
            const pick = tr.querySelector('td.pick-name');
            const profile = tr.querySelector('[onclick*="showProfile"]');
            if (!pick || !profile) return null;
            const memberId = profile.getAttribute('onclick').match(/showProfile\(\d+,(\d+)/)[1];
            if (seen.has(memberId)) return null;
            seen.add(memberId);
            const cells = [...tr.querySelectorAll('td')];
            const team = pick.innerText.trim();
            const lock = pick.querySelector('.fa-lock') ? 'locked' : pick.querySelector('.fa-unlock-alt, .fa-unlock') ? 'unlocked' : '';
            const margin = (pick.nextElementSibling?.innerText || '').trim();
            return { ...base, member_id: memberId, picked_team: team === 'Not picked yet' ? '' : team, not_picked_yet: team === 'Not picked yet', picked_margin: team === 'Not picked yet' ? '' : margin, lock, points: cells[cells.length - 1].innerText.trim() };
          })
          .filter(Boolean);
      }, round)),
    );
  }
  return rows;
}

function writeCsv(file, rows, columns) {
  const cell = (value) => {
    const text = value === undefined || value === null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  fs.writeFileSync(file, [columns.join(','), ...rows.map((row) => columns.map((c) => cell(row[c])).join(','))].join('\n') + '\n');
}

const { chromium } = loadPlaywright();
let session;
try {
  session = await login(chromium);
  const { page } = session;
  if (values['list-pools']) {
    for (const pool of await listPools(page)) console.log(`${pool.id}  ${pool.name}`);
  } else {
    const poolId = values.pool;
    fs.mkdirSync(values.out, { recursive: true });
    const { poolName, playerCount, members } = await readMembers(page, poolId);
    console.log(`Pool ${poolId} "${poolName}": ${members.length} members on the leaderboard, ${playerCount ?? '?'} players stated.`);
    const rounds = await readRounds(page, poolId);
    const wanted = values.rounds ? values.rounds.split(',').map(Number) : rounds.filter((r) => r.complete || r.active).map((r) => r.round);
    const activeRound = (rounds.find((r) => r.active) || rounds[0]).round;
    if (values.names) await readRealNames(page, poolId, members, activeRound);
    const byId = new Map(members.map((m) => [m.member_id, m]));
    const picks = [];
    for (const round of wanted) {
      const state = rounds.find((r) => r.round === round);
      const rows = await readRoundPicks(page, round);
      const games = new Set(rows.map((r) => r.game_id));
      console.log(`Round ${round} (${state?.complete ? 'complete' : state?.active ? 'active' : 'not started'}): ${games.size} matches, ${rows.length} pick rows.`);
      // The member list is the master list: a member with no row in a match still appears.
      for (const gameId of games) {
        const gameRows = rows.filter((r) => r.game_id === gameId);
        const base = { ...gameRows[0], member_id: '', picked_team: '', not_picked_yet: false, picked_margin: '', lock: '', points: '' };
        for (const member of members) {
          const row = gameRows.find((r) => r.member_id === member.member_id) || { ...base, member_id: member.member_id, no_row: true };
          picks.push({ superbru_name: member.superbru_name, ...row });
        }
        for (const row of gameRows) if (!byId.has(row.member_id)) console.log(`  Not on the leaderboard: member ${row.member_id} in ${row.match}`);
      }
    }
    const result = { pool_id: poolId, pool_name: poolName, player_count: playerCount, rounds, members, picks };
    fs.writeFileSync(path.join(values.out, 'superbru.json'), JSON.stringify(result, null, 1));
    writeCsv(path.join(values.out, 'members.csv'), members, ['superbru_name', 'real_name', 'member_id', 'rank', 'total_points']);
    writeCsv(path.join(values.out, 'picks.csv'), picks, ['superbru_name', 'round', 'match', 'game_status', 'picked_team', 'picked_margin', 'lock', 'points']);
    console.log(`Wrote superbru.json, members.csv and picks.csv to ${values.out}`);
  }
} catch (error) {
  console.error(scrub(error.message));
  process.exitCode = 1;
} finally {
  await session?.browser.close();
}

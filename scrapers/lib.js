/**
 * Shared helpers for the venue scrapers.
 *
 * Every scraper returns an array of "raw screenings":
 *   { title, date: 'YYYY-MM-DD', time: 'HH:MM' (24h, Eastern), ticketLink,
 *     poster?, year?, director?, runtime?, note?, series?, soldOut? }
 * The orchestrator (scraper.js) adds venue info, cleans titles, dedupes and
 * enriches with TMDB.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TZ = 'America/New_York';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  // Never throw on 4xx so scrapers can report a useful message.
  validateStatus: (s) => s >= 200 && s < 400,
});

/** GET with one retry – theater sites are often slow or flaky. */
async function get(url, opts = {}) {
  try {
    return await http.get(url, opts);
  } catch (err) {
    await sleep(1500);
    return http.get(url, opts);
  }
}

async function post(url, body, opts = {}) {
  try {
    return await http.post(url, body, opts);
  } catch (err) {
    await sleep(1500);
    return http.post(url, body, opts);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- dates & times (everything is Eastern Time) ---------- */

/** Parts of "now" (or any Date) in Eastern Time. */
function etParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    year: +p.year,
    month: +p.month,
    day: +p.day,
  };
}

const todayET = () => etParts().date;

/** Convert a Date / ISO string with offset into { date, time } in Eastern. */
function toET(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d)) return null;
  const p = etParts(d);
  return { date: p.date, time: p.time };
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * Theaters usually print dates without a year ("Thu Nov 12").
 * Pick the year that puts the date closest to today, preferring the future:
 * anything more than ~2 months in the past is assumed to be next year.
 */
function inferYear(month, day, ref = etParts()) {
  const candidates = [ref.year - 1, ref.year, ref.year + 1];
  const refMs = Date.UTC(ref.year, ref.month - 1, ref.day);
  let best = ref.year;
  let bestScore = Infinity;
  for (const y of candidates) {
    const diffDays = (Date.UTC(y, month - 1, day) - refMs) / 86400000;
    if (diffDays < -60) continue; // too far in the past
    const score = Math.abs(diffDays);
    if (score < bestScore) {
      bestScore = score;
      best = y;
    }
  }
  return best;
}

/** "Thu Nov 12", "November 12, 2026", "Nov 12" -> "2026-11-12" */
function parseMonthDay(text) {
  if (!text) return null;
  const m = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/);
  if (!m) return null;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = +m[2];
  const year = m[3] ? +m[3] : inferYear(month, day);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** "7:00 PM", "7:00 pm", "7 p.m.", "11:15 a.m." -> "19:00" */
function parseTime12(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/i);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] || '00';
  const pm = m[3].toLowerCase() === 'p';
  if (h < 1 || h > 12) return null;
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  return `${pad(h)}:${min}`;
}

/* ---------- text ---------- */

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

function absolute(url, base) {
  if (!url) return null;
  try {
    return new URL(url, base).href;
  } catch (e) {
    return null;
  }
}

/* ---------- small on-disk cache for per-film detail pages ---------- */

/**
 * Detail pages (credits, IMDb links) rarely change, so each one is fetched
 * once and remembered in data/venue-meta-cache.json. Entries not touched for
 * 60 days are dropped.
 */
const META_FILE = path.join(__dirname, '..', 'data', 'venue-meta-cache.json');
let metaStore = null;

function metaLoad() {
  if (metaStore) return metaStore;
  try {
    metaStore = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch (e) {
    metaStore = {};
  }
  return metaStore;
}

const meta = {
  get(key) {
    const hit = metaLoad()[key];
    if (!hit) return undefined;
    hit.seen = new Date().toISOString().slice(0, 10);
    return hit.v;
  },
  set(key, value) {
    metaLoad()[key] = { seen: new Date().toISOString().slice(0, 10), v: value };
  },
  save() {
    const store = metaLoad();
    const cutoff = Date.now() - 60 * 86400000;
    const out = {};
    for (const k of Object.keys(store).sort()) {
      if (new Date(store[k].seen).getTime() >= cutoff) out[k] = store[k];
    }
    fs.writeFileSync(META_FILE, JSON.stringify(out, null, 1) + '\n');
  },
};

/** Run async `fn` over `items`, at most `n` at a time. */
async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift());
    })
  );
}

module.exports = {
  meta, pool,
  TZ, UA, http, get, post, sleep,
  etParts, todayET, toET, inferYear, parseMonthDay, parseTime12, pad,
  clean, absolute,
};

/**
 * Landmark Atlantic Plumbing Cinema (Shaw, 807 V St NW)
 * https://www.landmarktheatres.com/showtimes/
 *
 * landmarktheatres.com is a JavaScript app. The showtimes page shows one day
 * at a time for the location chosen in its "PLEASE SELECT A LOCATION" bar.
 * This scraper, like a visitor would:
 *   1. accepts the cookie banner if it appears
 *   2. picks "Landmark Atlantic Plumbing Cinema" in the location list
 *   3. clicks each date in the day strip and reads the films and times shown
 *
 * Each showtime is a button labelled "Buy tickets for show at 7:30 PM"; times
 * already past show "(expired)" in the label and are skipped.
 *
 * If the location cannot be selected, the scraper throws (the site changed)
 * and the last good listings are kept. We do not call the site's internal
 * API directly.
 */
const { withPage } = require('./browser');
const { todayET, pad } = require('./lib');

const URL = 'https://www.landmarktheatres.com/showtimes/';
const LOCATION = /^Landmark Atlantic Plumbing Cinema$/i;
const DAY_LABEL = /^[A-Z]{3}\s*\n\s*\d{1,2}$/;
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs']);
const MAX_DAYS = 40; // the day strip shows about 40 days

/** "WILD HORSE NINE" -> "Wild Horse Nine" */
function titleCase(s) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/^[a-z]/, (c) => c.toUpperCase())))
    .join(' ')
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** "7:30 PM" -> "19:30" */
function to24(h, m, ap) {
  let hour = +h;
  if (ap.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (ap.toUpperCase() === 'AM' && hour === 12) hour = 0;
  return `${pad(hour)}:${m}`;
}

async function selectLocation(page) {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /accept and continue/i.test(b.innerText));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  // Open the location bar (it needs a real mouse click to open)
  const bar = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].filter(
      (x) => x.childElementCount <= 3 && /^PLEASE SELECT A LOCATION$/i.test((x.innerText || '').trim())
    ).pop();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!bar) throw new Error('location bar not found; the site may have changed');
  await page.mouse.click(bar.x, bar.y);
  await new Promise((r) => setTimeout(r, 1000));

  // Click the theater in the list (it can sit below the fold)
  const found = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const el = [...document.querySelectorAll('li,button,a,div,span')].filter(
      (x) => x.childElementCount <= 2 && re.test((x.innerText || '').trim())
    ).pop();
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    return true;
  }, LOCATION.source);
  if (!found) throw new Error('Atlantic Plumbing is not in the location list');
  await new Promise((r) => setTimeout(r, 500));
  const at = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const el = [...document.querySelectorAll('li,button,a,div,span')].filter(
      (x) => x.childElementCount <= 2 && re.test((x.innerText || '').trim())
    ).pop();
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, LOCATION.source);
  await page.mouse.click(at.x, at.y);
  await new Promise((r) => setTimeout(r, 2500));

  const ok = await page.evaluate(() => /SHOWTIMES FOR:\s*\n?\s*LANDMARK ATLANTIC PLUMBING/i.test(document.body.innerText));
  if (!ok) throw new Error('could not select Landmark Atlantic Plumbing Cinema');
  // close the location panel
  await page.evaluate(() => {
    const done = [...document.querySelectorAll('*')].find((e) => (e.innerText || '').trim() === 'DONE' && e.childElementCount === 0);
    if (done) done.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
}

/** Read the currently shown day: films, and their showtimes. */
async function readDay(page, dateISO) {
  const data = await page.evaluate(() => ({
    text: document.body.innerText,
    // document-order list of showtime buttons; expired ones say so in the label
    shows: [...document.querySelectorAll('[aria-label^="Buy tickets for show at"]')].map((el) => ({
      label: el.getAttribute('aria-label'),
    })),
  }));

  const lines = data.text.split('\n').map((l) => l.trim());
  const timeRe = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
  const labelRe = /show at\s+(\d{1,2}):(\d{2})\s*(AM|PM)(\s*\(expired\))?/i;
  // Times in the text and show buttons appear in the same order
  const expiredFlags = data.shows.map((s) => /\(expired\)/i.test(s.label));
  const labelTimes = data.shows.map((s) => {
    const m = s.label.match(labelRe);
    return m ? to24(m[1], m[2], m[3]) : null;
  });

  // Only trust the button labels if they line up one-to-one with the times in the text
  const textTimes = lines.filter((l) => timeRe.test(l)).length;
  const aligned = textTimes === data.shows.length;

  const out = [];
  let film = null;
  let showIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A film's runtime line ("R • 2 HR, 15 MIN", or "2 HR, 45 MIN" with no rating) is followed by its title
    const isRuntime = /•|^\d+\s*HR\b|^\d+\s*MIN\b/i.test(line) && /\b(HR|MIN)\b/i.test(line) && line.length < 40;
    const next = lines[i + 1] || '';
    if (isRuntime && next && !/•|\b(HR|MIN)\b/i.test(next) && !/^(TRAILER|Directed by)/i.test(next) && /[A-Z]{2}/.test(next)) {
      film = titleCase(next);
      continue;
    }
    const m = line.match(timeRe);
    if (!m) continue;
    const idx = showIndex++;
    const time = aligned && labelTimes[idx] ? labelTimes[idx] : to24(m[1], m[2], m[3]);
    if (aligned && expiredFlags[idx]) continue;
    if (!film) continue;
    out.push({
      title: film,
      date: dateISO,
      time,
      ticketLink: URL,
    });
  }
  return out;
}

const MONTH_NUM = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "TODAY, NOVEMBER 10" -> "2026-11-10" (year from the strip's first day) */
function dateFromHeader(text) {
  const m = text.match(/^(?:TODAY|TOMORROW|[A-Z]+),\s+([A-Z]+)\s+(\d{1,2})$/);
  if (!m) return null;
  const month = MONTH_NUM[m[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const today = todayET();
  let year = +today.slice(0, 4);
  // a December header read in early January belongs to the previous year
  if (month < +today.slice(5, 7) - 6) year += 1;
  if (month > +today.slice(5, 7) + 6) year -= 1;
  return `${year}-${pad(month)}-${pad(+m[2])}`;
}

/** "2026-11-10" plus n days -> ISO date */
function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}


module.exports = async function scrapeLandmark() {
  return withPage(async (page) => {
    await selectLocation(page);

    const seen = new Set();
    const out = [];
    // The day strip lists about 40 days. Days with no showtimes are disabled.
    // Render the whole strip first (it draws cards as it scrolls), then visit the enabled days.
    for (let k = 0; k < 8; k++) {
      await page.evaluate(() => {
        const cards = [...document.querySelectorAll('[data-role="card"][data-index]')];
        if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'nearest', inline: 'end' });
      });
      await new Promise((r) => setTimeout(r, 500));
    }
    const enabled = await page.evaluate(() =>
      [...document.querySelectorAll('[data-role="card"][data-index]')]
        .filter((c) => {
          const b = c.querySelector('button');
          return b && !b.disabled;
        })
        .map((c) => Number(c.getAttribute('data-index')))
    );

    for (const index of enabled.slice(0, MAX_DAYS)) {
      // Bring the card into view and click its button
      const clicked = await page.evaluate((i) => {
        const card = document.querySelector(`[data-role="card"][data-index="${i}"]`);
        if (!card) return false;
        card.scrollIntoView({ block: 'nearest', inline: 'center' });
        const b = card.querySelector('button');
        if (!b || b.disabled) return false;
        b.click();
        return true;
      }, index);
      if (!clicked) continue;
      await new Promise((r) => setTimeout(r, 1200));

      // The header under the day strip names the date, e.g. "THURSDAY, NOVEMBER 12"
      const header = await page.evaluate(() => {
        const line = document.body.innerText.split('\n').map((l) => l.trim())
          .find((l) => /^(TODAY|TOMORROW|[A-Z]+),\s+[A-Z]+\s+\d{1,2}$/.test(l));
        return line || '';
      });
      const dateISO = dateFromHeader(header) || addDays(todayET(), index);

      for (const s of await readDay(page, dateISO)) {
        const key = `${s.title}|${s.date}|${s.time}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }
    }
    return out;
  });
};

module.exports.titleCase = titleCase;
module.exports.to24 = to24;
module.exports.addDays = addDays;
module.exports.dateFromHeader = dateFromHeader;

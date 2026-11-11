/**
 * Avalon Theatre (Chevy Chase DC)
 * https://www.theavalon.org/
 *
 * The homepage embeds a mini calendar whose events link to
 *   https://www.theavalon.org/films/?date=YYYYMMDD
 * for every date that has showings. Each of those pages is server-rendered:
 *   .filmblock
 *     a[href*="/films/"]         title
 *     .times a                   "11:30" "3:10" "7:00"  (ticket links, no AM/PM)
 *
 * The Avalon prints times without AM/PM. Its day runs roughly 10:30 AM to
 * 10 PM, so: 10 and 11 are morning, 12 and 1-9 are afternoon/evening, and a
 * time that would go backwards within a film's list is pushed to PM
 * (e.g. "7:00 10:00" -> 7 PM, 10 PM).
 *
 * Each film page has a "View on IMDB" link; we read it once per film (cached)
 * so TMDB can be asked for exactly that title instead of guessing by name.
 * That matters here because the Avalon mixes films with NT Live broadcasts
 * and one-off events whose names collide with unrelated movies.
 *
 * The site returns 406 unless the request sends a browser-like Accept header
 * (lib.js does).
 */
const cheerio = require('cheerio');
const { get, clean, todayET, pad, sleep, meta } = require('./lib');

const HOME = 'https://www.theavalon.org/';
const MAX_DATES = 45;

function to24(list) {
  const out = [];
  let prev = -1;
  for (const raw of list) {
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    let h = +m[1];
    const min = +m[2];
    if (h >= 1 && h <= 9) h += 12; // 1-9 => PM
    // 10, 11 => AM; 12 => noon
    let minutes = h * 60 + min;
    if (minutes <= prev && h < 12) {
      h += 12; // e.g. a late 10:00 after a 7:00 PM show
      minutes = h * 60 + min;
    }
    prev = minutes;
    out.push(`${pad(h)}:${pad(min)}`);
  }
  return out;
}

function parseDatePage(html, date, pageUrl) {
  const $ = cheerio.load(html);
  const out = [];
  $('.filmblock').each((_, el) => {
    const $el = $(el);
    const $title = $el.find('a[href*="/films/"]').not('.img').not('.learn_more').first();
    const title = clean($title.text());
    if (!title) return;
    const detail = $title.attr('href') || pageUrl;
    const img = $el.find('.bigger_img').attr('data-original') || null;
    const runtime = parseInt((clean($el.text()).match(/(\d{2,3})\s*min/) || [])[1], 10) || null;

    const $times = $el.find('.times a');
    const labels = $times.map((__, a) => clean($(a).text())).get();
    const times = to24(labels);
    $times.each((i, a) => {
      if (!times[i]) return;
      out.push({
        title,
        date,
        time: times[i],
        ticketLink: $(a).attr('href') || detail,
        infoLink: detail,
        // The Avalon's images are landscape stills, not posters; kept as a
        // fallback only (TMDB poster wins when there is a match).
        still: img,
        runtime,
      });
    });
  });
  return out;
}

module.exports = async function scrapeAvalon() {
  const home = (await get(HOME)).data;
  const today = todayET().replace(/-/g, '');
  const dates = [...new Set((String(home).match(/films\/\?date=(\d{8})/g) || []).map((s) => s.slice(-8)))]
    .filter((d) => d >= today)
    .sort()
    .slice(0, MAX_DATES);

  if (!dates.length) throw new Error('no dated links found on the Avalon homepage');

  const out = [];
  let failures = 0;
  for (const d of dates) {
    const url = `${HOME}films/?date=${d}`;
    try {
      const res = await get(url);
      const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      out.push(...parseDatePage(res.data, iso, url));
    } catch (err) {
      failures++;
    }
    await sleep(250); // be polite
  }
  if (!out.length && failures) throw new Error(`all ${failures} date pages failed`);

  // IMDb id per film page (one request per film, cached).
  const pages = [...new Set(out.map((r) => r.infoLink).filter((u) => /\/films\//.test(u || '')))];
  for (const url of pages) {
    const key = `avalon:${url.replace(/\/$/, '')}`;
    if (meta.get(key) !== undefined) continue;
    try {
      const html = String((await get(url)).data);
      const imdb = (html.match(/imdb\.com\/title\/(tt\d+)/) || [])[1] || null;
      meta.set(key, { imdbId: imdb });
    } catch (err) {
      // try again next run
    }
    await sleep(250);
  }
  for (const r of out) {
    const d = meta.get(`avalon:${(r.infoLink || '').replace(/\/$/, '')}`);
    if (d) r.imdbId = d.imdbId || null;
    // An Avalon page with no IMDb link is usually an event, not a film;
    // tell the matcher not to guess.
    if (d && !d.imdbId) r.noGuess = true;
  }
  return out;
};

module.exports._to24 = to24;

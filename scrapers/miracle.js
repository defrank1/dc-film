/**
 * Miracle Theatre (Barracks Row)
 * https://themiracletheatre.com/
 *
 * The Miracle is mostly a live-events room now and shows films in runs
 * ("In-Theatre Movies"). It publishes RSS feeds (Modern Events Calendar) with
 * mec:startDate / mec:startHour fields:
 *
 *   /event-category/in-theatre-movies/feed/   films only (empty between runs)
 *   /events/feed/                             next 10 events of any kind
 *
 * We read both, and from the general feed keep only items whose category
 * mentions movies or film.
 *
 * The site sits behind a "Checking your browser" challenge that is served to
 * clients pretending to be a desktop browser. A client that says plainly what
 * it is gets the feed, so this scraper identifies itself instead of using the
 * shared browser-style User-Agent. If the challenge is served anyway we do
 * NOT try to get around it: the scraper reports "blocked" and the site sends
 * people to the theater's own page.
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { clean, parseTime12 } = require('./lib');

const BASE = 'https://themiracletheatre.com';
const FEEDS = [
  { url: `${BASE}/event-category/in-theatre-movies/feed/`, filmsOnly: true },
  { url: `${BASE}/events/feed/`, filmsOnly: false },
];
const HEADERS = {
  'User-Agent': '730Showtimes/1.0 (+https://github.com/defrank1/dc-film; DC indie film listings)',
  Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
};

async function readFeed(feed) {
  const res = await axios.get(feed.url, {
    headers: HEADERS,
    timeout: 30000,
    responseType: 'text',
    validateStatus: () => true,
  });
  const body = String(res.data || '');
  if (res.status === 403 || /checking your browser|confirm you are human/i.test(body)) {
    const err = new Error('site requires a human check (bot protection); not scraped');
    err.blocked = true;
    throw err;
  }
  if (res.status >= 400) throw new Error(`feed returned HTTP ${res.status}`);
  if (!/<rss[\s>]/i.test(body)) throw new Error('feed did not return RSS');

  const $ = cheerio.load(body, { xmlMode: true });
  const out = [];
  $('item').each((_, item) => {
    const $i = $(item);
    const title = clean($i.find('title').first().text());
    const link = clean($i.find('link').first().text());
    const date = clean($i.find('mec\\:startDate, startDate').first().text());
    const hour = clean($i.find('mec\\:startHour, startHour').first().text());
    const category = $i.find('mec\\:category, category').map((__, c) => $(c).text()).get().join(' ');
    if (!feed.filmsOnly && !/movie|film/i.test(category)) return;
    const time = parseTime12(hour);
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return;
    const desc = $i.find('description').first().text();
    const img = (desc.match(/<img[^>]+src=["']([^"']+)/) || [])[1] || null;
    out.push({ title, date, time, ticketLink: link || `${BASE}/`, poster: img });
  });
  return out;
}

module.exports = async function scrapeMiracle() {
  const seen = new Set();
  const out = [];
  for (const feed of FEEDS) {
    for (const s of await readFeed(feed)) {
      const key = `${s.title}|${s.date}|${s.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
};

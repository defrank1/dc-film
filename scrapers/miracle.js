/**
 * Miracle Theatre (Barracks Row)
 * https://themiracletheatre.com/
 *
 * The Miracle publishes an events RSS feed (Modern Events Calendar) with
 * mec:startDate / mec:startHour fields, and tags films with the "Movies"
 * category.
 *
 * As of Nov 2026 the whole site – feed included – sits behind an
 * "I am human" checkbox challenge. We do NOT try to get around that. If the
 * feed is served, we parse it; if the challenge comes back, this scraper
 * reports "blocked" and the site lists the Miracle under "check directly".
 */
const cheerio = require('cheerio');
const { http, clean, parseTime12 } = require('./lib');

const FEED = 'https://themiracletheatre.com/events/feed/';

module.exports = async function scrapeMiracle() {
  const res = await http.get(FEED, { validateStatus: () => true, responseType: 'text' });
  const body = String(res.data || '');
  if (res.status === 403 || /checking your browser|confirm you are human/i.test(body)) {
    const err = new Error('site requires a human check (bot protection); not scraped');
    err.blocked = true;
    throw err;
  }
  if (res.status >= 400) throw new Error(`feed returned HTTP ${res.status}`);

  const $ = cheerio.load(body, { xmlMode: true });
  const out = [];
  $('item').each((_, item) => {
    const $i = $(item);
    const title = clean($i.find('title').first().text());
    const link = clean($i.find('link').first().text());
    const date = clean($i.find('mec\\:startDate, startDate').first().text());
    const hour = clean($i.find('mec\\:startHour, startHour').first().text());
    const category = $i.find('mec\\:category, category').map((__, c) => $(c).text()).get().join(' ');
    if (!/movie|film/i.test(category)) return;
    const time = parseTime12(hour);
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return;
    const desc = $i.find('description').first().text();
    const img = (desc.match(/<img[^>]+src=["']([^"']+)/) || [])[1] || null;
    out.push({ title, date, time, ticketLink: link || 'https://themiracletheatre.com/', poster: img });
  });
  return out;
};

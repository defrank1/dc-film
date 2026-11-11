/**
 * 4EYE Film Center (Revada Arts Center, Southwest DC)
 * https://4eyefilmcenter.org/now-playing/
 *
 * Plain server-rendered WordPress page. Each showtime is an
 * <article class="showtimes__card" data-event="ID"> containing:
 *   h3.showtimes__title        film title
 *   .showtimes__when span      "Thu Nov 12 · 3:00 PM"
 *   .showtimes__buy a          ticket link (absent when "On Sale Soon")
 *   img.showtimes__poster      poster
 * The same event appears in both the "This Week" band and the full list, so we
 * dedupe on data-event.
 */
const cheerio = require('cheerio');
const { get, clean, parseMonthDay, parseTime12 } = require('./lib');

const URL_LIST = 'https://4eyefilmcenter.org/now-playing/';

// Accessibility formats 4EYE appends to titles; we move them into `note`.
const FORMAT_SUFFIX = /\s+[–—-]\s+(open captions?|open audio description|sensory[- ]friendly|closed captions?)\s*$/i;

module.exports = async function scrapeFourEye() {
  const res = await get(URL_LIST);
  const $ = cheerio.load(res.data);
  const seen = new Set();
  const out = [];

  $('article.showtimes__card').each((i, el) => {
    const $el = $(el);
    const id = $el.attr('data-event') || `${i}`;
    let title = clean($el.find('.showtimes__title').first().text());
    const when = clean($el.find('.showtimes__when').first().text());
    if (!title || !when) return;

    const [datePart, timePart] = when.split('·').map((s) => s.trim());
    const date = parseMonthDay(datePart);
    const time = parseTime12(timePart || when);
    if (!date || !time) return;

    const key = `${id}|${date}|${time}`;
    if (seen.has(key)) return;
    seen.add(key);

    const notes = [];
    const fmt = title.match(FORMAT_SUFFIX);
    if (fmt) {
      notes.push(fmt[1].replace(/\b\w/g, (c) => c.toUpperCase()));
      title = title.replace(FORMAT_SUFFIX, '');
    }
    $el.find('.showtimes__chips').children().each((_, chip) => {
      const t = clean($(chip).text());
      if (t) notes.push(t);
    });

    const buy = $el.find('.showtimes__buy a[href]').first().attr('href');
    const soon = clean($el.find('.showtimes__soon').text());
    if (!buy && soon) notes.push(soon);
    const soldOut = /sold\s*out/i.test($el.find('.showtimes__buy').text());

    out.push({
      title,
      date,
      time,
      ticketLink: buy || URL_LIST,
      poster: $el.find('img.showtimes__poster').attr('src') || null,
      note: notes.join(' · ') || null,
      soldOut,
    });
  });

  return out;
};

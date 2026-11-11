/**
 * Suns Cinema (Mount Pleasant)
 * https://sunscinema.com/upcoming-films-3/
 *
 * Filmbot-powered site; the "Coming Soon" page is server-rendered and lists
 * every scheduled show:
 *   .show-details
 *     .show-title a.title                       title + detail link
 *     ol.showtimes li[data-date=EPOCH] a.showtime   "7:00 pm" -> /purchase/ID/
 *     .show-specs                               Director / Run Time / Release Year
 * data-date is a Unix timestamp for midnight (US Pacific) of the show date,
 * so reading it in UTC gives the right calendar day.
 * Films announced without showtimes carry .no-showtimes-date ("Opens on ...");
 * we skip those because there is no time to list yet.
 */
const cheerio = require('cheerio');
const { get, clean, parseTime12, pad } = require('./lib');

const URL_LIST = 'https://sunscinema.com/upcoming-films-3/';

function epochToDate(epoch) {
  const d = new Date(+epoch * 1000);
  if (isNaN(d)) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

module.exports = async function scrapeSuns() {
  const res = await get(URL_LIST);
  const $ = cheerio.load(res.data);
  const seen = new Set();
  const out = [];

  $('.show-details').each((_, el) => {
    const $el = $(el);
    const $title = $el.find('.show-title a.title').first();
    const title = clean($title.text());
    if (!title) return;
    const detail = $title.attr('href') || URL_LIST;
    const poster = $el.find('.show-poster img').first().attr('src') || null;

    const specs = {};
    $el.find('.show-specs > span').each((__, sp) => {
      const label = clean($(sp).find('.show-spec-label').text()).replace(':', '').toLowerCase();
      const value = clean($(sp).clone().children('.show-spec-label').remove().end().text());
      if (label) specs[label] = value;
    });
    const year = /^\d{4}$/.test(specs['release year'] || '') ? +specs['release year'] : null;
    const runtime = parseInt(specs['run time'], 10) || null;

    $el.find('ol.showtimes li[data-date]').each((__, li) => {
      const date = epochToDate($(li).attr('data-date'));
      $(li).find('a.showtime, span.showtime').each((___, a) => {
        const $a = $(a);
        const time = parseTime12($a.clone().children().remove().end().text());
        if (!date || !time) return;
        const key = `${title}|${date}|${time}`;
        if (seen.has(key)) return;
        seen.add(key);
        const soldOut = /sold-out/.test($a.attr('class') || '');
        out.push({
          title,
          date,
          time,
          // Link to the film page (stable, has the description); the
          // /purchase/ID/ link goes straight to checkout and dies once sold out.
          ticketLink: soldOut ? detail : $a.attr('href') || detail,
          infoLink: detail,
          poster,
          year,
          runtime,
          director: specs.director || null,
          soldOut,
        });
      });
    });
  });

  return out;
};

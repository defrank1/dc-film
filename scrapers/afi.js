/**
 * AFI Silver Theatre and Cultural Center (Silver Spring)
 * https://silver.afi.com/calendar/
 *
 * The calendar is a server-rendered table. Every day is a
 *   <td date="YYYY-MM-DD"> ... <div class="single_movie">
 *        <a class="movie-detail" href=".../movies/detail/ID">TITLE</a>
 *        <p class="movie_shows"><a><span>8:45 p.m.</span></a>...</p>
 * Other months come from the same endpoint the site's own "next month" arrow
 * calls: POST wp-admin/admin-ajax.php  action=getCalender&year=&month=
 * (the misspelling "Calender" is AFI's). No browser needed.
 *
 * The calendar has titles only, so each film's detail page is read once
 * (then cached) for its credit line, which AFI writes in a fixed style:
 *   "DIR John Carpenter; SCR ...; PROD .... U.S., 1995, color, 95 min."
 * That gives the year and director, which is what lets TMDB tell
 * THE FALL (2006) from the dozen other films called The Fall.
 */
const cheerio = require('cheerio');
const { get, post, clean, parseTime12, etParts, pad, meta, pool, sleep } = require('./lib');

const CAL = 'https://silver.afi.com/calendar/';
const AJAX = 'https://silver.afi.com/wp-admin/admin-ajax.php';
const MONTHS_AHEAD = 3; // current month + next 2

function parseMonth(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('td[date]').each((_, td) => {
    const date = $(td).attr('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    $(td).find('.single_movie').each((__, mv) => {
      const $a = $(mv).find('a.movie-detail').first();
      const title = clean($a.text());
      const href = $a.attr('href') || '';
      const id = (href.match(/detail\/(\w+)/) || [])[1];
      if (!title) return;
      $(mv).find('.movie_shows span').each((___, sp) => {
        const time = parseTime12($(sp).text());
        if (!time) return;
        out.push({
          _id: id || null,
          title,
          date,
          time,
          ticketLink: href || CAL,
          poster: id
            ? `https://vista.afi.com/CDN/media/entity/get/FilmPosterGraphic/e-${id}?referenceScheme=HeadOffice&allowPlaceHolder=true`
            : null,
        });
      });
    });
  });
  return out;
}

/** Pull year / director / runtime / series out of a film's detail page. */
function parseDetail(html) {
  const $ = cheerio.load(html);
  const out = {};
  // A page has several <p class="blurb">: an optional "Special Features:"
  // line, the programme note with the credit line, and a series link.
  let noteHtml = '';
  let text = '';
  $('p.blurb').each((_, p) => {
    const t = clean($(p).text());
    if (/^special features:/i.test(t)) {
      const f = t.replace(/^special features:\s*/i, '').replace(/[!.]+$/, '');
      if (f && f.length <= 90) out.features = f;
    } else if (/\bDIR\b|\bmin\b/.test(t) && t.length > text.length) {
      text = t;
      noteHtml = $(p).html() || '';
    }
  });
  if (!text) text = clean($('p.blurb').text());

  // Ends at the next credit (";") or at the "Country, year" sentence; initials
  // like "Edward L. Cahn" must not cut it short.
  const dir = text.match(/\bDIR(?:\/[A-Z/]+)?\s+(.{2,80}?)(?:;|,\s*(?:SCR|PROD)\b|\.\s+(?=[A-Z][A-Za-z./ -]*,\s*(?:18|19|20)\d{2}))/);
  if (dir) out.director = clean(dir[1]);
  // "U.S., 1995, color, 95 min" – the year sits between the country and the format.
  const credit =
    text.match(/,\s*((?:18|19|20)\d{2})(?:\/\d{2,4})?,\s*(?:color|b&w|b\/w|black)/i) ||
    text.match(/,\s*((?:18|19|20)\d{2}),[^.]{0,40}?\b\d{1,3}\s*min/i);
  if (credit) out.year = +credit[1];
  const run = clean($('p.RunTime').text()).match(/(\d{1,3})\s*Minutes/i) || text.match(/\b(\d{1,3})\s*min\b/);
  if (run) out.runtime = +run[1];
  // AFI puts the series name on its own line at the end of the note.
  const parts = noteHtml.split(/<br\s*\/?>\s*<br\s*\/?>/i);
  if (parts.length > 1) {
    const last = clean(cheerio.load(`<p>${parts[parts.length - 1]}</p>`).text());
    if (last && last.length <= 70 && !/\bDIR\b|\bmin\b/.test(last)) out.series = last;
  }
  return out;
}

async function addDetails(rows) {
  const ids = [...new Set(rows.map((r) => r._id).filter(Boolean))];
  const todo = ids.filter((id) => meta.get(`afi:${id}`) === undefined);
  await pool(todo, 4, async (id) => {
    try {
      const res = await get(`https://silver.afi.com/movies/detail/${id}`);
      meta.set(`afi:${id}`, parseDetail(String(res.data)));
    } catch (err) {
      // leave uncached so the next run tries again
    }
    await sleep(150);
  });
  for (const r of rows) {
    const d = (r._id && meta.get(`afi:${r._id}`)) || {};
    if (d.year) r.year = d.year;
    if (d.director) r.director = d.director;
    if (d.runtime) r.runtime = d.runtime;
    // Only keep end-of-note lines that really are series names.
    if (d.series && /^(in memoriam|(also )?part of)\b/i.test(d.series)) {
      r.series = d.series.replace(/^(also )?part of (the )?/i, '').replace(/\.$/, '');
    }
    if (d.features) r.note = d.features;
    delete r._id;
  }
}

module.exports = async function scrapeAFI() {
  const now = etParts();
  const out = [];
  const errors = [];

  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(now.year, now.month - 1 + i, 1));
    const year = d.getUTCFullYear();
    const month = pad(d.getUTCMonth() + 1);
    try {
      let html;
      if (i === 0) {
        html = (await get(CAL)).data;
      } else {
        html = (
          await post(AJAX, `action=getCalender&year=${year}&month=${month}`, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              Referer: CAL,
            },
          })
        ).data;
      }
      out.push(...parseMonth(String(html)));
    } catch (err) {
      errors.push(`${year}-${month}: ${err.message}`);
    }
  }

  if (!out.length && errors.length) throw new Error(errors.join('; '));
  await addDetails(out);
  return out;
};

module.exports._parseDetail = parseDetail;

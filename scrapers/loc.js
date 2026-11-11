/**
 * Library of Congress – Mary Pickford Theater (Capitol Hill)
 * https://www.loc.gov/events/
 *
 * loc.gov has a public JSON API (add fo=json to any page). We ask for events
 * tagged "film and video screenings" from today through the next year and keep
 * only the Main Campus ones – the Packard Campus theater is in Culpeper, VA,
 * 70 miles out.
 *
 * The API is slow and occasionally resets connections, hence the long timeout.
 */
const { http, sleep, clean, todayET, etParts } = require('./lib');

const INCLUDE_CAMPUS = /main campus/i;

function strip(title) {
  // "Film screening: Black Narcissus (1947)" -> "Black Narcissus (1947)"
  return clean(title)
    .replace(/^(live!? at the library:\s*)/i, '')
    .replace(/^film\s+screening(\s+of)?\s*[:\-–]\s*/i, '')
    .replace(/^film\s*:\s*/i, '')
    .replace(/\s+not rated\s*$/i, '')
    .replace(/^["“]([^"”]+)["”]/, '$1')
    .trim();
}

module.exports = async function scrapeLOC() {
  const now = etParts();
  const from = todayET();
  const to = `${now.year + 1}-${String(now.month).padStart(2, '0')}-28`;
  const url =
    'https://www.loc.gov/events/?fo=json&c=100&at=results' +
    '&fa=subject:film+and+video+screenings' +
    `&dates=${from}/${to}`;

  let data;
  let lastErr;
  for (let attempt = 0; attempt < 3 && !data; attempt++) {
    try {
      const res = await http.get(url, { timeout: 90000 });
      data = res.data;
    } catch (err) {
      lastErr = err;
      await sleep(4000);
    }
  }
  if (!data) throw lastErr || new Error('no response from loc.gov');

  const results = data.results || (data.content && data.content.results) || [];
  const out = [];
  for (const ev of results) {
    const item = ev.item || {};
    const cats = item.categories || [];
    if (!cats.includes('film and video screenings')) continue;
    if (!INCLUDE_CAMPUS.test(item.campus || '')) continue;
    // Symposia and study days are sometimes cross-tagged as screenings.
    if (cats.length > 1 && !/film|screening|cinema|movie/i.test(ev.title || '')) continue;
    const local = item.event_start_time_local || ''; // "2026-11-10T19:30:00"
    const m = local.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (!m) continue;
    out.push({
      title: strip(ev.title || item.tag_line),
      date: m[1],
      time: m[2],
      ticketLink: ev.url || 'https://www.loc.gov/events/',
      note: 'Free',
    });
  }
  return out;
};

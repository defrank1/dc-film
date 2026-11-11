/**
 * Angelika Pop-Up at Union Market
 * https://angelikafilmcenter.com/dc
 *
 * The site is a React app backed by Reading Cinemas' JSON API. It works the
 * same way the site itself does in a browser:
 *   1. GET /settings/6            -> a guest token handed to every visitor
 *   2. GET /films?...flag=initial -> today's films + the list of every date
 *                                    that has sessions (filter.session)
 *   3. GET /films?...flag=nowshowing&selectedDate=YYYY-MM-DD  for each date
 * Showtimes carry an ISO time with offset ("2026-11-11T19:15:00-05").
 * cinemaId 0000000007 = Angelika Pop-Up DC, countryId 6 = US.
 */
const { http, sleep, clean, todayET } = require('./lib');

const API = 'https://production-api.readingcinemas.com';
const CINEMA = '0000000007';
const SITE = 'https://angelikafilmcenter.com/dc';
const MAX_DATES = 45;

async function api(path, token) {
  const headers = { Origin: 'https://angelikafilmcenter.com', Referer: `${SITE}/` };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await http.get(`${API}${path}`, { headers });
  return res.data;
}

function collect(movies, out, seen) {
  for (const m of movies || []) {
    const title = clean(m.name);
    if (!title) continue;
    const detail = m.movieSlug ? `${SITE}/movies/details/${m.movieSlug}` : `${SITE}/now-playing`;
    for (const sd of m.showdates || []) {
      for (const type of sd.showtypes || []) {
        for (const s of type.showtimes || []) {
          // "2026-11-11T19:15:00-05" – local wall-clock time is right there.
          const mt = String(s.date_time || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
          if (!mt) continue;
          const key = `${s.id || title}|${mt[1]}|${mt[2]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const notes = [];
          if (type.type && !/^standard$/i.test(type.type)) notes.push(clean(type.type));
          if (m.signaturePrograming) notes.push(clean(m.signaturePrograming));
          out.push({
            title,
            date: mt[1],
            time: mt[2],
            ticketLink: detail,
            poster: m.poster_image || null,
            director: clean(m.director) || null,
            runtime: parseInt(m.length, 10) || null,
            series: clean(m.signaturePrograming) || null,
            note: [...new Set(notes)].join(' · ') || null,
            soldOut: !!s.soldout,
          });
        }
      }
    }
  }
}

module.exports = async function scrapeAngelika() {
  const settings = await api('/settings/6');
  const token = settings && settings.data && settings.data.settings && settings.data.settings.token;
  if (!token) throw new Error('no guest token in /settings/6 response');

  const base = `/films?countryId=6&cinemaId=${CINEMA}&status=getShows`;
  const initial = await api(`${base}&flag=initial&selectedDate=`, token);
  const now = initial && initial.nowShowing && initial.nowShowing.data;
  if (!now) throw new Error('unexpected /films response shape');

  const out = [];
  const seen = new Set();
  collect(now.movies, out, seen);

  const today = todayET();
  const have = new Set(out.map((s) => s.date));
  const dates = ((now.filter && now.filter.session) || [])
    .map((s) => s.value)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today && !have.has(d))
    .slice(0, MAX_DATES);

  for (const d of dates) {
    try {
      const day = await api(`${base}&flag=nowshowing&selectedDate=${d}`, token);
      collect(day && day.nowShowing && day.nowShowing.data && day.nowShowing.data.movies, out, seen);
    } catch (err) {
      // one bad day shouldn't sink the venue
    }
    await sleep(200);
  }
  return out;
};

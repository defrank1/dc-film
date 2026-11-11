/**
 * TMDB enrichment: poster, year, director, runtime, synopsis.
 *
 * One lookup per film (not per screening), cached in data/tmdb-cache.json so
 * a normal run only asks TMDB about titles it hasn't seen before.
 *
 * Matching is deliberately conservative: a wrong poster is worse than no
 * poster. A TMDB result is only accepted when its title (or original title)
 * matches ours after normalisation AND it agrees with whatever else the venue
 * told us (IMDb id, year, director). See lookup() for the exact rules.
 */
const fs = require('fs');
const path = require('path');
const { http, sleep } = require('./lib');
const { normKey } = require('./titles');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'tmdb-cache.json');
const HIT_TTL_DAYS = 45;
const MISS_TTL_DAYS = 5;

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveCache(cache) {
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  fs.writeFileSync(CACHE_FILE, JSON.stringify(sorted, null, 1) + '\n');
}

const daysAgo = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

async function tmdb(pathname, params, apiKey) {
  const qs = new URLSearchParams({ api_key: apiKey, ...params }).toString();
  const res = await http.get(`https://api.themoviedb.org/3${pathname}?${qs}`, { timeout: 10000 });
  return res.data;
}

const yearOf = (r) => (r.release_date ? +r.release_date.slice(0, 4) : null);

/** Do two "director" strings share a surname? ("J. A. Bayona" ~ "J.A. Bayona") */
function sameDirector(a, b) {
  const names = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/,|&|\band\b|\//)
      .map((n) => n.trim().split(/\s+/).pop())
      .filter((n) => n && n.length > 2);
  const A = names(a);
  const B = new Set(names(b));
  return A.some((n) => B.has(n));
}

async function details(id, apiKey) {
  const d = await tmdb(`/movie/${id}`, { append_to_response: 'credits' }, apiKey);
  const directors = ((d.credits && d.credits.crew) || [])
    .filter((c) => c.job === 'Director')
    .map((c) => c.name);
  return {
    tmdbId: d.id,
    title: d.title,
    year: yearOf(d),
    poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : null,
    director: directors.slice(0, 3).join(', ') || null,
    runtime: d.runtime || null,
    overview: d.overview ? (d.overview.length > 420 ? d.overview.slice(0, 400).replace(/\s+\S*$/, '') + '…' : d.overview) : null,
    genres: (d.genres || []).map((g) => g.name).slice(0, 3),
  };
}

/** Titles to try: as given, then without a leading possessive ("Guy Maddin's Careful"). */
function variants(title) {
  const out = [title];
  const poss = title.match(/^[A-Z][\w.]*(?:\s+[A-Z][\w.]*){0,2}['’]s\s+(.{3,})$/);
  if (poss) out.push(poss[1]);
  return out;
}

/**
 * film: { title, year?, director?, runtime?, imdbId?, noGuess? }
 *
 * How sure we need to be depends on what the venue told us:
 *   IMDb id          -> ask TMDB for exactly that title; never fall back to a name search
 *   year             -> exact title + release year within 1 (then 3) years
 *   director only    -> exact title + a director with the same surname
 *   nothing          -> exact title, and only if one result clearly dominates
 */
async function lookup(film, apiKey) {
  if (film.imdbId) {
    const found = await tmdb(`/find/${film.imdbId}`, { external_source: 'imdb_id' }, apiKey);
    const m = (found.movie_results || [])[0];
    return m ? details(m.id, apiKey) : null;
  }
  if (film.noGuess) return null;

  for (const title of variants(film.title)) {
    const want = normKey(title);
    const searches = film.year ? [{ year: String(film.year) }, {}] : [{}];
    let candidates = [];
    for (const extra of searches) {
      const data = await tmdb('/search/movie', { query: title, include_adult: 'false', ...extra }, apiKey);
      candidates = (data.results || []).filter((r) =>
        [r.title, r.original_title].filter(Boolean).map(normKey).includes(want)
      );
      if (candidates.length) break;
    }
    if (!candidates.length) continue;

    if (film.year) {
      for (const tolerance of [1, 3]) {
        const byYear = candidates.filter((r) => yearOf(r) && Math.abs(yearOf(r) - film.year) <= tolerance);
        if (byYear.length === 1 || (byYear.length > 1 && !film.director)) return details(byYear[0].id, apiKey);
        if (byYear.length > 1) {
          for (const r of byYear.slice(0, 4)) {
            const d = await details(r.id, apiKey);
            if (sameDirector(d.director, film.director)) return d;
          }
          return details(byYear[0].id, apiKey);
        }
      }
      continue;
    }

    if (film.director) {
      for (const r of candidates.slice(0, 5)) {
        const d = await details(r.id, apiKey);
        if (sameDirector(d.director, film.director)) return d;
      }
      continue;
    }

    // No hints at all: only trust an unambiguous result.
    if (candidates.length === 1) return details(candidates[0].id, apiKey);
    const ranked = [...candidates].sort((x, y) => (y.vote_count || 0) - (x.vote_count || 0));
    if ((ranked[0].vote_count || 0) >= 50 && (ranked[0].vote_count || 0) >= 10 * (ranked[1].vote_count || 0)) {
      return details(ranked[0].id, apiKey);
    }
  }
  return null;
}

/**
 * films: Map(filmKey -> { title, year?, director?, runtime?, imdbId?, noGuess? })
 * returns Map(filmKey -> tmdb record | null)
 */
async function enrich(films, apiKey) {
  const out = new Map();
  if (!apiKey || apiKey === 'TMDB_API_KEY_PLACEHOLDER') {
    console.log('TMDB: no API key configured, skipping enrichment');
    return out;
  }
  const cache = loadCache();
  let asked = 0;
  let failed = 0;

  for (const [key, film] of films) {
    const sig = [film.year || '', film.director || '', film.imdbId || '', film.noGuess ? 'x' : ''].join('|');
    let cached = cache[key];
    if (cached && cached.sig !== sig) cached = null; // the venue told us something new
    if (cached) {
      const ttl = cached.data ? HIT_TTL_DAYS : MISS_TTL_DAYS;
      if (daysAgo(cached.at) < ttl) {
        out.set(key, cached.data);
        continue;
      }
    }
    try {
      const data = await lookup(film, apiKey);
      cache[key] = { at: new Date().toISOString().slice(0, 10), q: film.title, sig, data };
      out.set(key, data);
      asked++;
      await sleep(60);
    } catch (err) {
      failed++;
      // Keep whatever we had rather than dropping a poster over a blip.
      out.set(key, cached ? cached.data : null);
      if (failed > 15) {
        console.log('TMDB: too many failures, stopping lookups for this run');
        break;
      }
    }
  }

  // Forget films nobody has shown for a while.
  for (const k of Object.keys(cache)) {
    if (!films.has(k) && daysAgo(cache[k].at) > 120) delete cache[k];
  }
  saveCache(cache);
  console.log(`TMDB: ${asked} new lookups, ${failed} failures, ${out.size} films resolved`);
  return out;
}

module.exports = { enrich };

#!/usr/bin/env node
/**
 * 7:30 Showtimes scraper
 *
 * Runs every venue scraper in scrapers/, cleans and merges the results,
 * looks films up on TMDB, and writes:
 *   data/screenings.json   what the site displays
 *   data/status.json       per-venue health (ok / stale / blocked / error)
 *   data/tmdb-cache.json   TMDB lookups, so we only ask once per film
 *
 * Usage:
 *   npm run scrape                 all venues
 *   node scraper.js afi suns       only these venues (others keep their
 *                                  existing data)
 *   node scraper.js --dry          run everything but write nothing
 *
 * Safety net: if a venue's scraper throws, is blocked, or suddenly returns
 * nothing, we keep that venue's previously scraped future showtimes (marked
 * "stale" in status.json) for up to STALE_DAYS days instead of silently
 * dropping the theater from the site.
 */
const fs = require('fs');
const path = require('path');
const { todayET } = require('./scrapers/lib');
const { parseTitle, normKey } = require('./scrapers/titles');
const { enrich } = require('./scrapers/tmdb');

const DATA = path.join(__dirname, 'data');
const OUT = path.join(DATA, 'screenings.json');
const STATUS = path.join(DATA, 'status.json');
const VENUES = JSON.parse(fs.readFileSync(path.join(DATA, 'venues.json'), 'utf8')).tracked;
const TMDB_API_KEY = process.env.TMDB_API_KEY || require('./package.json').tmdbApiKey;

const STALE_DAYS = 7; // how long to keep showing old data for a broken venue
const HORIZON_DAYS = 75; // ignore anything further out than this
const VENUE_TIMEOUT_MS = 4 * 60 * 1000;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const only = args.filter((a) => !a.startsWith('--'));

const readJSON = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
};

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Map a venue name from an older screenings.json to a venue id. */
function venueIdFor(s) {
  if (s.venueId) return s.venueId;
  const v = VENUES.find((x) => x.name === s.venue || (x.aliases || []).includes(s.venue));
  return v ? v.id : null;
}

async function main() {
  const today = todayET();
  const horizon = addDays(today, HORIZON_DAYS);
  const previous = readJSON(OUT, { screenings: [], films: {} });
  const prevStatus = readJSON(STATUS, { venues: {} });
  const prevByVenue = {};
  for (const s of previous.screenings || []) {
    const id = venueIdFor(s);
    if (!id) continue;
    (prevByVenue[id] = prevByVenue[id] || []).push(s);
  }

  console.log(`7:30 Showtimes scraper — ${today} (Eastern)\n`);

  /* ---- 1. scrape every venue ---- */
  const status = {};
  const rawByVenue = {};

  await Promise.all(
    VENUES.map(async (venue) => {
      const prev = prevStatus.venues[venue.id] || {};
      if (only.length && !only.includes(venue.id) && !only.includes(venue.scraper)) {
        rawByVenue[venue.id] = null; // keep existing
        status[venue.id] = { ...prev, skipped: true };
        return;
      }
      const started = Date.now();
      try {
        const fn = require(`./scrapers/${venue.scraper}`);
        const rows = await withTimeout(fn(), VENUE_TIMEOUT_MS, venue.short);
        const valid = (rows || []).filter(
          (r) =>
            r &&
            r.title &&
            /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') &&
            /^\d{2}:\d{2}$/.test(r.time || '') &&
            r.date >= today &&
            r.date <= horizon
        );
        rawByVenue[venue.id] = valid;
        status[venue.id] = {
          status: 'ok',
          count: valid.length,
          lastSuccess: new Date().toISOString(),
          seconds: +((Date.now() - started) / 1000).toFixed(1),
        };
        // A venue that had a full schedule yesterday and nothing today is far
        // more likely a broken selector than an empty calendar.
        const prevFuture = (prevByVenue[venue.id] || []).filter((s) => s.date >= today).length;
        if (!valid.length && prevFuture >= 5 && prev.status !== 'empty') {
          status[venue.id] = {
            status: 'stale',
            count: 0,
            lastSuccess: prev.lastSuccess || null,
            message: 'scraper returned nothing where there used to be listings — the page layout may have changed',
          };
          rawByVenue[venue.id] = null;
        } else if (!valid.length) {
          status[venue.id].status = 'empty';
          status[venue.id].message = 'no upcoming screenings listed';
        }
      } catch (err) {
        rawByVenue[venue.id] = null;
        status[venue.id] = {
          status: err.blocked ? 'blocked' : 'error',
          count: 0,
          lastSuccess: prev.lastSuccess || null,
          message: String(err.message || err).slice(0, 300),
        };
      }
      const st = status[venue.id];
      console.log(
        `  ${venue.short.padEnd(20)} ${st.status.padEnd(8)} ${String(st.count).padStart(4)} screenings` +
          (st.message ? `  (${st.message})` : '')
      );
    })
  );

  /* ---- 2. normalise ---- */
  const rows = [];
  for (const venue of VENUES) {
    const raw = rawByVenue[venue.id];
    if (raw) {
      for (const r of raw) {
        const p = parseTitle(r.title);
        const notes = [...p.notes];
        if (r.note) notes.push(r.note);
        rows.push({
          venueId: venue.id,
          venue: venue.name,
          base: normKey(p.title),
          title: p.title,
          year: r.year || p.year || null,
          date: r.date,
          time: r.time,
          ticketLink: r.ticketLink,
          infoLink: r.infoLink || null,
          poster: r.poster || null,
          still: r.still || null,
          director: r.director || null,
          runtime: r.runtime || null,
          imdbId: r.imdbId || null,
          // A year-less listing billed as a filmmaker event is usually a new,
          // small film; a same-named older title on TMDB is the wrong one.
          noGuess: !!r.noGuess || (p.event && !(r.year || p.year) && !r.director && !r.imdbId),
          series: r.series || null,
          note: [...new Set(notes)].join(' · ') || null,
          soldOut: !!r.soldOut,
        });
      }
    } else {
      // Fall back to what we had, if it is recent enough.
      const st = status[venue.id];
      const last = st.lastSuccess || previous.lastUpdated;
      const ageDays = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;
      const kept = ageDays <= STALE_DAYS || st.skipped
        ? (prevByVenue[venue.id] || []).filter((s) => s.date >= today && s.date <= horizon)
        : [];
      for (const s of kept) {
        const prevFilm = (previous.films || {})[s.film] || {};
        const p = s.film ? { title: prevFilm.title || s.title, year: prevFilm.year || null } : parseTitle(s.title);
        rows.push({
          venueId: venue.id,
          venue: venue.name,
          base: normKey(p.title),
          title: p.title,
          year: p.year || null,
          date: s.date,
          time: s.time,
          ticketLink: s.ticketLink,
          infoLink: s.infoLink || null,
          poster: s.venuePoster || (s.film ? null : s.poster) || null,
          still: null,
          director: null,
          runtime: null,
          series: s.series || null,
          note: s.note || null,
          soldOut: !!s.soldOut,
        });
      }
      if (!st.skipped) {
        st.count = kept.length;
        if (kept.length && st.status !== 'stale') st.keptStale = true;
      }
    }
  }

  /* ---- 3. group into films ---- */
  // Same normalised title = same film, unless venues disagree on the year
  // (e.g. THE HAUNTING 1963 vs 1999), in which case each year is its own film
  // and year-less listings stay separate too.
  const byBase = new Map();
  for (const r of rows) {
    if (!byBase.has(r.base)) byBase.set(r.base, []);
    byBase.get(r.base).push(r);
  }
  const groups = new Map(); // groupKey -> { title, year, rows[] }
  for (const [base, list] of byBase) {
    const years = [...new Set(list.map((r) => r.year).filter(Boolean))];
    for (const r of list) {
      let y = r.year;
      if (!y && years.length === 1) y = years[0];
      const gk = `${base}|${y || ''}`;
      if (!groups.has(gk)) groups.set(gk, { base, title: r.title, year: y || null, rows: [] });
      const g = groups.get(gk);
      g.rows.push(r);
      // Prefer a title that wasn't shouted in caps by the source.
      if (/[a-z]/.test(r.title) && r.title.length >= g.title.length) g.title = r.title;
    }
  }

  /* ---- 4. TMDB ---- */
  const lookups = new Map();
  for (const [gk, g] of groups) {
    const first = (k) => (g.rows.find((r) => r[k]) || {})[k] || null;
    lookups.set(gk, {
      title: g.title,
      year: g.year,
      director: first('director'),
      runtime: first('runtime'),
      imdbId: first('imdbId'),
      // Only refuse to guess if every venue showing it says so.
      noGuess: g.rows.every((r) => r.noGuess),
    });
  }
  const tmdb = DRY && !process.env.TMDB_IN_DRY ? new Map() : await enrich(lookups, TMDB_API_KEY);

  /* ---- 5. build output ---- */
  const films = {};
  const screenings = [];
  const seen = new Set();
  const thisYear = +today.slice(0, 4);

  for (const [gk, g] of groups) {
    const t = tmdb.get(gk) || null;
    const year = g.year || (t && t.year) || null;
    const id = `${g.base}${year ? `-${year}` : ''}` || 'untitled';
    const first = (k) => (g.rows.find((r) => r[k]) || {})[k] || null;
    const title = t && normKey(t.title) === g.base ? t.title : g.title;

    if (!films[id]) {
      films[id] = {
        title,
        year,
        director: first('director') || (t && t.director) || null,
        runtime: (t && t.runtime) || first('runtime') || null,
        poster: (t && t.poster) || first('poster') || null,
        still: first('still'),
        overview: (t && t.overview) || null,
        genres: (t && t.genres) || [],
        tmdbId: (t && t.tmdbId) || null,
        // "Repertory" = at least two calendar years old.
        rep: year ? year <= thisYear - 2 : false,
      };
    }
    const film = films[id];

    for (const r of g.rows) {
      const key = `${r.venueId}|${id}|${r.date}|${r.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const s = {
        film: id,
        title: film.title,
        venueId: r.venueId,
        venue: r.venue,
        date: r.date,
        time: r.time,
        ticketLink: r.ticketLink,
      };
      if (r.infoLink && r.infoLink !== r.ticketLink) s.infoLink = r.infoLink;
      if (r.poster && r.poster !== film.poster) s.venuePoster = r.poster;
      if (r.series) s.series = r.series;
      if (r.note) s.note = r.note;
      if (r.soldOut) s.soldOut = true;
      screenings.push(s);
    }
  }

  // Drop empty optional film fields to keep the file small.
  for (const f of Object.values(films)) {
    for (const k of Object.keys(f)) {
      if (f[k] === null || (Array.isArray(f[k]) && !f[k].length) || f[k] === false) delete f[k];
    }
  }

  screenings.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.title.localeCompare(b.title) ||
      a.venueId.localeCompare(b.venueId)
  );

  const sortedFilms = Object.fromEntries(Object.keys(films).sort().map((k) => [k, films[k]]));
  const output = { lastUpdated: new Date().toISOString(), films: sortedFilms, screenings };
  for (const v of VENUES) delete status[v.id].skipped;
  const statusOut = { generatedAt: output.lastUpdated, venues: status };

  /* ---- 6. report & write ---- */
  const counts = {};
  for (const s of screenings) counts[s.venueId] = (counts[s.venueId] || 0) + 1;
  console.log('\nIn the output file:');
  for (const v of VENUES) {
    const st = status[v.id];
    console.log(`  ${v.short.padEnd(20)} ${String(counts[v.id] || 0).padStart(4)}  ${st.status}${st.keptStale ? ' (showing last good data)' : ''}`);
  }
  console.log(`\n${screenings.length} screenings of ${Object.keys(films).length} films`);

  if (!screenings.length) {
    console.error('Nothing scraped at all — leaving the existing data file untouched.');
    process.exitCode = 1;
    return;
  }
  if (DRY) {
    console.log('(dry run — nothing written)');
    return;
  }
  require('./scrapers/lib').meta.save();
  fs.writeFileSync(OUT, JSON.stringify(output, null, 1) + '\n');
  fs.writeFileSync(STATUS, JSON.stringify(statusOut, null, 1) + '\n');
  console.log(`Wrote ${path.relative(__dirname, OUT)} and ${path.relative(__dirname, STATUS)}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

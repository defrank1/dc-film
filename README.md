# 7:30 Showtimes

Every showtime at Washington, DC's independent and repertory movie screens, on one page.

- **Live site:** https://defrank1.github.io/dc-film/
- **Stack:** plain HTML, CSS and JavaScript (no build step) + a Node.js scraper
- **Hosting:** GitHub Pages; GitHub Actions re-scrapes every 6 hours

## Theaters

| Theater | How it is read | Notes |
|---|---|---|
| AFI Silver Theatre | Calendar HTML + the site's own month endpoint | Detail pages are read once per film for year/director |
| Avalon Theatre | Per-day listing pages | Times have no AM/PM on the site; see `scrapers/avalon.js` |
| Suns Cinema | "Coming Soon" page HTML | |
| Angelika Pop-Up at Union Market | The site's JSON API | |
| 4EYE Film Center | "What's On" page HTML | |
| National Gallery of Art | Headless browser (Puppeteer) | Site has a JavaScript check that sometimes refuses automated browsers |
| Library of Congress | loc.gov JSON API | Main campus only; often nothing scheduled |
| Miracle Theatre | Events RSS feed | **Currently blocked** by an "I am human" check on the theater's site. Not bypassed. |

Link-only venues (no scraper) are listed under `more` in `data/venues.json`.

## How it works

```
scrapers/<venue>.js  ─┐
                      ├─>  scraper.js  ─>  data/screenings.json  ─>  js/app.js (the site)
scrapers/tmdb.js     ─┘                    data/status.json
```

1. `scraper.js` runs each venue scraper, cleans up titles ("DANCING LADY (1933) in 35mm" becomes title, year and a "35mm" tag), groups the same film across theaters and looks it up on TMDB for a poster, director and synopsis.
2. It writes `data/screenings.json` (films + showtimes) and `data/status.json` (did each theater scrape work).
3. The site is static. `js/app.js` reads `data/venues.json`, `data/screenings.json` and `data/status.json` and draws everything.

**When a scraper breaks:** the theater's last good listings stay on the site for up to 7 days, `data/status.json` records the failure, the Theaters page says so, and the Actions run shows a warning with a status table. Each scraper file starts with a comment describing the page structure it expects, which is the first place to look.

## Running it locally

```bash
npm install
npm run scrape            # all theaters (about 2 minutes the first time)
node scraper.js afi suns  # just some theaters; the rest keep their data
npm run scrape:dry        # scrape but write nothing
npm run serve             # then open http://localhost:8000
```

## Files

```
index.html               the whole site (views are switched in JS)
calendar.html            redirect kept for old links
css/style.css            design tokens at the top; "house lights" = light mode
js/app.js                rendering, filters, URL state
data/venues.json         hand-maintained theater list (names, addresses, blurbs)
data/screenings.json     generated
data/status.json         generated
data/tmdb-cache.json     generated; TMDB answers, so each film is looked up once
data/venue-meta-cache.json  generated; per-film details read from theater sites
scraper.js               orchestrator
scrapers/                one file per theater + shared helpers
.github/workflows/       the 6-hourly scrape
```

## Adding a theater

1. Add an entry to `tracked` in `data/venues.json` with a `scraper` name.
2. Create `scrapers/<name>.js` exporting an async function that returns
   `[{ title, date: 'YYYY-MM-DD', time: 'HH:MM', ticketLink, ...optional }]` (24-hour Eastern time).
   Optional fields: `year`, `director`, `runtime`, `imdbId`, `poster`, `note`, `series`, `soldOut`.
3. `node scraper.js <id> --dry` to test.

## Design

The look is derived from 730DC (one red, hairline grid, Space Mono, wide uppercase labels) on a dark ground. Colors and fonts are CSS variables at the top of `css/style.css`. The label face is Archivo Expanded from Google Fonts.

## Credits

Film data from [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB.

## License

MIT

# Scraper status

The live, per-run status is in `data/status.json` (also shown on the site's Theaters page and in each GitHub Actions run summary). This file records what was true when the scrapers were rewritten on 2026-11-10.

| Theater | Result on 2026-11-10 | Fragility |
|---|---|---|
| AFI Silver | 339 showtimes, 113 films | Low. Depends on `td[date]` cells and `.single_movie` blocks, and on the credit line format ("DIR ...; ... U.S., 1995, color") for year/director. |
| Angelika Pop-Up | 226 showtimes | Low to medium. Uses the site's JSON API with the guest token every visitor gets; breaks if Reading Cinemas changes that API. |
| Avalon | 67 showtimes | Medium. AM/PM is inferred (see file header). Needs the homepage mini-calendar to keep linking `films/?date=YYYYMMDD`. |
| Suns Cinema | 33 showtimes | Low. Filmbot markup (`.show-details`, `ol.showtimes li[data-date]`). |
| 4EYE Film Center | 11 showtimes | Low, but the site is weeks old and may still change. |
| National Gallery of Art | 13 showtimes | **High.** Needs a headless browser and the site's JavaScript check let it through on some runs and not others. When refused, the last good listings are kept for 7 days. |
| Library of Congress | 0 (nothing scheduled on the main campus within 75 days) | Low. Public API. |
| Miracle Theatre | Feed read fine; 0 films (its "In-Theatre Movies" category was empty and the next events are all live shows) | Medium. The site serves a browser challenge to clients posing as a desktop browser, so this scraper sends a plain self-identifying User-Agent. If the challenge is served anyway it reports "blocked" and does not try to get around it. |

Spot checks against the theaters' own pages on 2026-11-10 matched for AFI (Nov 11), Avalon (Nov 14), Angelika (Nov 14), Suns (Nov 13), 4EYE (all) and NGA (Nov 14).

## Known limits

- TMDB matching is conservative. 17 of 179 films had no confident match (shorts programs, lectures, a few obscure titles) and show the theater's own image or a placeholder.
- "Rep & classics" means the film's release year is two or more years back. Films with no known year are not counted as rep.
- Showtimes more than 75 days out are ignored.

/**
 * National Gallery of Art – film program (East Building auditorium)
 * https://www.nga.gov/calendar?type[103026]=103026   (103026 = "Films")
 *
 * nga.gov sits behind a JavaScript check, so this one needs a real browser.
 * Each screening on the filtered calendar is a link like
 *   <a href="/calendar/<series>/<film>?evd=202611141900">
 *     <h5>Film title</h5>
 *     <time class="datetime" datetime="2026-11-14T14:00:00-05:00">
 * evd is the start time in UTC (YYYYMMDDHHMM) and is used as a fallback if
 * the <time> element is missing. Series landing pages have no evd and are
 * skipped.
 */
const { withPage } = require('./browser');
const { clean, toET, todayET } = require('./lib');

const BASE = 'https://www.nga.gov';
const MAX_PAGES = 6;

module.exports = async function scrapeNGA() {
  return withPage(async (page) => {
    const seen = new Set();
    const out = [];

    for (let p = 0; p < MAX_PAGES; p++) {
      const url =
        `${BASE}/calendar?type%5B103026%5D=103026&visit_start=${todayET()}&tab=all` +
        (p ? `&page=${p}` : '');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // The site sometimes shows a "Just a moment..." interstitial that clears
      // on its own in a real browser. Give it time; if it doesn't clear, give up
      // (we don't try to defeat it) and let the orchestrator keep the last
      // good data.
      let title = await page.title();
      for (let i = 0; i < 10 && /just a moment|verification/i.test(title); i++) {
        await new Promise((r) => setTimeout(r, 3000));
        title = await page.title();
      }
      if (/just a moment|verification/i.test(title)) {
        const err = new Error('nga.gov kept showing its browser check instead of the calendar');
        err.blocked = true;
        throw err;
      }
      await new Promise((r) => setTimeout(r, 2000));

      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href*="/calendar/"][href*="evd="]')).map((a) => {
          const h = a.querySelector('h1, h2, h3, h4, h5, h6, [class*="title-line"]');
          const t = a.querySelector('time[datetime]');
          const card = a.closest('[class*="event-list-item"]');
          return {
            href: a.getAttribute('href'),
            text: (h || a).textContent,
            hasHeading: !!h,
            start: t ? t.getAttribute('datetime') : null, // "2026-11-14T14:00:00-05:00"
            eyebrow: (a.querySelector('[class*="eyebrow"]') || {}).textContent || '',
            registration: (a.querySelector('[class*="registration"]') || {}).textContent || '',
            img: card && card.querySelector('img') ? card.querySelector('img').src : null,
          };
        })
      );

      let added = 0;
      for (const l of links) {
        const text = clean(String(l.text).replace(/\u00a0/g, ' '));
        if (!text || !l.hasHeading) continue;
        let when = null;
        const local = (l.start || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
        if (local) {
          when = { date: local[1], time: local[2] };
        } else {
          const m = (l.href || '').match(/evd=(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
          if (m) when = toET(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])));
        }
        if (!when) continue;
        const link = new URL(l.href, BASE).href;
        if (seen.has(link)) continue;
        seen.add(link);
        const seriesSlug = (l.href.match(/\/calendar\/([^/?]+)\/[^/?]+\?/) || [])[1];
        const notes = ['Free'];
        if (/registration/i.test(l.registration)) notes.push('Registration required');
        out.push({
          title: text,
          date: when.date,
          time: when.time,
          ticketLink: link,
          series: seriesSlug ? seriesSlug.replace(/-/g, ' ') : null,
          note: notes.join(' · '),
        });
        added++;
      }
      if (!added) break; // ran out of pages
    }
    return out;
  });
};

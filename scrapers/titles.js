/**
 * Title clean-up shared by every venue.
 *
 * Theaters write titles every which way:
 *   "DANCING LADY (1933) in 35mm"      "THE BARKER in 35mm (1928)"
 *   "WHO KILLED ALEX ODEH? Special Screening with Filmmakers!"
 *   "Being Heumann – Open Caption"
 * parseTitle() pulls those apart into { title, year, notes[] } so the same
 * film groups together across venues and TMDB can match it.
 */

const MINOR = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'on', 'at', 'to', 'by',
  'in', 'of', 'up', 'as', 'vs', 'via', 'with', 'from', 'de', 'du', 'des',
]);
const KEEP_UPPER = /^(II|III|IV|VI|VII|VIII|IX|XI|XII|XIII|DC|NYC|USA|UK|TV|FBI|CIA|JFK|NT|UFO|([A-Z]\.)+[A-Z]?)$/;

/** Title-case text that is (almost) entirely upper case; leave mixed case alone. */
function titleCase(s) {
  const letters = s.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  // "FRIDAY THE 13th" has a stray lowercase ordinal, so allow a little slack.
  if (!letters || upper / letters.length < 0.85) return s;
  let first = true;
  return s
    .split(/(\s+|[-–—/:(]\s*)/)
    .map((tok) => {
      if (!/[A-Za-z]/.test(tok)) return tok;
      const bare = tok.replace(/[^A-Za-z.]/g, '');
      if (KEEP_UPPER.test(bare)) {
        first = false;
        return tok;
      }
      const lower = tok.toLowerCase();
      if (!first && MINOR.has(lower)) return lower;
      first = false;
      // capitalise first letter, and letters after an apostrophe-less hyphen are split already
      return lower.replace(/^(["'“‘(\[]*)([a-z])/, (m, pre, c) => pre + c.toUpperCase());
    })
    .join('')
    // After a colon or dash the next word is always capitalised.
    .replace(/([:–—]\s+)([a-z])/g, (m, pre, c) => pre + c.toUpperCase());
}

// [pattern, note label]. Order matters; each is removed from the title.
const FORMAT_PATTERNS = [
  [/\s*\(?\bin\s+(35|70|16)\s*mm\b\)?/i, (m) => `${m[1]}mm`],
  [/\s*\(?\b(35|70|16)\s*mm(\s+print)?\b\)?/i, (m) => `${m[1]}mm`],
  [/\s*\(?\b(new\s+)?4k(\s+(restoration|remaster(ed)?|dcp))?\b\)?/i, () => '4K restoration'],
  [/\s*\(?\bimax\b\)?/i, () => 'IMAX'],
  [/\s*[-–—:]?\s*\(?\bopen[- ]caption(s|ed)?\b\)?/i, () => 'Open captions'],
  [/\s*[-–—:]?\s*\(?\bopen audio description\b\)?/i, () => 'Open audio description'],
  [/\s*[-–—:]?\s*\(?\bsing[- ]?along\b\)?/i, () => 'Sing-along'],
  [/\s*\(?\b(director'?s|final|extended|theatrical) cut\b\)?/i, (m) => `${m[1].replace(/^./, (c) => c.toUpperCase())} cut`],
  [/\s*[-–—:]?\s*\(?\b(unrated|uncut|restored|new restoration|digital restoration)\b\)?\s*$/i, (m) => m[1].replace(/^./, (c) => c.toUpperCase())],
  [/\s*\(?\b(\d+)(st|nd|rd|th) anniversary\b\)?/i, (m) => `${m[1]}${m[2]} anniversary`],
];

// Event wrappers that follow the film title.
const EVENT_TAIL = [
  /\s*[-–—:!?]?\s*\(?\b(special\s+)?(filmmaker\s+)?screening\s+with\b.*$/i,
  /\s*[-–—:]\s*special\s+(filmmaker\s+)?screening\b.*$/i,
  /\s*\((special\s+)?(filmmaker\s+)?screening\)\s*$/i,
  /\s*[-–—:]?\s*\(?\bwith\s+(special\s+guest|director|filmmaker|live|q\s*&\s*a|introduction)\b.*$/i,
  /\s*[-–—+:]\s*(post[- ]film\s+)?(q\s*&\s*a|discussion|conversation|panel)\b.*$/i,
  /\s*\*+\s*$/,
];

function parseTitle(raw) {
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  // Common shorthand on marquees.
  t = t.replace(/^LOTR\s*:\s*/i, 'THE LORD OF THE RINGS: ').replace(/\s*…\s*|\s*\.{3}\s*/g, '... ');
  const notes = [];
  let year = null;

  // Year in parentheses anywhere: "(1932)" – take the last one.
  const years = [...t.matchAll(/\((\d{4})\)/g)];
  if (years.length) {
    const y = +years[years.length - 1][1];
    if (y >= 1888 && y <= new Date().getFullYear() + 2) {
      year = y;
      t = t.replace(years[years.length - 1][0], ' ').replace(/\s+/g, ' ').trim();
    }
  }

  let event = false;
  for (const re of EVENT_TAIL) {
    const m = t.match(re);
    if (m && m.index > 2) {
      if (!/^\s*\*+\s*$/.test(m[0])) event = true;
      const tail = m[0].replace(/^[\s\-–—:(*]+|[\s)*]+$/g, '');
      // Keep the "?" or "!" that belongs to the title itself.
      const keep = /^[!?]/.test(m[0].trim()) ? m[0].trim()[0] : '';
      t = (t.slice(0, m.index) + keep).trim();
      if (tail && !/^\*+$/.test(tail)) notes.push(tail.replace(/^[!?]\s*/, '').replace(/^./, (c) => c.toUpperCase()).replace(/[!.]+$/, ''));
    }
  }

  for (const [re, label] of FORMAT_PATTERNS) {
    const m = t.match(re);
    if (m && m.index > 0) {
      notes.push(label(m));
      t = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
    }
  }

  t = t.replace(/[\s\-–—:,]+$/g, '').replace(/^["“](.+)["”]$/, '$1').trim();
  t = titleCase(t).replace(/’/g, "'");

  // `event` = the listing was dressed up as a special event (guests, Q&A...).
  return { title: t || String(raw || '').trim(), year, notes: [...new Set(notes)], event };
}

/** Key used to group the same film across venues. */
function normKey(title) {
  return String(title || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\.{2,}|…/g, ' ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an) /, '')
    .trim()
    .replace(/ /g, '-');
}

module.exports = { parseTitle, titleCase, normKey };

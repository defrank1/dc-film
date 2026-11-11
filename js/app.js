/* 7:30 Showtimes — front end
 *
 * Reads three files and draws everything from them:
 *   data/venues.json      hand-maintained theater list
 *   data/screenings.json  written by scraper.js every 6 hours
 *   data/status.json      per-theater scraper health (optional)
 *
 * No framework and no build step: edit, refresh.
 */
(function () {
  'use strict';

  var TZ = 'America/New_York';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  var data = { films: {}, screenings: [], venues: [], more: [], status: {}, lastUpdated: null };
  var state = {
    view: 'showtimes',   // showtimes | calendar | theaters | about
    date: null,          // 'YYYY-MM-DD'
    venues: [],          // [] = all
    rep: false,
    mode: 'film',        // film | time
    q: '',
    film: null,          // film id shown in the dialog
    month: null          // 'YYYY-MM' shown in the calendar
  };

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Only ever link out to http(s) URLs.
  function safeUrl(u) {
    return /^https?:\/\//i.test(u || '') ? u : '#';
  }

  /** Current date and time in Washington, whatever the visitor's clock says. */
  function nowET() {
    var parts = {};
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
  }

  function parseDate(iso) {
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(iso, n) {
    var d = parseDate(iso);
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }
  function fmtDate(iso, opts) {
    return parseDate(iso).toLocaleDateString('en-US', opts);
  }
  function fmtTime(t) {
    var p = t.split(':');
    var h = +p[0];
    return (h % 12 || 12) + ':' + p[1] + (h >= 12 ? ' PM' : ' AM');
  }
  function fmtTimeShort(t) {
    var p = t.split(':');
    var h = +p[0];
    return (h % 12 || 12) + ':' + p[1] + '<span class="ampm">' + (h >= 12 ? 'p' : 'a') + '</span>';
  }
  function minutes(t) {
    var p = t.split(':');
    return +p[0] * 60 + +p[1];
  }
  function relDay(iso, today) {
    if (iso === today) return 'Today';
    if (iso === addDays(today, 1)) return 'Tomorrow';
    return null;
  }
  function ago(isoStamp) {
    var mins = Math.round((Date.now() - new Date(isoStamp).getTime()) / 60000);
    if (isNaN(mins)) return '';
    if (mins < 2) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 36) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hrs / 24);
    return days + ' days ago';
  }
  function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function venueById(id) {
    for (var i = 0; i < data.venues.length; i++) if (data.venues[i].id === id) return data.venues[i];
    return { id: id, name: id, short: id, url: '#' };
  }

  /* ------------------------------------------------------------------ */
  /* Loading & normalising                                               */
  /* ------------------------------------------------------------------ */

  function fetchJSON(url, optional) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → ' + r.status);
      return r.json();
    }).catch(function (err) {
      if (optional) return null;
      throw err;
    });
  }

  /**
   * Accept both the current data format ({films, screenings}) and the older
   * flat one (title "Name (1999)", venue name, poster on each screening), so
   * the page keeps working whichever file is deployed.
   */
  function normalise(raw, venues) {
    var films = raw.films || {};
    var out = [];
    var byName = {};
    venues.forEach(function (v) {
      byName[v.name] = v.id;
      (v.aliases || []).forEach(function (a) { byName[a] = v.id; });
    });
    var seen = {};
    (raw.screenings || []).forEach(function (s) {
      if (!s || !s.date || !s.time) return;
      var c = {
        film: s.film, venueId: s.venueId || byName[s.venue] || s.venue, date: s.date, time: s.time,
        ticketLink: s.ticketLink, infoLink: s.infoLink, venuePoster: s.venuePoster,
        note: s.note, series: s.series, soldOut: !!s.soldOut
      };
      if (!c.film || !films[c.film]) {
        var m = String(s.title || '').match(/^(.*?)(?:\s*\((\d{4})\))?\s*$/);
        var title = m ? m[1] : s.title;
        var year = m && m[2] ? +m[2] : null;
        var id = 'x-' + fold(title).replace(/[^a-z0-9]+/g, '-') + (year ? '-' + year : '');
        if (!films[id]) films[id] = { title: title, year: year, poster: s.poster || null, rep: year ? year <= new Date().getFullYear() - 2 : false };
        c.film = id;
      }
      var key = [c.venueId, c.film, c.date, c.time].join('|');
      if (seen[key]) return;
      seen[key] = 1;
      out.push(c);
    });
    Object.keys(films).forEach(function (id) {
      var f = films[id];
      f.id = id;
      f.search = fold([f.title, f.director, f.year].join(' '));
    });
    out.sort(function (a, b) {
      return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) ||
        films[a.film].title.localeCompare(films[b.film].title);
    });
    return { films: films, screenings: out };
  }

  function load() {
    return Promise.all([
      fetchJSON('data/venues.json'),
      fetchJSON('data/screenings.json'),
      fetchJSON('data/status.json', true)
    ]).then(function (res) {
      var venues = res[0].tracked || [];
      var n = normalise(res[1], venues);
      var today = nowET().date;
      data.venues = venues;
      data.more = res[0].more || [];
      data.films = n.films;
      data.screenings = n.screenings.filter(function (s) { return s.date >= today; });
      data.status = (res[2] && res[2].venues) || {};
      data.lastUpdated = res[1].lastUpdated || null;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Filtering                                                           */
  /* ------------------------------------------------------------------ */

  /** Screenings that pass the theater / rep / search filters (any date). */
  function filtered() {
    var q = fold(state.q.trim());
    return data.screenings.filter(function (s) {
      var f = data.films[s.film];
      if (state.venues.length && state.venues.indexOf(s.venueId) < 0) return false;
      if (state.rep && !f.rep) return false;
      if (q && f.search.indexOf(q) < 0) return false;
      return true;
    });
  }

  function datesWithShows(list) {
    var set = {};
    list.forEach(function (s) { set[s.date] = (set[s.date] || 0) + 1; });
    return set;
  }

  /* ------------------------------------------------------------------ */
  /* URL hash <-> state                                                  */
  /* ------------------------------------------------------------------ */

  function readHash() {
    var p = new URLSearchParams(location.hash.replace(/^#/, ''));
    var view = p.get('view');
    state.view = ['calendar', 'theaters', 'about'].indexOf(view) >= 0 ? view : 'showtimes';
    state.date = /^\d{4}-\d{2}-\d{2}$/.test(p.get('d') || '') ? p.get('d') : null;
    state.venues = (p.get('v') || '').split(',').filter(function (id) {
      return data.venues.some(function (v) { return v.id === id; });
    });
    state.rep = p.get('rep') === '1';
    state.mode = p.get('by') === 'time' ? 'time' : 'film';
    state.q = p.get('q') || '';
    state.film = p.get('film') || null;
    state.month = /^\d{4}-\d{2}$/.test(p.get('m') || '') ? p.get('m') : null;
  }

  function buildHash(over) {
    var s = Object.assign({}, state, over || {});
    var p = new URLSearchParams();
    if (s.view !== 'showtimes') p.set('view', s.view);
    if (s.date && s.date !== nowET().date) p.set('d', s.date);
    if (s.venues.length) p.set('v', s.venues.join(','));
    if (s.rep) p.set('rep', '1');
    if (s.mode === 'time') p.set('by', 'time');
    if (s.q) p.set('q', s.q);
    if (s.view === 'calendar' && s.month) p.set('m', s.month);
    if (s.film) p.set('film', s.film);
    var str = p.toString().replace(/%2C/g, ',');
    return str ? '#' + str : '#';
  }

  var silentHash = false;
  function pushState(over, replace) {
    Object.assign(state, over || {});
    var h = buildHash();
    if (h === '#' && !location.hash) { render(); return; }
    if (h !== (location.hash || '#')) {
      silentHash = true;
      if (replace) history.replaceState(null, '', h === '#' ? location.pathname + location.search : h);
      else location.hash = h;
      // hashchange fires asynchronously for location.hash; replaceState fires
      // nothing. Either way, never leave the flag stuck.
      if (replace) silentHash = false;
      else setTimeout(function () { silentHash = false; }, 80);
    }
    render();
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  function render() {
    var today = nowET().date;
    var list = filtered();
    var dates = datesWithShows(list);
    var allDates = Object.keys(datesWithShows(data.screenings)).sort();

    // Pick a sensible date if none chosen / chosen one is gone.
    if (!state.date || state.date < today) {
      state.date = dates[today] ? today : (Object.keys(dates).sort()[0] || allDates[0] || today);
    }
    if (!state.month) state.month = state.date.slice(0, 7);

    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + state.view; });
    $$('.nav a').forEach(function (a) {
      if (a.dataset.view === state.view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = {
      showtimes: '7:30 Showtimes — every indie and repertory screening in DC',
      calendar: 'Calendar — 7:30 Showtimes',
      theaters: 'Theaters — 7:30 Showtimes',
      about: 'About — 7:30 Showtimes'
    }[state.view];

    renderFooter();
    if (state.view === 'showtimes') {
      renderStats();
      renderSevenThirty(today);
      renderDayStrip(allDates, dates, today);
      renderFilters();
      renderListing(list, today);
    } else if (state.view === 'calendar') {
      renderCalendar(list, today);
    } else if (state.view === 'theaters') {
      renderTheaters();
    }
    renderDialog(today);
  }

  function renderStats() {
    var films = {};
    var venues = {};
    data.screenings.forEach(function (s) { films[s.film] = 1; venues[s.venueId] = 1; });
    $('#stats').innerHTML =
      data.screenings.length.toLocaleString() + ' showtimes, ' +
      Object.keys(films).length + ' films, ' +
      Object.keys(venues).length + ' theaters.' +
      (data.lastUpdated ? ' Updated ' + esc(ago(data.lastUpdated)) + '.' : '');
  }

  /** The namesake: what starts closest to 7:30 tonight. */
  function renderSevenThirty(today) {
    var now = nowET();
    var day = today;
    var label = 'Tonight around 7:30';
    function pick(d, after) {
      return data.screenings.filter(function (s) {
        var m = minutes(s.time);
        return s.date === d && m >= 18 * 60 + 30 && m <= 20 * 60 + 30 && (!after || s.time > after) && !s.soldOut;
      });
    }
    var picks = pick(day, now.time);
    if (!picks.length) {
      day = addDays(today, 1);
      label = 'Tomorrow around 7:30';
      picks = pick(day);
    }
    if (!picks.length) {
      // Next day that has anything in the window.
      var next = data.screenings.filter(function (s) {
        var m = minutes(s.time);
        return s.date > today && m >= 18 * 60 + 30 && m <= 20 * 60 + 30;
      })[0];
      if (next) {
        day = next.date;
        label = fmtDate(day, { weekday: 'long' }) + ' around 7:30';
        picks = pick(day);
      }
    }
    picks.sort(function (a, b) {
      return Math.abs(minutes(a.time) - 1170) - Math.abs(minutes(b.time) - 1170) ||
        a.time.localeCompare(b.time);
    });
    // One line per film+venue, closest time wins.
    var seen = {};
    picks = picks.filter(function (s) {
      var k = s.film + '|' + s.venueId;
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    }).slice(0, 6);
    picks.sort(function (a, b) { return a.time.localeCompare(b.time); });

    $('#seven-thirty-title').textContent = label;
    $('#seven-list').innerHTML = picks.length ? picks.map(function (s, i) {
      var f = data.films[s.film];
      var v = venueById(s.venueId);
      var wait = day === today ? minutes(s.time) - minutes(now.time) : -1;
      var soon = i === 0 && wait > 0 && wait <= 90 ? '<span class="soon">starts in ' + wait + ' min</span>' : '';
      return '<li class="seven' + (s.time === '19:30' ? ' seven--dot' : '') + '">' +
        '<a class="seven__time" href="' + esc(safeUrl(s.ticketLink)) + '" target="_blank" rel="noopener" ' +
        'aria-label="' + esc(fmtTime(s.time) + ', ' + f.title + ' at ' + v.name + ' — tickets') + '">' + fmtTimeShort(s.time) + '</a>' +
        '<span class="seven__body"><a class="seven__title" href="' + esc(buildHash({ film: f.id })) + '" data-film="' + esc(f.id) + '">' + esc(f.title) + '</a>' +
        (f.year ? ' <span class="year">' + f.year + '</span>' : '') + soon + '</span>' +
        '<span class="seven__venue">' + esc(v.short) + '</span></li>';
    }).join('') : '<li class="seven seven--empty">Nothing on the books for the 7:30 slot yet.</li>';
  }

  function renderDayStrip(allDates, counts, today) {
    var strip = $('#daystrip');
    if (!allDates.length) { strip.innerHTML = ''; return; }
    // Every day from today to the last listed date, so gaps read as gaps.
    var days = [];
    var last = allDates[allDates.length - 1];
    for (var d = today; d <= last && days.length < 80; d = addDays(d, 1)) days.push(d);
    if (days.indexOf(state.date) < 0) days.push(state.date);

    strip.innerHTML = days.map(function (d) {
      var n = counts[d] || 0;
      var rel = relDay(d, today);
      var first = d.slice(8) === '01' || d === days[0];
      return '<button class="day' + (n ? '' : ' day--empty') + '" role="tab" data-date="' + d + '" aria-selected="' + (d === state.date) + '"' +
        ' aria-label="' + esc(fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' + n + ' showtimes') + '">' +
        '<span class="day__dow">' + esc(rel || fmtDate(d, { weekday: 'short' })) + '</span>' +
        '<span class="day__num">' + (+d.slice(8)) + '</span>' +
        '<span class="day__meta">' + (first ? esc(fmtDate(d, { month: 'short' })) + ', ' : '') + (n ? n + (n === 1 ? ' show' : ' shows') : 'none') + '</span>' +
        '</button>';
    }).join('');

    var sel = $('.day[aria-selected="true"]', strip);
    if (sel) {
      var left = sel.offsetLeft - strip.clientWidth / 2 + sel.clientWidth / 2;
      strip.scrollLeft = Math.max(0, left);
    }
  }

  function renderFilters() {
    var counts = {};
    data.screenings.forEach(function (s) { counts[s.venueId] = (counts[s.venueId] || 0) + 1; });
    var chips = '<button class="chip" data-venue="" aria-pressed="' + (!state.venues.length) + '">All theaters</button>';
    // Every tracked theater gets a chip; ones with nothing listed are dashed.
    var anyEmpty = false;
    chips += data.venues.map(function (v) {
      var none = !counts[v.id];
      if (none) anyEmpty = true;
      return '<button class="chip' + (none ? ' chip--none' : '') + '" data-venue="' + esc(v.id) + '" aria-pressed="' + (state.venues.indexOf(v.id) >= 0) + '"' +
        (none ? ' title="Nothing on its calendar right now"' : '') + '>' + esc(v.short) + '</button>';
    }).join('');
    if (anyEmpty) chips += '<span class="filters__key">Dashed: nothing on its calendar right now</span>';
    $('#venue-chips').innerHTML = chips;
    $('#rep-toggle').setAttribute('aria-pressed', String(state.rep));
    $$('.seg__btn').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
    var input = $('#search');
    if (document.activeElement !== input) input.value = state.q;
  }

  function posterHTML(f, s, cls) {
    var src = f.poster || (s && s.venuePoster) || f.still || '';
    var initial = esc((f.title || '?').replace(/^(the|a|an)\s+/i, '').charAt(0).toUpperCase());
    return '<span class="poster ' + (cls || '') + '" data-initial="' + initial + '">' +
      (src ? '<img src="' + esc(safeUrl(src)) + '" alt="" loading="lazy" decoding="async" onload="this.classList.add(&quot;is-in&quot;)" onerror="this.remove()">' : '') +
      '</span>';
  }

  function metaLine(f) {
    var bits = [];
    if (f.year) bits.push('<span class="year">' + f.year + '</span>');
    if (f.director) bits.push(esc(f.director));
    if (f.runtime) bits.push(f.runtime + ' min');
    return bits.join(', ');
  }

  function chipHTML(s, now, today) {
    var past = s.date === today && s.time < now.time;
    var cls = 'time' + (past ? ' time--past' : '') + (s.soldOut ? ' time--sold' : '');
    var f = data.films[s.film];
    var v = venueById(s.venueId);
    var label = fmtTime(s.time) + ', ' + f.title + ' at ' + v.name + (s.soldOut ? ' (sold out)' : '') + (s.note ? ' — ' + s.note : '');
    return '<a class="' + cls + '" href="' + esc(safeUrl(s.ticketLink)) + '" target="_blank" rel="noopener" aria-label="' + esc(label) + '"' +
      (s.note ? ' title="' + esc(s.note) + '"' : '') + '><span class="time__clock">' + fmtTimeShort(s.time) + '</span>' +
      (s.soldOut ? '<span class="time__flag">Sold out</span>' : '') + '</a>';
  }

  /** Notes shared by every showing in a group (e.g. "35mm") are shown once. */
  function tagsFor(shows) {
    var tally = {};
    shows.forEach(function (s) {
      var parts = [];
      if (s.series) parts.push(s.series);
      if (s.note) parts = parts.concat(s.note.split(/\s*[·|]\s*/));
      var uniq = {};
      parts.forEach(function (p) {
        p = p.trim();
        if (p && !uniq[fold(p)]) { uniq[fold(p)] = 1; tally[p] = (tally[p] || 0) + 1; }
      });
    });
    return Object.keys(tally).filter(function (t) { return tally[t] === shows.length && !/^on sale soon$/i.test(t); }).slice(0, 3);
  }

  function renderListing(list, today) {
    var el = $('#listing');
    var now = nowET();
    var day = list.filter(function (s) { return s.date === state.date; });
    var rel = relDay(state.date, today);
    var head = '<div class="dayhead"><h2>' + (rel ? '<span class="dayhead__rel">' + rel + '</span> ' : '') +
      esc(fmtDate(state.date, { weekday: 'long', month: 'long', day: 'numeric' })) + '</h2>' +
      '<p class="dayhead__count">' + day.length + (day.length === 1 ? ' showtime' : ' showtimes') + '</p></div>';

    if (!data.screenings.length) {
      el.innerHTML = '<div class="empty"><p class="label">No listings</p><p>There are no upcoming showtimes in the data right now. The theaters’ own sites are on the <a href="#view=theaters">Theaters</a> page.</p></div>';
      return;
    }
    if (!day.length) {
      var hasFilters = state.venues.length || state.rep || state.q;
      var next = Object.keys(datesWithShows(list)).sort().filter(function (d) { return d > state.date; })[0];
      el.innerHTML = head + '<div class="empty"><p class="label">Dark tonight</p><p>' +
        (hasFilters ? 'Nothing matches your filters on this day.' : 'No screenings listed for this day.') + '</p><p>' +
        (next ? '<button class="chip" data-goto="' + next + '">Next match: ' + esc(fmtDate(next, { weekday: 'short', month: 'short', day: 'numeric' })) + '</button> ' : '') +
        (hasFilters ? '<button class="chip" data-clear="1">Clear filters</button>' : '') + '</p></div>';
      return;
    }

    if (state.mode === 'time') {
      el.innerHTML = head + '<ol class="rundown">' + day.map(function (s) {
        var f = data.films[s.film];
        var v = venueById(s.venueId);
        var past = s.date === today && s.time < now.time;
        var notes = [s.series, s.note].filter(Boolean).join(', ');
        return '<li class="run' + (past ? ' run--past' : '') + (s.soldOut ? ' run--sold' : '') + '">' +
          '<a class="run__time" href="' + esc(safeUrl(s.ticketLink)) + '" target="_blank" rel="noopener" aria-label="' + esc(fmtTime(s.time) + ' — tickets at ' + v.name) + '">' + fmtTimeShort(s.time) + '</a>' +
          '<span class="run__film"><a href="' + esc(buildHash({ film: f.id })) + '" data-film="' + esc(f.id) + '" class="run__title">' + esc(f.title) + '</a>' +
          (f.year ? ' <span class="year">' + f.year + '</span>' : '') +
          (notes || s.soldOut ? '<span class="run__note">' + (s.soldOut ? 'Sold out' + (notes ? ', ' : '') : '') + esc(notes) + '</span>' : '') + '</span>' +
          '<span class="run__venue">' + esc(v.short) + '</span></li>';
      }).join('') + '</ol>';
      return;
    }

    // By film: one card per film, a row of times per theater.
    var groups = {};
    var order = [];
    day.forEach(function (s) {
      if (!groups[s.film]) { groups[s.film] = []; order.push(s.film); }
      groups[s.film].push(s);
    });
    // Films with something still to come today go first, in order of next showing.
    function nextTime(id) {
      var upcoming = groups[id].filter(function (s) { return !(s.date === today && s.time < now.time); });
      return upcoming.length ? upcoming[0].time : '99:' + groups[id][0].time;
    }
    order.sort(function (a, b) { return nextTime(a).localeCompare(nextTime(b)) || data.films[a].title.localeCompare(data.films[b].title); });

    el.innerHTML = head + '<div class="films">' + order.map(function (id) {
      var f = data.films[id];
      var shows = groups[id];
      var byVenue = {};
      var vOrder = [];
      shows.forEach(function (s) {
        if (!byVenue[s.venueId]) { byVenue[s.venueId] = []; vOrder.push(s.venueId); }
        byVenue[s.venueId].push(s);
      });
      var allPast = shows.every(function (s) { return s.date === today && s.time < now.time; });
      return '<article class="film' + (allPast ? ' film--past' : '') + '">' +
        '<a class="film__poster" href="' + esc(buildHash({ film: id })) + '" data-film="' + esc(id) + '" tabindex="-1" aria-hidden="true">' + posterHTML(f, shows[0]) + '</a>' +
        '<div class="film__body">' +
        '<h3 class="film__title"><a href="' + esc(buildHash({ film: id })) + '" data-film="' + esc(id) + '">' + esc(f.title) + '</a></h3>' +
        '<p class="film__meta">' + metaLine(f) + '</p>' +
        '</div>' +
        '<div class="film__shows">' + vOrder.map(function (vid) {
          var v = venueById(vid);
          var tags = tagsFor(byVenue[vid]);
          return '<div class="vrow"><p class="vrow__name">' + esc(v.short) +
            (tags.length ? '<span class="vrow__tags">' + tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</span>' : '') + '</p>' +
            '<div class="vrow__times">' + byVenue[vid].map(function (s) { return chipHTML(s, now, today); }).join('') + '</div></div>';
        }).join('') + '</div></article>';
    }).join('') + '</div>';
  }

  function renderCalendar(list, today) {
    var ym = state.month;
    var y = +ym.slice(0, 4);
    var m = +ym.slice(5, 7) - 1;
    var first = new Date(y, m, 1);
    $('#cal-title').textContent = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    var allMonths = Object.keys(datesWithShows(data.screenings)).map(function (d) { return d.slice(0, 7); }).sort();
    var minM = today.slice(0, 7);
    var maxM = allMonths.length ? allMonths[allMonths.length - 1] : minM;
    $('#cal-prev').disabled = ym <= minM;
    $('#cal-next').disabled = ym >= maxM;

    var byDate = {};
    list.forEach(function (s) { (byDate[s.date] = byDate[s.date] || []).push(s); });

    var html = '<div class="cal__dow" aria-hidden="true">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (d) {
      return '<span>' + d + '</span>';
    }).join('') + '</div><div class="cal__grid">';
    for (var i = 0; i < first.getDay(); i++) html += '<div class="cal__pad" aria-hidden="true"></div>';
    var days = new Date(y, m + 1, 0).getDate();
    for (var d = 1; d <= days; d++) {
      var iso = ym + '-' + String(d).padStart(2, '0');
      var shows = byDate[iso] || [];
      var titles = [];
      var seen = {};
      shows.forEach(function (s) {
        if (!seen[s.film]) { seen[s.film] = 1; titles.push(data.films[s.film]); }
      });
      // Lead with repertory titles – they're the ones you can't see next week.
      titles.sort(function (a, b) { return (b.rep ? 1 : 0) - (a.rep ? 1 : 0); });
      var cls = 'cal__day' + (iso === today ? ' cal__day--today' : '') + (iso < today ? ' cal__day--past' : '') + (shows.length ? '' : ' cal__day--empty');
      var inner = '<span class="cal__num">' + d + '</span>' +
        (shows.length ? '<span class="cal__count">' + shows.length + '<span class="cal__count-word"> ' + (shows.length === 1 ? 'show' : 'shows') + '</span></span>' : '') +
        '<span class="cal__titles">' + titles.slice(0, 3).map(function (f) { return '<span>' + esc(f.title) + '</span>'; }).join('') +
        (titles.length > 3 ? '<span class="cal__more">+' + (titles.length - 3) + ' more</span>' : '') + '</span>';
      html += shows.length && iso >= today
        ? '<a class="' + cls + '" href="' + esc(buildHash({ view: 'showtimes', date: iso, film: null })) + '" data-goto="' + iso + '" aria-label="' +
          esc(fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' }) + ': ' + shows.length + ' showtimes, ' + titles.length + ' films') + '">' + inner + '</a>'
        : '<div class="' + cls + '">' + inner + '</div>';
    }
    html += '</div>';
    $('#calendar').innerHTML = html;
  }

  function statusLine(v) {
    var st = data.status[v.id];
    if (!st) return '';
    if (st.status === 'ok') return 'Read ' + esc(ago(st.lastSuccess));
    if (st.status === 'empty') return 'No films on its calendar right now';
    if (st.status === 'blocked' && st.keptStale && st.lastSuccess) return 'Its site turned our reader away on the last try; showing listings from ' + esc(ago(st.lastSuccess));
    if (st.status === 'blocked') return 'Its site blocks automated readers — check it directly';
    if (st.lastSuccess) return 'Couldn’t be read on the last try; showing listings from ' + esc(ago(st.lastSuccess));
    return 'Couldn’t be read on the last try — check it directly';
  }

  function renderTheaters() {
    var counts = {};
    var films = {};
    data.screenings.forEach(function (s) {
      counts[s.venueId] = (counts[s.venueId] || 0) + 1;
      (films[s.venueId] = films[s.venueId] || {})[s.film] = 1;
    });
    $('#theaters').innerHTML = data.venues.map(function (v) {
      var n = counts[v.id] || 0;
      var st = data.status[v.id] || {};
      var warn = st.status && st.status !== 'ok';
      return '<article class="theater">' +
        '<p class="label">' + esc(v.area || '') + '</p>' +
        '<h2>' + esc(v.name) + '</h2>' +
        '<p class="theater__addr">' + esc(v.address || '') + '</p>' +
        '<p class="theater__blurb">' + esc(v.blurb || '') + '</p>' +
        '<p class="theater__actions">' +
        (n ? '<a class="chip" href="' + esc(buildHash({ view: 'showtimes', venues: [v.id], film: null, date: null })) + '" data-only="' + esc(v.id) + '">' +
          n + (n === 1 ? ' showtime' : ' showtimes') + ', ' + Object.keys(films[v.id]).length + ' films</a>' : '') +
        '<a class="chip chip--ghost" href="' + esc(safeUrl(v.url)) + '" target="_blank" rel="noopener">Theater site</a></p>' +
        '<p class="theater__status' + (warn ? ' theater__status--warn' : '') + '">' + statusLine(v) + '</p>' +
        '</article>';
    }).join('');
    $('#more-screens').innerHTML = data.more.map(function (v) {
      return '<li><a href="' + esc(safeUrl(v.url)) + '" target="_blank" rel="noopener"><span class="more__name">' + esc(v.name) + '</span>' +
        '<span class="label">' + esc(v.area || '') + '</span><span class="more__why">' + esc(v.why || '') + '</span></a></li>';
    }).join('');
  }

  function renderFooter() {
    if (data.lastUpdated) {
      var d = new Date(data.lastUpdated);
      $('#updated').textContent = d.toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
    }
    var up = document.documentElement.dataset.lights === 'up';
    $('#lights').setAttribute('aria-pressed', String(up));
    $('#lights-state').textContent = up ? 'Dark mode' : 'Light mode';
  }

  /* ---------- film dialog ---------- */

  function renderDialog(today) {
    var dlg = $('#film-dialog');
    var f = state.film && data.films[state.film];
    if (!f) {
      if (dlg.open) dlg.close();
      return;
    }
    var now = nowET();
    var shows = data.screenings.filter(function (s) { return s.film === f.id; });
    var byDate = {};
    var dOrder = [];
    shows.forEach(function (s) {
      if (!byDate[s.date]) { byDate[s.date] = []; dOrder.push(s.date); }
      byDate[s.date].push(s);
    });
    var info = shows.map(function (s) { return s.infoLink; }).filter(Boolean)[0];

    $('#film-dialog-body').innerHTML =
      '<button class="dialog__close chip" data-close="1" aria-label="Close">Close</button>' +
      '<div class="dialog__head">' + posterHTML(f, shows[0], 'poster--lg') +
      '<div><h2 id="film-dialog-title">' + esc(f.title) + '</h2>' +
      '<p class="film__meta">' + metaLine(f) + '</p>' +
      ((f.genres || []).length ? '<p class="film__meta">' + esc(f.genres.join(', ')) + '</p>' : '') +
      (f.overview ? '<p class="dialog__overview">' + esc(f.overview) + '</p>' : '') +
      '<p class="dialog__links">' +
      (info ? '<a href="' + esc(safeUrl(info)) + '" target="_blank" rel="noopener">Theater’s page</a>' : '') +
      (f.tmdbId ? '<a href="https://www.themoviedb.org/movie/' + encodeURIComponent(f.tmdbId) + '" target="_blank" rel="noopener">TMDB</a>' : '') +
      '</p></div></div>' +
      '<div class="dialog__shows"><p class="label">' + shows.length + (shows.length === 1 ? ' upcoming showtime' : ' upcoming showtimes') + '</p>' +
      (shows.length ? dOrder.map(function (d) {
        var byVenue = {};
        var vOrder = [];
        byDate[d].forEach(function (s) {
          if (!byVenue[s.venueId]) { byVenue[s.venueId] = []; vOrder.push(s.venueId); }
          byVenue[s.venueId].push(s);
        });
        var rel = relDay(d, today);
        return '<div class="drow"><p class="drow__date">' + (rel ? rel + ', ' : '') + esc(fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })) + '</p><div class="drow__venues">' +
          vOrder.map(function (vid) {
            var tags = tagsFor(byVenue[vid]);
            return '<div class="vrow"><p class="vrow__name">' + esc(venueById(vid).short) +
              (tags.length ? '<span class="vrow__tags">' + tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</span>' : '') + '</p>' +
              '<div class="vrow__times">' + byVenue[vid].map(function (s) { return chipHTML(s, now, today); }).join('') + '</div></div>';
          }).join('') + '</div></div>';
      }).join('') : '<p>No upcoming showtimes.</p>') + '</div>';

    if (!dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  function wire() {
    window.addEventListener('hashchange', function () {
      if (silentHash) { silentHash = false; return; }
      readHash();
      render();
    });

    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-view],[data-date],[data-venue],[data-film],[data-goto],[data-clear],[data-close],[data-only],[data-mode]');
      if (!t) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let people open links in new tabs

      if (t.dataset.close) { e.preventDefault(); pushState({ film: null }); return; }
      if (t.dataset.film) { e.preventDefault(); pushState({ film: t.dataset.film }); return; }
      if (t.dataset.view) {
        e.preventDefault();
        pushState({ view: t.dataset.view, film: null });
        window.scrollTo(0, 0);
        return;
      }
      if (t.dataset.date) { pushState({ date: t.dataset.date }, true); return; }
      if (t.dataset.goto) {
        e.preventDefault();
        pushState({ view: 'showtimes', date: t.dataset.goto, film: null });
        var c = $('#controls');
        if (c) window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 8);
        return;
      }
      if (t.dataset.only) {
        e.preventDefault();
        pushState({ view: 'showtimes', venues: [t.dataset.only], date: null, film: null });
        window.scrollTo(0, 0);
        return;
      }
      if (t.dataset.clear) { pushState({ venues: [], rep: false, q: '' }, true); return; }
      if (t.dataset.mode) { pushState({ mode: t.dataset.mode }, true); return; }
      if ('venue' in t.dataset) {
        var id = t.dataset.venue;
        var next = [];
        if (id) {
          next = state.venues.slice();
          var i = next.indexOf(id);
          if (i >= 0) next.splice(i, 1); else next.push(id);
        }
        pushState({ venues: next }, true);
      }
    });

    $('#rep-toggle').addEventListener('click', function () { pushState({ rep: !state.rep }, true); });

    var timer;
    $('#search').addEventListener('input', function (e) {
      clearTimeout(timer);
      var v = e.target.value;
      timer = setTimeout(function () { pushState({ q: v }, true); }, 150);
    });

    $('#days-prev').addEventListener('click', function () { $('#daystrip').scrollBy({ left: -$('#daystrip').clientWidth * 0.8, behavior: 'smooth' }); });
    $('#days-next').addEventListener('click', function () { $('#daystrip').scrollBy({ left: $('#daystrip').clientWidth * 0.8, behavior: 'smooth' }); });

    $('#daystrip').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var days = $$('.day', this);
      var i = days.indexOf(document.activeElement);
      var n = days[i + (e.key === 'ArrowRight' ? 1 : -1)];
      if (n) { e.preventDefault(); n.focus(); n.click(); $('.day[aria-selected="true"]').focus(); }
    });

    function shiftMonth(n) {
      var y = +state.month.slice(0, 4);
      var m = +state.month.slice(5, 7) - 1 + n;
      var d = new Date(y, m, 1);
      pushState({ month: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') }, true);
    }
    $('#cal-prev').addEventListener('click', function () { shiftMonth(-1); });
    $('#cal-next').addEventListener('click', function () { shiftMonth(1); });

    var dlg = $('#film-dialog');
    dlg.addEventListener('close', function () { if (state.film) pushState({ film: null }); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) pushState({ film: null }); }); // backdrop

    $('#lights').addEventListener('click', function () {
      var up = document.documentElement.dataset.lights !== 'up';
      if (up) document.documentElement.dataset.lights = 'up';
      else delete document.documentElement.dataset.lights;
      try { localStorage.setItem('lights', up ? 'up' : 'down'); } catch (e) { /* private mode */ }
      var meta = $('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', up ? '#ffffff' : '#150c0b');
      renderFooter();
    });

    // Keep "past" showtimes and the 7:30 box honest on a tab left open.
    setInterval(function () { if (!document.hidden) render(); }, 5 * 60 * 1000);
    // Pick up fresh data a few times a day without a reload.
    setInterval(function () { load().then(render).catch(function () {}); }, 60 * 60 * 1000);
  }

  /* ------------------------------------------------------------------ */

  load().then(function () {
    readHash();
    wire();
    render();
    document.documentElement.classList.add('ready');
  }).catch(function (err) {
    console.error(err);
    $('#stats').textContent = '';
    $('#listing').innerHTML = '<div class="empty"><p class="label">Projector trouble</p><p>The listings didn’t load. Try refreshing in a minute.</p></div>';
  });
})();

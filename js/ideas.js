/* Showtimes DC — idea previews
 *
 * Adds an "Ideas" panel. Each idea is a class on <html> (idea-<key>);
 * css/ideas.css holds the looks. A few ideas also need small additions to
 * the page (flags, the giant word, the flag mark, a Letterboxd link); those
 * are added after every render, using the data app.js exposes on window.SDC.
 */
(function () {
  'use strict';

  var IDEAS = [
    ['glow', 'Exit-sign glow', 'Dark mode only. The name is a lit sign that buzzes on once when the page opens; the 7:30 times and the selected day glow too.'],
    ['duotone', 'Duotone posters', 'Every poster printed in red and warm black, so the listing reads as one design. Full colour when you point at a film.'],
    ['advance', 'Film advance', 'The sprocket holes travel with the day strip, and picking a day slides the listing like the next frame.'],
    ['flags', 'Flags from the listings', '“One night only”, “Last chance”, 70mm, 35mm and Free, worked out from the theaters’ own notes and dates.'],
    ['matinee', 'Matinee light mode', 'Light mode as warm paper with warm-black ink and rules; red stays for the sign, the selected day and the times.'],
    ['mark', 'Flag mark', 'The DC flag with its bars drawn as film, beside the name.'],
    ['letterboxd', 'Letterboxd link', 'Each film’s window links to its Letterboxd page.'],
    ['tonight', '“Tonight” in giant type', 'One huge word over a small explanation, instead of the tagline.'],
    ['serif', 'Italic serif small print', 'Years, directors and counts set in an italic serif (Instrument Serif) for an editorial touch.'],
    ['grain', 'Film grain', 'A still layer of grain over the page, so the flat colour reads more like film.']
  ];
  var PICKS = ['glow', 'duotone', 'advance', 'flags', 'matinee', 'mark', 'letterboxd'];
  var root = document.documentElement;

  function load() {
    try {
      var v = localStorage.getItem('ideas');
      return v ? v.split(',').filter(Boolean) : [];
    } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem('ideas', list.join(',')); } catch (e) { /* private mode */ }
  }
  var firstVisit = (function () { try { return localStorage.getItem('ideas') === null; } catch (e) { return true; } })();
  var on = load();

  function apply() {
    IDEAS.forEach(function (i) { root.classList.toggle('idea-' + i[0], on.indexOf(i[0]) >= 0); });
    var btn = document.querySelector('.lab-toggle');
    if (btn) btn.textContent = 'Ideas · ' + on.length + ' on';
    decorate();
  }

  /* ---------------- panel ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildPanel() {
    var btn = document.createElement('button');
    btn.className = 'lab-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-expanded', String(firstVisit));
    btn.setAttribute('aria-controls', 'lab-panel');
    var panel = document.createElement('section');
    panel.className = 'lab-panel';
    panel.id = 'lab-panel';
    panel.hidden = !firstVisit;
    panel.setAttribute('aria-label', 'Ideas');
    panel.innerHTML =
      '<h2>Ideas to try</h2>' +
      '<p class="lab-note">Switch each one on to see it with the real listings. Light mode is the House lights button in the footer.' + (window.SDC_NOTE ? ' ' + esc(window.SDC_NOTE) : '') + '</p>' +
      '<div class="lab-presets">' +
      '<button type="button" data-preset="none">All off</button>' +
      '<button type="button" data-preset="picks">My picks</button>' +
      '<button type="button" data-preset="all">All on</button></div>' +
      '<div class="lab-list">' + IDEAS.map(function (i) {
        return '<label class="lab-item"><input type="checkbox" value="' + i[0] + '">' +
          '<div><b>' + esc(i[1]) + '</b><span>' + esc(i[2]) + '</span></div></label>';
      }).join('') + '</div>';
    document.body.appendChild(panel);
    document.body.appendChild(btn);

    function sync() {
      panel.querySelectorAll('input').forEach(function (c) { c.checked = on.indexOf(c.value) >= 0; });
      apply();
    }
    btn.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
    });
    panel.addEventListener('change', function (e) {
      if (!e.target.matches('input')) return;
      on = Array.prototype.map.call(panel.querySelectorAll('input:checked'), function (c) { return c.value; });
      save(on); sync();
    });
    panel.addEventListener('click', function (e) {
      var p = e.target.closest('[data-preset]');
      if (!p) return;
      on = p.dataset.preset === 'all' ? IDEAS.map(function (i) { return i[0]; }) : p.dataset.preset === 'picks' ? PICKS.slice() : [];
      save(on); sync();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
    });
    sync();
  }

  /* ---------------- flags ---------------- */

  function todayET() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  }

  var flagCache = null;
  var flagStamp = null;
  function flagsByFilm() {
    var d = window.SDC && window.SDC.data;
    if (!d || !d.screenings.length) return {};
    var stamp = d.lastUpdated + '|' + d.screenings.length + '|' + todayET();
    if (flagCache && flagStamp === stamp) return flagCache;
    var today = todayET();
    var byFilm = {};
    var perDay = {};
    d.screenings.forEach(function (s) {
      (byFilm[s.film] = byFilm[s.film] || []).push(s);
      perDay[s.venueId] = perDay[s.venueId] || {};
      perDay[s.venueId][s.date] = (perDay[s.venueId][s.date] || 0) + 1;
    });
    // How far ahead each theater has posted a full schedule: the last day
    // with at least 40% of its usual daily count (from the coming week).
    // Theaters often post special events months out but regular shows a
    // week at a time, so the last listed date alone would mislead.
    var horizon = {};
    Object.keys(perDay).forEach(function (v) {
      var days = Object.keys(perDay[v]).sort();
      var week = days.filter(function (x) { return daysBetween(today, x) < 7; }).map(function (x) { return perDay[v][x]; }).sort(function (a, b) { return a - b; });
      if (!week.length) return;
      var limit = Math.max(1, week[Math.floor(week.length / 2)] * 0.4);
      days.forEach(function (x) { if (perDay[v][x] >= limit) horizon[v] = x; });
    });
    var out = {};
    Object.keys(byFilm).forEach(function (id) {
      var shows = byFilm[id];
      var flags = [];
      function every(re) { return shows.every(function (s) { return re.test((s.note || '') + ' ' + (s.series || '')); }); }
      // Only call a run short when the theater's own calendar reaches at
      // least three days past it; otherwise the listings just stop there.
      function settled(date, list) {
        return list.every(function (s) { return horizon[s.venueId] && daysBetween(date, horizon[s.venueId]) >= 3; });
      }
      var last = shows.reduce(function (m, s) { return s.date > m ? s.date : m; }, '');
      if (shows.length === 1 && settled(shows[0].date, shows)) flags.push(['One night only', 'hot']);
      // New releases are booked week to week, so "last chance" is only
      // claimed for repertory titles.
      else if (shows.length > 1 && d.films[id] && d.films[id].rep && daysBetween(today, last) <= 2 && settled(last, shows.filter(function (s) { return s.date === last; }))) flags.push(['Last chance', 'hot']);
      if (every(/70\s?mm/i)) flags.push(['70mm', 'format']);
      else if (every(/35\s?mm/i)) flags.push(['35mm', 'format']);
      else if (every(/16\s?mm/i)) flags.push(['16mm', 'format']);
      if (every(/\bfree\b/i)) flags.push(['Free', '']);
      if (flags.length) out[id] = flags;
    });
    flagCache = out;
    flagStamp = stamp;
    return out;
  }

  function flagHTML(list) {
    return '<span class="flags">' + list.map(function (f) {
      return '<span class="flag' + (f[1] ? ' flag--' + f[1] : '') + '">' + esc(f[0]) + '</span>';
    }).join('') + '</span>';
  }

  /* ---------------- page additions ---------------- */

  var MARK = (function () {
    function star(cx, cy, r) {
      var p = [];
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5;
        var rr = i % 2 ? r * 0.382 : r;
        p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
      }
      return '<polygon points="' + p.join(' ') + '"/>';
    }
    var holes = '';
    [74, 118].forEach(function (y) {
      for (var x = 18; x <= 274; x += 16) holes += '<rect x="' + x + '" y="' + (y + 5) + '" width="8" height="6"/><rect x="' + x + '" y="' + (y + 21) + '" width="8" height="6"/>';
    });
    return '<svg class="mark" viewBox="0 0 300 160" aria-hidden="true" focusable="false"><g fill="currentColor">' +
      star(70, 32, 28) + star(150, 32, 28) + star(230, 32, 28) +
      '<rect x="10" y="74" width="280" height="32"/><rect x="10" y="118" width="280" height="32"/></g>' +
      '<g class="mark__holes">' + holes + '</g></svg>';
  })();

  function decorate() {
    // Flag mark (added once; shown only when the idea is on)
    var wm = document.querySelector('.wordmark');
    if (wm && !wm.querySelector('.mark')) wm.insertAdjacentHTML('afterbegin', MARK);

    // Giant word over the tagline
    var pitch = document.querySelector('.hero__pitch');
    var title = document.getElementById('seven-thirty-title');
    if (pitch && title) {
      if (!title.dataset.orig || (title.textContent !== 'Around 7:30' && title.textContent !== title.dataset.orig)) title.dataset.orig = title.textContent;
      var word = (title.dataset.orig || 'Tonight').split(' ')[0];
      var mega = pitch.querySelector('.mega');
      if (!mega) { pitch.insertAdjacentHTML('afterbegin', '<p class="mega" aria-hidden="true"></p>'); mega = pitch.querySelector('.mega'); }
      mega.textContent = word;
      title.textContent = root.classList.contains('idea-tonight') ? 'Around 7:30' : title.dataset.orig;
    }

    // Flags in the listing and the 7:30 lineup
    var flags = flagsByFilm();
    document.querySelectorAll('.film__body').forEach(function (b) {
      var a = b.querySelector('[data-film]');
      var old = b.querySelector('.flags');
      if (old) old.remove();
      if (a && flags[a.dataset.film]) b.insertAdjacentHTML('beforeend', flagHTML(flags[a.dataset.film]));
    });
    document.querySelectorAll('.seven__body').forEach(function (b) {
      var a = b.querySelector('[data-film]');
      var old = b.querySelector('.flags');
      if (old) old.remove();
      if (a && flags[a.dataset.film]) {
        var hot = flags[a.dataset.film].filter(function (f) { return f[1] === 'hot' || f[1] === 'format'; });
        if (hot.length) a.insertAdjacentHTML('afterend', flagHTML(hot));
      }
    });

    // Letterboxd link in the film window
    var links = document.querySelector('.dialog__links');
    var d = window.SDC && window.SDC.data;
    var fid = window.SDC && window.SDC.state && window.SDC.state.film;
    if (links && d && fid && d.films[fid] && d.films[fid].tmdbId && !links.querySelector('.lb-link')) {
      links.insertAdjacentHTML('beforeend', '<a class="lb-link" href="https://letterboxd.com/tmdb/' + encodeURIComponent(d.films[fid].tmdbId) + '" target="_blank" rel="noopener">Letterboxd ↗</a>');
    }
  }

  apply();
  document.addEventListener('sdc:render', decorate);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanel);
  else buildPanel();
})();

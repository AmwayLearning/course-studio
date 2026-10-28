/*
 * Course Studio — course player.
 * Reads the course from content.js (window.COURSE) and shows it like a
 * Rise course: a cover page, a lesson menu, scrolling lessons made of blocks,
 * knowledge checks and a results page. Tracking is in xapi.js.
 */
(function () {
  'use strict';
  var C = window.COURSE, X = window.XAPI;
  var app = document.getElementById('app');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lessons = C.lessons || [];
  var S = { visited: {}, done: {}, answers: {}, gates: {}, current: -1, finished: false };
  var questions = [];
  lessons.forEach(function (l) { (l.blocks || []).forEach(function (b) { if (b.type === 'mcq') questions.push(b); }); });
  var hasQuiz = questions.length > 0;
  var passMark = Number((C.settings || {}).passMark || 80);
  var restricted = (C.settings || {}).navigation === 'restricted';
  var completionRule = (C.settings || {}).completion || 'lessons';

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, A: 1, P: 1, BR: 1, UL: 1, OL: 1, LI: 1, SPAN: 1, DIV: 1, MARK: 1, SUB: 1, SUP: 1 };
  function rich(html) {
    var t = document.createElement('template'); t.innerHTML = String(html || '');
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (k) {
        if (k.nodeType === 1) {
          if (!ALLOWED[k.tagName]) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED)$/.test(k.tagName)) { k.remove(); return; } var f = document.createDocumentFragment(); while (k.firstChild) f.appendChild(k.firstChild); k.replaceWith(f); walk(n); return; }
          Array.prototype.slice.call(k.attributes).forEach(function (a) {
            if (k.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:|#)/i.test(a.value)) return;
            k.removeAttribute(a.name);
          });
          if (k.tagName === 'A') { k.setAttribute('target', '_blank'); k.setAttribute('rel', 'noopener'); }
          walk(k);
        } else if (k.nodeType !== 3) k.remove();
      });
    })(t.content);
    return t.innerHTML;
  }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function videoEmbed(url) {
    url = String(url || '').trim(); var m;
    if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/))) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return 'https://player.vimeo.com/video/' + m[1];
    if (/^https:\/\//.test(url)) return url;
    return '';
  }
  var ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17v.5"/></svg>'
  };

  /* ---------- theme ---------- */
  var theme = C.theme || {};
  document.documentElement.style.setProperty('--accent', theme.accent || '#3b5bdb');
  if (theme.font) document.documentElement.style.setProperty('--font', "'" + theme.font + "', system-ui, sans-serif");
  document.title = C.title || 'Course';

  /* ---------- blocks ---------- */
  var R = {
    heading: function (b) { return '<div class="blk blk-heading"><h2>' + esc(b.text) + '</h2>' + (b.sub ? '<p class="sub">' + esc(b.sub) + '</p>' : '') + '</div>'; },
    text: function (b) { return '<div class="blk blk-text rt">' + rich(b.html) + '</div>'; },
    image: function (b) { return '<figure class="blk blk-image ' + (b.width === 'medium' ? 'medium' : 'full') + '">' + (b.src ? '<img src="' + esc(b.src) + '" alt="' + esc(b.alt) + '" loading="lazy">' : '') + (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>'; },
    imageText: function (b) { return '<div class="blk blk-imagetext ' + (b.side === 'right' ? 'right' : 'left') + '"><div class="it-img">' + (b.src ? '<img src="' + esc(b.src) + '" alt="' + esc(b.alt) + '" loading="lazy">' : '') + '</div><div class="it-text rt">' + rich(b.html) + '</div></div>'; },
    quote: function (b) { return '<blockquote class="blk blk-quote"><div class="q rt">' + rich(b.html) + '</div>' + (b.cite ? '<cite>' + esc(b.cite) + '</cite>' : '') + '</blockquote>'; },
    callout: function (b) { var t = b.tone || 'info'; return '<div class="blk blk-callout ' + esc(t) + '"><span class="ic">' + (t === 'tip' ? ICON.star : t === 'warn' ? ICON.warn : ICON.info) + '</span><div class="rt">' + rich(b.html) + '</div></div>'; },
    list: function (b) {
      var tag = b.style === 'number' ? 'ol' : 'ul';
      return '<div class="blk blk-list ' + esc(b.style || 'bullet') + '"><' + tag + '>' + (b.items || []).map(function (it, i) { return '<li style="--i:' + i + '">' + (b.style === 'check' ? '<span class="tick">' + ICON.check + '</span>' : '') + '<span>' + esc(it) + '</span></li>'; }).join('') + '</' + tag + '></div>';
    },
    accordion: function (b) {
      return '<div class="blk blk-accordion">' + (b.items || []).map(function (it, i) {
        return '<div class="acc"><button class="acc-h" aria-expanded="false" id="acc-' + b.id + '-' + i + '"><span>' + esc(it.title) + '</span><i>' + ICON.down + '</i></button><div class="acc-b" role="region" aria-labelledby="acc-' + b.id + '-' + i + '"><div><div class="rt">' + rich(it.html) + '</div></div></div></div>';
      }).join('') + '</div>';
    },
    tabs: function (b) {
      var items = b.items || [];
      return '<div class="blk blk-tabs"><div class="tab-list" role="tablist">' + items.map(function (it, i) { return '<button role="tab" aria-selected="' + (i === 0) + '" data-i="' + i + '">' + esc(it.title) + '</button>'; }).join('') + '<i class="tab-ink"></i></div>' +
        items.map(function (it, i) { return '<div class="tab-p rt" role="tabpanel"' + (i ? ' hidden' : '') + '>' + rich(it.html) + '</div>'; }).join('') + '</div>';
    },
    flashcards: function (b) {
      return '<div class="blk blk-cards">' + (b.items || []).map(function (it) {
        return '<button class="fc" aria-pressed="false"><span class="fc-in"><span class="fc-f"><span>' + esc(it.front) + '</span><i>' + ICON.flip + ' Tap to flip</i></span><span class="fc-b"><span>' + esc(it.back) + '</span></span></span></button>';
      }).join('') + '</div>';
    },
    process: function (b) {
      var items = b.items || [];
      return '<div class="blk blk-process" data-step="0"><div class="pr-top"><div class="pr-dots">' + items.map(function (it, i) { return '<span class="' + (i ? '' : 'on') + '"></span>'; }).join('') + '</div><span class="pr-count">Step <b>1</b> of ' + items.length + '</span></div><div class="pr-track">' +
        items.map(function (it, i) { return '<div class="pr-slide' + (i ? '' : ' on') + '"><span class="pr-n">' + (i + 1) + '</span><h3>' + esc(it.title) + '</h3><div class="rt">' + rich(it.html) + '</div></div>'; }).join('') +
        '</div><div class="pr-nav"><button class="btn ghost pr-prev" disabled>Back</button><button class="btn pr-next">' + (items.length > 1 ? 'Next' : 'Done') + '</button></div></div>';
    },
    video: function (b) { var src = videoEmbed(b.url); return '<figure class="blk blk-video">' + (src ? '<div class="vid"><iframe src="' + esc(src) + '" title="' + esc(b.caption || 'Video') + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>' : '<div class="vid empty">Add a YouTube or Vimeo link</div>') + (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>'; },
    divider: function () { return '<div class="blk blk-divider"><span></span><i></i><span></span></div>'; },
    mcq: function (b) {
      var multi = (b.options || []).filter(function (o) { return o.correct; }).length > 1;
      return '<div class="blk blk-mcq" data-q="' + esc(b.id) + '"><span class="kc">Knowledge check</span><div class="qtext rt">' + rich(b.question) + '</div><p class="hint">' + (multi ? 'Select all that apply.' : 'Choose one answer.') + '</p><div class="opts" role="' + (multi ? 'group' : 'radiogroup') + '">' +
        (b.options || []).map(function (o, i) { return '<button class="opt" role="' + (multi ? 'checkbox' : 'radio') + '" aria-checked="false" data-i="' + i + '"><span class="mk"></span><span>' + esc(o.text) + '</span></button>'; }).join('') +
        '</div><div class="fb" aria-live="polite"></div><div class="q-actions"><button class="btn q-submit" disabled>Submit</button><button class="btn ghost q-retry" hidden>Try again</button></div></div>';
    },
    continue: function (b, li, bi) { return '<div class="blk blk-continue" data-gate="' + li + ':' + bi + '"><button class="btn big">' + esc(b.label || 'Continue') + '</button></div>'; }
  };

  /* ---------- cover ---------- */
  function cover(resumable) {
    var pct = progress();
    app.className = 'on-cover';
    app.innerHTML = '';
    var node = el('<main class="cover">' +
      '<div class="cv-bg">' + (theme.cover ? '<img src="' + esc(theme.cover) + '" alt="">' : '') + '</div>' +
      '<div class="cv-in">' +
        (C.author ? '<span class="cv-author">' + esc(C.author) + '</span>' : '') +
        '<h1>' + esc(C.title || 'Untitled course') + '</h1>' +
        (C.description ? '<p>' + esc(C.description) + '</p>' : '') +
        '<div class="cv-meta"><span>' + lessons.length + ' lesson' + (lessons.length === 1 ? '' : 's') + '</span>' + (hasQuiz ? '<span>' + questions.length + ' question' + (questions.length === 1 ? '' : 's') + '</span>' : '') + (C.duration ? '<span>' + esc(C.duration) + '</span>' : '') + '</div>' +
        '<button class="btn big start">' + (resumable ? 'Resume course' : 'Start course') + ' <i>' + ICON.chev + '</i></button>' +
        (resumable ? '<div class="cv-prog"><span><i style="width:' + pct + '%"></i></span>' + pct + '% complete</div>' : '') +
        (resumable ? '<button class="link restart">Start over</button>' : '') +
      '</div>' +
      '<ol class="cv-list">' + lessons.map(function (l, i) { return '<li class="' + (S.done[l.id] ? 'done' : '') + '" style="--i:' + i + '"><span class="n">' + (S.done[l.id] ? ICON.check : (i + 1)) + '</span><span>' + esc(l.title || 'Lesson ' + (i + 1)) + '</span></li>'; }).join('') + '</ol>' +
      '</main>');
    app.appendChild(node);
    node.querySelector('.start').addEventListener('click', function () { go(resumable && S.current >= 0 ? S.current : 0); });
    var rs = node.querySelector('.restart');
    if (rs) rs.addEventListener('click', function () { S = { visited: {}, done: {}, answers: {}, gates: {}, current: -1, finished: false }; save(); cover(false); });
  }

  /* ---------- shell ---------- */
  var shell = null;
  function buildShell() {
    app.className = 'in-course';
    app.innerHTML = '';
    shell = el('<div class="shell">' +
      '<aside class="side" aria-label="Lessons"><div class="side-top"><button class="side-title" title="Course home">' + esc(C.title || 'Course') + '</button><button class="icon close-menu" aria-label="Close menu">' + ICON.x + '</button></div>' +
      '<div class="side-prog"><span><i></i></span><b>0%</b> complete</div><nav class="side-list"></nav></aside>' +
      '<div class="scrim"></div>' +
      '<section class="main"><header class="bar"><button class="icon open-menu" aria-label="Open menu">' + ICON.menu + '</button><span class="bar-t"></span><span class="bar-p"><i></i></span></header><div class="lesson" tabindex="-1"></div></section></div>');
    app.appendChild(shell);
    shell.querySelector('.open-menu').addEventListener('click', function () { shell.classList.add('menu'); });
    shell.querySelector('.close-menu').addEventListener('click', function () { shell.classList.remove('menu'); });
    shell.querySelector('.scrim').addEventListener('click', function () { shell.classList.remove('menu'); });
    shell.querySelector('.side-title').addEventListener('click', function () { cover(true); shell = null; });
  }
  function unlocked(i) {
    if (!restricted || i === 0) return true;
    for (var k = 0; k < i; k++) if (!S.done[lessons[k].id]) return false;
    return true;
  }
  function renderSide() {
    if (!shell) return;
    var pct = progress();
    shell.querySelector('.side-prog i').style.width = pct + '%';
    shell.querySelector('.side-prog b').textContent = pct + '%';
    shell.querySelector('.bar-p i').style.width = pct + '%';
    shell.querySelector('.side-list').innerHTML = lessons.map(function (l, i) {
      var st = S.done[l.id] ? 'done' : unlocked(i) ? '' : 'locked';
      return '<button class="sl ' + st + (i === S.current ? ' cur' : '') + '" data-i="' + i + '"' + (st === 'locked' ? ' aria-disabled="true"' : '') + '><span class="n">' + (S.done[l.id] ? ICON.check : st === 'locked' ? ICON.lock : (i + 1)) + '</span><span>' + esc(l.title || 'Lesson ' + (i + 1)) + '</span></button>';
    }).join('') + (S.finished || (hasQuiz && allAnswered()) ? '<button class="sl res' + (S.current === lessons.length ? ' cur' : '') + '" data-i="' + lessons.length + '"><span class="n">' + ICON.star + '</span><span>Results</span></button>' : '');
    Array.prototype.forEach.call(shell.querySelectorAll('.sl'), function (b) {
      b.addEventListener('click', function () { var i = +b.dataset.i; if (i < lessons.length && !unlocked(i)) return; shell.classList.remove('menu'); go(i); });
    });
  }

  /* ---------- lesson ---------- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' }) : null;
  var endIo = null;

  function go(i) {
    if (!shell) buildShell();
    S.current = i;
    if (i >= lessons.length) { results(); save(); return; }
    var l = lessons[i];
    S.visited[l.id] = true;
    var box = shell.querySelector('.lesson');
    shell.querySelector('.bar-t').textContent = l.title || '';
    var html = '<header class="l-head"><span class="l-num">Lesson ' + (i + 1) + ' of ' + lessons.length + '</span><h1>' + esc(l.title || 'Lesson ' + (i + 1)) + '</h1></header><div class="blocks">';
    var gated = false;
    (l.blocks || []).forEach(function (b, bi) {
      var fn = R[b.type]; if (!fn) return;
      var key = i + ':' + bi;
      html += '<div class="bw' + (gated ? ' gated' : '') + '" data-bi="' + bi + '">' + fn(b, i, bi) + '</div>';
      if (b.type === 'continue' && !S.gates[l.id + ':' + bi] && !S.done[l.id]) gated = true;
    });
    html += '</div><footer class="l-foot' + (gated ? ' gated' : '') + '"><span class="end-sentinel"></span>' + nextButton(i) + '</footer>';
    box.innerHTML = html;
    box.scrollTop = 0; window.scrollTo(0, 0);
    if (!reduce) box.animate && box.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.23,1,.32,1)' });
    wire(box, l, i);
    Array.prototype.forEach.call(box.querySelectorAll('.bw:not(.gated), .l-head'), function (n) { io ? io.observe(n) : n.classList.add('in'); });
    renderSide();
    watchEnd(box, l, i);
    save();
    try { box.focus({ preventScroll: true }); } catch (e) {}
  }
  function nextButton(i) {
    var label = i + 1 < lessons.length ? 'Next lesson: ' + esc(lessons[i + 1].title || ('Lesson ' + (i + 2))) : (hasQuiz ? 'See results' : 'Finish course');
    return '<button class="btn big next">' + label + ' <i>' + ICON.chev + '</i></button><p class="need" hidden></p>';
  }
  function lessonQuestionsAnswered(l) { return (l.blocks || []).every(function (b) { return b.type !== 'mcq' || S.answers[b.id]; }); }
  function watchEnd(box, l, i) {
    if (endIo) endIo.disconnect();
    var foot = box.querySelector('.l-foot'), btn = foot.querySelector('.next'), need = foot.querySelector('.need');
    var check = function () {
      if (foot.classList.contains('gated')) return;
      var qs = lessonQuestionsAnswered(l);
      if (qs && !S.done[l.id]) { completeLesson(l, i); }
      if (restricted && !qs) { btn.disabled = true; need.hidden = false; need.textContent = 'Answer the knowledge check' + ((l.blocks || []).filter(function (b) { return b.type === 'mcq'; }).length > 1 ? 's' : '') + ' above to continue.'; }
      else { btn.disabled = false; need.hidden = true; }
    };
    foot._check = check;
    if ('IntersectionObserver' in window) {
      endIo = new IntersectionObserver(function (es) { if (es[0].isIntersecting) check(); }, { threshold: 0 });
      endIo.observe(foot.querySelector('.end-sentinel'));
    } else check();
    if (restricted && !lessonQuestionsAnswered(l)) { btn.disabled = true; }
    btn.addEventListener('click', function () { check(); if (!btn.disabled) go(i + 1); });
  }
  function completeLesson(l, i) {
    S.done[l.id] = true;
    X.lesson(l, i, Object.keys(S.done).length / Math.max(1, lessons.length));
    renderSide(); save(); maybeFinish();
  }

  function wire(box, l, li) {
    // accordion
    Array.prototype.forEach.call(box.querySelectorAll('.acc-h'), function (h) {
      h.addEventListener('click', function () { var open = h.getAttribute('aria-expanded') !== 'true'; h.setAttribute('aria-expanded', open); h.parentNode.classList.toggle('open', open); });
    });
    // tabs
    Array.prototype.forEach.call(box.querySelectorAll('.blk-tabs'), function (t) {
      var btns = t.querySelectorAll('[role=tab]'), panes = t.querySelectorAll('.tab-p'), ink = t.querySelector('.tab-ink');
      function sel(i) {
        Array.prototype.forEach.call(btns, function (b, k) { b.setAttribute('aria-selected', k === i); });
        Array.prototype.forEach.call(panes, function (p, k) { p.hidden = k !== i; if (k === i && !reduce && p.animate) p.animate([{ opacity: 0, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 200, easing: 'cubic-bezier(.23,1,.32,1)' }); });
        var b = btns[i]; if (b && ink) ink.style.transform = 'translateX(' + b.offsetLeft + 'px) scaleX(' + b.offsetWidth + ')';
      }
      Array.prototype.forEach.call(btns, function (b, k) { b.addEventListener('click', function () { sel(k); }); });
      requestAnimationFrame(function () { sel(0); });
    });
    // flashcards
    Array.prototype.forEach.call(box.querySelectorAll('.fc'), function (c) {
      c.addEventListener('click', function () { var on = c.getAttribute('aria-pressed') !== 'true'; c.setAttribute('aria-pressed', on); });
    });
    // process
    Array.prototype.forEach.call(box.querySelectorAll('.blk-process'), function (p) {
      var slides = p.querySelectorAll('.pr-slide'), dots = p.querySelectorAll('.pr-dots span'), n = slides.length, at = 0;
      var prev = p.querySelector('.pr-prev'), next = p.querySelector('.pr-next');
      function show(k, dir) {
        if (k >= n) { next.textContent = 'Done ✓'; return; }
        Array.prototype.forEach.call(slides, function (s, j) { s.classList.toggle('on', j === k); if (j === k && !reduce && s.animate) s.animate([{ opacity: 0, transform: 'translateX(' + (dir * 16) + 'px)', filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 250, easing: 'cubic-bezier(.23,1,.32,1)' }); });
        Array.prototype.forEach.call(dots, function (d, j) { d.className = j < k ? 'past' : j === k ? 'on' : ''; });
        p.querySelector('.pr-count b').textContent = k + 1;
        prev.disabled = k === 0; next.textContent = k === n - 1 ? 'Done' : 'Next';
        at = k;
      }
      prev.addEventListener('click', function () { show(Math.max(0, at - 1), -1); });
      next.addEventListener('click', function () { show(at + 1, 1); });
    });
    // knowledge checks
    Array.prototype.forEach.call(box.querySelectorAll('.blk-mcq'), function (q) {
      var b = (l.blocks || []).filter(function (x) { return x.id === q.dataset.q; })[0]; if (!b) return;
      var correct = (b.options || []).map(function (o, i) { return o.correct ? i : -1; }).filter(function (i) { return i >= 0; });
      var multi = correct.length > 1;
      var opts = q.querySelectorAll('.opt'), submit = q.querySelector('.q-submit'), retry = q.querySelector('.q-retry'), fb = q.querySelector('.fb');
      var picked = [];
      function paint() { Array.prototype.forEach.call(opts, function (o, i) { o.setAttribute('aria-checked', picked.indexOf(i) >= 0); }); submit.disabled = !picked.length; }
      function lock(ans, animate) {
        var ok = ans.ok;
        Array.prototype.forEach.call(opts, function (o, i) {
          o.disabled = true;
          if (correct.indexOf(i) >= 0) o.classList.add('right');
          else if (ans.picked.indexOf(i) >= 0) o.classList.add('wrong');
          o.setAttribute('aria-checked', ans.picked.indexOf(i) >= 0);
        });
        q.classList.add(ok ? 'is-right' : 'is-wrong');
        fb.innerHTML = '<b>' + (ok ? 'Correct!' : 'Not quite.') + '</b> ' + esc(ok ? (b.feedbackRight || '') : (b.feedbackWrong || ''));
        fb.className = 'fb show ' + (ok ? 'ok' : 'no');
        if (animate && !reduce && fb.animate) fb.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'ease-out' });
        if (animate && !ok && !reduce && q.animate) q.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 400 });
        if (animate && ok) burst(q);
        submit.hidden = true; retry.hidden = ok;
      }
      Array.prototype.forEach.call(opts, function (o, i) {
        o.addEventListener('click', function () {
          if (multi) { var k = picked.indexOf(i); k >= 0 ? picked.splice(k, 1) : picked.push(i); }
          else picked = [i];
          paint();
        });
      });
      submit.addEventListener('click', function () {
        var ok = picked.length === correct.length && picked.every(function (i) { return correct.indexOf(i) >= 0; });
        var ans = { picked: picked.slice().sort(), ok: ok };
        S.answers[b.id] = ans;
        X.answered(b, ans.picked, ok);
        lock(ans, true); save();
        var foot = box.querySelector('.l-foot'); if (foot && foot._check && isVisible(foot)) foot._check();
        if (restricted) { var foot2 = box.querySelector('.l-foot'); foot2 && foot2._check && foot2._check(); }
        renderSide(); maybeFinish();
      });
      retry.addEventListener('click', function () {
        delete S.answers[b.id]; picked = [];
        Array.prototype.forEach.call(opts, function (o) { o.disabled = false; o.classList.remove('right', 'wrong'); });
        q.classList.remove('is-right', 'is-wrong'); fb.className = 'fb'; fb.innerHTML = '';
        submit.hidden = false; retry.hidden = true; paint(); save();
      });
      if (S.answers[b.id]) lock(S.answers[b.id], false);
    });
    // continue gates
    Array.prototype.forEach.call(box.querySelectorAll('.blk-continue'), function (g) {
      var bw = g.parentNode, key = l.id + ':' + bw.dataset.bi, btn = g.querySelector('button');
      if (S.gates[key] || S.done[l.id]) { g.classList.add('passed'); return; }
      btn.addEventListener('click', function () {
        // must answer questions above the gate when navigation is restricted
        var prevQs = [], node = bw.previousElementSibling;
        while (node && !node.querySelector('.blk-continue')) { var mq = node.querySelector('.blk-mcq'); if (mq) prevQs.push(mq.dataset.q); node = node.previousElementSibling; }
        if (restricted && prevQs.some(function (id) { return !S.answers[id]; })) { toast('Answer the knowledge check first.'); return; }
        S.gates[key] = true; g.classList.add('passed'); save();
        var sib = bw.nextElementSibling, first = null;
        while (sib) {
          sib.classList.remove('gated'); io ? io.observe(sib) : sib.classList.add('in'); first = first || sib;
          if (sib.querySelector('.blk-continue') && !S.gates[l.id + ':' + sib.dataset.bi]) break;
          sib = sib.nextElementSibling;
        }
        if (!sib) { var foot = box.querySelector('.l-foot'); foot.classList.remove('gated'); }
        if (first) setTimeout(function () { first.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }, 60);
      });
    });
  }
  function isVisible(n) { var r = n.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }

  /* ---------- progress, score, finish ---------- */
  function allAnswered() { return questions.every(function (q) { return S.answers[q.id]; }); }
  function score() { if (!hasQuiz) return 100; var ok = questions.filter(function (q) { return S.answers[q.id] && S.answers[q.id].ok; }).length; return Math.round(ok / questions.length * 100); }
  function progress() { return Math.round(Object.keys(S.done).filter(function (k) { return lessons.some(function (l) { return l.id === k; }); }).length / Math.max(1, lessons.length) * 100); }
  function maybeFinish() {
    if (S.finished) return;
    var lessonsDone = lessons.every(function (l) { return S.done[l.id]; });
    var ok = completionRule === 'quiz' ? (allAnswered() && score() >= passMark) : lessonsDone;
    if (completionRule === 'quiz' && !hasQuiz) ok = lessonsDone;
    if (ok) { S.finished = true; X.finish(score(), passMark, hasQuiz); save(); renderSide(); }
  }
  function results() {
    var box = shell.querySelector('.lesson'); var sc = score(), passed = !hasQuiz || sc >= passMark;
    shell.querySelector('.bar-t').textContent = 'Results';
    box.innerHTML = '<div class="results"><div class="ring ' + (passed ? 'pass' : 'fail') + '"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle class="val" cx="60" cy="60" r="52" style="--v:' + (hasQuiz ? sc : 100) + '"/></svg><b>' + (hasQuiz ? '<span class="cnt">0</span>%' : ICON.check) + '</b></div>' +
      '<h1>' + (hasQuiz ? (passed ? 'Well done!' : 'Almost there') : 'Course complete!') + '</h1>' +
      '<p>' + (hasQuiz ? (passed ? 'You scored ' + sc + '%. The pass mark is ' + passMark + '%.' : 'You scored ' + sc + '%. You need ' + passMark + '% to pass. Review the questions you missed and try again.') : 'You have finished every lesson.') + '</p>' +
      (hasQuiz && !allAnswered() ? '<p class="need">You still have ' + questions.filter(function (q) { return !S.answers[q.id]; }).length + ' question(s) to answer.</p>' : '') +
      '<div class="r-actions">' + (hasQuiz && !passed ? '<button class="btn big retake">Retake the questions</button>' : '') + '<button class="btn ghost big home">Back to course home</button></div></div>';
    if (!reduce) { var c = box.querySelector('.cnt'); if (c) { var t0 = performance.now(); (function step(t) { var p = Math.min(1, (t - t0) / 1100); c.textContent = Math.round(sc * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); })(t0); } } else { var c2 = box.querySelector('.cnt'); if (c2) c2.textContent = sc; }
    if (passed) setTimeout(confetti, 400);
    var rt = box.querySelector('.retake'); if (rt) rt.addEventListener('click', function () { questions.forEach(function (q) { if (S.answers[q.id] && !S.answers[q.id].ok) delete S.answers[q.id]; }); S.finished = false; save(); var first = lessons.findIndex(function (l) { return (l.blocks || []).some(function (b) { return b.type === 'mcq' && !S.answers[b.id]; }); }); go(Math.max(0, first)); });
    box.querySelector('.home').addEventListener('click', function () { cover(true); shell = null; });
    renderSide();
  }

  /* ---------- effects ---------- */
  function toast(msg) {
    var t = el('<div class="toast">' + esc(msg) + '</div>'); document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 220); }, 2200);
  }
  function burst(node) {
    if (reduce) return; var r = node.getBoundingClientRect();
    for (var i = 0; i < 14; i++) {
      var d = document.createElement('i'); d.className = 'spark';
      d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + 40) + 'px'; document.body.appendChild(d);
      var a = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 70;
      d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + Math.cos(a) * dist + 'px,' + Math.sin(a) * dist + 'px) scale(.2)', opacity: 0 }], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.22,1,.36,1)' }).onfinish = (function (x) { return function () { x.remove(); }; })(d);
    }
  }
  function confetti() {
    if (reduce) return;
    var cv = document.createElement('canvas'); cv.className = 'confetti'; document.body.appendChild(cv);
    var dpr = window.devicePixelRatio || 1; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    var acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3b5bdb';
    var cols = [acc, '#f59f00', '#12b886', '#fa5252', '#7950f2'];
    var ps = []; for (var i = 0; i < 120; i++) ps.push({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 15, vy: -Math.random() * 13 - 4, r: Math.random() * 6 + 4, c: cols[i % cols.length], a: Math.random() * 6, va: (Math.random() - .5) * .3 });
    var t0 = performance.now();
    (function tick(t) { ctx.clearRect(0, 0, innerWidth, innerHeight); ps.forEach(function (p) { p.vy += .33; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }); if (t - t0 < 2800) requestAnimationFrame(tick); else cv.remove(); })(t0);
  }

  /* ---------- save / start ---------- */
  function save() { X.saveState({ v: 1, visited: S.visited, done: S.done, answers: S.answers, gates: S.gates, current: S.current, finished: S.finished }); }

  if (!lessons.length) { app.innerHTML = '<main class="cover"><div class="cv-in"><h1>' + esc(C.title || 'Untitled course') + '</h1><p>This course has no lessons yet.</p></div></main>'; return; }
  X.loadState().then(function (st) {
    var resumed = false;
    if (st && st.v === 1) { S = { visited: st.visited || {}, done: st.done || {}, answers: st.answers || {}, gates: st.gates || {}, current: typeof st.current === 'number' ? st.current : -1, finished: !!st.finished }; resumed = Object.keys(S.visited).length > 0; }
    X.start(resumed);
    cover(resumed);
  });
})();

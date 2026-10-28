/*
 * Course Studio — Rise-style block editor.
 * A course is { title, theme, settings, assets, lessons:[{ id, title, blocks:[…] }] }.
 * Every change is saved automatically (to the Google Sheet, or this browser).
 */
(function () {
  'use strict';
  const CS = window.CS;
  const { $, $$, esc } = CS;

  /* ---------------- block catalogue ---------------- */
  const SVG = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const TYPES = {
    heading: { label: 'Heading', group: 'Text', icon: SVG('<path d="M6 4v16M18 4v16M6 12h12"/>'), make: () => ({ text: '', sub: '' }) },
    text: { label: 'Paragraph', group: 'Text', icon: SVG('<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>'), make: () => ({ html: '' }) },
    quote: { label: 'Quote', group: 'Text', icon: SVG('<path d="M7 7h4v6H5V9a2 2 0 0 1 2-2zM15 7h4v6h-6V9a2 2 0 0 1 2-2zM5 13c0 2 1 4 3 4M13 13c0 2 1 4 3 4"/>'), make: () => ({ html: '', cite: '' }) },
    callout: { label: 'Callout', group: 'Text', icon: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'), make: () => ({ html: '', tone: 'info' }) },
    list: { label: 'List', group: 'Text', icon: SVG('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'), make: () => ({ style: 'bullet', items: ['', ''] }) },
    image: { label: 'Image', group: 'Media', icon: SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 8"/>'), make: () => ({ src: '', alt: '', caption: '', width: 'full' }) },
    imageText: { label: 'Image & text', group: 'Media', icon: SVG('<rect x="3" y="6" width="8" height="12" rx="1.5"/><path d="M14 8h7M14 12h7M14 16h5"/>'), make: () => ({ src: '', alt: '', html: '', side: 'left' }) },
    video: { label: 'Video', group: 'Media', icon: SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>'), make: () => ({ url: '', caption: '' }) },
    accordion: { label: 'Accordion', group: 'Interactive', icon: SVG('<rect x="3" y="4" width="18" height="5" rx="1.5"/><rect x="3" y="11" width="18" height="4" rx="1.5"/><rect x="3" y="17" width="18" height="3" rx="1.5"/>'), make: () => ({ items: [{ title: '', html: '' }, { title: '', html: '' }] }) },
    tabs: { label: 'Tabs', group: 'Interactive', icon: SVG('<path d="M3 8h6V5h5v3h7v11H3z"/>'), make: () => ({ items: [{ title: 'Tab 1', html: '' }, { title: 'Tab 2', html: '' }] }) },
    flashcards: { label: 'Flip cards', group: 'Interactive', icon: SVG('<rect x="3" y="6" width="11" height="13" rx="2"/><path d="M17 5h2a2 2 0 0 1 2 2v10M8 3h6"/>'), make: () => ({ items: [{ front: '', back: '' }, { front: '', back: '' }, { front: '', back: '' }] }) },
    process: { label: 'Process', group: 'Interactive', icon: SVG('<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h3M14 12h3"/>'), make: () => ({ items: [{ title: '', html: '' }, { title: '', html: '' }, { title: '', html: '' }] }) },
    mcq: { label: 'Knowledge check', group: 'Quiz', icon: SVG('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17v.5"/>'), make: () => ({ question: '', options: [{ text: '', correct: true }, { text: '', correct: false }, { text: '', correct: false }], feedbackRight: '', feedbackWrong: '' }) },
    divider: { label: 'Divider', group: 'Layout', icon: SVG('<path d="M3 12h18"/><circle cx="12" cy="12" r="1.5"/>'), make: () => ({}) },
    continue: { label: 'Continue button', group: 'Layout', icon: SVG('<rect x="5" y="9" width="14" height="6" rx="3"/><path d="M12 18v3M9 21h6"/>'), make: () => ({ label: 'Continue' }) },
  };
  const GROUPS = ['Text', 'Media', 'Interactive', 'Quiz', 'Layout'];
  const ACCENTS = ['#3b5bdb', '#0c8599', '#2b8a3e', '#e8590c', '#c2255c', '#7048e8', '#1c1d21', '#0e6b5c'];
  const newBlock = type => Object.assign({ id: 'b' + CS.uid(7), type }, TYPES[type].make());

  /* ---------------- templates ---------------- */
  const sampleArt = (a, b) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/><circle cx="930" cy="180" r="210" fill="#fff" opacity=".14"/><circle cx="260" cy="560" r="300" fill="#fff" opacity=".1"/><rect x="380" y="230" width="440" height="250" rx="28" fill="#fff" opacity=".9"/><rect x="420" y="275" width="200" height="22" rx="11" fill="${a}" opacity=".8"/><rect x="420" y="320" width="340" height="14" rx="7" fill="#c9ced6"/><rect x="420" y="350" width="300" height="14" rx="7" fill="#c9ced6"/><rect x="420" y="410" width="130" height="38" rx="19" fill="${a}"/></svg>`);
  function template(kind, id, title) {
    const L = (t, blocks) => ({ id: 'l' + CS.uid(7), title: t, blocks: blocks.map(b => Object.assign(newBlock(b.type), b)) });
    const base = { schema: 1, id, title, description: '', author: CS.who(), category: '', duration: '', lang: 'en', theme: { accent: '#3b5bdb', font: 'Plus Jakarta Sans', cover: '' }, settings: { passMark: 80, navigation: 'free', completion: 'lessons' }, assets: {} };
    if (kind !== 'sample') return Object.assign(base, { lessons: [L('Introduction', [{ type: 'heading', text: 'Welcome' }, { type: 'text', html: '<p>Start writing here. Hover between blocks and click <b>+</b> to add more.</p>' }])] });
    return Object.assign(base, {
      description: 'A short sample that shows every block you can use. Change anything you like.',
      duration: '10 min',
      theme: { accent: '#3b5bdb', font: 'Plus Jakarta Sans', cover: sampleArt('#3b5bdb', '#7048e8') },
      settings: { passMark: 80, navigation: 'free', completion: 'lessons' },
      lessons: [
        L('Getting started', [
          { type: 'heading', text: 'Why this course matters', sub: 'A quick look at what you will learn.' },
          { type: 'text', html: '<p>Courses are built from <b>blocks</b>. Each lesson is a scrolling page, just like Rise. Learners read, tap and answer as they go.</p>' },
          { type: 'image', src: sampleArt('#0c8599', '#3b5bdb'), alt: 'Illustration', caption: 'Replace this picture with your own.' },
          { type: 'list', style: 'check', items: ['Short lessons that work on phones', 'Interactions that keep learners busy', 'xAPI tracking built in'] },
          { type: 'callout', tone: 'tip', html: '<p><b>Tip:</b> press the <b>Preview</b> button at the top to try the course as a learner.</p>' },
        ]),
        L('Explore the ideas', [
          { type: 'heading', text: 'Three key ideas' },
          { type: 'accordion', items: [{ title: 'Keep it short', html: '<p>Learners on phones read in short bursts. One idea per block.</p>' }, { title: 'Make them do something', html: '<p>Tabs, flip cards and questions turn reading into doing.</p>' }, { title: 'Check understanding', html: '<p>A knowledge check at the end of a lesson shows what stuck.</p>' }] },
          { type: 'flashcards', items: [{ front: 'xAPI', back: 'A way for courses to send "statements" about what learners did.' }, { front: 'LRS', back: 'Learning Record Store: where xAPI statements are saved.' }, { front: 'tincan.xml', back: 'The file that tells an LMS how to launch an xAPI course.' }] },
          { type: 'continue', label: 'Continue' },
          { type: 'tabs', items: [{ title: 'Before', html: '<p>Long slides that learners click through without reading.</p>' }, { title: 'After', html: '<p>Short, interactive blocks that learners actually finish.</p>' }] },
          { type: 'process', items: [{ title: 'Plan', html: '<p>Decide what the learner should be able to do.</p>' }, { title: 'Build', html: '<p>Add blocks for each idea.</p>' }, { title: 'Share', html: '<p>Download the xAPI zip and upload it to your LMS.</p>' }] },
          { type: 'quote', html: '<p>Tell me and I forget, teach me and I may remember, involve me and I learn.</p>', cite: 'Common saying' },
        ]),
        L('Check your understanding', [
          { type: 'mcq', question: '<p>Which file tells an LMS how to launch an xAPI course?</p>', options: [{ text: 'tincan.xml', correct: true }, { text: 'imsmanifest.xml', correct: false }, { text: 'index.css', correct: false }], feedbackRight: 'Yes. tincan.xml lists the course activity ID and the launch page.', feedbackWrong: 'imsmanifest.xml is for SCORM. xAPI packages use tincan.xml.' },
          { type: 'mcq', question: '<p>Which of these are good habits for mobile learning? Select all that apply.</p>', options: [{ text: 'Short blocks', correct: true }, { text: 'Interactions', correct: true }, { text: 'Very long pages of text', correct: false }], feedbackRight: 'Exactly right.', feedbackWrong: 'Short blocks and interactions both help. Long text does not.' },
          { type: 'divider' },
          { type: 'text', html: '<p>That is the end of the sample. Now make it yours!</p>' },
        ]),
      ],
    });
  }

  /* ---------------- state ---------------- */
  const E = { open: false, meta: null, course: null, lesson: 0, hist: [], future: [], saving: null, dirty: false, saveTimer: null, histTimer: null, coverChanged: false };
  const lesson = () => E.course.lessons[E.lesson];
  const findBlock = id => { for (const l of E.course.lessons) { const i = l.blocks.findIndex(b => b.id === id); if (i >= 0) return { l, i, b: l.blocks[i] }; } return {}; };
  function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach(k => { o = o[k]; }); o[ks[ks.length - 1]] = val; }

  /* ---------------- rich text ---------------- */
  const OK = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, A: 1, P: 1, BR: 1, UL: 1, OL: 1, LI: 1 };
  function clean(html) {
    const t = document.createElement('template'); t.innerHTML = html;
    (function walk(n) {
      Array.from(n.childNodes).forEach(k => {
        if (k.nodeType === 1) {
          if (k.tagName === 'DIV') { const p = document.createElement('p'); while (k.firstChild) p.appendChild(k.firstChild); k.replaceWith(p); walk(p); return; }
          if (!OK[k.tagName]) { if (/^(SCRIPT|STYLE|IFRAME)$/.test(k.tagName)) { k.remove(); return; } const f = document.createDocumentFragment(); while (k.firstChild) f.appendChild(k.firstChild); k.replaceWith(f); return walk(n); }
          Array.from(k.attributes).forEach(a => { if (!(k.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value))) k.removeAttribute(a.name); });
          walk(k);
        } else if (k.nodeType !== 3) k.remove();
      });
    })(t.content);
    let out = t.innerHTML.trim();
    if (out && !/^<(p|ul|ol)/i.test(out)) out = '<p>' + out + '</p>';
    return out.replace(/<p><\/p>/g, '').replace(/<p><br><\/p>$/,'');
  }

  /* ---------------- field helpers (block edit views) ---------------- */
  const P = (k, v, ph, cls = '', tag = 'div') => `<${tag} class="ed ${cls}" contenteditable="true" spellcheck="true" data-k="${k}" data-ph="${esc(ph)}">${esc(v)}</${tag}>`;
  const RT = (k, v, ph, cls = '') => `<div class="ed rt ${cls}" contenteditable="true" spellcheck="true" data-rk="${k}" data-ph="${esc(ph)}">${v || ''}</div>`;
  const imgSrc = s => !s ? '' : s.startsWith('asset:') ? '' : esc(s);
  const IMG = (b, cls = '') => `<div class="img-drop ${cls} ${b.src ? 'has' : ''}" data-a="img" tabindex="0" role="button" aria-label="${b.src ? 'Replace picture' : 'Add a picture'}">
      ${b.src ? `<img ${b.src.startsWith('asset:') ? `data-asset="${esc(b.src.slice(6))}"` : `src="${imgSrc(b.src)}"`} alt="">` : ''}
      <span class="img-cta"><svg><use href="#i-upload"/></svg>${b.src ? 'Replace picture' : 'Add a picture'}<small>or drop a file here</small></span></div>`;
  const SEG = (k, val, opts) => `<span class="seg-s">${opts.map(([v, l]) => `<button data-a="set" data-k="${k}" data-v="${v}" aria-pressed="${val === v}">${l}</button>`).join('')}</span>`;
  const itemTools = (i, n) => `<span class="it-tools"><button data-a="item-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Move up"><svg><use href="#i-up"/></svg></button><button data-a="item-down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} title="Move down"><svg><use href="#i-down"/></svg></button><button data-a="item-del" data-i="${i}" ${n <= 1 ? 'disabled' : ''} title="Remove"><svg><use href="#i-x"/></svg></button></span>`;
  const addItem = label => `<button class="add-it" data-a="item-add"><svg><use href="#i-plus"/></svg>${label}</button>`;

  const EB = {
    heading: b => `<div class="v-heading">${P('text', b.text, 'Heading', 'h')}${P('sub', b.sub, 'Subheading (optional)', 'sub')}</div>`,
    text: b => RT('html', b.html, 'Start typing… select text to make it bold, add links or lists'),
    quote: b => `<div class="v-quote">${RT('html', b.html, 'Quote text')}${P('cite', b.cite, '— Who said it (optional)', 'cite')}</div>`,
    callout: b => `<div class="opts-row">${SEG('tone', b.tone, [['info', 'Note'], ['tip', 'Tip'], ['warn', 'Warning']])}</div><div class="v-callout ${esc(b.tone)}"><span class="ic"></span>${RT('html', b.html, 'Something learners should notice')}</div>`,
    list: b => `<div class="opts-row">${SEG('style', b.style, [['bullet', '• Bullets'], ['number', '1. Numbers'], ['check', '✓ Checks']])}</div><ol class="v-list ${esc(b.style)}">${b.items.map((it, i) => `<li><span class="mk">${b.style === 'number' ? i + 1 : ''}</span>${P('items.' + i, it, 'List item')}${itemTools(i, b.items.length)}</li>`).join('')}</ol>${addItem('Add item')}`,
    image: b => `<div class="opts-row">${SEG('width', b.width, [['full', 'Full width'], ['medium', 'Medium']])}</div><div class="v-image ${esc(b.width)}">${IMG(b)}${P('caption', b.caption, 'Caption (optional)', 'cap')}${P('alt', b.alt, 'Describe the picture for screen readers', 'alt')}</div>`,
    imageText: b => `<div class="opts-row">${SEG('side', b.side, [['left', 'Picture left'], ['right', 'Picture right']])}</div><div class="v-it ${esc(b.side)}">${IMG(b)}${RT('html', b.html, 'Text next to the picture')}</div>`,
    video: b => { const ok = /youtu|vimeo|^https:\/\//.test(b.url || ''); return `<div class="v-video">${P('url', b.url, 'Paste a YouTube or Vimeo link', 'url')}<div class="vid-prev ${ok ? 'ok' : ''}">${ok ? '<svg><use href="#i-play"/></svg>Video link added' : 'The video shows here in the preview'}</div>${P('caption', b.caption, 'Caption (optional)', 'cap')}</div>`; },
    accordion: b => `<div class="v-acc">${b.items.map((it, i) => `<div class="acc-e"><div class="acc-h">${P('items.' + i + '.title', it.title, 'Accordion title')}${itemTools(i, b.items.length)}</div>${RT('items.' + i + '.html', it.html, 'What appears when it opens')}</div>`).join('')}</div>${addItem('Add section')}`,
    tabs: b => `<div class="v-tabs">${b.items.map((it, i) => `<div class="tab-e"><div class="tab-h">${P('items.' + i + '.title', it.title, 'Tab name')}${itemTools(i, b.items.length)}</div>${RT('items.' + i + '.html', it.html, 'Tab content')}</div>`).join('')}</div>${addItem('Add tab')}`,
    flashcards: b => `<div class="v-cards">${b.items.map((it, i) => `<div class="card-e"><div class="front">${P('items.' + i + '.front', it.front, 'Front')}</div><div class="back">${P('items.' + i + '.back', it.back, 'Back (shown after the flip)')}</div>${itemTools(i, b.items.length)}</div>`).join('')}</div>${addItem('Add card')}`,
    process: b => `<div class="v-proc">${b.items.map((it, i) => `<div class="step-e"><span class="n">${i + 1}</span><div class="st">${P('items.' + i + '.title', it.title, 'Step title')}${RT('items.' + i + '.html', it.html, 'Step description')}</div>${itemTools(i, b.items.length)}</div>`).join('')}</div>${addItem('Add step')}`,
    mcq: b => { const multi = b.options.filter(o => o.correct).length > 1; return `<div class="v-mcq"><span class="kc">Knowledge check</span>${RT('question', b.question, 'Type the question')}<p class="hint">Tick the right answer${multi ? 's (learners must pick all of them)' : '. Tick more than one to make it “select all that apply”.'}</p>
      ${b.options.map((o, i) => `<div class="opt-e ${o.correct ? 'right' : ''}"><button class="tick" data-a="correct" data-i="${i}" aria-pressed="${o.correct}" title="${o.correct ? 'Correct answer' : 'Mark as correct'}"><svg><use href="#i-check"/></svg></button>${P('options.' + i + '.text', o.text, 'Answer ' + (i + 1))}${itemTools(i, b.options.length)}</div>`).join('')}
      ${b.options.length < 8 ? addItem('Add answer') : ''}
      <div class="fb-e"><label class="ok">${P('feedbackRight', b.feedbackRight, 'Feedback when correct (optional)')}</label><label class="no">${P('feedbackWrong', b.feedbackWrong, 'Feedback when wrong (optional)')}</label></div></div>`; },
    divider: () => `<div class="v-divider"><span></span><i></i><span></span></div>`,
    continue: b => `<div class="v-continue"><span class="btn-like">${P('label', b.label, 'Continue', '', 'span')}</span><p class="hint">Everything below stays hidden until the learner clicks this.</p></div>`,
  };

  /* ---------------- rendering ---------------- */
  function shell() {
    const v = $('#view');
    v.innerHTML = `
    <div class="editor" id="editor">
      <header class="ed-top">
        <button class="btn icon ghost" id="edBack" title="Back to the course"><svg><use href="#i-left"/></svg></button>
        <input class="ed-title" id="edTitle" aria-label="Course title" maxlength="160">
        <span class="save-state" id="saveState"><i></i><span>Saved</span></span>
        <div class="ed-acts">
          <button class="btn icon ghost" id="edUndo" title="Undo (Ctrl+Z)" disabled><svg><use href="#i-undo"/></svg></button>
          <button class="btn icon ghost" id="edRedo" title="Redo (Ctrl+Shift+Z)" disabled><svg><use href="#i-redo"/></svg></button>
          <button class="btn" id="edSettings"><svg><use href="#i-sliders"/></svg><span class="lbl">Settings</span></button>
          <button class="btn" id="edExport"><svg><use href="#i-download"/></svg><span class="lbl">Export xAPI</span></button>
          <button class="btn primary" id="edPreview"><svg><use href="#i-play"/></svg><span class="lbl">Preview</span></button>
        </div>
      </header>
      <div class="ed-body">
        <aside class="ed-side" id="edSide">
          <button class="cover-tile" id="edCoverTile"><span class="ct-img" id="ctImg"></span><span><b>Course cover</b><small>Title, picture, colours</small></span></button>
          <div class="side-h">Lessons <button class="btn sm ghost" id="addLesson"><svg><use href="#i-plus"/></svg>Add</button></div>
          <ol class="lessons" id="lessons"></ol>
        </aside>
        <main class="ed-canvas" id="canvas"></main>
      </div>
      <button class="side-toggle" id="sideToggle" aria-label="Show lessons"><svg><use href="#i-list"/></svg></button>
    </div>`;
    $('#edTitle').value = E.course.title;
    $('#edTitle').addEventListener('input', e => { E.course.title = e.target.value; changed(); });
    $('#edBack').addEventListener('click', () => CS.go({ course: E.meta.id }));
    $('#edUndo').addEventListener('click', undo); $('#edRedo').addEventListener('click', redo);
    $('#edSettings').addEventListener('click', openSettings); $('#edCoverTile').addEventListener('click', openSettings);
    $('#edPreview').addEventListener('click', preview); $('#edExport').addEventListener('click', exportZip);
    $('#addLesson').addEventListener('click', () => { E.course.lessons.push({ id: 'l' + CS.uid(7), title: '', blocks: [newBlock('heading')] }); E.lesson = E.course.lessons.length - 1; changed(); renderSide(); renderCanvas(true); setTimeout(() => { const t = $('#lessonTitle'); t && t.focus(); }, 80); });
    $('#sideToggle').addEventListener('click', () => $('#editor').classList.toggle('side-open'));
    paintCover();
    renderSide(); renderCanvas(true);
    wireCanvas();
  }
  function paintCover() {
    const c = E.course.theme.cover, box = $('#ctImg'); if (!box) return;
    document.documentElement.style.setProperty('--c-accent', E.course.theme.accent || '#3b5bdb');
    box.style.background = E.course.theme.accent;
    if (c && c.startsWith('asset:')) CS.assetUrl(E.meta, E.course, c.slice(6)).then(u => { box.style.background = `center/cover url("${u}")`; });
    else if (c) box.style.background = `center/cover url("${c}")`;
  }
  function renderSide() {
    const ol = $('#lessons'); if (!ol) return;
    ol.innerHTML = E.course.lessons.map((l, i) => `<li class="ls ${i === E.lesson ? 'on' : ''}" data-li="${i}" draggable="true">
      <span class="grip" title="Drag to reorder"><svg><use href="#i-grip"/></svg></span><span class="n">${i + 1}</span>
      <button class="ls-t" data-a="pick">${esc(l.title || 'Untitled lesson')}<small>${l.blocks.length} block${l.blocks.length === 1 ? '' : 's'}</small></button>
      <span class="ls-tools"><button data-a="ldup" title="Duplicate lesson"><svg><use href="#i-copy"/></svg></button><button data-a="ldel" title="Delete lesson" ${E.course.lessons.length < 2 ? 'disabled' : ''}><svg><use href="#i-trash"/></svg></button></span></li>`).join('');
  }
  function renderCanvas(animate) {
    const cv = $('#canvas'); const l = lesson();
    cv.innerHTML = `<div class="paper">
      <div class="l-meta">Lesson ${E.lesson + 1} of ${E.course.lessons.length}</div>
      <h1 class="ed lesson-title" id="lessonTitle" contenteditable="true" data-lk="title" data-ph="Lesson title">${esc(l.title)}</h1>
      <div class="blocks" id="blocks">${insertLine(0)}${l.blocks.map((b, i) => blockHtml(b, i) + insertLine(i + 1)).join('')}</div>
      ${!l.blocks.length ? '' : ''}
      <button class="add-block" data-a="insert" data-at="${l.blocks.length}"><span class="plus"><svg><use href="#i-plus"/></svg></span>Add a block</button>
      <div class="next-l">${E.lesson + 1 < E.course.lessons.length ? `<button class="btn" data-a="goto" data-li="${E.lesson + 1}">Next lesson: ${esc(E.course.lessons[E.lesson + 1].title || 'Untitled')} <svg><use href="#i-right"/></svg></button>` : `<button class="btn ghost" data-a="newlesson"><svg><use href="#i-plus"/></svg>Add another lesson</button>`}</div>
    </div>`;
    // switching lessons happens often: a short fade with a small stagger, never blocking typing
    if (animate && !CS.reduce) $$('.eb', cv).forEach((n, i) => n.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: Math.min(i, 6) * 30, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'backwards' }));
    fillAssets(cv);
  }
  const insertLine = at => `<div class="ins"><button data-a="insert" data-at="${at}" title="Add a block here"><svg><use href="#i-plus"/></svg></button></div>`;
  function blockHtml(b, i) {
    const T = TYPES[b.type] || { label: b.type };
    return `<section class="eb t-${b.type}" data-bid="${b.id}" data-bi="${i}">
      <div class="eb-bar"><span class="eb-grip" draggable="true" title="Drag to move"><svg><use href="#i-grip"/></svg></span><span class="eb-type">${T.icon || ''}${T.label}</span>
        <span class="eb-tools"><button data-a="up" title="Move up" ${i === 0 ? 'disabled' : ''}><svg><use href="#i-up"/></svg></button><button data-a="down" title="Move down" ${i === lesson().blocks.length - 1 ? 'disabled' : ''}><svg><use href="#i-down"/></svg></button><button data-a="dup" title="Duplicate"><svg><use href="#i-copy"/></svg></button><button data-a="del" title="Delete" class="danger"><svg><use href="#i-trash"/></svg></button></span></div>
      <div class="eb-body">${(EB[b.type] || (() => '<p class="muted">Unknown block</p>'))(b)}</div>
    </section>`;
  }
  function rerenderBlock(id, focusSel) {
    const n = $(`.eb[data-bid="${id}"]`); const { b, i } = findBlock(id); if (!n || !b) return;
    const tmp = document.createElement('div'); tmp.innerHTML = blockHtml(b, i); const fresh = tmp.firstChild;
    n.replaceWith(fresh); fillAssets(fresh);
    if (focusSel) { const f = $(focusSel, fresh); if (f) { f.focus(); placeEnd(f); } }
    return fresh;
  }
  function placeEnd(el) { try { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} }
  function fillAssets(root) { $$('img[data-asset]', root).forEach(img => CS.assetUrl(E.meta, E.course, img.dataset.asset).then(u => { if (u) img.src = u; })); }

  /* ---------------- canvas events ---------------- */
  function wireCanvas() {
    const cv = $('#canvas'), side = $('#edSide');
    cv.addEventListener('input', e => {
      const t = e.target.closest('[data-k],[data-rk],[data-lk]'); if (!t) return;
      if (t.dataset.lk) { lesson().title = t.textContent.trim(); const s = $(`.ls[data-li="${E.lesson}"] .ls-t`); if (s) s.firstChild.textContent = lesson().title || 'Untitled lesson'; changed(); return; }
      const { b } = findBlock(t.closest('.eb').dataset.bid); if (!b) return;
      if (t.dataset.k) setPath(b, t.dataset.k, t.textContent.replace(/ /g, ' ').trim());
      else setPath(b, t.dataset.rk, clean(t.innerHTML));
      if (b.type === 'video' && t.dataset.k === 'url') { const p = $('.vid-prev', t.closest('.eb')); const ok = /youtu|vimeo|^https:\/\//.test(b.url); p.classList.toggle('ok', ok); p.innerHTML = ok ? '<svg><use href="#i-play"/></svg>Video link added' : 'The video shows here in the preview'; }
      changed();
    });
    cv.addEventListener('keydown', e => {
      const t = e.target;
      if (t.matches('[data-k],[data-lk]') && e.key === 'Enter') { e.preventDefault(); t.blur(); }
      if (t.matches('[data-k],[data-lk]') && (e.ctrlKey || e.metaKey) && /^[biu]$/i.test(e.key)) e.preventDefault();
    });
    cv.addEventListener('paste', e => {
      const t = e.target.closest('[data-k],[data-rk],[data-lk]'); if (!t) return;
      const text = (e.clipboardData || window.clipboardData).getData('text/plain'); e.preventDefault();
      if (t.dataset.rk) document.execCommand('insertHTML', false, text.split(/\n{2,}/).map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join(''));
      else document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
    });
    cv.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      const act = a.dataset.a, eb = a.closest('.eb'), id = eb && eb.dataset.bid, ref = id ? findBlock(id) : {};
      if (act === 'insert') { return openPicker(+a.dataset.at, a); }
      if (act === 'goto') { pickLesson(+a.dataset.li); return; }
      if (act === 'newlesson') { $('#addLesson').click(); return; }
      if (!ref.b) return;
      const L = ref.l.blocks, i = ref.i, b = ref.b;
      if (act === 'up' || act === 'down') { const j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= L.length) return; const first = eb.getBoundingClientRect(); [L[i], L[j]] = [L[j], L[i]]; changed(); renderCanvas(); flip(b.id, first); return; }
      if (act === 'dup') { const c = JSON.parse(JSON.stringify(b)); c.id = 'b' + CS.uid(7); L.splice(i + 1, 0, c); changed(); renderCanvas(); pulse(c.id); renderSide(); return; }
      if (act === 'del') { const node = eb; if (!CS.reduce) await node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 150, easing: 'cubic-bezier(.23,1,.32,1)' }).finished; L.splice(i, 1); changed(); renderCanvas(); renderSide(); CS.toast('Block deleted — press Ctrl+Z to undo'); return; }
      if (act === 'set') { b[a.dataset.k] = a.dataset.v; changed(); rerenderBlock(b.id); return; }
      if (act === 'img') { pickImage(b); return; }
      const arr = b.type === 'mcq' ? b.options : b.items, k = +a.dataset.i;
      if (act === 'item-add') { const blank = b.type === 'mcq' ? { text: '', correct: false } : b.type === 'list' ? '' : JSON.parse(JSON.stringify(TYPES[b.type].make().items[0])); if (b.type === 'tabs') blank.title = 'Tab ' + (arr.length + 1); arr.push(blank); changed(); const n = rerenderBlock(b.id); const fs = $$('[data-k]', n).filter(x => /\.\d+(\.(title|text|front))?$/.test(x.dataset.k)); const last = fs[fs.length - 1] || null; if (last && !(b.type === 'flashcards' && false)) { const keyPrefix = (b.type === 'mcq' ? 'options.' : 'items.') + (arr.length - 1); const target = $$('[data-k]', n).find(x => x.dataset.k === keyPrefix || x.dataset.k.startsWith(keyPrefix + '.')); target && (target.focus(), placeEnd(target)); } return; }
      if (act === 'item-del') { if (arr.length <= 1) return; arr.splice(k, 1); if (b.type === 'mcq' && !arr.some(o => o.correct)) arr[0].correct = true; changed(); rerenderBlock(b.id); return; }
      if (act === 'item-up' || act === 'item-down') { const j = act === 'item-up' ? k - 1 : k + 1; if (j < 0 || j >= arr.length) return; [arr[k], arr[j]] = [arr[j], arr[k]]; changed(); rerenderBlock(b.id); return; }
      if (act === 'correct') { arr[k].correct = !arr[k].correct; if (!arr.some(o => o.correct)) { arr[k].correct = true; CS.toast('A question needs at least one correct answer.', 'bad'); } changed(); rerenderBlock(b.id); return; }
    });
    cv.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.img-drop')) { e.preventDefault(); e.target.click(); } });
    // drop a picture straight onto an image block
    cv.addEventListener('dragover', e => { const d = e.target.closest('.img-drop'); if (d && e.dataTransfer.types.includes('Files')) { e.preventDefault(); d.classList.add('drag'); } });
    cv.addEventListener('dragleave', e => { const d = e.target.closest('.img-drop'); if (d) d.classList.remove('drag'); });
    cv.addEventListener('drop', e => { const d = e.target.closest('.img-drop'); if (d && e.dataTransfer.files.length) { e.preventDefault(); d.classList.remove('drag'); const { b } = findBlock(d.closest('.eb').dataset.bid); if (b) useImage(b, e.dataTransfer.files[0]); } });
    // drag blocks to reorder
    let dragId = null;
    cv.addEventListener('dragstart', e => { const g = e.target.closest('.eb-grip'); if (!g) return; const eb = g.closest('.eb'); dragId = eb.dataset.bid; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); try { e.dataTransfer.setDragImage(eb, 30, 20); } catch (x) {} setTimeout(() => eb.classList.add('dragging'), 0); });
    cv.addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); const eb = e.target.closest('.eb'); $$('.eb.drop-before,.eb.drop-after', cv).forEach(n => n.classList.remove('drop-before', 'drop-after')); if (eb && eb.dataset.bid !== dragId) { const r = eb.getBoundingClientRect(); eb.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after'); } });
    cv.addEventListener('drop', e => {
      if (!dragId) return; e.preventDefault();
      const tgt = $('.eb.drop-before,.eb.drop-after', cv); const L = lesson().blocks; const from = L.findIndex(b => b.id === dragId);
      if (tgt && from >= 0) { const [m] = L.splice(from, 1); let to = L.findIndex(b => b.id === tgt.dataset.bid); if (tgt.classList.contains('drop-after')) to++; L.splice(to, 0, m); changed(); renderCanvas(); pulse(m.id); }
      dragId = null;
    });
    cv.addEventListener('dragend', () => { dragId = null; $$('.eb', cv).forEach(n => n.classList.remove('dragging', 'drop-before', 'drop-after')); });

    // sidebar
    side.addEventListener('click', e => {
      const li = e.target.closest('.ls'); const a = e.target.closest('[data-a]'); if (!li || !a) return;
      const i = +li.dataset.li;
      if (a.dataset.a === 'pick') { pickLesson(i); $('#editor').classList.remove('side-open'); }
      if (a.dataset.a === 'ldup') { const c = JSON.parse(JSON.stringify(E.course.lessons[i])); c.id = 'l' + CS.uid(7); c.title = (c.title || 'Lesson') + ' (copy)'; c.blocks.forEach(b => (b.id = 'b' + CS.uid(7))); E.course.lessons.splice(i + 1, 0, c); E.lesson = i + 1; changed(); renderSide(); renderCanvas(true); }
      if (a.dataset.a === 'ldel') { if (E.course.lessons.length < 2) return; CS.confirm('Delete “' + (E.course.lessons[i].title || 'this lesson') + '”?', 'The lesson and its ' + E.course.lessons[i].blocks.length + ' blocks will be removed. You can undo with Ctrl+Z.', 'Delete lesson', true).then(ok => { if (!ok) return; E.course.lessons.splice(i, 1); E.lesson = Math.min(E.lesson, E.course.lessons.length - 1); changed(); renderSide(); renderCanvas(true); }); }
    });
    let ldrag = null;
    side.addEventListener('dragstart', e => { const li = e.target.closest('.ls'); if (!li) return; ldrag = +li.dataset.li; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'lesson'); li.classList.add('dragging'); });
    side.addEventListener('dragover', e => { if (ldrag == null) return; e.preventDefault(); const li = e.target.closest('.ls'); $$('.ls', side).forEach(n => n.classList.remove('drop-before', 'drop-after')); if (li && +li.dataset.li !== ldrag) { const r = li.getBoundingClientRect(); li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after'); } });
    side.addEventListener('drop', e => {
      if (ldrag == null) return; e.preventDefault(); const tgt = $('.ls.drop-before,.ls.drop-after', side);
      if (tgt) { const cur = E.course.lessons[E.lesson]; const [m] = E.course.lessons.splice(ldrag, 1); let to = +tgt.dataset.li; if (to > ldrag) to--; if (tgt.classList.contains('drop-after')) to++; E.course.lessons.splice(to, 0, m); E.lesson = E.course.lessons.indexOf(cur); changed(); renderSide(); renderCanvas(); }
      ldrag = null;
    });
    side.addEventListener('dragend', () => { ldrag = null; $$('.ls', side).forEach(n => n.classList.remove('dragging', 'drop-before', 'drop-after')); });
  }
  function pickLesson(i) { E.lesson = i; renderSide(); renderCanvas(true); $('#canvas').scrollTo({ top: 0, behavior: CS.reduce ? 'auto' : 'smooth' }); }
  function flip(id, first) { const n = $(`.eb[data-bid="${id}"]`); if (!n || CS.reduce) return; const last = n.getBoundingClientRect(); n.animate([{ transform: `translateY(${first.top - last.top}px)` }, { transform: 'none' }], { duration: 250, easing: 'cubic-bezier(.77,0,.175,1)' }); n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  function pulse(id) { const n = $(`.eb[data-bid="${id}"]`); if (!n) return; n.scrollIntoView({ block: 'center', behavior: CS.reduce ? 'auto' : 'smooth' }); n.classList.add('pulse'); setTimeout(() => n.classList.remove('pulse'), 1200); }

  /* ---------------- block picker ---------------- */
  let pickAt = 0;
  function openPicker(at, anchor) {
    pickAt = at;
    const d = $('#pickDlg');
    $('#pickGrid').innerHTML = GROUPS.map(g => `<div class="pg"><h4>${g}</h4><div class="pg-row">${Object.entries(TYPES).filter(([, t]) => t.group === g).map(([k, t], i) => `<button class="pick" data-type="${k}" style="--i:${i}"><span class="pi">${t.icon}</span>${t.label}</button>`).join('')}</div></div>`).join('');
    CS.openDlg(d);
  }
  $('#pickGrid').addEventListener('click', e => {
    const p = e.target.closest('[data-type]'); if (!p) return;
    const b = newBlock(p.dataset.type);
    lesson().blocks.splice(pickAt, 0, b);
    changed(); CS.closeDlg($('#pickDlg')); renderCanvas(); renderSide();
    pulse(b.id);
    setTimeout(() => { const f = $(`.eb[data-bid="${b.id}"] .ed`); if (f) f.focus(); }, 300);
  });

  /* ---------------- images ---------------- */
  function pickImage(b) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = () => inp.files[0] && useImage(b, inp.files[0]); inp.click(); }
  async function addAsset(file) {
    const img = await CS.prepareImage(file);
    const h = await CS.hashBytes(img.bytes);
    if (!E.course.assets[h]) {
      const info = await CS.putBlob(E.meta, 'asset-' + h, img.bytes, 1);
      E.course.assets[h] = { type: img.type, ext: img.ext, size: info.size, parts: info.parts, w: img.w, h: img.h };
    }
    CS.rememberAssetUrl(E.meta, h, URL.createObjectURL(new Blob([img.bytes], { type: img.type })));
    return h;
  }
  async function useImage(b, file) {
    if (!/^image\//.test(file.type)) { CS.toast('Please choose a picture file.', 'bad'); return; }
    const n = $(`.eb[data-bid="${b.id}"] .img-drop`); if (n) n.classList.add('loading');
    try { const h = await addAsset(file); b.src = 'asset:' + h; if (!b.alt) b.alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '); changed(); rerenderBlock(b.id); }
    catch (err) { CS.toast(err.message, 'bad'); if (n) n.classList.remove('loading'); }
  }

  /* ---------------- settings ---------------- */
  function openSettings() {
    const c = E.course, f = $('#setForm');
    f.elements.title.value = c.title; f.elements.description.value = c.description || ''; f.elements.author.value = c.author || ''; f.elements.category.value = c.category || ''; f.elements.duration.value = c.duration || '';
    f.elements.passMark.value = (c.settings || {}).passMark || 80; $('#pmOut').textContent = f.elements.passMark.value + '%';
    f.elements.navigation.value = (c.settings || {}).navigation || 'free'; f.elements.completion.value = (c.settings || {}).completion || 'lessons';
    f.elements.font.innerHTML = CS.FONTS.map(x => `<option ${x === c.theme.font ? 'selected' : ''}>${x}</option>`).join('');
    $('#swatches').innerHTML = ACCENTS.map(a => `<button type="button" class="sw" style="--c:${a}" data-c="${a}" aria-pressed="${a === c.theme.accent}" aria-label="Colour ${a}"></button>`).join('') + `<label class="sw custom" title="Any colour"><input type="color" value="${esc(c.theme.accent)}" id="swCustom"></label>`;
    paintSetCover();
    CS.openDlg($('#setDlg'));
  }
  function paintSetCover() { const c = E.course.theme.cover, box = $('#setCover'); box.classList.toggle('has', !!c); const img = $('img', box); if (!c) { img.removeAttribute('src'); return; } if (c.startsWith('asset:')) CS.assetUrl(E.meta, E.course, c.slice(6)).then(u => (img.src = u)); else img.src = c; }
  $('#swatches').addEventListener('click', e => { const s = e.target.closest('[data-c]'); if (!s) return; E.course.theme.accent = s.dataset.c; $$('#swatches .sw').forEach(x => x.setAttribute('aria-pressed', x === s)); paintCover(); changed(); });
  $('#swatches').addEventListener('input', e => { if (e.target.id === 'swCustom') { E.course.theme.accent = e.target.value; $$('#swatches [data-c]').forEach(x => x.setAttribute('aria-pressed', false)); paintCover(); changed(); } });
  $('#setForm').addEventListener('input', e => {
    const f = e.currentTarget, c = E.course, el = e.target;
    if (['title', 'description', 'author', 'category', 'duration'].includes(el.name)) { c[el.name] = el.value; if (el.name === 'title') $('#edTitle').value = el.value; }
    if (el.name === 'passMark') { c.settings.passMark = +el.value; $('#pmOut').textContent = el.value + '%'; }
    if (el.name === 'navigation' || el.name === 'completion') c.settings[el.name] = el.value;
    if (el.name === 'font') c.theme.font = el.value;
    changed();
  });
  $('#setCoverFile').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    $('#setCover').classList.add('loading');
    try { const h = await addAsset(file); E.course.theme.cover = 'asset:' + h; E.coverChanged = true; paintSetCover(); paintCover(); changed(); }
    catch (err) { CS.toast(err.message, 'bad'); } finally { $('#setCover').classList.remove('loading'); }
  });
  $('#setCoverDel').addEventListener('click', () => { E.course.theme.cover = ''; E.coverChanged = true; paintSetCover(); paintCover(); changed(); });

  /* ---------------- history & saving ---------------- */
  function snapshot() { return JSON.stringify({ c: E.course, l: E.lesson }); }
  function changed() {
    E.dirty = true; paintSave('dirty');
    if (!E.histTimer) E.hist.push(E.lastSnap);
    clearTimeout(E.histTimer); E.histTimer = setTimeout(() => { E.histTimer = null; E.lastSnap = snapshot(); }, 700);
    if (E.hist.length > 80) E.hist.shift();
    E.future = []; paintUndo();
    clearTimeout(E.saveTimer); E.saveTimer = setTimeout(save, 1500);
  }
  function restore(s) { const o = JSON.parse(s); E.course = o.c; E.lesson = Math.min(o.l, E.course.lessons.length - 1); $('#edTitle').value = E.course.title; paintCover(); renderSide(); renderCanvas(); E.dirty = true; paintSave('dirty'); clearTimeout(E.saveTimer); E.saveTimer = setTimeout(save, 1200); }
  function undo() { if (E.histTimer) { clearTimeout(E.histTimer); E.histTimer = null; E.lastSnap = snapshot(); } if (!E.hist.length) return; E.future.push(snapshot()); const s = E.hist.pop(); E.lastSnap = s; restore(s); paintUndo(); }
  function redo() { if (!E.future.length) return; E.hist.push(snapshot()); const s = E.future.pop(); E.lastSnap = s; restore(s); paintUndo(); }
  function paintUndo() { const u = $('#edUndo'), r = $('#edRedo'); if (u) u.disabled = !E.hist.length && !E.histTimer; if (r) r.disabled = !E.future.length; }
  function paintSave(st, msg) {
    const n = $('#saveState'); if (!n) return;
    n.dataset.st = st;
    $('span', n).textContent = msg || { dirty: 'Unsaved changes', saving: 'Saving…', saved: CS.store.remote ? 'Saved to Google Sheet' : 'Saved in this browser', error: 'Not saved — retrying' }[st];
  }
  async function save() {
    if (E.saving) { E.again = true; return E.saving; }
    if (!E.dirty) return;
    E.dirty = false; paintSave('saving');
    const course = E.course, meta = Object.assign({}, E.meta, { blobs: Object.assign({}, E.meta.blobs) });
    E.saving = (async () => {
      try {
        const bytes = new TextEncoder().encode(JSON.stringify(course));
        const v = ((meta.blobs.source || {}).v || 0) + 1;
        meta.blobs.source = await CS.putBlob(meta, 'source', bytes, v);
        meta.title = course.title || 'Untitled course'; meta.description = course.description || ''; meta.category = course.category || ''; meta.author = course.author || '';
        meta.lessonCount = course.lessons.length;
        meta.size = bytes.byteLength + Object.values(course.assets || {}).reduce((a, x) => a + (x.size || 0), 0);
        if (E.coverChanged) {
          E.coverChanged = false;
          const c = course.theme.cover;
          meta.thumbnail = !c ? '' : await CS.thumbFrom(c.startsWith('asset:') ? await CS.assetUrl(E.meta, course, c.slice(6)) : c).catch(() => meta.thumbnail);
        }
        await CS.saveMeta(meta); E.meta = meta; paintSave('saved');
      } catch (err) {
        E.dirty = true; paintSave('error'); console.warn(err);
        if (err.data && err.data.badPin) { CS.toast('Your editor PIN has changed. Unlock editing again to keep saving.', 'bad'); return; }
        clearTimeout(E.saveTimer); E.saveTimer = setTimeout(save, 5000);
      } finally {
        E.saving = null;
        if (E.again) { E.again = false; if (E.dirty) save(); }
      }
    })();
    return E.saving;
  }
  addEventListener('beforeunload', e => { if (E.open && (E.dirty || E.saving)) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- preview & export ---------------- */
  async function preview(e) {
    const pv = $('#pv'); if (e && e.clientX) { pv.style.setProperty('--px', e.clientX + 'px'); pv.style.setProperty('--py', e.clientY + 'px'); }
    try {
      const files = await CS.buildPackage(E.course, h => CS.assetBlob(E.meta, E.course, h));
      await CS.preview({ title: E.course.title, files, key: 'p-' + CS.uid(6), launch: 'index.html', activityId: CS.activityIdFor(E.course) });
    } catch (err) { CS.toast(err.message, 'bad'); }
  }
  async function exportZip() {
    const bz = CS.busy('Building the xAPI package…');
    try {
      await save();
      const files = await CS.buildPackage(E.course, h => CS.assetBlob(E.meta, E.course, h));
      const blob = await CS.zipFiles(files, p => bz.progress(p));
      bz.done(); CS.download(blob, CS.slug(E.course.title) + '-xapi.zip'); CS.toast('xAPI zip downloaded');
    } catch (err) { bz.done(); CS.toast(err.message, 'bad'); }
  }

  /* ---------------- format toolbar for rich text ---------------- */
  const fmt = $('#fmtBar');
  document.addEventListener('selectionchange', () => {
    if (!E.open) return;
    const s = getSelection(); const host = s.rangeCount && s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest('[data-rk]');
    if (!host || s.isCollapsed) { fmt.classList.remove('on'); return; }
    const r = s.getRangeAt(0).getBoundingClientRect(); if (!r.width) return;
    fmt.style.left = Math.max(8, Math.min(innerWidth - fmt.offsetWidth - 8, r.left + r.width / 2 - fmt.offsetWidth / 2)) + 'px';
    fmt.style.top = Math.max(8, r.top - 50) + 'px';
    fmt.classList.add('on');
    $$('[data-cmd]', fmt).forEach(b => { try { b.setAttribute('aria-pressed', document.queryCommandState(b.dataset.cmd)); } catch (e) {} });
  });
  fmt.addEventListener('mousedown', e => e.preventDefault());
  fmt.addEventListener('click', e => {
    const b = e.target.closest('[data-cmd]'); if (!b) return;
    if (b.dataset.cmd === 'createLink') { const url = prompt('Link address (https://…)', 'https://'); if (!url || !/^(https?:|mailto:)/i.test(url)) return; document.execCommand('createLink', false, url); }
    else document.execCommand(b.dataset.cmd, false, null);
    const host = getSelection().anchorNode; const ed = host && (host.nodeType === 1 ? host : host.parentNode).closest('[data-rk]');
    if (ed) ed.dispatchEvent(new Event('input', { bubbles: true }));
  });

  /* ---------------- keyboard ---------------- */
  document.addEventListener('keydown', e => {
    if (!E.open || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { const inField = document.activeElement && document.activeElement.isContentEditable; if (!inField || true) { e.preventDefault(); e.shiftKey ? redo() : undo(); } }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); clearTimeout(E.saveTimer); save(); }
  });

  /* ---------------- open / close ---------------- */
  CS.Editor = {
    template,
    isOpen: () => E.open,
    currentId: () => E.meta && E.meta.id,
    async open(meta) {
      const v = $('#view'); v.innerHTML = '<div class="loading full"><span class="spin"></span>Opening the editor…</div>';
      try {
        const course = await CS.loadSource(meta);
        course.assets = course.assets || {}; course.theme = Object.assign({ accent: '#3b5bdb', font: 'Plus Jakarta Sans', cover: '' }, course.theme || {}); course.settings = Object.assign({ passMark: 80, navigation: 'free', completion: 'lessons' }, course.settings || {});
        if (!course.lessons || !course.lessons.length) course.lessons = [{ id: 'l' + CS.uid(7), title: 'Lesson 1', blocks: [] }];
        Object.assign(E, { open: true, meta, course, lesson: 0, hist: [], future: [], dirty: false, coverChanged: !meta.thumbnail && !!course.theme.cover });
        E.lastSnap = snapshot();
        shell(); paintUndo(); paintSave('saved');
        if (E.coverChanged) { E.dirty = true; save(); }
      } catch (err) { v.innerHTML = `<div class="empty big"><h3>Could not open the editor</h3><p>${esc(err.message)}</p><button class="btn" data-home>Back</button></div>`; }
    },
    async close() {
      if (!E.open) return true;
      clearTimeout(E.saveTimer);
      if (E.dirty || E.saving) { const bz = CS.busy('Saving your changes…'); try { await save(); if (E.saving) await E.saving; } finally { bz.done(); } }
      if (E.dirty) { const leave = await CS.confirm('Leave without saving?', 'Your latest changes could not be saved yet.', 'Leave anyway', true); if (!leave) return false; }
      E.open = false; fmt.classList.remove('on'); document.documentElement.style.removeProperty('--c-accent');
      return true;
    },
  };
})();

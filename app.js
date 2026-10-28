/*
 * Course Studio — main app: storage, library, course page, files & code,
 * upload, preview with live xAPI statements, sharing.
 * The block editor is in editor.js, the package builder in package.js.
 */
(function () {
  'use strict';
  const CS = window.CS = window.CS || {};
  const API = (window.STUDIO_API_URL || '').trim();
  const SITE = new URL('./', location.href);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ss = { get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  Object.assign(CS, { $, $$, esc, SITE, reduce, ls, ss });

  /* ======================= small helpers ======================= */
  CS.uid = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  CS.slug = s => String(s || 'course').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').toLowerCase().slice(0, 48) || 'course';
  CS.fmtBytes = n => { n = Number(n) || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'; return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB'; };
  CS.fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
  CS.ago = iso => { const d = new Date(iso); if (isNaN(d)) return ''; const s = (Date.now() - d) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; if (s < 604800) return Math.floor(s / 86400) + ' d ago'; return CS.fmtDate(iso); };
  CS.hashBytes = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 10), b => b.toString(16).padStart(2, '0')).join('');
  CS.download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); };

  CS.toast = function (msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = `<i>${kind === 'bad' ? '!' : '✓'}</i><span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    let timer, left = kind === 'bad' ? 5200 : 2600, started = Date.now();
    const run = () => { clearTimeout(timer); started = Date.now(); timer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, left); };
    // pause while the tab is hidden or the pointer is on the toast, so it is never missed
    const pause = () => { clearTimeout(timer); left = Math.max(800, left - (Date.now() - started)); };
    el.addEventListener('pointerenter', pause); el.addEventListener('pointerleave', run);
    const vis = () => { if (!el.isConnected) return document.removeEventListener('visibilitychange', vis); document.hidden ? pause() : run(); };
    document.addEventListener('visibilitychange', vis);
    run();
  };
  CS.busy = function (text) {
    const el = $('#busy'); $('#busyText').textContent = text || 'Working…'; $('#busyBar').style.width = '0%'; el.classList.add('on');
    return { progress(p, t) { $('#busyBar').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; if (t) $('#busyText').textContent = t; }, done() { el.classList.remove('on'); } };
  };

  // images: shrink a picture file and return bytes
  CS.prepareImage = async function (file, max = 1600) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be read.')); i.src = url; });
      const keepPng = /png|gif|webp/.test(file.type) && file.size < 400000;
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * r), h = Math.round(img.height * r);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d');
      if (!keepPng) { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); }
      cx.drawImage(img, 0, 0, w, h);
      const type = keepPng ? 'image/png' : 'image/jpeg';
      const blob = await new Promise(res => cv.toBlob(res, type, 0.84));
      return { bytes: new Uint8Array(await blob.arrayBuffer()), type, ext: keepPng ? 'png' : 'jpg', w, h };
    } finally { URL.revokeObjectURL(url); }
  };
  // small 16:9 thumbnail as a data URL (kept in the course list)
  CS.thumbFrom = async function (src) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const W = 640, H = 360, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d');
    const r = Math.max(W / img.width, H / img.height); cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H);
    cx.drawImage(img, (W - img.width * r) / 2, (H - img.height * r) / 2, img.width * r, img.height * r);
    for (let q = 0.8; q > 0.3; q -= 0.1) { const d = cv.toDataURL('image/jpeg', q); if (d.length < 42000) return d; }
    return cv.toDataURL('image/jpeg', 0.3);
  };

  /* ======================= storage ======================= */
  // Same interface for both: list, saveMeta, putBlob, getBlob, remove, verify, log
  function idb() {
    if (idb.p) return idb.p;
    idb.p = new Promise((res, rej) => {
      const r = indexedDB.open('course-studio', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'id' }); r.result.createObjectStore('blobs'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return idb.p;
  }
  async function tx(store, mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => { const t = db.transaction(store, mode); const s = t.objectStore(store); let out; Promise.resolve(fn(s)).then(v => (out = v)); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); });
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const LocalStore = {
    remote: false,
    async list() { return tx('meta', 'readonly', s => req(s.getAll())); },
    async saveMeta(meta) { await tx('meta', 'readwrite', s => s.put(meta)); return this.list(); },
    async putBlob(id, name, bytes, v, onp) { await tx('blobs', 'readwrite', s => s.put(bytes, `${id}|${name}|v${v}`)); onp && onp(1); return { v, parts: 1, size: bytes.byteLength }; },
    async getBlob(id, name, v, parts, onp) { const b = await tx('blobs', 'readonly', s => req(s.get(`${id}|${name}|v${v}`))); onp && onp(1); if (!b) throw new Error('This file is missing from this browser.'); return new Uint8Array(b); },
    async dropOld(id, name, keepV) { const db = await idb(); return new Promise(res => { const t = db.transaction('blobs', 'readwrite'), s = t.objectStore('blobs'); const r = s.openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return; const k = String(c.key); if (k.startsWith(id + '|' + name + '|') && k !== `${id}|${name}|v${keepV}`) c.delete(); c.continue(); }; t.oncomplete = res; }); },
    async remove(id) { await tx('meta', 'readwrite', s => s.delete(id)); const db = await idb(); await new Promise(res => { const t = db.transaction('blobs', 'readwrite'), s = t.objectStore('blobs'); const r = s.openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return; if (String(c.key).startsWith(id + '|')) c.delete(); c.continue(); }; t.oncomplete = res; }); return this.list(); },
    async verify() { return true; },
    async log() { return []; },
  };

  const CHUNK = 3 * 1024 * 1024;
  const b64 = bytes => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(fr.error); fr.readAsDataURL(new Blob([bytes])); });
  const unb64 = async s => new Uint8Array(await (await fetch('data:application/octet-stream;base64,' + s)).arrayBuffer());
  async function call(method, payload, query) {
    let res, url = API;
    if (method === 'GET') url += (API.includes('?') ? '&' : '?') + new URLSearchParams(Object.assign({ t: Date.now() }, query)).toString();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(url, method === 'GET' ? {} : { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
        break;
      } catch (e) { if (attempt === 2) throw new Error('Could not reach your Google Sheet. Check the internet connection and try again.'); await new Promise(r => setTimeout(r, 800 * (attempt + 1))); }
    }
    let data; try { data = await res.json(); } catch (e) { throw new Error('The Google Sheet sent an unexpected reply. Check the Web app is deployed with access set to "Anyone".'); }
    if (!data.ok) { const err = new Error(data.error || 'Something went wrong.'); err.data = data; throw err; }
    return data;
  }
  async function pool(n, count, fn) { let next = 0; await Promise.all(Array.from({ length: Math.min(n, count) }, async () => { while (next < count) { const i = next++; await fn(i); } })); }

  const RemoteStore = {
    remote: true,
    async list() { return (await call('GET', null, { action: 'list' })).courses; },
    async saveMeta(meta) { return (await call('POST', { action: 'saveMeta', pin: pin(), who: who(), course: meta })).courses; },
    async putBlob(id, name, bytes, v, onp) {
      const parts = Math.max(1, Math.ceil(bytes.byteLength / CHUNK)); let done = 0;
      await pool(3, parts, async i => {
        const data = await b64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK));
        await call('POST', { action: 'chunk', pin: pin(), id, name, v, i, data });
        done++; onp && onp(done / parts);
      });
      return { v, parts, size: bytes.byteLength };
    },
    async getBlob(id, name, v, parts, onp) {
      const out = new Array(parts); let done = 0;
      await pool(4, parts, async i => { const d = await call('GET', null, { action: 'chunk', id, name, v, i }); out[i] = await unb64(d.data); done++; onp && onp(done / parts); });
      const size = out.reduce((a, b) => a + b.byteLength, 0), all = new Uint8Array(size); let o = 0; out.forEach(b => { all.set(b, o); o += b.byteLength; });
      return all;
    },
    async dropOld() { /* the server removes old versions when the course is saved */ },
    async remove(id) { return (await call('POST', { action: 'delete', pin: pin(), who: who(), id })).courses; },
    async verify(p, w) { await call('POST', { action: 'verify', pin: p, who: w }); return true; },
    async log() { return (await call('POST', { action: 'log', pin: pin(), who: who() })).log; },
  };
  const pin = () => (S.editor && S.editor.pin) || '';
  const who = () => (S.editor && S.editor.name) || (API ? 'Editor' : '');
  CS.store = API ? RemoteStore : LocalStore;

  // cached blob download (Cache Storage), so big packages only download once
  const BLOBS = 'cs-blobs-v1';
  CS.getBlob = async function (meta, name, info, onp) {
    info = info || (meta.blobs || {})[name];
    if (!info) throw new Error('This course has no ' + name + ' file yet.');
    const key = new URL(`__blob/${encodeURIComponent(meta.id)}/${encodeURIComponent(name)}/v${info.v}`, SITE).href;
    let cache = null; try { cache = await caches.open(BLOBS); const hit = await cache.match(key); if (hit) { onp && onp(1); return new Uint8Array(await hit.arrayBuffer()); } } catch (e) {}
    const bytes = await CS.store.getBlob(meta.id, name, info.v, info.parts || 1, onp);
    if (cache && CS.store.remote) try { await cache.put(key, new Response(bytes)); } catch (e) {}
    return bytes;
  };
  CS.putBlob = async function (meta, name, bytes, v, onp) {
    const info = await CS.store.putBlob(meta.id, name, bytes, v, onp);
    try { const cache = await caches.open(BLOBS); await cache.put(new URL(`__blob/${encodeURIComponent(meta.id)}/${encodeURIComponent(name)}/v${v}`, SITE).href, new Response(bytes)); } catch (e) {}
    return info;
  };

  /* ======================= state ======================= */
  const S = CS.S = { courses: ls.get('cs.cache') || [], editor: ss.get('cs.editor'), filter: 'all', q: '', view: null };
  CS.canEdit = () => !API || !!S.editor;
  CS.who = who;
  CS.saveMeta = async function (meta) {
    meta.updated = new Date().toISOString(); meta.updatedBy = who();
    if (!meta.created) meta.created = meta.updated;
    const list = await CS.store.saveMeta(meta);
    S.courses = list; ls.set('cs.cache', list);
    for (const n in meta.blobs || {}) if (!/^asset-/.test(n)) CS.store.dropOld(meta.id, n, meta.blobs[n].v);
    return meta;
  };
  async function refresh() {
    try { S.courses = await CS.store.list(); ls.set('cs.cache', S.courses); }
    catch (e) { if (!S.courses.length) CS.toast(e.message, 'bad'); }
  }

  /* ======================= service worker / vfs ======================= */
  const VFS = 'cs-vfs-v1';
  CS.swReady = (async () => {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return false;
    try {
      await navigator.serviceWorker.register(new URL('sw.js', SITE).href, { scope: SITE.pathname });
      await navigator.serviceWorker.ready;
      return true;
    } catch (e) { console.warn(e); return false; }
  })();
  const mounted = new Set();
  CS.mount = async function (key, files, onp) {
    if (!(await CS.swReady)) throw new Error('Preview needs the studio to be opened from its web address (https://…), not as a file.');
    const base = new URL('vfs/' + key + '/', SITE).href;
    const cache = await caches.open(VFS);
    const marker = base + '__mounted';
    if (mounted.has(key) || (key.indexOf('p-') !== 0 && await cache.match(marker))) { mounted.add(key); return base; }
    // tidy up older previews
    const keys = await cache.keys();
    const prefix = key.split('~')[0];
    await Promise.all(keys.filter(r => { const m = r.url.match(/\/vfs\/([^/]+)\//); return m && m[1] !== key && (m[1].split('~')[0] === prefix || m[1].indexOf('p-') === 0); }).map(r => cache.delete(r)));
    let done = 0;
    await pool(16, files.length, async i => {
      const f = files[i];
      const body = f.data instanceof Blob ? f.data : new Blob([f.data], { type: f.type });
      await cache.put(base + f.path.split('/').map(encodeURIComponent).join('/'), new Response(body, { headers: { 'Content-Type': f.type || CS.mime(f.path) } }));
      done++; if (onp && done % 20 === 0) onp(done / files.length);
    });
    await cache.put(marker, new Response('1'));
    mounted.add(key);
    return base;
  };
  const MIME = { html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', xml: 'text/xml', txt: 'text/plain', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject', pdf: 'application/pdf', vtt: 'text/vtt', swf: 'application/x-shockwave-flash' };
  CS.mime = p => MIME[(String(p).split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
  CS.isText = p => /\.(html?|js|mjs|css|json|xml|txt|md|svg|vtt|csv|xsd|ini)$/i.test(p);

  /* ======================= reading courses ======================= */
  CS.loadSource = async function (meta, onp) {
    const bytes = await CS.getBlob(meta, 'source', null, onp);
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  const assetUrls = new Map();
  CS.assetBlob = async function (meta, course, hash) {
    const a = (course.assets || {})[hash]; if (!a) return null;
    const bytes = await CS.getBlob(meta, 'asset-' + hash, { v: 1, parts: a.parts || 1 });
    return new Blob([bytes], { type: a.type || 'image/jpeg' });
  };
  CS.assetUrl = async function (meta, course, hash) {
    const k = meta.id + '|' + hash;
    if (!assetUrls.has(k)) assetUrls.set(k, CS.assetBlob(meta, course, hash).then(b => b ? URL.createObjectURL(b) : ''));
    return assetUrls.get(k);
  };
  CS.rememberAssetUrl = (meta, hash, url) => assetUrls.set(meta.id + '|' + hash, Promise.resolve(url));

  // all files of a course as [{path, data, type}] + where it starts
  CS.courseFiles = async function (meta, onp) {
    if (meta.kind === 'authored') {
      const course = await CS.loadSource(meta);
      const files = await CS.buildPackage(course, h => CS.assetBlob(meta, course, h));
      return { files, launch: 'index.html', activityId: CS.activityIdFor(course), course, generated: true };
    }
    const bytes = await CS.getBlob(meta, 'package', null, onp);
    const zip = await JSZip.loadAsync(bytes);
    const files = [];
    zip.forEach((path, f) => { if (!f.dir) files.push({ path, zipObj: f, size: f._data && f._data.uncompressedSize || 0 }); });
    const tc = await readTincan(zip);
    return { files, zip, bytes, launch: tc.launch, activityId: tc.id, tincan: tc };
  };
  async function readTincan(zip) {
    const f = zip.file('tincan.xml');
    if (!f) return {};
    const text = await f.async('string');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const acts = $$('*', doc).filter(e => e.localName === 'activity');
    const kid = (a, n) => { const k = Array.from(a.children).find(c => c.localName === n); return k ? k.textContent.replace(/​/g, '').trim() : ''; };
    const main = acts.find(a => kid(a, 'launch')) || acts[0];
    if (!main) return { text };
    return { text, id: main.getAttribute('id'), type: main.getAttribute('type'), name: kid(main, 'name'), description: kid(main, 'description'), launch: kid(main, 'launch'),
      children: acts.filter(a => a !== main).map(a => ({ id: a.getAttribute('id'), type: a.getAttribute('type'), name: kid(a, 'name') })) };
  }
  CS.readTincan = readTincan;

  /* ======================= dialogs ======================= */
  CS.openDlg = d => { if (!d.open) { d.classList.remove('closing'); d.showModal(); } };
  // instant = closed with the keyboard (Escape): keyboard actions never animate
  CS.closeDlg = (d, instant) => new Promise(res => {
    if (!d.open) return res();
    if (reduce || instant) { d.classList.remove('closing'); d.close(); return res(); }
    d.classList.add('closing'); setTimeout(() => { d.classList.remove('closing'); d.close(); res(); }, matchMedia('(max-width:640px)').matches ? 200 : 150);
  });
  document.addEventListener('click', e => {
    const d = e.target.closest('dialog'); if (!d || d.classList.contains('full')) return;
    if (e.target === d || e.target.closest('[data-close]')) { e.preventDefault(); CS.closeDlg(d); }
  });
  document.addEventListener('cancel', e => { if (e.target.tagName === 'DIALOG' && !e.target.classList.contains('full')) { e.preventDefault(); CS.closeDlg(e.target, true); } }, true);
  CS.confirm = function (title, text, okLabel, danger) {
    return new Promise(res => {
      const d = $('#confirmDlg');
      $('#cfTitle').textContent = title; $('#cfText').textContent = text;
      const ok = $('#cfOk'); ok.textContent = okLabel || 'OK'; ok.className = 'btn ' + (danger ? 'danger-fill' : 'primary');
      const done = v => { ok.onclick = null; d.onclose = null; CS.closeDlg(d); res(v); };
      ok.onclick = () => done(true); d.onclose = () => res(false);
      CS.openDlg(d); setTimeout(() => ok.focus(), 50);
    });
  };

  /* ======================= router ======================= */
  CS.go = function (params, replace) {
    const u = new URL(SITE.href);
    Object.entries(params || {}).forEach(([k, v]) => v != null && v !== '' && u.searchParams.set(k, v));
    history[replace ? 'replaceState' : 'pushState'](null, '', u.pathname + u.search);
    route();
  };
  addEventListener('popstate', () => route());
  let routeToken = 0;
  async function route() {
    const p = new URLSearchParams(location.search), token = ++routeToken;
    if (CS.Editor && CS.Editor.isOpen() && !p.get('edit')) { const ok = await CS.Editor.close(); if (!ok) { history.pushState(null, '', '?edit=' + CS.Editor.currentId()); return; } }
    document.body.dataset.view = p.get('edit') ? 'editor' : p.get('course') ? 'course' : 'library';
    window.scrollTo(0, 0);
    if (p.get('edit')) {
      const meta = S.courses.find(c => c.id === p.get('edit'));
      if (!meta) { CS.toast('That course could not be found.', 'bad'); return CS.go({}, true); }
      if (!CS.canEdit()) { CS.toast('Unlock editing first.', 'bad'); return CS.go({ course: meta.id }, true); }
      return CS.Editor.open(meta);
    }
    if (p.get('course')) return renderCourse(p.get('course'), p.get('tab') || 'overview', token);
    renderLibrary();
  }

  /* ======================= header / edit mode ======================= */
  function paintHeader() {
    document.body.classList.toggle('can-edit', CS.canEdit());
    $('#unlockBtn').hidden = CS.canEdit();
    $('#whoPill').hidden = !(API && S.editor);
    if (S.editor) $('#whoName').textContent = S.editor.name;
    $('#localNote').hidden = !!API;
  }
  $('#unlockBtn').addEventListener('click', () => { $('#pinErr').textContent = ''; $('#pinName').value = ls.get('cs.name') || ''; CS.openDlg($('#pinDlg')); setTimeout(() => ($('#pinName').value ? $('#pinCode') : $('#pinName')).focus(), 60); });
  $('#lockBtn').addEventListener('click', () => { S.editor = null; ss.set('cs.editor', null); paintHeader(); route(); CS.toast('Editing locked'); });
  $('#pinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#pinName').value.trim(), code = $('#pinCode').value;
    if (!name || !code) { $('#pinErr').textContent = 'Enter your name and the PIN.'; return; }
    const b = $('#pinGo'); b.disabled = true; b.textContent = 'Checking…';
    try {
      await CS.store.verify(code, name);
      S.editor = { name, pin: code }; ss.set('cs.editor', S.editor); ls.set('cs.name', name);
      $('#pinCode').value = ''; await CS.closeDlg($('#pinDlg')); paintHeader(); route(); CS.toast('Editing unlocked. Hi ' + name + '!');
    } catch (err) { $('#pinErr').textContent = err.message; const f = $('#pinForm'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }
    finally { b.disabled = false; b.textContent = 'Unlock'; }
  });
  $('#histBtn').addEventListener('click', async () => {
    const box = $('#histList'); box.innerHTML = '<li class="muted">Loading…</li>'; CS.openDlg($('#histDlg'));
    try { const log = await CS.store.log(); box.innerHTML = log.length ? log.map((h, i) => `<li style="--i:${i}"><span class="av">${esc(String(h.who || '?').charAt(0).toUpperCase())}</span><div><b>${esc(h.who)}</b> ${esc(String(h.action).toLowerCase())} <b>${esc(h.title || h.id)}</b><small>${esc(CS.ago(h.time))}</small></div></li>`).join('') : '<li class="muted">No changes yet.</li>'; }
    catch (err) { box.innerHTML = `<li class="bad">${esc(err.message)}</li>`; }
  });
  $('#brand').addEventListener('click', e => { e.preventDefault(); CS.go({}); });

  /* ======================= library ======================= */
  const ICONS = { built: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>', zip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>' };
  function renderLibrary() {
    paintHeader();
    const all = S.courses.slice().sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    const words = S.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = all.filter(c => S.filter === 'all' || (S.filter === 'authored' ? c.kind === 'authored' : c.kind === 'package'))
      .filter(c => !words.length || words.every(w => [c.title, c.description, c.category, c.id, c.author].join(' ').toLowerCase().includes(w)));
    const count = k => all.filter(c => k === 'all' || c.kind === k).length;
    const v = $('#view');
    v.innerHTML = `
      <section class="hero">
        <div class="hero-in">
          <span class="eyebrow"><i></i>xAPI authoring studio</span>
          <h1 class="split">Build courses.<br><span>Share the code.</span></h1>
          <p class="lede">Create Rise-style courses with drag-and-drop blocks, upload xAPI packages you already have, and let anyone open the files, read the code and download the zip.</p>
          <div class="hero-cta">
            <button class="btn primary big" data-act="new"><svg><use href="#i-plus"/></svg>New course</button>
            <label class="btn big"><svg><use href="#i-upload"/></svg>Upload xAPI zip<input type="file" accept=".zip,application/zip" hidden data-act="upload"></label>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="ha-card c1"><span class="ha-img"></span><span class="ha-l w70"></span><span class="ha-l w40"></span></div>
          <div class="ha-card c2"><span class="ha-code"><b>&lt;activity</b> id=<em>"…/course"</em><b>&gt;</b><br>&nbsp;&nbsp;<b>&lt;launch&gt;</b>index.html<b>&lt;/launch&gt;</b><br><b>&lt;/activity&gt;</b></span></div>
          <div class="ha-card c3"><span class="ha-q"></span><span class="ha-opt on"></span><span class="ha-opt"></span><span class="ha-opt"></span></div>
        </div>
      </section>
      <section class="wrap">
        <div class="tools">
          <div class="chips">
            ${[['all', 'All courses'], ['authored', 'Built in Studio'], ['package', 'Uploaded packages']].map(([k, l]) => `<button class="chip" aria-pressed="${S.filter === k}" data-filter="${k}">${l} <small>${count(k)}</small></button>`).join('')}
          </div>
          <label class="search"><svg><use href="#i-search"/></svg><input id="q" type="search" placeholder="Search courses" value="${esc(S.q)}" aria-label="Search courses"></label>
        </div>
        <div class="grid" id="grid">
          ${list.map(cardHtml).join('')}
          ${CS.canEdit() ? `<button class="card add" data-act="new"><span class="plus"><svg><use href="#i-plus"/></svg></span><b>New course</b><small>Start from blank or a sample</small></button>` : ''}
          ${!list.length && !CS.canEdit() ? `<div class="empty"><h3>No courses yet</h3><p>Unlock editing to create the first one.</p></div>` : ''}
        </div>
      </section>`;
    $$('.card[data-id]', v).forEach((c, i) => { c.style.setProperty('--d', Math.min(i, 8) * 40 + 'ms'); });
    requestAnimationFrame(() => $$('.card', v).forEach(c => c.classList.add('in')));
    const q = $('#q'); q.addEventListener('input', () => { S.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { const pos = q.selectionStart; renderLibrary(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }, 160); });
  }
  function cardHtml(c) {
    const lessons = c.kind === 'authored' && c.lessonCount != null ? `${c.lessonCount} lesson${c.lessonCount == 1 ? '' : 's'}` : c.fileCount ? `${c.fileCount} files` : '';
    return `<article class="card" data-id="${esc(c.id)}">
      <button class="hit" data-open="${esc(c.id)}" aria-label="Open ${esc(c.title)}"></button>
      <div class="thumb" style="--hue:${hue(c.id)}">${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="" loading="lazy">` : `<span class="mono">${esc(initials(c.title))}</span>`}
        <span class="kind ${c.kind}">${c.kind === 'authored' ? ICONS.built + 'Built in Studio' : ICONS.zip + 'Uploaded'}</span>
        ${c.status === 'Draft' ? '<span class="draft">Draft</span>' : ''}
      </div>
      <div class="body">
        ${c.category ? `<span class="cat">${esc(c.category)}</span>` : ''}
        <h3>${esc(c.title)}</h3>
        ${c.description ? `<p>${esc(c.description)}</p>` : ''}
        <div class="meta"><span>xAPI</span>${lessons ? `<span>${lessons}</span>` : ''}${c.size ? `<span>${CS.fmtBytes(c.size)}</span>` : ''}<span title="${esc(CS.fmtDate(c.updated))}">${esc(CS.ago(c.updated))}</span></div>
      </div>
    </article>`;
  }
  const hue = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = t => String(t || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  CS.hue = hue; CS.initials = initials;

  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) { CS.go({ course: o.dataset.open }); return; }
    const f = e.target.closest('[data-filter]'); if (f) { S.filter = f.dataset.filter; renderLibrary(); return; }
    const a = e.target.closest('[data-act="new"]'); if (a) { if (!CS.canEdit()) { $('#unlockBtn').click(); return; } newCourse(); return; }
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-act="upload"]')) { const f = e.target.files[0]; e.target.value = ''; if (!CS.canEdit()) { $('#unlockBtn').click(); return; } if (f) uploadZip(f); }
  });

  /* ======================= new course ======================= */
  function newCourse() {
    const d = $('#newDlg'); $('#newTitle').value = ''; $('#newErr').textContent = '';
    $$('input[name=tpl]', d)[0].checked = true;
    CS.openDlg(d); setTimeout(() => $('#newTitle').focus(), 60);
  }
  $('#newForm').addEventListener('submit', async e => {
    e.preventDefault();
    const title = $('#newTitle').value.trim();
    if (!title) { $('#newErr').textContent = 'Give your course a title.'; return; }
    const tpl = $('input[name=tpl]:checked').value;
    let id = CS.slug(title); if (S.courses.some(c => c.id === id)) id += '-' + CS.uid(4);
    const course = CS.Editor.template(tpl, id, title);
    const b = $('#newGo'); b.disabled = true;
    try {
      const meta = { id, title, description: course.description, category: '', kind: 'authored', status: 'Draft', author: who(), lessonCount: course.lessons.length, blobs: {}, size: 0, thumbnail: '' };
      const bytes = new TextEncoder().encode(JSON.stringify(course));
      meta.blobs.source = await CS.putBlob(meta, 'source', bytes, 1);
      await CS.saveMeta(meta);
      await CS.closeDlg($('#newDlg'));
      CS.go({ edit: id });
    } catch (err) { $('#newErr').textContent = err.message; } finally { b.disabled = false; }
  });

  /* ======================= upload xAPI zip ======================= */
  async function uploadZip(file) {
    const bz = CS.busy('Reading ' + file.name + '…');
    try {
      let zip = await JSZip.loadAsync(file);
      const paths = []; zip.forEach((p, f) => { if (!f.dir && !/^__MACOSX\//.test(p)) paths.push(p); });
      const tc = paths.filter(p => /(^|\/)tincan\.xml$/i.test(p)).sort((a, b) => a.length - b.length)[0];
      if (!tc) {
        bz.done();
        const scorm = paths.some(p => /imsmanifest\.xml$/i.test(p)), cmi5 = paths.some(p => /cmi5\.xml$/i.test(p));
        CS.toast(scorm ? 'This is a SCORM package. Course Studio stores xAPI (Tin Can) packages — re-export it as xAPI.' : cmi5 ? 'This is a cmi5 package. Re-export it as xAPI (Tin Can).' : 'No tincan.xml found, so this is not an xAPI package.', 'bad');
        return;
      }
      const prefix = tc.slice(0, tc.length - 'tincan.xml'.length);
      let bytes;
      if (prefix || paths.length !== Object.keys(zip.files).filter(k => !zip.files[k].dir).length) {
        bz.progress(0.05, 'Tidying the folder structure…');
        const nz = new JSZip();
        for (const p of paths) if (p.startsWith(prefix)) nz.file(p.slice(prefix.length), await zip.file(p).async('uint8array'));
        bytes = await nz.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }, m => bz.progress(0.05 + m.percent / 100 * 0.3));
        zip = await JSZip.loadAsync(bytes);
      } else bytes = new Uint8Array(await file.arrayBuffer());
      const t = await readTincan(zip);
      // a course exported from Course Studio can come back as an editable course
      const srcFile = zip.file('studio-source.json');
      if (srcFile) {
        bz.done();
        const editable = await CS.confirm('Keep editing this course?', 'This zip was made in Course Studio. Import it as an editable course (open it in the block editor), or keep it as an uploaded package?', 'Import as editable');
        if (editable) return importSource(zip, JSON.parse(await srcFile.async('string')));
        bz.progress(0, 'Uploading…'); $('#busy').classList.add('on');
      }
      let id = CS.slug(t.name || file.name.replace(/\.zip$/i, '')); if (S.courses.some(c => c.id === id)) id += '-' + CS.uid(4);
      const meta = { id, title: t.name || file.name.replace(/\.zip$/i, ''), description: t.description || '', category: '', kind: 'package', status: 'Published', author: who(), blobs: {}, size: bytes.byteLength, fileCount: Object.values(zip.files).filter(f => !f.dir).length, activityId: t.id || '', thumbnail: '' };
      // try to find a cover picture for the card
      meta.thumbnail = await guessThumb(zip).catch(() => '');
      bz.progress(0.35, 'Uploading ' + CS.fmtBytes(bytes.byteLength) + '…');
      meta.blobs.package = await CS.putBlob(meta, 'package', bytes, 1, p => bz.progress(0.35 + p * 0.6, 'Uploading… ' + Math.round(p * 100) + '%'));
      await CS.saveMeta(meta);
      bz.done(); CS.toast('Uploaded “' + meta.title + '”'); CS.confetti();
      CS.go({ course: id });
    } catch (err) { bz.done(); CS.toast(err.message || String(err), 'bad'); }
  }
  async function guessThumb(zip) {
    const imgs = Object.values(zip.files).filter(f => !f.dir && /\.(jpe?g|png|webp)$/i.test(f.name) && !/(icon|logo|sprite|favicon|button|bg-)/i.test(f.name));
    let best = null;
    for (const f of imgs.slice(0, 80)) { const sz = f._data && f._data.uncompressedSize || 0; if (sz > 30000 && sz < 3000000 && (!best || sz > best.sz)) best = { f, sz }; }
    if (!best) return '';
    const blob = new Blob([await best.f.async('uint8array')], { type: CS.mime(best.f.name) });
    const u = URL.createObjectURL(blob); try { return await CS.thumbFrom(u); } finally { URL.revokeObjectURL(u); }
  }
  async function importSource(zip, course) {
    const bz = CS.busy('Importing the course…');
    try {
      let id = course.id || CS.slug(course.title); if (S.courses.some(c => c.id === id)) id = CS.slug(course.title) + '-' + CS.uid(4);
      course.id = id; delete course.activityId;
      const meta = { id, title: course.title, description: course.description || '', category: course.category || '', kind: 'authored', status: 'Draft', author: course.author || who(), lessonCount: (course.lessons || []).length, blobs: {}, thumbnail: '' };
      const hashes = Object.keys(course.assets || {}); let n = 0;
      for (const h of hashes) {
        const a = course.assets[h], f = zip.file('assets/' + h + '.' + (a.ext || 'jpg'));
        if (!f) continue;
        const bytes = await f.async('uint8array');
        const info = await CS.putBlob(meta, 'asset-' + h, bytes, 1);
        a.parts = info.parts; a.size = info.size;
        bz.progress(++n / (hashes.length + 1) * 0.9, 'Uploading pictures ' + n + ' of ' + hashes.length + '…');
      }
      if (course.theme && /^asset:/.test(course.theme.cover || '')) { const h = course.theme.cover.slice(6), f = zip.file('assets/' + h + '.' + ((course.assets[h] || {}).ext || 'jpg')); if (f) { const u = URL.createObjectURL(new Blob([await f.async('uint8array')])); meta.thumbnail = await CS.thumbFrom(u).catch(() => ''); URL.revokeObjectURL(u); } }
      meta.blobs.source = await CS.putBlob(meta, 'source', new TextEncoder().encode(JSON.stringify(course)), 1);
      await CS.saveMeta(meta); bz.done(); CS.toast('Imported. You can edit it now.');
      CS.go({ edit: id });
    } catch (err) { bz.done(); CS.toast(err.message, 'bad'); }
  }

  /* ======================= course page ======================= */
  let page = null; // { meta, data(promise), cm, dirty }
  async function renderCourse(id, tab, token) {
    paintHeader();
    const meta = S.courses.find(c => c.id === id);
    const v = $('#view');
    if (!meta) { v.innerHTML = `<section class="wrap"><div class="empty big"><h3>Course not found</h3><p>It may have been removed. <a href="./" data-home>Back to all courses</a></p></div></section>`; return; }
    if (!page || page.meta.id !== id || page.meta.updated !== meta.updated) page = { meta, data: null, dirty: {} };
    const tabs = [['overview', 'Overview'], ['files', 'Files & code'], ['xapi', 'xAPI']];
    v.innerHTML = `
      <section class="c-hero" style="--hue:${hue(meta.id)}">
        <div class="c-bg">${meta.thumbnail ? `<img src="${esc(meta.thumbnail)}" alt="">` : ''}</div>
        <div class="wrap c-in">
          <button class="back" data-home><svg><use href="#i-left"/></svg>All courses</button>
          <div class="c-tags"><span class="tag">${meta.kind === 'authored' ? 'Built in Studio' : 'Uploaded package'}</span><span class="tag">xAPI</span>${meta.category ? `<span class="tag">${esc(meta.category)}</span>` : ''}${meta.status === 'Draft' ? '<span class="tag warn">Draft</span>' : ''}</div>
          <h1>${esc(meta.title)}</h1>
          ${meta.description ? `<p class="c-desc">${esc(meta.description)}</p>` : ''}
          <p class="c-by">${meta.author ? 'By ' + esc(meta.author) + ' · ' : ''}Updated ${esc(CS.ago(meta.updated))}${meta.updatedBy ? ' by ' + esc(meta.updatedBy) : ''}${meta.size ? ' · ' + CS.fmtBytes(meta.size) : ''}</p>
          <div class="c-actions">
            <button class="btn primary big" data-c="preview"><svg><use href="#i-play"/></svg>Preview</button>
            ${CS.canEdit() ? (meta.kind === 'authored' ? `<button class="btn big" data-c="edit"><svg><use href="#i-edit"/></svg>Edit course</button>` : `<button class="btn big" data-c="code"><svg><use href="#i-code"/></svg>Edit code</button>`) : ''}
            <button class="btn big" data-c="zip"><svg><use href="#i-download"/></svg>Download xAPI zip</button>
            <button class="btn big" data-c="share"><svg><use href="#i-share"/></svg>Share</button>
            ${CS.canEdit() ? `<div class="more"><button class="btn big icon" data-c="more" aria-label="More actions" aria-expanded="false"><svg><use href="#i-dots"/></svg></button>
              <div class="menu" role="menu">
                ${meta.kind === 'package' ? '<button data-c="details" role="menuitem"><svg><use href="#i-edit"/></svg>Edit details</button>' : ''}
                <button data-c="status" role="menuitem"><svg><use href="#i-eye"/></svg>${meta.status === 'Draft' ? 'Mark as published' : 'Mark as draft'}</button>
                ${meta.kind === 'authored' ? '<button data-c="dup" role="menuitem"><svg><use href="#i-copy"/></svg>Duplicate</button>' : ''}
                <button data-c="delete" role="menuitem" class="danger"><svg><use href="#i-trash"/></svg>Delete course</button>
              </div></div>` : ''}
          </div>
        </div>
      </section>
      <section class="wrap">
        <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-tab="${k}">${l}</button>`).join('')}<i class="ink"></i></nav>
        <div id="tabBody" class="tab-body"><div class="loading"><span class="spin"></span>Loading…</div></div>
      </section>`;
    moveInk();
    showTab(tab, token);
  }
  // underline moves with transform only (no width animation), so it stays on the GPU
  function moveInk() { const b = $('.tabs [aria-selected="true"]'), ink = $('.tabs .ink'); if (b && ink) ink.style.transform = `translateX(${b.offsetLeft}px) scaleX(${b.offsetWidth})`; }
  addEventListener('resize', moveInk);

  async function data(onp) {
    if (!page.data) page.data = CS.courseFiles(page.meta, onp).catch(e => { page.data = null; throw e; });
    return page.data;
  }
  async function showTab(tab, token) {
    const body = $('#tabBody'); if (!body) return;
    $$('.tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab)); moveInk();
    const u = new URL(location.href); u.searchParams.set('tab', tab); if (tab === 'overview') u.searchParams.delete('tab'); history.replaceState(null, '', u.pathname + u.search);
    const meta = page.meta;
    const needsDownload = meta.kind === 'package' && !page.data;
    body.innerHTML = `<div class="loading"><span class="spin"></span><span id="ldText">${needsDownload ? 'Downloading the course package…' : 'Loading…'}</span><span class="ld-bar"><i id="ldBar"></i></span></div>`;
    let d;
    try { d = await data(p => { const b = $('#ldBar'); if (b) b.style.width = Math.round(p * 100) + '%'; const t = $('#ldText'); if (t) t.textContent = 'Downloading the course package… ' + Math.round(p * 100) + '%'; }); }
    catch (err) { if (token === routeToken) body.innerHTML = `<div class="empty"><h3>Could not open this course</h3><p>${esc(err.message)}</p></div>`; return; }
    if (token !== routeToken || !$('#tabBody')) return;
    body.classList.remove('fade'); void body.offsetWidth; body.classList.add('fade');
    if (tab === 'files') return filesTab(body, d);
    if (tab === 'xapi') return xapiTab(body, d);
    return overviewTab(body, d);
  }

  function overviewTab(body, d) {
    const meta = page.meta;
    if (meta.kind === 'authored') {
      const c = d.course, qn = c.lessons.reduce((a, l) => a + l.blocks.filter(b => b.type === 'mcq').length, 0), bn = c.lessons.reduce((a, l) => a + l.blocks.length, 0);
      body.innerHTML = `<div class="ov">
        <div class="stats"><div><b>${c.lessons.length}</b><span>Lessons</span></div><div><b>${bn}</b><span>Blocks</span></div><div><b>${qn}</b><span>Questions</span></div><div><b>${esc((c.settings || {}).passMark || 80)}%</b><span>Pass mark</span></div></div>
        <h2 class="h2">Lessons</h2>
        <ol class="outline">${c.lessons.map((l, i) => `<li style="--i:${i}"><span class="n">${i + 1}</span><div><b>${esc(l.title || 'Lesson ' + (i + 1))}</b><small>${l.blocks.length} block${l.blocks.length === 1 ? '' : 's'}${l.blocks.some(b => b.type === 'mcq') ? ' · knowledge check' : ''}</small></div></li>`).join('')}</ol>
      </div>`;
    } else {
      const t = d.tincan || {};
      const big = d.files.slice().sort((a, b) => b.size - a.size).slice(0, 5);
      const byType = {}; d.files.forEach(f => { const e = (f.path.split('.').pop() || '').toLowerCase(); const g = /^(jpe?g|png|gif|webp|svg)$/.test(e) ? 'Images' : /^(mp4|webm|mp3|wav|m4a|ogg)$/.test(e) ? 'Audio & video' : /^(js|mjs)$/.test(e) ? 'JavaScript' : /^(html?|css)$/.test(e) ? 'HTML & CSS' : /^(woff2?|ttf|otf|eot)$/.test(e) ? 'Fonts' : 'Other'; byType[g] = (byType[g] || 0) + f.size; });
      const total = Object.values(byType).reduce((a, b) => a + b, 0) || 1;
      body.innerHTML = `<div class="ov">
        <div class="stats"><div><b>${d.files.length}</b><span>Files</span></div><div><b>${CS.fmtBytes(page.meta.size)}</b><span>Zip size</span></div><div><b>${esc(t.launch || '–')}</b><span>Launch file</span></div></div>
        <h2 class="h2">What's inside</h2>
        <div class="bars">${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, s], i) => `<div class="bar-row" style="--i:${i}"><span>${k}</span><span class="bar"><i style="--w:${Math.max(2, s / total * 100)}%"></i></span><b>${CS.fmtBytes(s)}</b></div>`).join('')}</div>
        <h2 class="h2">Largest files</h2>
        <ul class="biglist">${big.map(f => `<li><code>${esc(f.path)}</code><b>${CS.fmtBytes(f.size)}</b></li>`).join('')}</ul>
      </div>`;
    }
  }

  /* ---------- files & code ---------- */
  function tree(paths) {
    const root = { dirs: {}, files: [] };
    paths.forEach(f => { const parts = f.path.split('/'); let n = root; parts.slice(0, -1).forEach(p => { n = n.dirs[p] = n.dirs[p] || { dirs: {}, files: [] }; }); n.files.push(f); });
    return root;
  }
  function fileIcon(p) {
    const e = (p.split('.').pop() || '').toLowerCase();
    if (/^(jpe?g|png|gif|webp|svg|ico)$/.test(e)) return ['img', 'IMG'];
    if (/^(js|mjs)$/.test(e)) return ['js', 'JS'];
    if (/^json$/.test(e)) return ['json', '{ }'];
    if (/^html?$/.test(e)) return ['html', '&lt;/&gt;'];
    if (/^css$/.test(e)) return ['css', '#'];
    if (/^xml$/.test(e)) return ['xml', 'XML'];
    if (/^(mp4|webm|mp3|wav|m4a|ogg)$/.test(e)) return ['media', '▶'];
    if (/^(woff2?|ttf|otf|eot)$/.test(e)) return ['font', 'Aa'];
    return ['other', '•'];
  }
  function treeHtml(n, depth, launch) {
    const dirs = Object.keys(n.dirs).sort(), files = n.files.slice().sort((a, b) => a.path.localeCompare(b.path));
    return dirs.map(d => `<li class="dir${depth < 1 ? ' open' : ''}"><button class="t-dir" style="--d:${depth}"><svg><use href="#i-chev"/></svg><svg class="fold"><use href="#i-folder"/></svg>${esc(d)}<small>${countFiles(n.dirs[d])}</small></button><ul>${treeHtml(n.dirs[d], depth + 1, launch)}</ul></li>`).join('') +
      files.map(f => { const [cls, lab] = fileIcon(f.path), name = f.path.split('/').pop(); const badge = f.path === 'tincan.xml' ? '<em class="xb">xAPI</em>' : f.path === launch ? '<em class="lb">launch</em>' : ''; return `<li><button class="t-file" data-path="${esc(f.path)}" style="--d:${depth}"><span class="fi ${cls}">${lab}</span><span class="fn">${esc(name)}</span>${badge}${page.dirty[f.path] != null ? '<i class="dot" title="Changed"></i>' : ''}<small>${f.size != null ? CS.fmtBytes(f.size || (f.data && (f.data.size || f.data.length)) || 0) : ''}</small></button></li>`; }).join('');
  }
  const countFiles = n => n.files.length + Object.values(n.dirs).reduce((a, d) => a + countFiles(d), 0);

  function filesTab(body, d) {
    const meta = page.meta;
    const editable = meta.kind === 'package' && CS.canEdit();
    d.files.forEach(f => { if (f.size == null || (!f.size && f.data)) f.size = f.data ? (f.data.size != null ? f.data.size : new Blob([f.data]).size) : f.size; });
    body.innerHTML = `
      ${d.generated ? `<div class="note"><svg><use href="#i-info"/></svg><div>These files are <b>generated from the editor</b>. To change the course, use <b>Edit course</b>. To change the code by hand, download the zip, edit it, and upload it back as a package.</div></div>` : ''}
      <div class="ide">
        <aside class="ide-side">
          <label class="t-search"><svg><use href="#i-search"/></svg><input id="tq" placeholder="Find a file" aria-label="Find a file"></label>
          <ul class="tree" id="tree">${treeHtml(tree(d.files), 0, d.launch)}</ul>
        </aside>
        <div class="ide-main">
          <div class="ide-bar"><span class="ide-path" id="idePath">Choose a file</span>
            <div class="ide-acts">
              ${editable ? `<button class="btn sm" id="ideRevert" hidden>Undo changes</button><button class="btn sm primary" id="ideSave" hidden><svg><use href="#i-check"/></svg>Save <span id="dirtyN"></span></button>` : ''}
              <button class="btn sm" id="ideCopy" disabled><svg><use href="#i-copy"/></svg>Copy</button>
              <button class="btn sm" id="ideDl" disabled><svg><use href="#i-download"/></svg>File</button>
            </div></div>
          <div class="ide-view" id="ideView"><div class="ide-empty"><svg><use href="#i-code"/></svg><p>Pick a file on the left to read its code.<br><b>tincan.xml</b> is the xAPI manifest; <b>${esc(d.launch || 'index.html')}</b> is where the course starts.</p></div></div>
        </div>
      </div>`;
    const tq = $('#tq');
    tq.addEventListener('input', () => {
      const q = tq.value.trim().toLowerCase();
      $$('#tree .t-file').forEach(b => { b.parentNode.hidden = q && !b.dataset.path.toLowerCase().includes(q); });
      $$('#tree li.dir').forEach(li => { li.hidden = q && !$$('.t-file', li).some(b => !b.parentNode.hidden); if (q) li.classList.add('open'); });
    });
    $('#tree').addEventListener('click', e => {
      const dir = e.target.closest('.t-dir'); if (dir) { dir.parentNode.classList.toggle('open'); return; }
      const fb = e.target.closest('.t-file'); if (fb) openFile(fb.dataset.path, d, editable);
    });
    const first = d.files.find(f => f.path === 'tincan.xml');
    if (first) openFile(first.path, d, editable);
    if (editable) {
      $('#ideSave').addEventListener('click', () => saveCode(d));
      $('#ideRevert').addEventListener('click', async () => { if (await CS.confirm('Undo all code changes?', 'Changes you have not saved will be lost.', 'Undo changes', true)) { page.dirty = {}; filesTab(body, d); } });
      paintDirty();
    }
  }
  async function fileData(f) {
    if (page.dirty[f.path] != null) return page.dirty[f.path];
    if (f.zipObj) return CS.isText(f.path) ? f.zipObj.async('string') : f.zipObj.async('blob');
    if (typeof f.data === 'string') return f.data;
    return f.data;
  }
  async function openFile(path, d, editable) {
    const f = d.files.find(x => x.path === path); if (!f) return;
    $$('#tree .t-file').forEach(b => b.classList.toggle('on', b.dataset.path === path));
    let li = $(`#tree .t-file[data-path="${CSS.escape(path)}"]`); while (li && (li = li.parentNode.closest('li.dir'))) li.classList.add('open');
    $('#idePath').innerHTML = esc(path) + (path === 'tincan.xml' ? ' <em class="xb">xAPI manifest</em>' : path === d.launch ? ' <em class="lb">launch file</em>' : '');
    const view = $('#ideView'); view.innerHTML = '<div class="ide-empty"><span class="spin"></span></div>';
    const content = await fileData(f);
    const dl = $('#ideDl'), cp = $('#ideCopy');
    dl.disabled = false; dl.onclick = () => CS.download(typeof content === 'string' ? new Blob([content], { type: CS.mime(path) }) : content, path.split('/').pop());
    page.cm = null;
    if (typeof content === 'string') {
      if (content.length > 2500000) { view.innerHTML = `<div class="ide-empty"><p>This file is ${CS.fmtBytes(content.length)}, too big to show here. Download it to read it.</p></div>`; cp.disabled = true; return; }
      cp.disabled = false; cp.onclick = () => copyText(page.cm ? page.cm.getValue() : content, cp);
      view.innerHTML = '';
      const ext = path.split('.').pop().toLowerCase();
      const mode = { html: 'htmlmixed', htm: 'htmlmixed', js: 'javascript', mjs: 'javascript', json: { name: 'javascript', json: true }, css: 'css', xml: 'xml', svg: 'xml', xsd: 'xml' }[ext] || null;
      const long = content.length > 400000 || content.split('\n', 3).some(l => l.length > 5000);
      const cm = CodeMirror(view, { value: content, mode: long ? null : mode, lineNumbers: true, readOnly: !editable, lineWrapping: long, tabSize: 2, viewportMargin: 30 });
      page.cm = cm;
      if (editable) cm.on('change', () => { page.dirty[path] = cm.getValue(); paintDirty(); });
      setTimeout(() => cm.refresh(), 30);
    } else {
      cp.disabled = true;
      const type = CS.mime(path), url = URL.createObjectURL(content instanceof Blob ? new Blob([content], { type }) : new Blob([content], { type }));
      if (/^image\//.test(type)) view.innerHTML = `<div class="ide-media"><img src="${url}" alt=""><small>${CS.fmtBytes(content.size)}</small></div>`;
      else if (/^video\//.test(type)) view.innerHTML = `<div class="ide-media"><video src="${url}" controls></video><small>${CS.fmtBytes(content.size)}</small></div>`;
      else if (/^audio\//.test(type)) view.innerHTML = `<div class="ide-media"><audio src="${url}" controls></audio><small>${CS.fmtBytes(content.size)}</small></div>`;
      else view.innerHTML = `<div class="ide-empty"><p><b>${esc(path.split('/').pop())}</b> is a ${esc(type)} file (${CS.fmtBytes(content.size)}). Use <b>File</b> to download it.</p></div>`;
    }
  }
  function paintDirty() {
    const n = Object.keys(page.dirty).length, s = $('#ideSave'), r = $('#ideRevert');
    if (!s) return; s.hidden = !n; r.hidden = !n; $('#dirtyN').textContent = n ? `(${n} file${n > 1 ? 's' : ''})` : '';
    $$('#tree .t-file').forEach(b => { const has = page.dirty[b.dataset.path] != null; let dot = $('.dot', b); if (has && !dot) { dot = document.createElement('i'); dot.className = 'dot'; b.insertBefore(dot, $('small', b)); } if (!has && dot) dot.remove(); });
  }
  async function saveCode(d) {
    const bz = CS.busy('Packing your changes…');
    try {
      Object.entries(page.dirty).forEach(([p, text]) => d.zip.file(p, text));
      const bytes = await d.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }, m => bz.progress(m.percent / 100 * 0.3));
      const meta = Object.assign({}, page.meta, { blobs: Object.assign({}, page.meta.blobs) });
      const v = (meta.blobs.package.v || 1) + 1;
      meta.blobs.package = await CS.putBlob(meta, 'package', bytes, v, p => bz.progress(0.3 + p * 0.65, 'Saving… ' + Math.round(p * 100) + '%'));
      meta.size = bytes.byteLength;
      const t = await readTincan(d.zip); if (t.id) meta.activityId = t.id;
      await CS.saveMeta(meta);
      page.dirty = {}; page.meta = meta; page.data = null; bz.done(); CS.toast('Code saved. A new version of the package is stored.');
      CS.go({ course: meta.id, tab: 'files' }, true);
    } catch (err) { bz.done(); CS.toast(err.message, 'bad'); }
  }
  async function copyText(t, btn) {
    try { await navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    CS.toast('Copied'); if (btn) { btn.classList.add('ok'); setTimeout(() => btn.classList.remove('ok'), 1200); }
  }
  CS.copyText = copyText;

  /* ---------- xAPI tab ---------- */
  async function xapiTab(body, d) {
    let t = d.tincan;
    if (!t) { const f = d.files.find(x => x.path === 'tincan.xml'); const text = f ? (typeof f.data === 'string' ? f.data : '') : ''; const z = new JSZip(); z.file('tincan.xml', text); t = await readTincan(z); }
    const sample = new URL('index.html', SITE).href.replace('index.html', '') + '…/' + (t.launch || 'index.html') + '?endpoint=…&auth=…&actor=…&registration=…&activity_id=' + encodeURIComponent(t.id || '');
    const verbs = d.generated ? ['launched', 'initialized / resumed', 'experienced (each lesson)', 'progressed', 'answered (each question)', 'passed / failed', 'completed', 'terminated'] : null;
    body.innerHTML = `<div class="xa">
      <div class="xa-grid">
        <div class="xa-card"><span>Course activity ID</span><code id="actId">${esc(t.id || '–')}</code><button class="btn sm" data-copy="${esc(t.id || '')}"><svg><use href="#i-copy"/></svg>Copy</button></div>
        <div class="xa-card"><span>Course name</span><b>${esc(t.name || page.meta.title)}</b></div>
        <div class="xa-card"><span>Launch file</span><code>${esc(t.launch || '–')}</code></div>
        <div class="xa-card"><span>Activity type</span><code>${esc(t.type || '–')}</code></div>
      </div>
      ${t.children && t.children.length ? `<h2 class="h2">Other activities in the manifest <small>${t.children.length}</small></h2><ul class="acts">${t.children.slice(0, 60).map(a => `<li><b>${esc(a.name || '(no name)')}</b><code>${esc(a.id)}</code><small>${esc(String(a.type || '').split('/').pop())}</small></li>`).join('')}</ul>` : ''}
      ${verbs ? `<h2 class="h2">Statements this course sends</h2><div class="verbs">${verbs.map((v, i) => `<span style="--i:${i}">${v}</span>`).join('')}</div>` : ''}
      <h2 class="h2">How an LMS launches it</h2>
      <p class="muted">The LMS opens the launch file and adds the learner and LRS details to the address, like this:</p>
      <pre class="url">${esc(sample)}</pre>
      <div class="xa-cta"><button class="btn primary" data-c="preview"><svg><use href="#i-pulse"/></svg>Preview and watch live statements</button><button class="btn" data-c="tincan"><svg><use href="#i-code"/></svg>Open tincan.xml</button></div>
    </div>`;
    $$('[data-copy]', body).forEach(b => b.addEventListener('click', () => copyText(b.dataset.copy, b)));
  }

  /* ---------- course actions ---------- */
  document.addEventListener('click', async e => {
    const h = e.target.closest('[data-home]'); if (h) { e.preventDefault(); CS.go({}); return; }
    const t = e.target.closest('.tabs [data-tab]'); if (t) { showTab(t.dataset.tab, routeToken); return; }
    const b = e.target.closest('[data-c]'); if (!b || !page) return;
    const act = b.dataset.c, meta = page.meta;
    const more = $('.more'); if (more && act !== 'more') more.classList.remove('open');
    if (act === 'more') { const m = b.parentNode; const open = !m.classList.contains('open'); m.classList.toggle('open', open); b.setAttribute('aria-expanded', open); e.stopPropagation(); return; }
    if (act === 'preview') return previewCourse(meta, e);
    if (act === 'edit') return CS.go({ edit: meta.id });
    if (act === 'code' || act === 'tincan') { showTab('files', routeToken); return; }
    if (act === 'zip') return downloadZip(meta);
    if (act === 'share') return share(meta);
    if (act === 'details') return details(meta);
    if (act === 'status') { const m = Object.assign({}, meta, { status: meta.status === 'Draft' ? 'Published' : 'Draft' }); try { await CS.saveMeta(m); page.meta = m; CS.toast(m.status === 'Draft' ? 'Marked as draft' : 'Published'); route(); } catch (err) { CS.toast(err.message, 'bad'); } return; }
    if (act === 'dup') return duplicate(meta);
    if (act === 'delete') {
      if (!(await CS.confirm('Delete “' + meta.title + '”?', 'The course and all its files are removed from the studio. People with the link will no longer be able to open it.', 'Delete course', true))) return;
      try { S.courses = await CS.store.remove(meta.id); ls.set('cs.cache', S.courses); CS.toast('Course deleted'); CS.go({}); } catch (err) { CS.toast(err.message, 'bad'); }
    }
  });
  document.addEventListener('click', e => { const m = $('.more.open'); if (m && !m.contains(e.target)) m.classList.remove('open'); });

  async function downloadZip(meta) {
    const bz = CS.busy('Preparing the zip…');
    try {
      let blob;
      if (meta.kind === 'package') { const bytes = await CS.getBlob(meta, 'package', null, p => bz.progress(p, 'Downloading… ' + Math.round(p * 100) + '%')); blob = new Blob([bytes], { type: 'application/zip' }); }
      else { const d = await data(); blob = await CS.zipFiles(d.files, p => bz.progress(p, 'Zipping… ' + Math.round(p * 100) + '%')); }
      bz.done(); CS.download(blob, CS.slug(meta.title) + '-xapi.zip'); CS.toast('Download started');
    } catch (err) { bz.done(); CS.toast(err.message, 'bad'); }
  }
  async function duplicate(meta) {
    const bz = CS.busy('Duplicating…');
    try {
      const course = await CS.loadSource(meta);
      const id = CS.slug(course.title + ' copy') + '-' + CS.uid(4);
      const m2 = Object.assign({}, meta, { id, title: course.title + ' (copy)', status: 'Draft', blobs: {}, created: null, author: who() });
      for (const h of Object.keys(course.assets || {})) { const bytes = await CS.getBlob(meta, 'asset-' + h, { v: 1, parts: course.assets[h].parts || 1 }); await CS.putBlob(m2, 'asset-' + h, bytes, 1); }
      course.id = id; course.title = m2.title; delete course.activityId;
      m2.blobs.source = await CS.putBlob(m2, 'source', new TextEncoder().encode(JSON.stringify(course)), 1);
      await CS.saveMeta(m2); bz.done(); CS.toast('Duplicated'); CS.go({ course: id });
    } catch (err) { bz.done(); CS.toast(err.message, 'bad'); }
  }
  function details(meta) {
    const f = $('#detForm'); f.reset(); $('#detErr').textContent = '';
    f.elements.title.value = meta.title || ''; f.elements.description.value = meta.description || ''; f.elements.category.value = meta.category || ''; f.elements.author.value = meta.author || '';
    f._thumb = meta.thumbnail || ''; paintDetThumb();
    CS.openDlg($('#detDlg'));
  }
  function paintDetThumb() { const f = $('#detForm'); $('#detThumb').innerHTML = f._thumb ? `<img src="${esc(f._thumb)}" alt="">` : '<span>No picture</span>'; }
  $('#detFile').addEventListener('change', async e => { const file = e.target.files[0]; e.target.value = ''; if (!file) return; const u = URL.createObjectURL(file); try { $('#detForm')._thumb = await CS.thumbFrom(u); paintDetThumb(); } catch (err) { CS.toast('That picture could not be read.', 'bad'); } finally { URL.revokeObjectURL(u); } });
  $('#detForm').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    const m = Object.assign({}, page.meta, { title: f.elements.title.value.trim() || page.meta.title, description: f.elements.description.value.trim(), category: f.elements.category.value.trim(), author: f.elements.author.value.trim(), thumbnail: f._thumb || '' });
    try { await CS.saveMeta(m); page.meta = m; await CS.closeDlg($('#detDlg')); CS.toast('Details saved'); route(); } catch (err) { $('#detErr').textContent = err.message; }
  });

  /* ---------- share ---------- */
  function share(meta) {
    const link = new URL('?course=' + encodeURIComponent(meta.id), SITE).href;
    $('#shLink').value = link;
    $('#shWa').href = 'https://wa.me/?text=' + encodeURIComponent(meta.title + '\n' + link);
    $('#shMail').href = 'mailto:?subject=' + encodeURIComponent(meta.title) + '&body=' + encodeURIComponent(meta.title + '\n' + link);
    $('#shNative').hidden = !navigator.share; $('#shNative').onclick = () => navigator.share({ title: meta.title, url: link }).catch(() => {});
    try { const q = qrcode(0, 'M'); q.addData(link); q.make(); $('#shQr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { $('#shQr').textContent = ''; }
    $('#shNote').textContent = meta.status === 'Draft' ? 'This course is a draft. People with the link can still open it.' : 'Anyone with the link can preview the course, read its files and download the zip.';
    CS.openDlg($('#shareDlg'));
  }
  $('#shCopy').addEventListener('click', () => copyText($('#shLink').value, $('#shCopy')));

  /* ======================= preview ======================= */
  const PV = { statements: [] };
  CS.preview = async function ({ title, files, key, launch, activityId }) {
    const pv = $('#pv');
    $('#pvTitle').textContent = title;
    PV.statements = []; paintStatements();
    $('#pvLoad').classList.remove('gone'); $('#pvLoadText').textContent = 'Getting the preview ready…';
    if (!pv.open) pv.showModal();
    requestAnimationFrame(() => requestAnimationFrame(() => pv.classList.add('open')));
    try {
      const reg = await navigator.serviceWorker.getRegistration(SITE.href); if (reg && reg.active) reg.active.postMessage({ type: 'cs-reset-lrs' });
      const base = await CS.mount(key, files, p => ($('#pvLoadText').textContent = 'Unpacking files… ' + Math.round(p * 100) + '%'));
      const q = new URLSearchParams({ endpoint: new URL('lrs/', SITE).href, auth: 'Basic ' + btoa('studio:preview'), actor: JSON.stringify({ objectType: 'Agent', name: 'Preview learner', mbox: 'mailto:preview@course-studio.invalid' }), registration: crypto.randomUUID(), activity_id: activityId || '' });
      PV.src = base + String(launch || 'index.html').split('/').map(encodeURIComponent).join('/') + '?' + q;
      const fr = $('#pvFrame'); fr.onload = () => setTimeout(() => $('#pvLoad').classList.add('gone'), 200); fr.src = PV.src;
      $('#pvNew').href = PV.src;
    } catch (err) { $('#pvLoadText').textContent = err.message; }
  };
  async function previewCourse(meta, ev) {
    if (ev && ev.clientX) { $('#pv').style.setProperty('--px', ev.clientX + 'px'); $('#pv').style.setProperty('--py', ev.clientY + 'px'); }
    try {
      const pvd = $('#pv'); $('#pvLoadText').textContent = 'Loading…'; $('#pvTitle').textContent = meta.title;
      if (!pvd.open) { pvd.showModal(); requestAnimationFrame(() => requestAnimationFrame(() => pvd.classList.add('open'))); }
      $('#pvLoad').classList.remove('gone');
      const d = await data(p => ($('#pvLoadText').textContent = 'Downloading the course… ' + Math.round(p * 100) + '%'));
      let files = d.files;
      if (!d.generated) {
        const dirty = page.dirty;
        files = await Promise.all(d.files.map(async f => ({ path: f.path, type: CS.mime(f.path), data: dirty[f.path] != null ? dirty[f.path] : await f.zipObj.async('blob') })));
      }
      const key = (d.generated || Object.keys(page.dirty).length ? 'p-' + CS.uid(6) : meta.id + '~v' + ((meta.blobs.package || {}).v || 1));
      await CS.preview({ title: meta.title, files, key, launch: d.launch, activityId: d.activityId });
    } catch (err) { $('#pvLoadText').textContent = err.message; }
  }
  function closePreview() {
    const pv = $('#pv'); if (!pv.open) return;
    pv.classList.remove('open');
    setTimeout(() => { pv.close(); $('#pvFrame').src = 'about:blank'; }, reduce ? 0 : 500);
  }
  CS.closePreview = closePreview;
  $('#pvClose').addEventListener('click', closePreview);
  $('#pv').addEventListener('cancel', e => { e.preventDefault(); closePreview(); });
  $('#pvRestart').addEventListener('click', async () => { const reg = await navigator.serviceWorker.getRegistration(SITE.href); if (reg && reg.active) reg.active.postMessage({ type: 'cs-reset-lrs' }); PV.statements = []; paintStatements(); const u = new URL(PV.src); u.searchParams.set('registration', crypto.randomUUID()); PV.src = u.href; $('#pvLoad').classList.remove('gone'); $('#pvFrame').src = PV.src; });
  $$('#pvDevices button').forEach(b => b.addEventListener('click', () => { $$('#pvDevices button').forEach(x => x.setAttribute('aria-pressed', x === b)); $('#pvStage').dataset.device = b.dataset.device; }));
  $('#pvStmBtn').addEventListener('click', () => { const on = !$('#pv').classList.contains('stm'); $('#pv').classList.toggle('stm', on); $('#pvStmBtn').setAttribute('aria-pressed', on); });
  $('#pvClear').addEventListener('click', () => { PV.statements = []; paintStatements(); });
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'cs-statements' && $('#pv').open) { e.data.statements.forEach(s => PV.statements.push(s)); paintStatements(true); }
  });
  try { navigator.serviceWorker && navigator.serviceWorker.startMessages(); } catch (e) {}
  const lang = o => o && (o['en-US'] || o['en-us'] || o.en || Object.values(o)[0]) || '';
  function paintStatements(fresh) {
    $('#pvCount').textContent = PV.statements.length;
    $('#pvCount').classList.toggle('pop', !!fresh); void $('#pvCount').offsetWidth; if (fresh) $('#pvCount').classList.add('pop');
    const list = $('#pvList');
    if (!PV.statements.length) { list.innerHTML = '<li class="muted">Statements appear here as the learner goes through the course.</li>'; return; }
    list.innerHTML = PV.statements.slice().reverse().map((s, i) => {
      const verb = lang(s.verb && s.verb.display) || String((s.verb || {}).id || '').split('/').pop();
      const obj = lang(s.object && s.object.definition && s.object.definition.name) || (s.object && s.object.id) || '';
      const r = s.result || {}; const extra = [r.success === true ? '✓ correct' : r.success === false ? '✗ wrong' : '', r.score && r.score.scaled != null ? Math.round(r.score.scaled * 100) + '%' : '', r.completion ? 'complete' : ''].filter(Boolean).join(' · ');
      return `<li class="${i === 0 && fresh ? 'new' : ''}"><details><summary><span class="vb v-${esc(verb.split(' ')[0].toLowerCase())}">${esc(verb)}</span><span class="ob">${esc(obj)}</span>${extra ? `<small>${esc(extra)}</small>` : ''}</summary><pre>${esc(JSON.stringify(s, null, 2))}</pre></details></li>`;
    }).join('');
  }

  /* ======================= confetti ======================= */
  CS.confetti = function () {
    if (reduce) return;
    const cv = document.createElement('canvas'); cv.className = 'confetti'; document.body.appendChild(cv);
    const dpr = devicePixelRatio || 1; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; const cx = cv.getContext('2d'); cx.scale(dpr, dpr);
    const cols = ['#3b5bdb', '#ff6b4a', '#12b886', '#fab005', '#7950f2'];
    const ps = Array.from({ length: 120 }, (_, i) => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 15, vy: -Math.random() * 13 - 4, r: Math.random() * 6 + 4, c: cols[i % cols.length], a: Math.random() * 6, va: (Math.random() - .5) * .3 }));
    const t0 = performance.now();
    (function tick(t) { cx.clearRect(0, 0, innerWidth, innerHeight); ps.forEach(p => { p.vy += .33; p.x += p.vx; p.y += p.vy; p.a += p.va; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillStyle = p.c; cx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); cx.restore(); }); if (t - t0 < 2600) requestAnimationFrame(tick); else cv.remove(); })(t0);
  };

  addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 6), { passive: true });

  /* ======================= start ======================= */
  CS.refresh = async () => { await refresh(); };
  CS.route = route;
  const start = async () => {
    paintHeader();
    if (S.courses.length || !API) { /* show cached list straight away */ }
    route();
    await refresh();
    if (document.body.dataset.view !== 'editor') route();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
})();

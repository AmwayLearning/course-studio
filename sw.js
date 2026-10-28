/*
 * Course Studio — service worker. Keep this file next to index.html.
 *
 * 1. Serves course files that the studio has unpacked from a zip
 *    (addresses that start with  <site>/vfs/ ), so courses can be previewed
 *    without uploading them anywhere.
 * 2. Acts as a small test LRS at  <site>/lrs/  so xAPI courses run normally
 *    during a preview. Statements are shown live in the studio, not stored.
 */
const VFS = 'cs-vfs-v1';
const XAPI_VERSION = '1.0.3';
const state = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const rest = url.pathname.slice(scope.pathname.length);
  if (rest.startsWith('vfs/')) { event.respondWith(serveFile(url)); return; }
  if (rest.startsWith('lrs/')) { event.respondWith(lrs(event.request, rest.slice(4).replace(/\/+$/, ''), url)); return; }
});

async function serveFile(url) {
  const cache = await caches.open(VFS);
  let key = url.origin + url.pathname;
  let res = await cache.match(key);
  if (!res && key.endsWith('/')) res = await cache.match(key + 'index.html');
  if (!res) { try { res = await cache.match(decodeURI(key)); } catch (e) {} }
  if (!res) return new Response('Not found in this course package: ' + url.pathname, { status: 404, headers: { 'Content-Type': 'text/plain' } });
  return res;
}

function respond(status, body, type) {
  const headers = {
    'X-Experience-API-Version': XAPI_VERSION,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Experience-API-Version, If-Match, If-None-Match',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Cache-Control': 'no-store',
  };
  if (type) headers['Content-Type'] = type;
  const empty = status === 204 || status === 304;
  return new Response(empty ? null : (body == null ? '' : body), { status, headers });
}

async function broadcast(msg) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  list.forEach(c => { if (!new URL(c.url).pathname.includes('/vfs/')) c.postMessage(msg); });
}

async function lrs(req, path, url) {
  if (req.method === 'OPTIONS') return respond(204);
  let method = req.method.toUpperCase();
  let body = method === 'GET' || method === 'HEAD' ? '' : await req.text();
  const q = Object.fromEntries(url.searchParams);
  let type = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (q.method) { // xAPI alternate request syntax
    method = q.method.toUpperCase(); delete q.method;
    const f = new URLSearchParams(body); body = f.get('content') || ''; type = (f.get('Content-Type') || 'application/json').split(';')[0];
    for (const [k, v] of f) if (!/^(content|authorization|auth|x-experience-api-version|content-type)$/i.test(k)) q[k] = v;
  }
  if (path === 'about') return respond(200, JSON.stringify({ version: [XAPI_VERSION] }), 'application/json');
  if (path === 'statements') {
    if (method === 'GET') return respond(200, JSON.stringify({ statements: [], more: '' }), 'application/json');
    let list = [];
    try { const s = JSON.parse(body || '[]'); list = Array.isArray(s) ? s : [s]; } catch (e) { return respond(400, 'Bad statement JSON', 'text/plain'); }
    list.forEach(s => { if (!s.id) s.id = crypto.randomUUID(); });
    if (method === 'PUT' && q.statementId) list.forEach(s => { s.id = q.statementId; });
    broadcast({ type: 'cs-statements', statements: list });
    return method === 'PUT' ? respond(204) : respond(200, JSON.stringify(list.map(s => s.id)), 'application/json');
  }
  if (/^(activities\/state|activities\/profile|agents\/profile)$/.test(path)) {
    const key = path + '|' + (q.activityId || '') + '|' + (q.stateId || q.profileId || '') + '|' + (q.registration || '');
    if (method === 'GET') {
      if (!q.stateId && !q.profileId) return respond(200, '[]', 'application/json');
      const d = state.get(key);
      return d ? respond(200, d.body, d.type) : respond(404, '', 'text/plain');
    }
    if (method === 'DELETE') { state.delete(key); return respond(204); }
    if (method === 'POST' && state.has(key)) {
      try { const merged = Object.assign(JSON.parse(state.get(key).body), JSON.parse(body)); body = JSON.stringify(merged); } catch (e) {}
    }
    state.set(key, { body, type: type || 'application/json' });
    return respond(204);
  }
  if (path === 'activities') return respond(200, JSON.stringify({ objectType: 'Activity', id: q.activityId || '' }), 'application/json');
  if (path === 'agents') return respond(200, JSON.stringify({ objectType: 'Person' }), 'application/json');
  return respond(404, 'Unknown xAPI resource', 'text/plain');
}

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'cs-reset-lrs') state.clear();
});

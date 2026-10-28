/*
 * Course Studio — xAPI (Tin Can) connection for exported courses.
 *
 * When an LMS launches the course it adds these to the address:
 *   endpoint, auth, actor, registration, activity_id
 * The course then sends xAPI statements to that endpoint and saves the
 * learner's place ("bookmark") in the activity state so they can resume.
 * Opened on its own (no LMS), the course still works and remembers progress
 * in this browser only.
 */
(function () {
  'use strict';
  var VERSION = '1.0.3';
  var C = window.COURSE || {};

  function params() {
    var out = {}, q = location.search.replace(/^\?/, '');
    if (!q) return out;
    q.split('&').forEach(function (kv) {
      var i = kv.indexOf('='); if (i < 0) return;
      try { out[decodeURIComponent(kv.slice(0, i)).toLowerCase()] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); } catch (e) {}
    });
    return out;
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function isoDuration(ms) {
    var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return 'PT' + (h ? h + 'H' : '') + (m ? m + 'M' : '') + (s % 60) + 'S';
  }
  function actorFrom(raw) {
    if (!raw) return null;
    try {
      var a = JSON.parse(raw);
      if (Array.isArray(a.mbox)) a.mbox = a.mbox[0];
      if (Array.isArray(a.name)) a.name = a.name[0];
      if (Array.isArray(a.account)) a.account = a.account[0];
      if (a.account && a.account.accountName == null && a.account.name) { a.account = { homePage: a.account.accountServiceHomePage || a.account.homePage, name: a.account.accountName || a.account.name }; }
      if (!a.objectType) a.objectType = 'Agent';
      return a;
    } catch (e) { return null; }
  }

  var p = params();
  var endpoint = p.endpoint || '';
  if (endpoint && endpoint.slice(-1) !== '/') endpoint += '/';
  var auth = p.auth || '';
  var actor = actorFrom(p.actor);
  var registration = p.registration || '';
  var activityId = p.activity_id || C.activityId || ('https://example.com/xapi/' + (C.id || 'course'));
  var connected = !!(endpoint && actor);
  var started = Date.now();
  var queue = [], sending = false;

  var VERB = function (v) { return { id: 'http://adlnet.gov/expapi/verbs/' + v, display: { 'en-US': v } }; };

  function courseActivity() {
    return { objectType: 'Activity', id: activityId, definition: { type: 'http://adlnet.gov/expapi/activities/course', name: { 'en-US': C.title || 'Course' }, description: { 'en-US': C.description || '' } } };
  }
  function context(child) {
    var c = { contextActivities: { category: [{ objectType: 'Activity', id: 'https://w3id.org/xapi/tincan/v1' }] } };
    if (registration) c.registration = registration;
    if (child) c.contextActivities.parent = [{ objectType: 'Activity', id: activityId }];
    return c;
  }
  function headers(extra) {
    var h = { 'X-Experience-API-Version': VERSION };
    if (auth) h.Authorization = auth;
    for (var k in extra || {}) h[k] = extra[k];
    return h;
  }
  function flush(keepalive) {
    if (!connected || sending || !queue.length) return Promise.resolve();
    sending = true;
    var batch = queue.splice(0, queue.length);
    return fetch(endpoint + 'statements', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(batch), keepalive: !!keepalive && JSON.stringify(batch).length < 60000 })
      .then(function (r) { if (!r.ok) throw new Error('LRS ' + r.status); })
      .catch(function (e) { queue = batch.concat(queue); if (window.console) console.warn('xAPI: statements not sent yet', e); })
      .then(function () { sending = false; if (queue.length) setTimeout(flush, 3000); });
  }
  var flushTimer = null;
  function send(verb, object, result, child) {
    var st = { id: uuid(), actor: actor || { objectType: 'Agent', name: 'Learner', mbox: 'mailto:learner@example.com' }, verb: VERB(verb), object: object || courseActivity(), context: context(child), timestamp: new Date().toISOString() };
    if (result) st.result = result;
    if (!connected && window.parent !== window) { try { window.parent.postMessage({ type: 'course-studio-statement', statement: st, connected: connected }, '*'); } catch (e) {} }
    if (!connected) return;
    queue.push(st);
    clearTimeout(flushTimer); flushTimer = setTimeout(flush, 400);
  }

  /* ---- bookmark (activity state) ---- */
  var LOCAL_KEY = 'course-studio:' + activityId;
  function stateUrl() {
    var q = 'activityId=' + encodeURIComponent(activityId) + '&agent=' + encodeURIComponent(JSON.stringify(actor)) + '&stateId=bookmark';
    if (registration) q += '&registration=' + encodeURIComponent(registration);
    return endpoint + 'activities/state?' + q;
  }
  function loadState() {
    if (!connected) {
      try { return Promise.resolve(JSON.parse(localStorage.getItem(LOCAL_KEY)) || null); } catch (e) { return Promise.resolve(null); }
    }
    return fetch(stateUrl(), { headers: headers() })
      .then(function (r) { return r.status === 200 ? r.json() : null; })
      .catch(function () { return null; });
  }
  var saveTimer = null, lastState = null;
  function saveState(st, now) {
    lastState = st;
    clearTimeout(saveTimer);
    var go = function () {
      if (!connected) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(lastState)); } catch (e) {} return Promise.resolve(); }
      return fetch(stateUrl(), { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(lastState), keepalive: true }).catch(function () {});
    };
    if (now) return go();
    saveTimer = setTimeout(go, 600);
    return Promise.resolve();
  }

  var terminated = false;
  window.XAPI = {
    connected: connected,
    activityId: activityId,
    learnerName: actor && actor.name || '',
    start: function (resumed) { send('launched'); send(resumed ? 'resumed' : 'initialized'); },
    loadState: loadState,
    saveState: saveState,
    lesson: function (lesson, index, total) {
      send('experienced', { objectType: 'Activity', id: activityId + '/lessons/' + lesson.id, definition: { type: 'http://adlnet.gov/expapi/activities/lesson', name: { 'en-US': lesson.title || ('Lesson ' + (index + 1)) } } }, null, true);
      send('progressed', courseActivity(), { extensions: { 'https://w3id.org/xapi/cmi5/result/extensions/progress': Math.round(total * 100) } });
    },
    answered: function (q, response, success) {
      var def = { type: 'http://adlnet.gov/expapi/activities/cmi.interaction', name: { 'en-US': String(q.question || 'Question').replace(/<[^>]+>/g, '').slice(0, 200) }, interactionType: 'choice',
        choices: (q.options || []).map(function (o, i) { return { id: 'choice-' + (i + 1), description: { 'en-US': String(o.text || '').replace(/<[^>]+>/g, '').slice(0, 200) } }; }),
        correctResponsesPattern: [(q.options || []).map(function (o, i) { return o.correct ? 'choice-' + (i + 1) : null; }).filter(Boolean).join('[,]')] };
      send('answered', { objectType: 'Activity', id: activityId + '/questions/' + q.id, definition: def }, { success: !!success, response: response.map(function (i) { return 'choice-' + (i + 1); }).join('[,]') }, true);
    },
    finish: function (score, passMark, hasQuiz) {
      var result = { completion: true, duration: isoDuration(Date.now() - started) };
      if (hasQuiz) { result.score = { scaled: Math.round(score) / 100, raw: Math.round(score), min: 0, max: 100 }; result.success = score >= passMark; }
      if (hasQuiz) send(score >= passMark ? 'passed' : 'failed', courseActivity(), result);
      send('completed', courseActivity(), result);
      return flush();
    },
    terminate: function () {
      if (terminated) return; terminated = true;
      send('terminated', courseActivity(), { duration: isoDuration(Date.now() - started) });
      clearTimeout(flushTimer); flush(true);
      if (lastState) saveState(lastState, true);
    }
  };
  window.addEventListener('pagehide', function () { window.XAPI.terminate(); });
})();

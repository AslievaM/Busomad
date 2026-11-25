'use strict';
/*
 * Busomad server. No packages to install, Node 18 or newer.
 *
 *   ADMIN_CODE=choose-a-secret node server.js      then open http://localhost:3000
 *
 * Settings (all optional, set as environment variables):
 *   PORT            default 3000
 *   ADMIN_CODE      secret that allows creating and deleting routes. Without it routes can only be edited in data/routes.json
 *   DRIVER_CODE     if set, people must type this code to share as "driver"
 *   PING_MS         how often phones send their position. Default 60000 (one minute)
 *   STALE_MS        forget a phone after this long without a ping. Default 200000
 *   STYLE_URL       vector map style, default OpenFreeMap "liberty" (free, no key). The app repaints it in the Busomad colours. Set to "none" to use plain raster tiles
 *   TILE_URL        raster tile address used only when STYLE_URL is "none" or unreachable (OpenStreetMap server, testing only)
 *   TILE_ATTRIBUTION, TILE_MAX_ZOOM
 *   DATA_DIR        where routes and recorded tracks are kept. Default ./data
 *   TRACK_LOG       "1" (default) keeps every bus/driver position in DATA_DIR/tracks so real routes can be built from them
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RouteStore } = require('./lib/routes');
const { Tracker } = require('./lib/tracker');

const env = process.env;
const PORT = Number(env.PORT) || 3000;
const PING_MS = Number(env.PING_MS) || 60000;
const STALE_MS = Number(env.STALE_MS) || 200000;
const MIN_PING_MS = Number(env.MIN_PING_MS) || 4000;
const PUSH_MS = 5000;
const MAX_DEVICES = 20000;
const ADMIN_CODE = env.ADMIN_CODE || '';
const DRIVER_CODE = env.DRIVER_CODE || '';
const DATA_DIR = path.resolve(env.DATA_DIR || path.join(__dirname, 'data'));
const TRACK_LOG = env.TRACK_LOG !== '0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const BBOX = { minLat: 36.5, maxLat: 41.2, minLng: 67.2, maxLng: 75.3 };
const STYLE_URL = env.STYLE_URL === 'none' ? '' : (env.STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty');
const TILES = {
  url: env.TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: env.TILE_ATTRIBUTION || '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: Number(env.TILE_MAX_ZOOM) || 19
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon'
};

fs.mkdirSync(path.join(DATA_DIR, 'tracks'), { recursive: true });
const store = new RouteStore(path.join(DATA_DIR, 'routes.json'));
const tracker = new Tracker(store, { staleMs: STALE_MS, minPingMs: MIN_PING_MS });
const streams = new Set();

const pubOf = (id) => crypto.createHash('sha256').update(id).digest('hex').slice(0, 10);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function sse(res, event, data) { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); }
function pushState() {
  if (!streams.size) return;
  const data = tracker.publicState(Date.now());
  for (const res of streams) sse(res, 'state', data);
}
let pushTimer = null;
function schedulePush() { if (!pushTimer) pushTimer = setTimeout(() => { pushTimer = null; pushState(); }, 800); }

function readBody(req, limit, cb) {
  let size = 0, done = false;
  const chunks = [];
  const finish = (err, val) => { if (!done) { done = true; cb(err, val); } };
  req.on('data', (c) => { size += c.length; if (size > limit) { finish(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { finish(e); } });
  req.on('error', (e) => finish(e));
}

function validate(b) {
  if (!b || typeof b !== 'object') return null;
  const id = String(b.id || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return null;
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < BBOX.minLat || lat > BBOX.maxLat || lng < BBOX.minLng || lng > BBOX.maxLng) return null;
  const mode = ['rider', 'onbus', 'driver'].indexOf(b.mode) >= 0 ? b.mode : null;
  if (!mode) return null;
  let route = '', type = 'bus';
  if (mode !== 'rider') {
    route = String(b.route || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 6);
    if (!route) return null;
    type = ['bus', 'trolley', 'mini'].indexOf(b.type) >= 0 ? b.type : 'bus';
  }
  let speed = b.speed == null ? null : Number(b.speed);
  speed = Number.isFinite(speed) && speed >= 0 && speed < 60 ? Math.round(speed * 10) / 10 : null;
  let acc = Number(b.acc);
  acc = Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null;
  return { id, pub: pubOf(id), lat, lng, mode, route, type, speed, acc };
}

function logTrack(v, now) {
  if (!TRACK_LOG || v.mode === 'rider') return;
  const day = new Date(now).toISOString().slice(0, 10);
  const line = JSON.stringify({ ts: now, pub: v.pub, mode: v.mode, route: v.route, lat: v.lat, lng: v.lng, acc: v.acc, speed: v.speed }) + '\n';
  fs.appendFile(path.join(DATA_DIR, 'tracks', day + '.ndjson'), line, () => {});
}

function handlePing(req, res) {
  readBody(req, 2048, (err, body) => {
    if (err) return json(res, 400, { error: 'bad body' });
    const v = validate(body);
    if (!v) return json(res, 400, { error: 'invalid position' });
    // People waiting at a stop keep their position on their own phone. Nothing is stored or shared.
    if (v.mode === 'rider') return json(res, 200, { ok: true, local: true });
    if (v.mode === 'driver' && DRIVER_CODE && !same(body.code || '', DRIVER_CODE)) return json(res, 403, { error: 'wrong driver code' });
    if (!tracker.devices.has(v.id) && tracker.devices.size >= MAX_DEVICES) return json(res, 503, { error: 'busy' });
    const now = Date.now();
    const r = tracker.ping(v, now);
    if (!r.ok) return json(res, 422, { error: r.reason });
    if (!r.throttled) { logTrack(v, now); schedulePush(); }
    json(res, 200, Object.assign({ pub: r.pub }, r.info));
  });
}

function handleLeave(req, res) {
  readBody(req, 2048, (err, body) => {
    const id = !err && body && String(body.id || '');
    if (id && /^[A-Za-z0-9_-]{16,64}$/.test(id) && tracker.leave(id)) schedulePush();
    json(res, 200, { ok: true });
  });
}

function admin(req, res) {
  if (!ADMIN_CODE) { json(res, 503, { error: 'Route editing is off. Start the server with ADMIN_CODE set.' }); return false; }
  if (!same(req.headers['x-admin-code'] || '', ADMIN_CODE)) { json(res, 401, { error: 'wrong admin code' }); return false; }
  return true;
}

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (file.indexOf(PUBLIC_DIR + path.sep) !== 0) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      // The OpenStreetMap tile server blocks pages that hide where they come from, so do not use "no-referrer".
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname, m = req.method;
  if (m === 'GET' && p === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    sse(res, 'state', tracker.publicState(Date.now()));
    streams.add(res);
    req.on('close', () => streams.delete(res));
    return;
  }
  if (m === 'GET' && p === '/api/config') return json(res, 200, { pingMs: PING_MS, staleMs: STALE_MS, styleUrl: STYLE_URL, tiles: TILES, driverCodeRequired: !!DRIVER_CODE, adminEnabled: !!ADMIN_CODE });
  if (m === 'GET' && p === '/api/routes') return json(res, 200, store.list());
  if (m === 'GET' && p === '/api/state') return json(res, 200, tracker.publicState(Date.now()));
  if (m === 'GET' && p === '/api/arrivals') return json(res, 200, tracker.arrivals(url.searchParams.get('route') || '', url.searchParams.get('stop') || '', Date.now()));
  if (m === 'GET' && p === '/health') return json(res, 200, Object.assign({ ok: true, routes: store.routes.size, watchers: streams.size }, tracker.stats(Date.now())));
  if (m === 'POST' && p === '/api/ping') return handlePing(req, res);
  if (m === 'POST' && p === '/api/leave') return handleLeave(req, res);
  if (m === 'GET' && p === '/api/admin/check') { if (admin(req, res)) json(res, 200, { ok: true }); return; }
  if (m === 'GET' && p === '/api/admin/export') {
    if (!admin(req, res)) return;
    const body = JSON.stringify(Array.from(store.routes.values()).map((r) => r.def), null, 1);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="routes.json"', 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  if (m === 'GET' && p === '/api/admin/tracks') {
    if (!admin(req, res)) return;
    const dir = path.join(DATA_DIR, 'tracks');
    const day = url.searchParams.get('day');
    if (!day) {
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).map((f) => ({ day: f.slice(0, 10), bytes: fs.statSync(path.join(dir, f)).size })); } catch (e) { files = []; }
      return json(res, 200, { files });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(res, 400, { error: 'day must look like 2026-11-25' });
    const file = path.join(dir, day + '.ndjson');
    if (!fs.existsSync(file)) return json(res, 404, { error: 'no tracks for that day' });
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Disposition': 'attachment; filename="tracks-' + day + '.ndjson"', 'Cache-Control': 'no-store' });
    return fs.createReadStream(file).pipe(res);
  }
  if (m === 'POST' && p === '/api/admin/route') {
    if (!admin(req, res)) return;
    return readBody(req, 600 * 1024, (err, body) => {
      if (err) return json(res, 400, { error: 'bad body' });
      try { const r = store.set(body); schedulePush(); json(res, 200, { ok: true, id: r.id, lengthM: Math.round(r.length), stops: r.stops.length, points: r.path.length }); }
      catch (e) { json(res, 400, { error: e.message }); }
    });
  }
  if (m === 'DELETE' && p === '/api/admin/route') {
    if (!admin(req, res)) return;
    const gone = store.remove(url.searchParams.get('id') || '');
    if (gone) schedulePush();
    return json(res, gone ? 200 : 404, { ok: gone });
  }
  if (m === 'GET') return serveStatic(res, p);
  res.writeHead(405); res.end();
});

setInterval(() => { if (tracker.sweep(Date.now()).length) schedulePush(); }, 10000);
setInterval(pushState, PUSH_MS);
setInterval(() => { for (const res of streams) res.write(': keep-alive\n\n'); }, 20000);

server.listen(PORT, () => {
  console.log('Busomad is running on http://localhost:' + PORT);
  console.log('Routes loaded: ' + store.routes.size + ' · phones send a position every ' + Math.round(PING_MS / 1000) + ' s' + (ADMIN_CODE ? '' : ' · route editing is OFF (set ADMIN_CODE)'));
});

'use strict';
/*
 * Bus routes: a line on the map (path), the stops along it, and planning numbers.
 * Stored in data/routes.json. The file holds only what a person would write by hand:
 *   { id, type, name, path: [[lat,lng],...], stops: [{name,lat,lng}], plannedSpeedKmh, dwellSec, twoWay, timetable }
 * Everything else (length, distance of each stop along the line) is worked out on load.
 */
const fs = require('fs');
const path = require('path');
const geo = require('./geo');

const BBOX = { minLat: 36.5, maxLat: 41.2, minLng: 67.2, maxLng: 75.3 };
const TYPES = ['bus', 'trolley', 'mini'];
const DEFAULT_SPEED = { bus: 20, trolley: 18, mini: 22 };   // km/h including stops: edit per route
const COLORS = { bus: '#F2A900', trolley: '#F4F7F5', mini: '#6CB7FF' };

function inBox(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng;
}

function normalize(def) {
  if (!def || typeof def !== 'object') throw new Error('route must be an object');
  const id = String(def.id || '');
  if (!/^[A-Za-z0-9]{1,6}$/.test(id)) throw new Error('route id must be 1 to 6 letters or digits');
  const type = TYPES.indexOf(def.type) >= 0 ? def.type : 'bus';
  const name = String(def.name || ('Route ' + id)).slice(0, 80);
  if (!Array.isArray(def.path) || def.path.length < 2) throw new Error('path needs at least 2 points');
  if (def.path.length > 20000) throw new Error('path is too long');
  const raw = def.path.map((p) => [Number(p[0]), Number(p[1])]);
  if (!raw.every((p) => inBox(p[0], p[1]))) throw new Error('a path point is outside Tajikistan');
  const line = geo.simplify(raw, 3);
  if (line.length < 2) throw new Error('path collapsed to a single point');
  const cum = geo.cumulative(line);
  const length = cum[cum.length - 1];
  if (length < 50) throw new Error('route is shorter than 50 m');

  let plannedSpeedKmh = Number(def.plannedSpeedKmh);
  if (!Number.isFinite(plannedSpeedKmh) || plannedSpeedKmh <= 0) plannedSpeedKmh = DEFAULT_SPEED[type];
  plannedSpeedKmh = Math.max(5, Math.min(60, plannedSpeedKmh));
  let dwellSec = Number(def.dwellSec);
  if (!Number.isFinite(dwellSec) || dwellSec < 0) dwellSec = 15;
  dwellSec = Math.min(120, dwellSec);
  const timetable = (Array.isArray(def.timetable) ? def.timetable : []).map(String).filter((t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t))
    .map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; }).sort((a, b) => a - b);

  const stops = [];
  let hint = null;
  (Array.isArray(def.stops) ? def.stops : []).slice(0, 200).forEach((st, k) => {
    const lat = Number(st.lat), lng = Number(st.lng);
    if (!inBox(lat, lng)) throw new Error('stop ' + (k + 1) + ' is outside Tajikistan');
    const pr = geo.project(line, cum, lat, lng, hint);
    if (pr.d > 150) throw new Error('stop "' + (st.name || k + 1) + '" is ' + Math.round(pr.d) + ' m from the route line (limit 150 m)');
    hint = pr.s;
    stops.push({ name: String(st.name || ('Stop ' + (k + 1))).slice(0, 80), lat, lng, s: pr.s });
  });
  stops.sort((a, b) => a.s - b.s);
  stops.forEach((st, k) => { st.id = 's' + (k + 1); });

  return {
    id, type, name, color: COLORS[type], path: line, cum, length, stops,
    plannedSpeedKmh, dwellSec, twoWay: !!def.twoWay, timetable,
    // what is written back to disk
    def: { id, type, name, path: line, stops: stops.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng })), plannedSpeedKmh, dwellSec, twoWay: !!def.twoWay,
      timetable: timetable.map((m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')) }
  };
}

class RouteStore {
  constructor(file) {
    this.file = file;
    this.routes = new Map();
    this.load();
  }
  load() {
    this.routes.clear();
    let list = [];
    try { list = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { list = []; }
    (Array.isArray(list) ? list : []).forEach((d) => {
      try { const r = normalize(d); this.routes.set(r.id, r); } catch (e) { console.warn('Skipped route in ' + this.file + ': ' + e.message); }
    });
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Array.from(this.routes.values()).map((r) => r.def)));
    fs.renameSync(tmp, this.file);
  }
  set(def) { const r = normalize(def); this.routes.set(r.id, r); this.save(); return r; }
  remove(id) { const had = this.routes.delete(id); if (had) this.save(); return had; }
  /* What the app is allowed to see. */
  list() {
    return Array.from(this.routes.values()).map((r) => ({
      id: r.id, type: r.type, name: r.name, color: r.color, length: Math.round(r.length), plannedSpeedKmh: r.plannedSpeedKmh, twoWay: r.twoWay,
      hasTimetable: r.timetable.length > 0,
      path: r.path.map((p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]),
      stops: r.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, s: Math.round(s.s) }))
    }));
  }
}

module.exports = { RouteStore, normalize, BBOX, TYPES };

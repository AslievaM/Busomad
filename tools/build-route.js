#!/usr/bin/env node
'use strict';
/*
 * Turns recorded driver tracks into a route for data/routes.json.
 *
 *   node tools/build-route.js --in tracks-2026-11-25.ndjson --id 25 --name "Route 25" --out route25.json
 *   node tools/build-route.js --in tracks.ndjson --id 25 --merge data/routes.json
 *
 * Options
 *   --in      tracks file from Admin: /api/admin/tracks?day=YYYY-MM-DD (one JSON object per line), or a JSON array of [lat,lng]
 *   --id      route id, 1 to 6 letters or digits (required)
 *   --name    name shown in the app
 *   --type    bus, trolley or mini (default bus)
 *   --route   only use positions logged for this route id
 *   --pub     only use this phone (the short id shown in the tracks file). Default: the phone with the most positions
 *   --speed   planned speed in km/h
 *   --two-way mark the route as used in both directions
 *   --out     write the new route (alone) to this file
 *   --merge   add or replace the route inside this routes.json
 *
 * For a good line the phones must send often: start the server with PING_MS=5000 while you record.
 * With the default of one position a minute the line cuts corners and the tool says so.
 */
const fs = require('fs');
const geo = require('../lib/geo');
const { normalize } = require('../lib/routes');

const MAX_SPEED = 40;        // m/s: faster than this between two fixes is a GPS jump
const TRIP_GAP_MS = 10 * 60 * 1000;
const MIN_STEP_M = 5;        // closer than this to the last kept point: skip
const DWELL_RADIUS_M = 30, DWELL_MIN_MS = 20 * 1000;

function parseTracks(text) {
  const t = text.trim();
  if (t[0] === '[') {
    const arr = JSON.parse(t);
    return arr.map((p, i) => ({ ts: i * 5000, pub: 'x', lat: Number(p[0]), lng: Number(p[1]), acc: null, route: '' }));
  }
  const out = [];
  t.split('\n').forEach((line) => {
    if (!line.trim()) return;
    try { const o = JSON.parse(line); if (Number.isFinite(o.lat) && Number.isFinite(o.lng) && Number.isFinite(o.ts)) out.push(o); } catch (e) { /* skip a broken line */ }
  });
  return out;
}

function tripLength(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += geo.haversine(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng); return d; }

function splitTrips(pts) {
  const trips = []; let cur = [];
  pts.forEach((p) => { if (cur.length && p.ts - cur[cur.length - 1].ts > TRIP_GAP_MS) { trips.push(cur); cur = []; } cur.push(p); });
  if (cur.length) trips.push(cur);
  return trips;
}

function clean(pts) {
  const kept = [];
  pts.forEach((p) => {
    const last = kept[kept.length - 1];
    if (!last) { kept.push(p); return; }
    const d = geo.haversine(last.lat, last.lng, p.lat, p.lng), dt = Math.max(1, (p.ts - last.ts) / 1000);
    if (d / dt > MAX_SPEED) return;
    if (d < MIN_STEP_M) return;
    kept.push(p);
  });
  return kept;
}

/* Places where the phone stayed put for a while: likely stops. Uses the raw trip, before close points are dropped. */
function dwells(raw) {
  const out = []; let i = 0;
  while (i < raw.length) {
    let j = i;
    while (j + 1 < raw.length && geo.haversine(raw[i].lat, raw[i].lng, raw[j + 1].lat, raw[j + 1].lng) <= DWELL_RADIUS_M) j++;
    if (raw[j].ts - raw[i].ts >= DWELL_MIN_MS) {
      const seg = raw.slice(i, j + 1);
      out.push({ lat: seg.reduce((a, p) => a + p.lat, 0) / seg.length, lng: seg.reduce((a, p) => a + p.lng, 0) / seg.length, sec: Math.round((raw[j].ts - raw[i].ts) / 1000) });
      i = j + 1;
    } else i++;
  }
  return out;
}

function build(points, opts) {
  opts = opts || {};
  let pts = points.slice();
  const notes = [];
  if (opts.route) pts = pts.filter((p) => String(p.route) === String(opts.route));
  if (opts.pub) pts = pts.filter((p) => p.pub === opts.pub);
  pts = pts.filter((p) => p.acc == null || p.acc <= 50);
  if (!pts.length) throw new Error('no usable positions in the file (check --route, --pub and the day)');
  if (!opts.pub) {
    const count = {}; pts.forEach((p) => { count[p.pub] = (count[p.pub] || 0) + 1; });
    const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    pts = pts.filter((p) => p.pub === best);
    notes.push('used phone ' + best + ' (' + count[best] + ' positions)');
  }
  pts.sort((a, b) => a.ts - b.ts);
  const trips = splitTrips(pts).sort((a, b) => tripLength(b) - tripLength(a));
  const raw = trips[0];
  const line = clean(raw);
  if (line.length < 2) throw new Error('the best trip has fewer than 2 usable positions');
  const steps = []; for (let i = 1; i < line.length; i++) steps.push(geo.haversine(line[i - 1].lat, line[i - 1].lng, line[i].lat, line[i].lng));
  steps.sort((a, b) => a - b);
  const medianStep = steps[Math.floor(steps.length / 2)];
  if (medianStep > 150) notes.push('WARNING: positions are ' + Math.round(medianStep) + ' m apart on average, so the line will cut corners. Set PING_MS=5000 on the server and record again.');

  const path = line.map((p) => [Math.round(p.lat * 1e6) / 1e6, Math.round(p.lng * 1e6) / 1e6]);
  const cum = geo.cumulative(path);
  const stops = [];
  const first = path[0], last = path[path.length - 1];
  stops.push({ name: 'Start', lat: first[0], lng: first[1] });
  dwells(raw).forEach((d) => {
    const here = { lat: d.lat, lng: d.lng };
    const near = stops.some((s) => geo.haversine(s.lat, s.lng, here.lat, here.lng) < 60);
    const pr = geo.project(path, cum, here.lat, here.lng);
    if (!near && pr.d <= 100) stops.push({ name: 'Stop ' + stops.length, lat: Math.round(here.lat * 1e6) / 1e6, lng: Math.round(here.lng * 1e6) / 1e6 });
  });
  if (geo.haversine(stops[stops.length - 1].lat, stops[stops.length - 1].lng, last[0], last[1]) > 60) stops.push({ name: 'End', lat: last[0], lng: last[1] });
  notes.push(stops.length + ' stop candidates found where the bus stood still 20 s or more. Rename them (Stop 1, Stop 2 ...) before use.');

  const def = { id: String(opts.id), type: opts.type || 'bus', name: opts.name || ('Route ' + opts.id), path, stops, twoWay: !!opts.twoWay };
  if (opts.speed) def.plannedSpeedKmh = Number(opts.speed);
  const checked = normalize(def);      // throws with a clear message if the route is not valid
  return { def: checked.def, lengthM: Math.round(checked.length), points: checked.path.length, stops: checked.stops.length, notes };
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--two-way') a.twoWay = true;
    else if (k.startsWith('--')) a[k.slice(2)] = argv[++i];
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.in || !a.id) { console.error('Usage: node tools/build-route.js --in tracks.ndjson --id 25 [--name "Route 25"] [--merge data/routes.json | --out route.json]'); process.exit(1); }
  let res;
  try { res = build(parseTracks(fs.readFileSync(a.in, 'utf8')), a); } catch (e) { console.error('Error: ' + e.message); process.exit(1); }
  console.log('Route ' + res.def.id + ': ' + res.lengthM + ' m, ' + res.points + ' points, ' + res.stops + ' stops');
  res.notes.forEach((n) => console.log('- ' + n));
  if (a.merge) {
    let list = []; try { list = JSON.parse(fs.readFileSync(a.merge, 'utf8')); } catch (e) { list = []; }
    list = list.filter((r) => r.id !== res.def.id); list.push(res.def);
    fs.writeFileSync(a.merge, JSON.stringify(list, null, 1)); console.log('Saved into ' + a.merge);
  }
  if (a.out) { fs.writeFileSync(a.out, JSON.stringify(res.def, null, 1)); console.log('Saved to ' + a.out); }
  if (!a.merge && !a.out) console.log(JSON.stringify(res.def));
}

if (require.main === module) main();
module.exports = { build, parseTracks, dwells, clean };

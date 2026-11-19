'use strict';
/* Run with:  node --test test/unit.js   (Node 18+) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const geo = require('../lib/geo');
const { RouteStore, normalize } = require('../lib/routes');
const { Tracker } = require('../lib/tracker');

/* A synthetic 5 km route running east along latitude 38.5 (not a real bus line). */
const LNG_PER_M = 1 / (111195.08 * Math.cos(38.5 * Math.PI / 180));
const east = (m) => [38.5, 68.75 + m * LNG_PER_M];
const baseDef = (extra) => Object.assign({
  id: 'T1', type: 'bus', name: 'Test line', path: [east(0), east(2500), east(5000)],
  stops: [{ name: 'A', lat: east(0)[0], lng: east(0)[1] }, { name: 'B', lat: east(1000)[0], lng: east(1000)[1] },
          { name: 'C', lat: east(2500)[0], lng: east(2500)[1] }, { name: 'D', lat: east(4000)[0], lng: east(4000)[1] }],
  plannedSpeedKmh: 20, dwellSec: 15, twoWay: false
}, extra || {});

function mk(extra, opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rasid-'));
  const store = new RouteStore(path.join(dir, 'routes.json'));
  const route = store.set(baseDef(extra));
  return { store, route, tr: new Tracker(store, opts) };
}
const T0 = Date.UTC(2026, 10, 11, 5, 0, 0);          // 10:00 in Tajikistan
const at = (route, s, northM) => { const p = geo.pointAt(route.path, route.cum, s); return { lat: p.lat + (northM || 0) / 110574, lng: p.lng }; };
let n = 0;
const phone = (route, s, mode, extra) => Object.assign({ id: 'dev' + (++n) + 'x'.repeat(16), pub: 'pub' + n, mode: mode || 'driver', route: route.id, type: 'bus', speed: null, acc: 10 }, at(route, s), extra || {});
const same = (base, route, s, extra) => Object.assign({}, base, at(route, s), extra || {});

test('geo: distances, projection, interpolation, simplify', () => {
  assert.ok(Math.abs(geo.haversine(38, 68, 39, 68) - 111195) < 400);           // one degree of latitude
  const { route } = mk();
  assert.ok(Math.abs(route.length - 5000) < 5, 'route length ' + route.length);
  const p = at(route, 2000, 30);
  const pr = geo.project(route.path, route.cum, p.lat, p.lng, null);
  assert.ok(Math.abs(pr.s - 2000) < 5 && Math.abs(pr.d - 30) < 2, JSON.stringify(pr));
  const back = geo.pointAt(route.path, route.cum, 1234);
  assert.ok(Math.abs(geo.project(route.path, route.cum, back.lat, back.lng, null).s - 1234) < 1);
  const line = [[38.5, 68.75], [38.5, 68.76], [38.5, 68.77], [38.51, 68.77]];
  assert.equal(geo.simplify(line, 3).length, 3);                                // middle point of the straight part dropped, corner kept
});

test('geo: hint keeps a route that doubles back on the right half', () => {
  // out along one street and back along the next one, about 33 m apart, each leg about 5 km
  const out = [38.5, 68.75], far = [38.5, 68.81], uTurn = [38.5003, 68.81], back = [38.5003, 68.75];
  const path = [out, far, uTurn, back], cum = geo.cumulative(path);
  const p = { lat: 38.50014, lng: 68.78 };                                      // a little closer to the outward leg
  const noHint = geo.project(path, cum, p.lat, p.lng, null);
  const withHint = geo.project(path, cum, p.lat, p.lng, 7600);                  // the bus was on the return leg a minute ago
  assert.ok(noHint.s < cum[1], 'without a hint it snaps to the outward leg, s=' + noHint.s);
  assert.ok(withHint.s > cum[2], 'with the hint it stays on the return leg, s=' + withHint.s);
});

test('routes: validation and stop distances', () => {
  const { route } = mk();
  assert.deepEqual(route.stops.map((s) => s.id), ['s1', 's2', 's3', 's4']);
  assert.ok(Math.abs(route.stops[1].s - 1000) < 3 && Math.abs(route.stops[3].s - 4000) < 3);
  assert.throws(() => normalize(baseDef({ stops: [{ name: 'far', lat: 38.52, lng: 68.76 }] })), /from the route line/);
  assert.throws(() => normalize(baseDef({ path: [[0, 0], [0, 1]] })), /outside Tajikistan/);
  assert.throws(() => normalize(baseDef({ id: 'bad id!' })), /route id/);
  const r = normalize(baseDef({ timetable: ['10:00', '25:99', '9:30'] }));
  assert.deepEqual(r.timetable, [570, 600]);
});

test('tracker: speed, ETA and delay for a bus running close to plan', () => {
  const { route, tr } = mk();
  const d = phone(route, 1000);
  tr.ping(d, T0);
  const r = tr.ping(same(d, route, 1300), T0 + 60000);       // 300 m in 60 s = 5 m/s
  assert.equal(r.ok, true);
  const b = tr.snapshot(T0 + 60000).buses[0];
  assert.equal(b.dir, 1);
  assert.ok(Math.abs(b.vObs - 5) < 0.2, 'speed ' + b.vObs);
  const c = b.allEtas.find((e) => e.name === 'C');          // stop C at 2500 m, 1200 m ahead
  assert.ok(Math.abs(c.distM - 1200) < 5);
  assert.ok(Math.abs(c.etaSec - 227) < 8, 'eta ' + c.etaSec);   // 1200 / (0.5*5 + 0.5*5.556)
  assert.ok(Math.abs(c.delaySec - 11) < 8, 'delay ' + c.delaySec);
  assert.equal(b.status, 'ontime');
  assert.equal(b.allEtas.some((e) => e.name === 'A' || e.name === 'B'), false, 'stops behind the bus are not listed');
});

test('tracker: a slow bus is reported late, with the extra stop dwell counted', () => {
  const { route, tr } = mk();
  const d = phone(route, 500);
  tr.ping(d, T0);
  tr.ping(same(d, route, 560), T0 + 60000);                  // 1 m/s
  const b = tr.snapshot(T0 + 60000).buses[0];
  assert.equal(b.status, 'slow');
  assert.ok(b.delaySec > 100, 'slow bus loses about 125 s per km, got ' + b.delaySec);
  const dd = b.allEtas.find((e) => e.name === 'D');         // two stops (B and C) in between
  const plan = (dd.distM / (20 / 3.6)) + 2 * 15;
  assert.ok(Math.abs((dd.etaSec - dd.delaySec) - plan) < 3, 'planned time should be ' + plan + ' got ' + (dd.etaSec - dd.delaySec));
  assert.ok(dd.delaySec > 120);
});

test('tracker: guessed position moves on between pings but stops after 3 minutes', () => {
  const { route, tr } = mk();
  const d = phone(route, 1000);
  tr.ping(d, T0);
  tr.ping(same(d, route, 1300), T0 + 60000);
  const b30 = tr.snapshot(T0 + 90000).buses[0];
  assert.ok(Math.abs(b30.sNow - 1450) < 15, 'sNow ' + b30.sNow);                       // 30 s at 5 m/s
  const b200 = tr.snapshot(T0 + 60000 + 199000).buses[0];
  assert.ok(Math.abs(b200.sNow - (1300 + 180 * 5)) < 15, 'capped sNow ' + b200.sNow);
  assert.equal(b200.stale, true);
  assert.equal(tr.snapshot(T0 + 60000 + 205000).buses.length, 0, 'forgotten after staleMs');
});

test('tracker: phones on the same bus become one bus and the driver counts first', () => {
  const { route, tr } = mk();
  const drv = phone(route, 2000, 'driver'), pax = phone(route, 2060, 'onbus'), other = phone(route, 3000, 'onbus');
  [drv, pax, other].forEach((p) => tr.ping(p, T0));
  [drv, pax, other].forEach((p) => tr.ping(same(p, route, p === drv ? 2300 : p === pax ? 2360 : 3300), T0 + 60000));
  const s = tr.snapshot(T0 + 60000);
  assert.equal(s.buses.length, 2);
  const front = s.buses.find((b) => b.count === 2);
  assert.equal(front.hasDriver, true);
  assert.ok(Math.abs(front.s - 2300) < 5, 'uses the driver position, got ' + front.s);
  const lead = s.buses.find((b) => b.count === 1), trail = front;
  assert.ok(trail.gapAheadSec > 100 && trail.gapAheadSec < 300, 'gap ' + trail.gapAheadSec);
  assert.equal(lead.gapAheadSec, null);
  assert.ok(lead.gapBehindSec > 100);
});

test('tracker: off-route phones are not buses; wild jumps are refused; riders are separate', () => {
  const { route, tr } = mk();
  const off = phone(route, 2000, 'driver', { lat: at(route, 2000, 400).lat });
  tr.ping(off, T0);
  let s = tr.snapshot(T0 + 1000);
  assert.equal(s.buses.length, 0);
  assert.equal(s.loose.length, 1);
  assert.equal(s.loose[0].offRoute, true);
  const d = phone(route, 1000);
  tr.ping(d, T0);
  const r = tr.ping(same(d, route, 4500), T0 + 20000);      // 3.5 km in 20 s
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'jump');
  const rider = { id: 'rider' + 'x'.repeat(16), pub: 'r1', mode: 'rider', route: '', type: 'bus', lat: 38.5, lng: 68.76, speed: null };
  tr.ping(rider, T0);
  s = tr.snapshot(T0 + 1000);
  assert.equal(s.riders.length, 1);
  assert.deepEqual(tr.stats(T0 + 1000), { riders: 1, onbus: 0, drivers: 2 });
});

test('tracker: unknown route is kept as a loose phone; fast repeat pings are ignored', () => {
  const { route, tr } = mk();
  const lost = phone(route, 1000, 'onbus', { route: 'NOPE' });
  tr.ping(lost, T0);
  assert.equal(tr.snapshot(T0).loose[0].unknownRoute, true);
  const d = phone(route, 1000);
  tr.ping(d, T0);
  assert.equal(tr.ping(same(d, route, 1100), T0 + 1000).throttled, true);
});

test('tracker: two-way routes detect direction; one-way routes drop buses going the wrong way', () => {
  let { route, tr } = mk({ twoWay: true });
  let d = phone(route, 3000);
  tr.ping(d, T0);
  tr.ping(same(d, route, 2700), T0 + 60000);
  let b = tr.snapshot(T0 + 60000).buses[0];
  assert.equal(b.dir, -1);
  assert.equal(b.allEtas[0].name, 'C');                      // nearest stop behind it in map terms is ahead for this bus
  assert.ok(b.remainingM < 3000);
  ({ route, tr } = mk({ twoWay: false }));
  d = phone(route, 3000);
  tr.ping(d, T0);
  tr.ping(same(d, route, 2700), T0 + 60000);
  assert.equal(tr.snapshot(T0 + 60000).buses.length, 0);
});

test('tracker: delay against a timetable', () => {
  const { route, tr } = mk({ timetable: ['10:00'] });
  const now = T0 + 10 * 60000;                                // 10:10 local, planned position = 5.556 * 600 = 3333 m
  const early = phone(route, 2900), late = phone(route, 1900);
  tr.ping(early, now - 60000); tr.ping(late, now - 60000);
  tr.ping(same(early, route, 3000), now); tr.ping(same(late, route, 2000), now);
  const bs = tr.snapshot(now).buses;
  const e = bs.find((b) => b.s === 3000), l = bs.find((b) => b.s === 2000);
  assert.ok(Math.abs(e.schedDelaySec - 60) < 6, 'sched delay ' + e.schedDelaySec);
  assert.equal(e.status, 'ontime');
  assert.ok(Math.abs(l.schedDelaySec - 240) < 6, 'sched delay ' + l.schedDelaySec);
  assert.equal(l.status, 'late');
});

test('tracker: arrivals at one stop are sorted by time', () => {
  const { route, tr } = mk();
  const a = phone(route, 200), b = phone(route, 700);
  [a, b].forEach((p) => tr.ping(p, T0));
  tr.ping(same(a, route, 500), T0 + 60000); tr.ping(same(b, route, 1000), T0 + 60000);
  const list = tr.arrivals('T1', 's4', T0 + 60000);          // stop D at 4000 m
  assert.equal(list.length, 2);
  assert.ok(list[0].etaSec < list[1].etaSec);
  assert.ok(list[0].distM < list[1].distM);
});

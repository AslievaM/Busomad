'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { build, parseTracks } = require('../tools/build-route');
const geo = require('../lib/geo');

/* A straight road of about 3 km north from Dushanbe centre, a phone every 5 s at 8 m/s with GPS noise, and two 40 s stops. */
function trip(opts) {
  opts = opts || {};
  const out = []; let ts = Date.UTC(2026, 10, 25, 5, 0, 0), lat = 38.5600, lng = 68.7700, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const stopsAt = [360, 1520];
  for (let d = 0; d <= 3000; d += 40) {
    const dwell = stopsAt.some((s) => Math.abs(d - s) < 1) ? 9 : 1;
    for (let k = 0; k < dwell; k++) { out.push({ ts, pub: opts.pub || 'aaa', mode: 'driver', route: '25', lat: lat + d / 111195 + rnd() * 2e-5, lng: lng + rnd() * 2e-5, acc: 12 }); ts += 5000; }
  }
  return out;
}

test('builds a route from a noisy trip', () => {
  const r = build(trip(), { id: '25', name: 'Test' });
  assert.ok(Math.abs(r.lengthM - 3000) < 120, 'length ' + r.lengthM);
  assert.ok(r.stops >= 4, 'stops ' + r.stops);          // start, 2 dwells, end
  assert.strictEqual(r.def.id, '25');
});

test('ignores a rider phone with fewer positions and a GPS jump', () => {
  const pts = trip().concat(trip({ pub: 'bbb' }).slice(0, 5));
  pts.splice(20, 0, { ts: pts[19].ts + 1000, pub: 'aaa', mode: 'driver', route: '25', lat: 39.5, lng: 69.5, acc: 10 });
  const r = build(pts, { id: '25' });
  assert.ok(Math.abs(r.lengthM - 3000) < 120, 'length ' + r.lengthM);
});

test('warns when positions are far apart', () => {
  const sparse = trip().filter((p, i) => i % 40 === 0);
  const r = build(sparse, { id: '25' });
  assert.ok(r.notes.some((n) => /WARNING/.test(n)));
});

test('reads ndjson and rejects a bad id', () => {
  const text = trip().map((p) => JSON.stringify(p)).join('\n') + '\nnot json\n';
  assert.ok(parseTracks(text).length > 50);
  assert.throws(() => build(trip(), { id: 'too-long-id' }));
});

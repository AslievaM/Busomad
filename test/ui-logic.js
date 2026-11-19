'use strict';
const test = require('node:test');
const assert = require('node:assert');
const TH = require('../public/theme.js');
const N = require('../public/net.js');

const P = TH.PALETTE;
const fixture = {
  version: 8, name: 'Liberty', glyphs: 'https://x/fonts/{fontstack}/{range}.pbf', sprite: 'https://x/sprite',
  sources: { openmaptiles: { type: 'vector', url: 'https://x/planet' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': 'rgb(248,244,240)' } },
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': { stops: [[1, 'green']] } } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': 'rgb(158,189,255)' } },
    { id: 'landcover_ice', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', paint: { 'fill-color': '#fff' } },
    { id: 'waterway_river', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': 'blue' } },
    { id: 'road_service_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#fff' } },
    { id: 'road_motorway', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': 'orange' } },
    { id: 'road_secondary_tertiary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#fea' } },
    { id: 'road_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#fff' } },
    { id: 'road_path_pedestrian', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#ccc' } },
    { id: 'tunnel_motorway', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': 'orange' } },
    { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', paint: { 'fill-color': '#ddd' } },
    { id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', paint: { 'fill-extrusion-color': '#ddd' } },
    { id: 'poi_r20', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', layout: { 'icon-image': 'shop', 'text-field': '{name}' } },
    { id: 'highway-shield', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', layout: { 'icon-image': 'shield' } },
    { id: 'label_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-field': '{name}', 'text-font': ['Noto Sans Bold'] } },
    { id: 'label_other', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-field': '{name}', 'text-font': ['Noto Sans Regular'] } }
  ]
};
const by = (s, id) => s.layers.find((l) => l.id === id);

test('theme repaints every layer kind and hides shop icons', () => {
  const before = JSON.stringify(fixture);
  const s = TH.themeStyle(fixture);
  assert.strictEqual(JSON.stringify(fixture), before, 'input style must not change');
  assert.strictEqual(by(s, 'background').paint['background-color'], P.land);
  assert.strictEqual(by(s, 'park').paint['fill-color'], P.green);
  assert.strictEqual(by(s, 'water').paint['fill-color'], P.water);
  assert.strictEqual(by(s, 'landcover_ice').paint['fill-color'], P.ice);
  assert.strictEqual(by(s, 'waterway_river').paint['line-color'], P.waterLine);
  assert.strictEqual(by(s, 'road_service_casing').paint['line-color'], P.casing);
  assert.strictEqual(by(s, 'road_motorway').paint['line-color'], P.roadMajor);
  assert.strictEqual(by(s, 'road_secondary_tertiary').paint['line-color'], P.roadMid);
  assert.strictEqual(by(s, 'road_minor').paint['line-color'], P.roadMinor);
  assert.strictEqual(by(s, 'road_path_pedestrian').paint['line-color'], P.path);
  assert.strictEqual(by(s, 'tunnel_motorway').paint['line-opacity'], 0.5);
  assert.strictEqual(by(s, 'building').paint['fill-color'], P.building);
  assert.strictEqual(by(s, 'building-3d').paint['fill-extrusion-color'], P.building3d);
  assert.strictEqual(by(s, 'poi_r20').layout.visibility, 'none');
  assert.strictEqual(by(s, 'highway-shield').layout.visibility, 'none');
  assert.strictEqual(by(s, 'label_city').paint['text-color'], P.textStrong);
  assert.strictEqual(by(s, 'label_other').paint['text-color'], P.text);
  assert.strictEqual(by(s, 'label_city').paint['text-halo-color'], P.land);
  assert.ok(s.glyphs && s.sprite && s.sources.openmaptiles, 'sources and glyphs kept');
});

test('pickFont copies the first static font stack, else a safe default', () => {
  assert.deepStrictEqual(TH.pickFont(fixture), ['Noto Sans Bold']);
  assert.deepStrictEqual(TH.pickFont({ layers: [{ layout: { 'text-font': ['literal', ['A', 'B']] } }] }), ['A', 'B']);
  assert.deepStrictEqual(TH.pickFont({ layers: [] }), ['Noto Sans Regular']);
});

// ---- network helpers ----
const mk = (id, type, stops, extra) => Object.assign({ id, type, name: 'Route ' + id, plannedSpeedKmh: 20, twoWay: false, stops: stops.map((s, i) => ({ id: 's' + (i + 1), name: s[0], lat: s[1], lng: s[2], s: s[3] })) }, extra || {});
const routes = [
  mk('8', 'bus', [['Airport', 38.55, 68.80, 0], ['Center', 38.56, 68.78, 2000], ['West', 38.57, 68.76, 4000]]),
  mk('1', 'trolley', [['South', 38.52, 68.78, 0], ['Center stop', 38.56003, 68.78003, 2500], ['North', 38.60, 68.78, 5000]], { twoWay: true })
];

test('stops of different routes within 60 m become one place', () => {
  const c = N.clusterStops(routes);
  assert.strictEqual(c.length, 5);
  const center = c.find((k) => k.members.length === 2);
  assert.ok(center && center.name === 'Center');
  assert.deepStrictEqual(center.members.map((m) => m.route).sort(), ['1', '8']);
});

test('direct trip, direction and destination', () => {
  const c = N.clusterStops(routes);
  const id = (name) => c.find((k) => k.name === name).id;
  const p = N.plan(routes, c, id('Airport'), id('West'));
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].legs[0].route, '8');
  assert.strictEqual(p[0].legs[0].dir, 1);
  assert.strictEqual(p[0].legs[0].dest, 'West');
  assert.strictEqual(p[0].legs[0].distM, 4000);
  assert.strictEqual(p[0].legs[0].stops, 2);
  assert.strictEqual(p[0].change, false);
  assert.strictEqual(N.plan(routes, c, id('West'), id('Airport')).filter((o) => !o.change).length, 0, 'one-way route is not ridden backwards');
});

test('trip with one change, two-way route, live wait', () => {
  const c = N.clusterStops(routes);
  const id = (name) => c.find((k) => k.name === name).id;
  const p = N.plan(routes, c, id('Airport'), id('North'), { liveWait: (r, st, dir) => (r === '8' ? 240 : null) });
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].change, true);
  assert.deepStrictEqual(p[0].legs.map((l) => l.route), ['8', '1']);
  assert.strictEqual(p[0].legs[0].waitSec, 240);
  assert.ok(p[0].totalSec > 240 + N.TRANSFER_WAIT);
  const back = N.plan(routes, c, id('North'), id('South'));
  assert.strictEqual(back[0].legs[0].dir, -1);
  assert.strictEqual(back[0].legs[0].dest, 'South');
  assert.strictEqual(N.plan(routes, c, id('Airport'), id('Airport')).length, 0);
});

test('nearest place', () => {
  const c = N.clusterStops(routes);
  const n = N.nearest(c, 38.5601, 68.7801, 500);
  assert.strictEqual(n.cluster.name, 'Center');
  assert.strictEqual(N.nearest(c, 40, 70, 500), null);
});

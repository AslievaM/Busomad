'use strict';
/*
 * End-to-end test with simulated phones: starts the real server, opens the real page in headless Chromium with a stand-in map
 * library, and plays a driver, a watcher, a waiting rider and an admin. Run: node test/e2e.js
 * It cannot check how the map looks; it checks that everything the app does around the map works.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const PORT = 3233, BASE = 'http://localhost:' + PORT, ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync('/tmp/rasid-e2e-');
const mock = fs.readFileSync(path.join(__dirname, 'maplibre-mock.js'), 'utf8');
const style = { version: 8, glyphs: 'https://x/{fontstack}/{range}.pbf', sources: { o: { type: 'vector', url: 'https://x/planet' } }, layers: [
  { id: 'background', type: 'background', paint: { 'background-color': 'white' } },
  { id: 'water', type: 'fill', source: 'o', 'source-layer': 'water', paint: { 'fill-color': 'blue' } },
  { id: 'poi', type: 'symbol', source: 'o', 'source-layer': 'poi', layout: { 'icon-image': 'x' } },
  { id: 'label_city', type: 'symbol', source: 'o', 'source-layer': 'place', layout: { 'text-field': '{name}', 'text-font': ['Noto Sans Bold'] } }] };

let failed = 0;
const ok = (c, m) => { if (c) console.log('  ok   ' + m); else { failed++; console.log('  FAIL ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (u, b, h) => fetch(BASE + u, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}), body: JSON.stringify(b) }).then((r) => r.json());

async function openPage(browser, geo, url) {
  const ctx = await browser.newContext({ geolocation: geo, permissions: ['geolocation'], viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (/maplibre-gl\.js/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: mock });
    if (/qrcode/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return \'<svg viewBox="0 0 9 9"><rect width="9" height="9"/></svg>\'}}}' });
    if (/styles\/liberty/.test(u)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(style) });
    if (/\.css/.test(u) || /fonts\.g/.test(u)) return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [], pings = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => { if (r.url().endsWith('/api/ping') && r.method() === 'POST') pings.push(r.postData()); });
  await page.goto(BASE + url);
  return { ctx, page, errors, pings };
}

(async () => {
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), ADMIN_CODE: 'abc', DATA_DIR: DATA }) });
  srv.stderr.on('data', (d) => process.stdout.write('[srv err] ' + d));
  await sleep(700);
  const H = { 'X-Admin-Code': 'abc' };
  const line = (pts) => pts;
  await post('/api/admin/route', { id: '8', name: 'Airport - West', type: 'bus', path: [[38.56, 68.755], [38.56, 68.805]], stops: [{ name: 'Airport', lat: 38.56, lng: 68.765 }, { name: 'Center', lat: 38.56, lng: 68.78 }, { name: 'Bazaar', lat: 38.56, lng: 68.795 }] }, H);
  await post('/api/admin/route', { id: '1', name: 'South - North', type: 'trolley', twoWay: true, path: [[38.54, 68.78], [38.58, 68.78]], stops: [{ name: 'South', lat: 38.545, lng: 68.78 }, { name: 'Center stop', lat: 38.56, lng: 68.78 }, { name: 'North', lat: 38.575, lng: 68.78 }] }, H);

  const browser = await chromium.launch();
  try {
    console.log('Phone B: watcher');
    const B = await openPage(browser, { latitude: 38.55, longitude: 68.77 }, '/?fast=1');
    const pb = B.page; globalThis.__errs = B.errors;
    await pb.waitForFunction(() => window.__map && window.__map.layers.length > 5);
    ok(true, 'map created and route/stop layers added');
    const themed = await pb.evaluate(() => ({ bg: window.__map.o.style.layers[0].paint['background-color'], poi: window.__map.o.style.layers[2].layout.visibility, hasGlyphs: !!window.__map.o.style.glyphs, labels: window.__map.layers.some((l) => l.id === 'stop-label') }));
    ok(themed.bg === '#0C1A16' && themed.poi === 'none', 'fetched style was repainted in Rasid colours');
    ok(themed.labels, 'stop labels added with the style font');
    const feats = await pb.evaluate(() => ({ r: window.__data.routes.features.length, s: window.__data.stops.features.length }));
    ok(feats.r === 2 && feats.s === 5, 'two route lines and five places (the two Center stops merged): ' + JSON.stringify(feats));
    ok((await pb.locator('#routes .rbtn').count()) === 2, 'two route buttons');
    ok((await pb.textContent('#live-t')).indexOf('Live') === 0, 'live badge connected');

    console.log('Phone A: driver on route 8');
    const A = await openPage(browser, { latitude: 38.56, longitude: 68.770 }, '/?fast=1');
    const pa = A.page;
    await pa.click('#tabs [data-tab="share"]');
    await pa.click('#mode-seg [data-m="driver"]');
    await pa.selectOption('#sh-route', '8');
    await pa.click('#sh-start');
    await pb.waitForSelector('.busm', { timeout: 15000 });
    ok(true, 'bus marker appeared on phone B after the driver started');
    ok((await pb.textContent('.busm b')) === '8', 'marker shows route number 8');
    ok(A.pings.length >= 1 && JSON.parse(A.pings[0]).mode === 'driver', 'driver phone posted a driver ping');
    await pa.waitForSelector('#share-stat');
    await pa.waitForFunction(() => /Matched/.test(document.getElementById('share-stat').textContent), null, { timeout: 15000 });
    ok(true, 'driver phone reports it is matched to the route');

    console.log('Stop panel and follow');
    await pb.selectOption('#stop-sel', { label: 'Center · 8, 1' });
    await pb.waitForSelector('#arrivals .row', { timeout: 15000 });
    const row = await pb.textContent('#arrivals .row');
    ok(/8/.test(row) && /→ Bazaar/.test(row) && /min|Due/.test(row), 'arrival row: ' + row.replace(/\s+/g, ' ').trim());
    await pb.click('#arrivals .row');
    await pb.waitForSelector('#buscard:not([hidden])');
    ok((await pb.locator('#bus-next .nx').count()) >= 1, 'following card lists next stops');
    ok(await pb.evaluate(() => window.__calls.some((c) => c[0] === 'easeTo' && c[1].center)), 'camera followed the bus');
    await pb.evaluate(() => window.__map.fire('dragstart'));
    ok(await pb.locator('#relock').count() === 1, 'dragging the map releases the follow lock');
    await pb.click('#relock');
    await pb.click('#unfollow');
    ok(await pb.locator('#buscard[hidden]').count() === 1, 'unfollow hides the card');
    await pb.click('#routes .rbtn[data-route="1"]');
    ok(await pb.evaluate(() => JSON.stringify(window.__map.paint['route-line.line-opacity']).indexOf('"1"') > 0), 'selecting a route dims the others on the map');
    ok(await pb.locator('.busm.dim').count() === 1, 'bus on the other route is dimmed');
    await pb.click('#routes .rbtn[data-route="1"]');
    await pb.evaluate(() => window.__map.fire('click', 'stop-hit', { features: [{ properties: { k: '8:s1' } }] }));
    ok((await pb.inputValue('#stop-sel')) === '8:s1', 'tapping a stop on the map selects it');

    console.log('Board');
    await pb.selectOption('#stop-sel', { label: 'Center · 8, 1' });
    await pb.click('#tabs [data-tab="board"]');
    await pb.waitForSelector('#b-rows .b-row .chip');
    ok((await pb.textContent('#b-stop')) === 'Center', 'board shows the stop name');
    ok((await pb.locator('#qr svg').count()) === 1, 'board has a QR code');
    ok((await pb.locator('#map-mini circle').count()) >= 3, 'mini map shows the bus near the stop');
    await pb.uncheck('#b-rotate');
    await pb.click('#langseg [data-lang="ru"]');
    ok((await pb.textContent('#bc-dest')) === 'Куда', 'board columns follow the chosen language');
    await pb.click('#langseg [data-lang="en"]');

    console.log('Trip planner');
    await pb.click('#tabs [data-tab="plan"]');
    await pb.selectOption('#plan-from', { label: 'Airport · 8' });
    await pb.selectOption('#plan-to', { label: 'North · 1' });
    await pb.waitForSelector('#plan-results .opt');
    const plan = await pb.textContent('#plan-results');
    ok(/1 change/.test(plan) && /Change at/.test(plan) && /Center/.test(plan), 'trip with one change found via Center');
    ok(/no live bus now/.test(plan), 'no live wait shown for a stop the bus has already passed');
    await pb.selectOption('#plan-from', { label: 'Center · 8, 1' });
    await pb.selectOption('#plan-to', { label: 'Bazaar · 8' });
    await pb.waitForSelector('#plan-results .opt');
    const plan2 = await pb.textContent('#plan-results');
    ok(/Direct/.test(plan2) && /next bus in/.test(plan2), 'direct trip with the live bus wait');
    await pb.selectOption('#plan-from', { label: 'Airport · 8' });
    await pb.selectOption('#plan-to', { label: 'Airport · 8' });
    ok(/different stops/.test(await pb.textContent('#plan-results')), 'same stop is refused');

    console.log('Waiting rider sends nothing');
    await pb.click('#tabs [data-tab="share"]');
    await pb.click('#mode-seg [data-m="rider"]');
    await pb.click('#sh-start');
    await pb.waitForFunction(() => /Nearest stop/.test(document.getElementById('share-card').textContent), null, { timeout: 10000 });
    ok(true, 'nearest stop shown to the waiting rider');
    await sleep(1500);
    ok(B.pings.length === 0, 'no position was sent to the server by the waiting rider');
    const health = await (await fetch(BASE + '/health')).json();
    ok(health.riders === 0 && health.drivers === 1, 'server holds the driver only: ' + JSON.stringify(health));
    await pb.click('#sh-stop');

    console.log('Admin records a route');
    await pb.click('#tabs [data-tab="admin"]');
    await pb.fill('#rc-code', 'abc'); await pb.fill('#rc-id', 'T9'); await pb.fill('#rc-name', 'Test loop');
    await pb.click('#rc-start');
    const walk = [[38.57, 68.77], [38.5703, 68.7703], [38.5706, 68.7706], [38.5709, 68.7709], [38.5712, 68.7712], [38.5715, 68.7715], [38.5718, 68.7718], [38.5721, 68.7721]];
    for (let i = 0; i < walk.length; i++) {
      await B.ctx.setGeolocation({ latitude: walk[i][0], longitude: walk[i][1], accuracy: 8 });
      await sleep(250);
      if (i === 1 || i === 6) { await pb.fill('#rc-stopname', 'Stop ' + i); await pb.click('#rc-add'); }
    }
    ok(/\d+ points/.test(await pb.textContent('#rc-stat')), 'recorder counts points');
    await pb.click('#rc-end');
    await pb.waitForFunction(() => document.querySelectorAll('#routes .rbtn').length === 3, null, { timeout: 8000 });
    const routes = await (await fetch(BASE + '/api/routes')).json();
    const t9 = routes.find((r) => r.id === 'T9');
    ok(t9 && t9.stops.length === 2 && t9.length > 50, 'route T9 saved with 2 stops, length ' + (t9 && t9.length) + ' m');
    ok(await pb.evaluate(() => window.__calls.some((c) => c[0] === 'setData' && c[1] === 'rec')), 'recording preview was drawn on the map');
    const bad = await fetch(BASE + '/api/admin/route', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Code': 'wrong' }, body: '{}' });
    ok(bad.status === 401, 'wrong admin code is refused');

    console.log('Driver leaves');
    await pa.click('#sh-stop');
    await pb.waitForFunction(() => document.querySelectorAll('.busm').length === 0, null, { timeout: 8000 });
    ok(true, 'bus disappears from the map when the driver stops sharing');

    console.log('Kiosk screen');
    const K = await openPage(browser, { latitude: 38.5, longitude: 68.7 }, '/?view=board&kiosk=1&stop=8:s2&lang=tg');
    await K.page.waitForSelector('#b-rows .b-row');
    ok((await K.page.textContent('#b-stop')) === 'Center', 'kiosk link opens the right stop');
    ok(!(await K.page.isVisible('.tabs')), 'kiosk hides the tabs');

    const allErrors = [].concat(A.errors, B.errors, K.errors);
    ok(allErrors.length === 0, 'no page errors' + (allErrors.length ? ': ' + allErrors.join(' | ') : ''));
  } catch (e) {
    failed++; console.log('  FAIL exception: ' + (e && e.stack || e)); console.log('page errors: ' + JSON.stringify(globalThis.__errs));
  } finally {
    await browser.close(); srv.kill();
  }
  console.log(failed ? '\n' + failed + ' check(s) FAILED' : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})();

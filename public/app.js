'use strict';
/* Busomad app screen: real map in the demo's look, live buses, stop board, trip planner, sharing, route recorder. */
(function () {
  const N = window.RasidNet, TH = window.RasidTheme, P = TH.PALETTE;
  const $ = (id) => document.getElementById(id);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const qs = new URLSearchParams(location.search);
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const LANGS = ['en', 'ru', 'tg'];

  /* ---------- text (ru and tg are drafts: a native speaker should check them) ---------- */
  const I18N = {
    en: { tagline: 'Stop guessing. Start riding.', tabMap: 'Map', tabBoard: 'Stop board', tabPlan: 'Plan a trip', tabShare: 'Share my bus', tabAdmin: 'Routes',
      live: 'Live', connecting: 'Connecting', busesN: 'buses', busOne: 'bus', tilt: '3D view', showAll: 'Show all routes', stop: 'Stop', arrivals: 'Next arrivals', noBuses: 'No buses expected soon.',
      followHint: 'Tap a bus on the map or a row above to follow it.', following: 'Following', unfollow: 'Stop following', recenter: 'Follow again',
      min: 'min', due: 'Due', onTime: 'On time', late: 'Late', early: 'Early', slow: 'Slower than planned', fast: 'Faster than planned', newBus: 'Tracking',
      speed: 'Speed', kmh: 'km/h', phones: 'phones', driver: 'driver', nextStops: 'Next stops', bus: 'Bus', trolley: 'Trolleybus', mini: 'Minibus', m: 'm', km: 'km', sec: 's',
      colLine: 'Line', colDest: 'Destination', colEta: 'Arrives', kicker: 'Next arrivals', scan: 'Scan for live times on your phone', rotate: 'Rotate languages', fullscreen: 'Full screen',
      planTitle: 'Which bus do I take?', from: 'From', to: 'To', swap: 'Swap', direct: 'Direct', change1: '1 change', boardAt: 'Board at', nextIn: 'next bus in', noLive: 'no live bus now', ride: 'Ride', stopsWord: 'stops', getOff: 'get off at', changeAt: 'Change at', total: 'Total', same: 'Choose two different stops.', noRoute: 'No route found in the current network.', assumed: 'Waiting time at a change is assumed to be 5 minutes.',
      recNow: 'Recording a route. Use the bar above the map to add stops and to finish.', phone: 'phone', noRoutes: 'No routes yet. Open the Routes tab to record the first one.', mapNote: 'Live positions come from phones of drivers and passengers. Times are estimates.', fallbackMap: 'Basic map is shown because the styled map could not be loaded.',
      shareTitle: 'Share my bus', exportRoutes: 'Download routes (backup)', exportHint: 'Render forgets saved routes when it restarts. Download them, put the file in data/routes.json and push to GitHub.', exported: 'routes.json downloaded', iDrive: 'I drive', onBus: 'I am on a bus', waiting: 'I am waiting', waitingHelp: 'Your position stays on this phone. It only shows you on the map and finds the nearest stop. Nothing is sent.',
      onBusHelp: 'Optional. Your phone adds the bus position when no driver is sharing. Others see one bus, not you.', driveHelp: 'Your phone sends the bus position about once a minute while this page is open.',
      route: 'Route', vehicle: 'Vehicle', start: 'Start', stopShare: 'Stop', driverCode: 'Driver code', localOnly: 'Your location stays on this phone. Nothing is sent.', sharingNow: 'Sharing. A position goes out every', gps: 'Waiting for GPS…', lastSent: 'Last sent', ago: 'ago', offRoute: 'You are off the route line', tracked: 'Matched to the route',
      gpsDenied: 'Location is blocked. Allow it in the browser settings.', noGps: 'This browser has no location.', needRoute: 'Choose a route first.', sentFail: 'Could not reach the server', wrongCode: 'Wrong driver code', nearest: 'Nearest stop', away: 'away', showStop: 'Show arrivals',
      adminTitle: 'Routes', adminCode: 'Admin code', routeId: 'Route number (letters or digits, max 6)', routeName: 'Name', twoWay: 'The same line is used both ways', planned: 'Planned speed km/h', recStart: 'Start recording', recStop: 'Stop and save', addStop: 'Add stop here', stopName: 'Stop name', points: 'points', stopsN: 'stops', saved: 'Saved', del: 'Delete route', recHint: 'Ride or walk the whole route once with this page open. Tap "Add stop here" at every stop. Then stop and save.', adminOff: 'Route editing is off on this server. Set ADMIN_CODE.', hereStop: 'Stop' },
    ru: { tagline: 'Хватит гадать. Просто езжайте.', tabMap: 'Карта', tabBoard: 'Табло остановки', tabPlan: 'Маршрут', tabShare: 'Мой автобус', tabAdmin: 'Маршруты',
      live: 'Онлайн', connecting: 'Подключение', busesN: 'автобусов', tilt: '3D вид', showAll: 'Все маршруты', stop: 'Остановка', arrivals: 'Ближайшие автобусы', noBuses: 'Скоро автобусов нет.',
      followHint: 'Нажмите на автобус на карте или на строку выше, чтобы следить за ним.', following: 'Слежение', unfollow: 'Перестать следить', recenter: 'Следить снова',
      min: 'мин', due: 'Сейчас', onTime: 'По графику', late: 'Опаздывает', early: 'Раньше', slow: 'Медленнее плана', fast: 'Быстрее плана', newBus: 'Отслеживается',
      speed: 'Скорость', kmh: 'км/ч', phones: 'телефонов', driver: 'водитель', nextStops: 'Следующие остановки', bus: 'Автобус', trolley: 'Троллейбус', mini: 'Маршрутка', m: 'м', km: 'км', sec: 'с',
      colLine: 'Линия', colDest: 'Куда', colEta: 'Прибытие', kicker: 'Ближайшие автобусы', scan: 'Сканируйте, чтобы видеть время в телефоне', rotate: 'Менять язык', fullscreen: 'На весь экран',
      planTitle: 'На каком автобусе ехать?', from: 'Откуда', to: 'Куда', swap: 'Поменять', direct: 'Без пересадок', change1: '1 пересадка', boardAt: 'Садитесь на', nextIn: 'следующий через', noLive: 'нет данных о ближайшем', ride: 'Проехать', stopsWord: 'ост.', getOff: 'выйти на', changeAt: 'Пересадка на', total: 'Всего', same: 'Выберите две разные остановки.', noRoute: 'Маршрут в сети не найден.', assumed: 'Ожидание на пересадке принято равным 5 минутам.',
      recNow: 'Идёт запись маршрута. Остановки и завершение — в панели над картой.', phone: 'телефон', noRoutes: 'Маршрутов пока нет. Запишите первый во вкладке «Маршруты».', mapNote: 'Положение автобусов передают телефоны водителей и пассажиров. Время приблизительное.', fallbackMap: 'Показана простая карта: стилизованную загрузить не удалось.',
      shareTitle: 'Мой автобус', exportRoutes: 'Скачать маршруты (копия)', exportHint: 'Render забывает сохранённые маршруты при перезапуске. Скачайте файл, положите его в data/routes.json и отправьте на GitHub.', exported: 'routes.json скачан', iDrive: 'Я за рулём', onBus: 'Я в автобусе', waiting: 'Я жду', waitingHelp: 'Ваше положение остаётся на этом телефоне. Оно только показывает вас на карте и находит ближайшую остановку. Ничего не отправляется.',
      onBusHelp: 'По желанию. Телефон добавляет положение автобуса, если водитель не передаёт. Другие видят один автобус, а не вас.', driveHelp: 'Телефон отправляет положение автобуса примерно раз в минуту, пока страница открыта.',
      route: 'Маршрут', vehicle: 'Транспорт', start: 'Начать', stopShare: 'Остановить', driverCode: 'Код водителя', localOnly: 'Ваше положение остаётся на этом телефоне. Ничего не отправляется.', sharingNow: 'Передача включена. Положение уходит каждые', gps: 'Ждём GPS…', lastSent: 'Отправлено', ago: 'назад', offRoute: 'Вы вне линии маршрута', tracked: 'Привязано к маршруту',
      gpsDenied: 'Геолокация заблокирована. Разрешите её в настройках браузера.', noGps: 'В этом браузере нет геолокации.', needRoute: 'Сначала выберите маршрут.', sentFail: 'Нет связи с сервером', wrongCode: 'Неверный код водителя', nearest: 'Ближайшая остановка', away: 'от вас', showStop: 'Показать автобусы',
      adminTitle: 'Маршруты', adminCode: 'Код администратора', routeId: 'Номер маршрута (буквы или цифры, до 6)', routeName: 'Название', twoWay: 'Одна линия в обе стороны', planned: 'Плановая скорость км/ч', recStart: 'Начать запись', recStop: 'Остановить и сохранить', addStop: 'Остановка здесь', stopName: 'Название остановки', points: 'точек', stopsN: 'остановок', saved: 'Сохранено', del: 'Удалить маршрут', recHint: 'Проедьте или пройдите весь маршрут с открытой страницей. На каждой остановке нажимайте «Остановка здесь». Потом остановите и сохраните.', adminOff: 'Редактирование выключено на сервере. Задайте ADMIN_CODE.', hereStop: 'Остановка' },
    tg: { tagline: 'Тахмин накунед. Савор шавед.', tabMap: 'Харита', tabBoard: 'Лавҳаи истгоҳ', tabPlan: 'Нақшаи сафар', tabShare: 'Автобуси ман', tabAdmin: 'Хатсайрҳо',
      live: 'Онлайн', connecting: 'Пайвастшавӣ', busesN: 'автобус', tilt: 'Намои 3D', showAll: 'Ҳамаи хатсайрҳо', stop: 'Истгоҳ', arrivals: 'Автобусҳои наздик', noBuses: 'Ба қарибӣ автобус нест.',
      followHint: 'Автобусро дар харита ё сатрро боло пахш кунед, то пайгирӣ шавад.', following: 'Пайгирӣ', unfollow: 'Қатъи пайгирӣ', recenter: 'Боз пайгирӣ',
      min: 'дақ', due: 'Ҳозир', onTime: 'Сари вақт', late: 'Дер мекунад', early: 'Барвақт', slow: 'Аз нақша суст', fast: 'Аз нақша тез', newBus: 'Пайгирӣ мешавад',
      speed: 'Суръат', kmh: 'км/соат', phones: 'телефон', driver: 'ронанда', nextStops: 'Истгоҳҳои оянда', bus: 'Автобус', trolley: 'Троллейбус', mini: 'Маршрутка', m: 'м', km: 'км', sec: 'сон',
      colLine: 'Хат', colDest: 'Ба кучо', colEta: 'Мерасад', kicker: 'Автобусҳои наздик', scan: 'Барои дидани вақт дар телефон скан кунед', rotate: 'Иваз кардани забон', fullscreen: 'Экрани пурра',
      planTitle: 'Бо кадом автобус равам?', from: 'Аз', to: 'То', swap: 'Ивазкунӣ', direct: 'Рост', change1: '1 ивазкунӣ', boardAt: 'Нишастан дар', nextIn: 'автобуси оянда баъд аз', noLive: 'маълумот нест', ride: 'Рафтан', stopsWord: 'истгоҳ', getOff: 'фаромадан дар', changeAt: 'Ивазкунӣ дар', total: 'Ҳама', same: 'Ду истгоҳи гуногунро интихоб кунед.', noRoute: 'Хатсайр ёфт нашуд.', assumed: 'Интизорӣ ҳангоми ивазкунӣ 5 дақиқа ҳисоб шудааст.',
      recNow: 'Сабти хатсайр идома дорад. Истгоҳҳо ва анҷомро дар навори болои харита илова кунед.', phone: 'телефон', noRoutes: 'Ҳоло хатсайр нест. Аввалинро дар «Хатсайрҳо» сабт кунед.', mapNote: 'Мавқеи автобусҳоро телефонҳои ронандаҳо ва мусофирон мефиристанд. Вақт тахминӣ аст.', fallbackMap: 'Харитаи оддӣ нишон дода шуд: услубдор бор нашуд.',
      shareTitle: 'Автобуси ман', exportRoutes: 'Боргирии хатсайрҳо (нусха)', exportHint: 'Render хатсайрҳои захирашударо ҳангоми нав шудан фаромӯш мекунад. Файлро боргирӣ карда, ба data/routes.json гузоред ва ба GitHub фиристед.', exported: 'routes.json боргирӣ шуд', iDrive: 'Ман ронандаам', onBus: 'Ман дар автобус', waiting: 'Ман интизорам', waitingHelp: 'Мавқеи шумо дар ин телефон мемонад. Он танҳо шуморо дар харита нишон медиҳад ва истгоҳи наздикро меёбад. Ҳеҷ чиз фиристода намешавад.',
      onBusHelp: 'Ихтиёрӣ. Агар ронанда нафиристад, телефон мавқеи автобусро илова мекунад. Дигарон як автобусро мебинанд, на шуморо.', driveHelp: 'Телефон мавқеи автобусро тақрибан ҳар дақиқа мефиристад, то ин саҳифа кушода аст.',
      route: 'Хатсайр', vehicle: 'Нақлиёт', start: 'Оғоз', stopShare: 'Қатъ', driverCode: 'Рамзи ронанда', localOnly: 'Мавқеи шумо дар ин телефон мемонад. Ҳеҷ чиз фиристода намешавад.', sharingNow: 'Мубодила фаъол аст. Мавқеъ ҳар', gps: 'Интизори GPS…', lastSent: 'Фиристода шуд', ago: 'пеш', offRoute: 'Шумо берун аз хатсайр ҳастед', tracked: 'Ба хатсайр пайваст шуд',
      gpsDenied: 'Ҷойгиршавӣ масдуд аст. Дар танзимоти браузер иҷозат диҳед.', noGps: 'Ин браузер ҷойгиршавӣ надорад.', needRoute: 'Аввал хатсайрро интихоб кунед.', sentFail: 'Сервер дастнорас аст', wrongCode: 'Рамзи ронанда нодуруст', nearest: 'Истгоҳи наздик', away: 'дуртар', showStop: 'Нишон додани автобусҳо',
      adminTitle: 'Хатсайрҳо', adminCode: 'Рамзи администратор', routeId: 'Рақами хатсайр (то 6 ҳарф/рақам)', routeName: 'Ном', twoWay: 'Як хат ба ду тараф', planned: 'Суръати нақшавӣ км/соат', recStart: 'Оғози сабт', recStop: 'Қатъ ва захира', addStop: 'Истгоҳ дар ин ҷо', stopName: 'Номи истгоҳ', points: 'нуқта', stopsN: 'истгоҳ', saved: 'Захира шуд', del: 'Нест кардани хатсайр', recHint: 'Тамоми хатсайрро бо саҳифаи кушода тай кунед. Дар ҳар истгоҳ тугмаро пахш кунед. Сипас қатъ ва захира кунед.', adminOff: 'Таҳрир дар сервер хомӯш аст. ADMIN_CODE гузоред.', hereStop: 'Истгоҳ' }
  };

  /* ---------- state ---------- */
  const S = {
    lang: 'en', tab: 'map', cfg: { pingMs: 60000, staleMs: 200000, styleUrl: '', tiles: null, driverCodeRequired: false, adminEnabled: false },
    routes: [], rById: {}, clusters: [], cById: {}, live: { ts: 0, buses: [], loose: [] }, liveAt: 0, conn: false,
    selRoute: null, selCluster: null, followId: null, followRoute: null, followPos: null, followLock: true, arr: [], fallbackMap: false, boardLangIdx: 0, nearest: null
  };
  const deviceId = (function () {
    const v = LS.get('rasid.id');
    if (v && /^[A-Za-z0-9_-]{16,64}$/.test(v)) return v;
    const a = new Uint8Array(18); (window.crypto || window.msCrypto).getRandomValues(a);
    const id = btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    LS.set('rasid.id', id); return id;
  })();

  function tr(k, lang) { return (I18N[lang || S.lang] && I18N[lang || S.lang][k]) || I18N.en[k] || k; }
  const t = (k) => tr(k);
  async function api(path, opt) {
    const r = await fetch(path, opt); let j = null;
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw Object.assign(new Error((j && j.error) || ('HTTP ' + r.status)), { status: r.status });
    return j;
  }
  const fmtDist = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' ' + t('km') : (Math.round(m / 10) * 10) + ' ' + t('m'));
  const mins = (sec) => Math.max(1, Math.round(sec / 60));
  const etaHtml = (sec, lang) => (sec < 45 ? '<span class="due">' + esc(tr('due', lang)) + '</span>' : mins(sec) + '<small>' + esc(tr('min', lang)) + '</small>');
  function statusOf(b, lang) {
    const d = b.delaySec == null ? '' : ' ' + mins(Math.abs(b.delaySec)) + ' ' + tr('min', lang);
    switch (b.status) {
      case 'late': return { cls: 'late', text: tr('late', lang) + d };
      case 'early': return { cls: 'ok', text: tr('early', lang) + d };
      case 'slow': return { cls: 'late', text: tr('slow', lang) };
      case 'fast': return { cls: 'ok', text: tr('fast', lang) };
      case 'ontime': return { cls: 'ok', text: tr('onTime', lang) };
      default: return { cls: '', text: tr('newBus', lang) };
    }
  }
  const typeName = (ty, lang) => tr(ty, lang);
  const busesText = (n) => n + ' ' + (n === 1 && I18N[S.lang].busOne ? t('busOne') : t('busesN'));
  const phonesText = (n) => n + ' ' + (n === 1 ? t('phone') : t('phones'));
  const busById = (id) => S.live.buses.filter((b) => b.id === id)[0];
  const clusterName = (c) => c.name;

  /* ---------- route geometry on the client (smooth movement between updates) ---------- */
  function prep(r) {
    const cum = [0];
    for (let i = 1; i < r.path.length; i++) cum.push(cum[i - 1] + N.hav(r.path[i - 1][0], r.path[i - 1][1], r.path[i][0], r.path[i][1]));
    r._cum = cum;
  }
  function pointAt(r, s) {
    const cum = r._cum, total = cum[cum.length - 1];
    s = Math.max(0, Math.min(total, s));
    let lo = 0, hi = cum.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const seg = cum[lo + 1] - cum[lo], f = seg > 0 ? (s - cum[lo]) / seg : 0;
    return [r.path[lo][0] + (r.path[lo + 1][0] - r.path[lo][0]) * f, r.path[lo][1] + (r.path[lo + 1][1] - r.path[lo][1]) * f];
  }
  function livePos(b) {
    const r = S.rById[b.route];
    if (!r || !r._cum) return [b.lat, b.lng];
    const dt = Math.min(60, Math.max(0, (Date.now() - S.liveAt) / 1000));
    return pointAt(r, b.sNow + b.dir * (b.vMove || 0) * dt);
  }

  /* ---------- the map ---------- */
  async function loadStyle() {
    if (S.cfg.styleUrl) {
      try {
        const r = await fetch(S.cfg.styleUrl);
        if (!r.ok) throw new Error('style ' + r.status);
        const raw = await r.json();
        return { style: TH.themeStyle(raw), glyphs: !!raw.glyphs, font: TH.pickFont(raw) };
      } catch (e) { /* fall through to the basic map */ }
    }
    S.fallbackMap = true;
    const tl = S.cfg.tiles || {};
    return {
      glyphs: false, font: ['Noto Sans Regular'],
      style: { version: 8, sources: { base: { type: 'raster', tiles: [tl.url || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: tl.maxZoom || 19, attribution: tl.attribution || '© OpenStreetMap contributors' } },
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': P.land } }, { id: 'base', type: 'raster', source: 'base', paint: { 'raster-saturation': -0.85, 'raster-brightness-max': 0.4, 'raster-contrast': 0.15, 'raster-hue-rotate': 120 } }] }
    };
  }

  const MV = {
    map: null, ready: false, glyphs: false, font: ['Noto Sans Regular'], markers: new Map(), tilted: false, me: null,
    async init() {
      if (!window.maplibregl) { $('map').innerHTML = '<div class="msg err" style="margin:16px">The map library could not be loaded. Check the internet connection.</div>'; return; }
      const st = await loadStyle();
      this.glyphs = st.glyphs; this.font = st.font;
      const map = new maplibregl.Map({ container: 'map', style: st.style, center: [68.787, 38.56], zoom: 11.5, minZoom: 5, maxZoom: 19, maxBounds: [[66.0, 36.0], [76.5, 41.8]], attributionControl: false, dragRotate: true, pitchWithRotate: true });
      this.map = map;
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserLocation: true }), 'top-right');
      map.on('load', () => { this.addLayers(); this.ready = true; this.sync(); this.syncBuses(); renderNote(); });
      map.on('dragstart', () => { if (S.followId && S.followLock) { S.followLock = false; renderBus(); } });
    },
    addLayers() {
      const m = this.map, empty = { type: 'FeatureCollection', features: [] };
      ['routes', 'stops', 'rec', 'recpts'].forEach((id) => m.addSource(id, { type: 'geojson', data: empty }));
      m.addLayer({ id: 'route-glow', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 18, 'line-blur': 10, 'line-opacity': 0 } });
      m.addLayer({ id: 'route-casing', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': P.land, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 5, 16, 13], 'line-opacity': 1 } });
      m.addLayer({ id: 'route-line', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 16, 7], 'line-opacity': 1 } });
      m.addLayer({ id: 'rec-line', type: 'line', source: 'rec', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 4, 'line-dasharray': [1.5, 1.5] } });
      m.addLayer({ id: 'rec-pts', type: 'circle', source: 'recpts', paint: { 'circle-radius': 7, 'circle-color': P.accent, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      m.addLayer({ id: 'stop-ring', type: 'circle', source: 'stops', paint: { 'circle-radius': ['case', ['==', ['get', 'sel'], 1], 17, 0], 'circle-color': 'rgba(242,169,0,0.16)', 'circle-stroke-color': P.accent, 'circle-stroke-width': 2 } });
      m.addLayer({ id: 'stop-dot', type: 'circle', source: 'stops', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 6, 18, 9], 'circle-color': ['case', ['==', ['get', 'sel'], 1], P.accent, P.land], 'circle-stroke-color': '#EAF2EE', 'circle-stroke-width': 2.5 } });
      m.addLayer({ id: 'stop-hit', type: 'circle', source: 'stops', paint: { 'circle-radius': 16, 'circle-color': '#000000', 'circle-opacity': 0 } });
      if (this.glyphs) {
        m.addLayer({ id: 'stop-label', type: 'symbol', source: 'stops', minzoom: 13.2, layout: { 'text-field': ['get', 'name'], 'text-font': this.font, 'text-size': 13, 'text-offset': [0, 1.15], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#EAF2EE', 'text-halo-color': P.land, 'text-halo-width': 2 } });
      }
      m.on('click', 'stop-hit', (e) => { const f = e.features && e.features[0]; if (f) selectCluster(f.properties.k, true); });
      m.on('mouseenter', 'stop-hit', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'stop-hit', () => { m.getCanvas().style.cursor = ''; });
    },
    sync() {
      if (!this.ready) return;
      this.map.getSource('routes').setData({ type: 'FeatureCollection', features: S.routes.map((r) => ({ type: 'Feature', properties: { id: r.id, color: r.color, type: r.type }, geometry: { type: 'LineString', coordinates: r.path.map((p) => [p[1], p[0]]) } })) });
      this.setStops(); this.setSelection();
    },
    setStops() {
      if (!this.ready) return;
      this.map.getSource('stops').setData({ type: 'FeatureCollection', features: S.clusters.map((c) => ({ type: 'Feature', properties: { k: c.id, name: c.name, sel: c.id === S.selCluster ? 1 : 0 }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } })) });
    },
    setSelection() {
      if (!this.ready) return;
      const sel = S.selRoute, m = this.map;
      m.setPaintProperty('route-line', 'line-opacity', sel ? ['case', ['==', ['get', 'id'], sel], 1, 0.22] : 1);
      m.setPaintProperty('route-casing', 'line-opacity', sel ? ['case', ['==', ['get', 'id'], sel], 1, 0.3] : 1);
      m.setPaintProperty('route-glow', 'line-opacity', sel ? ['case', ['==', ['get', 'id'], sel], 0.4, 0] : 0);
    },
    fitRoutes(ids) {
      if (!this.ready) return;
      const b = new maplibregl.LngLatBounds();
      let any = false;
      S.routes.forEach((r) => { if (ids && ids.indexOf(r.id) < 0) return; r.path.forEach((p) => { b.extend([p[1], p[0]]); any = true; }); });
      if (any) this.map.fitBounds(b, { padding: 48, duration: 800, maxZoom: 16 });
    },
    flyTo(lat, lng, zoom) { if (this.ready) this.map.easeTo({ center: [lng, lat], zoom: Math.max(this.map.getZoom(), zoom || 15), duration: 800 }); },
    toggleTilt() {
      if (!this.ready) return false;
      this.tilted = !this.tilted;
      this.map.easeTo({ pitch: this.tilted ? 58 : 0, bearing: this.tilted ? -18 : 0, duration: 900 });
      return this.tilted;
    },
    syncBuses() {
      if (!this.ready) return;
      const seen = new Set();
      S.live.buses.forEach((b) => {
        seen.add(b.id);
        let o = this.markers.get(b.id);
        if (!o) {
          const el = document.createElement('button');
          el.type = 'button'; el.className = 'busm'; el.innerHTML = '<span class="pulse"></span><b></b>';
          const id = b.id;
          el.addEventListener('click', (e) => { e.stopPropagation(); follow(id); });
          const p = livePos(b);
          o = { el, m: new maplibregl.Marker({ element: el }).setLngLat([p[1], p[0]]).addTo(this.map) };
          this.markers.set(b.id, o);
        }
        o.bus = b;
        const dim = S.selRoute && S.selRoute !== b.route;
        o.el.className = 'busm t-' + b.type + (b.status === 'late' || b.status === 'slow' ? ' late' : '') + (S.followId === b.id ? ' sel' : '') + (dim ? ' dim' : '') + (b.stale ? ' stale' : '');
        o.el.querySelector('b').textContent = b.route;
        o.el.setAttribute('aria-label', t('bus') + ' ' + b.route + ' → ' + (S.rById[b.route] ? N.destination(S.rById[b.route], b.dir) : ''));
      });
      this.markers.forEach((o, id) => { if (!seen.has(id)) { o.m.remove(); this.markers.delete(id); } });
      this.tick();
    },
    tick() {
      if (!this.ready) return;
      this.markers.forEach((o) => { const p = livePos(o.bus); o.m.setLngLat([p[1], p[0]]); });
      if (S.followId && S.followLock) {
        const o = this.markers.get(S.followId);
        if (o) { const p = livePos(o.bus); S.followPos = p; this.map.easeTo({ center: [p[1], p[0]], duration: 600, essential: true }); }
      }
    },
    setMe(lat, lng) {
      if (!this.ready) return;
      if (!this.me) { const el = document.createElement('div'); el.className = 'me'; this.me = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(this.map); }
      else this.me.setLngLat([lng, lat]);
    },
    clearMe() { if (this.me) { this.me.remove(); this.me = null; } },
    setRec(points, stops) {
      if (!this.ready) return;
      this.map.getSource('rec').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map((p) => [p[1], p[0]]) } });
      this.map.getSource('recpts').setData({ type: 'FeatureCollection', features: stops.map((s) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) });
    }
  };

  /* ---------- places, selection, follow ---------- */
  function buildNetwork() {
    S.rById = {}; S.routes.forEach((r) => { S.rById[r.id] = r; prep(r); });
    S.clusters = N.clusterStops(S.routes); S.cById = {}; S.clusters.forEach((c) => { S.cById[c.id] = c; });
    const want = qs.get('stop');
    if (!S.selCluster || !S.cById[S.selCluster]) {
      let pick = null;
      if (want) pick = S.clusters.filter((c) => c.id === want || c.members.some((m) => m.route + ':' + m.stopId === want))[0];
      S.selCluster = pick ? pick.id : (S.clusters[0] ? S.clusters[0].id : null);
    }
  }
  function clusterLabel(c) { return c.name + (c.members.length > 1 ? ' · ' + c.members.map((m) => m.route).join(', ') : ' · ' + c.members[0].route); }
  function selectCluster(id, fly) {
    S.selCluster = id; const c = S.cById[id];
    renderStopSelects(); MV.setStops(); refreshArrivals();
    if (S.tab === 'board') renderBoard();
    if (c && fly) { if (S.tab !== 'map') setTab('map'); MV.flyTo(c.lat, c.lng, 15.5); }
  }
  function follow(id) {
    const b = busById(id); if (!b) return;
    S.followId = id; S.followRoute = b.route; S.followLock = true; S.followPos = [b.lat, b.lng];
    if (S.tab !== 'map') setTab('map');
    MV.syncBuses(); renderBus();
    const p = livePos(b); MV.flyTo(p[0], p[1], 15.5);
  }
  function unfollow() { S.followId = null; MV.syncBuses(); renderBus(); }
  function selectRoute(id) {
    S.selRoute = S.selRoute === id ? null : id;
    MV.setSelection(); MV.syncBuses(); renderRouteChips();
    if (S.selRoute) MV.fitRoutes([id]);
  }

  /* ---------- live data ---------- */
  function onLive(s) {
    S.live = s; S.liveAt = Date.now(); S.conn = true;
    if (S.followId && !busById(S.followId)) {   // the leading phone changed: stay with the nearest bus of that route
      let best = null, bd = 400;
      s.buses.forEach((b) => { if (b.route !== S.followRoute || !S.followPos) return; const d = N.hav(b.lat, b.lng, S.followPos[0], S.followPos[1]); if (d < bd) { bd = d; best = b; } });
      S.followId = best ? best.id : null;
    }
    MV.syncBuses(); renderLive(); renderRouteChips(); renderBus(); refreshArrivals(); if (S.tab === 'plan') renderPlan();
  }
  let arrBusy = false;
  async function refreshArrivals() {
    const c = S.cById[S.selCluster];
    if (!c) { S.arr = []; renderArrivals(); renderBoard(); return; }
    if (arrBusy) return;
    arrBusy = true;
    try {
      const lists = await Promise.all(c.members.map((m) => api('/api/arrivals?route=' + encodeURIComponent(m.route) + '&stop=' + encodeURIComponent(m.stopId)).then((l) => l.map((a) => Object.assign({ route: m.route, stopId: m.stopId }, a))).catch(() => [])));
      S.arr = [].concat.apply([], lists).sort((a, b) => a.etaSec - b.etaSec);
    } finally { arrBusy = false; }
    renderArrivals(); renderBoard();
  }
  function connect() {
    const es = new EventSource('/api/stream');
    es.addEventListener('state', (e) => onLive(JSON.parse(e.data)));
    es.onopen = () => { S.conn = true; renderLive(); };
    es.onerror = () => { S.conn = false; renderLive(); };
  }
  async function loadRoutes() {
    S.routes = await api('/api/routes');
    buildNetwork(); MV.sync(); MV.syncBuses();
    renderRouteChips(); renderStopSelects(); renderNote(); renderLegend(); refreshArrivals(); renderPlan(); renderAdmin();
    if (!loadRoutes.fitted && S.routes.length) { loadRoutes.fitted = true; MV.fitRoutes(); }
  }

  /* ---------- rendering ---------- */
  function applyLang() {
    document.documentElement.lang = S.lang;
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('#langseg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang)));
    renderLive(); renderRouteChips(); renderLegend(); renderStopSelects(); renderArrivals(); renderBus(); renderBoard(); renderPlan(); renderShare(); renderAdmin(); renderNote();
  }
  function renderClock() {
    const s = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dushanbe', hour: '2-digit', minute: '2-digit' });
    $('clock').textContent = s; $('b-clock').textContent = s;
  }
  function renderLive() {
    const on = S.conn;
    $('live').className = 'badge' + (on ? ' on' : '');
    $('live-t').textContent = on ? t('live') + ' · ' + busesText(S.live.buses.length) : t('connecting');
  }
  function renderNote() {
    const n = $('map-note');
    n.textContent = !S.routes.length ? t('noRoutes') : (S.fallbackMap ? t('fallbackMap') + ' ' : '') + t('mapNote');
  }
  function renderLegend() {
    $('legend').innerHTML = ['bus', 'trolley', 'mini'].map((k) => '<span class="key"><i style="background:var(--' + (k === 'bus' ? 'accent' : k) + ')"></i>' + esc(t(k)) + '</span>').join('')
      + '<span class="key"><i style="background:var(--warn)"></i>' + esc(t('late')) + '</span>';
  }
  function renderRouteChips() {
    $('routes').innerHTML = S.routes.map((r) => {
      const n = S.live.buses.filter((b) => b.route === r.id).length;
      return '<button type="button" class="rbtn" data-route="' + esc(r.id) + '" aria-pressed="' + (S.selRoute === r.id) + '"><span class="chip sm t-' + esc(r.type) + '">' + esc(r.id) + '</span><span><b>' + esc(r.name) + '</b><br><span class="muted">' + fmtDist(r.length) + ' · ' + r.stops.length + ' ' + esc(t('stopsN')) + ' · ' + esc(busesText(n)) + '</span></span></button>';
    }).join('');
    $$('#routes .rbtn').forEach((b) => { b.onclick = () => selectRoute(b.dataset.route); });
  }
  function renderStopSelects() {
    const opts = S.clusters.map((c) => '<option value="' + esc(c.id) + '"' + (c.id === S.selCluster ? ' selected' : '') + '>' + esc(clusterLabel(c)) + '</option>').join('');
    $('stop-sel').innerHTML = opts; $('b-stop-sel').innerHTML = opts;
    const pf = $('plan-from').value, pt = $('plan-to').value;
    const popts = S.clusters.map((c) => '<option value="' + esc(c.id) + '">' + esc(clusterLabel(c)) + '</option>').join('');
    $('plan-from').innerHTML = popts; $('plan-to').innerHTML = popts;
    if (S.cById[pf]) $('plan-from').value = pf; else if (S.clusters[0]) $('plan-from').value = S.clusters[0].id;
    if (S.cById[pt]) $('plan-to').value = pt; else if (S.clusters.length > 1) $('plan-to').value = S.clusters[S.clusters.length - 1].id;
  }
  function rowDest(a, lang) { const r = S.rById[a.route], b = busById(a.id); return r ? N.destination(r, b ? b.dir : 1) : ''; }
  function renderArrivals() {
    const el = $('arrivals');
    if (!S.arr.length) { el.innerHTML = '<div class="muted">' + esc(t('noBuses')) + '</div>'; return; }
    el.innerHTML = S.arr.slice(0, 8).map((a) => {
      const r = S.rById[a.route] || { type: 'bus' }, b = busById(a.id), st = statusOf(a), selc = S.followId === a.id ? ' sel' : '';
      return '<button type="button" class="row' + selc + '" data-bus="' + esc(a.id) + '"><span class="chip t-' + esc(r.type) + '">' + esc(a.route) + '</span><span class="row-t"><span class="row-d">→ ' + esc(rowDest(a)) + '</span><span class="row-s">' + esc(typeName(r.type)) + ' · <span class="st ' + st.cls + '">' + esc(st.text) + '</span> · ' + esc(phonesText(a.count)) + '</span></span><span class="eta">' + etaHtml(a.etaSec) + '</span></button>';
    }).join('');
    $$('#arrivals .row').forEach((b) => { b.onclick = () => follow(b.dataset.bus); });
  }
  function renderBus() {
    const card = $('buscard'), b = S.followId ? busById(S.followId) : null;
    card.hidden = !b;
    if (!b) return;
    const r = S.rById[b.route], st = statusOf(b);
    $('bus-head').innerHTML = '<div class="bh"><span class="chip xl t-' + esc(b.type) + '">' + esc(b.route) + '</span><div><div class="bh-t">→ ' + esc(r ? N.destination(r, b.dir) : '') + '</div><div class="bh-s"><span class="st ' + st.cls + '">' + esc(st.text) + '</span></div><div class="bh-s">' + (b.vObs != null ? esc(t('speed')) + ': ' + Math.round(b.vObs * 3.6) + ' ' + esc(t('kmh')) + ' · ' : '') + esc(phonesText(b.count)) + (b.hasDriver ? ' · ' + esc(t('driver')) : '') + '</div></div></div>'
      + (S.followLock ? '' : '<button type="button" class="btn" id="relock">' + esc(t('recenter')) + '</button>');
    $('bus-next').innerHTML = '<div class="muted" style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px">' + esc(t('nextStops')) + '</div>'
      + (b.etas || []).map((e) => '<div class="nx"><span>' + esc(e.name) + '</span><b>' + (e.etaSec < 45 ? esc(t('due')) : mins(e.etaSec) + ' ' + esc(t('min'))) + '</b></div>').join('');
    const rl = $('relock'); if (rl) rl.onclick = () => { S.followLock = true; renderBus(); MV.tick(); };
  }

  /* board: the screen at the stop */
  function boardLang() { return $('b-rotate').checked ? LANGS[S.boardLangIdx % 3] : S.lang; }
  function qrSvg(text) {
    try { if (window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); } } catch (e) {}
    return '';
  }
  function renderBoard() {
    if (S.tab !== 'board') return;
    const c = S.cById[S.selCluster], lang = boardLang();
    $('b-kicker').textContent = tr('kicker', lang); $('bc-line').textContent = tr('colLine', lang); $('bc-dest').textContent = tr('colDest', lang); $('bc-eta').textContent = tr('colEta', lang);
    $('b-scan').textContent = tr('scan', lang);
    $$('#b-langs .pill').forEach((p) => p.classList.toggle('on', p.dataset.bl === lang));
    $('b-stop').textContent = c ? c.name : '';
    const rows = S.arr.slice(0, 6);
    $('b-rows').innerHTML = rows.length ? rows.map((a) => {
      const r = S.rById[a.route] || { type: 'bus' }, st = statusOf(a, lang);
      return '<div class="b-row"><span class="chip xl t-' + esc(r.type) + '">' + esc(a.route) + '</span><div class="b-dest">' + esc(rowDest(a)) + '<small>' + esc(typeName(r.type, lang)) + ' · <span class="st ' + st.cls + '">' + esc(st.text) + '</span></small></div><div class="b-eta">' + etaHtml(a.etaSec, lang) + '</div></div>';
    }).join('') : '<div class="b-row"><div class="b-dest">' + esc(tr('noBuses', lang)) + '</div></div>';
    if (c) {
      const url = location.origin + '/?view=board&stop=' + encodeURIComponent(c.id);
      const key = c.id + '|' + url;
      if ($('qr').dataset.key !== key) { $('qr').innerHTML = qrSvg(url); $('qr').dataset.key = key; }
      $('b-url').textContent = location.host + '/?stop=' + c.id;
      renderMini(c);
    }
  }
  function renderMini(c) {
    const W = 340, H = 260, R = 1500, mpp = (2 * R) / W, kx = 111320 * Math.cos(c.lat * Math.PI / 180), ky = 110574;
    const X = (lng) => (W / 2 + ((lng - c.lng) * kx) / mpp).toFixed(1), Y = (lat) => (H / 2 - ((lat - c.lat) * ky) / mpp).toFixed(1);
    let h = '';
    S.routes.forEach((r) => {
      const col = r.type === 'bus' ? P.accent : r.type === 'trolley' ? '#F4F7F5' : '#6CB7FF';
      h += '<polyline class="rl" stroke="' + col + '" opacity="' + (c.members.some((m) => m.route === r.id) ? 1 : 0.35) + '" points="' + r.path.map((p) => X(p[1]) + ',' + Y(p[0])).join(' ') + '"/>';
    });
    S.live.buses.forEach((b) => {
      const p = livePos(b), col = b.type === 'bus' ? P.accent : b.type === 'trolley' ? '#F4F7F5' : '#6CB7FF';
      h += '<circle cx="' + X(p[1]) + '" cy="' + Y(p[0]) + '" r="9" fill="' + col + '" stroke="' + P.land + '" stroke-width="2.5"/><text x="' + X(p[1]) + '" y="' + Y(p[0]) + '" font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#10150F">' + esc(b.route) + '</text>';
    });
    h += '<circle cx="' + W / 2 + '" cy="' + H / 2 + '" r="14" fill="none" stroke="' + P.accent + '" stroke-width="3"/><circle cx="' + W / 2 + '" cy="' + H / 2 + '" r="6" fill="' + P.land + '" stroke="#EAF2EE" stroke-width="3"/>';
    $('map-mini').innerHTML = h;
  }

  /* trip planner */
  function liveWait(route, stopId, dir) {
    let best = null;
    S.live.buses.forEach((b) => { if (b.route !== route || b.dir !== dir) return; const e = (b.etas || []).filter((x) => x.stop === stopId)[0]; if (e && (best === null || e.etaSec < best)) best = e.etaSec; });
    return best;
  }
  function renderPlan() {
    if (S.tab !== 'plan') return;
    const from = $('plan-from').value, to = $('plan-to').value, el = $('plan-results');
    $('plan-note').textContent = '';
    if (!S.clusters.length) { el.innerHTML = '<div class="muted">' + esc(t('noRoutes')) + '</div>'; return; }
    if (from === to) { el.innerHTML = '<div class="muted">' + esc(t('same')) + '</div>'; return; }
    const opts = N.plan(S.routes, S.clusters, from, to, { liveWait });
    if (!opts.length) { el.innerHTML = '<div class="muted">' + esc(t('noRoute')) + '</div>'; return; }
    el.innerHTML = opts.map((o) => {
      const legsHtml = o.legs.map((l, i) => {
        const r = S.rById[l.route];
        const wait = l.waitSec != null ? esc(t('nextIn')) + ' <b>' + (l.waitSec < 45 ? esc(t('due')) : mins(l.waitSec) + ' ' + esc(t('min'))) + '</b>' : (i === 0 ? esc(t('noLive')) : '');
        return '<li class="leg"><span class="chip sm t-' + esc(r.type) + '">' + esc(l.route) + '</span><div><div>' + esc(i === 0 ? t('boardAt') : t('changeAt')) + ' <b>' + esc(l.from) + '</b> → ' + esc(l.dest) + '</div><div class="sub">' + (wait ? wait + ' · ' : '') + esc(t('ride')) + ' ' + l.stops + ' ' + esc(t('stopsWord')) + ', ' + mins(l.rideSec) + ' ' + esc(t('min')) + ', ' + esc(t('getOff')) + ' ' + esc(l.to) + '</div></div></li>';
      }).join('');
      return '<div class="opt"><div class="opt-h"><strong>' + esc(o.change ? t('change1') : t('direct')) + '</strong><span class="opt-total">' + esc(t('total')) + '<b>' + mins(o.totalSec) + ' ' + esc(t('min')) + '</b></span></div><ul class="legs">' + legsHtml + '</ul></div>';
    }).join('');
    if (opts.some((o) => o.assumed)) $('plan-note').textContent = t('assumed');
  }

  /* ---------- sharing ---------- */
  const SH = { mode: LS.get('rasid.mode') || 'rider', route: LS.get('rasid.route') || '', type: LS.get('rasid.type') || 'bus', code: LS.get('rasid.code') || '', on: false, watch: null, timer: null, fix: null, lastSent: 0, info: null, err: '' };
  if (['driver', 'onbus', 'rider'].indexOf(SH.mode) < 0) SH.mode = 'rider';
  const interval = () => (qs.get('fast') ? 5000 : S.cfg.pingMs);
  function shareStat() {
    let h = SH.fix ? 'GPS ±' + Math.round(SH.fix.acc || 0) + ' ' + t('m') : esc(t('gps'));
    if (SH.mode === 'rider') {
      if (S.nearest) h += '<br>' + esc(t('nearest')) + ': <b>' + esc(S.nearest.cluster.name) + '</b> · ' + fmtDist(S.nearest.distM) + ' ' + esc(t('away'));
      return h;
    }
    if (SH.lastSent) h += ' · ' + esc(t('lastSent')) + ' ' + Math.round((Date.now() - SH.lastSent) / 1000) + ' ' + esc(t('sec')) + ' ' + esc(t('ago'));
    if (SH.info) h += '<br>' + esc(SH.info.offRoute || SH.info.routeKnown === false ? t('offRoute') : t('tracked') + (SH.info.progressM != null ? ' · ' + fmtDist(SH.info.progressM) : ''));
    return h;
  }
  function renderShare() {
    const card = $('share-card');
    if (SH.on) {
      card.innerHTML = '<h2>' + esc(t('shareTitle')) + '</h2><div class="msg">' + (SH.mode === 'rider' ? esc(t('localOnly')) : esc(t('sharingNow')) + ' ' + Math.round(interval() / 1000) + ' ' + esc(t('sec')) + '.') + '</div><div class="msg" id="share-stat">' + shareStat() + '</div>'
        + (S.nearest && SH.mode === 'rider' ? '<div><button type="button" class="btn" id="sh-near">' + esc(t('showStop')) + '</button></div>' : '')
        + (SH.err ? '<div class="msg err">' + esc(SH.err) + '</div>' : '') + '<div><button type="button" class="btn primary" id="sh-stop">' + esc(t('stopShare')) + '</button></div>';
      $('sh-stop').onclick = () => stopShare();
      const nb = $('sh-near'); if (nb) nb.onclick = () => selectCluster(S.nearest.cluster.id, true);
      return;
    }
    const modes = [['driver', 'iDrive'], ['onbus', 'onBus'], ['rider', 'waiting']];
    let h = '<h2>' + esc(t('shareTitle')) + '</h2><div class="seg full" id="mode-seg">' + modes.map((m) => '<button type="button" data-m="' + m[0] + '" aria-pressed="' + (SH.mode === m[0]) + '">' + esc(t(m[1])) + '</button>').join('') + '</div>';
    h += '<p class="muted" style="margin:0">' + esc(t(SH.mode === 'driver' ? 'driveHelp' : SH.mode === 'onbus' ? 'onBusHelp' : 'waitingHelp')) + '</p>';
    if (SH.mode !== 'rider') {
      h += '<div class="two"><div class="field"><label for="sh-route">' + esc(t('route')) + '</label><select id="sh-route"><option value="">–</option>' + S.routes.map((r) => '<option value="' + esc(r.id) + '"' + (SH.route === r.id ? ' selected' : '') + '>' + esc(r.id + ' · ' + r.name) + '</option>').join('') + '</select></div>'
        + '<div class="field"><label for="sh-type">' + esc(t('vehicle')) + '</label><select id="sh-type">' + ['bus', 'trolley', 'mini'].map((k) => '<option value="' + k + '"' + (SH.type === k ? ' selected' : '') + '>' + esc(t(k)) + '</option>').join('') + '</select></div></div>';
      if (SH.mode === 'driver' && S.cfg.driverCodeRequired) h += '<div class="field"><label for="sh-code">' + esc(t('driverCode')) + '</label><input type="password" id="sh-code" value="' + esc(SH.code) + '"></div>';
    }
    if (SH.err) h += '<div class="msg err">' + esc(SH.err) + '</div>';
    h += '<div><button type="button" class="btn primary" id="sh-start">' + esc(t('start')) + '</button></div>';
    card.innerHTML = h;
    $$('#mode-seg button').forEach((b) => { b.onclick = () => { SH.mode = b.dataset.m; LS.set('rasid.mode', SH.mode); SH.err = ''; renderShare(); }; });
    const rs = $('sh-route'); if (rs) rs.onchange = () => { SH.route = rs.value; LS.set('rasid.route', SH.route); };
    const ty = $('sh-type'); if (ty) ty.onchange = () => { SH.type = ty.value; LS.set('rasid.type', SH.type); };
    const co = $('sh-code'); if (co) co.oninput = () => { SH.code = co.value; LS.set('rasid.code', SH.code); };
    $('sh-start').onclick = startShare;
  }
  function startShare() {
    SH.err = '';
    if (SH.mode !== 'rider' && !SH.route) { SH.err = t('needRoute'); return renderShare(); }
    if (!navigator.geolocation) { SH.err = t('noGps'); return renderShare(); }
    SH.on = true; SH.fix = null; renderShare();
    SH.watch = navigator.geolocation.watchPosition((pos) => {
      const first = !SH.fix;
      SH.fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, speed: pos.coords.speed };
      MV.setMe(SH.fix.lat, SH.fix.lng);
      if (SH.mode === 'rider') S.nearest = N.nearest(S.clusters, SH.fix.lat, SH.fix.lng, 3000);
      if (first) { if (SH.mode === 'rider') MV.flyTo(SH.fix.lat, SH.fix.lng, 15); sendPing(); renderShare(); }
    }, (err) => {
      if (err.code === 1) { SH.err = t('gpsDenied'); stopShare(true); }
      else SH.fix = null;   // a short GPS dropout: keep sharing, resume when the signal is back
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    if (SH.mode !== 'rider') SH.timer = setInterval(sendPing, interval());
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((w) => { SH.wake = w; }, () => {}); } catch (e) {}
  }
  function stopShare(keepErr) {
    if (SH.watch != null) navigator.geolocation.clearWatch(SH.watch);
    clearInterval(SH.timer); SH.watch = SH.timer = null;
    if (SH.wake) { try { SH.wake.release(); } catch (e) {} SH.wake = null; }
    if (SH.on && SH.mode !== 'rider') { try { navigator.sendBeacon('/api/leave', new Blob([JSON.stringify({ id: deviceId })], { type: 'application/json' })); } catch (e) {} }
    SH.on = false; SH.info = null; SH.lastSent = 0; S.nearest = null; MV.clearMe();
    if (keepErr !== true) SH.err = '';
    renderShare();
  }
  function sendPing() {
    if (!SH.on || !SH.fix || SH.mode === 'rider') return;
    const body = { id: deviceId, mode: SH.mode, route: SH.route, type: SH.type, lat: SH.fix.lat, lng: SH.fix.lng, acc: SH.fix.acc, speed: SH.fix.speed };
    if (SH.mode === 'driver') body.code = SH.code;
    api('/api/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => { SH.lastSent = Date.now(); SH.info = r; SH.err = ''; })
      .catch((e) => { SH.err = e.status === 403 ? t('wrongCode') : t('sentFail') + ': ' + e.message; if (e.status === 403) stopShare(true); });
  }
  window.addEventListener('pagehide', () => { if (SH.on) stopShare(); });

  /* ---------- route recorder (admin) ---------- */
  const RC = { on: false, pts: [], stops: [], watch: null, last: null, code: LS.get('rasid.admin') || '', id: '', name: '', type: 'bus', speed: '', twoWay: false, msg: '', err: '' };
  function renderAdmin() {
    const card = $('admin-card');
    $('tab-admin').hidden = !S.cfg.adminEnabled;
    if (!S.cfg.adminEnabled) { card.innerHTML = '<div class="msg">' + esc(t('adminOff')) + '</div>'; return; }
    let h = '<h2>' + esc(t('adminTitle')) + '</h2><p class="muted" style="margin:0">' + esc(t('recHint')) + '</p>';
    if (!RC.on) {
      h += '<div class="field"><label for="rc-code">' + esc(t('adminCode')) + '</label><input type="password" id="rc-code" value="' + esc(RC.code) + '"></div>'
        + '<div class="two"><div class="field"><label for="rc-id">' + esc(t('routeId')) + '</label><input type="text" id="rc-id" maxlength="6" value="' + esc(RC.id) + '"></div><div class="field"><label for="rc-name">' + esc(t('routeName')) + '</label><input type="text" id="rc-name" value="' + esc(RC.name) + '"></div></div>'
        + '<div class="two"><div class="field"><label for="rc-type">' + esc(t('vehicle')) + '</label><select id="rc-type">' + ['bus', 'trolley', 'mini'].map((k) => '<option value="' + k + '"' + (RC.type === k ? ' selected' : '') + '>' + esc(t(k)) + '</option>').join('') + '</select></div><div class="field"><label for="rc-speed">' + esc(t('planned')) + '</label><input type="number" id="rc-speed" inputmode="decimal" placeholder="20" value="' + esc(RC.speed) + '"></div></div>'
        + '<label class="check"><input type="checkbox" id="rc-two"' + (RC.twoWay ? ' checked' : '') + '><span>' + esc(t('twoWay')) + '</span></label>';
      if (RC.pts.length > 1) h += '<div class="msg">' + RC.pts.length + ' ' + esc(t('points')) + ' · ' + RC.stops.length + ' ' + esc(t('stopsN')) + '</div>';
      if (RC.msg) h += '<div class="msg">' + esc(RC.msg) + '</div>';
      if (RC.err) h += '<div class="msg err">' + esc(RC.err) + '</div>';
      h += '<div class="ctl"><button type="button" class="btn primary" id="rc-start">' + esc(t('recStart')) + '</button>' + (RC.pts.length > 1 ? '<button type="button" class="btn" id="rc-save">' + esc(t('recStop')) + '</button>' : '') + '</div>';
      if (S.routes.length) h += '<div class="field"><label for="rc-del">' + esc(t('del')) + '</label><div class="ctl"><select id="rc-del" style="flex:1">' + S.routes.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.id + ' · ' + r.name) + '</option>').join('') + '</select><button type="button" class="btn" id="rc-delbtn">' + esc(t('del')) + '</button></div></div>';
      h += '<div class="ctl"><button type="button" class="btn" id="rc-export">' + esc(t('exportRoutes')) + '</button></div><p class="muted" style="margin:0">' + esc(t('exportHint')) + '</p>';
    } else {
      h += '<div class="msg">' + esc(t('recNow')) + '</div>';
    }
    card.innerHTML = h;
    renderRecBar();
    if (!RC.on) {
      [['rc-code', 'code'], ['rc-id', 'id'], ['rc-name', 'name'], ['rc-speed', 'speed']].forEach((p) => { const n = $(p[0]); if (n) n.oninput = () => { RC[p[1]] = n.value; if (p[0] === 'rc-code') LS.set('rasid.admin', n.value); }; });
      $('rc-type').onchange = () => { RC.type = $('rc-type').value; };
      $('rc-two').onchange = () => { RC.twoWay = $('rc-two').checked; };
      $('rc-start').onclick = recStart;
      $('rc-export').onclick = () => {
        fetch('/api/admin/export', { headers: { 'X-Admin-Code': RC.code } }).then((r) => { if (!r.ok) throw new Error(r.status === 401 ? 'Wrong admin code' : 'Export failed'); return r.blob(); }).then((b) => {
          const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'routes.json'; document.body.appendChild(a); a.click(); a.remove();
          RC.msg = t('exported'); RC.err = ''; renderAdmin();
        }).catch((e) => { RC.err = e.message; renderAdmin(); });
      };
      if ($('rc-save')) $('rc-save').onclick = recSave;
      if ($('rc-delbtn')) $('rc-delbtn').onclick = () => {
        api('/api/admin/route?id=' + encodeURIComponent($('rc-del').value), { method: 'DELETE', headers: { 'X-Admin-Code': RC.code } }).then(() => { RC.msg = t('saved'); RC.err = ''; return loadRoutes(); }).catch((e) => { RC.err = e.message; renderAdmin(); });
      };
    }
  }
  /* While recording, the controls sit above the map so they stay in reach as you walk or ride. */
  function renderRecBar() {
    const bar = $('recbar');
    bar.hidden = !RC.on;
    if (!RC.on) { bar.innerHTML = ''; return; }
    bar.innerHTML = '<div class="msg" id="rc-stat" style="flex:1 1 100%"></div><input type="text" id="rc-stopname" aria-label="' + esc(t('stopName')) + '" placeholder="' + esc(t('hereStop') + ' ' + (RC.stops.length + 1)) + '">'
      + '<button type="button" class="btn primary" id="rc-add">' + esc(t('addStop')) + '</button><button type="button" class="btn" id="rc-end">' + esc(t('recStop')) + '</button>';
    $('rc-add').onclick = recAddStop; $('rc-end').onclick = () => recFinish(); recStat();
  }
  function recStat() { const n = $('rc-stat'); if (n) n.textContent = RC.pts.length + ' ' + t('points') + ' · ' + RC.stops.length + ' ' + t('stopsN') + (RC.last ? ' · GPS ±' + Math.round(RC.last.acc || 0) + ' ' + t('m') : ' · ' + t('gps')); }
  function recStart() {
    RC.err = RC.msg = '';
    if (!/^[A-Za-z0-9]{1,6}$/.test(RC.id)) { RC.err = t('routeId'); return renderAdmin(); }
    if (!navigator.geolocation) { RC.err = t('noGps'); return renderAdmin(); }
    RC.pts = []; RC.stops = []; RC.last = null; RC.on = true; renderAdmin(); setTab('map');
    RC.watch = navigator.geolocation.watchPosition((pos) => {
      const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      RC.last = f; MV.setMe(f.lat, f.lng);
      if (f.acc <= 60) {
        const lp = RC.pts[RC.pts.length - 1];
        if (!lp || N.hav(lp[0], lp[1], f.lat, f.lng) >= 8) { RC.pts.push([Math.round(f.lat * 1e6) / 1e6, Math.round(f.lng * 1e6) / 1e6]); MV.setRec(RC.pts, RC.stops); }
      }
      recStat();
    }, (err) => {
      if (err.code === 1) { RC.err = t('gpsDenied'); recFinish(true); }
      else { RC.last = null; recStat(); }   // a short GPS dropout: keep recording
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function recAddStop() {
    if (!RC.last) return;
    const n = $('rc-stopname');
    RC.stops.push({ name: (n && n.value) || (t('hereStop') + ' ' + (RC.stops.length + 1)), lat: RC.last.lat, lng: RC.last.lng });
    if (n) { n.value = ''; n.placeholder = t('hereStop') + ' ' + (RC.stops.length + 1); }
    MV.setRec(RC.pts, RC.stops); recStat();
  }
  function recFinish(skip) {
    if (RC.watch != null) navigator.geolocation.clearWatch(RC.watch);
    RC.watch = null; RC.on = false; MV.clearMe(); renderAdmin();
    if (skip !== true && RC.pts.length > 1) recSave();
  }
  function recSave() {
    const body = { id: RC.id, name: RC.name || ('Route ' + RC.id), type: RC.type, path: RC.pts, stops: RC.stops, twoWay: RC.twoWay };
    if (Number(RC.speed) > 0) body.plannedSpeedKmh = Number(RC.speed);
    api('/api/admin/route', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Code': RC.code }, body: JSON.stringify(body) }).then((r) => {
      RC.msg = t('saved') + ': ' + r.id + ' · ' + fmtDist(r.lengthM) + ' · ' + r.stops + ' ' + t('stopsN'); RC.err = ''; RC.pts = []; RC.stops = []; MV.setRec([], []);
      return loadRoutes();
    }).catch((e) => { RC.err = e.status === 401 ? 'Wrong admin code' : e.message; renderAdmin(); });
  }

  /* ---------- tabs and start-up ---------- */
  function setTab(name) {
    S.tab = name;
    ['map', 'board', 'plan', 'share', 'admin'].forEach((k) => { $('view-' + k).hidden = k !== name; });
    $$('#tabs button').forEach((b) => { if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (name === 'map' && MV.map) setTimeout(() => MV.map.resize(), 30);
    if (name === 'board') { refreshArrivals(); renderBoard(); }
    if (name === 'plan') renderPlan();
  }
  function wire() {
    $$('#tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $$('#langseg button').forEach((b) => b.addEventListener('click', () => { S.lang = b.dataset.lang; LS.set('rasid.lang', S.lang); applyLang(); }));
    $('stop-sel').addEventListener('change', (e) => selectCluster(e.target.value, true));
    $('b-stop-sel').addEventListener('change', (e) => selectCluster(e.target.value, false));
    $('plan-from').addEventListener('change', renderPlan); $('plan-to').addEventListener('change', renderPlan);
    $('plan-swap').addEventListener('click', () => { const a = $('plan-from').value; $('plan-from').value = $('plan-to').value; $('plan-to').value = a; renderPlan(); });
    $('unfollow').addEventListener('click', unfollow);
    $('btn-tilt').addEventListener('click', () => { $('btn-tilt').setAttribute('aria-pressed', String(MV.toggleTilt())); });
    $('btn-fit').addEventListener('click', () => { S.selRoute = null; MV.setSelection(); renderRouteChips(); MV.fitRoutes(); });
    $('b-rotate').addEventListener('change', renderBoard);
    $('b-full').addEventListener('click', () => { const d = document.documentElement; if (d.requestFullscreen) d.requestFullscreen().catch(() => {}); });
  }

  async function boot() {
    const sv = LS.get('rasid.lang');
    S.lang = LANGS.indexOf(qs.get('lang')) >= 0 ? qs.get('lang') : LANGS.indexOf(sv) >= 0 ? sv : ((navigator.language || 'en').slice(0, 2) === 'ru' ? 'ru' : (navigator.language || '').slice(0, 2) === 'tg' ? 'tg' : 'en');
    if (qs.get('kiosk')) document.body.classList.add('kiosk');
    wire(); applyLang(); renderClock(); setInterval(renderClock, 1000);
    try { S.cfg = Object.assign(S.cfg, await api('/api/config')); } catch (e) {}
    const view = ['board', 'plan', 'share'].indexOf(qs.get('view')) >= 0 ? qs.get('view') : 'map';
    await MV.init();
    try { await loadRoutes(); } catch (e) { $('arrivals').textContent = String(e.message || e); }
    renderAdmin(); setTab(view);
    connect();
    setInterval(() => MV.tick(), 700);
    setInterval(() => { if (S.tab === 'board') renderMini(S.cById[S.selCluster] || { lat: 0, lng: 0, members: [] }); }, 2000);
    setInterval(() => { if ($('b-rotate').checked) { S.boardLangIdx++; renderBoard(); } }, 6000);
    setInterval(() => { const n = $('share-stat'); if (n && SH.on) n.innerHTML = shareStat(); }, 1000);
    setInterval(async () => { try { const l = await api('/api/routes'); const sig = l.map((r) => r.id + ':' + r.length + ':' + r.stops.length).join(','); if (boot.sig !== undefined && sig !== boot.sig) await loadRoutes(); boot.sig = sig; } catch (e) {} }, 30000);
  }
  window.__rasid = { S: S, SH: SH, RC: RC };   // handy for support and tests
  boot();
  try { if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(function () {}); } catch (e) {}
})();

'use strict';
/*
 * Tracker: turns raw phone positions into buses on routes.
 *
 *  1. Each phone position is snapped onto its route line: distance along the line (s) and
 *     distance from the line (d). A phone more than offRouteM away is "off route".
 *  2. Speed and direction come from how s changed between pings (a ping every minute is enough).
 *  3. Phones of the same route that are within groupM of each other are one bus. A driver's
 *     phone counts first, otherwise the middle of the group is used.
 *  4. For each bus we estimate where it is now and when it reaches each stop:
 *        time to stop = distance / speed + (stops in between) * dwell
 *     where speed = half the observed speed, half the planned speed. Delay = that estimate minus the
 *     estimate at planned speed. If the route has a timetable, the delay is measured against it instead.
 */
const geo = require('./geo');

const DEFAULTS = {
  staleMs: 200000,       // forget a phone after this long without a ping
  minPingMs: 4000,       // ignore pings faster than this from one phone
  offRouteM: 250,        // farther than this from the line = not on the route
  jumpMps: 40,           // moving faster than 144 km/h between pings = bad position
  groupM: 150,           // phones this close along the line are one bus
  extrapolateMaxS: 180,  // do not move a bus on its guessed speed for longer than this
  onTimeSec: 120,        // within 2 minutes counts as on time
  tzOffsetMin: 300       // Tajikistan is UTC+5
};

const median = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function motion(hist, twoWay, gpsSpeed, prevDir) {
  const signed = [];
  for (let i = 1; i < hist.length; i++) {
    const dt = (hist[i].ts - hist[i - 1].ts) / 1000;
    if (dt >= 8 && dt <= 600) signed.push((hist[i].s - hist[i - 1].s) / dt);
  }
  const recent = signed.slice(-3), m = median(recent);
  let vObs = null, dir = prevDir || 0, wrongWay = false;
  if (m != null) {
    vObs = median(recent.map(Math.abs));
    if (twoWay) { if (Math.abs(m) > 0.4) dir = m > 0 ? 1 : -1; }
    else { dir = 1; wrongWay = m < -1.0; }
  } else {
    if (gpsSpeed != null) vObs = gpsSpeed;
    if (!twoWay) dir = 1;
  }
  return { vObs, dir, wrongWay };
}

class Tracker {
  constructor(store, opts) {
    this.store = store;
    this.o = Object.assign({}, DEFAULTS, opts || {});
    this.devices = new Map();   // private id -> record
  }

  info(rec) {
    if (rec.mode === 'rider') return {};
    return {
      routeKnown: !rec.unknownRoute, offRoute: rec.offRoute,
      distM: rec.d == null ? null : Math.round(rec.d), progressM: rec.s == null ? null : Math.round(rec.s),
      speedMps: rec.vObs == null ? null : Math.round(rec.vObs * 10) / 10
    };
  }

  /* v: a validated position { id, pub, mode, route, type, lat, lng, speed, acc } */
  ping(v, now) {
    const o = this.o, prev = this.devices.get(v.id);
    if (prev && now - prev.ts < o.minPingMs) return { ok: true, pub: prev.pub, throttled: true, info: this.info(prev) };
    if (prev) {
      const dt = (now - prev.ts) / 1000;
      if (dt < 600) {
        const dm = geo.haversine(prev.lat, prev.lng, v.lat, v.lng);
        if (dm > 200 && dm / dt > o.jumpMps) return { ok: false, reason: 'jump' };
      }
    }
    const rec = {
      id: v.id, pub: v.pub, mode: v.mode, route: v.route, type: v.type, lat: v.lat, lng: v.lng, acc: v.acc, gps: v.speed, ts: now,
      s: null, d: null, offRoute: false, unknownRoute: false, dir: 0, vObs: null, wrongWay: false, hist: []
    };
    if (v.mode !== 'rider') {
      const route = this.store.routes.get(v.route);
      if (!route) rec.unknownRoute = true;
      else {
        const same = prev && prev.route === v.route && prev.s != null;
        const pr = geo.project(route.path, route.cum, v.lat, v.lng, same ? prev.s : null);
        rec.s = pr.s; rec.d = pr.d; rec.offRoute = pr.d > o.offRouteM;
        rec.hist = same ? prev.hist.filter((h) => now - h.ts < 15 * 60 * 1000).slice(-5) : [];
        if (!rec.offRoute) rec.hist.push({ ts: now, s: pr.s });
        const m = motion(rec.hist, route.twoWay, v.speed, same ? prev.dir : 0);
        rec.dir = m.dir; rec.vObs = m.vObs; rec.wrongWay = m.wrongWay;
      }
    }
    this.devices.set(v.id, rec);
    return { ok: true, pub: rec.pub, info: this.info(rec) };
  }

  leave(id) {
    const d = this.devices.get(id);
    if (!d) return null;
    this.devices.delete(id);
    return d.pub;
  }

  sweep(now) {
    const gone = [];
    for (const [id, d] of this.devices) if (now - d.ts > this.o.staleMs) { this.devices.delete(id); gone.push(d.pub); }
    return gone;
  }

  groups(list) {
    const sorted = list.slice().sort((a, b) => a.s - b.s), gs = [];
    for (const d of sorted) {
      const g = gs[gs.length - 1];
      if (g && Math.abs(d.s - g.anchor) < this.o.groupM && (g.dir === 0 || d.dir === 0 || g.dir === d.dir)) {
        g.members.push(d);
        if (!g.dir) g.dir = d.dir;
      } else gs.push({ anchor: d.s, dir: d.dir, members: [d] });
    }
    return gs;
  }

  scheduleDelaySec(route, sNow, now) {
    if (!route.timetable.length) return null;
    const local = new Date(now + this.o.tzOffsetMin * 60000);
    const nowSec = local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds();
    const vPlan = route.plannedSpeedKmh / 3.6;
    let best = null;
    for (const dep of route.timetable) {
      const elapsed = nowSec - dep * 60;
      if (elapsed < 0 || elapsed > route.length / vPlan + 1800) continue;
      const diff = Math.min(route.length, vPlan * elapsed) - sNow;
      if (!best || Math.abs(diff) < Math.abs(best.diff)) best = { diff };
    }
    return best ? Math.round(best.diff / vPlan) : null;   // positive = behind the timetable
  }

  describe(route, g, now) {
    const drivers = g.members.filter((m) => m.mode === 'driver');
    const src = drivers.length ? drivers : g.members;
    const lead = src.slice().sort((a, b) => b.ts - a.ts)[0];
    const s = drivers.length ? lead.s : median(src.map((m) => m.s));
    const ts = Math.max.apply(null, src.map((m) => m.ts));
    const vs = src.map((m) => m.vObs).filter((v) => v != null);
    const vObs = vs.length ? median(vs) : null;
    let dir = 1;
    if (route.twoWay) { const sum = src.reduce((a, m) => a + m.dir, 0); dir = sum > 0 ? 1 : sum < 0 ? -1 : 0; }

    const vPlan = route.plannedSpeedKmh / 3.6;
    const vEff = vObs == null ? vPlan : Math.max(1.0, 0.5 * vObs + 0.5 * vPlan);
    const vMove = vObs == null ? 0 : vObs;
    const age = Math.max(0, (now - ts) / 1000);
    const sNow = Math.max(0, Math.min(route.length, s + dir * Math.min(age, this.o.extrapolateMaxS) * vMove));

    const etas = [];
    if (dir !== 0) {
      for (const st of route.stops) {
        const dist = (st.s - sNow) * dir;
        if (dist < -25) continue;
        const d0 = Math.max(0, dist);
        let between = 0;
        for (const o of route.stops) {
          if (o === st) continue;
          const od = (o.s - sNow) * dir;
          if (od > 25 && od < dist - 25) between++;
        }
        const eta = d0 / vEff + between * route.dwellSec, plan = d0 / vPlan + between * route.dwellSec;
        etas.push({ stop: st.id, name: st.name, distM: Math.round(d0), etaSec: Math.round(eta), delaySec: Math.round(eta - plan) });
      }
      etas.sort((a, b) => a.distM - b.distM);
    }

    /*
     * Status of the bus as a whole.
     *  - With a timetable: late / early / ontime against the timetable.
     *  - Without one nobody can say "late", so we compare speed with the plan over the next kilometre:
     *    slow / fast / ontime. The per-stop delays in the ETA list use the same comparison.
     */
    const remaining = dir >= 0 ? route.length - sNow : sNow;
    const sched = dir === 1 ? this.scheduleDelaySec(route, sNow, now) : null;
    let delaySec = null, status = 'unknown';
    if (sched != null) {
      delaySec = sched;
      status = sched > this.o.onTimeSec ? 'late' : sched < -this.o.onTimeSec ? 'early' : 'ontime';
    } else if (vObs != null && dir !== 0 && remaining > 50) {
      const ref = Math.min(1000, remaining);
      delaySec = Math.round(ref * (1 / vEff - 1 / vPlan));
      status = delaySec > 60 ? 'slow' : delaySec < -60 ? 'fast' : 'ontime';
    }

    const pos = geo.pointAt(route.path, route.cum, sNow);
    return {
      id: route.id + ':' + lead.pub, route: route.id, type: route.type, name: route.name,
      lat: pos.lat, lng: pos.lng, s: Math.round(s), ts, dir,
      vMove: Math.round(vMove * 10) / 10, vObs: vObs == null ? null : Math.round(vObs * 10) / 10,
      sNow: Math.round(sNow), remainingM: Math.round(dir >= 0 ? route.length - sNow : sNow), routeLength: Math.round(route.length),
      count: g.members.length, hasDriver: drivers.length > 0, ageSec: Math.round(age), stale: age > 150,
      etas: etas.slice(0, 6), allEtas: etas, schedDelaySec: sched, delaySec, status,
      gapAheadSec: null, gapBehindSec: null, _vEff: vEff
    };
  }

  snapshot(now) {
    const buses = [], loose = [], riders = [], byRoute = new Map();
    for (const d of this.devices.values()) {
      if (now - d.ts > this.o.staleMs) continue;
      if (d.mode === 'rider') { riders.push({ id: d.pub, lat: d.lat, lng: d.lng }); continue; }
      const route = this.store.routes.get(d.route);
      if (!route || d.unknownRoute || d.offRoute) {
        loose.push({ id: d.pub, route: d.route, type: d.type, mode: d.mode, lat: d.lat, lng: d.lng, offRoute: !!route && d.offRoute, unknownRoute: !route, ts: d.ts });
        continue;
      }
      if (d.wrongWay) continue;
      if (!byRoute.has(d.route)) byRoute.set(d.route, []);
      byRoute.get(d.route).push(d);
    }
    for (const [rid, list] of byRoute) {
      const route = this.store.routes.get(rid);
      const views = this.groups(list).map((g) => this.describe(route, g, now));
      [1, -1].forEach((dir) => {
        const same = views.filter((b) => b.dir === dir).sort((a, b) => (a.sNow - b.sNow) * dir);
        for (let i = 0; i < same.length; i++) {
          const b = same[i];
          if (i + 1 < same.length) b.gapAheadSec = Math.round((same[i + 1].sNow - b.sNow) * dir / b._vEff);
          if (i > 0) b.gapBehindSec = Math.round((b.sNow - same[i - 1].sNow) * dir / same[i - 1]._vEff);
        }
      });
      views.forEach((b) => { delete b._vEff; buses.push(b); });
    }
    return { ts: now, buses, loose, riders };
  }

  /* Public version of the snapshot: only the first few stops per bus, no private fields. */
  publicState(now) {
    const s = this.snapshot(now);
    s.buses.forEach((b) => { delete b.allEtas; });
    return s;
  }

  arrivals(routeId, stopId, now) {
    const out = [];
    this.snapshot(now).buses.filter((b) => b.route === routeId).forEach((b) => {
      const e = b.allEtas.find((x) => x.stop === stopId);
      if (e) out.push({ id: b.id, count: b.count, hasDriver: b.hasDriver, etaSec: e.etaSec, delaySec: b.delaySec, status: b.status, distM: e.distM, stale: b.stale });
    });
    return out.sort((a, b) => a.etaSec - b.etaSec);
  }

  stats(now) {
    let riders = 0, onbus = 0, drivers = 0;
    for (const d of this.devices.values()) { if (now - d.ts > this.o.staleMs) continue; if (d.mode === 'rider') riders++; else if (d.mode === 'driver') drivers++; else onbus++; }
    return { riders, onbus, drivers };
  }
}

module.exports = { Tracker, DEFAULTS };

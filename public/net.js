'use strict';
/*
 * Network helpers used by the app screen: group stops into places, find destinations, plan a trip.
 * Pure functions, unit-tested in node.
 *
 * A route here is what /api/routes returns: { id, type, name, plannedSpeedKmh, twoWay, stops:[{id,name,lat,lng,s}] }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RasidNet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var RAD = Math.PI / 180, DWELL = 15, TRANSFER_WAIT = 300;

  function hav(aLat, aLng, bLat, bLng) {
    var dLat = (bLat - aLat) * RAD, dLng = (bLng - aLng) * RAD;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(x)));
  }

  /* Stops of different routes that are within radius metres are one place ("Rudaki / Ayni"). */
  function clusterStops(routes, radius) {
    radius = radius || 60;
    var clusters = [];
    routes.forEach(function (r) {
      r.stops.forEach(function (st, i) {
        var c = null, best = Infinity;
        clusters.forEach(function (k) { var d = hav(k.lat, k.lng, st.lat, st.lng); if (d < best) { best = d; c = k; } });
        if (!c || best > radius || c.members.some(function (m) { return m.route === r.id; })) {
          c = { id: r.id + ':' + st.id, name: st.name, lat: st.lat, lng: st.lng, members: [] };
          clusters.push(c);
        }
        c.members.push({ route: r.id, stopId: st.id, s: st.s, idx: i });
        var n = c.members.length;
        c.lat += (st.lat - c.lat) / n; c.lng += (st.lng - c.lng) / n;
      });
    });
    return clusters;
  }

  /* Where a bus heading in direction dir ends up, as a person would say it. */
  function destination(route, dir) {
    var st = route.stops;
    if (!st.length) return route.name;
    return (dir < 0 ? st[0] : st[st.length - 1]).name;
  }

  function rideSec(route, sA, sB) {
    var lo = Math.min(sA, sB), hi = Math.max(sA, sB);
    var between = route.stops.filter(function (s) { return s.s > lo + 1 && s.s < hi - 1; }).length;
    return Math.round(Math.abs(sB - sA) / (route.plannedSpeedKmh / 3.6) + between * DWELL);
  }

  function direction(route, sA, sB) {
    if (sB > sA + 1) return 1;
    if (sB < sA - 1 && route.twoWay) return -1;
    return 0;
  }

  /* One ride from cluster a to cluster b on a single route, or null. */
  function legs(routes, a, b) {
    var out = [];
    routes.forEach(function (r) {
      var ma = a.members.filter(function (m) { return m.route === r.id; })[0];
      var mb = b.members.filter(function (m) { return m.route === r.id; })[0];
      if (!ma || !mb) return;
      var dir = direction(r, ma.s, mb.s);
      if (!dir) return;
      out.push({
        route: r.id, type: r.type, dir: dir, fromStop: ma.stopId, toStop: mb.stopId, from: a.name, to: b.name, fromId: a.id, toId: b.id,
        distM: Math.round(Math.abs(mb.s - ma.s)), rideSec: rideSec(r, ma.s, mb.s),
        stops: r.stops.filter(function (s) { return s.s > Math.min(ma.s, mb.s) + 1 && s.s < Math.max(ma.s, mb.s) - 1; }).length + 1,
        dest: destination(r, dir)
      });
    });
    return out;
  }

  /*
   * Trip options from cluster fromId to cluster toId: direct rides, then rides with one change.
   * opts.liveWait(routeId, stopId, dir) may return seconds until the next live bus there, or null.
   */
  function plan(routes, clusters, fromId, toId, opts) {
    opts = opts || {};
    var A = clusters.filter(function (c) { return c.id === fromId; })[0];
    var B = clusters.filter(function (c) { return c.id === toId; })[0];
    if (!A || !B || A === B) return [];
    var live = opts.liveWait || function () { return null; };
    var res = [];
    legs(routes, A, B).forEach(function (l) {
      l.waitSec = live(l.route, l.fromStop, l.dir);
      res.push({ legs: [l], change: false, totalSec: l.rideSec + (l.waitSec || 0), assumed: false });
    });
    clusters.forEach(function (X) {
      if (X === A || X === B) return;
      var first = legs(routes, A, X), second = legs(routes, X, B);
      first.forEach(function (l1) {
        second.forEach(function (l2) {
          if (l1.route === l2.route) return;
          l1.waitSec = live(l1.route, l1.fromStop, l1.dir);
          var l2c = Object.assign({}, l2);
          l2c.waitSec = null;
          res.push({ legs: [Object.assign({}, l1), l2c], change: true, assumed: true, totalSec: l1.rideSec + (l1.waitSec || 0) + TRANSFER_WAIT + l2.rideSec });
        });
      });
    });
    var direct = res.filter(function (o) { return !o.change; }).sort(function (a, b) { return a.totalSec - b.totalSec; });
    var changes = res.filter(function (o) { return o.change; }).sort(function (a, b) { return a.totalSec - b.totalSec; });
    var seen = {}, list = direct.slice(0, 3);
    changes.forEach(function (o) {
      var k = o.legs[0].route + '>' + o.legs[0].to + '>' + o.legs[1].route;
      if (seen[k] || list.length >= 4) return;
      seen[k] = 1; list.push(o);
    });
    return list;
  }

  /* Nearest place to a point, or null if none within maxM. */
  function nearest(clusters, lat, lng, maxM) {
    var best = null, bd = Infinity;
    clusters.forEach(function (c) { var d = hav(c.lat, c.lng, lat, lng); if (d < bd) { bd = d; best = c; } });
    return best && bd <= (maxM || 2000) ? { cluster: best, distM: Math.round(bd) } : null;
  }

  return { hav: hav, clusterStops: clusterStops, destination: destination, legs: legs, plan: plan, nearest: nearest, rideSec: rideSec, TRANSFER_WAIT: TRANSFER_WAIT };
});

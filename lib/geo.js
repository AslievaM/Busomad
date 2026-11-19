'use strict';
/* Small geometry helpers. A path is an array of [lat, lng] pairs. Distances are in metres. */
const R = 6371008.8;
const RAD = Math.PI / 180;

function haversine(aLat, aLng, bLat, bLng) {
  const dLat = (bLat - aLat) * RAD, dLng = (bLng - aLng) * RAD;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/* cum[i] = distance along the path from the first point to point i. */
function cumulative(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]));
  return cum;
}

/*
 * Find the closest point on the path to (lat, lng).
 * Returns { s: distance along the path, d: distance from the path, i: segment index }.
 * hintS (optional) is where the vehicle was last time. It stops a route that doubles back
 * over the same street from snapping to the wrong half.
 */
function project(path, cum, lat, lng, hintS) {
  const kx = 111320 * Math.cos(lat * RAD), ky = 110574;
  function search(lo, hi) {
    let best = null;
    for (let i = lo; i < hi; i++) {
      const ax = (path[i][1] - lng) * kx, ay = (path[i][0] - lat) * ky;
      const bx = (path[i + 1][1] - lng) * kx, by = (path[i + 1][0] - lat) * ky;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx, py = ay + t * dy, d = Math.sqrt(px * px + py * py);
      if (!best || d < best.d) best = { d, i, t };
    }
    return best;
  }
  const n = path.length - 1;
  let best = null;
  if (hintS != null) {
    let lo = 0, hi = n;
    while (lo < n && cum[lo + 1] < hintS - 1500) lo++;
    while (hi > lo && cum[hi - 1] > hintS + 4000) hi--;
    if (hi > lo) { best = search(lo, hi); if (best && best.d > 120) best = null; }
  }
  if (!best) best = search(0, n);
  return { s: cum[best.i] + best.t * (cum[best.i + 1] - cum[best.i]), d: best.d, i: best.i };
}

/* The point at distance s along the path. */
function pointAt(path, cum, s) {
  const total = cum[cum.length - 1];
  s = Math.max(0, Math.min(total, s));
  let lo = 0, hi = cum.length - 2;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
  const segLen = cum[lo + 1] - cum[lo];
  const t = segLen > 0 ? (s - cum[lo]) / segLen : 0;
  return { lat: path[lo][0] + (path[lo + 1][0] - path[lo][0]) * t, lng: path[lo][1] + (path[lo + 1][1] - path[lo][1]) * t };
}

/* Douglas-Peucker: drop points that are within tol metres of the straight line. */
function simplify(path, tol) {
  if (path.length < 3) return path.slice();
  const lat0 = path[0][0], kx = 111320 * Math.cos(lat0 * RAD), ky = 110574;
  const xy = path.map((p) => [(p[1]) * kx, (p[0]) * ky]);
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack = [[0, path.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const ax = xy[a][0], ay = xy[a][1], dx = xy[b][0] - ax, dy = xy[b][1] - ay, len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      let t = len2 > 0 ? ((xy[i][0] - ax) * dx + (xy[i][1] - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(xy[i][0] - (ax + t * dx), xy[i][1] - (ay + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return path.filter((_, i) => keep[i]);
}

module.exports = { haversine, cumulative, project, pointAt, simplify };

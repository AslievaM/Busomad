// Stand-in for MapLibre GL JS so the app logic can be tested without internet. It records what the app asks the map to do.
(function () {
  var calls = (window.__calls = []), data = (window.__data = {});
  function Evented() { this._h = []; }
  Evented.prototype.on = function (type, a, b) { var layer = typeof a === 'string' ? a : null; this._h.push({ type: type, layer: layer, fn: layer ? b : a }); return this; };
  Evented.prototype.fire = function (type, layer, ev) { this._h.filter(function (h) { return h.type === type && (h.layer || null) === (layer || null); }).forEach(function (h) { h.fn(ev || {}); }); };
  function MapMock(o) {
    Evented.call(this); this.o = o; this.zoom = o.zoom; this.container = document.getElementById(o.container);
    this.layers = []; this.paint = {}; this.canvas = document.createElement('div'); window.__map = this;
    var self = this; setTimeout(function () { self.fire('load'); }, 20);
  }
  MapMock.prototype = Object.create(Evented.prototype);
  MapMock.prototype.addControl = function (c, pos) { calls.push(['addControl', c.name, pos]); };
  MapMock.prototype.addSource = function (id, s) { data[id] = s.data; };
  MapMock.prototype.getSource = function (id) { return { setData: function (d) { data[id] = d; calls.push(['setData', id]); } }; };
  MapMock.prototype.addLayer = function (l) { this.layers.push(l); };
  MapMock.prototype.setPaintProperty = function (id, k, v) { this.paint[id + '.' + k] = v; };
  MapMock.prototype.getZoom = function () { return this.zoom; };
  MapMock.prototype.easeTo = function (o) { calls.push(['easeTo', o]); if (o.center) this.center = o.center; if (o.pitch !== undefined) this.pitch = o.pitch; };
  MapMock.prototype.fitBounds = function (b) { calls.push(['fitBounds', b.pts.length]); };
  MapMock.prototype.resize = function () {};
  MapMock.prototype.getCanvas = function () { return this.canvas; };
  function Marker(o) { this.el = o.element; }
  Marker.prototype.setLngLat = function (ll) { this.ll = ll; this.el.dataset.lng = ll[0]; this.el.dataset.lat = ll[1]; return this; };
  Marker.prototype.addTo = function (m) { m.container.appendChild(this.el); return this; };
  Marker.prototype.remove = function () { this.el.remove(); };
  function LngLatBounds() { this.pts = []; }
  LngLatBounds.prototype.extend = function (p) { this.pts.push(p); return this; };
  function NavigationControl() {} function GeolocateControl() {} function AttributionControl() {}
  NavigationControl.prototype.name = 'NavigationControl'; GeolocateControl.prototype.name = 'GeolocateControl'; AttributionControl.prototype.name = 'AttributionControl';
  window.maplibregl = { Map: MapMock, Marker: Marker, LngLatBounds: LngLatBounds, NavigationControl: NavigationControl, GeolocateControl: GeolocateControl, AttributionControl: AttributionControl };
})();

'use strict';
/*
 * Rasid map look. Takes any OpenMapTiles-style vector style (OpenFreeMap "liberty", MapTiler, your own)
 * and repaints it in the Rasid colours: dark green land, deep teal water, quiet roads, no shop icons.
 * Pure function, no browser needed, so it is unit-tested in node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RasidTheme = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var PALETTE = {
    land: '#0C1A16', landAlt: '#0F211B', green: '#10291F', water: '#0A2733', waterLine: '#14404F', waterText: '#5E9CB0',
    building: '#15291F', buildingEdge: '#1D372B', building3d: '#1B3429', rock: '#142822', ice: '#1B3B3A',
    roadMajor: '#3A6352', roadMid: '#2E4F42', roadMinor: '#233D33', path: '#1A2E26', rail: '#2A4A47', casing: '#08120F',
    boundary: '#3A5A50', text: '#9DB5AB', textStrong: '#EAF2EE', textDim: '#6E877C', accent: '#F2A900'
  };

  function test(re, key) { return re.test(key); }

  function fillColor(key, P) {
    if (test(/water/, key) && !test(/waterway/, key)) return P.water;
    if (test(/building/, key)) return P.building;
    if (test(/(^|[^a-z])(ice|glacier)/, key)) return P.ice;
    if (test(/wood|forest|grass|park|garden|pitch|recreation|cemetery|golf|scrub|wetland|meadow|farm|orchard|vineyard|heath|village_green|nature|playground|zoo/, key)) return P.green;
    if (test(/sand|rock|bare|scree|quarry/, key)) return P.rock;
    if (test(/aeroway|runway|taxiway|apron/, key)) return P.roadMid;
    return P.landAlt;
  }

  function lineColor(key, P) {
    if (test(/waterway|river|stream|canal|drain/, key)) return P.waterLine;
    if (test(/boundary|admin/, key)) return P.boundary;
    if (test(/ferry/, key)) return P.waterLine;
    if (test(/transportation|road|bridge|tunnel|rail|transit|aeroway|highway|street|path|motorway|trunk|primary|secondary|tertiary|minor|service|track/, key)) {
      if (test(/casing|outline|(^|[^a-z])case/, key)) return P.casing;
      if (test(/rail|transit|subway|tram/, key)) return P.rail;
      if (test(/path|pedestrian|footway|cycleway|steps/, key)) return P.path;
      if (test(/motorway|trunk|primary/, key)) return P.roadMajor;
      if (test(/secondary|tertiary/, key)) return P.roadMid;
      return P.roadMinor;
    }
    return P.landAlt;
  }

  function textColor(key, P) {
    if (test(/city|town|capital|country|state|continent|province/, key)) return P.textStrong;
    if (test(/water|ocean|sea|lake|river/, key)) return P.waterText;
    if (test(/road|transportation|street|highway|path|oneway|shield/, key)) return P.textDim;
    if (test(/peak|mountain|volcano/, key)) return P.textDim;
    return P.text;
  }

  function themeStyle(style, pal) {
    var P = Object.assign({}, PALETTE, pal || {});
    var out = JSON.parse(JSON.stringify(style));
    out.name = 'Rasid dark';
    (out.layers || []).forEach(function (l) {
      var sl = l['source-layer'] || '', key = (sl + ' ' + (l.id || '')).toLowerCase();
      l.paint = l.paint || {};
      l.layout = l.layout || {};
      var pt = l.paint;
      if (l.type === 'background') {
        pt['background-color'] = P.land;
        delete pt['background-pattern'];
      } else if (l.type === 'fill') {
        var c = fillColor(key, P);
        pt['fill-color'] = c; pt['fill-opacity'] = 1;
        pt['fill-outline-color'] = /building/.test(key) ? P.buildingEdge : c;
        delete pt['fill-pattern']; delete pt['fill-antialias'];
      } else if (l.type === 'fill-extrusion') {
        pt['fill-extrusion-color'] = P.building3d; pt['fill-extrusion-opacity'] = 0.9;
        delete pt['fill-extrusion-pattern'];
      } else if (l.type === 'line') {
        pt['line-color'] = lineColor(key, P);
        delete pt['line-gradient']; delete pt['line-pattern'];
        if (/tunnel/.test(key)) pt['line-opacity'] = 0.5;
      } else if (l.type === 'symbol') {
        var hasText = l.layout['text-field'] != null, hasIcon = l.layout['icon-image'] != null;
        if (/(^|[^a-z])poi|housenumber/.test(key) || (hasIcon && !hasText)) {
          l.layout.visibility = 'none';
        } else {
          pt['text-color'] = textColor(key, P);
          pt['text-halo-color'] = P.land; pt['text-halo-width'] = 1.5; pt['text-halo-blur'] = 0.5;
          pt['icon-opacity'] = 0;
        }
      } else if (l.type === 'raster') {
        pt['raster-saturation'] = -0.8; pt['raster-brightness-max'] = 0.4; pt['raster-contrast'] = 0.1;
      } else if (l.type === 'hillshade') {
        pt['hillshade-shadow-color'] = '#050D0A'; pt['hillshade-highlight-color'] = '#1C3A2F'; pt['hillshade-accent-color'] = '#0A1511';
      }
    });
    return out;
  }

  /* A font stack the style's own glyph server certainly has: copy it from the first label layer. */
  function pickFont(style) {
    var layers = (style && style.layers) || [];
    for (var i = 0; i < layers.length; i++) {
      var tf = layers[i].layout && layers[i].layout['text-font'];
      if (Array.isArray(tf)) {
        if (tf[0] === 'literal' && Array.isArray(tf[1])) return tf[1].slice();
        if (tf.every(function (x) { return typeof x === 'string'; }) && tf[0] !== 'literal') return tf.slice();
      }
    }
    return ['Noto Sans Regular'];
  }

  return { PALETTE: PALETTE, themeStyle: themeStyle, pickFont: pickFont };
});

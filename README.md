# Busomad v3

Live bus positions on a real, restyled map of Tajikistan. Dark green, amber, the look of the first demo.
Tabs: Map, Stop board, Plan a trip, Share my bus, Routes (admin).

No packages to install. Node 18 or newer.

## Run
    ADMIN_CODE=choose-a-secret node server.js
Windows PowerShell: `$env:ADMIN_CODE="choose-a-secret"; node server.js`

## Put it online (Render, from GitHub)
Keep the folders exactly as in this zip: `server.js`, `package.json` at the top, then `lib/`, `public/`, `data/`.
Render: Web Service, Node, build command empty, start command `node server.js`, environment variable `ADMIN_CODE`.

## Map
The map style is fetched from OpenFreeMap (free, no key) and repainted in the browser by `public/theme.js`.
Change it with `STYLE_URL` (any OpenMapTiles-style `style.json`), or `STYLE_URL=none` for plain OpenStreetMap tiles.

## Useful links
- `/?fast=1` phones send every 5 s instead of 60 s (testing)
- `/?view=board&stop=8:s2&kiosk=1` full-screen stop board for one stop (use the stop id shown in the QR link)
- `/?lang=tg` open in Tajik (`en`, `ru`, `tg`)

## Settings (environment variables)
PORT, ADMIN_CODE, DRIVER_CODE, PING_MS (60000), STALE_MS (200000), STYLE_URL, TILE_URL, DATA_DIR, TRACK_LOG.

## Tests
    node --test test/unit.js test/ui-logic.js      calculations, map theme, trip planner
    node test/e2e.js                               needs Playwright; simulated phones in a browser

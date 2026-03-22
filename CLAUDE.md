# SafeZone — Middle East Conflict & Aviation Monitor

## Overview

SafeZone is a single-page web application that monitors Middle East conflict events and provides real-time flight tracking with danger zone detection. The entire app lives in one file: `index.html` (~1,800 lines of embedded CSS, HTML, and JavaScript).

## Architecture

- **Single file**: All CSS, HTML, and JS are in `index.html` — no build tools, no bundler, no framework.
- **Map**: Leaflet.js (v1.9.4) with CartoDB dark tiles.
- **Icons**: Font Awesome 6.5.
- **Tests**: `test-flights.mjs` — 190 test cases for flight tracking logic (run with Node.js).
- **Proxy**: `cloudflare-worker-proxy.js` — standalone Cloudflare Worker for proxying AirLabs API requests.

## Key Features

- **Conflict Map**: 45+ strike events (2024–2026) with actor/severity/type filtering and interactive markers.
- **8 Danger Zones**: Circular regions (Gaza, Lebanon, Beirut, Yemen, Red Sea, Israel, Syria, Iran) rendered as Leaflet circles with risk levels.
- **Flight Tracking**: Multi-source live tracking with 5-layer fallback (free sources first, paid last):
  1. ADS-B (adsb.lol, airplanes.live) — free real-time position
  2. OpenSky Network — free historical flight records
  3. Flight Plan Database — free real IFR airway routes
  4. AirLabs API — paid fallback via direct key or Cloudflare Worker proxy (only called after all free sources fail)
  5. Known Routes cache — 170+ pre-loaded airline routes (localStorage offline fallback)
- **Cloudflare Worker Proxy**: Optional CORS proxy (`cloudflare-worker-proxy.js`) for AirLabs API that keeps the API key secret server-side. Includes rate limiting (60 req/min/IP), health check endpoint, and input validation. The frontend verifies proxy connectivity on save and shows user-visible error toasts for proxy failures (401/403/429/502).
- **Danger Zone Crossing Detection**: Automatically checks if a tracked flight's route passes through any danger zone using haversine distance.
- **GPS Locate Me**: Browser geolocation button that shows the user's real-time position overlaid on the map, with warnings if inside or near danger zones.
- **Filtering**: Strike type, actor, severity, and danger zone toggle.
- **Responsive**: Collapsible left panel, mobile-friendly layout.

## Key Code Locations (index.html)

| Section | Approx. Lines |
|---------|---------------|
| CSS | 1–307 |
| HTML structure | 310–500 |
| Conflict events data (`CONFLICT_EVENTS`) | 539–610 |
| Danger zones data (`DANGER_ZONES`) | 613–622 |
| Map init (`initMap`) | 638–652 |
| Danger zone rendering | 657–667 |
| Conflict markers | 670–703 |
| Real IFR route fetching | 741–774 |
| Airports table (`AIRPORTS`) | 480–532 |
| Known routes cache (`KNOWN_ROUTES`) | 782–932 |
| Haversine / great-circle math | 1000–1030 |
| Callsign normalization | 1068–1087 |
| AirLabs + Proxy integration (`fetchAirlabs`, `saveProxyUrl`) | 1318–1420 |
| Main flight tracker (`trackFlightNumber`) | 1420–1600 |
| GPS Locate Me | locate-me section before TOAST |
| Toast notifications | `showToast()` |
| Boot / DOMContentLoaded | end of script |

## Project Rules

### Versioning
- Always increment `APP_VERSION` in `index.html` for every pull request.
- The version follows semver-like format: `vMAJOR.MINOR.PATCH`.

### Development
- Keep everything in the single `index.html` file — do not split into separate JS/CSS files.
- Do not modify existing features when adding new ones unless explicitly asked.
- Test file is `test-flights.mjs` — run with `node test-flights.mjs`.

### Cloudflare Worker Proxy Setup
1. Go to Cloudflare Dashboard → Workers & Pages → Create Worker.
2. Paste the contents of `cloudflare-worker-proxy.js` into the editor.
3. In Settings → Variables and Secrets, add `AIRLABS_API_KEY` as a **Secret** with your AirLabs key.
4. Deploy. The worker URL (e.g. `https://safezone-proxy.<subdomain>.workers.dev`) goes into the "Proxy URL" field in the app's API Keys section.
5. The proxy provides: `/health` (connectivity check), `/flights?flight_iata=XX123` (proxied AirLabs lookup), rate limiting, and CORS headers.

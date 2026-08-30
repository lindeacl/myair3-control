# MyAir3 Control (PWA)

A single-page web app that controls a physical **Advantage Air MyAir3**
ducted air-conditioning unit over the local network — power, mode
(Cool/Heat/Fan), fan speed, central and per-zone desired temperature, zone
on/off, and damper percentage. It talks directly to the unit's own local
HTTP/XML control API; there is no cloud service, no account, and no data
leaves your home network.

It's a single `index.html` (vanilla HTML/CSS/JS, no framework, no
bundler) plus a small Python stdlib server (`server.py`) that serves the
app and proxies its requests to the unit. See `docs/CODE_STANDARDS.md`
Section 0 for the full stack breakdown.

## Running it

```bash
python3 server.py [--port 8080] [--target-ip 192.168.1.192] [--target-port 2025]
```

- `--port` — the port this server listens on (default `8080`).
- `--target-ip` / `--target-port` — the aircon controller's default
  address (default `192.168.1.192:2025`). This is only a *default*: the
  app's Settings screen can override the IP/port per-request, so you don't
  need to restart the server to point it at a different controller.

`server.py` serves the app's static files **and** proxies `/proxy/*`
requests to the controller. Routing every request through this one
same-origin server sidesteps both mixed-content (an HTTPS page can't fetch
a plain-HTTP device) and CORS (the unit's embedded web server doesn't send
CORS headers) — neither restriction applies to a browser fetching its own
origin.

Once it's running, the terminal output prints both URLs:

- On the machine running `server.py`: `http://localhost:8080/`
- On a phone on the same WiFi: `http://<that machine's LAN IP>:8080/`

## Opening the app

Two ways to use it:

1. **Browser** — open the URL `server.py` prints, on any device on the
   same WiFi as both the server and the aircon unit. It's a PWA (see
   `manifest.webmanifest`), so most browsers offer "Add to Home Screen" /
   "Install app" for an app-like icon and standalone window.
2. **iOS app** — the sibling `../ios-app` directory (a separate repo, not
   part of this one) wraps this same UI in a Capacitor shell for a native
   iOS build. On a real device, Capacitor's native networking bypasses
   CORS/mixed-content entirely, so no proxy server is needed there — see
   that repo's own docs for building/running it.

## First-time setup

No environment variables or config files to edit. On first load, open the
in-app **Settings** screen (gear icon, top right) and fill in:

- **Controller IP** — your MyAir3 controller's local IP address
- **Port** — its control-API port (unit default `2025`)
- **Password** — the controller's own access password
- **Number of zones** — how many zones your system has

These are saved to `localStorage` in the browser (or the native app's
WebView storage), so they persist across reloads without any server-side
config.

## Running the test suite

```bash
npx playwright test
```

This runs the full E2E suite (`e2e/aircon-control.spec.js` + the property
tests in `e2e/property/`) against the real app in a headless browser, with
the aircon controller mocked. `node scripts/check-coverage.mjs` checks
real V8 execution coverage of `index.html`'s inline script against this
project's coverage floor. See `CLAUDE.md` for the full list of gates this
project runs (mechanical checks, mutation testing, defect density, etc.).

## More

This repo also carries a full AI-agent governance/quality-gate kit (code
review, coverage/defect-density ratchets, CI gates, and more) — see
`CLAUDE.md` for the process docs and `docs/` for the full reference
playbooks it summarizes. `CONTRIBUTING.md` has the short version for
anyone making a change.

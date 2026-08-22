import { test, expect } from './fixtures.js';
import { mockController } from './support/mock-controller.js';

// addInitScript reruns on every navigation (including reload()) -- fine for
// most tests, but the persistence test below reloads deliberately to prove
// a value survives, so it seeds manually instead of via this shared hook.
async function seedConnSettings(page) {
  await page.addInitScript(() => {
    localStorage.setItem('connSettings', JSON.stringify({ ip: '192.168.1.192', port: '2025', password: 'password', zones: '3' }));
  });
}

test('zones render on load', async ({ page }) => {
  await seedConnSettings(page);
  await mockController(page);
  await page.goto('/index.html');
  await expect(page.locator('#zone-container .zone-tile')).toHaveCount(3);
});

// Regression test for the dashboard-redesign request: the zone row used to
// be a fixed-width horizontal-scroll strip (flex: 0 0 112px tiles inside an
// overflow-x: auto container); it's now a plain evenly-split row that must
// never scroll or clip content, at the real mobile width this was reported
// against (375px -- the default Playwright viewport is 1280x720 and would
// not have caught either the original scroll strip or the truncation
// regression this fix also had to correct along the way).
test('zone row fills the width evenly with no horizontal scroll at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedConnSettings(page);
  await mockController(page);
  await page.goto('/index.html');

  const container = page.locator('#zone-container');
  await expect(container.locator('.zone-tile')).toHaveCount(3);

  // The row itself must not overflow its own box -- i.e. no horizontal
  // scrollbar, whatever CSS produces the layout.
  const overflow = await container.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Each tile's full name must be visible (not clipped by an ellipsis or
  // any other overflow:hidden truncation) -- this is what the earlier
  // white-space:nowrap + text-overflow:ellipsis regression broke.
  const nameOverflows = await container.locator('.zone-tile-name').evaluateAll(
    (nodes) => nodes.map((n) => n.scrollWidth - n.clientWidth)
  );
  for (const delta of nameOverflows) {
    expect(delta).toBeLessThanOrEqual(1);
  }

  // And the visible text must be the untruncated default names, not a
  // "MAIN BED..." style cutoff.
  await expect(container.locator('.zone-tile-name').nth(0)).toHaveText('MAIN BEDROOM');
  await expect(container.locator('.zone-tile-name').nth(1)).toHaveText('TK BEDROOM');
  await expect(container.locator('.zone-tile-name').nth(2)).toHaveText('SPARE BEDROO');
});

// Regression test for the bug where a zone's On/Off pill (inside <summary>,
// used stopPropagation() to stop the details card from also toggling open)
// silently blocked the app's own command handler from ever running --
// nothing called preventDefault, so the browser fell through to the link's
// raw default navigation instead of sending the command silently.
test('zone On/Off sends silently and does not navigate away', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');

  const startUrl = page.url();
  const onLink = page.locator('[data-zone-on="2"]');

  const requestPromise = page.waitForRequest((req) => req.url().includes('/setZoneData') && req.url().includes('zone=2') && req.url().includes('zoneSetting=1'));
  await onLink.click();
  await requestPromise;

  // The core regression check: clicking must not navigate the page.
  expect(page.url()).toBe(startUrl);
  // And the command must actually have been sent and reflected.
  await expect(onLink).toHaveClass(/active/, { timeout: 3000 });
});

test('zone Off pill also sends silently and does not navigate', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');
  const startUrl = page.url();
  const offLink = page.locator('[data-zone-off="1"]');
  const requestPromise = page.waitForRequest((req) => req.url().includes('/setZoneData') && req.url().includes('zone=1') && req.url().includes('zoneSetting=0'));
  await offLink.click();
  await requestPromise;
  expect(page.url()).toBe(startUrl);
});

// Regression test for the bug where a tapped toggle button (Power/Mode/Zone
// On-Off) only showed as selected once the ENTIRE confirm round-trip
// finished -- send command, wait 900ms, re-fetch system + every zone
// sequentially. Against a slow/real controller that's multiple seconds of
// the button looking unpressed, which read as "my tap didn't register" and
// prompted tapping again. delayMs simulates a slow controller; the active
// class must appear well before that delay elapses, proving it's applied
// optimistically on tap rather than waiting for the network round-trip.
test('toggle buttons show selected immediately on tap, not after the full confirm round-trip', async ({ page }) => {
  await mockController(page, { delayMs: 3000 });
  await page.goto('/index.html');
  const onLink = page.locator('[data-zone-on="2"]');
  await onLink.click();
  await expect(onLink).toHaveClass(/active/, { timeout: 500 });
});

test('power On/Off command buttons send silently, not via raw navigation', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');
  const startUrl = page.url();
  const requestPromise = page.waitForRequest((req) => req.url().includes('/setSystemData') && req.url().includes('airconOnOff=1'));
  await page.locator('#link-on').click();
  await requestPromise;
  expect(page.url()).toBe(startUrl);
  await expect(page.locator('#link-on')).toHaveClass(/active/, { timeout: 3000 });
});

// Regression test for the bug where sending a command then immediately
// re-reading state raced the unit's own internal update: a refresh landing
// before the (simulated slow) unit applied the change would read back the
// stale value and clobber whatever was just typed. staleGetSystemData:true
// simulates a unit that never catches up within the test's timeframe, so if
// the grace-window protection didn't exist, the field would visibly revert.
test('central temp field holds the value you just set even if a refresh reads stale state', async ({ page }) => {
  await mockController(page, { staleGetSystemData: true });
  await page.goto('/index.html');

  const tempInput = page.locator('#centralTemp');
  await tempInput.fill('24.5');
  await tempInput.dispatchEvent('input');

  const requestPromise = page.waitForRequest((req) => req.url().includes('/setSystemData') && req.url().includes('centralDesiredTemp=24.5'));
  await page.locator('#link-temp').click();
  await requestPromise;

  // Give the app's internal 900ms delay + refreshState() call time to run
  // (and, if the grace window were broken, time to clobber the field).
  await page.waitForTimeout(1500);

  await expect(tempInput).toHaveValue('24.5');
});

// Regression test for the same bug class as above, but for toggle buttons
// (Power/Mode/Zone On-Off) rather than text fields: setActive() had no
// grace-window protection at all, unlike setValueUnlessFocused(), so a
// refresh landing before the (simulated slow/stale) unit caught up would
// silently flip the button back off, looking exactly like the tap didn't
// register and prompting a second tap.
test('power On button stays selected even if a refresh reads stale state', async ({ page }) => {
  await mockController(page, { staleGetSystemData: true });
  await page.goto('/index.html');

  const onLink = page.locator('#link-on');
  const requestPromise = page.waitForRequest((req) => req.url().includes('/setSystemData') && req.url().includes('airconOnOff=1'));
  await onLink.click();
  await requestPromise;

  // Give the app's internal 900ms delay + refreshState() call time to run
  // against the stale (never-catches-up) snapshot -- if the grace window
  // were broken, this is where the button would revert.
  await page.waitForTimeout(1500);

  await expect(onLink).toHaveClass(/active/);
});

// Same bug class again, but for the "Unit is ON/OFF..." caption below the
// dial -- a fifth mirror of link-on's protected state, found by a review of
// this fix's port into the sibling ios-app repo: it still read the raw
// airconOnOff response instead of link-on's already-protected classList, so
// it could show "Unit is OFF" while the Power button right above it
// correctly still showed ON.
test('the "Unit is ON/OFF" caption matches the Power button even if a refresh reads stale state', async ({ page }) => {
  await mockController(page, { staleGetSystemData: true });
  await page.goto('/index.html');

  const note = page.locator('#central-state-note');
  await expect(note).toContainText('Unit is OFF'); // load-time refresh reflects the unit: off

  const onLink = page.locator('#link-on');
  const requestPromise = page.waitForRequest((req) => req.url().includes('/setSystemData') && req.url().includes('airconOnOff=1'));
  await onLink.click();
  await requestPromise;

  // Give the app's internal 900ms delay + refreshState() call time to run
  // against the stale (never-catches-up) snapshot -- without the fix, this
  // is where the caption would flip back to "OFF" even though the button
  // stays ON.
  await page.waitForTimeout(1500);

  await expect(onLink).toHaveClass(/active/);
  await expect(note).toContainText('Unit is ON');
});

// Same bug class, zone On/Off variant: refreshState() sets these via a
// direct classList.toggle() rather than setActive(), so it's a distinct
// code path that needs its own coverage even though the fix is the same.
test('zone On button stays selected even if a refresh reads stale state', async ({ page }) => {
  await mockController(page, { staleGetSystemData: true });
  await page.goto('/index.html');

  const onLink = page.locator('[data-zone-on="2"]');
  const requestPromise = page.waitForRequest((req) => req.url().includes('/setZoneData') && req.url().includes('zone=2') && req.url().includes('zoneSetting=1'));
  await onLink.click();
  await requestPromise;

  await page.waitForTimeout(1500);

  await expect(onLink).toHaveClass(/active/);
});

// Same bug class again, but for the read-only elements that MIRROR a
// protected control. The grace window kept #centralTemp at 24.5, while the
// headline display next to it was painted straight from the stale response
// and snapped back to 22.0 -- a half-reverted UI that reads as "didn't take"
// exactly like the button reverting did.
test('the big central temp display holds the value you just set, matching its input', async ({ page }) => {
  await mockController(page, { staleGetSystemData: true });
  await page.goto('/index.html');

  const tempInput = page.locator('#centralTemp');
  await tempInput.fill('24.5');
  await tempInput.dispatchEvent('input');

  const requestPromise = page.waitForRequest((req) => req.url().includes('/setSystemData') && req.url().includes('centralDesiredTemp=24.5'));
  await page.locator('#link-temp').click();
  await requestPromise;

  await page.waitForTimeout(1500);

  await expect(page.locator('#central-temp-display')).toHaveText('24.5°');
  await expect(tempInput).toHaveValue('24.5');
});

// The zone on/off <select> is not just a readout -- its value is baked into
// the zone's temp/damper command URLs. A stale refresh flipping it back
// therefore changes what the NEXT tap of the same ✓ sends, silently turning
// the zone off after you deliberately set it on.
test("a zone's on/off select holds the setting its command just sent even if a refresh reads stale state", async ({ page }) => {
  await mockController(page, { staleGetSystemData: true });
  await page.goto('/index.html');

  await page.locator('[data-zone-title-name="2"]').click(); // opens zone 2's detail screen
  await page.locator('.advanced-summary').click(); // the setting select lives under the collapsed Advanced disclosure
  const settingSelect = page.locator('[data-zone-setting="2"]');
  await expect(settingSelect).toHaveValue('0'); // load-time refresh reflects the unit: zone 2 is off

  await settingSelect.selectOption('1');
  const requestPromise = page.waitForRequest((req) => req.url().includes('/setZoneData') && req.url().includes('zone=2') && req.url().includes('zoneSetting=1'));
  await page.locator('[data-zone-temp-link="2"]').click();
  await requestPromise;

  await page.waitForTimeout(1500);

  await expect(settingSelect).toHaveValue('1');
});

// Same bug class as the select test above, but for the Zone Detail "Zone
// state" stat card -- a READ-ONLY mirror of that same select's value. The
// select itself is grace-protected (see the test above), but the stat card
// next to it is painted straight from the network response with no grace
// check, so it can snap back to "Off" while the select underneath still
// correctly reads "On" -- the same "didn't take" symptom in a different
// element, same class as central-temp-display / zone-percent-display-val.
test("the zone detail 'Zone state' stat card holds the setting its command just sent even if a refresh reads stale state", async ({ page }) => {
  await mockController(page, { staleGetSystemData: true });
  await page.goto('/index.html');

  await page.locator('[data-zone-title-name="2"]').click(); // opens zone 2's detail screen
  const stateDisplay = page.locator('#zone-state-display');
  await expect(stateDisplay).toHaveText('Off'); // load-time refresh reflects the unit: zone 2 is off

  await page.locator('.advanced-summary').click(); // the setting select lives under the collapsed Advanced disclosure
  const settingSelect = page.locator('[data-zone-setting="2"]');
  await settingSelect.selectOption('1');
  const requestPromise = page.waitForRequest((req) => req.url().includes('/setZoneData') && req.url().includes('zone=2') && req.url().includes('zoneSetting=1'));
  await page.locator('[data-zone-temp-link="2"]').click();
  await requestPromise;

  await page.waitForTimeout(1500);

  await expect(stateDisplay).toHaveText('On');
});

// The grace window deliberately blocks refreshState() from correcting an
// optimistic highlight for a few seconds. When the send is known to have
// FAILED, though, that highlight is known-wrong, and holding the window
// would make the one case we're certain about the one case nothing may fix.
test('a failed command releases its grace window so the next refresh corrects the highlight', async ({ page }) => {
  await page.addInitScript(() => {
    window.open = () => null; // swallow the web fallback's popup; not what this test is about
  });
  await mockController(page);
  await page.goto('/index.html');

  await page.route('**/proxy/setSystemData**', (route) => route.abort('failed'));

  await page.locator('#link-on').click();
  await expect(page.locator('#link-on')).not.toHaveClass(/pending/, { timeout: 3000 });
  // Highlight went on optimistically, but the unit never got the command.
  // Flipping auto-refresh on runs refreshState() immediately; it must be
  // allowed to clear the highlight rather than being held off for 5s.
  await page.locator('#settings-open').click(); // Live Refresh now lives on the Settings screen
  await page.locator('#live-poll-toggle').check();
  await expect(page.locator('#link-on')).not.toHaveClass(/active/, { timeout: 3000 });
});

test('connection settings persist across reload via localStorage', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');
  await page.locator('#settings-open').click();
  await page.locator('#ip').fill('10.0.0.50');
  await page.locator('#ip').dispatchEvent('input');
  await page.reload();
  await page.locator('#settings-open').click();
  await expect(page.locator('#ip')).toHaveValue('10.0.0.50');
});

test('settings screen opens and closes without navigating away', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');
  const startUrl = page.url();
  const mainHeading = page.locator('h1', { hasText: 'MyAir3' });
  const settingsHeading = page.locator('h1', { hasText: 'Settings' });

  await expect(page.locator('#main-view')).toBeVisible();
  await expect(page.locator('#settings-view')).toBeHidden();
  await expect(mainHeading).toBeVisible();
  await expect(settingsHeading).toBeHidden();

  await page.locator('#settings-open').click();
  await expect(page.locator('#settings-view')).toBeVisible();
  await expect(page.locator('#main-view')).toBeHidden();
  // The regression this guards against: the "MyAir3" header lives outside
  // both view containers, so it's easy to leave it always-visible and end
  // up with both headers stacked on the Settings screen -- toBeHidden()
  // on #main-view alone doesn't catch that, since the header was never
  // inside #main-view in the broken version.
  await expect(settingsHeading).toBeVisible();
  await expect(mainHeading).toBeHidden();

  await page.locator('#settings-close').click();
  await expect(page.locator('#main-view')).toBeVisible();
  await expect(page.locator('#settings-view')).toBeHidden();
  await expect(mainHeading).toBeVisible();
  await expect(settingsHeading).toBeHidden();
  expect(page.url()).toBe(startUrl);
});

// Settings is the only screen where the controller IP/port/password/zone
// count can change, so whatever the main screen last read can be stale or
// aimed at the wrong device the moment you come back. Auto-refresh defaults
// to OFF, so without a re-read on return there is no correction at all until
// the app is backgrounded and reopened.
test('returning from settings re-reads system state', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');
  await page.locator('#settings-open').click();

  const refreshed = page.waitForRequest((req) => req.url().includes('/getSystemData'), { timeout: 3000 });
  await page.locator('#settings-close').click();
  await refreshed;
});

test('zone detail opens and closes without navigating away', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');
  const startUrl = page.url();

  await expect(page.locator('#main-view')).toBeVisible();
  await expect(page.locator('#zone-view')).toBeHidden();

  await page.locator('[data-zone-open="2"]').click();
  await expect(page.locator('#zone-view')).toBeVisible();
  await expect(page.locator('#main-view')).toBeHidden();
  await expect(page.locator('#zone-view-name')).toHaveText('TK BEDROOM');

  await page.locator('#zone-back').click();
  await expect(page.locator('#main-view')).toBeVisible();
  await expect(page.locator('#zone-view')).toBeHidden();
  expect(page.url()).toBe(startUrl);
});

// Locks in the "de-emphasize admin bits" design intent: the zone setting
// select and the raw-XML diagnostics link are debug/advanced tools, not
// primary controls, so they stay tucked away until the viewer asks for them.
test('zone detail Advanced controls are collapsed by default', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');

  await page.locator('[data-zone-open="1"]').click();
  const details = page.locator('.advanced-details');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(page.locator('[data-zone-setting]')).toBeHidden();

  await page.locator('.advanced-summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(page.locator('[data-zone-setting]')).toBeVisible();
});

// Same regression class as the Settings/native-only sheet-leak checks: the
// sheet is a page-level overlay outside every view container, so nothing
// hides it automatically when Zone Detail's back button changes the view.
test('opening a zone does not leak the raw-output sheet across the transition', async ({ page }) => {
  const nativeBase = 'http://192.168.1.192:2025';
  await page.addInitScript(() => {
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { Haptics: { impact: async () => {}, notification: async () => {} } },
    };
  });
  await mockController(page, { nativeBase });
  await page.goto('/index.html');

  await page.locator('[data-zone-open="1"]').click();
  await page.locator('.advanced-summary').click(); // the diagnostics link lives under the collapsed Advanced disclosure
  await page.locator('[data-zone-data="1"]').click();
  const sheet = page.locator('#raw-output-sheet');
  await expect(sheet).toBeVisible();

  await page.locator('#zone-back').click();
  await expect(sheet).toBeHidden();
});

test('mode buttons (Cool/Heat/Fan) send silently and show selected', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');
  const requestPromise = page.waitForRequest((req) => req.url().includes('/setSystemData') && req.url().includes('mode=2'));
  await page.locator('#link-mode-2').click();
  await requestPromise;
  await expect(page.locator('#link-mode-2')).toHaveClass(/active/, { timeout: 3000 });
});

test('fan speed set and Auto both send the correct value', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');

  const fanInput = page.locator('#fanSpeed');
  await fanInput.fill('3');
  await fanInput.dispatchEvent('input');
  const setPromise = page.waitForRequest((req) => req.url().includes('/setSystemData') && req.url().includes('fanSpeed=3'));
  await page.locator('#link-fan').click();
  await setPromise;

  const autoPromise = page.waitForRequest((req) => req.url().includes('/setSystemData') && req.url().includes('fanSpeed=auto'));
  await page.locator('#link-fan-auto').click();
  await autoPromise;
});

// A network failure shouldn't leave a button permanently stuck mid-tap, and
// on the web build (no silent-send fallback available) it should fall back
// to opening the raw link directly rather than doing nothing.
test('a failed command clears its pending state instead of hanging', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');

  await page.route('**/proxy/setSystemData**', (route) => route.abort('failed'));

  await page.locator('#link-on').click();
  // Don't assert on the window.open() fallback itself -- popup detection is
  // flaky across headless environments (passed locally, timed out in CI's
  // headless Linux Chromium). The behavior that actually matters is that a
  // failed send doesn't leave the button stuck mid-tap.
  await expect(page.locator('#link-on')).not.toHaveClass(/pending/, { timeout: 3000 });
});

// isNative() is always false under Playwright (there's no real Capacitor
// native bridge in a plain browser), so the native-only branches -- the
// "Get System Data"/"Get Zone Data" raw-output fetch, and proxyPath() going
// direct-to-controller instead of through /proxy -- never executed in this
// suite at all. Faking window.Capacitor before the page loads exercises that
// code path for real, including that it fetches the DIRECT (non-proxy) URL.
test('native-only: Get System Data shows raw XML inline instead of navigating', async ({ page }) => {
  const nativeBase = 'http://192.168.1.192:2025';
  await page.addInitScript(() => {
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { Haptics: { impact: async () => {}, notification: async () => {} } },
    };
  });
  await mockController(page, { nativeBase });
  await page.goto('/index.html');

  const startUrl = page.url();
  await page.locator('#settings-open').click();
  await page.locator('#link-status').click();

  const sheet = page.locator('#raw-output-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#raw-output')).toContainText('<systemData>');
  expect(page.url()).toBe(startUrl); // must not have navigated to the raw XML like the web fallback does

  // The sheet is a page-level fixed overlay, outside both view containers, and
  // the only thing that opens it (.data links) lives on the Settings screen.
  // Leaving it up when the view changes strands raw XML over the main control
  // screen with nothing on screen that produced it.
  await page.locator('#settings-close').click();
  await expect(sheet).toBeHidden();
});

// Regression test for the dial +/- buttons feeling "sticky, hardly works" on
// a real device: .dial-center is an absolutely-positioned, full-size
// (inset:0) flex container that exists purely to center the temp digits/
// confirm button, and it painted AFTER (on top of) the .dial-edge +/-
// buttons in DOM order. Without pointer-events:none, its transparent
// flex-gutter silently intercepted taps on whichever portion of each edge
// button it overlapped -- invisible to a mouse-driven .fill()-based test,
// but real on a touchscreen (confirmed via elementFromPoint hit-testing).
// Playwright's .click() does its own actionability/interceptability check
// and would have caught this if any test had ever clicked these buttons --
// this is that test, for both the central dial and the Zone Detail dial,
// which share the same .dial-center/.dial-edge CSS classes.
test('dial +/- buttons are clickable and not obscured by .dial-center', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');

  const centralInput = page.locator('#centralTemp');
  await expect(centralInput).toHaveValue('22');
  await page.locator('#main-view .dial-edge.plus').click();
  await expect(centralInput).toHaveValue('22.5');
  await page.locator('#main-view .dial-edge.minus').click();
  await expect(centralInput).toHaveValue('22.0');

  await page.locator('[data-zone-open="2"]').click();
  await expect(page.locator('#zone-view')).toBeVisible();

  const zoneInput = page.locator('[data-zone-temp-input]');
  await expect(zoneInput).toHaveValue('22');
  await page.locator('#zone-view .dial-edge.plus').click();
  await expect(zoneInput).toHaveValue('22.5');
  await page.locator('#zone-view .dial-edge.minus').click();
  await expect(zoneInput).toHaveValue('22.0');
});

// Regression test for the high-zone-count edge case the fixed-row zone
// layout surfaced: .zone-tile is `flex: 1 1 0` with no min-width floor would
// let a tile shrink narrower than its own .zone-tile-icon (a fixed 28px box),
// pushing the icon's box past the tile's own right edge and into the next
// tile's clickable area -- a real hit-test overlap, not just a look, since
// the icon sits inside .zone-tile-main's data-zone-open click target. The
// "no horizontal scroll" test above only ever renders the default 3 zones,
// which stay comfortably wide, so it can't catch this; this test drives the
// #zones setting to 16 (the field's own max) to reproduce the width this
// bug actually needs. Verified fail-before/pass-after by temporarily setting
// .zone-tile's min-width to 0.
test('zone tile icons never spill past their own tile into the next one at high zone counts', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    localStorage.setItem('connSettings', JSON.stringify({ ip: '192.168.1.192', port: '2025', password: 'password', zones: '16' }));
  });
  await mockController(page);
  await page.goto('/index.html');

  const tiles = page.locator('#zone-container .zone-tile');
  await expect(tiles).toHaveCount(16);

  const overflows = await page.evaluate(() => {
    return [...document.querySelectorAll('#zone-container .zone-tile')].map((tile) => {
      const tileRect = tile.getBoundingClientRect();
      const iconRect = tile.querySelector('.zone-tile-icon').getBoundingClientRect();
      // How far the icon's box extends past its own tile's right edge.
      return iconRect.right - tileRect.right;
    });
  });
  for (const overflow of overflows) {
    expect(overflow).toBeLessThanOrEqual(0.5);
  }
});

// Regression for the NaN-color defect found in review: tempToColor() has no
// guard against a NaN input, and every OTHER parseFloat() call in this file
// (updateDialRing, the temp displays) already falls back to a default
// instead of feeding NaN through -- refreshState()'s new desiredTemp->tint
// wiring skipped that guard. A NaN component makes tempToColor() return
// "rgb(NaN, NaN, NaN)", an invalid CSS value; per the custom-properties
// spec, an *invalid* var() value does NOT fall back to var()'s second
// argument (only an *undefined* property does that) -- it makes the
// property invalid at computed-value time, so
// `background: var(--zone-temp-tint, var(--card-2))` resolves to
// transparent instead of the intended default, leaving the icon looking
// broken instead of merely un-tinted. Verified fail-before/pass-after by
// temporarily removing the `!Number.isNaN(...)` guard.
test('a zone with a non-numeric desiredTemp does not corrupt the tile icon color', async ({ page }) => {
  const state = await mockController(page);
  state.zones[1].desiredTemp = ''; // present-but-unparseable <desiredTemp>, as a malformed response might send
  // Set up the wait BEFORE navigating -- refreshState()'s initial read is
  // fire-and-forget (see the comment at its call site), so without this the
  // assertions below could run before the mocked getZoneData response (and
  // the DOM writes that depend on it) has actually landed, making the test
  // pass even on a broken build purely by racing ahead of the bug.
  const zone1Read = page.waitForResponse((res) => res.url().includes('/getZoneData') && res.url().includes('zone=1'));
  await page.goto('/index.html');
  await zone1Read;

  const tintSet = await page.evaluate(() => {
    const tile = document.querySelector('[data-zone-open="1"]').closest('.zone-tile');
    return tile.style.getPropertyValue('--zone-temp-tint');
  });
  expect(tintSet).toBe(''); // guard skipped setting it -- icon keeps the default var(--card-2) look

  const icon = page.locator('[data-zone-open="1"] .zone-tile-icon');
  const bg = await icon.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)'); // would be transparent if the invalid var() had been set
});

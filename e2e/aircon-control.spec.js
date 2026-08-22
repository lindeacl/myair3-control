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

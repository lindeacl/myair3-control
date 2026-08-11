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
  await expect(page.locator('#zone-container details')).toHaveCount(3);
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

test('connection settings persist across reload via localStorage', async ({ page }) => {
  await mockController(page);
  await page.goto('/index.html');
  await page.locator('#connection-details summary').click();
  await page.locator('#ip').fill('10.0.0.50');
  await page.locator('#ip').dispatchEvent('input');
  await page.reload();
  await page.locator('#connection-details summary').click();
  await expect(page.locator('#ip')).toHaveValue('10.0.0.50');
});

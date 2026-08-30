// Property tests (PROPERTY_TESTING.md) — invariant testing for the edges
// enumerated tests miss (DEFECT_DISCIPLINE.md Rule 8, TESTING_HANDOFF.md
// §6.3). Adapted from the upstream template for this project's real stack:
//
//   - The template assumes Vitest + `import { ... } from '../src/money.js'`.
//     This app has no unit-test layer and no separate source modules — all
//     logic lives inline in index.html's classic (non-module) <script>, so
//     every top-level `function` declared there is a property of `window`
//     once the page loads. These tests drive the REAL running app via
//     Playwright's `page.evaluate`/DOM APIs rather than reimplementing the
//     logic in the test file — per DEFECT_DISCIPLINE.md Rule 2 ("probe the
//     running system, don't trust a copy of it").
//   - Invariants below were found per PROPERTY_TESTING.md §2's discovery
//     method (grep the actual source for temp/percent/state-setting logic),
//     not copied from the template's money-transfer examples.
//
// Runs in the same suite as everything else: `npx playwright test`.
import { test, expect } from '../fixtures.js';
import fc from 'fast-check';

test.describe('property: tempToColor() dial-ring color mapping', () => {
  // index.html's tempToColor(t) (~line 793) maps a temperature to an RGB
  // color for the dial ring / zone-tile tint, clamping its input to the
  // unit's real range [16, 30] with `Math.min(30, Math.max(16, t))` before
  // interpolating. Invariant: for ANY finite number (in-range, negative,
  // or absurdly large — not just the values a hand-written test would
  // think to try), the result is always a well-formed rgb(r, g, b) string
  // with each component an integer in [0, 255].
  //
  // Known gap this test deliberately does NOT assert on: tempToColor()
  // itself has no internal NaN guard — Math.max(16, NaN) is NaN, so a NaN
  // input produces "rgb(NaN, NaN, NaN)", an invalid CSS value. This is a
  // real, already-discovered defect class (see the commit history around
  // "unguarded parseFloat() feeding NaN into a CSS custom property" /
  // .claude/defects.jsonl) — every CALL SITE was fixed to guard against
  // NaN before calling tempToColor() (see index.html ~line 1268), but the
  // function itself still isn't safe against a NaN argument directly. This
  // test's domain is deliberately restricted to `noNaN: true` to test the
  // guarantee that actually holds today; it is not silently masking the
  // gap — the gap is fixing the function itself so every current and
  // future call site gets the guarantee for free, which is an app-code
  // change outside this governance-kit install's scope. Fix the class, not
  // the instance (DEFECT_DISCIPLINE.md Rule 1): if this function grows a
  // new unguarded call site, `noNaN: true` here would not catch it either.
  test('always returns a clamped, well-formed rgb() string', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof window.tempToColor === 'function');

    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(-1000), max: Math.fround(1000), noNaN: true }),
        async (t) => {
          const result = await page.evaluate((temp) => window.tempToColor(temp), t);
          const m = /^rgb\((\d{1,3}), (\d{1,3}), (\d{1,3})\)$/.exec(result);
          expect(m, `unexpected format: ${result}`).not.toBeNull();
          const [r, g, b] = m.slice(1).map(Number);
          for (const component of [r, g, b]) {
            expect(component).toBeGreaterThanOrEqual(0);
            expect(component).toBeLessThanOrEqual(255);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

test.describe('property: zone desired-temp stepper stays in range', () => {
  // The shared +/- stepper handler (index.html ~line 999) computes
  // `Math.min(max, Math.max(min, (parseFloat(input.value) || 0) + delta))`
  // against the TARGET INPUT'S OWN min/max attributes — the same clamp
  // idiom used for both the central dial and every Zone Detail dial.
  // Invariant: no sequence of +/-0.5 taps can ever push the zone's desired
  // temperature outside its native [16, 30] range, regardless of how many
  // taps or which direction — driven through the real button clicks against
  // the real DOM, not a reimplementation of the clamp math.
  test('any sequence of +/- taps keeps zone desired temp within [16, 30]', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'connSettings',
        JSON.stringify({ ip: '192.168.1.192', port: '2025', password: 'password', zones: '3' }),
      );
    });
    await page.goto('/index.html');
    // Open Zone Detail for zone 1 so the shared dial-edge stepper buttons
    // are pointed at a real zone's temp input (openZoneDetail() re-points
    // the reusable [data-zone-temp-input] field — see index.html's
    // "reusable shared-DOM fields" comment block).
    await page.evaluate(() => window.openZoneDetail && window.openZoneDetail('1'));

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('minus', 'plus'), { minLength: 0, maxLength: 60 }),
        async (taps) => {
          // Reset to a known seed value before each generated run.
          await page.evaluate(() => {
            document.querySelector('[data-zone-temp-input]').value = '22';
          });
          for (const dir of taps) {
            await page.click(`.dial-edge.${dir}[data-step-target="[data-zone-temp-input]"]`);
          }
          const value = await page.$eval('[data-zone-temp-input]', (el) => parseFloat(el.value));
          expect(value).toBeGreaterThanOrEqual(16);
          expect(value).toBeLessThanOrEqual(30);
        },
      ),
      { numRuns: 25 }, // each run does up to 60 real clicks — keep numRuns modest
    );
  });
});

test.describe('property: damper percentage invariant', () => {
  // The damper-percent range input (index.html ~line 652,
  // [data-zone-percent-input], min=0 max=100 step=5) is the app's other
  // real 0-100 invariant (task-suggested: "damper percentage stays 0-100").
  // Per the HTML spec, assigning `.value` on a range input outside its own
  // min/max clamps automatically — this test asserts that guarantee holds
  // for THIS project's actual markup (i.e. min/max are really "0"/"100" and
  // haven't drifted), and that the app's own percent-display readout
  // (`percentDisplay.textContent = percentInput.value + '%'`, index.html
  // ~line 1288) never surfaces a value outside that range to the user.
  test('damper percent input and its display readout stay within [0, 100] for any assigned value', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'connSettings',
        JSON.stringify({ ip: '192.168.1.192', port: '2025', password: 'password', zones: '3' }),
      );
    });
    await page.goto('/index.html');
    await page.evaluate(() => window.openZoneDetail && window.openZoneDetail('1'));

    await fc.assert(
      fc.asyncProperty(
        // Includes deliberately out-of-range values (negative, >100) —
        // the interesting part of this invariant is what happens at the
        // boundary and beyond it, not just values already inside [0, 100].
        fc.float({ min: Math.fround(-500), max: Math.fround(500), noNaN: true }),
        async (assigned) => {
          const value = await page.evaluate((v) => {
            const el = document.querySelector('[data-zone-percent-input]');
            el.value = String(v);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            const display = document.getElementById('zone-percent-display-val');
            return { input: Number(el.value), display: display ? display.textContent : null };
          }, assigned);
          expect(value.input).toBeGreaterThanOrEqual(0);
          expect(value.input).toBeLessThanOrEqual(100);
          if (value.display) {
            const displayed = parseFloat(value.display);
            expect(displayed).toBeGreaterThanOrEqual(0);
            expect(displayed).toBeLessThanOrEqual(100);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

#!/usr/bin/env node
/**
 * Merges the per-test V8 coverage collected by e2e/fixtures.js and reports
 * what fraction of index.html's inline <script> actually executed across the
 * whole E2E suite. Fails if below the floor.
 *
 * This exists because there's no Vitest/unit-test layer in this project
 * (single HTML file, no bundler, nothing isolable to unit-test) -- V8's own
 * execution coverage is the honest substitute: it measures what code paths
 * the E2E suite actually ran, not a guess.
 *
 * Usage: node scripts/check-coverage.mjs [--floor=N]
 * (run `npx playwright test` first -- this reads its output)
 */
import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'coverage-raw');
// Floor = measured reality (84.8% as of the E2E suite this was set against)
// minus a hair for churn, per TESTING_HANDOFF.md's coverage policy: this is
// a regression floor, not a target -- raise it as the suite grows, never
// lower it without a comment explaining why.
//
// Known limitation: coverage for a script instance torn down by a mid-test
// page.reload() can under-report (V8/CDP doesn't always finish reporting a
// navigated-away script's per-function detail) -- e.g. saveConnSettings()
// shows as uncovered despite being exercised by the reload-persistence test,
// because the fill()+dispatchEvent('input') happens on the pre-reload script
// instance, whose coverage is best-effort. This is a tooling gap, not an app
// gap; it makes the number a slight underestimate, not an overestimate.
const floorArg = process.argv.find((a) => a.startsWith('--floor='));
const FLOOR = floorArg ? Number(floorArg.split('=')[1]) : 80;

if (!fs.existsSync(DIR)) {
  console.error('✖ No coverage-raw/ directory found — run `npx playwright test` first.');
  process.exit(1);
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error('✖ coverage-raw/ exists but has no coverage files.');
  process.exit(1);
}

// Merge covered byte-ranges per source url+text across every test's run.
// Playwright's page.coverage.stopJSCoverage() returns raw CDP coverage here
// -- {url, source, functions: [{ranges: [{startOffset, endOffset, count}]}]} --
// not the friendlier {url, text, ranges} shape some docs describe.
//
// V8's ranges are NESTED: the outer/top-level range always spans the whole
// script with count>=1 (the script ran), and inner ranges refine specific
// blocks/functions down to count=0 where that block never executed. Naively
// OR-ing every range's coverage (any range with count>0 marks its bytes
// covered) lets that outer whole-script range paper over real gaps -- e.g.
// an unused function shows its own range as count:0, but the enclosing
// count:1 range still "covers" those same byte positions. The correct read
// is the MOST SPECIFIC (smallest/innermost) range containing each byte, so
// ranges are applied largest-to-smallest and let smaller ones overwrite.
function applyEntryCoverage(entry, coveredOut) {
  const allRanges = entry.functions.flatMap((fn) => fn.ranges);
  allRanges.sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
  for (const range of allRanges) {
    const hit = range.count > 0;
    for (let i = range.startOffset; i < range.endOffset && i < coveredOut.length; i++) coveredOut[i] = hit;
  }
}

const merged = new Map(); // url -> { text, covered: boolean[] } -- union across all test runs

for (const file of files) {
  const entries = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  for (const entry of entries) {
    if (!entry.url.includes('index.html')) continue; // skip Playwright/browser-internal scripts
    // Per-test-run coverage, computed independently (innermost-range rule
    // applies within one run, not across runs with different call counts).
    const perRun = new Array(entry.source.length).fill(false);
    applyEntryCoverage(entry, perRun);

    if (!merged.has(entry.url)) {
      merged.set(entry.url, { text: entry.source, covered: new Array(entry.source.length).fill(false) });
    }
    const m = merged.get(entry.url);
    for (let i = 0; i < perRun.length; i++) {
      if (perRun[i]) m.covered[i] = true; // union: covered if ANY test run hit it
    }
  }
}

if (merged.size === 0) {
  console.error("✖ No coverage entries matched index.html's inline script — fixture or filter is broken.");
  process.exit(1);
}

let totalBytes = 0;
let coveredBytes = 0;
for (const { covered } of merged.values()) {
  totalBytes += covered.length;
  coveredBytes += covered.filter(Boolean).length;
}

const pct = (coveredBytes / totalBytes) * 100;
console.log(`JS execution coverage (E2E suite, ${files.length} tests): ${pct.toFixed(1)}% (${coveredBytes}/${totalBytes} bytes)`);

if (pct < FLOOR) {
  console.error(`✖ Below floor of ${FLOOR}%`);
  process.exit(1);
}
console.log(`✓ Meets floor of ${FLOOR}%`);

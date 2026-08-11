// Wraps the default `page` fixture to collect V8 JS coverage for every test
// and write it to disk, so scripts/check-coverage.mjs can merge it across the
// whole suite afterward. This is the coverage layer TESTING_HANDOFF.md calls
// for, adapted to this project's shape: no Vitest/unit layer exists (single
// HTML file, no bundler, no isolable pure functions), so this measures what
// actually executed during the E2E run instead -- a real, AST-independent
// number rather than a guess.
import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const COVERAGE_DIR = path.join(process.cwd(), 'coverage-raw');

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use(page);
    const coverage = await page.coverage.stopJSCoverage();
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
    const safeName = testInfo.title.replace(/[^a-z0-9]+/gi, '-');
    fs.writeFileSync(path.join(COVERAGE_DIR, `${safeName}.json`), JSON.stringify(coverage));
  },
});

export { expect };

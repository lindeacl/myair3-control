#!/usr/bin/env node
/**
 * Mechanical gate for this project's actual shape: static HTML files with
 * embedded <script> blocks, no bundler, no TS, no React. Standard tools
 * (tsc/eslint/madge) don't apply -- this is the equivalent check for what's
 * really here: does every <script> block actually parse, and are there any
 * duplicate element ids (a real bug class -- two elements sharing an id
 * silently breaks every getElementById-based lookup in the file).
 *
 * Usage: node scripts/check-html-js.mjs <file.html> [file2.html ...]
 * Exits non-zero on any syntax error or duplicate id.
 */
import fs from 'fs';
import vm from 'vm';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/check-html-js.mjs <file.html> [...]');
  process.exit(1);
}

let failed = false;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');

  const scriptBlocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  scriptBlocks.forEach((match, i) => {
    const code = match[1];
    try {
      new vm.Script(code, { filename: `${file}#script[${i}]` });
    } catch (err) {
      failed = true;
      console.error(`✖ ${file}: <script> block ${i} failed to parse:\n  ${err.message}`);
    }
  });

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const dupes = new Set();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  if (dupes.size > 0) {
    failed = true;
    console.error(`✖ ${file}: duplicate id(s) in static markup: ${[...dupes].join(', ')}`);
  }
}

if (failed) {
  process.exit(1);
}
console.log(`✓ ${files.length} file(s) OK — scripts parse, no duplicate static ids.`);

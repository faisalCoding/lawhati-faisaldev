#!/usr/bin/env node
// Renders the app's icons from assets/brand/logo-mark.svg.
//
// Only the images that actually carry the brand's background are written. The Android adaptive
// foreground, the monochrome layer, the splash mark and the notification icon are all a white
// shape on transparency — the system paints behind them, from app.json — so they are left alone
// and keep working whatever the colour becomes.

import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

const BRAND = process.argv[2] ?? '#0C66E4';
const SOURCE = 'assets/brand/logo-mark.svg';

const svg = fs.readFileSync(SOURCE, 'utf8');

/** The mark on a background of `colour`, with `radius` corner rounding. */
function artwork(colour, radius) {
  return svg.replace(/(<rect width="1024" height="1024")([^/]*?)(fill="#[0-9A-Fa-f]{6}")/, `$1 rx="${radius}" fill="${colour}"`);
}

// icon.png is square: every platform that shows it masks it to its own shape, and a radius
// baked in here would be visible inside theirs. favicon.png is not masked, so it keeps its own.
const targets = [
  { file: 'assets/icon.png', size: 1024, radius: 0 },
  { file: 'assets/favicon.png', size: 48, radius: 230 },
];

for (const { file, size, radius } of targets) {
  await sharp(Buffer.from(artwork(BRAND, radius)), { density: 400 })
    .resize(size, size)
    .png()
    .toFile(path.join(process.cwd(), file));

  console.log(`  ${file}  ${size}×${size}  ${BRAND}`);
}

console.log(`\nIcons rendered from ${SOURCE}. The transparent layers were not touched.`);

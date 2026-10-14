// Builds the web version into dist-web/ for https://faisaldev.site/lawhati/
// (deploy/deploy-web.sh publishes it). The address is set here, once, and filled into the page,
// its manifest and the page that hands over what browsers saved at the previous address.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const BASE_URL = process.env.WEB_BASE_URL ?? '/lawhati';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'https://faisaldev.site';
// Where the web version used to be; its boards are brought over on the first visit (public/migrate.html).
const PREVIOUS_ORIGIN = process.env.WEB_PREVIOUS_ORIGIN ?? 'https://faisaldev.site';
const OUT = 'dist-web';

fs.rmSync(OUT, { recursive: true, force: true });
// --clear: Metro caches files with the EXPO_PUBLIC_ values inlined, so without it a build could
// keep the addresses of an earlier build made with different ones.
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', OUT, '--clear'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    WEB_BASE_URL: BASE_URL,
    EXPO_PUBLIC_WEB_PREVIOUS_BRIDGE: `${PREVIOUS_ORIGIN}${BASE_URL}/migrate.html`,
  },
});
// sw.js is here too: it names the icon and the page to open, both under the base path.
for (const file of [`${OUT}/index.html`, `${OUT}/manifest.json`, `${OUT}/migrate.html`, `${OUT}/sw.js`]) {
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replaceAll('%BASE_URL%', BASE_URL).replaceAll('%WEB_ORIGIN%', WEB_ORIGIN));
}
console.log(`Web version ready in ${OUT}/ for ${WEB_ORIGIN}${BASE_URL}/`);

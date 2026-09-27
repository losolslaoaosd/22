import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist-site');
const files = [
  'index.html',
  'account/index.html', 'app/index.html', 'owner/index.html',
  'pages-config.js', 'app.js', 'blufin-ui.js',
  'styles.css', 'liquid.css', 'blufin-ui.css', 'theme.css', 'premium.css', 'ui-system.css',
  'favicon.svg', 'hero-bluefin.png', 'chart-candles.png',
  'icon-fast.png', 'icon-deep.png', 'icon-maximum.png',
  '03-Manrope-Bold.ttf', '04-Manrope-ExtraBold.ttf', '05-Manrope-ExtraLight.ttf',
  '06-Manrope-Medium.ttf', '07-Manrope-Regular.ttf', '08-Manrope-SemiBold.ttf',
];

await rm(output, { recursive: true, force: true });
for (const file of files) {
  const target = join(output, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, file), target);
}

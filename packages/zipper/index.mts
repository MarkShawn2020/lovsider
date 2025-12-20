import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { zipBundle } from './lib/index.js';
import { IS_FIREFOX } from '@extension/env';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', '..', '..', 'chrome-extension', 'package.json'), 'utf-8'));
const version = pkg.version;
const browser = IS_FIREFOX ? 'firefox' : 'chrome';
const ext = IS_FIREFOX ? 'xpi' : 'zip';

await zipBundle({
  distDirectory: resolve(import.meta.dirname, '..', '..', '..', 'dist'),
  buildDirectory: resolve(import.meta.dirname, '..', '..', '..', 'dist-zip'),
  archiveName: `${browser}-lovsider-v${version}.${ext}`,
});

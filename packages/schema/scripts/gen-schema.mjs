/**
 * Emit the published config schema (spec 087, T-211 / D-002).
 *
 * Committed and shipped rather than generated on demand: the CDN address
 * resolves precisely because the file is inside the published tarball. An
 * on-demand schema has no address, and without an address there is no editor
 * integration at all.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialiseSchema } from '../dist/config/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const { version } = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));

// The version comes from the manifest, so the $id can only ever name the
// version being released — a pinned address that 404s is worse than none.
const out = join(pkgRoot, 'dist', 'config.schema.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, serialiseSchema(version));
process.stdout.write(`wrote dist/config.schema.json (@${version})\n`);

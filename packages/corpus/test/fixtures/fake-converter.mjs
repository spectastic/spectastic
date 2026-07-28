#!/usr/bin/env node
/**
 * A fixture converter binary standing in for MarkItDown / Docling / Marker in tests
 * (065-corpus-pdf-convert, T-001). Real CLIs are never installed in CI, so this shim
 * emulates the three argv/output shapes the CONVERTERS registry spike grounded:
 *
 *  - MarkItDown-style: `fake-converter.mjs <file>` → canned markdown on stdout.
 *  - Docling-style:    `fake-converter.mjs <file> --to md --output <dir>` → writes
 *                      `<dir>/<stem>.md`.
 *  - Marker-style:     `fake-converter.mjs <file> <dir> --output_format markdown` →
 *                      writes `<dir>/<stem>/<stem>.md` (marker's own per-document
 *                      subfolder convention), so temp-dir cleanup has something real
 *                      nested to remove (T-902).
 *  - `--version`       → prints a fake version string, exits 0, does no conversion.
 *
 * A source file whose basename contains "bad" simulates a conversion failure: exits 1
 * with a message on stderr and writes nothing, for the missing/failing-converter tests.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const argv = process.argv.slice(2);

if (argv[0] === '--version') {
  process.stdout.write('fake-converter 1.2.3\n');
  process.exit(0);
}

const file = argv[0];
if (!file) {
  process.stderr.write('fake-converter: no input file\n');
  process.exit(1);
}

const stem = basename(file).replace(/\.[^.]+$/, '');
if (basename(file).includes('bad')) {
  process.stderr.write(`fake-converter: failed to convert ${file}\n`);
  process.exit(1);
}

// Fold the real source bytes into the canned output so tests can assert the shim
// actually read the file it was given, not just its name.
const sourceLen = readFileSync(file).length;
const markdown = `# Converted: ${stem}\n\nfrom ${basename(file)} (${sourceLen} bytes)\n`;

const outputFlagIdx = argv.indexOf('--output');
if (outputFlagIdx !== -1) {
  // Docling-style: <file> --to md --output <dir> → <dir>/<stem>.md
  const dir = argv[outputFlagIdx + 1];
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${stem}.md`), markdown, 'utf8');
  process.exit(0);
}

const formatFlagIdx = argv.indexOf('--output_format');
if (formatFlagIdx !== -1) {
  // Marker-style: <file> <dir> --output_format markdown → <dir>/<stem>/<stem>.md
  const dir = argv[1];
  const subDir = join(dir, stem);
  mkdirSync(subDir, { recursive: true });
  writeFileSync(join(subDir, `${stem}.md`), markdown, 'utf8');
  process.exit(0);
}

// MarkItDown-style: just the file → stdout.
process.stdout.write(markdown);
process.exit(0);

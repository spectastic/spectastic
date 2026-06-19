// One-time retrofit for 016-theme-support: insert the render-blocking
// theme-boot.js <head> hook into every artifact, so the saved theme + mode
// apply before first paint (NFR-001). Idempotent and depth-aware — the relative
// prefix is copied from each file's existing assets/spec.css link, so it is
// correct at any directory depth. Re-runnable; skips files already retrofitted.
import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATTERNS = [
  'templates/*.html',
  'index.html', 'inbox.html', 'plan.html', 'principles.html',
  'specs/**/spec.html', 'specs/**/plan.html',
  'specs/**/tasks.html', 'specs/**/proposal.html',
];
const LINK_RE = /([ \t]*)<link rel="stylesheet" href="([^"]*?)assets\/spec\.css">/;

const files = [...new Set(PATTERNS.flatMap((p) => globSync(p, { cwd: ROOT })))].sort();
let changed = 0, skipped = 0, missing = 0;
for (const rel of files) {
  const abs = join(ROOT, rel);
  const src = readFileSync(abs, 'utf8');
  if (src.includes('assets/theme-boot.js')) { skipped++; continue; }
  const m = src.match(LINK_RE);
  if (!m) { console.warn('  no spec.css link:', rel); missing++; continue; }
  const [line, indent, prefix] = m;
  const boot = `\n${indent}<script src="${prefix}assets/theme-boot.js"></script>`;
  writeFileSync(abs, src.replace(line, line + boot));
  changed++;
}
console.log(`retrofit: ${changed} changed · ${skipped} already had it · ${missing} missing link · ${files.length} total`);

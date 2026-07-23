/**
 * Ignore-entry data for spec 043-init-project-config.
 *
 * BASE_ENTRIES are spectastic's own ephemeral outputs — known without the stack,
 * written at init (D-003). They deliberately do NOT include `.spectastic/`
 * wholesale, so the tracked profile marker (`.spectastic/profile.json`, 041)
 * stays committable. ECOSYSTEM_IGNORES maps a detected ecosystem (042's
 * `ecosystem` values) to its build-artifact ignores, appended by
 * `spectastic gitignore --stack` (D-004). Both are data.
 */

/** Spectastic's ephemeral outputs to ignore at init (not the tracked marker). */
export const BASE_ENTRIES: readonly string[] = [
  '.spectastic/courses/',
  // 022-explore FR-004 / D-002: the rich `explore.html` ledger is ephemeral (like a
  // course), so it is git-ignored and never ships. The tracked `quarantine.json`
  // marker — the anti-ship guard — is deliberately NOT ignored, so it stays visible
  // to teammates + CI. Without this entry a consumer's ledger commits by accident,
  // contradicting the "git-ignored ledger" the scaffold promises.
  'explorations/**/explore.html',
];

/** ecosystem → build-artifact ignore entries. Keys match init/detect.ts SIGNALS[].ecosystem. */
export const ECOSYSTEM_IGNORES: Readonly<Record<string, readonly string[]>> = {
  python: ['__pycache__/', '.venv/', '.pytest_cache/', '.mypy_cache/', '*.pyc'],
  js: ['node_modules/', 'dist/', 'coverage/'],
  java: ['build/', 'target/', '*.class'],
  go: ['bin/'],
  rust: ['target/'],
  swift: ['.build/'],
  cpp: ['build/', '*.o'],
};

/** The union of ignore entries for a set of detected ecosystems (stable, deduped). */
export function stackEntries(ecosystems: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const eco of ecosystems) {
    for (const entry of ECOSYSTEM_IGNORES[eco] ?? []) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      out.push(entry);
    }
  }
  return out;
}

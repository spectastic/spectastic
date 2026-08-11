import type { Command } from 'commander';

/**
 * Register the `tests:for` subcommand (spec 084-verify-test-tags, FR-005).
 *
 * Reports which tests carry a spec's tag, the citation derived from them, and
 * how much of the suite is tagged at all. The last of those is not a nicety:
 * a citation derived from three of twenty tests looks exactly as authoritative
 * as one derived from all twenty, so partiality travels with the answer.
 *
 * Read-only, offline, and it never executes a test — the reader parses source,
 * so this still works on a suite that is currently red, which is when
 * traceability is most wanted (NFR-002).
 *
 * Thin by convention (P-14): the grammar, the reader and the resolver all live
 * in `@spectastic/core/testtags/*`; this parses arguments and formats.
 */
export function registerTestTags(program: Command): void {
  program
    .command('tests:for')
    .description(
      'Show which tests are tagged for a spec, and the citation derived from them. Reports how much of the suite is tagged, so a partial answer cannot read as a complete one. Never runs a test.',
    )
    .argument('<spec>', 'the spec to report on, by number or directory name')
    .argument('[path]', 'project root to scan', '.')
    .action(async (spec: string, path: string) => {
      const [{ readTags }, { deriveCitation }, { selectorFor }] = await Promise.all([
        import('@spectastic/core/testtags/read'),
        import('@spectastic/core/testtags/resolve'),
        import('@spectastic/core/testtags/grammar'),
      ]);
      const { readdirSync, readFileSync, existsSync } = await import('node:fs');
      const { join } = await import('node:path');

      const specNum = /^(\d{3,})/.exec(spec)?.[1];
      if (specNum === undefined) {
        process.stderr.write(`tests:for: "${spec}" does not start with a spec number.\n`);
        process.exit(1);
      }

      // Walk for test files. Kept here rather than in core so the kernel stays
      // free of filesystem access — the reader takes contents, not paths.
      const files: { file: string; content: string }[] = [];
      const skip = new Set(['node_modules', 'dist', '.git', 'coverage']);
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          if (skip.has(e.name)) continue;
          const full = join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name)) {
            files.push({ file: full, content: readFileSync(full, 'utf8') });
          }
        }
      };
      walk(path);

      // The estate's facts: which specs exist, and what ids this one defines.
      const specsDir = join(path, 'specs');
      const allSpecs = existsSync(specsDir)
        ? readdirSync(specsDir)
            .map((d) => /^(\d{3,})/.exec(d)?.[1])
            .filter((n): n is string => n !== undefined)
        : [];
      const specDir = existsSync(specsDir) ? readdirSync(specsDir).find((d) => d.startsWith(specNum)) : undefined;
      const specHtml =
        specDir !== undefined && existsSync(join(specsDir, specDir, 'spec.html'))
          ? readFileSync(join(specsDir, specDir, 'spec.html'), 'utf8')
          : '';
      const tasksHtml =
        specDir !== undefined && existsSync(join(specsDir, specDir, 'tasks.html'))
          ? readFileSync(join(specsDir, specDir, 'tasks.html'), 'utf8')
          : '';
      const ids = [
        ...new Set([
          ...[...specHtml.matchAll(/id="((?:FR|NFR|SC)-\d+)"/g)].map((m) => m[1] ?? ''),
          ...[...tasksHtml.matchAll(/id="(T-\d+)"/g)].map((m) => m[1] ?? ''),
        ]),
      ].filter((x) => x !== '');

      const read = readTags(files);
      const d = deriveCitation(read, { spec: specNum, ids }, allSpecs);
      const write = (line: string): void => void process.stdout.write(`${line}\n`);

      write(`selector: ${selectorFor(specNum)}   (${d.taggedTests} tagged test(s) of ${d.totalTests} seen)`);
      write(`derived testsCite: ${d.ids.length > 0 ? d.ids.join(' ') : '(none — no tagged test names an id)'}`);
      if (d.partial) {
        write(
          `  note: ${read.totalTests - read.tagged.length} of ${read.totalTests} tests carry no tag at all, so this is a partial picture, not a coverage report.`,
        );
      }
      for (const f of d.findings) write(`  ⚠ ${f.message}  (${f.file})`);
      process.exit(0);
    });
}

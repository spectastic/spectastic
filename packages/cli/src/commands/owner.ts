import type { Command } from 'commander';

/**
 * Register the `owner` subcommand (spec 082-placement-verdict, FR-011).
 *
 * Asks which unit should own a requirement, and prints the case rather than an
 * answer: each ranked candidate with its evidence classes, the confidence band,
 * any hedge, and any conflict between signals.
 *
 * Named `owner` because the command and the verdict share a vocabulary — the
 * engine's own terminal state is "no confident owner", and asking who owns
 * something invites "nobody confidently" in a way that `place` or `route` do
 * not. Those words presuppose the action succeeds; this one does not.
 *
 * Read-only and offline. It never places anything, and never creates anything
 * (FR-006/FR-007) — a verdict is advice a person confirms.
 */
export function registerOwner(program: Command): void {
  program
    .command('owner')
    .description(
      'Ask which unit should own a requirement. Prints a ranked case with its evidence, not a decision — and may answer that no owner is clear. Read-only.',
    )
    .argument('<requirement>', 'the requirement to find an owner for, in prose')
    .argument('[path]', 'project root to inspect', '.')
    .action(async (requirement: string, path: string) => {
      const [
        { rankPlacement },
        { gatherEvidence },
        { enumerateJsUnits },
        { detectBoundaryMap },
        { inferEdgesFromUnits, resolveEdges },
        { readDeclaredEdges, selfUnitCoordinate },
        { resourceUri },
      ] = await Promise.all([
        import('@spectastic/core/units/placement'),
        import('@spectastic/core/units/adapters/placement-evidence'),
        import('@spectastic/core/units/adapters/js'),
        import('@spectastic/core/units/adapters/boundary'),
        import('@spectastic/core/units/resolve'),
        import('@spectastic/core/units/read'),
        import('@spectastic/schema/project'),
      ]);

      const self = selfUnitCoordinate(path);
      if (self === null) {
        process.stderr.write(
          'owner: this project has no configured identity, so its units cannot be named. Set "project" in spectastic.json.\n',
        );
        process.exit(1);
      }
      const project = self.replace(/^spectastic:\/\//, '').split('/unit/')[0] ?? '';

      const workspace = enumerateJsUnits(path);
      const resolved = resolveEdges({
        self,
        declared: readDeclaredEdges(path),
        units: workspace,
        farEnd: () => 'silent',
        inferred: inferEdgesFromUnits(project, workspace),
      });

      // Domain text is each unit's own manifest description — `gatherEvidence`
      // takes textByUnit as an input precisely so the caller chooses the source.
      // The name and directory alone are too thin to discriminate: with only
      // those, every requirement abstained. A richer source — a unit's specs and
      // corpus documents — needs a per-unit artifact mapping this estate does
      // not have, which is stated rather than implied.
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const textByUnit: Record<string, string> = {};
      for (const unit of workspace) {
        let description = '';
        try {
          const pkg: unknown = JSON.parse(readFileSync(join(path, unit.dir, 'package.json'), 'utf8'));
          const value = (pkg as { description?: unknown }).description;
          if (typeof value === 'string') description = value;
        } catch {
          // No manifest or unreadable — the unit simply contributes less text.
        }
        textByUnit[resourceUri(project, 'unit', unit.name)] = `${unit.name} ${unit.dir} ${description}`;
      }

      const verdict = rankPlacement(
        gatherEvidence({
          requirement,
          units: workspace.map((u) => resourceUri(project, 'unit', u.name)),
          edges: resolved.edges,
          boundary: detectBoundaryMap(path),
          textByUnit,
        }),
      );

      const short = (c: string): string => c.replace(`spectastic://${project}/unit/`, '');
      const write = (line: string): void => void process.stdout.write(`${line}\n`);

      write(`owner: ${verdict.kind}  (${verdict.mode})`);

      if (verdict.kind === 'propose-new-unit') {
        for (const r of verdict.reasons) write(`  ${r}`);
        write('  Nothing was created — this is a proposal for a person to act on.');
        process.exit(0);
      }

      if (verdict.kind === 'no-confident-owner') {
        for (const r of verdict.reasons) write(`  ${r}`);
        // Abstention is not silence: show what was considered, so a reader can
        // see the engine looked rather than failed.
        for (const c of verdict.ranked.filter((r) => r.score > 0).slice(0, 5)) {
          write(`  ${c.score.toFixed(1).padStart(6)}  ${short(c.unit).padEnd(24)} ${c.classes.join(', ')}`);
        }
        process.exit(0);
      }

      write(`  confidence: ${verdict.confidence}${verdict.hedged ? '  [hedged — needs a human]' : ''}`);
      for (const c of verdict.ranked.filter((r) => r.score > 0).slice(0, 5)) {
        write(`  ${c.score.toFixed(1).padStart(6)}  ${short(c.unit).padEnd(24)} ${c.classes.join(', ')}`);
      }
      for (const conflict of verdict.conflicts) {
        write(`  ⚠ ${conflict.replaceAll(`spectastic://${project}/unit/`, '')}`);
      }
      write('  A ranked case, not a decision — confirm before acting on it.');
      process.exit(0);
    });
}

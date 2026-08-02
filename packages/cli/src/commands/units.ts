import type { Command } from 'commander';

/**
 * Register the `units` subcommand (spec 079-unit-dependency-edge, FR-010).
 *
 * Prints the resolved dependency edges for this project — what it declares,
 * what its manifests imply, and how far each has been checked. Read-only and
 * offline by construction: it reads this checkout and, where a declared edge
 * names a project sitting beside it, that checkout too. It never fetches.
 *
 * Thin by convention (P-14): resolution, inference and the marks all live in
 * `@spectastic/core/units/*`; this parses arguments and formats.
 */
export function registerUnits(program: Command): void {
  program
    .command('units:add')
    .description(
      'Declare that this project depends on another unit. Idempotent — re-running with the same target changes nothing.',
    )
    .argument('<coordinate>', 'the unit this project depends on')
    .argument('[path]', 'project root to edit', '.')
    .action(async (coordinate: string, path: string) => {
      const [{ writeDeclaredEdge }, { selfUnitCoordinate }] = await Promise.all([
        import('@spectastic/core/units/write'),
        import('@spectastic/core/units/read'),
      ]);

      const self = selfUnitCoordinate(path);
      if (self === null) {
        process.stderr.write(
          'units:add: this project has no configured identity, so its own coordinate cannot be composed. Set "project" in spectastic.json.\n',
        );
        process.exit(1);
      }

      const result = writeDeclaredEdge(path, self, coordinate);
      if (!result.ok) {
        process.stderr.write(`units:add: ${result.reason}\n`);
        process.exit(1);
      }
      process.stdout.write(
        result.written
          ? `units:add: declared ${self} → ${coordinate}\n`
          : `units:add: already declared — nothing to do\n`,
      );
      process.exit(0);
    });

  program
    .command('units')
    .description(
      "Print this project's dependency edges — what it is built on, and how far each relationship has been checked. Reads local checkouts only; never fetches.",
    )
    .argument('[path]', 'project root to inspect', '.')
    .action(async (path: string) => {
      const [
        { resolveEdges, inferEdgesFromUnits },
        { readDeclaredEdges, selfUnitCoordinate },
        { nodeFsWorkspacePort },
      ] = await Promise.all([
        import('@spectastic/core/units/resolve'),
        import('@spectastic/core/units/read'),
        import('@spectastic/core/units/adapters/node-fs'),
      ]);

      const cwd = path;
      const self = selfUnitCoordinate(cwd);
      if (self === null) {
        process.stdout.write(
          'units: this project has no configured identity, so its own coordinate cannot be composed. Set "project" in spectastic.json.\n',
        );
        process.exit(0);
      }

      const port = nodeFsWorkspacePort(cwd);
      const units = port.units();
      const project = self.replace(/^spectastic:\/\//, '').split('/unit/')[0] ?? '';

      const result = resolveEdges({
        self,
        declared: readDeclaredEdges(cwd),
        units,
        farEnd: (target, depending) => port.farEnd(target, depending),
        inferred: inferEdgesFromUnits(project, units),
      });

      process.stdout.write(`units: ${units.length} in this workspace\n`);
      if (result.edges.length === 0) {
        process.stdout.write('  (no dependency edges declared or inferred)\n');
      }
      for (const edge of result.edges) {
        // Every edge states its verification, so none prints with that unstated
        // (SC-001). "checked" means the far end was read; "agrees" means it
        // named this unit back.
        const mark = !edge.marks.verified ? 'unverified' : edge.marks.reciprocated ? 'agrees' : 'checked';
        process.stdout.write(`  ${edge.origin.padEnd(8)} ${mark.padEnd(10)} ${edge.from} → ${edge.to}\n`);
      }
      for (const d of result.dangling) {
        process.stdout.write(`  ✗ dangling  ${d.ref} — declared, but names no unit in this project\n`);
      }
      for (const f of result.findings) {
        process.stdout.write(`  ⚠ ignored   ${f.entry} — ${f.reason}\n`);
      }
      process.exit(0);
    });
}

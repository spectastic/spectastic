import type { Command } from 'commander';

/**
 * Register the `visual` subcommand (spec 099-visual-embedded-view, FR-003).
 *
 * A registrar and nothing else: it parses arguments, calls the kernel, writes
 * what comes back and exits. Every deterministic decision lives in
 * `@spectastic/core/visual/materialise-view`.
 *
 * It exists because the obligation has to be enforceable. The kernel design
 * verb and the slash-command authoring path both need to materialise a view,
 * and the slash command deliberately does not run the kernel verb — so a
 * shared function alone would leave one path uncovered, which is precisely how
 * the embedded contract view came to have never rendered on the path designs
 * are actually written. One command both paths call, so a third inherits it.
 *
 * It materialises BOTH kinds of view for that reason. Scoping it to the visual
 * one would leave the contract view exactly as broken as it was and require a
 * second command with the same shape — which is the duplication the shared
 * entry point exists to avoid.
 */
export function registerVisual(program: Command): void {
  program
    .command('materialise')
    .description(
      'Materialise a design\'s embedded views — the declared contract and the declared screens, derived and written into the design that declares them. Idempotent; run it again after changing either.',
    )
    .argument('<spec-id>', 'the spec whose design should be materialised, e.g. 001-auth-service')
    .option('--check', 'report whether the view is stale instead of writing it')
    .action(async (specId: string, opts: { check?: boolean }) => {
      const [{ materialiseVisualViews }, { materialiseContractViews }, { visualViewDriftFindings }, { nodeFs }] =
        await Promise.all([
          import('@spectastic/core/visual/materialise-view'),
          import('@spectastic/core/contracts/materialise-view'),
          import('@spectastic/core/commands/validate'),
          import('@spectastic/core/providers/node-fs'),
        ]);

      const cwd = process.cwd();
      const path = `${cwd}/specs/${specId}/design.html`;

      let html: string;
      try {
        html = await nodeFs.readFile(path);
      } catch {
        process.stderr.write(`No design at specs/${specId}/design.html\n`);
        process.exit(1);
        return;
      }

      if (opts.check === true) {
        const findings = await visualViewDriftFindings(html, `specs/${specId}/design.html`, nodeFs, cwd);
        if (findings.length === 0) {
          process.stdout.write('view is current\n');
          process.exit(0);
        }
        for (const f of findings) process.stderr.write(`${f.message}\n`);
        process.exit(1);
        return;
      }

      // BOTH views, because the gap this command exists to close is not
      // specific to the visual one — the contract view has the identical hole
      // (072/T-001) and closing it here is what makes the entry point shared
      // rather than a second one-off beside the first.
      const out = await materialiseVisualViews(await materialiseContractViews(html, nodeFs, cwd), nodeFs, cwd);
      if (out === html) {
        process.stdout.write('view is current — nothing written\n');
        process.exit(0);
      }
      await nodeFs.writeFile(path, out);
      process.stdout.write(`materialised the visual view into specs/${specId}/design.html\n`);
      process.exit(0);
    });
}

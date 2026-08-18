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
      const out = await materialiseVisualViews(
        await materialiseContractViews(html, nodeFs, cwd, undefined, specId),
        nodeFs,
        cwd,
      );
      if (out === html) {
        process.stdout.write('view is current — nothing written\n');
        process.exit(0);
      }
      await nodeFs.writeFile(path, out);
      process.stdout.write(`materialised the visual view into specs/${specId}/design.html\n`);
      process.exit(0);
    });

  program
    .command('visual:import')
    .description(
      'Import a design export already on disk — lands its material into the visual sidecar, once, and never reads it again. A token set the export declares lands as a declared source and is never presented for confirmation; values it does not cover are offered as candidates. Nothing is written to the project\'s own token set. No network, no account, no design-tool licence.',
    )
    .requiredOption('--from <path>', 'the export, inside this project — a folder, or a .zip which is expanded for you')
    .requiredOption('--into <dir>', 'where landed material goes — the visual sidecar')
    .requiredOption('--identity <id>', 'the stable anchor a later re-import keys on')
    .option('--previous-identity <id>', 'the identity a previous import landed under, if any')
    .option('--origin <name>', 'which tool the export came from — recorded as provenance, never guessed')
    .option('--origin-url <url>', 'where it came from, for a reader to follow — recorded, never fetched')
    .action(
      async (opts: {
        from: string;
        into: string;
        identity: string;
        previousIdentity?: string;
        origin?: string;
        originUrl?: string;
      }) => {
      const [
        { importDesignSource, ImportIdentityError },
        { localSourceFetcher, SourceNotFoundError, SourceOutsideProjectError },
        { archiveSourceFetcher, looksLikeArchive, ArchiveUnreadableError, ArchiveEntryOutsideError },
        { nodeFs },
      ] = await Promise.all([
        import('@spectastic/core/visual/import'),
        import('@spectastic/core/providers/local-source-fetcher'),
        import('@spectastic/core/providers/archive-source-fetcher'),
        import('@spectastic/core/providers/node-fs'),
      ]);

      // An archive and a folder are the same thing to everything downstream —
      // the fetcher seam returns a directory either way, which is what lets one
      // adapter serve every source instead of one per tool.
      const fetcher = looksLikeArchive(opts.from)
        ? archiveSourceFetcher(process.cwd())
        : localSourceFetcher(nodeFs, process.cwd());

      try {
        const ledger = await importDesignSource(
          {
            from: opts.from,
            into: opts.into,
            identity: opts.identity,
            previousIdentity: opts.previousIdentity,
            origin: opts.origin,
            originUrl: opts.originUrl,
          },
          fetcher,
          nodeFs,
        );
        // A four-bucket ledger rather than a log — the corpus prints the same
        // shape, and it is what makes a re-import reviewable at a glance.
        process.stdout.write(
          `written ${ledger.written.length} · skipped ${ledger.skipped.length} · replaced ${ledger.replaced.length} · orphaned ${ledger.orphaned.length}\n`,
        );
        for (const name of ledger.orphaned) {
          process.stdout.write(`  orphaned: ${name} — present here, absent from the export. Not removed.\n`);
        }
        // Reported at the command line rather than only in the manifest. A file
        // that did not land is the one thing a caller must not discover later.
        for (const name of ledger.unhandled) {
          process.stdout.write(
            `  not landed: ${name} — it carries a runtime, and landing it would leave this project failing its own artifact rules.\n`,
          );
        }
        for (const { name, reason } of ledger.refused) {
          process.stdout.write(`  refused: ${name} — ${reason}\n`);
        }
        if (ledger.tokenCandidates.length > 0) {
          process.stdout.write(
            `${ledger.tokenCandidates.length} token candidate(s) derived and left unconfirmed — none is in the token set.\n`,
          );
        }
        if (ledger.written.length > 0 || ledger.replaced.length > 0) {
          process.stdout.write('Newly landed material is not yet reviewed — read it before relying on it.\n');
        }
        process.exit(0);
      } catch (err) {
        if (
          err instanceof ImportIdentityError ||
          err instanceof SourceNotFoundError ||
          err instanceof SourceOutsideProjectError ||
          err instanceof ArchiveUnreadableError ||
          err instanceof ArchiveEntryOutsideError
        ) {
          process.stderr.write(`${err.message}\n`);
          process.exit(1);
        }
        throw err;
      }
      },
    );
}

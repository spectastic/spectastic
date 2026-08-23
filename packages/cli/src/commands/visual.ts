import { resolve } from 'node:path';
import type { Command } from 'commander';
import type { FileSystem } from '@spectastic/core';
import type { BriefScreen } from '@spectastic/core/visual/brief-read';
import type { ImportLedger } from '@spectastic/core/visual/import';

/** Input shared by the `visual:import` subcommand and any other caller of the
 *  kernel below — the one-step orchestrator (110-visual-one-step) being the
 *  first, per 106 FR-004: a caller MAY invoke this, never acquire a port of
 *  its own to do the equivalent work. */
export interface ImportVisualExportInput {
  from: string;
  into: string;
  identity: string;
  previousIdentity?: string | undefined;
  origin?: string | undefined;
  originUrl?: string | undefined;
}

/**
 * `visual:import`'s action body, extracted (110-visual-one-step T-010) so it
 * is callable without going through commander or `process.exit`. No
 * behaviour change from what the action did inline — same fetcher-choice
 * logic, same `importDesignSource` call, same thrown error types
 * (`ImportIdentityError`, `SourceNotFoundError`, …). The subcommand below
 * calls this and formats/exits; a future caller (the orchestrator) calls
 * this and inspects the ledger or catches the same errors itself.
 */
export async function importVisualExport(
  input: ImportVisualExportInput,
  ctx: { cwd: string; fs: FileSystem },
): Promise<ImportLedger> {
  const [{ importDesignSource }, { localSourceFetcher }, { archiveSourceFetcher, looksLikeArchive }] =
    await Promise.all([
      import('@spectastic/core/visual/import'),
      import('@spectastic/core/providers/local-source-fetcher'),
      import('@spectastic/core/providers/archive-source-fetcher'),
    ]);

  // An archive and a folder are the same thing to everything downstream —
  // the fetcher seam returns a directory either way, which is what lets one
  // adapter serve every source instead of one per tool.
  const fetcher = looksLikeArchive(input.from) ? archiveSourceFetcher(ctx.cwd) : localSourceFetcher(ctx.fs, ctx.cwd);

  return importDesignSource(
    {
      from: input.from,
      into: input.into,
      identity: input.identity,
      previousIdentity: input.previousIdentity,
      origin: input.origin,
      originUrl: input.originUrl,
    },
    fetcher,
    ctx.fs,
  );
}

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
      "Materialise a design's embedded views — the declared contract and the declared screens, derived and written into the design that declares them. Idempotent; run it again after changing either.",
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
      "Import a design export already on disk — lands its material into the visual sidecar, once, and never reads it again. A token set the export declares lands as a declared source and is never presented for confirmation; values it does not cover are offered as candidates. Nothing is written to the project's own token set. No network, no account, no design-tool licence.",
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
          { ImportIdentityError },
          { SourceNotFoundError, SourceOutsideProjectError },
          { ArchiveUnreadableError, ArchiveEntryOutsideError },
          { nodeFs },
        ] = await Promise.all([
          import('@spectastic/core/visual/import'),
          import('@spectastic/core/providers/local-source-fetcher'),
          import('@spectastic/core/providers/archive-source-fetcher'),
          import('@spectastic/core/providers/node-fs'),
        ]);

        try {
          const ledger = await importVisualExport(opts, { cwd: process.cwd(), fs: nodeFs });
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

  program
    .command('visual:render')
    .description(
      "Render a design export's own artboards into the owning spec's visual/renders — one browser session, one capture per labelled artboard, its own bounds rather than the page. Refuses outright (nothing written) if the runtime's CDN is unreachable; refuses per-artboard (the rest of the run still lands) if a label still carries unexpanded template syntax or collides with one already written this run. Never compares a capture against anything.",
    )
    .argument('<spec-id>', 'the spec whose visual/renders receives the captures, e.g. 001-auth-service')
    .requiredOption('--from <location>', 'the design export to render — a local file path or a URL')
    .action(async (specId: string, opts: { from: string }) => {
      // @spectastic/render is constructed HERE and nowhere else (FR-004,
      // NFR-002) — it is the one place in the CLI that reaches the browser
      // port; every other command stays deterministic.
      const [{ renderDesign }, { conventionalVisualPrefix }, { nodeFs }, { playwrightRenderer }] = await Promise.all([
        import('@spectastic/core/visual/render-capture'),
        import('@spectastic/core/visual/location'),
        import('@spectastic/core/providers/node-fs'),
        import('@spectastic/render'),
      ]);

      const cwd = process.cwd();
      const prefix = conventionalVisualPrefix('screens', specId);
      if (prefix === null) {
        process.stderr.write(
          `"${specId}" is not a conventional spec id — expected specs/${specId}/visual to resolve.\n`,
        );
        process.exit(1);
        return;
      }
      const destDir = `${prefix}/renders`;
      // A bare filesystem path (the common case — an export already landed
      // via visual:import, or a fixture checked into the project) needs a
      // scheme before a browser will navigate to it; a URL is passed through
      // unchanged.
      const location = /^[a-z][a-z0-9+.-]*:\/\//i.test(opts.from) ? opts.from : `file://${resolve(cwd, opts.from)}`;

      try {
        const result = await renderDesign({ location, destDir }, { cwd, fs: nodeFs, render: playwrightRenderer() });
        for (const w of result.written) {
          process.stdout.write(`captured ${w.label} → ${w.path}\n`);
          for (const err of w.consoleErrors) {
            process.stdout.write(`  console error: ${err}\n`);
          }
        }
        for (const r of result.refused) {
          process.stdout.write(`refused: ${r.label} — ${r.reason}\n`);
        }
        process.stdout.write(`${result.written.length} written, ${result.refused.length} refused\n`);

        // Reconciliation (107 FR-004, design D-006): compared against WRITTEN
        // labels only, not refused ones — a template-refused label is noise
        // (106's own spike is why), and folding in collision-refused labels
        // would need distinguishing refusal reasons by string-matching for a
        // rare double-edge case. Orchestrated here rather than inside
        // renderDesign, per P-14's split (pure functions in core, the CLI
        // composes) — reuses the same reader the brief itself is built from,
        // so there is one notion of "declared", not two.
        const { readBriefModel } = await import('@spectastic/core/visual/brief-read');
        const { undeclaredStates } = await import('@spectastic/core/visual/state-reconcile');
        try {
          const designHtml = await nodeFs.readFile(`${cwd}/specs/${specId}/design.html`);
          const model = await readBriefModel(designHtml, nodeFs, cwd);
          const declaredIds = model.screens.flatMap((s: BriefScreen) => s.states.map((st) => st.id));
          const undeclared = undeclaredStates(
            declaredIds,
            result.written.map((w) => w.label),
          );
          for (const label of undeclared) {
            process.stdout.write(
              `undeclared: ${label} — not in ${specId}'s declared states; attributed to the design, not adopted\n`,
            );
          }
        } catch {
          // No design at that spec id, or it declares no screens — nothing to
          // reconcile against. Not a render failure.
        }

        process.exit(0);
      } catch (err) {
        process.stderr.write(`${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  program
    .command('visual:brief')
    .description(
      "Generate a design brief from what a feature already declares — its states, refusals, annotations and addressed contexts, in the specification's own words. States the exact label each artboard must carry, and the convention for labelling a state your design finds that the feature does not declare. Written once to a dated file and never rewritten; a same-day re-run is refused. No network, no design-tool account.",
    )
    .argument('<spec-id>', 'the spec whose declarations the brief is generated from, e.g. 001-auth-service')
    .action(async (specId: string) => {
      const [{ readBriefModel }, { renderBrief }, { writeBrief }, { nodeFs }] = await Promise.all([
        import('@spectastic/core/visual/brief-read'),
        import('@spectastic/core/visual/brief-render'),
        import('@spectastic/core/visual/brief-write'),
        import('@spectastic/core/providers/node-fs'),
      ]);

      const cwd = process.cwd();
      // The only clock in this pipeline (D-003) — read-render-write below is
      // pure once the date is fixed, which is what makes two runs on the
      // same day byte-identical apart from this one value.
      const date = new Date().toISOString().slice(0, 10);

      try {
        const designHtml = await nodeFs.readFile(`${cwd}/specs/${specId}/design.html`);
        const model = await readBriefModel(designHtml, nodeFs, cwd);
        const content = renderBrief(model, date);
        const result = await writeBrief({ specId, date, content }, nodeFs, cwd);
        process.stdout.write(`wrote ${result.path}\n`);
        process.exit(0);
      } catch (err) {
        process.stderr.write(`${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

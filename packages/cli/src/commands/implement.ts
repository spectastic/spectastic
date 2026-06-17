import type { Command } from 'commander';

export function registerImplement(program: Command): void {
  program
    .command('implement')
    .description('Drive one task (T-NNN) or inbox just-do card (I-NNN).')
    .argument('<target>', 'T-NNN, I-NNN, or spec-id')
    .option('--all', 'drain mode (DEFERRED to TBD-core-implement-drain)')
    .option('--phase <id>', 'phase drain (DEFERRED)')
    .option('--parallel', 'parallel drain (DEFERRED)')
    .action(
      async (
        target: string,
        opts: { all?: boolean; phase?: string; parallel?: boolean },
      ) => {
        if (opts.all || opts.phase || opts.parallel) {
          process.stderr.write(
            'Drain modes (--all / --phase / --parallel) are deferred to TBD-core-implement-drain. Single-task only in v0.1.\n',
          );
          process.exit(2);
        }

        const [{ implementCommand }, fs, path] = await Promise.all([
          import('@spectastic/core/commands/implement'),
          import('node:fs/promises'),
          import('node:path'),
        ]);

        // Resolve target → file. T-NNN needs a spec ID context; simplest: scan
        // most-recent tasks.html. For I-NNN, read inbox.html at project root.
        let tasksHtml: string | undefined;
        let inboxHtml: string | undefined;
        let specHtml: string | undefined;
        let targetFile: string;
        if (/^I-\d+$/.test(target)) {
          targetFile = path.resolve(process.cwd(), 'inbox.html');
          inboxHtml = await fs.readFile(targetFile, 'utf8');
        } else if (/^T-\d+$/.test(target)) {
          // Find the tasks.html that contains this T-NNN.
          const { glob } = await import('tinyglobby');
          const candidates = await glob(['specs/**/tasks.html'], { cwd: process.cwd() });
          let found: string | null = null;
          for (const candidate of candidates) {
            const content = await fs.readFile(path.resolve(process.cwd(), candidate), 'utf8');
            if (content.includes(`id="${target}"`)) {
              found = candidate;
              tasksHtml = content;
              const specPath = path.resolve(process.cwd(), path.dirname(candidate), 'spec.html');
              try { specHtml = await fs.readFile(specPath, 'utf8'); } catch { /* optional */ }
              break;
            }
          }
          if (!found || !tasksHtml) {
            process.stderr.write(`implement: task ${target} not found in any specs/**/tasks.html\n`);
            process.exit(2);
          }
          targetFile = path.resolve(process.cwd(), found);
        } else {
          process.stderr.write(`implement: target "${target}" not recognised (expected T-NNN or I-NNN)\n`);
          process.exit(2);
        }

        const result = await implementCommand(
          {
            target,
            ...(tasksHtml ? { tasksHtml } : {}),
            ...(inboxHtml ? { inboxHtml } : {}),
            ...(specHtml ? { specHtml } : {}),
          },
          { cwd: process.cwd() },
        );

        // Apply the tick to the file.
        if (tasksHtml && targetFile) {
          const escId = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(`(<spec-task\\s+id=["']${escId}["'][^>]*>\\s*<input\\s+type=["']checkbox["'])(?!\\s+checked)`);
          const updated = tasksHtml.replace(re, '$1 checked');
          await fs.writeFile(targetFile, updated, 'utf8');
        } else if (inboxHtml && targetFile) {
          const escId = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(`(<spec-triage\\s+id=["']${escId}["'])(?![^>]*\\bdata-status=)`);
          const updated = inboxHtml.replace(re, '$1 data-status="done"');
          await fs.writeFile(targetFile, updated, 'utf8');
        }

        process.stdout.write(
          `Ticked ${result.ticked.id} in ${result.ticked.file} (${result.remainingUnchecked} unchecked remaining)${result.flipPromptFired ? ' — bundled flip prompt fires.' : ''}.\n`,
        );
        process.exit(0);
      },
    );
}

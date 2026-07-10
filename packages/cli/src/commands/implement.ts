import type { Command } from 'commander';

export function registerImplement(program: Command): void {
  program
    .command('implement')
    .description('Drive one task (T-NNN) or inbox just-do card (I-NNN).')
    .argument('<target>', 'T-NNN, I-NNN, or spec-id')
    .option('--drain', 'drain all unchecked tasks in <spec-id> via the coding-agent runtime (038)')
    .option('--all', 'drain mode (DEFERRED to TBD-core-implement-drain)')
    .option('--phase <id>', 'phase drain (DEFERRED)')
    .option('--parallel', 'parallel drain (DEFERRED)')
    .option('-y, --yes', 'auto-confirm bundled flip prompt without TTY interaction')
    .option('--commit', 'force a git commit for this run (overrides git.auto)')
    .option('--no-commit', 'skip the git commit for this run (overrides git.auto)')
    .action(
      async (
        target: string,
        opts: {
          drain?: boolean;
          all?: boolean;
          phase?: string;
          parallel?: boolean;
          yes?: boolean;
          commit?: boolean;
        },
      ) => {
        if (opts.drain) {
          await runDrain(target);
          return;
        }

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

        let tasksHtml: string | undefined;
        let inboxHtml: string | undefined;
        let specHtml: string | undefined;
        let planHtml: string | undefined;
        let targetFile: string;
        let specDir: string | undefined;

        if (/^I-\d+$/.test(target)) {
          targetFile = path.resolve(process.cwd(), 'inbox.html');
          inboxHtml = await fs.readFile(targetFile, 'utf8');
        } else if (/^T-\d+$/.test(target)) {
          const { glob } = await import('tinyglobby');
          const candidates = await glob(['specs/**/tasks.html'], { cwd: process.cwd() });
          let found: string | null = null;
          for (const candidate of candidates) {
            const content = await fs.readFile(path.resolve(process.cwd(), candidate), 'utf8');
            if (content.includes(`id="${target}"`)) {
              found = candidate;
              tasksHtml = content;
              specDir = path.dirname(path.resolve(process.cwd(), candidate));
              try { specHtml = await fs.readFile(path.join(specDir, 'spec.html'), 'utf8'); } catch { /* optional */ }
              try { planHtml = await fs.readFile(path.join(specDir, 'plan.html'), 'utf8'); } catch { /* optional */ }
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
            ...(planHtml ? { planHtml } : {}),
          },
          { cwd: process.cwd() },
        );

        // Write the tick.
        const escId = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (tasksHtml && targetFile) {
          const re = new RegExp(
            `(<spec-task\\s+id=["']${escId}["'][^>]*>\\s*<input\\s+type=["']checkbox["'])(?!\\s+checked)`,
          );
          tasksHtml = tasksHtml.replace(re, '$1 checked');
          await fs.writeFile(targetFile, tasksHtml, 'utf8');
        } else if (inboxHtml && targetFile) {
          const re = new RegExp(
            `(<spec-triage\\s+id=["']${escId}["'])(?![^>]*\\bdata-status=)`,
          );
          inboxHtml = inboxHtml.replace(re, '$1 data-status="done"');
          await fs.writeFile(targetFile, inboxHtml, 'utf8');
        }

        process.stdout.write(
          `Ticked ${result.ticked.id} in ${result.ticked.file} (${result.remainingUnchecked} unchecked remaining)\n`,
        );

        // Bundled-flip prompt per REQ-LIFECYCLE-005.
        let flipped = false;
        if (result.flipPromptFired && specDir && tasksHtml && specHtml) {
          process.stdout.write(
            '\nLast task ticked on a Draft spec. The bundled flip will set status="accepted" on spec.html, plan.html, and tasks.html.\n',
          );
          process.stdout.write('Verify integration tests covering the Success Criteria pass before confirming.\n');

          const confirmed = opts.yes ? true : await confirmStdin('Flip the bundle Draft → Accepted? [y/N] ');
          if (confirmed) {
            await flipBundle(specDir, fs, path);
            flipped = true;
            process.stdout.write(`Flipped spec + plan + tasks → Accepted in ${specDir}\n`);
          } else {
            process.stdout.write('Skipped flip. Run again with --yes to auto-confirm.\n');
          }
        }

        // Opt-in git layer (spec 026): one commit per invocation (FR-007). A task tick
        // scopes to the spec id; an inbox just-do card has none → unscoped `implement:`.
        // A bundled flip widens the staged paths to the whole spec bundle.
        const { commitVerbAndExit } = await import('../git/index.js');
        const implPaths =
          flipped && specDir
            ? ['spec.html', 'plan.html', 'tasks.html'].map((f) => path.join(specDir, f))
            : [targetFile];
        await commitVerbAndExit({
          verb: 'implement',
          cwd: process.cwd(),
          specId: specDir ? path.basename(specDir) : '',
          paths: implPaths,
          subject: result.ticked.id,
          ...(opts.commit === undefined ? {} : { commit: opts.commit }),
        });
      },
    );
}

/** `implement --drain <spec-id>` — the coding-agent runtime (038): drain unchecked tasks into tested code. */
async function runDrain(specId: string): Promise<void> {
  const [{ drainTasks }, factory, fs, path] = await Promise.all([
    import('@spectastic/core/coding/runtime'),
    import('../coding-factory.js'),
    import('node:fs/promises'),
    import('node:path'),
  ]);

  const specDir = path.resolve(process.cwd(), 'specs', specId);
  const tasksFile = path.join(specDir, 'tasks.html');
  let tasksHtml: string;
  try {
    tasksHtml = await fs.readFile(tasksFile, 'utf8');
  } catch {
    process.stderr.write(`implement --drain: no tasks.html at specs/${specId}/\n`);
    process.exit(2);
  }
  let specHtml: string | undefined;
  let planHtml: string | undefined;
  try { specHtml = await fs.readFile(path.join(specDir, 'spec.html'), 'utf8'); } catch { /* optional */ }
  try { planHtml = await fs.readFile(path.join(specDir, 'plan.html'), 'utf8'); } catch { /* optional */ }

  const [coding, sandbox] = await Promise.all([factory.createCodingAgent(), factory.createSandbox()]);
  const result = await drainTasks(
    { tasksHtml, ...(specHtml ? { specHtml } : {}), ...(planHtml ? { planHtml } : {}) },
    { cwd: process.cwd(), coding, sandbox, verify: factory.createVerifyRunner() },
  );

  if (result.ticked.length > 0) {
    await fs.writeFile(tasksFile, result.tasksHtml, 'utf8');
  }
  process.stdout.write(
    `Drained ${specId}: ticked ${result.ticked.length} task(s) [${result.ticked.join(', ')}]; ${result.remainingUnchecked} unchecked remaining\n`,
  );
  if (result.halted) {
    process.stderr.write(`Halted on ${result.halted.taskId}: ${result.halted.reason}\n`);
    process.exit(1);
  }
}

async function confirmStdin(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function flipBundle(
  specDir: string,
  fs: typeof import('node:fs/promises'),
  path: typeof import('node:path'),
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const todayHuman = formatHumanDate(new Date());
  const entry = `<li><time datetime="${today}">${todayHuman}</time><span>Status flipped Draft → Accepted on ${todayHuman} — zero remaining unchecked tasks; tests verified passing per author confirmation. Sibling bundle (REQ-LIFECYCLE-005).</span></li>`;

  for (const file of ['spec.html', 'plan.html', 'tasks.html'] as const) {
    const fp = path.join(specDir, file);
    let html: string;
    try {
      html = await fs.readFile(fp, 'utf8');
    } catch {
      continue;
    }
    html = html.replace(
      /<spec-status\s+value=["']draft["']>[^<]*<\/spec-status>/g,
      '<spec-status value="accepted">Accepted</spec-status>',
    );
    const closing = html.lastIndexOf('</ol>');
    if (closing !== -1) {
      html = `${html.slice(0, closing)}  ${entry}\n${html.slice(closing)}`;
    }
    await fs.writeFile(fp, html, 'utf8');
  }
}

function formatHumanDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

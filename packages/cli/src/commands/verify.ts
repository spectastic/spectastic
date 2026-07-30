import { join } from 'node:path';
import type { Command } from 'commander';

/**
 * Register the `verify` subcommand (spec 021-verify-view). Generates the
 * derived per-spec `verify.html` — aggregating the bundle's SC → acceptance →
 * test-task trace by reference and merging the real-run Run/Demo block.
 *
 * Two callers (plan D-001): `/implement` pipes the commands it actually ran as
 * JSON on stdin (the captured Run block); a human runs it bare to regenerate
 * the aggregated links, in which case the engine preserves the existing block.
 *
 * The CLI is the thin wrapper; the deterministic engine lives in
 * `@spectastic/core/commands/verify`.
 */
export function registerVerify(program: Command): void {
  program
    .command('verify')
    .description(
      'Generate specs/<id>/verify.html — the derived SC → acceptance → test trace plus the real-run Run/Demo block. Pipe captured run commands as JSON on stdin, or run bare to regenerate the links.',
    )
    .argument('<spec-id>', 'the spec whose verify.html to generate (e.g. 001-auth-service)')
    .action(async (specId: string) => {
      // verify is deterministic — no AIProvider needed (unlike course/propose).
      const [{ verifyCommand }, { nodeFs }, fsp] = await Promise.all([
        import('@spectastic/core/commands/verify'),
        import('@spectastic/core/providers/node-fs'),
        import('node:fs/promises'),
      ]);

      const cwd = process.cwd();
      const capturedRun = await readCapturedRun();
      const ctx = { cwd, fs: nodeFs };

      const result = await verifyCommand({ specId, ...(capturedRun ? { capturedRun } : {}) }, ctx);

      const out = join(cwd, 'specs', result.specId, 'verify.html');
      await fsp.writeFile(out, result.html, 'utf8');
      process.stdout.write(`Wrote specs/${result.specId}/verify.html\n`);
      process.exit(0);
    });
}

/**
 * Read captured run commands from stdin if `/implement` piped them; return
 * undefined for a bare invocation so the engine takes the links-only
 * regeneration path and preserves the existing block. Never blocks on an idle
 * non-TTY stdin: if no data begins arriving promptly, treat it as no capture.
 */
type ReadCapturedRunResult = {
  run?: string;
  toggle?: string;
  tests?: string;
  demo?: string;
  testsCite?: string[];
  demoCite?: string[];
  verified?: boolean;
  // The observables capture (048-verify-slo-trace, FR-002) — plain passthrough,
  // no schema validation here, same as every other field on this type.
  observables?: {
    endpoint?: string;
    signals?: string[];
    slosCite?: string[];
    verified?: boolean;
  };
};

async function readCapturedRun(): Promise<ReadCapturedRunResult | undefined> {
  if (process.stdin.isTTY) return undefined;
  const raw = (await readStdin()).trim();
  if (raw === '') return undefined;
  try {
    return JSON.parse(raw) as ReadCapturedRunResult;
  } catch (err) {
    process.stderr.write(`verify: stdin is not valid JSON — ${(err as Error).message}\n`);
    process.exit(2);
  }
}

/** Collect piped stdin; resolve '' if nothing starts arriving within a grace window. */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    let started = false;
    const onData = (c: Buffer): void => {
      started = true;
      data += c.toString('utf8');
    };
    process.stdin.on('data', onData);
    process.stdin.once('end', () => resolve(data));
    setTimeout(() => {
      if (!started) {
        process.stdin.off('data', onData);
        resolve('');
      }
    }, 150).unref();
  });
}

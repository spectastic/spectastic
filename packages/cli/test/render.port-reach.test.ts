import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-106 of specs/106-visual-render/tasks.html (US1 / NFR-002, FR-004).
 *
 * `@spectastic/render` launches a browser and reaches out to whatever a
 * design source's captures point at — the one network-egress port in this
 * verb's reach. NFR-002 confines that port to a single, named entry point:
 * the render subcommand, and nowhere else. A second CLI command importing
 * the package would be a second undeclared way to reach the network, so this
 * is a source scan over the closed set of command modules, not a behavioural
 * test of any one of them.
 *
 * Written before T-114 wires the import in, so today's expected shape is
 * "zero commands import it" — deliberately red, since NFR-002 isn't merely
 * "at most one", it's "exactly the render subcommand". This fails now
 * (0 matches, not 1) and turns green once T-114 lands the one legitimate
 * import in visual.ts.
 *
 * Widened to walk `commands/` RECURSIVELY by T-1001
 * (2026-08-22-a-caller-is-not-a-second-holder, folded from the risk pass on
 * 110-visual-one-step's design). The scan was depth-1, and `commands/init/`
 * already existed as a subdirectory in this tree — so a helper acquiring the
 * capability under a future `commands/design/` (which 110 needs) would leave
 * this count reading 1 while a second path to the network existed. This test
 * does not prove that no such helper exists; it only widens what the scan can
 * see. What it remains blind to — a re-export, or a core module handed the
 * renderer directly — is recorded in `filesImportingRender`'s own docstring
 * per T-1002, not solved here.
 */
const COMMANDS_DIR = fileURLToPath(new URL('../src/commands', import.meta.url));
const RENDER_IMPORT = /@spectastic\/render/;

/** Every `.ts` file under `commands/`, at any depth, as a path relative to
 *  `COMMANDS_DIR` with forward slashes (so a match reads `init/foo.ts`
 *  regardless of platform). */
function commandFiles(dir: string = COMMANDS_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...commandFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(relative(COMMANDS_DIR, full).split(sep).join('/'));
    }
  }
  return out;
}

/**
 * A module-level string scan is a PROXY for a verb-level requirement
 * (NFR-002 bounds verbs, this counts files), not a proof of it. It cannot see
 * a re-export of the package under another name, nor a core module a command
 * hands the renderer to without importing `@spectastic/render` itself —
 * `renderDesign` already takes `render` as a parameter (`visual.ts`), so
 * nothing here stops a second caller from constructing one and passing it
 * in. The bound this test actually enforces is narrower than NFR-002's own
 * wording, and is expected to widen again if that gap is ever closed rather
 * than approximated.
 */
function filesImportingRender(): string[] {
  return commandFiles().filter((name) => {
    const source = readFileSync(join(COMMANDS_DIR, name), 'utf8');
    return RENDER_IMPORT.test(source);
  });
}

describe('only the render subcommand reaches @spectastic/render', () => {
  it('is imported by exactly one command module', () => {
    const matches = filesImportingRender();
    expect(matches.length).toBe(1);
  });

  it("that module is visual.ts, the render subcommand's home", () => {
    const matches = filesImportingRender();
    expect(matches).toEqual(['visual.ts']);
  });

  it('walks nested command directories, not just the top level (T-1001)', () => {
    // commands/init/ is real today — this pins that the scan actually
    // descends into it rather than silently only ever seeing top-level files.
    const files = commandFiles();
    expect(files.some((f) => f.startsWith('init/'))).toBe(true);
  });
});

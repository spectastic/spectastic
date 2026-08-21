import { readdirSync, readFileSync } from 'node:fs';
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
 */
const COMMANDS_DIR = fileURLToPath(new URL('../src/commands', import.meta.url));
const RENDER_IMPORT = /@spectastic\/render/;

function commandFiles(): string[] {
  return readdirSync(COMMANDS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name);
}

function filesImportingRender(): string[] {
  return commandFiles().filter((name) => {
    const source = readFileSync(`${COMMANDS_DIR}/${name}`, 'utf8');
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
});

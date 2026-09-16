import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeFs } from '../src/providers/node-fs.js';

/**
 * Unit tests for `assetResolveFindings()` (spec 091-artifact-format,
 * REQ-FORMAT-010). Written before the function exists (T-300) — failing until
 * T-301 lands.
 *
 * The fixture at packages/core/test/fixtures/asset-resolve/ carries every case
 * the requirement names in one artifact: a present stylesheet and script, an
 * absent one of each, a directory standing where a file should be, an absolute
 * path, three out-of-reach schemes, an uncaptured image, and an escaped `<link>`
 * inside a `<code>` block.
 *
 * Two of those cases are the ones that shaped the requirement rather than
 * merely exercising it, and both assert SILENCE — which is why they are easy to
 * lose and are named explicitly here:
 *
 *   - `../../../asset-resolve-outside.css` escapes the fixture's project root
 *     and resolves. The first draft cloned `contract-resolve`'s containment
 *     clause and would have errored; the nested `examples/currency-converter/`
 *     bundle, whose artifacts all reach the outer asset tree, showed that makes
 *     a legitimate arrangement correct from one root and broken from another.
 *   - the `<img>` pointing at a render that was never captured. 094 FR-005
 *     forbids at must tier that its absence be reported as a finding.
 */

const PROJECT_ROOT = join(__dirname, 'fixtures', 'asset-resolve');
const SPEC_FILE = join(PROJECT_ROOT, 'specs', '100-fixture-spec', 'spec.html');

async function findings() {
  const { assetResolveFindings } = await import('../src/commands/validate.js');
  const { parse } = await import('@spectastic/schema/parser');
  const doc = parse(readFileSync(SPEC_FILE, 'utf8'), SPEC_FILE);
  return assetResolveFindings(doc, SPEC_FILE, nodeFs, PROJECT_ROOT);
}

const matching = (all: Awaited<ReturnType<typeof findings>>, re: RegExp) => all.filter((f) => re.test(f.message));

describe('assetResolveFindings — a reference that is not there is caught', () => {
  it('is silent on a stylesheet and a script that resolve', async () => {
    const all = await findings();
    expect(matching(all, /assets\/spec\.css/)).toEqual([]);
    expect(matching(all, /theme-boot\.js/)).toEqual([]);
  });

  it('reports an absent stylesheet and an absent script, once each', async () => {
    const all = await findings();
    expect(matching(all, /does-not-exist\.css/)).toHaveLength(1);
    expect(matching(all, /missing-boot\.js/)).toHaveLength(1);
  });

  it('distinguishes "no such file" from a directory standing where a file should be', async () => {
    const all = await findings();
    expect(matching(all, /does-not-exist\.css/)[0]?.message).toMatch(/no such file/i);
    const dir = matching(all, /a-directory/)[0];
    expect(dir).toBeDefined();
    expect(dir?.message).not.toMatch(/no such file/i);
    expect(dir?.message).toMatch(/directory|not a (readable )?file/i);
  });

  it('reports at error severity, under the rule id the requirement names', async () => {
    const all = await findings();
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) {
      expect(f.rule).toBe('asset-resolve');
      expect(f.severity).toBe('error');
    }
  });

  it('points at the line the reference is on, not the top of the file', async () => {
    const all = await findings();
    const absent = matching(all, /does-not-exist\.css/)[0];
    const src = readFileSync(SPEC_FILE, 'utf8').split('\n');
    expect(absent?.line).toBeGreaterThan(1);
    expect(src[(absent?.line ?? 1) - 1]).toContain('does-not-exist.css');
  });
});

describe('assetResolveFindings — containment', () => {
  it('reports an absolute path', async () => {
    const all = await findings();
    expect(matching(all, /\/etc\/passwd/)).toHaveLength(1);
  });

  it('says the absolute path is absolute, rather than that it is missing', async () => {
    // The distinction is the point: an absolute path is rejected on sight
    // because it cannot survive the artifact moving, not because of what is or
    // is not at the other end of it.
    const all = await findings();
    expect(matching(all, /\/etc\/passwd/)[0]?.message).toMatch(/absolute/i);
  });

  it('stays SILENT on a reference that leaves the project root and resolves', async () => {
    // The nested-project case. A bundle vendored beside a shared asset tree
    // reaches above its own root legitimately, and a rule that rejected it
    // would be correct from one invocation directory and wrong from another.
    const all = await findings();
    expect(matching(all, /asset-resolve-outside\.css/)).toEqual([]);
  });
});

describe('assetResolveFindings — what is out of reach', () => {
  it('skips every remote and inline scheme', async () => {
    const all = await findings();
    expect(matching(all, /fonts\.googleapis\.com|example\.com|^data:|data:text/)).toEqual([]);
  });

  it('never reports an image, even one pointing at a render that was never captured', async () => {
    // 094 FR-005, must tier: a render "MUST NOT be load-bearing: no check may
    // depend on one being present, and its absence MUST NOT be reported as a
    // finding or made to fail any gate."
    const all = await findings();
    expect(matching(all, /never-captured\.svg|renders\//)).toEqual([]);
  });

  it('never reports a reference quoted inside a code block', async () => {
    // Prose about a link is not a link. This is what walking the parsed tree
    // buys over matching the source text, and 060's design.html documents the
    // course asset convention exactly this way.
    const all = await findings();
    expect(matching(all, /course\.css|\$\{ASSETS\}/)).toEqual([]);
  });
});

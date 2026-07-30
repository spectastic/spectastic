import { describe, expect, it } from 'vitest';
import { copyLeakFindings } from '../src/commands/validate.js';

/**
 * T-017 (spec 000-spectastic, P-10). The `no-internal-id-in-copy` rule: user-facing
 * CLI help copy must not surface spectastic's own internal artifact ids. The finding
 * builder scans the string arguments of `.description(…)` / `.option(…)` calls in a
 * `.ts` source, comment- and string-aware, and errors on a leaked id. Scoped to the
 * CLI help surface — runtime finding messages / generated copy are review-caught.
 */

const FILE = 'packages/cli/src/commands/demo.ts';

describe('copyLeakFindings', () => {
  it('flags a spec id leaked into a .description() string', () => {
    const src = `program.command('run').description('Drive an approved spec unattended (037).')`;
    const findings = copyLeakFindings(src, FILE);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('no-internal-id-in-copy');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].file).toBe(FILE);
    expect(findings[0].message).toContain('(037)');
  });

  it('flags the "spec NNN" and "REQ-*" forms in .option() help', () => {
    const src = [
      `.option('--a', 'covers required categories (spec 042). Exits 1 on a gap.')`,
      `.option('--b', 'skill-invocation metadata is required (REQ-TOOL-004)')`,
      `.option('--c', 'ends with Spec 043.')`,
    ].join('\n');
    const findings = copyLeakFindings(src, FILE);
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.message).join(' ')).toContain('spec 042');
    expect(findings.map((f) => f.message).join(' ')).toContain('REQ-TOOL-004');
  });

  it('catches a multi-line .option() whose help string is on its own line', () => {
    const src = ['.option(', "  '--graduate <id>',", "  'graduate an exploration into a spec (spec 023)',", ')'].join(
      '\n',
    );
    const findings = copyLeakFindings(src, FILE);
    expect(findings).toHaveLength(1);
    // The finding anchors to the line the leaking literal starts on, not the call.
    expect(findings[0].line).toBe(3);
  });

  it('does NOT flag a clean help string with legitimate parens', () => {
    const src = [
      `.description('Drive an approved spec unattended.')`,
      `.option('--decider <role>', 'human | agent | panel (default: agent; human refused)')`,
      `.option('--budget <tokens>', 'per-run output-token ceiling; 0 = unbounded', '1000000')`,
      `.argument('<target>', 'T-NNN, I-NNN, or spec-id')`,
    ].join('\n');
    expect(copyLeakFindings(src, FILE)).toEqual([]);
  });

  it('ignores an internal id that appears only in a comment', () => {
    const src = [
      '// The hands-off pipeline CLI home (spec 037). Provenance lives here, not in copy.',
      `.description('Drive an approved spec unattended.')`,
      '/* block: implements REQ-LIFECYCLE-005 and FR-006 */',
    ].join('\n');
    expect(copyLeakFindings(src, FILE)).toEqual([]);
  });

  it('allowlists the neutral argument-example placeholder', () => {
    // `.argument` help IS scanned, but `001-auth-service` is the sanctioned neutral
    // placeholder — allowlisted, indistinct from a real slug by pattern.
    const src = `.argument('<spec-id>', 'the spec whose verify.html to generate (e.g. 001-auth-service)')`;
    expect(copyLeakFindings(src, FILE)).toEqual([]);
  });

  it('flags a REAL slug leaked into .argument help (not the placeholder)', () => {
    // A genuine internal slug in argument help is a leak; only the sanctioned
    // placeholder passes. Paid for by verify.ts once shipping `021-verify-view`.
    const src = `.argument('<spec-id>', 'the spec whose verify.html to generate (e.g. 021-verify-view)')`;
    const findings = copyLeakFindings(src, FILE);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('no-internal-id-in-copy');
    expect(findings[0].message).toContain('021-verify-view');
  });

  it('does not flag a date-slug example like 2026-06-16-add-oauth', () => {
    // Change-folder slug examples carry no 3-digit-then-letter run, so they never match.
    const src = `.argument('<slug>', 'change folder slug, e.g. 2026-06-16-add-oauth')`;
    expect(copyLeakFindings(src, FILE)).toEqual([]);
  });

  it('is deterministic — same input, same findings', () => {
    const src = `.option('--x', 'leaks (spec 099)')`;
    expect(copyLeakFindings(src, FILE)).toEqual(copyLeakFindings(src, FILE));
  });
});

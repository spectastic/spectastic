import { describe, expect, it } from 'vitest';
import { unknownKeyFindings } from '../src/config/unknown-keys.js';

/**
 * Spec 087 — the unrecognised-key finding.
 *
 * The failure being closed: misspell a key and nothing happens at all. The
 * user believes they overrode a default and did not.
 */

describe('an unrecognised key is reported @087:FR-005 @087:T-100', () => {
  it('reports a section the registry does not declare', () => {
    const f = unknownKeyFindings({ telemetry: { enabled: true } });
    expect(f).toHaveLength(1);
    expect(f[0]?.key).toBe('telemetry');
  });

  it('reports a key misspelt INSIDE a real section — the likelier typo', () => {
    // This is the case a section-only check would miss, and it is the one a
    // user is more likely to make.
    const f = unknownKeyFindings({ validate: { quantifedNfrFloor: 69 } });
    expect(f).toHaveLength(1);
    expect(f[0]?.key).toBe('validate.quantifedNfrFloor');
  });

  it('says nothing about a wholly valid configuration @087:SC-003', () => {
    expect(
      unknownKeyFindings({
        project: 'acme/payments',
        git: { auto: 'commit', trailers: 'on' },
        verify: { executeCapturedCommands: true },
        consumes: ['spectastic://a/b/unit/c'],
      }),
    ).toEqual([]);
  });

  it('is deterministic — findings come back in a stable order', () => {
    const cfg = { zulu: 1, alpha: 2, mike: 3 };
    expect(unknownKeyFindings(cfg).map((f) => f.key)).toEqual(['alpha', 'mike', 'zulu']);
  });
});

describe('the suggestion is what makes it actionable @087:FR-007 @087:T-111', () => {
  it('names the intended key on a near miss', () => {
    const f = unknownKeyFindings({ validate: { quantifedNfrFloor: 69 } });
    expect(f[0]?.suggestion).toBe('quantifiedNfrFloor');
    expect(f[0]?.message).toContain('did you mean');
  });

  it('names a mistyped section', () => {
    expect(unknownKeyFindings({ enfroce: {} })[0]?.suggestion).toBe('enforce');
  });

  it('offers no suggestion when nothing is close, rather than a misleading one', () => {
    const f = unknownKeyFindings({ telemetry: {} });
    expect(f[0]?.suggestion).toBeUndefined();
    expect(f[0]?.message).toContain('has no effect');
  });

  it('does not "correct" a short key to an unrelated short key', () => {
    // `root` and `role` differ by one character and mean entirely different
    // things. A flat threshold would confidently suggest the wrong one.
    const f = unknownKeyFindings({ corpus: { role: 'x' } });
    expect(f[0]?.suggestion).not.toBe('root');
  });
});

describe('what is not configuration @087:FR-006 @087:T-101', () => {
  it('never reports the schema reference itself', () => {
    // Metadata a validator reads, not a setting. Reporting it would make the
    // tool complain about the very thing it wrote.
    expect(unknownKeyFindings({ $schema: 'https://example.test/config.schema.json' })).toEqual([]);
  });

  it('leaves a top-level scalar section alone rather than walking into it', () => {
    // `consumes` is modelled as a one-key section; its value is an array, and
    // there is nothing inside it to check.
    expect(unknownKeyFindings({ consumes: ['spectastic://a/b/unit/c'] })).toEqual([]);
  });

  it('does not crash on a malformed section', () => {
    for (const broken of [{ git: 'on' }, { git: null }, { git: [] }]) {
      expect(() => unknownKeyFindings(broken as Record<string, unknown>)).not.toThrow();
    }
  });
});

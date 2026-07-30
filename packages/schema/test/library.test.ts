import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type CrossFileRule,
  type Finding,
  type Location,
  type PerFileRule,
  type Rule,
  rules,
  type Severity,
  type ValidateOptions,
  validate,
  validateMany,
} from '../src/index.js';

/**
 * US3 / SC-004: the @spectastic/schema public surface is consumable as
 * a library — VS Code extension, MCP server, future kernel.
 * This smoke test exercises the surface in the shape a downstream
 * consumer would write: import names from the package, call validate,
 * narrow the returned shape, walk the rule registry.
 */
describe('public library surface (US3, FR-013, SC-004)', () => {
  const minimal = `
<!doctype html>
<html><head><meta charset="utf-8"><title>test</title></head>
<body><main><header>
<spec-meta><b>Status</b><span><spec-status value="draft">Draft</spec-status></span></spec-meta>
</header>
<spec-out-of-scope><ul><li>missing defer-to — should fire</li></ul></spec-out-of-scope>
</main></body></html>
`;

  it('validate(html) returns Finding[] with the documented shape', () => {
    const findings = validate(minimal, { file: 'inline.html' });
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(typeof f.file).toBe('string');
      expect(typeof f.line).toBe('number');
      expect(typeof f.column).toBe('number');
      expect(typeof f.rule).toBe('string');
      expect(['error', 'warning']).toContain(f.severity);
      expect(typeof f.message).toBe('string');
    }
  });

  it('validateMany([{html,file}]) returns Finding[] and runs cross-file rules', () => {
    const findings = validateMany([{ html: minimal, file: 'inline.html' }]);
    expect(Array.isArray(findings)).toBe(true);
  });

  it('rules registry is a non-empty readonly array of Rule', () => {
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(typeof r.id).toBe('string');
      expect(['per-file', 'cross-file']).toContain(r.scope);
      expect(['error', 'warning']).toContain(r.defaultSeverity);
      expect(typeof r.description).toBe('string');
      expect(typeof r.check).toBe('function');
    }
  });

  it('exported types narrow as documented', () => {
    expectTypeOf<Severity>().toEqualTypeOf<'error' | 'warning'>();
    expectTypeOf<Finding>().toHaveProperty('file');
    expectTypeOf<Location>().toHaveProperty('line');
    expectTypeOf<Rule>().toMatchTypeOf<PerFileRule | CrossFileRule>();
    expectTypeOf<ValidateOptions>().toHaveProperty('file');
  });
});

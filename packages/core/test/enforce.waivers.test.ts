import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  isBoilerplateReason,
  loadWaivers,
  parseIsoDate,
  readRawWaivers,
} from '../src/enforce/config.js';
import { enforceWaiverFindings } from '../src/commands/validate.js';
import type { EnforcementCategory } from '../src/enforce/types.js';

/** Unit tests for the waiver config loader + validate scan (spec 042 FR-011/FR-013). */

function projectWith(json: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-waiver-'));
  writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(json), 'utf8');
  return dir;
}

const goodWaiver = {
  category: 'observability',
  reason: 'OTLP push exporter; no local /metrics endpoint to detect. OPS-4127.',
  until: '2026-10-01',
  owner: 'me@briancorbin.co.uk',
};

describe('parseIsoDate', () => {
  it('accepts strict YYYY-MM-DD', () => {
    expect(parseIsoDate('2026-10-01')?.toISOString().slice(0, 10)).toBe('2026-10-01');
  });
  it('rejects loose / impossible dates', () => {
    for (const bad of ['2026-1-1', '2026/10/01', 'soon', '2026-02-31', '']) {
      expect(parseIsoDate(bad)).toBeNull();
    }
  });
});

describe('isBoilerplateReason', () => {
  it('flags empty, short, and known placeholder reasons', () => {
    for (const r of ['', '   ', 'n/a', 'N/A', 'todo', 'TBD', 'waived', 'temp', 'because']) {
      expect(isBoilerplateReason(r)).toBe(true);
    }
  });
  it('accepts a specific justification', () => {
    expect(isBoilerplateReason('OTLP push exporter; no /metrics surface. OPS-4127.')).toBe(false);
  });
});

describe('daysBetween', () => {
  it('is positive when b is later, day-resolution', () => {
    expect(daysBetween(new Date('2026-07-11T00:00:00Z'), new Date('2026-07-12T00:00:00Z'))).toBe(1);
    expect(daysBetween(new Date('2026-07-11T00:00:00Z'), new Date('2026-07-10T00:00:00Z'))).toBe(-1);
  });
});

describe('loadWaivers / readRawWaivers', () => {
  it('loads a well-typed waiver', () => {
    const dir = projectWith({ enforce: { waivers: [goodWaiver] } });
    expect(loadWaivers(dir)).toHaveLength(1);
  });
  it('is fail-safe: absent file, missing section, non-array → []', () => {
    expect(loadWaivers(mkdtempSync(join(tmpdir(), 'empty-')))).toEqual([]);
    expect(loadWaivers(projectWith({ git: { auto: 'off' } }))).toEqual([]);
    expect(loadWaivers(projectWith({ enforce: { waivers: 'nope' } }))).toEqual([]);
  });
  it('drops a structurally-incomplete waiver (fail-safe) but readRawWaivers keeps it for validate', () => {
    const partial = { category: 'observability', reason: 'x' }; // no until/owner
    const dir = projectWith({ enforce: { waivers: [partial] } });
    expect(loadWaivers(dir)).toEqual([]); // never relaxes
    expect(readRawWaivers(dir)).toHaveLength(1); // still visible to the loud scan
  });
});

describe('enforceWaiverFindings (validate scan, FR-013)', () => {
  const ctx = {
    required: ['observability', 'security'] as EnforcementCategory[],
    unwaivable: ['security'] as EnforcementCategory[],
    validCategories: ['formatter', 'observability', 'security', 'coverage'] as EnforcementCategory[],
    now: new Date('2026-07-11T00:00:00.000Z'),
  };
  const rules = (ws: unknown[]) =>
    enforceWaiverFindings(ws as never, ctx, 'spectastic.json').map((f) => f.message);

  it('a well-formed waiver produces no findings', () => {
    expect(enforceWaiverFindings([goodWaiver] as never, ctx, 'spectastic.json')).toEqual([]);
  });
  it('flags an unknown category', () => {
    expect(rules([{ ...goodWaiver, category: 'observabilty' }]).join()).toMatch(/unknown enforcement category/);
  });
  it('flags an un-relaxable category', () => {
    expect(rules([{ ...goodWaiver, category: 'security' }]).join()).toMatch(/un-relaxable/);
  });
  it('flags a dead waiver (valid category not in the floor)', () => {
    expect(rules([{ ...goodWaiver, category: 'coverage' }]).join()).toMatch(/not in this profile's floor/);
  });
  it('flags a boilerplate reason', () => {
    expect(rules([{ ...goodWaiver, reason: 'todo' }]).join()).toMatch(/empty or boilerplate reason/);
  });
  it('flags a missing owner', () => {
    expect(rules([{ ...goodWaiver, owner: '' }]).join()).toMatch(/no owner/);
  });
  it('flags a silently-expired waiver', () => {
    expect(rules([{ ...goodWaiver, until: '2026-06-01' }]).join()).toMatch(/expired on 2026-06-01/);
  });
  it('flags an over-horizon (>365d) waiver', () => {
    expect(rules([{ ...goodWaiver, until: '2027-08-01' }]).join()).toMatch(/more than 365 days out/);
  });
  it('flags an invalid until', () => {
    expect(rules([{ ...goodWaiver, until: 'soon' }]).join()).toMatch(/invalid "until"/);
  });
  it('reports multiple problems on one waiver', () => {
    expect(rules([{ category: 'security', reason: 'todo', owner: '', until: 'soon' }]).length).toBeGreaterThanOrEqual(4);
  });
});

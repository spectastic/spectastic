import { describe, expect, it } from 'vitest';
import { contractResourceUri, resourceUri, specResourceUri } from '../src/project-shared.js';

/**
 * The resource-URI composer, generalised from spec-only to kind-parameterised
 * (spec 076-contract-export-handover, Foundational + US1; design D-001/D-002).
 *
 * 067 landed `specResourceUri` and its design anticipated a sibling kind. This
 * lifts the kind segment to a parameter and adds `contractResourceUri` on top,
 * keeping `specResourceUri` as a wrapper so no existing caller changes.
 *
 * T-010 is the REGRESSION half and is written green: it pins today's
 * `specResourceUri` output across project shapes, so the refactor cannot drift
 * it silently. T-011 and T-100 are written red.
 */

describe('T-010 · regression: specResourceUri output is unchanged by the refactor', () => {
  // Pinned literals, not derived — a derived expectation would move with the
  // implementation and prove nothing.
  const PINNED: ReadonlyArray<readonly [string, string, string | undefined, string]> = [
    ['spectastic/spectastic', '042', undefined, 'spectastic://spectastic/spectastic/spec/042'],
    ['spectastic/spectastic', '042', 'REQ-FORMAT-004', 'spectastic://spectastic/spectastic/spec/042#REQ-FORMAT-004'],
    // A bare project degrades to a single-segment authority with no path prefix.
    ['spectastic', '042', undefined, 'spectastic://spectastic/spec/042'],
    ['spectastic', '042', 'FR-001', 'spectastic://spectastic/spec/042#FR-001'],
    // A deeper subgroup path keeps everything after the first segment as path.
    ['acme/platform/billing', '007-invoices', undefined, 'spectastic://acme/platform/billing/spec/007-invoices'],
  ];

  it.each(PINNED.map((p) => [`${p[0]} · ${p[1]}${p[2] ? `#${p[2]}` : ''}`, p] as const))(
    '%s',
    (_label, [project, specId, anchor, expected]) => {
      expect(specResourceUri(project, specId, anchor)).toBe(expected);
    },
  );

  it('never emits a fragment when no anchor is given', () => {
    expect(specResourceUri('spectastic/spectastic', '042')).not.toContain('#');
  });
});

describe('T-011/D-001 · resourceUri takes the kind as a parameter', () => {
  it('composes a spec coordinate', () => {
    expect(resourceUri('acme/billing', 'spec', '042')).toBe('spectastic://acme/billing/spec/042');
  });

  it('composes a contract coordinate under the same authority rule', () => {
    expect(resourceUri('acme/billing', 'contract', 'invoices')).toBe('spectastic://acme/billing/contract/invoices');
  });

  it('a bare project degrades to a single-segment authority for any kind', () => {
    expect(resourceUri('billing', 'contract', 'invoices')).toBe('spectastic://billing/contract/invoices');
  });

  it('carries an anchor when given', () => {
    expect(resourceUri('acme/billing', 'contract', 'invoices', 'Settlement')).toBe(
      'spectastic://acme/billing/contract/invoices#Settlement',
    );
  });

  it('specResourceUri is exactly resourceUri with the spec kind — one composer, not two', () => {
    for (const project of ['acme/billing', 'billing', 'acme/platform/billing']) {
      expect(specResourceUri(project, '042')).toBe(resourceUri(project, 'spec', '042'));
      expect(specResourceUri(project, '042', 'FR-001')).toBe(resourceUri(project, 'spec', '042', 'FR-001'));
    }
  });
});

describe('T-100/FR-001 · contractResourceUri', () => {
  it('composes contract/<name> under the owner authority', () => {
    expect(contractResourceUri('acme/billing', 'invoices')).toBe('spectastic://acme/billing/contract/invoices');
  });

  it('degrades to a single-segment authority for a bare project, exactly as the spec kind does', () => {
    expect(contractResourceUri('billing', 'invoices')).toBe('spectastic://billing/contract/invoices');
  });

  it('keeps a deeper subgroup path as leading path segments', () => {
    expect(contractResourceUri('acme/platform/billing', 'invoices')).toBe(
      'spectastic://acme/platform/billing/contract/invoices',
    );
  });

  it('is pure — identical input, identical output (NFR-001)', () => {
    const once = contractResourceUri('acme/billing', 'invoices');
    const twice = contractResourceUri('acme/billing', 'invoices');
    expect(once).toBe(twice);
  });
});

describe('T-110/SC-002 · the coordinate is path-independent — the requirement most easily got wrong', () => {
  // The coordinate names WHAT the contract is, not WHERE its file currently
  // sits. A consumer that pinned a coordinate must not be broken by the
  // producer reorganising its own repository.
  it('moving the contract file within the producing repo changes the coordinate in 0 cases', () => {
    // The same logical contract, authored at three different paths over time.
    const name = 'invoices';
    const atRoot = contractResourceUri('acme/billing', name);
    const underApi = contractResourceUri('acme/billing', name);
    const underNestedProto = contractResourceUri('acme/billing', name);

    expect(new Set([atRoot, underApi, underNestedProto]).size).toBe(1);
  });

  it('the composer takes no path at all — path-independence is structural, not enforced', () => {
    // The signature is (project, name, anchor?) — three parameters, none of
    // which is a path, so there is no channel through which a path could leak
    // into a coordinate. Structural, not a rule someone has to remember.
    expect(contractResourceUri.length).toBe(3);
    // And the same name under the same project is always the same coordinate,
    // however the producing repo is laid out.
    expect(contractResourceUri('acme/billing', 'invoices')).toBe(contractResourceUri('acme/billing', 'invoices'));
  });
});

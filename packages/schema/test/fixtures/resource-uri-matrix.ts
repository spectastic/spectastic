import type { ResourceKind } from '../../src/project-shared.js';

/**
 * The coordinate fixture matrix (078-federated-resource-uri, T-001): every
 * resource kind crossed with every combination of edition pin and anchor,
 * shared by the composer tests (T-100) and the round-trip test (T-200) so
 * both exercise the identical set of cases.
 *
 * Exercises the low-level `resourceUri`/`parseResourceUri` grammar directly
 * — not the per-kind convenience wrappers (`specResourceUri`,
 * `contractResourceUri`, `corpusResourceUri`) — because the round-trip
 * guarantee (FR-008/SC-002) is a property of the shared grammar, not of any
 * one kind's call-site sugar.
 */
export interface ResourceUriFixture {
  label: string;
  /** The authority value passed to `resourceUri` — already in its intended
   * case/shape. The corpus-only lowercase fold (D-004) is exercised by its
   * own dedicated tests, not this generic matrix. */
  project: string;
  kind: ResourceKind;
  /** The name segment(s) after the kind — a bare id for spec/contract, a
   * `plugin/slug` pair for corpus. */
  name: string;
  anchor?: string;
  edition?: string;
  /** The exact composed URI this combination MUST produce. */
  expected: string;
}

export const RESOURCE_URI_MATRIX: readonly ResourceUriFixture[] = [
  // spec — bare (owner-only) authority
  {
    label: 'spec, bare',
    project: 'spectastic',
    kind: 'spec',
    name: '042',
    expected: 'spectastic://spectastic/spec/042',
  },
  {
    label: 'spec, anchor only',
    project: 'spectastic',
    kind: 'spec',
    name: '042',
    anchor: 'FR-001',
    expected: 'spectastic://spectastic/spec/042#FR-001',
  },
  {
    label: 'spec, edition only',
    project: 'spectastic',
    kind: 'spec',
    name: '042',
    edition: '2026-07-26',
    expected: 'spectastic://spectastic/spec/042?edition=2026-07-26',
  },
  {
    label: 'spec, edition + anchor',
    project: 'spectastic',
    kind: 'spec',
    name: '042',
    edition: '2026-07-26',
    anchor: 'FR-001',
    expected: 'spectastic://spectastic/spec/042?edition=2026-07-26#FR-001',
  },

  // contract — owner-qualified (subgroup) authority
  {
    label: 'contract, owner-qualified, bare',
    project: 'acme/svc-a',
    kind: 'contract',
    name: 'orders-api',
    expected: 'spectastic://acme/svc-a/contract/orders-api',
  },
  {
    label: 'contract, anchor only',
    project: 'acme/svc-a',
    kind: 'contract',
    name: 'orders-api',
    anchor: 'schema',
    expected: 'spectastic://acme/svc-a/contract/orders-api#schema',
  },
  {
    label: 'contract, edition only',
    project: 'acme/svc-a',
    kind: 'contract',
    name: 'orders-api',
    edition: 'v2',
    expected: 'spectastic://acme/svc-a/contract/orders-api?edition=v2',
  },
  {
    label: 'contract, edition + anchor',
    project: 'acme/svc-a',
    kind: 'contract',
    name: 'orders-api',
    edition: 'v2',
    anchor: 'schema',
    expected: 'spectastic://acme/svc-a/contract/orders-api?edition=v2#schema',
  },

  // corpus — marketplace authority, plugin/slug as the name segment(s)
  {
    label: 'corpus, bare',
    project: 'spectastic',
    kind: 'corpus',
    name: 'spectastic-concepts/001-foundations',
    expected: 'spectastic://spectastic/corpus/spectastic-concepts/001-foundations',
  },
  {
    label: 'corpus, anchor only',
    project: 'spectastic',
    kind: 'corpus',
    name: 'spectastic-concepts/001-foundations',
    anchor: 'settlement-windows',
    expected: 'spectastic://spectastic/corpus/spectastic-concepts/001-foundations#settlement-windows',
  },
  {
    label: 'corpus, edition only',
    project: 'spectastic',
    kind: 'corpus',
    name: 'spectastic-concepts/001-foundations',
    edition: '2026-07-26',
    expected: 'spectastic://spectastic/corpus/spectastic-concepts/001-foundations?edition=2026-07-26',
  },
  {
    label: 'corpus, edition + anchor',
    project: 'spectastic',
    kind: 'corpus',
    name: 'spectastic-concepts/001-foundations',
    edition: '2026-07-26',
    anchor: 'settlement-windows',
    expected:
      'spectastic://spectastic/corpus/spectastic-concepts/001-foundations?edition=2026-07-26#settlement-windows',
  },
];

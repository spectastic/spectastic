import { RESOURCE_KINDS, type ResourceKind } from '../../src/project-shared.js';

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
  // unit — added when the kind had already shipped for a while without
  // reaching this matrix. FR-008's guarantee is stated "for every kind", and
  // `unit` was widened into `ResourceKind`/`KNOWN_KINDS` (079) without a
  // fixture here, so the round-trip property was asserted for three of the
  // four kinds that existed and claimed for all of them. Found while
  // grounding a fifth kind; the gap is the reason that grounding happened.
  {
    label: 'unit, bare',
    project: 'spectastic',
    kind: 'unit',
    name: 'core',
    expected: 'spectastic://spectastic/unit/core',
  },
  {
    label: 'unit, owner-qualified',
    project: 'spectastic/spectastic',
    kind: 'unit',
    name: 'core',
    expected: 'spectastic://spectastic/spectastic/unit/core',
  },
  {
    label: 'unit, anchor',
    project: 'spectastic/spectastic',
    kind: 'unit',
    name: 'core',
    anchor: 'exports',
    expected: 'spectastic://spectastic/spectastic/unit/core#exports',
  },
  // The two edition cases, added after the first pass covered `unit` for the
  // bare and anchor combinations only. FR-008 requires the round-trip "for
  // every kind AND every combination of edition pin and anchor" — a
  // cross-product — so covering a kind is not the same as covering it, and
  // `unit` was the one kind counted present while two of its four cells were
  // empty.
  {
    label: 'unit, edition',
    project: 'spectastic/spectastic',
    kind: 'unit',
    name: 'core',
    edition: '2026-07-26',
    expected: 'spectastic://spectastic/spectastic/unit/core?edition=2026-07-26',
  },
  {
    label: 'unit, edition + anchor',
    project: 'spectastic/spectastic',
    kind: 'unit',
    name: 'core',
    edition: '2026-07-26',
    anchor: 'exports',
    expected: 'spectastic://spectastic/spectastic/unit/core?edition=2026-07-26#exports',
  },
  // screen — 095 FR-013. The name spans TWO segments, the owning spec and the
  // screen, which is the shape `corpus` already ships as `plugin/slug`. That is
  // what makes a screen addressable at all: a screen id is unique within its
  // spec and nowhere else, so a single-segment name would collide the moment
  // two features each declared a `convert`.
  {
    label: 'screen, bare',
    project: 'spectastic',
    kind: 'screen',
    name: '001-currency-conversion/convert',
    expected: 'spectastic://spectastic/screen/001-currency-conversion/convert',
  },
  {
    label: 'screen, owner-qualified',
    project: 'spectastic/spectastic',
    kind: 'screen',
    name: '001-currency-conversion/convert',
    expected: 'spectastic://spectastic/spectastic/screen/001-currency-conversion/convert',
  },
  {
    label: 'screen, anchor',
    project: 'spectastic/spectastic',
    kind: 'screen',
    name: '001-currency-conversion/convert',
    anchor: 'empty',
    expected: 'spectastic://spectastic/spectastic/screen/001-currency-conversion/convert#empty',
  },
  {
    label: 'screen, edition',
    project: 'spectastic/spectastic',
    kind: 'screen',
    name: '001-currency-conversion/convert',
    edition: '2026-08-14',
    expected: 'spectastic://spectastic/spectastic/screen/001-currency-conversion/convert?edition=2026-08-14',
  },
  {
    label: 'screen, edition and anchor',
    project: 'spectastic/spectastic',
    kind: 'screen',
    name: '001-currency-conversion/convert',
    anchor: 'empty',
    edition: '2026-08-14',
    expected: 'spectastic://spectastic/spectastic/screen/001-currency-conversion/convert?edition=2026-08-14#empty',
  },
];

/**
 * The four combinations FR-008 states — edition pin present or absent,
 * crossed with anchor present or absent. Kept as a literal count rather than
 * derived: this set is closed by this spec's own grammar (078 SC-002), not
 * by a sibling spec the way `RESOURCE_KINDS` is, so there is nothing else
 * for it to drift out of sync with.
 */
export const COMBINATIONS = ['bare', 'anchor', 'edition', 'edition+anchor'] as const;
export type Combination = (typeof COMBINATIONS)[number];

function combinationOf(f: ResourceUriFixture): Combination {
  if (f.edition !== undefined && f.anchor !== undefined) return 'edition+anchor';
  if (f.edition !== undefined) return 'edition';
  if (f.anchor !== undefined) return 'anchor';
  return 'bare';
}

/**
 * Every `kind:combination` pair `fixtures` does NOT cover, for each of
 * `kinds`. Pure and parameterised — never reads `RESOURCE_KINDS` or
 * `RESOURCE_URI_MATRIX` directly — so a test can hand it a WIDENED kind list
 * against the real fixtures and watch a gap appear, which is the only way to
 * confirm the check catches anything rather than merely running (T-1003).
 */
export function missingCoverage(kinds: readonly string[], fixtures: readonly ResourceUriFixture[]): string[] {
  const covered = new Set(fixtures.map((f) => `${f.kind}:${combinationOf(f)}`));
  const missing: string[] = [];
  for (const kind of kinds) {
    for (const combination of COMBINATIONS) {
      const pair = `${kind}:${combination}`;
      if (!covered.has(pair)) missing.push(pair);
    }
  }
  return missing;
}

/**
 * Every `kind:combination` pair the real matrix does NOT cover, derived from
 * {@link RESOURCE_KINDS} rather than a hand-maintained count (078
 * FR-013/FR-014). Empty means every recognised kind is exercised against
 * every combination FR-008 requires.
 *
 * This is the mechanism, not the fixtures: widening `RESOURCE_KINDS` without
 * adding matching entries above makes this return a non-empty list rather
 * than nothing noticing, which is what let `unit` sit uncovered from 079
 * until it was found by hand. `project-shared.test.ts` asserts this is empty.
 */
export function uncoveredPairs(): string[] {
  return missingCoverage(RESOURCE_KINDS, RESOURCE_URI_MATRIX);
}

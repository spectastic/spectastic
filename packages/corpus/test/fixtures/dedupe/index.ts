import type { RegistryEntry } from '../../../src/knowledge/types.js';

/**
 * Two-repo dedupe fixtures (078-federated-resource-uri, T-002): the same
 * corpus document — same marketplace/plugin/slug pack — as it would be
 * registered in three different repositories, each with a different
 * project identity and a different locally-assigned `KB-NNNN` id. Feeds
 * T-300's cross-repo dedupe test (FR-009/SC-001).
 *
 * Repo A and repo B hold the SAME edition of the same document; their
 * unpinned coordinates MUST be byte-identical. Repo B's marketplace is
 * deliberately mixed-case (`Spectastic`), exercising the corpus-only
 * lowercase fold (D-004) at the same time as the dedupe proof. Repo C
 * holds a DIFFERENT edition of the same document — its unpinned
 * coordinate still matches A/B, but its pinned coordinate MUST differ.
 */

export interface DedupeRepoFixture {
  label: string;
  /** This repo's project identity — irrelevant to the corpus coordinate
   * (FR-002), included to prove that irrelevance. */
  project: string;
  /** This repo's resolved corpus.marketplace value — deliberately varies
   * in case across repos to exercise D-004's fold. */
  marketplace: string;
  entry: RegistryEntry;
}

const PLUGIN = 'spectastic-concepts';
const SLUG = '001-foundations';
const EDITION_1 = '2026-07-26';
const EDITION_2 = '2026-08-01';

export const DEDUPE_REPOS: readonly DedupeRepoFixture[] = [
  {
    label: 'repo A — lowercase marketplace, edition 1',
    project: 'acme/svc-a',
    marketplace: 'spectastic',
    entry: {
      id: 'KB-0001',
      marketplace: 'spectastic',
      plugin: PLUGIN,
      slug: SLUG,
      title: 'Foundations',
      edition: EDITION_1,
      path: 'knowledge/spectastic-concepts/references/001-foundations.md',
    },
  },
  {
    label: 'repo B — mixed-case marketplace, edition 1 (same edition as A)',
    project: 'acme/svc-b',
    marketplace: 'Spectastic',
    entry: {
      id: 'KB-0007',
      marketplace: 'Spectastic',
      plugin: PLUGIN,
      slug: SLUG,
      title: 'Foundations',
      edition: EDITION_1,
      path: 'knowledge/spectastic-concepts/references/001-foundations.md',
    },
  },
  {
    label: 'repo C — lowercase marketplace, edition 2 (differs from A/B)',
    project: 'acme/svc-c',
    marketplace: 'spectastic',
    entry: {
      id: 'KB-0042',
      marketplace: 'spectastic',
      plugin: PLUGIN,
      slug: SLUG,
      title: 'Foundations',
      edition: EDITION_2,
      path: 'knowledge/spectastic-concepts/references/001-foundations.md',
    },
  },
];

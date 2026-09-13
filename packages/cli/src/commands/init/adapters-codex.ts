import { translateToSkill } from '@spectastic/core/skills/translate';
import type { AdapterTarget } from './adapters.js';

/**
 * The Codex host target (spec 111-codex-skill-adapters, D-002 / D-005): each
 * command renders to an Agent-Skills `SKILL.md` under `.agents/skills/`.
 *
 * Kept in its own module, imported lazily by the codex code paths, so the
 * translator and its `yaml` dependency never load on the `init` cold start —
 * `adapters.ts` (on the static init graph) stays dependency-free.
 */
export const CODEX_TARGET: AdapterTarget = {
  id: 'codex',
  destSubdir: '.agents/skills',
  owns: /^spectastic-.+$/,
  render: (sourceMd, sourceFile) => translateToSkill(sourceMd, sourceFile),
};

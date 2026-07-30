import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VERB_MODEL_POLICY } from '@spectastic/core/model-policy';
import { describe, expect, it } from 'vitest';

/**
 * The committed source of truth for the slash commands is `commands/*.md`
 * (spec 044 Tier A). `.claude/commands/` and `packages/cli/_bundled/` are both
 * gitignored copies — the former a manual local copy for the running host, the
 * latter regenerated from source by prebuild.mjs — so this asserts only the
 * committed source. The drift-guard validate rule (verb-model-policy) enforces
 * the same at lint time; this is the direct check that the real files carry it.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..');

describe('command frontmatter carries the model policy (spec 044 FR-001)', () => {
  for (const [verb, tier] of Object.entries(VERB_MODEL_POLICY)) {
    it(`spectastic.${verb}.md declares model: ${tier}`, () => {
      const src = readFileSync(join(REPO_ROOT, 'commands', `spectastic.${verb}.md`), 'utf8');
      const fm = /^---\n([\s\S]*?)\n---/.exec(src)?.[1] ?? '';
      const declared = /^model:[ \t]*(\S+)/m.exec(fm)?.[1];
      expect(declared, `${verb} frontmatter must declare model:`).toBe(tier);
    });
  }
});

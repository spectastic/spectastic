import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isModelTier } from '@spectastic/core/model-policy';
import { describe, expect, it } from 'vitest';

/**
 * The tracked subagent definitions (spec 044 Tier C, FR-004). Sources live in
 * `agents/` and are bundled to `_bundled/.claude/agents/` by prebuild + synced to
 * `.claude/agents/` locally. The pinned tiers are the contract: cheap fan-out
 * (classifier/impl-task on sonnet), strong adversary (critic on inherit).
 */
const REPO_ROOT = join(__dirname, '..', '..', '..');

const EXPECTED: Record<string, string> = {
  'spectastic-critic': 'inherit',
  'spectastic-classifier': 'sonnet',
  'spectastic-impl-task': 'sonnet',
};

describe('subagent definitions (spec 044 FR-004)', () => {
  for (const [name, tier] of Object.entries(EXPECTED)) {
    it(`agents/${name}.md declares model: ${tier} and a matching name`, () => {
      const src = readFileSync(join(REPO_ROOT, 'agents', `${name}.md`), 'utf8');
      const fm = /^---\n([\s\S]*?)\n---/.exec(src)?.[1] ?? '';
      const declaredModel = /^model:[ \t]*(\S+)/m.exec(fm)?.[1];
      const declaredName = /^name:[ \t]*(\S+)/m.exec(fm)?.[1];
      expect(declaredModel).toBe(tier);
      expect(isModelTier(declaredModel)).toBe(true);
      expect(declaredName).toBe(name);
      // must carry a description so the router can select it
      expect(/^description:/m.test(fm)).toBe(true);
    });
  }
});

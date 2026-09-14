import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Single-source-of-ownership (spec 120, NFR-001 / SC-004). The owner comparison
 * must live in exactly ONE place — the verdict. The output renderers (explain,
 * teach) read the recorded `cause` + authority off the violation; they must NOT
 * recompute ownership. Recomputing needs two things a renderer has no business
 * touching: the current project identity (`currentProject`) and the decision's
 * `resource` (where the owner lives). This structure test asserts both are absent
 * from the renderers and present in the verdict — a second, driftable copy of the
 * one comparison 119 was careful to place once would fail here.
 *
 * (Reading `input.project` to build a DISPLAY coordinate is not an ownership
 * comparison — the renderers take a `project` param for that; the signal for
 * recomputation is `currentProject` + `.resource`, neither of which they use.)
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(resolve(here, '..', 'src', 'guardrail', rel), 'utf8');

const OWNER_IDENTITY = /\bcurrentProject\b/; // the identity used for the owner comparison
const RESOURCE_ACCESS = /\.resource\b/; // the decision's resource — where the owner lives

describe('single-source-of-ownership (SC-004)', () => {
  it('the verdict IS the one place the owner comparison happens', () => {
    const verdict = src('verdict.ts');
    expect(OWNER_IDENTITY.test(verdict)).toBe(true);
    expect(RESOURCE_ACCESS.test(verdict)).toBe(true);
  });

  it('explain.ts recomputes no ownership — no current-project identity, no decision resource', () => {
    const explain = src('explain.ts');
    expect(OWNER_IDENTITY.test(explain)).toBe(false);
    expect(RESOURCE_ACCESS.test(explain)).toBe(false);
  });

  it('shifu.ts recomputes no ownership — no current-project identity, no decision resource', () => {
    const shifu = src('shifu.ts');
    expect(OWNER_IDENTITY.test(shifu)).toBe(false);
    expect(RESOURCE_ACCESS.test(shifu)).toBe(false);
  });
});

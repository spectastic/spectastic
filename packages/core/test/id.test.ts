import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { idCommand, UnknownSpecError } from '../src/commands/id.js';

/**
 * 067-spec-project-identity T-200/T-201/T-202: red-first tests for the `id`
 * command engine (plan D-003) — resolve the project identity, confirm the
 * spec exists, render the canonical spectastic:// resource URI (FR-004/FR-005).
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function project(config?: Record<string, unknown>, specIds: string[] = ['042-example']): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-id-'));
  dirs.push(dir);
  if (config) writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(config), 'utf8');
  for (const id of specIds) mkdirSync(join(dir, 'specs', id), { recursive: true });
  return dir;
}

describe('idCommand — composes the canonical URI (T-200)', () => {
  it('resolves an owner-qualified project to spectastic://<owner>/<repo>/spec/<id>', () => {
    const cwd = project({ project: 'spectastic/spectastic' }, ['042-example']);
    expect(idCommand({ specId: '042-example' }, cwd)).toEqual({
      uri: 'spectastic://spectastic/spectastic/spec/042-example',
    });
  });

  it('appends a supplied anchor mechanically', () => {
    const cwd = project({ project: 'spectastic/spectastic' }, ['042-example']);
    expect(idCommand({ specId: '042-example', anchor: 'REQ-FORMAT-004' }, cwd)).toEqual({
      uri: 'spectastic://spectastic/spectastic/spec/042-example#REQ-FORMAT-004',
    });
  });

  it('omits the fragment when no anchor is given', () => {
    const cwd = project({ project: 'spectastic/spectastic' }, ['042-example']);
    expect(idCommand({ specId: '042-example' }, cwd).uri).not.toContain('#');
  });
});

describe('idCommand — errors on an unknown spec (T-201)', () => {
  it('throws UnknownSpecError rather than fabricating a coordinate', () => {
    const cwd = project({ project: 'spectastic/spectastic' }, ['042-example']);
    expect(() => idCommand({ specId: '999-nope' }, cwd)).toThrow(UnknownSpecError);
  });
});

describe('idCommand — two distinct project identities never collide (T-202, SC-001)', () => {
  it('the same repo-local spec id resolves to two distinct URIs under two projects', () => {
    const repoA = project({ project: 'acme/widget' }, ['042-example']);
    const repoB = project({ project: 'other-org/gadget' }, ['042-example']);

    const uriA = idCommand({ specId: '042-example' }, repoA).uri;
    const uriB = idCommand({ specId: '042-example' }, repoB).uri;

    expect(uriA).not.toBe(uriB);
    expect(uriA).toBe('spectastic://acme/widget/spec/042-example');
    expect(uriB).toBe('spectastic://other-org/gadget/spec/042-example');
  });
});

describe('idCommand — degrades to the provisional bare-dir coordinate when project is unset (SC-003)', () => {
  it('still resolves — never throws — using basename(cwd)', () => {
    const cwd = project(undefined, ['042-example']);
    const { uri } = idCommand({ specId: '042-example' }, cwd);
    expect(uri).toMatch(/^spectastic:\/\/[^/]+\/spec\/042-example$/);
  });
});

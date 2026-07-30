import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGraph, listSpecs } from './scanner.js';

// Runnable host-path verification (spec FR-001, FR-010): the scanner is vscode-free,
// so it can build the real LifecycleGraph for this very spec under vitest.
const repoRoot = process.cwd();
const specsRoot = path.join(repoRoot, 'specs');

describe('scanner.buildGraph against specs/020-vscode-extension', () => {
  it('lists this spec among the project specs', async () => {
    const specs = await listSpecs(specsRoot);
    expect(specs).toContain('020-vscode-extension');
  });

  it('builds one node per existing artifact, ordered along the lifecycle', async () => {
    const graph = await buildGraph({
      specId: '020-vscode-extension',
      specDir: path.join(specsRoot, '020-vscode-extension'),
      specsRoot,
      workspaceRoot: repoRoot,
    });
    const verbs = graph.nodes.map((n) => n.verb);
    expect(verbs).toContain('spec');
    expect(verbs).toContain('plan');
    expect(verbs).toContain('tasks');
    // principles.html lives at the repo root and should appear first.
    expect(verbs).toContain('principles');
    expect(verbs.indexOf('spec')).toBeLessThan(verbs.indexOf('plan'));
  });

  it('reports the spec node metric as its requirement count', async () => {
    const graph = await buildGraph({
      specId: '020-vscode-extension',
      specDir: path.join(specsRoot, '020-vscode-extension'),
      specsRoot,
      workspaceRoot: repoRoot,
    });
    const spec = graph.nodes.find((n) => n.verb === 'spec');
    expect(spec?.metric).toMatch(/^\d+ reqs$/);
  });
});

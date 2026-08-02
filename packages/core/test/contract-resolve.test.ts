import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeFs } from '../src/providers/node-fs.js';

/**
 * Unit tests for `contractResolveFindings()` (spec 070-contract-sidecar-convention,
 * FR-004/FR-006, design D-002/D-003/D-004). Written before the function exists
 * (T-100/T-101/T-200/T-201) — failing until T-110/T-210 land.
 *
 * The fixture project at packages/core/test/fixtures/contract-resolve/ declares
 * seven cases in one design.html: present, absent, a directory, an absolute-path
 * escape, a `..` traversal escape, a path resolving inside specs/ (D-003), and a
 * prefix-collision regression (myspecs/api.yaml, T-201).
 */

const PROJECT_ROOT = join(__dirname, 'fixtures', 'contract-resolve');
const DESIGN_FILE = join(PROJECT_ROOT, 'specs', '100-fixture-spec', 'design.html');

function readDeclarations() {
  return readFileSync(DESIGN_FILE, 'utf8');
}

describe("contractResolveFindings — US1: a declared path that isn't there is caught", () => {
  it('produces exactly 1 finding for an absent path and 0 for a present one', async () => {
    const { contractResolveFindings } = await import('../src/commands/validate.js');
    const { readContractDeclarations } = await import('@spectastic/schema/contract');
    const decls = readContractDeclarations(readDeclarations(), DESIGN_FILE);
    const findings = await contractResolveFindings(decls, DESIGN_FILE, nodeFs, PROJECT_ROOT);

    const present = findings.filter((f) => /api\/openapi\.yaml/.test(f.message));
    expect(present).toEqual([]);

    const absent = findings.filter((f) => /does-not-exist\.yaml/.test(f.message));
    expect(absent).toHaveLength(1);
  });

  it('distinguishes "no such file" from "exists but is not a readable file" (FR-006)', async () => {
    const { contractResolveFindings } = await import('../src/commands/validate.js');
    const { readContractDeclarations } = await import('@spectastic/schema/contract');
    const decls = readContractDeclarations(readDeclarations(), DESIGN_FILE);
    const findings = await contractResolveFindings(decls, DESIGN_FILE, nodeFs, PROJECT_ROOT);

    const absentFinding = findings.find((f) => /does-not-exist\.yaml/.test(f.message));
    const directoryFinding = findings.find((f) => /a-directory/.test(f.message));
    expect(absentFinding?.message).toMatch(/no such file/i);
    expect(directoryFinding?.message).not.toMatch(/no such file/i);
    expect(directoryFinding?.message).toMatch(/not a (readable )?file|directory/i);
  });
});

describe('contractResolveFindings — containment (design D-004)', () => {
  it('rejects an absolute path as escaping the project root, never following it', async () => {
    const { contractResolveFindings } = await import('../src/commands/validate.js');
    const { readContractDeclarations } = await import('@spectastic/schema/contract');
    const decls = readContractDeclarations(readDeclarations(), DESIGN_FILE);
    const findings = await contractResolveFindings(decls, DESIGN_FILE, nodeFs, PROJECT_ROOT);

    const escaping = findings.find((f) => /etc\/passwd/.test(f.message));
    expect(escaping).toBeDefined();
    expect(escaping?.message).toMatch(/escap|outside|absolute/i);
  });

  it('rejects a .. traversal as escaping the project root', async () => {
    const { contractResolveFindings } = await import('../src/commands/validate.js');
    const { readContractDeclarations } = await import('@spectastic/schema/contract');
    const decls = readContractDeclarations(readDeclarations(), DESIGN_FILE);
    const findings = await contractResolveFindings(decls, DESIGN_FILE, nodeFs, PROJECT_ROOT);

    const escaping = findings.find((f) => /outside-the-project\.yaml/.test(f.message));
    expect(escaping).toBeDefined();
    expect(escaping?.message).toMatch(/escap|outside|traversal/i);
  });
});

describe('contractResolveFindings — US2: proposed-never-effective (design D-003)', () => {
  it('rejects a declared path resolving inside specs/ even when the file exists', async () => {
    const { contractResolveFindings } = await import('../src/commands/validate.js');
    const { readContractDeclarations } = await import('@spectastic/schema/contract');
    const decls = readContractDeclarations(readDeclarations(), DESIGN_FILE);
    const findings = await contractResolveFindings(decls, DESIGN_FILE, nodeFs, PROJECT_ROOT);

    const proposedAsEffective = findings.find((f) => /contracts\/settlements\.yaml/.test(f.message));
    expect(proposedAsEffective).toBeDefined();
    expect(proposedAsEffective?.message).toMatch(/specs\//i);
  });
});

describe('contractResolveFindings — prefix-collision regression (T-201)', () => {
  it('does not mistake myspecs/api.yaml for a specs/-containment violation', async () => {
    const { contractResolveFindings } = await import('../src/commands/validate.js');
    const { readContractDeclarations } = await import('@spectastic/schema/contract');
    const decls = readContractDeclarations(readDeclarations(), DESIGN_FILE);
    const findings = await contractResolveFindings(decls, DESIGN_FILE, nodeFs, PROJECT_ROOT);

    const myspecsFinding = findings.find((f) => /myspecs\/api\.yaml/.test(f.message));
    expect(myspecsFinding).toBeDefined();
    // It must be absent (no such file), NOT a specs/-containment rejection —
    // proves the check is a resolved-prefix comparison, not a substring match.
    expect(myspecsFinding?.message).toMatch(/no such file/i);
    expect(myspecsFinding?.message).not.toMatch(/inside specs\/|proposed/i);
  });
});

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import type { Finding } from '@spectastic/schema';
import { sarifFormatter } from '../src/formatters/sarif.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(here, 'fixtures', 'sarif-2.1.0.schema.json');

/**
 * T-202 of specs/002-validate-cli/tasks.html: the emitted SARIF must
 * validate against the official SARIF 2.1.0 JSON Schema (vendored).
 * Per D-006 of the plan, this is what we get instead of pulling a
 * full SARIF library: structural correctness verified at test time,
 * zero runtime dependency.
 */
describe('SARIF schema validation (T-202, D-006)', () => {
  it('emits valid SARIF 2.1.0 for a non-empty finding set', async () => {
    const schemaText = await readFile(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(schemaText) as object;
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validateFn = ajv.compile(schema);

    const findings: Finding[] = [
      {
        file: 'specs/001-auth/spec.html',
        line: 47,
        column: 3,
        rule: 'no-missing-defer-to',
        severity: 'error',
        message: '<spec-out-of-scope> <li> missing required defer-to=',
        fixHint: 'Add defer-to="<sibling-spec-id>".',
      },
      {
        file: 'specs/001-auth/spec.html',
        line: 92,
        column: 5,
        rule: 'no-duplicate-ids',
        severity: 'error',
        message: 'duplicate stable ID "REQ-AUTH-001"',
        relatedLocations: [{ file: 'specs/001-auth/spec.html', line: 110, column: 3 }],
      },
    ];

    const sarifText = sarifFormatter(findings);
    const sarif: unknown = JSON.parse(sarifText);
    const ok = validateFn(sarif);
    expect(ok, `SARIF validation errors: ${JSON.stringify(validateFn.errors, null, 2)}`).toBe(true);
  });

  it('emits valid SARIF 2.1.0 for an empty finding set', async () => {
    const schemaText = await readFile(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(schemaText) as object;
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validateFn = ajv.compile(schema);

    const sarifText = sarifFormatter([]);
    const sarif: unknown = JSON.parse(sarifText);
    const ok = validateFn(sarif);
    expect(ok, `SARIF validation errors: ${JSON.stringify(validateFn.errors, null, 2)}`).toBe(true);
  });
});

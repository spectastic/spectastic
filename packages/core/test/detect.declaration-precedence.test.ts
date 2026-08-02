import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectTooling, interfaceEvidence } from '../src/enforce/detect.js';

/**
 * Declaration-over-inference precedence (spec 073-interface-detection-widening,
 * US3 / FR-003; design D-004). Written before the precedence exists
 * (T-300/T-301) — failing until T-310 lands.
 *
 * Why it is required rather than merely nice: a signal is a substring test
 * against a manifest, so the identical `kafkajs` entry appears in a publisher
 * and a subscriber. No filesystem-only method can separate them. The design
 * artifact is the only place that knows — so where one exists, it decides.
 *
 * Both directions matter, and both false answers have been observed:
 *   - a declared contract path establishes one is owed even where the
 *     filesystem has nothing;
 *   - a declared shape="none" establishes none is owed even where a broker
 *     dependency is present (the pure-consumer case), which also fixes the
 *     mirror false-positive where a vendored upstream spec marks a pure API
 *     consumer "covered".
 */

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-detect-declaration-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

const KAFKA = '{"dependencies":{"kafkajs":"^2.2.0"}}';
const EXPRESS = '{"dependencies":{"express":"^4.19.0"}}';

/** A design artifact declaring a contract at `path`. */
function designDeclaring(path: string): string {
  return `<!doctype html><html><body>
<spec-contract shape="request-response" path="${path}" format="OpenAPI"><p>reasoning</p></spec-contract>
</body></html>`;
}

/** A design artifact declaring explicitly that it exposes no interface. */
const DESIGN_NO_INTERFACE = `<!doctype html><html><body>
<spec-contract shape="none"><p>This service consumes events; it publishes nothing.</p></spec-contract>
</body></html>`;

describe('a declaration establishes NO contract is owed (073, FR-003 — the consumer case)', () => {
  it('T-300: shape="none" exempts a project despite a broker dependency (US3 acceptance)', () => {
    const dir = fixture({
      'package.json': KAFKA,
      'specs/001-consumer/design.html': DESIGN_NO_INTERFACE,
    });
    // Inference alone would see a broker and demand a contract.
    expect(interfaceEvidence(dir).event).toBe(true);
    // The declaration overrules it.
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });

  it('shape="none" exempts a project despite an HTTP framework too — precedence is not broker-only', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'specs/001-internal/design.html': DESIGN_NO_INTERFACE,
    });
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });

  it('T-301: a pure consumer vendoring an upstream spec is NOT marked covered by that vendored file', () => {
    // The mirror false-positive the companion survey found: a crate/package that
    // vendors an upstream contract to generate a CLIENT reads as covered today,
    // because filesystem inference cannot tell producing from consuming.
    const dir = fixture({
      'package.json': KAFKA,
      'api/openapi.yaml': 'openapi: 3.0.0\n', // vendored upstream spec — not ours
      'specs/001-consumer/design.html': DESIGN_NO_INTERFACE,
    });
    // Covered, but because the design says nothing is owed — not because a
    // vendored file was mistaken for this project's own contract.
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });
});

describe('a declaration establishes a contract IS owed (073, FR-003 — the other direction)', () => {
  it('T-300: a declared path with no file on disk is a gap, despite no dependency signal at all', () => {
    const dir = fixture({
      'package.json': '{"dependencies":{"lodash":"^4"}}', // no interface signal whatsoever
      'specs/001-api/design.html': designDeclaring('api/openapi.yaml'),
      // ...and no api/openapi.yaml on disk.
    });
    // Inference alone would exempt this project entirely (nothing to contract).
    expect(interfaceEvidence(dir)).toEqual({ http: false, event: false });
    // The declaration establishes that a contract is owed, and it is missing.
    expect(detectTooling(dir).has('contract-first')).toBe(false);
  });

  it('a declared path that DOES resolve is covered', () => {
    const dir = fixture({
      'package.json': '{"dependencies":{"lodash":"^4"}}',
      'specs/001-api/design.html': designDeclaring('api/openapi.yaml'),
      'api/openapi.yaml': 'openapi: 3.0.0\n',
    });
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });

  it('T-301: a declared path the filesystem lacks is a gap even when an UNRELATED contract exists', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'specs/001-api/design.html': designDeclaring('api/settlements.yaml'),
      'api/openapi.yaml': 'openapi: 3.0.0\n', // a different file — not the declared one
    });
    expect(detectTooling(dir).has('contract-first')).toBe(false);
  });
});

describe('inference runs only where the design is silent (073, D-004)', () => {
  it('a project with no design at all behaves exactly as before — inference only', () => {
    const dir = fixture({ 'package.json': EXPRESS });
    expect(detectTooling(dir).has('contract-first')).toBe(false); // interface, no contract → gap
  });

  it('a design carrying no <spec-contract> element does not override inference', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'specs/001-x/design.html': '<!doctype html><html><body><p>a design with no contract section</p></body></html>',
    });
    expect(detectTooling(dir).has('contract-first')).toBe(false);
  });

  it('a malformed/unreadable design never crashes detection — it falls back to inference', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'specs/001-x/design.html': '<<<not really html at all',
    });
    expect(() => detectTooling(dir)).not.toThrow();
    expect(detectTooling(dir).has('contract-first')).toBe(false);
  });

  it('declarations compose across designs — a later shape="none" cannot void an earlier one', () => {
    // Superseded by change 2026-08-02-declarations-accumulate. This fixture used
    // to assert the opposite: that 002 sorting last made its shape="none" the
    // project's whole posture, hiding 001's declared-but-missing contract and
    // reporting covered. That was the false pass FR-003's amendment removes —
    // a per-feature disclaimer never speaks for the project.
    const dir = fixture({
      'package.json': KAFKA,
      'specs/001-old/design.html': designDeclaring('api/old.yaml'),
      'specs/002-new/design.html': DESIGN_NO_INTERFACE,
    });
    expect(detectTooling(dir).has('contract-first')).toBe(false);
  });

  it('the union is order-independent — a declaration binds wherever it sits in the estate', () => {
    // The determinism the superseded test was reaching for, stated in the form
    // the amended requirement actually guarantees: composition has no winner, so
    // sort position cannot change the verdict.
    const declaredFirst = fixture({
      'package.json': KAFKA,
      'specs/001-api/design.html': designDeclaring('api/spec.yaml'),
      'specs/002-cli/design.html': DESIGN_NO_INTERFACE,
    });
    const declaredLast = fixture({
      'package.json': KAFKA,
      'specs/001-cli/design.html': DESIGN_NO_INTERFACE,
      'specs/002-api/design.html': designDeclaring('api/spec.yaml'),
    });
    expect(detectTooling(declaredFirst).has('contract-first')).toBe(detectTooling(declaredLast).has('contract-first'));
    expect(detectTooling(declaredFirst).has('contract-first')).toBe(false);
  });
});

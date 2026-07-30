import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/** Unit tests for the no-executable-content rule (spec 045-artifact-security, FR-001). */

const RULE = 'no-executable-content';

function findings(body: string, title = 'test · Specification'): string[] {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><main>${body}</main></body></html>`;
  return validate(html, 'specs/999-x/spec.html')
    .filter((f) => f.rule === RULE)
    .map((f) => f.message);
}

describe('no-executable-content: flags executable content (error)', () => {
  it('flags an inline <script>', () => {
    expect(findings('<script>window.x=1</script>').join()).toMatch(/inline.*executable content/i);
  });
  it('flags a non-sanctioned external <script>', () => {
    expect(findings('<script src="https://evil.example.com/x.js"></script>').length).toBeGreaterThan(0);
  });
  it('flags an inline event handler', () => {
    expect(findings('<button onclick="x()">go</button>').join()).toMatch(/onclick/);
  });
  it('flags a javascript: URI', () => {
    expect(findings('<a href="javascript:alert(1)">x</a>').join()).toMatch(/javascript: URI/);
  });
  it('flags a data: URI', () => {
    expect(findings('<a href="data:text/html,<b>hi">x</a>').join()).toMatch(/data: URI/);
  });
  it('flags an <iframe>', () => {
    expect(findings('<iframe src="https://example.com" title="f"></iframe>').join()).toMatch(/iframe/);
  });
  it('the rule is error severity', () => {
    const html = `<!doctype html><html><head><title>t · Specification</title></head><body><script>x</script></body></html>`;
    const f = validate(html, 'specs/999-x/spec.html').find((x) => x.rule === RULE);
    expect(f?.severity).toBe('error');
  });
});

describe('no-executable-content: does not flag clean content', () => {
  it('the sanctioned spec.js / theme-boot.js refs are allowed', () => {
    expect(
      findings('<script src="../../assets/spec.js"></script><script src="../../assets/theme-boot.js"></script>'),
    ).toEqual([]);
  });
  it('sanctioned scripts at any depth (by basename)', () => {
    expect(findings('<script src="../../../../assets/spec.js"></script>')).toEqual([]);
  });
  it('inline style=, external links, and anchors are fine', () => {
    expect(findings('<p style="color:red"><a href="https://x.com">ext</a> <a href="#s">anchor</a></p>')).toEqual([]);
  });
});

describe('no-executable-content: sanctioned interactive artifacts (courses) are exempt', () => {
  it('a course (title ends "· Course") with an inline gate <script> is NOT flagged', () => {
    expect(findings('<script>gate()</script>', 'Intro to X · Course')).toEqual([]);
  });
  it('a non-course spec with the same inline script IS flagged', () => {
    expect(findings('<script>gate()</script>', 'Intro to X · Specification').length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import { extractHealth } from './extract.js';

// Written before extractHealth existed (task T-010): exercises status, requirement
// counts, open-question count, and — critically — budget-band parity with the
// runtime spec.js gauge (band = pct<=70 green, <=100 amber, else red; worst of
// words/reqs/read-time). Fixtures keep word counts small and countable.

const GREEN = `<!doctype html><html><head><title>x</title></head><body><main>
<p class="small-caps">Specification · 099-demo</p>
<spec-status value="accepted">Accepted</spec-status>
<spec-budget words="1000" reqs="20" minutes="12"></spec-budget>
<spec-requirement id="FR-001" priority="must"><p>alpha</p></spec-requirement>
<spec-requirement id="FR-002" priority="should"><p>beta</p></spec-requirement>
<spec-requirement id="NFR-001" priority="must"><p>gamma</p></spec-requirement>
<spec-requirement id="SC-001" priority="must"><p>delta</p></spec-requirement>
<spec-questions><ol><li>one open thing</li></ol></spec-questions>
<spec-risk status="identified"><p>a live risk</p></spec-risk>
<spec-risk status="mitigated"><p>handled</p></spec-risk>
</main><script>var ignored = 1;</script></body></html>`;

const RED = GREEN.replace('words="1000"', 'words="3"');

const PLAN = `<!doctype html><html><head></head><body><main>
<p class="small-caps">Implementation plan · 099-demo</p>
<spec-status value="draft">Draft</spec-status>
</main></body></html>`;

describe('extractHealth', () => {
  it('reads status, requirement counts and open questions from a spec', () => {
    const h = extractHealth(GREEN);
    expect(h.status).toBe('accepted');
    expect(h.reqCounts).toEqual({ fr: 2, nfr: 1, sc: 1 });
    expect(h.reqCount).toBe(4);
    expect(h.openQuestions).toBe(1);
  });

  it('counts only identified risks', () => {
    expect(extractHealth(GREEN).risksIdentified).toBe(1);
    expect(extractHealth(PLAN).risksIdentified).toBe(0);
  });

  it('excludes <script> text from the word count', () => {
    const h = extractHealth(GREEN);
    // 3 (spec id) + 1 (Accepted) + 4 (req bodies) + 3 (open question) + 3+1 (risks) = 15.
    expect(h.wordCount).toBe(15);
    expect(h.readMinutes).toBe(1);
  });

  it('computes a green budget band when well under every budget', () => {
    expect(extractHealth(GREEN).budgetBand).toBe('green');
  });

  it('computes a red budget band when a budget is exceeded', () => {
    expect(extractHealth(RED).budgetBand).toBe('red');
  });

  it('returns null budget band and null req counts for a non-spec artifact', () => {
    const h = extractHealth(PLAN);
    expect(h.status).toBe('draft');
    expect(h.budgetBand).toBeNull();
    expect(h.reqCounts).toBeNull();
    expect(h.openQuestions).toBe(0);
  });
});

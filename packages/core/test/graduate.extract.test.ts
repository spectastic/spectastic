import { describe, expect, it } from 'vitest';
import { graduateExtract } from '@spectastic/core/commands/graduate';
import { StubAIProvider } from '@spectastic/core/providers/stub';

// T-100 (spec 023-explore-graduation, US1): the AI-coupled extract leg reads a
// build + run record into a Draft spec + plan, seeding the run's proven facts as
// `verified` rows in the PLAN's §3 evidence ledger (FR-003 / FR-004).

// A ledger with a verify-shaped run block — two proven facts (run + demo), an
// empty `tests` (the build was never test-covered).
const LEDGER = `<!doctype html><html><body>
<spec-runblock>
  <spec-run>pnpm --filter @demo/list dev</spec-run>
  <spec-toggle>none</spec-toggle>
  <spec-tests></spec-tests>
  <spec-demo>open localhost:5173, drag a row; order persists</spec-demo>
</spec-runblock>
</body></html>`;

const EXTRACT_JSON = JSON.stringify({
  intent: 'A drag-to-reorder list editor',
  tldr: 'Pointer-driven reorder with optimistic persistence.',
  stories: [{ id: 'US1', title: 'Reorder rows', role: 'user', want: 'to drag rows', outcome: 'order persists', acceptance: 'dragging a row reorders and persists across reload' }],
  frs: [{ id: 'FR-001', priority: 'must', body: 'reorder rows by pointer drag and persist the order' }],
  scs: [{ id: 'SC-001', priority: 'must', body: 'a reordered list survives a reload' }],
});

describe('graduateExtract (US1)', () => {
  it('reads the build into a spec + plan, seeding verified rows in the plan ledger', async () => {
    const ai = new StubAIProvider({ chat: [EXTRACT_JSON] });
    const { specHtml, planHtml } = await graduateExtract(
      { specId: '088-sortable-list', classification: 'tracer-bullet', ledger: LEDGER },
      { cwd: '', ai },
    );

    // spec carries the extracted requirement + story
    expect(specHtml).toContain('<spec-requirement id="FR-001"');
    expect(specHtml).toContain('reorder rows by pointer drag');
    expect(specHtml).toContain('id="US1"');
    expect(specHtml).toContain('<spec-status value="draft">Draft</spec-status>');
    // 045-artifact-security T-102: a graduated spec's own generated <head>
    // carries the open-time CSP gate too.
    expect(specHtml).toContain('Content-Security-Policy');

    // FR-004: the PLAN's §3 evidence ledger holds verified rows from the run record,
    // citing the archived exploration — and the spec has NO grounding ledger.
    expect(planHtml).toContain('grounding');
    expect(planHtml).toContain('<spec-status value="accepted">verified</spec-status>');
    expect(planHtml).toContain('explorations/archive/088-sortable-list/explore.html');
    expect(planHtml).toContain('pnpm --filter @demo/list dev'); // the proven run fact
    expect(planHtml).toContain('order persists'); // the proven demo fact
    // the empty `tests` field is not invented as a verified fact
    expect(planHtml).not.toContain('Test command (proven by the run)');
    // 045-artifact-security T-102: the graduated plan's own generated <head>
    // carries the open-time CSP gate too.
    expect(planHtml).toContain('Content-Security-Policy');
  });

  it('seeds no verified rows when the build never ran', async () => {
    const ai = new StubAIProvider({ chat: [EXTRACT_JSON] });
    const emptyRun = '<spec-runblock><spec-run></spec-run><spec-demo></spec-demo></spec-runblock>';
    const { planHtml } = await graduateExtract(
      { specId: '099', classification: 'spike', ledger: emptyRun },
      { cwd: '', ai },
    );
    expect(planHtml).toContain('The build never ran');
    expect(planHtml).not.toContain('verified</spec-status>');
  });

  it('throws when no AI provider is given (the extract leg is AI-coupled)', async () => {
    await expect(
      graduateExtract({ specId: '099', classification: 'spike', ledger: LEDGER }, { cwd: '' }),
    ).rejects.toThrow(/AI-coupled/);
  });
});

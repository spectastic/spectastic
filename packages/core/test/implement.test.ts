import { describe, expect, it } from 'vitest';
import { implementCommand } from '@spectastic/core/commands/implement';
import type { KernelContext } from '@spectastic/core';

// implementCommand is pure w.r.t. IO — it neither reads nor writes files —
// so a bare KernelContext (no fs, no ai) is sufficient.
const ctx: KernelContext = { cwd: '/' };

const TASKS_THREE_UNCHECKED = `<!doctype html><html><body>
<spec-task id="T-001"><input type="checkbox"> Setup repo</spec-task>
<spec-task id="T-002"><input type="checkbox"> Implement FR-001</spec-task>
<spec-task id="T-003"><input type="checkbox"> Implement FR-002</spec-task>
</body></html>`;

const TASKS_ONE_UNCHECKED = `<!doctype html><html><body>
<spec-task id="T-001"><input type="checkbox" checked> Setup repo</spec-task>
<spec-task id="T-002"><input type="checkbox" checked> Implement FR-001</spec-task>
<spec-task id="T-003"><input type="checkbox"> Implement FR-002</spec-task>
</body></html>`;

const SPEC_DRAFT = `<!doctype html><html><body>
<p class="small-caps">Specification · 099-test</p>
<spec-status value="draft">Draft</spec-status>
<spec-requirement id="FR-001" priority="must"><p>Frob.</p></spec-requirement>
</body></html>`;

const SPEC_ACCEPTED = `<!doctype html><html><body>
<p class="small-caps">Specification · 099-test</p>
<spec-status value="accepted">Accepted</spec-status>
<spec-requirement id="FR-001" priority="must"><p>Frob.</p></spec-requirement>
</body></html>`;

const INBOX_WITH_CARD = `<!doctype html><html><body>
<spec-triage id="I-001" layer="just-do"><p>Fix typo in README.</p></spec-triage>
<spec-triage id="I-002" layer="just-do" data-status="done"><p>Already done.</p></spec-triage>
</body></html>`;

describe('implementCommand (014)', () => {
  it('ticks a middle task without firing the flip prompt', async () => {
    const result = await implementCommand(
      { target: 'T-002', tasksHtml: TASKS_THREE_UNCHECKED, specHtml: SPEC_DRAFT },
      ctx,
    );
    expect(result.ticked).toEqual({ kind: 'task', id: 'T-002', file: 'tasks.html' });
    expect(result.remainingUnchecked).toBe(2);
    expect(result.flipPromptFired).toBe(false);
  });

  it('fires the flip prompt on last-tick when spec is Draft', async () => {
    const result = await implementCommand(
      { target: 'T-003', tasksHtml: TASKS_ONE_UNCHECKED, specHtml: SPEC_DRAFT },
      ctx,
    );
    expect(result.ticked.id).toBe('T-003');
    expect(result.remainingUnchecked).toBe(0);
    expect(result.flipPromptFired).toBe(true);
  });

  it('does NOT fire the flip prompt on last-tick when spec is Accepted', async () => {
    const result = await implementCommand(
      { target: 'T-003', tasksHtml: TASKS_ONE_UNCHECKED, specHtml: SPEC_ACCEPTED },
      ctx,
    );
    expect(result.remainingUnchecked).toBe(0);
    expect(result.flipPromptFired).toBe(false);
  });

  it('does NOT fire the flip prompt on last-tick when specHtml is undefined', async () => {
    const result = await implementCommand(
      { target: 'T-003', tasksHtml: TASKS_ONE_UNCHECKED },
      ctx,
    );
    expect(result.remainingUnchecked).toBe(0);
    expect(result.flipPromptFired).toBe(false);
  });

  it('ticks an inbox just-do card and never fires the flip prompt', async () => {
    const result = await implementCommand(
      { target: 'I-001', inboxHtml: INBOX_WITH_CARD, specHtml: SPEC_DRAFT },
      ctx,
    );
    expect(result.ticked).toEqual({ kind: 'just-do', id: 'I-001', file: 'inbox.html' });
    expect(result.remainingUnchecked).toBe(0);
    expect(result.flipPromptFired).toBe(false);
  });

  it('throws when target is a task ID but tasksHtml is undefined', async () => {
    await expect(
      implementCommand({ target: 'T-001' }, ctx),
    ).rejects.toThrow(/tasksHtml is undefined/);
  });

  it('throws when target is an unrecognised ID (e.g., a spec-id)', async () => {
    await expect(
      implementCommand(
        { target: '001-auth', tasksHtml: TASKS_THREE_UNCHECKED },
        ctx,
      ),
    ).rejects.toThrow(/not a recognised T-NNN or I-NNN/);
  });
});

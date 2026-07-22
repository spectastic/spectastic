import { describe, expect, it } from 'vitest';
import { renderRoadmapHtml } from '../src/commands/order.render.js';

/**
 * 045-artifact-security T-102: the roadmap generator's own <head> carries the
 * open-time CSP gate too, not just the file-based templates. No dedicated
 * unit test covered renderRoadmapHtml's HTML output before this change (the
 * root Playwright specs exercise a real generated docs/roadmap.html but never
 * assert on <head>), so this is scoped strictly to guarding the fix.
 */
describe('renderRoadmapHtml: carries the CSP', () => {
  it('emits the Content-Security-Policy meta tag even for an empty ordering', () => {
    const html = renderRoadmapHtml({ entries: [], dangling: [] });
    expect(html).toContain('Content-Security-Policy');
  });
});

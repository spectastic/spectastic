/**
 * List-intake detection heuristic. Per D-006 of
 * specs/007-core-triage/design.html: ported verbatim from the slash-command
 * markdown's discipline (commas, semicolons, newlines, numbered items,
 * phrases like "things" / "items" / "stuff").
 *
 * Returns 'list' if the description looks like a list of items,
 * 'single' otherwise.
 */
export function detectMode(description: string): 'single' | 'list' {
  const text = description.trim();
  if (!text) return 'single';

  if (/\n.*\n/.test(text)) return 'list';
  if (/[,;](?!\s*$)/.test(text) && text.split(/[,;]/).length >= 3) return 'list';
  if (/^[\s]*[-*•]/m.test(text)) return 'list';
  if (/^\s*\d+[.)]/m.test(text)) return 'list';
  if (/\b(things|items|stuff)\b/i.test(text)) return 'list';
  if (/\b(?:a |several |multiple |few |many )/i.test(text) && /:/.test(text)) return 'list';

  return 'single';
}

/**
 * The shared "today" stamp for every verb that dates an artifact (inbox
 * I-080). Thirteen sites across nine verbs each wrote
 * `new Date().toISOString().slice(0, 10)` — UTC — to stamp a changelog entry,
 * a proposal folder name, or a created/observed `<time>` element. Anywhere
 * behind UTC, a verb run after local evening dates its artifact a day ahead;
 * anywhere ahead of UTC, an early-morning run dates a day behind. These dates
 * are author-facing — what a changelog entry, a triage card's `Fixed` row,
 * and a proposal folder name all mean by "when" — so they should match the
 * day the author did the work, on the author's own calendar.
 *
 * `now` is optional and threads through exactly like the enforce waiver
 * expiry's injected clock (`enforce/policy.ts` `now?: Date`), so a
 * deterministic test can pin a date without mocking global time.
 */
export function localIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

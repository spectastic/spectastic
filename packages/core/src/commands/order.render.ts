/**
 * The WSJF cross-check (spec 028-dependency-ordering, FR-008) and the
 * self-contained roadmap view (FR-007). WSJF folds the DAG leverage into Cost
 * of Delay so it genuinely differs from RICE, making the divergence flag a real
 * signal (plan D-006). The view renders the order *statically* in source order
 * (P-1/P-4) — JavaScript only decorates; with JS off the ordered list still
 * reads top-to-bottom.
 */

import type { Ordering, RankedNode } from '../ordering/types.js';

/** Escape text for safe interpolation into HTML. */
function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/**
 * Compute WSJF for every ranked node and flag rank divergence vs RICE.
 * JobSize ← effort; Cost of Delay ← reach×impact×confidence × (1 + normalised
 * subtree value). Returns a new array; unranked nodes keep `wsjf: null`.
 */
export function applyWsjf(entries: readonly RankedNode[]): RankedNode[] {
  const maxSubtree = entries.reduce((m, e) => Math.max(m, e.subtreeValue), 0);
  const ranked = entries.filter((e) => e.rice !== null);

  const wsjfOf = new Map<string, number>();
  for (const e of ranked) {
    const r = e.rice!;
    const leverage = maxSubtree > 0 ? e.subtreeValue / maxSubtree : 0;
    const costOfDelay = r.reach * r.impact * r.confidence * (1 + leverage);
    wsjfOf.set(e.specId, costOfDelay / r.effort);
  }

  const byId = (a: string, b: string): number => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  };
  const cmp =
    (key: (e: RankedNode) => number) =>
    (a: RankedNode, b: RankedNode): number =>
      key(b) - key(a) || byId(a.specId, b.specId);

  const ricePos = new Map([...ranked].sort(cmp((e) => e.value ?? 0)).map((e, i) => [e.specId, i]));
  const wsjfPos = new Map([...ranked].sort(cmp((e) => wsjfOf.get(e.specId) ?? 0)).map((e, i) => [e.specId, i]));

  return entries.map((e) => ({
    ...e,
    wsjf: wsjfOf.get(e.specId) ?? null,
    diverges: e.rice !== null && ricePos.get(e.specId) !== wsjfPos.get(e.specId),
  }));
}

const TAG_LABEL: Record<RankedNode['tag'], string> = {
  ranked: 'ranked',
  unranked: 'unranked',
  elevated: 'elevated',
};

function num(n: number | null, digits = 1): string {
  return n === null ? '—' : n.toFixed(digits);
}

function statusNote(e: RankedNode): string {
  if (e.status && e.status !== 'draft' && e.status !== 'accepted') {
    return ` <small style="color:var(--c-muted);">(${escapeHtml(e.status)})</small>`;
  }
  return '';
}

function row(e: RankedNode): string {
  const spec = `<a href="./specs/${escapeHtml(e.specId)}/spec.html">${escapeHtml(e.specId)}</a>`;
  const diverge = e.diverges
    ? ' <abbr title="RICE and WSJF disagree on this spec’s rank — dependency leverage matters here" style="color:var(--c-salmon,#e1624f);font-weight:700;">⚠ WSJF</abbr>'
    : '';
  return `    <tr data-tag="${e.tag}">
      <td>${e.rank}</td>
      <td>${spec}${statusNote(e)}</td>
      <td><spec-pill>${TAG_LABEL[e.tag]}</spec-pill></td>
      <td style="text-align:right;">${num(e.value)}</td>
      <td style="text-align:right;">${num(e.subtreeValue)}</td>
      <td style="text-align:right;">${num(e.wsjf, 2)}${diverge}</td>
      <td>${e.unblocks.map((u) => escapeHtml(u)).join(', ')}</td>
    </tr>`;
}

function danglingSection(ordering: Ordering): string {
  if (ordering.dangling.length === 0) return '';
  const items = ordering.dangling
    .map(
      (d) =>
        `    <li><code>${escapeHtml(d.from)}</code> → <code>${escapeHtml(d.ref)}</code> <small>(${d.kind}, target not in corpus)</small></li>`,
    )
    .join('\n');
  return `
<section id="dangling">
<h2>3 · Dangling references</h2>
<p>Links whose target spec isn't in the corpus — reported, not crashed on (FR-010).</p>
<ul>
${items}
</ul>
</section>
`;
}

/**
 * Assemble the self-contained roadmap.html (FR-007). Deterministic — no
 * timestamp — so an unchanged corpus regenerates byte-identically (SC-005).
 * `assetsPrefix` adapts the asset links to where the file is written (root ⇒
 * `./assets`; a spec dir or tests/fixtures ⇒ `../../assets`).
 */
export function renderRoadmapHtml(ordering: Ordering, opts: { assetsPrefix?: string } = {}): string {
  const assets = opts.assetsPrefix ?? './assets';
  const rows = ordering.entries.map(row).join('\n');
  const unranked = ordering.entries.filter((e) => e.tag === 'unranked').length;
  const total = ordering.entries.length;
  const unrankedNote =
    unranked > 0
      ? `<spec-note><p>${unranked} of ${total} specs carry no <code>&lt;spec-rice&gt;</code> and are <em>unranked</em> — placed by dependency, after ranked ready peers, never dropped (FR-006).</p></spec-note>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; object-src 'none'; base-uri 'none'">
<title>Roadmap · dependency-respecting value order</title>
<link rel="stylesheet" href="${assets}/spec.css">
<link rel="icon" type="image/svg+xml" href="${assets}/favicon.svg">
<script src="${assets}/theme-boot.js"></script>
</head>
<body>
<main>

<header>
  <p class="small-caps">Roadmap · derived view</p>
  <h1>Order by dependency-respecting value</h1>
  <p style="font-family:var(--font-serif);font-size:1.25rem;font-weight:300;color:var(--c-text-soft);font-style:italic;max-width:var(--measure);">
    The spec corpus, ordered so nothing precedes a spec it depends on, ties broken by RICE value, and cheap foundations lifted by the value they unblock. A derived view — regenerate with <code>spectastic order</code>; do not hand-edit.
  </p>

  <spec-note>
    <p>Edges are inferred from reciprocated <code>defer-to</code> ↔ <code>&lt;spec-parent&gt;</code> pairs only. Specs with no such edge order purely by value — that's expected, not a bug (plan R-1).</p>
  </spec-note>
  ${unrankedNote}
</header>


<section id="order">
<h2>1 · Build order</h2>
<table>
  <thead><tr><th>#</th><th>Spec</th><th>Tag</th><th style="text-align:right;">RICE</th><th style="text-align:right;">Unblocks Σ</th><th style="text-align:right;">WSJF</th><th>Unblocks</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</section>


<section id="legend">
<h2>2 · Reading this</h2>
<dl>
  <dt><spec-pill>ranked</spec-pill></dt><dd>Has a RICE value; unblocks nothing further.</dd>
  <dt><spec-pill>elevated</spec-pill></dt><dd>Lifted above its own RICE by the value of the subtree it unblocks (FR-004).</dd>
  <dt><spec-pill>unranked</spec-pill></dt><dd>No <code>&lt;spec-rice&gt;</code> — ordered by dependency only (FR-006).</dd>
  <dt><abbr title="WSJF divergence">⚠ WSJF</abbr></dt><dd>RICE and the leverage-adjusted WSJF disagree on this spec's rank (FR-008).</dd>
</dl>
</section>
${danglingSection(ordering)}

<footer style="margin-top:var(--s-8);padding-top:var(--s-5);border-top:1px solid var(--c-border-soft);font-family:var(--font-sans);font-size:0.78rem;color:var(--c-muted);">
  Roadmap · derived view · regenerate with <code>spectastic order</code> ·
  <button data-theme-toggle style="background:none;border:none;color:var(--c-link);cursor:pointer;font:inherit;padding:0;border-bottom:1px solid currentColor;">light/dark</button>
</footer>

</main>
<script src="${assets}/spec.js"></script>
</body>
</html>
`;
}

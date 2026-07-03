/**
 * Fixtures for the kernel principles-apply path (spec 030-kernel-principles-apply).
 * A minimal principles.html (v1.0.0, P-1..P-2) and a proposal adding P-3, carrying
 * a <spec-principles-apply> block. Kept structurally faithful to the real
 * principles.html (bare <h3 id="P-N"> + <p>, version in pill/meta/footer, a styled
 * tagline, a <spec-tldr>) so the substitution transforms are exercised for real.
 */

export const PRINCIPLES_LIVE = `<!doctype html>
<html lang="en">
<head><title>Principles</title></head>
<body>
<main>
<header>
  <p class="small-caps">Principles · v1.0.0</p>
  <h1>Fixture</h1>
  <p style="font-family:var(--font-serif);font-size:1.25rem;font-weight:300;">
    Two principles that bind the fixture.
  </p>
  <spec-meta>
    <b>Status</b>      <span><spec-status value="accepted">Accepted</spec-status></span>
    <b>Version</b>     <span>1.0.0</span>
    <b>Ratified</b>    <span><time datetime="2026-01-01">1 Jan 2026</time></span>
    <b>Last amended</b><span><time datetime="2026-01-01">1 Jan 2026</time></span>
  </spec-meta>
  <spec-tldr>
    <p>The fixture rests on two principles.</p>
  </spec-tldr>
</header>

<section id="core-principles">
<h2>Core principles</h2>
<h3 id="P-1">P-1 · First</h3>
<p>The first principle.</p>

<h3 id="P-2">P-2 · Second</h3>
<p>The second principle.</p>
</section>

<section id="changelog">
<h2>Change log</h2>
<spec-changelog>
<ol>
  <li><time datetime="2026-01-01">1 Jan 2026</time><span>Ratified. v1.0.0.</span></li>
</ol>
</spec-changelog>
</section>

<footer>Principles v1.0.0 · ratified 1 Jan 2026 · amended 1 Jan 2026 ·</footer>
</main>
</body>
</html>`;

/** A proposal adding P-3, with a valid <spec-principles-apply> block declaring from=1.0.0 to=1.1.0. */
export const PRINCIPLES_PROPOSAL = `<!doctype html>
<html lang="en">
<body>
<spec-change id="2026-07-02-add-p3" status="approved">
<spec-meta>
  <b>Status</b> <span><spec-status value="accepted">Approved</spec-status></span>
</spec-meta>

<spec-principles-apply>
  <version from="1.0.0">1.1.0</version>
  <tagline>Three principles that bind the fixture.</tagline>
  <tldr><p>The fixture now rests on three principles.</p></tldr>
</spec-principles-apply>

<section id="deltas">
<spec-delta op="added" target="P-3">
  <spec-requirement id="P-3" priority="must">
    <h3>P-3 · Third</h3>
    <p>The third principle.</p>
  </spec-requirement>
</spec-delta>
</section>

<section id="changelog">
<spec-changelog><ol>
  <li><time datetime="2026-07-02">2 Jul 2026</time><span>Proposal authored.</span></li>
</ol></spec-changelog>
</section>
</spec-change>
</body>
</html>`;

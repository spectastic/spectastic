import { readFileSync } from 'node:fs';
import { parseConfigText } from '@spectastic/schema/config';
import { join } from 'node:path';
import type { Finding, ParsedDocument } from '@spectastic/schema';
import type { Command } from 'commander';

interface ValidateOptions {
  format: string;
  ignore?: string[];
}

/**
 * Scan `explorations/<id>/quarantine.json` markers and emit an error finding for
 * every quarantined exploration (spec 022-explore, FR-005 / D-003). This is the
 * anti-ship merge gate: it runs on EVERY validate invocation regardless of the
 * path args, so an un-graduated exploration cannot pass `validate` and therefore
 * cannot merge (SC-002). The marker is JSON, so this lives here rather than in
 * the HTML-bound schema rule registry (plan §9).
 */
async function scanQuarantineMarkers(_cwd: string): Promise<Finding[]> {
  const [{ expandGlobs }, { quarantineFinding }, { readFile }] = await Promise.all([
    import('../glob.js'),
    import('@spectastic/core/commands/explore'),
    import('node:fs/promises'),
  ]);
  const markers = await expandGlobs(['explorations/*/quarantine.json']);
  const findings: Finding[] = [];
  for (const file of markers) {
    let marker: { id?: string; status?: string };
    try {
      marker = JSON.parse(await readFile(file, 'utf8')) as {
        id?: string;
        status?: string;
      };
    } catch {
      // A present-but-unreadable marker still signals a live exploration.
      marker = { status: 'quarantined' };
    }
    const finding = quarantineFinding(marker, file);
    if (finding) findings.push(finding);
  }
  return findings;
}

/**
 * Scan the project's own command definitions (`commands/spectastic.*.md`) for the
 * structured skill-invocation metadata REQ-TOOL-004 (spec 000-spectastic) requires:
 * `triggers`, `use-when`, `sibling-boundary`. Warning findings, folded into every
 * validate run like the quarantine scan — a frontmatter/markdown check that can't
 * live in the HTML-bound schema rule registry. In a consumer project (no `commands/`
 * sources) the glob matches nothing, so it's a no-op there.
 */
async function scanSkillMetadata(): Promise<Finding[]> {
  const [{ expandGlobs }, { skillMetadataFinding }, { readFile }] = await Promise.all([
    import('../glob.js'),
    import('@spectastic/core/commands/validate'),
    import('node:fs/promises'),
  ]);
  const commandFiles = await expandGlobs(['commands/spectastic.*.md']);
  const findings: Finding[] = [];
  for (const file of commandFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue; // an unreadable command file has nothing to shape-check
    }
    const finding = skillMetadataFinding(content, file);
    if (finding) findings.push(finding);
  }
  return findings;
}

/**
 * Scan the project's command frontmatter for a well-formed `model:` key that
 * agrees with the core policy map (spec 044-verb-model-policy, FR-009 drift-guard).
 * Error findings — the enforcement half of REQ-TOOL-004's optional-key permission —
 * folded into every validate run like the skill-metadata scan. A no-op in a
 * consumer project (no `commands/` sources).
 */
async function scanVerbModelPolicy(): Promise<Finding[]> {
  const [{ expandGlobs }, { verbModelPolicyFinding }, { readFile }] = await Promise.all([
    import('../glob.js'),
    import('@spectastic/core/commands/validate'),
    import('node:fs/promises'),
  ]);
  const commandFiles = await expandGlobs(['commands/spectastic.*.md']);
  const findings: Finding[] = [];
  for (const file of commandFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue; // an unreadable command file has no model: to check
    }
    const finding = verbModelPolicyFinding(content, file);
    if (finding) findings.push(finding);
  }
  return findings;
}

/**
 * Scan init-tools-managed command adapters for drift (spec 031, FR-007 / D-001).
 * When `.claude/commands` is managed (the marker is present), every source
 * `commands/spectastic.*.md` must match its installed adapter byte-for-byte; a
 * missing or divergent adapter is an error, so the pre-commit gate blocks a
 * stale-adapter commit. A no-op in an unmanaged project (no marker) — a project
 * that never ran `init --tools --commands-only` is never judged.
 */
async function scanCommandsDrift(cwd: string): Promise<Finding[]> {
  const [{ commandsDriftFinding }, { adaptersManaged, driftPairs }, { readFile }] = await Promise.all([
    import('@spectastic/core/commands/validate'),
    import('./init/adapters.js'),
    import('node:fs/promises'),
  ]);
  if (!adaptersManaged(cwd)) return [];
  const findings: Finding[] = [];
  for (const pair of driftPairs(cwd)) {
    let source: string;
    try {
      source = await readFile(pair.source, 'utf8');
    } catch {
      continue; // an unreadable source has nothing to compare against
    }
    let adapter: string | null = null;
    try {
      adapter = await readFile(pair.adapter, 'utf8');
    } catch {
      adapter = null; // missing adapter = drift
    }
    const finding = commandsDriftFinding(source, adapter, pair.rel);
    if (finding) findings.push(finding);
  }
  return findings;
}

/**
 * Scan spectastic's own CLI command sources for user-facing help copy that leaks
 * an internal artifact id (P-10, `no-internal-id-in-copy`). Error findings, folded
 * into every validate run like the other source scans — the P-8 guarantee for the
 * copy invariant, scoped to what spectastic can see (its `.description`/`.option`
 * help strings). A no-op in a consumer project, where `packages/cli/src` is absent.
 */
async function scanCopyLeak(): Promise<Finding[]> {
  const [{ expandGlobs }, { copyLeakFindings }, { readFile }] = await Promise.all([
    import('../glob.js'),
    import('@spectastic/core/commands/validate'),
    import('node:fs/promises'),
  ]);
  const sources = await expandGlobs(['packages/cli/src/**/*.ts'], ['**/*.test.ts']);
  const findings: Finding[] = [];
  for (const file of sources) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue; // an unreadable source has no copy to scan
    }
    findings.push(...copyLeakFindings(content, file));
  }
  return findings;
}

/**
 * Scan the project's `spectastic.json` enforcement waivers for well-formedness
 * (spec 042, FR-013). Error findings — the loud half of the two-guard design (the
 * `enforce` runtime is the fail-closed half). Resolves the project's profile floor
 * from the `.spectastic/profile.json` marker so it can flag a dead or un-relaxable
 * waiver; falls back to structural checks (valid category, reason, owner, expiry)
 * when there's no marker. A no-op when there are no waivers.
 */
/**
 * Report a configuration key the tool does not recognise (spec 087, FR-005).
 *
 * Folded in beside the other non-HTML scans. Warning severity is deliberate
 * (087 D-003): a typo and a key belonging to a newer version of the tool are
 * the same observation here, and failing a build for a colleague on a later
 * release would be worse than the silence this closes.
 */
async function scanUnknownConfigKeys(cwd: string): Promise<Finding[]> {
  const { unknownKeyFindings, readConfigFile } = await import('@spectastic/schema/config');
  const file = readConfigFile(cwd);
  if (Object.keys(file).length === 0) return [];

  return unknownKeyFindings(file).map((f) => ({
    file: 'spectastic.json',
    line: 1,
    column: 1,
    rule: 'config-unknown-key',
    severity: 'warning' as const,
    message: f.message,
    fixHint:
      f.suggestion !== undefined
        ? `Rename it to "${f.suggestion}", or remove it if it was not meant to be there.`
        : 'Remove it, or check the published schema for the key you meant.',
  }));
}

async function scanEnforceWaivers(cwd: string): Promise<Finding[]> {
  const [
    { enforceWaiverFindings },
    { readRawWaivers },
    { ALL_CATEGORIES },
    { readMarker },
    { loadProfiles },
    { resolveBundle },
  ] = await Promise.all([
    import('@spectastic/core/commands/validate'),
    import('@spectastic/core/enforce/config'),
    import('@spectastic/core/enforce/detect'),
    import('./init/marker.js'),
    import('./init/profiles.js'),
    import('./init/bundle.js'),
  ]);
  const waivers = readRawWaivers(cwd);
  if (waivers.length === 0) return [];

  const marker = readMarker(cwd);
  const profile = marker ? loadProfiles(resolveBundle().root).profiles[marker.profile] : undefined;
  const required = profile ? profile.enforce.required : ALL_CATEGORIES;
  const unwaivable = profile ? profile.enforce.unwaivable : [];
  return enforceWaiverFindings(
    waivers,
    { required, unwaivable, validCategories: ALL_CATEGORIES, now: new Date() },
    'spectastic.json',
  );
}

/**
 * Read the config-declared quantified-NFR convention floor (068-enterprise-
 * enforce-floor FR-009, plan D-003) from `<cwd>/spectastic.json`'s
 * `validate.quantifiedNfrFloor`. Fail-safe to `undefined` on an
 * absent/unreadable/malformed file or a non-number value — mirrors
 * `readRawWaivers`'s own fail-safe shape (`enforce/config.ts`); an
 * unparseable floor leaves the gate's pre-068 behavior unchanged (every
 * gated-tier spec checked) rather than silently exempting everything.
 */
function readQuantifiedNfrFloor(cwd: string): number | undefined {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, 'spectastic.json'), 'utf8');
  } catch {
    return undefined;
  }
  let parsed: unknown;
  // Parsed through the canonical module (086 FR-004).
  parsed = parseConfigText(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const section = (parsed as Record<string, unknown>).validate;
  if (section === null || typeof section !== 'object' || Array.isArray(section)) return undefined;
  const floor = (section as Record<string, unknown>).quantifiedNfrFloor;
  return typeof floor === 'number' && Number.isFinite(floor) ? floor : undefined;
}

/**
 * The "verified NFRs are quantified" gate (spec 047-slo-nfr-artifact, FR-004).
 * Resolves the project's tier from the `.spectastic/profile.json` marker (mirrors
 * `scanEnforceWaivers`), then re-reads the validated files to check each `NFR-*`
 * requirement.
 *
 * Short-circuits *before* the file re-read when the gate can't fire (no marker,
 * or a tier below verified): a project with no profile pays no extra I/O on
 * validate, so the double-read cost lands only where the gate is actually active
 * (the perf floor the `validate-full-project` bench guards).
 */
async function scanQuantifiedNfr(docs: ReadonlyMap<string, CachedDoc>, cwd: string): Promise<Finding[]> {
  if (docs.size === 0) return [];
  const [{ quantifiedNfrFindings, isQuantifiedNfrGatedTier }, { readMarker }] = await Promise.all([
    import('@spectastic/core/commands/validate'),
    import('./init/marker.js'),
  ]);
  const marker = readMarker(cwd);
  if (!isQuantifiedNfrGatedTier(marker?.profile)) return [];

  const floor = readQuantifiedNfrFloor(cwd);
  return quantifiedNfrFindings([...docs.values()], {
    tier: marker?.profile,
    ...(floor !== undefined ? { floor } : {}),
  });
}

/**
 * One read and one parse per file, for the whole validate run.
 *
 * A validate run is not one pass over the corpus — it is the rule engine plus a
 * dozen filesystem-facing scans, and each of them used to read and parse the
 * same files independently. Instrumented on this repository that came to
 * **1489 parse() calls for 379 files**: 24.1MB of parsing over a 10.7MB corpus,
 * most files parsed four times and every contract-bearing design six.
 *
 * Sharing a parsed document between them is safe because nothing mutates one —
 * every rule and scan reads `tagName`, `attrs`, `childNodes` and location, and
 * accumulates into its own arrays. Peak memory is unchanged: `validateMany`
 * already held every document at once, so this holds the same set rather than
 * an additional one.
 *
 * The parse function is injected so a test can count calls without reaching for
 * global state.
 */
export interface CachedDoc {
  file: string;
  html: string;
  parsed: ParsedDocument;
}

export async function buildDocCache(
  files: readonly string[],
  deps?: { readFile?: (f: string) => Promise<string>; parse?: (html: string, file: string) => ParsedDocument },
): Promise<Map<string, CachedDoc>> {
  const [{ parse: defaultParse }, { readFile: defaultRead }] = await Promise.all([
    import('@spectastic/schema/parser'),
    import('node:fs/promises'),
  ]);
  const read = deps?.readFile ?? ((f: string) => defaultRead(f, 'utf8') as Promise<string>);
  const parseFn = deps?.parse ?? defaultParse;

  const cache = new Map<string, CachedDoc>();
  await Promise.all(
    files.map(async (file) => {
      // A file that cannot be read is simply absent from the cache; the scans
      // already skip what they cannot open, and validateCommand reports the
      // read failure itself with a usage exit code.
      try {
        const html = await read(file);
        cache.set(file, { file, html, parsed: parseFn(html, file) });
      } catch {
        /* left out of the cache */
      }
    }),
  );
  return cache;
}

/**
 * The contract-resolve gate (spec 070-contract-sidecar-convention, FR-004):
 * a design declaring a contract path that resolves to no readable file, or
 * one escaping the project directory, or one resolving inside specs/ (never
 * an effective declaration), is an error. Shaped like `scanQuantifiedNfr` —
 * reads from the run's document cache, since the check needs the
 * filesystem the schema engine's pure-AST rules cannot touch.
 */
/**
 * The dropped-conformance scan (003 T-1005). A MODIFY delta's post-state is
 * retyped rather than edited, so an obligation not consciously carried is
 * silently gone — three proposals shipped that way in one session.
 *
 * Cross-file by necessity: it compares a proposal against the live spec it
 * targets, and the schema engine hands a rule one file. Cheap by construction —
 * only unarchived proposals are read, and only those carrying a MODIFY.
 */
async function scanDroppedConformance(cwd: string): Promise<Finding[]> {
  const [{ mustDropFindings, rationaleDropFindings }, { readFile }, { expandGlobs }] = await Promise.all([
    import('@spectastic/core/change/must-drop'),
    import('node:fs/promises'),
    import('../glob.js'),
  ]);
  // Live proposals only. An archived one records a decision already taken, and
  // re-litigating it would report findings nobody can act on.
  const proposals = await expandGlobs(['specs/*/changes/*/proposal.html']);
  const out: Finding[] = [];
  for (const abs of proposals) {
    const rel = abs.startsWith(`${cwd}/`) ? abs.slice(cwd.length + 1) : abs;
    const specId = rel.split('/')[1];
    if (specId === undefined) continue;
    let proposalHtml: string;
    let specHtml: string;
    try {
      proposalHtml = await readFile(abs, 'utf8');
      if (!proposalHtml.includes('op="modified"')) continue;
      specHtml = await readFile(`${cwd}/specs/${specId}/spec.html`, 'utf8');
    } catch {
      continue; // a principles proposal or an unreadable pair — not this scan's business
    }
    const args = { proposalHtml, proposalFile: rel, specHtml };
    // Two losses, reported separately: a dropped obligation, and a dropped
    // argument. The second is invisible to the first by construction — an apply
    // replaces the whole element including <details>, and rationale carries no
    // conformance keyword to count.
    out.push(...mustDropFindings(args), ...rationaleDropFindings(args));
  }
  return out;
}

async function scanContractResolve(docs: ReadonlyMap<string, CachedDoc>, cwd: string): Promise<Finding[]> {
  if (docs.size === 0) return [];
  const [{ contractResolveFindings }, { readContractDeclarations }, { nodeFs }] = await Promise.all([
    import('@spectastic/core/commands/validate'),
    import('@spectastic/schema/contract'),
    import('@spectastic/core/providers/node-fs'),
  ]);

  const perFile = await Promise.all(
    [...docs.values()].map(async ({ file, html, parsed }) => {
      // The substring prefilter still earns its keep: it skips the findAll walk
      // as well as the parse, and most documents carry no declaration at all.
      if (!html.includes('<spec-contract')) return [];
      const declarations = readContractDeclarations(parsed, file);
      if (declarations.length === 0) return [];
      return contractResolveFindings(declarations, file, nodeFs, cwd);
    }),
  );
  return perFile.flat();
}

/**
 * The visual-resolve gate (spec 093-design-visual-section, FR-010): a design
 * declaring a token-set or screens path that resolves to nothing, or one
 * escaping the project directory, is an error. Shaped exactly like
 * scanContractResolve above — a declaration-less document (every design in
 * the estate today) costs one read and returns immediately.
 */
async function scanVisualResolve(docs: ReadonlyMap<string, CachedDoc>, cwd: string): Promise<Finding[]> {
  if (docs.size === 0) return [];
  const [
    { visualResolveFindings, visualLocationFindings },
    { visualCoverageFindings },
    { visualScreenNamingFindings },
    { readVisualDeclarations },
    { nodeFs },
  ] = await Promise.all([
    import('@spectastic/core/commands/validate'),
    import('@spectastic/core/visual/coverage'),
    import('@spectastic/core/visual/screen-naming'),
    import('@spectastic/schema/visual'),
    import('@spectastic/core/providers/node-fs'),
  ]);

  const perFile = await Promise.all(
    [...docs.values()].map(async ({ file, html, parsed }) => {
      // The substring prefilter still earns its keep: it skips the findAll walk
      // as well, and the overwhelming majority of documents carry no declaration.
      if (!html.includes('<spec-visual')) return [];
      const declarations = readVisualDeclarations(parsed, file);
      if (declarations.length === 0) return [];
      // 094 FR-001/FR-002 rides along with the same read: resolving proves the
      // path exists, this proves it is in the right place. Costs no extra I/O.
      // 093 FR-013 rides along too: a coverage claim needs the grid it names,
      // which is a second file — so it cannot be a schema rule and lands here
      // beside the other two cross-file checks. Claims are rare, so the work is
      // gated on one being present rather than paid per declaration.
      const claims = declarations
        .filter((d) => d.contexts !== undefined && d.variants !== undefined)
        .map((d) => ({
          contexts: d.contexts as string,
          variants: d.variants as string,
          line: d.line,
          column: d.column,
        }));
      // 099 FR-004/FR-005 ride the same read: the view is in this document and
      // the screens it projects are one stat away, which the resolve scan has
      // already paid for.
      // 093 FR-014 rides the same read too: the claim is in this document and
      // the material is the path the resolve above has already stat-ed. Gated on
      // shape="screens" — an explicit shape="none" is a legal FR-007 record and
      // must never fire, which is a test, not just this sentence.
      const naming = declarations
        .filter((d) => d.shape === 'screens' && d.screens !== undefined)
        .map((d) => ({
          screens: d.screens as string,
          addresses: d.addresses,
          line: d.line,
          column: d.column,
        }));
      const [{ visualViewDriftFindings, visualViewMissingFindings }] = await Promise.all([
        import('@spectastic/core/commands/validate'),
      ]);
      const [resolved, located, coverage, naming_, drift, missing] = [
        await visualResolveFindings(declarations, file, nodeFs, cwd),
        visualLocationFindings(declarations, file),
        claims.length === 0 ? [] : await visualCoverageFindings(claims, file, nodeFs, cwd),
        naming.length === 0 ? [] : await visualScreenNamingFindings(naming, file, nodeFs, cwd),
        await visualViewDriftFindings(html, file, nodeFs, cwd),
        visualViewMissingFindings(html, file),
      ];
      return [...resolved, ...located, ...coverage, ...naming_, ...drift, ...missing];
    }),
  );
  return perFile.flat();
}

/**
 * The project-wide visual checks — the section gate (093 FR-002) and the
 * token-set disagreement (094 FR-004).
 *
 * Both need the same project pass, so they share one. `declaredVisualState`
 * walks every design once; computing it per file would re-read the whole estate
 * N times and is what NFR-001's "linear in declarations, not in files" excludes.
 */
async function scanVisualProject(docs: ReadonlyMap<string, CachedDoc>, cwd: string): Promise<Finding[]> {
  if (docs.size === 0) return [];
  const [{ visualSectionGatedFindings, visualDisagreementFindings }, { declaredVisualState }, { detectUserInterface }] =
    await Promise.all([
      import('@spectastic/core/commands/validate'),
      import('@spectastic/core/visual/read'),
      import('@spectastic/core/enforce/detect'),
    ]);

  const state = declaredVisualState(cwd);
  const findings: Finding[] = [];

  // FR-004 — one design system, one token set. Attributed to the project's own
  // config file rather than to an arbitrary design, since no single design is
  // at fault for a disagreement between two.
  findings.push(...visualDisagreementFindings(state, 'spectastic.json'));

  // 093 FR-002 — absence, not emptiness. A project that HAS a surface can never
  // produce a finding here, so skip the reads entirely.
  const projectHasSurface = detectUserInterface(cwd).detected || (state !== null && !state.declaresNoSurface);
  if (projectHasSurface) return findings;

  const perFile = [...docs.values()].map(({ file, html, parsed }) => {
    // Cheap prefilter: most documents mention neither.
    if (!html.includes('id="visual"') && !html.includes('<spec-visual')) return [];
    return visualSectionGatedFindings(parsed, file, projectHasSurface);
  });
  return [...findings, ...perFile.flat()];
}

/**
 * Fold contractViewDriftFindings() into validate (072-contract-embedded-view,
 * T-211): a materialised <spec-contract-view> that no longer matches the
 * contract file it projects, is an error. Shaped exactly like
 * scanContractResolve above — re-reads the files already being validated.
 */
async function scanContractViewDrift(docs: ReadonlyMap<string, CachedDoc>, cwd: string): Promise<Finding[]> {
  if (docs.size === 0) return [];
  const [{ contractViewDriftFindings }, { readContractDeclarations }, { nodeFs }] = await Promise.all([
    import('@spectastic/core/commands/validate'),
    import('@spectastic/schema/contract'),
    import('@spectastic/core/providers/node-fs'),
  ]);

  const perFile = await Promise.all(
    [...docs.values()].map(async ({ file, html, parsed }) => {
      if (!html.includes('<spec-contract')) return [];
      const declarations = readContractDeclarations(parsed, file);
      if (declarations.length === 0) return [];
      return contractViewDriftFindings(declarations, file, nodeFs, cwd);
    }),
  );
  return perFile.flat();
}

/**
 * Register the `validate` subcommand. Implements FR-001, FR-002, FR-014
 * of specs/002-validate-cli/spec.html.
 *
 * Heavy dependencies (parse5 via @spectastic/schema, tinyglobby) are
 * dynamically imported inside the action so that other subcommands —
 * notably `init` — don't pay the cold-start cost on every invocation.
 * Keeps init under its <500 ms NFR.
 */
/**
 * The corpus-well-formed gate (051-knowledge-corpus, plan D-003 corrected):
 * a corpus document missing a required provenance field, an index row with
 * no matching document, an orphan document with no index row, or two
 * documents sharing one KB-NNN id, is an error. Folded into every validate
 * run like the other non-HTML scans (scanEnforceWaivers, scanCopyLeak) — the
 * corpus lives in plain markdown, never in the HTML-bound schema-rule
 * registry. A no-op when no `knowledge/` directory exists (NFR-001 —
 * graceful absence holds all the way through to this scan).
 */
async function scanCorpusWellFormed(cwd: string): Promise<Finding[]> {
  const { loadCorpus, corpusWellFormedFindings } = await import('@spectastic/corpus');
  const packs = loadCorpus(cwd);
  if (packs.length === 0) return [];
  return corpusWellFormedFindings(packs);
}

/**
 * The root-registry gate (061-corpus-ingester, FR-003/FR-007): a hand-edited
 * duplicate `KB-NNNN` errors; an orphaned reference warns. Gated on the
 * registry itself (`loadRegistry`), not on `loadCorpus`'s pack list — the
 * registry's own well-formedness is a standalone concern from whether any
 * pack directory currently exists on disk. A no-op when no root
 * `knowledge/index.md` exists (or it has no rows), matching
 * scanCorpusWellFormed's graceful-absence shape.
 */
async function scanCorpusRegistry(cwd: string): Promise<Finding[]> {
  const { loadRegistry, corpusRegistryFindings } = await import('@spectastic/corpus');
  const registry = loadRegistry(cwd);
  if (registry.length === 0) return [];
  return corpusRegistryFindings(registry);
}

/**
 * The project-identity gate (067-spec-project-identity FR-007): a malformed
 * `project` errors, a bare unqualified default (collision-prone) warns, and
 * an absent or well-formed owner-qualified value is silent. A general
 * spectastic.json health check — not corpus-intrinsic (it has no dependency
 * on a `knowledge/` corpus existing), so unlike `scanCorpusRegistry` above it
 * is deliberately NOT mirrored onto the standalone `spectastic-corpus`
 * binary's own corpus-only validate (`packages/corpus/src/cli/validate.ts`,
 * whose docstring scopes it to "properties of the corpus alone").
 */
async function scanProjectIdentity(cwd: string): Promise<Finding[]> {
  const { projectIdentityFindings } = await import('@spectastic/corpus');
  return projectIdentityFindings(cwd);
}

/**
 * The marketplace-identity gate (078-federated-resource-uri FR-011): a
 * malformed resolved marketplace errors, a bare unqualified one (including
 * the directory-name default — a marketplace is never truly absent) warns,
 * and a well-formed owner-qualified one is silent. Sibling to
 * `scanProjectIdentity` one axis over, and — unlike it — also mirrored onto
 * the standalone `spectastic-corpus validate` (`packages/corpus/src/cli/
 * validate.ts`), because a marketplace IS corpus-intrinsic (078 D-006).
 */
async function scanMarketplaceIdentity(cwd: string): Promise<Finding[]> {
  const { marketplaceIdentityFindings } = await import('@spectastic/corpus');
  return marketplaceIdentityFindings(cwd);
}

/**
 * The declared-unit-edge gate (spec 080-unit-edge-authoring, FR-007/FR-008): a
 * `consumes` entry that is not a well-formed coordinate, or that names this
 * project's own unit, is an error. A well-formed coordinate whose target is
 * merely absent is deliberately silent — most consumers do not have their
 * providers checked out, and 079 already reports that as an unverified edge.
 * A no-op when the project declares nothing, which is every project today.
 */
async function scanDeclaredEdges(cwd: string): Promise<Finding[]> {
  const { declaredEdgeFindings } = await import('@spectastic/core/units/findings');
  return declaredEdgeFindings(cwd);
}

/**
 * The corpus grounding gates (053-corpus-grounding-gates, plan D-001/D-002):
 * a <spec-decision> citation resolving to no committed document is an error
 * (corpus-provenance); one resolving to a retained superseded edition is a
 * warning (corpus-staleness). Reads no profile marker — the integrity gates
 * are tier-independent by construction (FR-004). A no-op when no
 * `knowledge/` directory exists, matching scanCorpusWellFormed's shape.
 *
 * Registry-first (2026-07-26-hybrid-corpus-citation, T-1001, FR-002 MODIFY):
 * the root `knowledge/index.md` registry (if any) is loaded and threaded
 * through to `corpusGroundingFindings`, so a citation resolves against it
 * on this enforcement path exactly as `resolveCitation`'s own tests already
 * cover — not just in isolation. `loadRegistry` returns `[]` when the file
 * doesn't exist, which is indistinguishable from "no registry" to the gate
 * (empty array), so a pre-migration project sees no behaviour change.
 */
async function scanCorpusGrounding(docs: ReadonlyMap<string, CachedDoc>, cwd: string): Promise<Finding[]> {
  if (docs.size === 0) return [];
  const { loadCorpus, loadRegistry, corpusGroundingFindings } = await import('@spectastic/corpus');
  const packs = loadCorpus(cwd);
  if (packs.length === 0) return [];
  const registry = loadRegistry(cwd);

  return corpusGroundingFindings([...docs.values()], packs, registry);
}

/**
 * The corpus-license gate (058-corpus-licensing, plan D-001): a corpus
 * document declaring a restrictive, unrecognised, or placeholder (`TODO`)
 * license is a warning, so committing paywalled or vendored material is a
 * visible decision, not a silent one (FR-002). The missing-license case
 * stays scanCorpusWellFormed's error (051, plan D-002) — this scan never
 * re-checks it. A no-op when no `knowledge/` directory exists, matching
 * scanCorpusWellFormed/scanCorpusGrounding's shape.
 */
async function scanCorpusLicense(cwd: string): Promise<Finding[]> {
  const { loadCorpus, corpusLicenseFindings } = await import('@spectastic/corpus');
  const packs = loadCorpus(cwd);
  if (packs.length === 0) return [];
  return corpusLicenseFindings(packs);
}

/**
 * The portable-domain-skill agnosticism gate (057-portable-domain-skill,
 * plan D-001/D-002): a marketplace-listed pack embedding spectastic
 * vocabulary is a portability defect (error); one with no real SKILL.md
 * discovery description is undiscoverable (warning). Inspects ONLY packs a
 * `marketplace.json` declares distributable — spectastic's own dogfood and
 * scaffold packs are never listed, so they are never checked (the false
 * positive 052's SC-003 guard exists to avoid). A no-op when no
 * `marketplace.json` exists anywhere under `cwd`.
 */
async function scanPackAgnosticism(): Promise<Finding[]> {
  const { expandGlobs } = await import('../glob.js');
  const manifests = await expandGlobs(['**/marketplace.json']);
  if (manifests.length === 0) return [];
  const { packAgnosticismFindings } = await import('@spectastic/corpus');
  return manifests.flatMap((manifestPath) => packAgnosticismFindings(manifestPath));
}

export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate one or more spec-html files. Exits 0 on clean, 1 on findings, 2 on usage errors.')
    .argument('<paths...>', 'file paths or glob patterns')
    .option('-f, --format <fmt>', 'output format: human (default) | json | sarif', 'human')
    .option('-i, --ignore <patterns...>', 'additional glob patterns to exclude')
    .action(async (paths: string[], options: ValidateOptions) => {
      const [{ validateCommand }, { expandGlobs }, { humanFormatter }, { jsonFormatter }, { sarifFormatter }] =
        await Promise.all([
          import('@spectastic/core/commands/validate'),
          import('../glob.js'),
          import('../formatters/human.js'),
          import('../formatters/json.js'),
          import('../formatters/sarif.js'),
        ]);

      const files = await expandGlobs(paths, options.ignore);
      if (files.length === 0) {
        process.stderr.write('No files matched the given patterns.\n');
        process.exit(2);
      }

      // One read and one parse for the whole run. Every scan below reads from
      // this rather than opening the files again — see buildDocCache.
      const docCache = await buildDocCache(files);
      const result = await validateCommand({ files, docs: docCache }, { cwd: process.cwd() });

      if (result.exitCode === 2) {
        process.stderr.write(`${result.errorMessage ?? 'usage error'}\n`);
        process.exit(2);
      }

      // The explore anti-ship merge gate (022-explore, FR-005): always scan the
      // quarantine markers and fold their findings in, regardless of the path
      // args, so an un-graduated exploration can never pass validate.
      const quarantineFindings = await scanQuarantineMarkers(process.cwd());
      // The skill-metadata-shape rule (REQ-TOOL-004): warn on any command whose
      // frontmatter is missing the structured invocation keys. Warning-only, so it
      // never changes the exit code — advisory until the eval floor / hard gate land.
      const skillMetadataFindings = await scanSkillMetadata();
      // The commands-drift gate (spec 031, FR-007): a managed adapter that has
      // drifted from source is an error, so the pre-commit gate blocks it.
      const commandsDriftFindings = await scanCommandsDrift(process.cwd());
      // The verb-model-policy drift-guard (spec 044, FR-009): a command whose
      // optional model: key is not a legal alias or disagrees with the policy map
      // is an error — the enforcement REQ-TOOL-004 delegates for the permitted key.
      const verbModelPolicyFindings = await scanVerbModelPolicy();
      // The no-internal-id-in-copy gate (P-10): a CLI help string that leaks an
      // internal artifact id (spec number/slug, REQ-*, FR-*, …) is an error, so
      // the pre-commit gate blocks it. No-op outside the spectastic monorepo.
      const copyLeakFindings = await scanCopyLeak();
      // The enforce-waiver-well-formed gate (spec 042, FR-013): a malformed,
      // dead, un-relaxable, or silently-expired waiver in spectastic.json is an
      // error, so the pre-commit gate blocks it. No-op when no waivers declared.
      const enforceWaiverFindings = await scanEnforceWaivers(process.cwd());
      // The unknown-config-key scan (spec 087, FR-005): a misspelt key in
      // spectastic.json used to do nothing at all — no warning, no effect —
      // so a user believed they had overridden a default and had not. Warning
      // rather than error, because a key from a newer version of the tool is
      // indistinguishable from a typo here. No-op with no configuration.
      const unknownConfigKeyFindings = await scanUnknownConfigKeys(process.cwd());
      // The quantified-NFR gate (spec 047, FR-004): at verified/enterprise, an
      // NFR with no measurable target and no linked <spec-slo> is an error, so
      // the pre-commit gate blocks a vague reliability promise. No-op below
      // verified and with no profile marker.
      const quantifiedNfrScanFindings = await scanQuantifiedNfr(docCache, process.cwd());
      // The corpus-well-formed gate (spec 051): a dangling index row, an
      // orphan document, a missing provenance field, or a duplicate KB-NNN
      // id is an error. No-op with no knowledge/ directory in the project.
      const corpusWellFormedScanFindings = await scanCorpusWellFormed(process.cwd());
      // The root-registry gate (spec 061): a hand-edited duplicate KB-NNNN
      // errors; an orphaned reference warns. No-op with no root registry.
      const corpusRegistryScanFindings = await scanCorpusRegistry(process.cwd());
      // The corpus grounding gates (spec 053): a <spec-decision> citation
      // resolving to no committed document errors; one resolving to a
      // superseded edition warns. Tier-independent; no-op with no corpus.
      const corpusGroundingScanFindings = await scanCorpusGrounding(docCache, process.cwd());
      // The corpus-license gate (spec 058): a restrictive, unrecognised, or
      // placeholder declared license warns. No-op with no knowledge/ directory.
      const corpusLicenseScanFindings = await scanCorpusLicense(process.cwd());
      // The portable-domain-skill agnosticism gate (spec 057): a
      // marketplace-listed pack embedding spectastic vocabulary errors; one
      // with no real discovery description warns. No-op with no
      // marketplace.json anywhere in the project.
      const packAgnosticismScanFindings = await scanPackAgnosticism();
      // The project-identity gate (spec 067): a malformed project id errors;
      // a bare unqualified default (no owner segment) warns; absent or
      // well-formed is silent. No-op-safe — reads spectastic.json only.
      const projectIdentityScanFindings = await scanProjectIdentity(process.cwd());
      // The marketplace-identity gate (spec 078): a malformed resolved
      // marketplace errors; a bare unqualified one (incl. the directory-name
      // default) warns; a well-formed owner-qualified one is silent.
      // Corpus-intrinsic — also mirrored onto the standalone corpus binary.
      const marketplaceIdentityScanFindings = await scanMarketplaceIdentity(process.cwd());
      const declaredEdgeScanFindings = await scanDeclaredEdges(process.cwd());
      // The contract-resolve gate (spec 070): a declared contract path that
      // resolves to no readable file, escapes the project, or resolves inside
      // specs/, is an error. No-op-cheap: returns [] on any file with no
      // <spec-contract> declarations, which is every design in the estate today.
      const contractResolveScanFindings = await scanContractResolve(docCache, process.cwd());
      const droppedConformanceFindings = await scanDroppedConformance(process.cwd());
      // The contract-view-drift gate (spec 072): a materialised
      // <spec-contract-view> that no longer matches the file it projects is
      // an error. No-op-cheap: [] on any file with no declarations at all,
      // and a declaration without a view is skipped too — every design in
      // the estate today.
      const contractViewDriftScanFindings = await scanContractViewDrift(docCache, process.cwd());
      // The visual-resolve gate (spec 093): a declared token-set or screens
      // path that resolves to nothing is an error. Same shape, same cost
      // profile — a design carrying no <spec-visual> returns immediately.
      const visualResolveScanFindings = await scanVisualResolve(docCache, process.cwd());
      // The visual-section gate (spec 093): absence, not emptiness. A project
      // with an interface can produce no finding here, so this costs one
      // detection pass and returns.
      const visualGateScanFindings = await scanVisualProject(docCache, process.cwd());
      const findings = [
        ...result.findings,
        ...quarantineFindings,
        ...skillMetadataFindings,
        ...commandsDriftFindings,
        ...verbModelPolicyFindings,
        ...copyLeakFindings,
        ...enforceWaiverFindings,
        ...unknownConfigKeyFindings,
        ...quantifiedNfrScanFindings,
        ...corpusWellFormedScanFindings,
        ...corpusRegistryScanFindings,
        ...corpusGroundingScanFindings,
        ...corpusLicenseScanFindings,
        ...packAgnosticismScanFindings,
        ...projectIdentityScanFindings,
        ...marketplaceIdentityScanFindings,
        ...declaredEdgeScanFindings,
        ...contractResolveScanFindings,
        ...droppedConformanceFindings,
        ...contractViewDriftScanFindings,
        ...visualResolveScanFindings,
        ...visualGateScanFindings,
      ];
      const exitCode = findings.some((f) => f.severity === 'error') ? 1 : result.exitCode;

      let output: string;
      switch (options.format) {
        case 'human':
          output = humanFormatter(findings);
          break;
        case 'json':
          output = jsonFormatter(findings);
          break;
        case 'sarif':
          output = sarifFormatter(findings);
          break;
        default:
          process.stderr.write(`Unknown format "${options.format}". Use human | json | sarif.\n`);
          process.exit(2);
      }
      process.stdout.write(output);

      process.exit(exitCode);
    });
}

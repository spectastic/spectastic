/**
 * Governance-decision types (spec 112-guardrail-decision-record → Slice 2,
 * `TBD-guardrail-retrieval`). A `GovernanceDecision` is the machine-readable
 * projection of an extended `<spec-decision>` — enough for retrieval and, in a
 * later slice, the gates to operate on, parsed from the design.html that
 * authored it. The human Nygard prose is deliberately NOT carried here; only
 * the policy surface is.
 */

/** A design document as read from disk — the source that authors decisions and
 *  declares a plan's surface (spec 114). */
export interface DesignDoc {
  /** The spec id that owns this design (its directory under specs/). */
  specId: string;
  /** The design file path, for a Finding location. */
  file: string;
  /** The raw design.html. */
  html: string;
}

export type DecisionStatus = 'proposed' | 'accepted' | 'superseded' | 'retired';
export type DecisionPosture = 'warn' | 'block';

/** A single enforcement rule the decision points at (the detector half). */
export interface EnforcementRule {
  tool: string;
  id: string;
  /** How to invoke the ecosystem enforcer, when it is orchestrated (optional). */
  run?: string;
  /** Native content detector: a forbidden regex (spec 115). */
  pattern?: string;
  /** Native path detector: a forbidden-location glob (spec 115). */
  deny?: string;
  /** Where a content pattern IS allowed; defaults to the decision's scope (spec 115). */
  allowedIn?: string;
}

/** A decision's enforcement: named rules, or an explicit unenforceable-with-reason. */
export interface Enforcement {
  rules: EnforcementRule[];
  /** Present when the decision declares `<spec-none reason=…>` instead of rules. */
  none?: { reason: string };
}

/**
 * A data-resource scope (spec 119-decision-resource-scope). Where a `<spec-path>`
 * scope names a repo-relative location, a resource scope names the *store* a
 * decision governs — by a federation-unique `datastore` coordinate — and the
 * `owner` project that may write it. The verdict is owner-aware: the owner gets
 * the path rule against `allowedIn`; any other project's touch is a violation,
 * because the defect is ownership, not layering. `allowedIn` absent = fully
 * locked (even the owner has no sanctioned direct-write path).
 */
export interface ResourceScope {
  /** The `spectastic://<owner>/<project>/datastore/<name>` coordinate of the store. */
  coordinate: string;
  /** The owner-qualified project identity that may write the store. */
  owner: string;
  /** The owner-internal path where a direct write is sanctioned; absent = locked. */
  allowedIn?: string;
}

export interface GovernanceDecision {
  /** The decision id, e.g. `D-008` — unique within its spec. */
  id: string;
  /** The spec that authored it (its directory id under specs/). */
  specId: string;
  status?: DecisionStatus;
  posture?: DecisionPosture;
  /** Path globs this decision governs (the universal scope floor). */
  paths: string[];
  /** Optional ecosystem module/symbol selectors. */
  modules: string[];
  /** Optional data-resource scope — a store + its owner (spec 119). Absent = a pre-119 decision. */
  resource?: ResourceScope;
  /** Another decision id this one supersedes, if declared. */
  supersedes?: string;
  /** Optional review-by date (ISO), driving the coverage staleness warning. */
  reviewBy?: string;
  /** The teaching reason — lives once, here (FR-003). */
  reason?: string;
  enforcement?: Enforcement;
  /** The decision's <h4> title, e.g. "D-007 · ADR-0007 — …" (spec 118). */
  title?: string;
  /** The decision's Context/Decision/Consequences prose (spec 118). */
  prose?: string;
}

/** A violation joined to everything a reviewer needs to act (spec 118-verdict-explain). */
export interface ExplainedViolation {
  /** The underlying violation. */
  violation: Violation;
  /** The offending code shown in context, or a plain "not on disk" note. */
  offending: string;
  /** The governing decision's coordinate + where its record lives. */
  decisionCoordinate: string;
  decisionFile: string;
  /** The decision's title, reason, and Context/Decision/Consequences prose. */
  decisionTitle: string;
  decisionReason: string;
  decisionProse: string;
  /** Where the pattern is sanctioned — the rule's allowed-in, else the decision scope. */
  sanctionedPath: string;
}

/** A merge-stage violation: a changed location a detector flagged, joined to the
 *  decision that governs it (spec 115-guardrail-verdict). */
export interface Violation {
  decisionId: string;
  specId: string;
  ruleId: string;
  reason: string;
  file: string;
  line?: number;
  /** Best-effort source→target (FR-007): what did the offending thing, and to what. */
  source?: string;
  target?: string;
  /** Which detector produced it: native content/path, or an ingested enforcer. */
  detector: 'content' | 'path' | 'enforcer';
  /**
   * Why the touch was disallowed (spec 120): `path` (outside the sanctioned
   * location) or `ownership` (the current project is not the store's owner). Set
   * once, in the verdict — the only place the owner comparison happens. A pre-120
   * artifact with no `cause` is read as `path`.
   */
  cause: 'path' | 'ownership';
  /** For an `ownership` violation: the store's owner (project identity) — the authority. */
  owner?: string;
  /** For an `ownership` violation: the store's coordinate — the authority. */
  storeCoordinate?: string;
}

/** The persisted, reconstructable merge verdict (spec 115). */
/**
 * What the verdict evaluated against. `repo-local` — decisions were loaded
 * from this checkout only, and a change that violates a decision owned by
 * another repository is not something this verdict looked for.
 * `federated` — at least one declared source's vendored decision index was
 * also read and merged (spec 122); its resource-scoped decisions were
 * evaluated alongside the local ones, entirely from disk.
 */
export type VerdictScope = 'repo-local' | 'federated';

/**
 * One source as DECLARED in config (spec 122-decision-index-federation,
 * D-004) — the input side `verdictCommand` reads, distinct from
 * `DecisionSource` below (the output side, carrying the counts a merge
 * produces). `pin` is the content hash recorded by the last successful
 * `decisions sync`; its absence means "never synced" — the vendored copy is
 * still read and validated, just not pin-checked (FR-008 only fires a
 * mismatch when a pin exists to disagree with).
 */
export interface DeclaredDecisionSource {
  /** The owner's project identity, as declared. */
  project: string;
  /** Where the source's index is fetched from — a URL or a repo-relative path. */
  from: string;
  /** The vendored copy's content hash as of the last successful sync, if any. */
  pin?: string;
}

/**
 * One declared source's contribution to a federated verdict (spec
 * 122-decision-index-federation, FR-007). Always present when `scope` is
 * `'federated'`, one entry per declared source regardless of whether it was
 * evaluated.
 */
export interface DecisionSource {
  /** The owner's project identity, as declared. */
  project: string;
  /** Where the vendored copy was fetched from — a URL or a repo-relative path. */
  from: string;
  /** The vendored copy's content hash, when it was read and validated. */
  contentHash?: string;
  /** Resource-scoped foreign decisions evaluated against the change. */
  decisionsEvaluated: number;
  /** Foreign decisions with no resource scope — inert in this repository's tree. */
  decisionsIgnored: number;
  /** Foreign rules refused for exceeding the pattern cap or failing to compile. */
  decisionsRefused: number;
}

export interface Verdict {
  at: string;
  /** What this verdict evaluated against — repo-local today (see VerdictScope). */
  scope: VerdictScope;
  /** How many accepted decisions from this checkout were evaluated. */
  decisionsEvaluated: number;
  changed: string[];
  violations: Violation[];
  /**
   * How many ingested enforcer results matched no decision's rule — present
   * only when enforcer output was ingested (I-091). A join that silently
   * dropped every result read as a clean verdict; this is the number that makes
   * such a miss visible. Not a violation: an enforcer rule no decision governs
   * is the enforcer's own concern (115 FR-004).
   */
  enforcerResultsUnmatched?: number;
  /** One entry per declared source, present only when `scope` is `'federated'`
   *  (spec 122-decision-index-federation, FR-007). */
  sources?: DecisionSource[];
}

/** One governing decision matched to the paths that triggered it. */
export interface RetrievalMatch {
  decision: GovernanceDecision;
  /** The input paths this decision's scope matched (sorted, deduped). */
  matchedPaths: string[];
}

/** The reproducible retrieval log (rubric item 2: "logged", reconstruct-from-disk). */
export interface RetrievalLog {
  /** ISO timestamp from an injected clock — pinned in fixtures for determinism. */
  at: string;
  /** The query paths, verbatim and sorted. */
  paths: string[];
  /** The governing decisions, by coordinate, in precedence order. */
  governing: { coordinate: string; specId: string; id: string; matchedPaths: string[] }[];
}

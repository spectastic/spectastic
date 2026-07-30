import type { DefaultTreeAdapterTypes } from 'parse5';

/** parse5 Document tree type, re-exported for consumers. */
export type Document = DefaultTreeAdapterTypes.Document;
/** parse5 Element type, re-exported for consumers. */
export type Element = DefaultTreeAdapterTypes.Element;

/** Severity of a finding. Errors gate CI; warnings are advisory. */
export type Severity = 'error' | 'warning';

/** A pointer to a location in a source file. */
export interface Location {
  /** Logical file path or identifier (e.g. `"specs/001-auth/spec.html"`). */
  file: string;
  /** 1-indexed line number. */
  line: number;
  /** 1-indexed column number. */
  column: number;
}

/**
 * One thing the validator found. The wire format between the engine and
 * every consumer (CLI human/JSON/SARIF formatters, VS Code diagnostics,
 * MCP tool results). Adding a field is a breaking change — bump major.
 */
export interface Finding {
  file: string;
  line: number;
  column: number;
  /** Kebab-case rule identifier, e.g. `"no-missing-defer-to"`. */
  rule: string;
  severity: Severity;
  /** One-line description of what was wrong. */
  message: string;
  /** Optional one-line suggestion for the fix. */
  fixHint?: string;
  /** Extra locations the finding references (e.g. the other site of a duplicate ID). */
  relatedLocations?: Location[];
}

/** A parsed spec-html document plus its source coordinates. */
export interface ParsedDocument {
  /** The original HTML source text. */
  html: string;
  /** Logical file identifier. */
  file: string;
  /** parse5 document tree (with `sourceCodeLocationInfo` populated). */
  ast: Document;
  /** The `<spec-status value="...">` pill if the document has one. */
  status?: string;
}

/** Context handed to a per-file rule's `check` function. */
export interface PerFileRuleContext {
  doc: ParsedDocument;
}

/** Context handed to a cross-file rule's `check` function. */
export interface CrossFileRuleContext {
  docs: readonly ParsedDocument[];
}

/** A rule that inspects exactly one document. The common case. */
export interface PerFileRule {
  id: string;
  scope: 'per-file';
  defaultSeverity: Severity;
  description: string;
  check(ctx: PerFileRuleContext): Finding[];
}

/** A rule that inspects the entire validated set. Use sparingly. */
export interface CrossFileRule {
  id: string;
  scope: 'cross-file';
  defaultSeverity: Severity;
  description: string;
  check(ctx: CrossFileRuleContext): Finding[];
}

/** The rule registry contains both kinds. */
export type Rule = PerFileRule | CrossFileRule;

/** Options accepted by the public `validate()` entry. */
export interface ValidateOptions {
  /** Logical file name attached to findings. Defaults to `"<anonymous>"`. */
  file?: string;
}

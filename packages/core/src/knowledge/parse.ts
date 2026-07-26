/**
 * Frontmatter parser for a single `references/` corpus document
 * (051-knowledge-corpus, plan D-002 — `yaml`-backed, spectastic's first
 * YAML dependency).
 *
 * `parseCorpusDocument()` never throws: a corpus document is untrusted
 * third-party content (P-11), and a missing field or malformed YAML block
 * must surface as structured data a downstream finding can render (T-110's
 * corpusWellFormedFindings), never as a crash that takes the whole loader
 * down. A silent conversion loss is worse than a loud gap — the family's
 * own §5/§9 caveat, applied at the parser boundary.
 */
import { parse as parseYaml } from 'yaml';
import {
  KB_ID_RE,
  REQUIRED_PROVENANCE_FIELDS,
  type ParsedCorpusDocument,
  type Provenance,
} from './types.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** The degrade-to-empty result shared by every "couldn't read frontmatter"
 * path (absent fence, unparseable YAML, non-object YAML) — every required
 * field, including `id`, reports missing rather than guessing at a partial. */
function noFrontmatterResult(raw: string): ParsedCorpusDocument {
  return {
    id: null,
    hasFrontmatter: false,
    missingFields: ['id', ...REQUIRED_PROVENANCE_FIELDS],
    provenance: {},
    body: raw.trim(),
  };
}

/** Parse a frontmatter block into a plain object, or null on any failure —
 * unparseable YAML, or a YAML document that isn't an object (e.g. a bare
 * scalar or list). Never throws. */
function tryParseYamlObject(block: string): Record<string, unknown> | null {
  try {
    const result: unknown = parseYaml(block);
    return result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The KB-NNN id, or null if absent or malformed (FR-002). */
function extractId(parsedYaml: Record<string, unknown>): string | null {
  const rawId = typeof parsedYaml.id === 'string' ? parsedYaml.id : null;
  return rawId && KB_ID_RE.test(rawId) ? rawId : null;
}

/** Whichever required provenance fields (FR-003) are present as non-empty
 * strings; a missing or wrong-typed field is simply absent from the result. */
function extractProvenance(parsedYaml: Record<string, unknown>): Provenance {
  const provenance: Provenance = {};
  for (const field of REQUIRED_PROVENANCE_FIELDS) {
    const value = parsedYaml[field];
    if (typeof value === 'string' && value.length > 0) {
      provenance[field] = value;
    }
  }
  return provenance;
}

/** Every required field ('id' plus each of REQUIRED_PROVENANCE_FIELDS) that
 * didn't make it into `id`/`provenance` — the well-formedness scan's raw
 * material (T-110). */
function findMissingFields(id: string | null, provenance: Provenance): string[] {
  const missingFields: string[] = [];
  if (!id) missingFields.push('id');
  for (const field of REQUIRED_PROVENANCE_FIELDS) {
    if (!provenance[field]) missingFields.push(field);
  }
  return missingFields;
}

export function parseCorpusDocument(raw: string, _filePath: string): ParsedCorpusDocument {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) return noFrontmatterResult(raw);

  // noUncheckedIndexedAccess types these `string | undefined`, but the regex
  // structurally guarantees both groups whenever `match` is non-null; `?? ''`
  // is a defensive degrade (empty frontmatter parses to a falsy YAML result
  // and falls through to noFrontmatterResult via tryParseYamlObject below),
  // never a masked bug.
  const frontmatterBlock = match[1] ?? '';
  const body = match[2] ?? '';

  const parsedYaml = tryParseYamlObject(frontmatterBlock);
  if (!parsedYaml) return noFrontmatterResult(raw);

  const id = extractId(parsedYaml);
  const provenance = extractProvenance(parsedYaml);
  const missingFields = findMissingFields(id, provenance);

  return { id, hasFrontmatter: true, missingFields, provenance, body: body.trim() };
}

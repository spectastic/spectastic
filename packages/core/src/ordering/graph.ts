/**
 * Build the precedence DAG from the spec corpus (spec 028-dependency-ordering,
 * FR-001). The graph is *inferred*, never authored: an edge parent → child is
 * admitted only when a `<spec-parent specid="P">` on the child reciprocates a
 * `<spec-out-of-scope> <li defer-to="child">` on the parent — the exact
 * relation the `parent-child-reciprocity` validate rule already enforces
 * (plan D-001). A bare, unreciprocated defer-to is a see-also, not an edge.
 *
 * Read-only: it parses HTML strings and returns data; it never writes (FR-009).
 */

import { parse, findAll, getAttr, walk } from '@spectastic/schema/parser';
import type { Document, Element } from '@spectastic/schema/parser';
import { extractRice, extractSpecStatus } from '@spectastic/schema';
import type { CorpusEntry, DanglingRef, Edge, SpecNode } from './types.js';

const SPEC_ID = /^\d{3}-[a-z][a-z0-9-]*$/;

/** Concatenate an element's descendant text, collapsed. */
function textOf(el: Element): string {
  let out = '';
  walk(el, (node) => {
    for (const child of node.childNodes) {
      if (!('tagName' in child) && 'value' in child && typeof child.value === 'string') {
        out += child.value;
      }
    }
  });
  return out.replace(/\s+/g, ' ').trim();
}

/** Read the document's `<h1>` text, or a fallback. */
function readTitle(ast: Document, fallback: string): string {
  const h1 = findAll(ast, 'h1')[0];
  return h1 ? textOf(h1) || fallback : fallback;
}

/** The set of `defer-to` targets a spec declares across its `<spec-out-of-scope>` blocks. */
function deferTargets(ast: Document): Set<string> {
  const targets = new Set<string>();
  for (const block of findAll(ast, 'spec-out-of-scope')) {
    for (const li of findAll(block, 'li')) {
      const t = getAttr(li, 'defer-to');
      if (t) targets.add(t);
    }
  }
  return targets;
}

interface ParsedSpec {
  specId: string;
  doc: ReturnType<typeof parse>;
}

/** Reciprocated parent → child edges; a missing parent becomes a dangling ref. */
function reciprocalEdges(
  docs: readonly ParsedSpec[],
  present: ReadonlySet<string>,
  deferBy: ReadonlyMap<string, Set<string>>,
): { edges: Edge[]; dangling: DanglingRef[] } {
  const edges: Edge[] = [];
  const dangling: DanglingRef[] = [];
  for (const { specId: child, doc } of docs) {
    for (const parentEl of findAll(doc.ast, 'spec-parent')) {
      const parent = getAttr(parentEl, 'specid');
      if (!parent) continue;
      if (!present.has(parent)) {
        dangling.push({ from: child, ref: parent, kind: 'spec-parent' });
      } else if (deferBy.get(parent)?.has(child)) {
        edges.push({ from: parent, to: child });
      }
      // one-sided spec-parent (parent present, no reciprocal defer-to) is not an edge.
    }
  }
  return { edges, dangling };
}

/** defer-to targets that look like a spec id but aren't in the corpus (FR-010). */
function danglingDeferTos(
  deferBy: ReadonlyMap<string, Set<string>>,
  present: ReadonlySet<string>,
): DanglingRef[] {
  const dangling: DanglingRef[] = [];
  for (const [from, targets] of deferBy) {
    for (const ref of targets) {
      if (SPEC_ID.test(ref) && !present.has(ref)) {
        dangling.push({ from, ref, kind: 'defer-to' });
      }
    }
  }
  return dangling;
}

export interface Graph {
  nodes: SpecNode[];
  edges: Edge[];
  dangling: DanglingRef[];
}

/**
 * Parse the corpus once and build {nodes, edges, dangling}. Nodes follow the
 * corpus's given order (the caller sorts by spec id); edges and dangling refs
 * are derived deterministically.
 */
export function buildGraph(corpus: readonly CorpusEntry[]): Graph {
  const docs: ParsedSpec[] = corpus.map((c) => ({
    specId: c.specId,
    doc: parse(c.html, `specs/${c.specId}/spec.html`),
  }));
  const present = new Set(docs.map((d) => d.specId));
  const deferBy = new Map<string, Set<string>>();
  for (const { specId, doc } of docs) deferBy.set(specId, deferTargets(doc.ast));

  const nodes: SpecNode[] = docs.map(({ specId, doc }) => ({
    specId,
    title: readTitle(doc.ast, specId),
    status: extractSpecStatus(doc) ?? null,
    rice: extractRice(doc),
  }));

  const { edges, dangling } = reciprocalEdges(docs, present, deferBy);
  dangling.push(...danglingDeferTos(deferBy, present));

  return { nodes, edges, dangling };
}

/**
 * Resolve each node's RICE value (spec 028-dependency-ordering, FR-003). A node
 * with no (or malformed) `<spec-rice>` carries `value: null` — it stays in the
 * order but is tagged *unranked* (FR-006), never dropped, never silently zero.
 */

import { riceValue } from '@spectastic/schema';
import type { ScoredNode, SpecNode } from './types.js';

export function scoreNodes(nodes: readonly SpecNode[]): ScoredNode[] {
  return nodes.map((n) => ({
    ...n,
    value: n.rice ? riceValue(n.rice) : null,
  }));
}

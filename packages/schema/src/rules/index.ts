import type { Rule } from '../types.js';

import { deltaOpRequiredRule } from './delta-op-required.js';
import { deltaTargetRequiredRule } from './delta-target-required.js';
import { emptyDocumentRule } from './empty-document.js';
import { fileTooLargeRule } from './file-too-large.js';
import { investRowFailedRule } from './invest-row-failed.js';
import { noBrokenDeferToRule } from './no-broken-defer-to.js';
import { noDuplicateIdsRule } from './no-duplicate-ids.js';
import { noMissingDeferToRule } from './no-missing-defer-to.js';
import { noUnresolvedQuestionRule } from './no-unresolved-question.js';
import { requirementIdRequiredRule } from './requirement-id-required.js';
import { riskStatusRequiredRule } from './risk-status-required.js';
import { riskTargetRequiredRule } from './risk-target-required.js';
import { specParentWellFormedRule } from './spec-parent-well-formed.js';
import { taskIdRequiredRule } from './task-id-required.js';

/**
 * The canonical spectastic rule registry.
 *
 * Per D-001 of the plan, the rules/ directory IS the schema — no parallel
 * RelaxNG or JSON Schema. Adding a rule is one new file under rules/ plus
 * one import and one array entry here.
 *
 * Per-file rules see exactly one ParsedDocument; cross-file rules see all
 * docs the engine was given. The engine runs both kinds during validate()
 * (treating a single doc as a one-element set for cross-file rules).
 */
export const rules: readonly Rule[] = [
  // Structural / required-attribute rules (per-file).
  noMissingDeferToRule,
  deltaOpRequiredRule,
  deltaTargetRequiredRule,
  riskTargetRequiredRule,
  riskStatusRequiredRule,
  requirementIdRequiredRule,
  taskIdRequiredRule,
  specParentWellFormedRule,

  // Status-dependent rules (per-file).
  noUnresolvedQuestionRule,
  investRowFailedRule,

  // Edge-case rules (per-file).
  emptyDocumentRule,
  fileTooLargeRule,

  // Cross-file rules.
  noDuplicateIdsRule,
  noBrokenDeferToRule,
];

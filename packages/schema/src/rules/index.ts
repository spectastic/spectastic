import type { Rule } from '../types.js';
import { contractDeclarationShapeRule } from './contract-declaration-shape.js';
import { visualDeclarationShapeRule } from './visual-declaration-shape.js';
import { screenShapeRule } from './screen-shape.js';
import { stateSourceRequiredRule } from './state-source-required.js';
import { annotationTypedRule } from './annotation-typed.js';
import { variantGridShapeRule } from './variant-grid-shape.js';
import { variantSameResolvesRule } from './variant-same-resolves.js';
import { contractNameUniqueRule } from './contract-name-unique.js';
import { corpusCitationFormRule } from './corpus-citation-form.js';
import { dataDeltaShapeRule } from './data-delta-shape.js';
import { dateFormatRule } from './date-format.js';
import { deltaOpRequiredRule } from './delta-op-required.js';
import { deltaTargetRequiredRule } from './delta-target-required.js';
import { emptyDocumentRule } from './empty-document.js';
import { fileTooLargeRule } from './file-too-large.js';
import { formatBandCouplingRule } from './format-band-coupling.js';
import { hiddenInstructionPatternRule } from './hidden-instruction-pattern.js';
import { idWithinFileUniqueRule } from './id-within-file-unique.js';
import { investRowFailedRule } from './invest-row-failed.js';
import { matrixWinnerIntegrityRule } from './matrix-winner-integrity.js';
import { noBrokenDeferToRule } from './no-broken-defer-to.js';
import { noDuplicateIdsRule } from './no-duplicate-ids.js';
import { noExecutableContentRule } from './no-executable-content.js';
import { noMissingDeferToRule } from './no-missing-defer-to.js';
import { noPlaceholderQuestionRule } from './no-placeholder-question.js';
import { noUnresolvedQuestionRule } from './no-unresolved-question.js';
import { parentChildReciprocityRule } from './parent-child-reciprocity.js';
import { requirementIdRequiredRule } from './requirement-id-required.js';
import { riceWellFormedRule } from './rice-well-formed.js';
import { riskStatusRequiredRule } from './risk-status-required.js';
import { riskTargetRequiredRule } from './risk-target-required.js';
import { sloTargetRequiredRule } from './slo-target-required.js';
import { sloWellFormedRule } from './slo-well-formed.js';
import { specIdUniqueRule } from './spec-id-unique.js';
import { specParentWellFormedRule } from './spec-parent-well-formed.js';
import { splitWellFormedRule } from './split-well-formed.js';
import { taskIdRequiredRule } from './task-id-required.js';
import { taskTitleBoldScopeRule } from './task-title-bold-scope.js';
import { verifyViewMissingRule } from './verify-view-missing.js';
import { verifyViewStaleRule } from './verify-view-stale.js';

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
  dataDeltaShapeRule,
  riskTargetRequiredRule,
  riskStatusRequiredRule,
  requirementIdRequiredRule,
  taskIdRequiredRule,
  taskTitleBoldScopeRule,
  dateFormatRule,
  idWithinFileUniqueRule,
  specParentWellFormedRule,
  riceWellFormedRule,
  splitWellFormedRule,

  // Status-dependent rules (per-file).
  noUnresolvedQuestionRule,
  noPlaceholderQuestionRule,
  investRowFailedRule,

  // Edge-case rules (per-file).
  emptyDocumentRule,
  fileTooLargeRule,

  // Security rules (per-file) — spec 045-artifact-security.
  noExecutableContentRule,
  hiddenInstructionPatternRule,

  // SLO rules (per-file) — spec 047-slo-nfr-artifact.
  sloTargetRequiredRule,
  sloWellFormedRule,

  // Decision-record rules (per-file) — spec 050-stack-selection.
  matrixWinnerIntegrityRule,

  // Corpus-citation rules (per-file) — spec 052-corpus-citation-contract.
  corpusCitationFormRule,

  // Contract-declaration rules (per-file) — spec 069-design-contract-section.
  contractDeclarationShapeRule,
  visualDeclarationShapeRule,
  screenShapeRule,
  stateSourceRequiredRule,
  annotationTypedRule,
  variantGridShapeRule,
  variantSameResolvesRule,
  contractNameUniqueRule,

  // Cross-file rules.
  noDuplicateIdsRule,
  noBrokenDeferToRule,
  parentChildReciprocityRule,
  verifyViewStaleRule,
  verifyViewMissingRule,
  formatBandCouplingRule,
  specIdUniqueRule,
];

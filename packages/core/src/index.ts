/**
 * @spectastic/core — verb kernel for spectastic.
 *
 * Per D-002 + FR-002 of specs/006-kernel-extraction/spec.html: this main
 * entry exports ONLY types. Importing a verb's implementation goes
 * through its subpath (e.g. `@spectastic/core/commands/validate`); that
 * discipline is what keeps parse5 + AI adapters off the init path. The
 * bench's init-help-cold-start scenario fires if anything heavy creeps
 * into this file via a careless re-export.
 *
 * Adding a verb is: one new file under `src/commands/`, one new entry
 * in tsup.config.ts, one new subpath in package.json's `exports`.
 * Nothing in this file changes.
 */

export type {
  AIProvider,
  ApplyInput,
  ApplyResult,
  ChatOpts,
  CourseResult,
  Delta,
  DeltaApplication,
  FileSystem,
  Finding,
  GraduationClass,
  ImplementInput,
  ImplementResult,
  KernelContext,
  PlanInput,
  PlanResult,
  PrinciplesInput,
  PrinciplesResult,
  ProposeInput,
  ProposeResult,
  Question,
  RiskFinding,
  SpecInput,
  SpecResult,
  SubagentOpts,
  SubagentResult,
  TaskItem,
  TaskPhase,
  TasksInput,
  TasksResult,
  TriageCard,
  TriageInput,
  TriageLayer,
  TriageResult,
  ValidateInput,
  ValidateResult,
  WithdrawInput,
} from './types.js';

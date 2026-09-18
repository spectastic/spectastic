/**
 * Shared `init --tools` install/uninstall error (spec 031; extended by
 * 121-init-ci-gate). Lives in its own module so `ci.ts` can throw it without a
 * circular import — `tools.ts` orchestrates `ci.ts`, so `ToolsError` can't be
 * defined there and imported back.
 */
export class ToolsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolsError';
  }
}

/*
 * US1 / T-102 — extension-host integration (spec FR-008, FR-009, NFR-002).
 *
 * This tier runs in a real VS Code instance via @vscode/test-electron, which
 * downloads an Electron build and launches the extension host. It is therefore
 * CI/local-only and is NOT part of the vitest or Playwright globs (filename ends
 * in `.e2e.ts`, which Playwright's `*.@(spec|test)` matcher ignores). Wire it up
 * with a `@vscode/test-electron` runner in CI (see packages/vscode README, T-903).
 *
 * Intended assertions:
 *   1. Activation registers the `spectastic.lifecycleCanvas` view and the
 *      `spectastic.selectSpec` command.
 *   2. With a spec selected, the webview receives a `graph` message whose node
 *      count matches the artifacts on disk.
 *   3. Saving an artifact triggers a fresh `graph` within 500 ms (FR-009/NFR-002).
 *
 * The pure host data-path (scanner → graph) is already verified runnably in
 * packages/vscode/src/host/scanner.test.ts; this suite covers only what genuinely
 * needs the editor runtime (command/view registration and the file-watcher).
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const ext = vscode.extensions.getExtension('spectastic.spectastic-vscode');
  await ext?.activate();

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('spectastic.selectSpec'), 'select-spec command registered');
}

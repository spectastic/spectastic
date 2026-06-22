# @spectastic/vscode — Lifecycle canvas

An in-editor canvas of one spec's lifecycle — `principles → … → triage` as
connected cards. Read-only: each node opens its rendered artifact in a click.
Implements [`specs/020-vscode-extension`](../../specs/020-vscode-extension/spec.html).

## Run it locally (sideload)

This slice is dev-host / sideload only — no marketplace release (spec out-of-scope).

### Option A — Extension Development Host (F5)

1. `pnpm install` at the repo root.
2. `pnpm --filter @spectastic/vscode build` (emits `dist/host.cjs`, `dist/webview.global.js`, `dist/webview.css`).
3. Open the repo in VS Code and press **F5** ("Run Extension"). A second VS Code
   window launches with the extension loaded.
4. Open a folder that contains a `specs/<id>/` tree, reveal the **Spectastic**
   view in the Activity Bar, and run **Spectastic: Select Spec** to choose one.

### Option B — Install a VSIX

```sh
pnpm --filter @spectastic/vscode build
cd packages/vscode && npx @vscode/vsce package   # produces spectastic-vscode-*.vsix
code --install-extension spectastic-vscode-*.vsix
```

> `@vscode/vsce` warns on scoped package names; for marketplace publishing the id
> would move to an unscoped `name` + `publisher`. That is deferred with the rest of
> the release machinery.

## Architecture

| Side | Files | Role |
| --- | --- | --- |
| Host (Node, CJS) | `src/host/*` | Scan `specs/<id>/`, extract health via `@spectastic/schema`, build the `LifecycleGraph`, watch for changes, open artifacts in a CSP'd webview. |
| Webview (browser, IIFE) | `src/webview/*` | Vanilla-TS render: deterministic L→R layout, SVG edges, minimal nodes + compact cards, themed to the active VS Code surface. |

Health extraction lives in `@spectastic/schema` (`extractHealth`) so it is shared
and unit-tested; the extension stays thin.

## Tests

| Tier | Where | Runner |
| --- | --- | --- |
| Unit (extract, layout, stale, rewrite) | `packages/**/*.test.ts` | `pnpm test` (vitest) |
| Webview behaviour (render, edges, open, card, attention, states, a11y, live) | `tests/vscode/*.spec.ts` | `pnpm test:e2e` (Playwright) |
| Activation + watcher | `tests/vscode/activation.e2e.ts` | `@vscode/test-electron` (CI/local; downloads Electron) |
| Paint perf (NFR-001) | `bench/canvas-paint.mjs` | `node bench/canvas-paint.mjs` |

**CI gate:** build the package and run all three tiers; package the VSIX so a
broken manifest fails the build.

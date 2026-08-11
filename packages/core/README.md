# @spectastic/core

[![npm](https://img.shields.io/npm/v/%40spectastic%2Fcore?label=npm&style=flat-square&labelColor=353534&color=5f023e)](https://www.npmjs.com/package/@spectastic/core)
[![downloads](https://img.shields.io/npm/dm/%40spectastic%2Fcore?label=downloads%2Fmo&style=flat-square&labelColor=353534&color=5f023e)](https://www.npmjs.com/package/@spectastic/core)
[![node](https://img.shields.io/badge/node-%3E%3D20-04a5bb?style=flat-square&labelColor=353534)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/%40spectastic%2Fcore?style=flat-square&labelColor=353534&color=7558b2)](https://github.com/spectastic/spectastic/blob/main/LICENSE)

The verb kernel for spectastic. One TypeScript module every surface shares — the CLI, an MCP server, an
editor extension — so a verb's procedure lives in one place and downstream surfaces never re-implement it.

Deterministic logic lives here; a CLI command module is thin, registering the command and delegating.

## What's in it

Seventeen verbs, each on its own subpath under `@spectastic/core/commands/`:

`apply` · `contract` · `course` · `design` · `explore` · `graduate` · `id` · `implement` · `order` ·
`principles` · `propose` · `restore-marker` · `spec` · `tasks` · `triage` · `validate` · `verify`

Alongside them, the deterministic modules a second caller would want without the CLI — enforcement
detection and policy (`./enforce/*`), change-risk scanning and scoring (`./change-risk/*`), gitignore
merging (`./gitignore/*`), contract promotion and views (`./contracts/*`), unit dependency edges
(`./units/*`), test-tag resolution (`./testtags/*`), and the execution guard (`./execcheck/*`).

The injected surface is the type entry: `KernelContext`, `FileSystem`, `AIProvider` (`chat` + `ask<T>` +
`subagent`), `Question`, and per-verb input/result shapes. A default `FileSystem` lives at
`@spectastic/core/providers/node-fs`, and a scriptable `StubAIProvider` at `@spectastic/core/providers/stub`
— which is what the integration tests run against, never a real model.

## Importing a verb

Per-verb subpath exports keep the lazy-loading discipline. Import each verb from its own subpath — never via the main entry.

```ts
// Right: subpath import loads only what this verb needs.
import { validateCommand } from '@spectastic/core/commands/validate';

// Also right: types from the main entry — zero command code loaded.
import type { KernelContext, ValidateInput, ValidateResult } from '@spectastic/core';

// Wrong: there is no umbrella re-export of verb functions, by design.
// import { validateCommand } from '@spectastic/core';
```

This shape is enforced by the bench's `init-help-cold-start` scenario in `bench/baselines.json` — if the kernel ever eagerly loads `parse5` (or any AI adapter) on a path that doesn't need it, the bench fires.

## Calling a verb

Every kernel function follows the same shape: `async function <verb>Command(input, ctx): Promise<Result>`. The `ctx` is the injected IO + AI surface; verbs that don't need AI leave `ctx.ai` undefined.

```ts
import { validateCommand } from '@spectastic/core/commands/validate';

const result = await validateCommand(
  { files: ['/path/to/spec.html'] },
  { cwd: process.cwd() },
);

console.log(`${result.findings.length} findings; exit ${result.exitCode}`);
```

When `ctx.fs` is undefined the kernel lazy-loads the default `nodeFs` impl. To unit-test against in-memory fixtures, pass a stubbed `FileSystem`:

```ts
import { validateCommand } from '@spectastic/core/commands/validate';
import type { FileSystem } from '@spectastic/core';

const stubFs: FileSystem = {
  async readFile(path) {
    if (path === '/test/clean.html') return '<!doctype html>…';
    throw new Error(`ENOENT: ${path}`);
  },
  async writeFile() { throw new Error('not implemented'); },
  async readdir() { return []; },
  async stat(path) { return { isFile: true, isDirectory: false }; },
};

const result = await validateCommand({ files: ['/test/clean.html'] }, {
  cwd: '/test',
  fs: stubFs,
});
```

## The AIProvider surface

`AIProvider` is the contract for AI access, and it was declared whole up front: all three methods (`chat`, `ask<T>`, `subagent`) exist even where a given verb needs none of them. That was deliberate — landing a real provider, and later lighting up `subagent()`, are both **additive** rather than interface-extending breaking changes.

```ts
interface AIProvider {
  chat(prompt: string, opts?: ChatOpts): Promise<string>;
  ask<T extends Record<string, string>>(
    questions: ReadonlyArray<Question>,
  ): Promise<T>;
  subagent(prompt: string, opts?: SubagentOpts): Promise<SubagentResult>;
}
```

`Question` mirrors Claude Code's `AskUserQuestion` shape exactly so the Claude provider can route the call straight through; MCP servers and VS Code extensions render the same `Question` data in their native UI.

## Versioning policy — pre-1.0

While the kernel surface is still being shaped (verbs landing in sequence through 014), this package follows a **pre-1.0 policy**: breaking changes may land in minor version bumps. Downstream consumers should pin tightly with `~0.x.y`, **not** `^0.x.y`:

```json
{
  "dependencies": {
    "@spectastic/core": "~0.1.0-pre.8"
  }
}
```

At `1.0.0` the surface freezes and strict semver applies. The graduation criteria are recorded in the [kernel-extraction spec](https://github.com/spectastic/spectastic/blob/main/specs/006-kernel-extraction/spec.html).

## Extending the kernel — adding a verb

The pattern future extractions follow (the broader slicing recipe is in the [slicing-gaps register](https://github.com/spectastic/spectastic/blob/main/examples/slicing-gaps.html#recipe)):

1. Author the spec at `specs/NNN-core-<verb>/spec.html` with `<spec-parent specid="006-kernel-extraction">`.
2. Run `/spectastic.design` then `/spectastic.tasks`.
3. Add the verb's input/result shapes to `packages/core/src/types.ts`.
4. Create `packages/core/src/commands/<verb>.ts` with `<verb>Command(input, ctx)`.
5. Add the new entry to `packages/core/tsup.config.ts`.
6. Add a new subpath to `packages/core/package.json`'s `exports` field.
7. Write `packages/core/test/<verb>.test.ts` with stub `ctx.fs` + stub `ai` as needed.
8. If the verb has a slash-command counterpart, update `commands/spectastic.<verb>.md` with a note: "For deterministic operations, the model MAY invoke `spectastic <verb>` via Bash."
9. Add a `spectastic <verb>` CLI subcommand at `packages/cli/src/commands/<verb>.ts` that imports from `@spectastic/core/commands/<verb>` and translates the result.
10. Bench passes; full-project validate passes; commit; tag; ship.

## Linked artifacts

- [Kernel-extraction spec](https://github.com/spectastic/spectastic/blob/main/specs/006-kernel-extraction/spec.html) — the foundation, and its design doc's ADRs
- [Slicing-gaps register](https://github.com/spectastic/spectastic/blob/main/examples/slicing-gaps.html) — the parent/child slicing recipe
- [Project and full documentation](https://github.com/spectastic/spectastic)

## License

MIT

# @spectastic/core

The verb kernel for spectastic. One TypeScript module the CLI, the future MCP server, the future VS Code extension, and the future web editor all share — so the slash-command procedures live in one place and downstream surfaces don't re-implement them.

## What's in v0.1

- `validateCommand` at `@spectastic/core/commands/validate` — the validate verb extracted from `@spectastic/cli`, wraps `@spectastic/schema`'s engine.
- Forward-looking type surface: `KernelContext`, `FileSystem`, `AIProvider` (`chat` + `ask<T>` + `subagent`), `Question`, per-verb input/result shapes.
- Default `FileSystem` implementation at `@spectastic/core/providers/node-fs` — a thin wrapper over `node:fs/promises`.

Seven more verbs ship in sibling slices ([007-core-triage](../../specs/007-core-triage/spec.html) through [014-core-implement](../../specs/014-core-implement/spec.html)).

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

`AIProvider` is the v1 contract for AI access. The interface is **forward-looking**: it declares three methods (`chat`, `ask<T>`, `subagent`) even though `validate` (the v1 verb) needs none of them. This was deliberate — defining the full surface now means the [007-core-triage](../../specs/007-core-triage/spec.html) PR that lands the first Claude implementation, and the [013-core-propose](../../specs/013-core-propose/spec.html) PR that lights up `subagent()`, are both **additive** rather than interface-extending breaking changes.

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

At `1.0.0` the surface freezes and strict semver applies. The graduation criteria are documented in [006-kernel-extraction](../../specs/006-kernel-extraction/spec.html) FR-012.

## Extending the kernel — adding a verb

The pattern future extractions follow (see [slicing-gaps.html §1](../../examples/slicing-gaps.html#recipe) for the broader slicing recipe):

1. Author the spec at `specs/NNN-core-<verb>/spec.html` with `<spec-parent specid="006-kernel-extraction">`.
2. Run `/spectastic.plan` then `/spectastic.tasks`.
3. Add the verb's input/result shapes to `packages/core/src/types.ts`.
4. Create `packages/core/src/commands/<verb>.ts` with `<verb>Command(input, ctx)`.
5. Add the new entry to `packages/core/tsup.config.ts`.
6. Add a new subpath to `packages/core/package.json`'s `exports` field.
7. Write `packages/core/test/<verb>.test.ts` with stub `ctx.fs` + stub `ai` as needed.
8. If the verb has a slash-command counterpart, update `commands/spectastic.<verb>.md` with a note: "For deterministic operations, the LLM MAY invoke `spectastic <verb>` via Bash."
9. Add a `spectastic <verb>` CLI subcommand at `packages/cli/src/commands/<verb>.ts` that imports from `@spectastic/core/commands/<verb>` and translates the result.
10. Bench passes; full-project validate passes; commit; tag; ship.

## Linked artifacts

- [006-kernel-extraction spec](../../specs/006-kernel-extraction/spec.html) — the foundation
- [006-kernel-extraction plan](../../specs/006-kernel-extraction/plan.html) — 8 ADRs
- [slicing-gaps register](../../examples/slicing-gaps.html) — parent/child recipe + frozen audit
- Sibling kernel-extraction slices: [007](../../specs/007-core-triage/spec.html), [008](../../specs/008-core-principles/spec.html), [009](../../specs/009-core-tasks/spec.html), [010](../../specs/010-core-apply/spec.html), [011](../../specs/011-core-spec/spec.html), [012](../../specs/012-core-plan/spec.html), [013](../../specs/013-core-propose/spec.html), [014](../../specs/014-core-implement/spec.html)

## License

MIT

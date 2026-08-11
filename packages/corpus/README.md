# @spectastic/corpus

[![npm](https://img.shields.io/npm/v/%40spectastic%2Fcorpus?label=npm&style=flat-square&labelColor=353534&color=5f023e)](https://www.npmjs.com/package/@spectastic/corpus)
[![downloads](https://img.shields.io/npm/dm/%40spectastic%2Fcorpus?label=downloads%2Fmo&style=flat-square&labelColor=353534&color=5f023e)](https://www.npmjs.com/package/@spectastic/corpus)
[![node](https://img.shields.io/badge/node-%3E%3D20-04a5bb?style=flat-square&labelColor=353534)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/%40spectastic%2Fcorpus?style=flat-square&labelColor=353534&color=7558b2)](https://github.com/spectastic/spectastic/blob/main/LICENSE)

Curation, citation, and provenance for a committed `knowledge/` corpus — the domain knowledge an
agent grounds against. A library, and a standalone `spectastic-corpus` binary that works with no
spec lifecycle and no other spectastic package present.

No vector database, no retrieval index. Agentic search over committed files, matching the way the
repository is already read.

## Install

```sh
npm i -g @spectastic/corpus     # the standalone binary
npm i @spectastic/corpus        # as a library
```

Node 20+.

## The shape

A corpus is an [Agent Skills](https://agentskills.io/home) folder — `SKILL.md` plus `references/` —
so it stays portable across any skills-compatible agent rather than tied to the one that authored it.

```
knowledge/
├── index.md                    the root registry: one row per document, KB-NNNN → coordinate
├── marketplace.json            what this corpus publishes
└── <pack>/
    ├── SKILL.md                the pack's discovery description
    └── references/
        ├── 001-foundations.md  a document: provenance frontmatter + prose
        └── superseded/         prior editions, retained verbatim
```

Every document carries provenance frontmatter — `origin`, `origin-url`, `edition`, `license`,
`converter`, `content-hash`, `status` — and a stable `KB-NNNN` id independent of its file path.

## Cite an id at an edition

A claim grounds on `KB-NNNN@edition`: the id pinned to the exact edition it was read against. A later
re-ingest at a newer edition therefore cannot silently change what a historical decision claimed. The
prior edition is retained under `references/superseded/` rather than overwritten, so an edition-pinned
citation always resolves.

Two gates, tier-independent:

| Finding | Severity | Fires when |
| --- | --- | --- |
| `corpus-provenance` | **error** | A cited id or edition has no committed document — including a fabricated or mistyped one. |
| `corpus-staleness` | warning | A citation is pinned to a superseded edition. Loud, never blocking: the world may have moved with nobody having re-ingested yet. |
| `corpus-license` | warning | A document *declares* a license that restricts redistribution, or one the permissive allowlist doesn't carry. |

Two ceilings are recorded rather than hidden. Staleness can only notice a supersession once someone
re-ingests the newer edition — never the moment the world actually changes. And the license rule reads
a *declared* license only; it never adjudicates license compatibility or legal effect.

## What may be committed

Committing a third-party document makes its redistribution terms unavoidable — the licence applies to the
repository whether or not anyone read it first. So the policy is explicit:

**May be committed.** Material the project holds the right to redistribute: public-domain facts,
permissively-licensed references, and hand-authored illustrative excerpts. In-repo, these are citable,
greppable, and durable.

**Must be held by-reference.** Material under a restrictive licence that cannot be redistributed has a
sanctioned escape hatch rather than a ban: bridge it live through an MCP server, or keep only its
`origin-url` in the index and never commit the text. A restrictive licence committed anyway is a decision
on the record — the `corpus-license` warning — not a silent liability.

The permissive allowlist (MIT, Apache-2.0, BSD-2/3-Clause, CC0-1.0, plain CC-BY, ISC, Unlicense, 0BSD,
public-domain) is silent. A known-restrictive licence, an id the allowlist doesn't carry, or the adapter's
own `TODO` placeholder each warn. Never an error: whether to commit restricted material is the project's
call to make with the fact in front of it.

## Commands

```sh
spectastic-corpus <command> --help
```

**Read** — deterministic, no model call:

| Command | Does |
| --- | --- |
| `get <id>` | Resolve one document by KB id (bare or edition-pinned), returning its coordinate and provenance. |
| `query <text>` | Case-insensitive substring search over corpus metadata — id, slug, title, description. Never document bodies. |
| `grep <pattern>` | Full-text search over document bodies. Uses ripgrep when available, else a pure-Node scan. |
| `id <id>` | Print a document's federation-unique `spectastic://` resource URI. |

**Curate:**

| Command | Does |
| --- | --- |
| `adapt <folder>` | Adapt an existing markdown folder, or an `llms.txt`, into the convention. |
| `import <plugin>@<marketplace>` | Install a marketplace skill and register its references in the root registry. |
| `source <url>` | Register a document fetched from an allowlisted authority, pending confirmation. |
| `interview` | Register a subject-matter-expert interview as a reference, pending their sign-off. |
| `convert <file>` | Convert a source document (PDF and other formats) into a cited corpus document. |
| `migrate <pack>` | Move a single-layer pack onto the two-layer convention, in place. Idempotent. |
| `publish` | Generate or refresh `marketplace.json` from the root registry. |
| `validate` | Check the corpus itself — well-formedness, registry consistency, license permissiveness. |

### Adapting what you already have

Most teams hold specialist knowledge in *some* shape already. The adapter derives what it can — a
`sha256:` hash of every document's real bytes, always — and marks what it cannot as an explicit
`TODO`. An unknown `license`, `origin`, or `edition` is **never** guessed, because a citation makes a
wrong fact *more* credible, not less.

It is safe to run repeatedly: an already-adapted file is left untouched, ids never collide, and a
field you have hand-corrected survives every later re-run.

`convert` shells out to a converter you install; none is bundled.
[MarkItDown](https://github.com/microsoft/markitdown) is the default and the fast path for clean
digital PDFs; [Docling](https://github.com/docling-project/docling) is the structurally-rich option,
best on tables and formulas; [Marker](https://github.com/VikParuchuri/marker) is the
highest-fidelity where a GPU budget justifies it.

## Keeping a pack publishable

A pack meant for distribution must carry **zero** spectastic-specific instruction — no spec markup, no
"cite this in a grounding" text — so it stays a clean Agent Skill, equally useful in a plain agent
project. `validate` inspects only marketplace-listed packs and flags a vocabulary leak, or a `SKILL.md`
whose discovery description is missing or a placeholder (an agent's skill router reads that description
before anything else). A pack that is honestly tool-specific declares `tool-specific: true` and is
spared the check.

Portability across a third-party pack this tool never sees stays a discipline it encourages, not a
property it enforces.

## As a library

```ts
import { resolveCitation, validateCorpus } from '@spectastic/corpus'
```

The package is ESM-only and depends on no other spectastic package. That direction is deliberate and
machine-enforced in CI: `@spectastic/corpus` must never import `@spectastic/core`, so the corpus stays
usable on its own.

## See also

- [`@spectastic/cli`](https://www.npmjs.com/package/@spectastic/cli) — the spec lifecycle, which injects a corpus into its authoring prompts when one is present
- [Repository and full documentation](https://github.com/spectastic/spectastic)

MIT

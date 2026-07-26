---
slug: 001-example
origin: spectastic init scaffold
origin-url: https://github.com/spectastic/spectastic
edition: 2026-07-25
license: CC0-1.0
converter: hand-authored
content-hash: TODO
status: illustrative-excerpt
---

# Example reference document

This is a placeholder. Replace this document with a real domain source — a regulation, a standards
document, a house convention — and update its frontmatter to match:

- `slug` — this pack's own portable id for the reference (e.g. `001-example`), unique only within this
  pack. Never a project-wide `KB-` id — the consuming project assigns one on import (FR-009).
- `origin` — where the source document came from (a publisher, a person, a URL).
- `origin-url` — the original location, so the committed copy stays a snapshot of something real.
- `edition` — the date or version of the source you read.
- `license` — the source's redistribution terms.
- `converter` — how this markdown was produced (`hand-authored`, `docling`, `markitdown`, …).
- `content-hash` — a hash of the converted content, so a later re-ingest can detect drift. Left as `TODO`
  here — never fabricate a hash for content that hasn't actually been ingested.
- `status` — `illustrative-excerpt` for a placeholder like this one; drop the field (or set it to
  something else) once the document is a real, authoritative source.

Once a project imports this reference, cite it from a plan decision as `KB-NNNN@edition` — the project's
own registry id (from its root `knowledge/index.md`), pinned to the edition it was read against. This
document's own `slug` above is the portable id it ships with; it has no `KB-` id of its own.

---
name: example
description: Example corpus pack scaffolded by `spectastic init` — replace with your own domain knowledge, or delete this pack entirely.
---

# Example knowledge pack

This is a starting shape for a spectastic knowledge corpus (051-knowledge-corpus). Replace
`references/KB-001-example.md` with your own domain document, update `index.md` to match, and rename this
pack's directory to your domain (e.g. `finance-settlement/`, `clinical-trials/`).

## Shape

- `SKILL.md` (this file) — the discovery layer: a name and description an agent reads first.
- `index.md` — a curated map from `KB-NNN` id to title, description, current edition, and path. Cheap to
  read before pulling any document.
- `references/` — the documents themselves, each carrying provenance frontmatter (`origin`, `origin-url`,
  `edition`, `license`, `converter`, `content-hash`, `status`) and a stable `KB-NNN` id independent of its
  file path.

A plan decision cites a document as `KB-NNN@edition` — the id pinned to the exact edition it was grounded
against, so a later re-ingest at a newer edition can never silently change what a historical decision claimed
to have read.

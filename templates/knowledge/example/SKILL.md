---
name: example
description: Example corpus pack scaffolded by `spectastic init` — replace with your own domain knowledge, or delete this pack entirely.
---

# Example knowledge pack

This is a starting shape for a spectastic knowledge corpus (051-knowledge-corpus). Replace
`references/001-example.md` with your own domain document, update the map below to match, and rename this
pack's directory to your domain (e.g. `finance-settlement/`, `clinical-trials/`).

## Shape

- `SKILL.md` (this file) — the discovery layer *and* the pack's own curated map (below): a name and
  description an agent reads first, then a table from each reference's pack-internal slug to its title,
  description, current edition, and path. Cheap to read before pulling any document.
- `references/` — the documents themselves, each carrying provenance frontmatter (`origin`, `origin-url`,
  `edition`, `license`, `converter`, `content-hash`, `status`) and a pack-internal `slug` — unique within
  this pack only, portable, and owned entirely by the pack. A pack never mints a project-wide id; the
  consuming project assigns one when it imports a reference, recorded in its own root `knowledge/index.md`
  registry.

## Map

| Slug | Title | Description | Edition | Path |
| --- | --- | --- | --- | --- |
| 001-example | Example reference document | A placeholder showing the provenance-frontmatter shape — replace with a real source. | 2026-07-25 | references/001-example.md |

A plan decision cites an *imported* reference as `KB-NNNN@edition` — the consuming project's own registry
id, pinned to the exact edition it was grounded against, so a later re-ingest can never silently change
what a historical decision claimed to have read. This pack's own slug (above) is the portable id it ships
with; the `KB-NNNN` only exists once a project has imported it.

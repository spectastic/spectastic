# Corpus registry

This project's root registry of every imported corpus reference (051-knowledge-corpus FR-009,
2026-07-26-two-layer-corpus-identity). Each row maps a project-assigned, opaque `KB-NNNN` id to the
reference it names — the id a plan decision cites as `KB-NNNN@edition`.

A fresh project has imported nothing yet, so this table starts empty. It's populated by the corpus
ingester as packs are imported, never hand-authored — the ingester owns assignment (a monotonic,
never-reused `KB-NNNN`), the `(marketplace, plugin, slug)` re-import anchor, and orphan-flagging when
a re-import drops a reference.

| KB-NNNN | Marketplace | Plugin | Slug | Title | Edition | Path |
| --- | --- | --- | --- | --- | --- | --- |

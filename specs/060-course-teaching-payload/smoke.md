# Manual smoke — the structured teaching payload

The kernel's guarantees are pinned by unit tests
([packages/core/test/course.test.ts](../../packages/core/test/course.test.ts)) — payload validation, member
existence (FR-004), the blind analogy-fit check (FR-005/SC-002), backward compatibility (FR-006) — and a
structural/Playwright backstop
([tests/course.teaching.spec.ts](../../tests/course.teaching.spec.ts)) proving every member renders, stays
contained, and is legible with JavaScript disabled. What neither can judge is **payload quality with a real
model**: is a drafted analogy actually apt, is a contrast's dimensions genuinely illuminating? That's this
checklist. It is a dev aid — not bundled or installed.

## Plumbing smoke (deterministic, no API key)

Confirms the end-to-end pipe — draft → existence → blind analogy-fit → assemble — produces a real artifact, and
that a deliberately-bad analogy is genuinely rejected. Run from the repo root.

**Pass case** — the blind check says the analogy is sound (`"output":"no"`):

```bash
cat > /tmp/pass.json <<'EOF'
{"subagent":[{"output":"0"},{"output":"no"}]}
EOF
printf '%s' '{"target":"060-course-teaching-payload","title":"Course teaching payload",
  "outcome":"teach by comparison, not just prose",
  "objectives":[{"title":"Learn by comparison",
    "read":{"prose":"The structured payload widens read into prose plus optional teaching members.",
      "analogy":{"source":"a recipe card","target":"a worked example",
        "mapping":"a recipe lists ingredients then numbered steps; a worked example lists the setup then numbered solved steps",
        "refs":["FR-003"]},
      "contrast":{"caseA":"analogy","caseB":"contrast",
        "dimensions":[{"label":"structure","a":"one mapping","b":"two cases + dimensions"}],"refs":["FR-002"]}},
    "quiz":{"question":"Which member is optional and additive per FR-006?",
      "options":["none, all required","every teaching member","only illustration"],"correctIndex":1,
      "feedback":["","right — every member is optional",""]},
    "refs":["FR-001"]}]}' \
  | SPECTASTIC_AI_STUB=/tmp/pass.json node packages/cli/bin/spectastic course --target 060-course-teaching-payload --keep
```

**Assert** exit 0 and a course written under `.spectastic/courses/<date>-060-course-teaching-payload/course.html`.

**Reject case** — the same draft, but the blind check flags the analogy (`"output":"yes"`):

```bash
cat > /tmp/reject.json <<'EOF'
{"subagent":[{"output":"0"},{"output":"yes"}]}
EOF
# … same stdin JSON as above …
  | SPECTASTIC_AI_STUB=/tmp/reject.json node packages/cli/bin/spectastic course --target 060-course-teaching-payload
```

**Assert** exit 1, and stderr names the failure as `misleading-analogy` with the flagged mapping — the item the
agent's regenerate-or-drop loop must act on. ([FR-005](./spec.html#FR-005), [SC-002](./spec.html#SC-002))

**Open the pass-case course in a browser** — the analogy renders as a source→target callout, the contrast as a
two-column table; both are legible in the Read tab alongside the existing quiz/teach-back. ([SC-001](./spec.html#SC-001))

*Run 26 Jul 2026 against this very spec (`060-course-teaching-payload`) as the target — both cases behaved exactly
as asserted above; the pass-case course was opened and eyeballed in a browser.*

## Real-LLM quality smoke (needs `ANTHROPIC_API_KEY`, local-only)

Run `/spectastic.explain --course <a real spec>` in a Claude Code session, letting the agent draft a structured
objective (an analogy + a contrast) and the kernel verify against a real model:

- **Analogy quality** — read the drafted analogy; does the mapping actually illuminate the target, or is it a
  stretch? The blind check only catches *gross* mis-mappings ([FR-005](./spec.html#FR-005)) — subtler misses stay
  a human-review ceiling, recorded in the spec's out-of-scope.
- **Contrast quality** — are the chosen dimensions the ones that actually distinguish the two cases, or filler?
- **Grounding** — open every cited ref across every member; all resolve to real source, none invented.
  ([SC-001](./spec.html#SC-001), [FR-004](./spec.html#FR-004))
- **Backward compatibility** — a course drafted with no structured payload at all (plain `read` string) still
  generates and renders exactly as it did before this spec landed. ([FR-006](./spec.html#FR-006))

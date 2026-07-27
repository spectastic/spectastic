---
slug: 001-foundations
origin: spectastic project documentation
origin-url: https://github.com/spectastic/spectastic
edition: 2026-07-25
license: MIT
converter: hand-authored
content-hash: sha256:0417938e7b32f80e84dc56ff8bcdcf13cc298b4ca911b8734a2e04865f771c97
status: not-yet-spot-checked
---

# Spec-driven development, RFC 2119, and grounding

Three concepts spectastic's own lifecycle rests on, described here as the project's own reference — not a
third-party excerpt.

## Spec-driven development (SDD)

Spec-driven development treats the specification as the source of truth a system is built *from*, rather than
documentation written *about* a system after the fact. Spectastic's own lifecycle is a direct instance:
`principles → spec → plan → tasks → implement → propose → apply → triage`. Each stage produces a durable,
single-file HTML artifact; a later stage reads the earlier ones rather than re-deriving intent from
conversation history or tribal knowledge. The discipline pays off precisely when a decision needs to be
revisited months later — the spec still says what was wanted, the plan still says why a particular approach
was chosen, and the tasks still show what shipped against which requirement.

## RFC 2119 — conformance keywords

Every requirement in a spectastic spec uses one of three keywords, defined by [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
(Bradner, 1997) — "Key words for use in RFCs to Indicate Requirement Levels":

- **MUST** — an absolute requirement. Its absence is a defect.
- **SHOULD** — a strong recommendation; a reason to deviate must exist and should be documented.
- **MAY** — genuinely optional; either choice is conforming.

Wrapping each keyword in `<spec-rule>` (or `<spec-rule level="should">` / `<spec-rule level="may">`) makes the
conformance level machine-greppable as well as human-readable — a validate rule or a downstream tool can find
every `must`-tier requirement without parsing prose.

## The grounding discipline

Per `REQ-LIFECYCLE-006` of the meta-spec, `/spectastic.plan` grounds every design-bearing fact against real
source before writing a decision, and classifies each as one of three states:

- **verified** — the source was opened this turn; the citation names it (a file path, a symbol, a dependency
  version, a URL).
- **spike** — decidable only by a time-boxed investigation; the investigation is run and its finding recorded,
  or deferred as the first task of the drain.
- **assumed** — taken as true without verification, because verifying now costs more than it's worth.

A `must`-tier decision may not rest on an `assumed` or unresolved-`spike` fact without an explicit
`<spec-risk status="accepted">` recording who accepted the gap and why. The discipline exists so a plan's
confidence is visible rather than uniform — a reader can tell at a glance which decisions rest on something
real and which rest on the model's (or the author's) best guess. This corpus — the one this document lives in
— is precisely what lets a *domain* fact join that same ledger as `verified`, instead of being permanently
`assumed` for lack of anything external to cite.

# Security policy

## Supported versions

Spectastic is pre-1.0. Only the newest published `0.1.0-pre.*` is supported — there are no backports
and no patch releases to older prereleases. If you are running an older build, upgrade before
reporting:

```sh
npm i -g @spectastic/cli@latest
```

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub:

> **[Report a vulnerability](https://github.com/spectastic/spectastic/security/advisories/new)**

If that is unavailable to you, email **me@briancorbin.co.uk** instead.

What to expect:

- An acknowledgement within **three business days**.
- An assessment, and a fix or an explicit decision not to fix, communicated back to you.
- Coordinated disclosure — we will agree timing with you before publishing.
- Credit in the published advisory, unless you would rather stay anonymous.

There is no bug bounty.

## What is in scope

Three parts of this tool are worth a reporter's attention, because each crosses a trust boundary:

**The pre-commit hook.** `spectastic init --tools` installs a git `pre-commit` hook that executes on
every commit in the developer's repository. Anything that lets a repository's *contents* influence
what that hook executes is in scope.

**Artifact content reaching a model.** Spectastic reads repository content — specs, principles, and a
`knowledge/` corpus — and injects it into an LLM prompt. A crafted spec or corpus document that
escapes its fence, or that carries hidden instruction a reader cannot see, is in scope. Artifacts are
data, never instructions to the tool reading them; a way to violate that is a vulnerability, not a
feature request.

**The publish path.** The four packages are published from CI with provenance attestation via GitHub
OIDC. Anything that could let an unattested or substituted artifact reach the registry under these
package names is in scope.

Also in scope, as for any CLI: path traversal or arbitrary write outside the project root, command
injection through a file path or CLI argument, and dependency vulnerabilities reachable from normal
use.

## What is out of scope

- Vulnerabilities in a **downstream project's own** specs, code, or generated artifacts. Spectastic
  scaffolds and validates; it does not vouch for what you write.
- The undecidable half of prompt injection. Whether a model *acts* on injected instruction cannot be
  guaranteed by any deterministic gate, and is recorded as a ceiling rather than claimed as a control.
  A concrete escape from the fencing mechanism, however, **is** in scope.
- Findings that require an attacker to already have write access to the repository being validated.

## Existing controls

For context on what is already gated, rather than as a claim of completeness:

- A deny-by-default content-security policy in every artifact template, and a validation rule that
  errors on executable content in a spec.
- An injection red-team fixture and a corpus scan, both run as a **blocking** `security-review` job in
  [CI](./.github/workflows/ci.yml) — a security finding fails the build rather than being logged.
- Semgrep static analysis over the tool's own source, also blocking.
- Dependabot for dependency and workflow updates, and an advisory `pnpm audit` in CI.
- npm publishing with `--provenance` from a tagged CI run only.

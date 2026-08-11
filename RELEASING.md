# Releasing

Maintainer runbook. A release is a git tag push: the workflow at [`.github/workflows/publish.yml`](.github/workflows/publish.yml) runs the gates (typecheck + tests + build + version verify) and publishes `@spectastic/cli`, `@spectastic/core`, `@spectastic/schema`, and `@spectastic/corpus` to npm with provenance attestation via GitHub OIDC.

## Before you tag

1. **Update [`CHANGELOG.md`](CHANGELOG.md).** Promote `## Unreleased` to the version you are about to cut and re-head the file with an empty `## Unreleased`. Do this *first*. The changelog drift this project accumulated came from treating it as a step after the version bump, where it is easy to skip.
2. **Bump `version` in [`CITATION.cff`](CITATION.cff)** and its `date-released`.
3. If a package README references a pinned raw-content image URL, bump the tag in that URL.
4. Once a release has shipped carrying the `engines` field, the static `node->=20` badge in the
   READMEs can become the self-updating `img.shields.io/node/v/<pkg>` form. It reads the *published*
   manifest, so it renders an error badge until then.

## Primary release path (CI-driven)

```sh
# 1. Bump the version in all four packages to the same value.
$EDITOR packages/cli/package.json     # e.g. "version": "0.1.0-pre.3"
$EDITOR packages/core/package.json    # must match cli exactly
$EDITOR packages/schema/package.json  # must match cli exactly
$EDITOR packages/corpus/package.json  # must match cli exactly

# 2. Commit and tag (the v prefix is required; matches the workflow trigger).
git commit -am "v0.1.0-pre.3"
git tag v0.1.0-pre.3
git push --follow-tags
```

The workflow:

- Runs typecheck + tests + build. **Refuses to publish if any gate fails.**
- Verifies the tag-derived version (`v0.1.0-pre.3` → `0.1.0-pre.3`) matches the `version` field in **all four** packages' `package.json`. Refuses on mismatch.
- Derives the dist-tag set via [`scripts/derive-dist-tag.mjs`](scripts/derive-dist-tag.mjs), keyed on whether a **stable release exists** — not on the version string. While no bare-semver version has ever been published, a pre-release moves **both** `next` and `latest`, so `npm i -g @spectastic/cli` resolves to the newest build instead of freezing on an old one. Once `1.0.0` ships the guard engages by itself: pre-releases go to `next` only, keeping a bare `npm i` off them. An undeterminable registry state fails the run rather than guessing a tag.
- Publishes all four packages in one `pnpm publish -r` invocation with `--provenance --access public`, then applies any additional dist-tag. The provenance attestation appears on each version's npmjs.com page as a verified-source badge linking to the commit and workflow run.

Watch the run in the [Actions tab](https://github.com/spectastic/spectastic/actions/workflows/publish.yml).

## Rolling back a bad release

Because `latest` tracks the newest pre-release until `1.0.0` ships, a bad release becomes the default install for everyone running `npm i -g @spectastic/cli`. Demote it by pointing `latest` back at the last known-good version — npm cannot cleanly unpublish, so re-tagging *is* the rollback:

```sh
npm login                       # a maintainer of @spectastic
LAST_GOOD=0.1.0-pre.17          # the version to fall back to

for PKG in @spectastic/cli @spectastic/core @spectastic/schema @spectastic/corpus; do
  npm dist-tag add "$PKG@$LAST_GOOD" latest
done

# Confirm every package agrees before telling anyone it's fixed.
for PKG in @spectastic/cli @spectastic/core @spectastic/schema @spectastic/corpus; do
  npm view "$PKG" dist-tags
done
```

Leave `next` pointing at the bad version so the failure stays reproducible, and cut a fixed release rather than reusing the burned version number — npm forbids republishing one. If the publish itself half-succeeded (published, but the dist-tag step failed), the workflow goes red; the same commands finish the job.

## Emergency local fallback

If CI is unavailable, a maintainer can publish from their laptop:

```sh
npm login                       # authenticate as a maintainer of @spectastic
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test
pnpm -r build                   # re-runs prebuild so _bundled/ is fresh
pnpm publish -r \
  --provenance \
  --access public \
  --tag next                    # or "latest" for a bare semver release

# Pre-1.0, also move `latest` so the bare install isn't left on an old build
# (this is what the workflow's derive step does for you — see above).
for PKG in @spectastic/cli @spectastic/core @spectastic/schema @spectastic/corpus; do
  npm dist-tag add "$PKG@$(node -p "require('./packages/cli/package.json').version")" latest
done
```

The local fallback uses your laptop's npm token (in `~/.npmrc`), not the CI's `NPM_TOKEN` secret. `--provenance` from a local machine requires an npm trusted-publisher configuration; without it, the published version will not show a provenance badge until republished via CI.

## One-time bootstrap

Before the first publish, a maintainer must (one-off):

1. Create or confirm the `@spectastic` npm organization (`npm org create spectastic` if it doesn't exist).
2. Generate a granular access token scoped to **publishing** the `@spectastic` org only (not classic, not org-admin).
3. Add it as the `NPM_TOKEN` secret in this repo's GitHub Actions settings (Settings → Secrets and variables → Actions).

These steps happen on `npmjs.com` and `github.com`, not in this repo.


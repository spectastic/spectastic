#!/usr/bin/env node
/**
 * Prebuild bundler for @spectastic/cli.
 *
 * Copies the repo-root lifecycle source-of-truth into packages/cli/_bundled/
 * so the published npm package can ship them as real files. Runs before
 * `tsup` per the build script in package.json.
 *
 * Atomic: writes to _bundled.tmp/ first, then renames the directory.
 * An interrupted run leaves no partial bundle.
 *
 * Per D-003 of specs/003-init-node-port/design.html.
 */

import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(here, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');

const FINAL = join(PACKAGE_ROOT, '_bundled');
const TMP = join(PACKAGE_ROOT, '_bundled.tmp');

const SOURCES = [
  // (sourceRelativeToRepoRoot, destinationRelativeToBundleRoot)
  ['commands', '.claude/commands'],
  // Subagent definitions (spec 044-verb-model-policy) — the isolated model-pinned
  // fan-out agents (critic/classifier/impl-task). Same install shape as commands.
  ['agents', '.claude/agents'],
  // The whole assets/ directory ships into every scaffolded project, so it holds
  // only the design system. Repository imagery (README screenshots) lives in
  // docs/images/ — putting it here would install it into downstream projects.
  ['assets', 'assets'],
  ['templates', 'templates'],
  // Verb tier manifest — read by init to keep extended verbs out of the
  // default install (specs/018-explain/design.html D-002, T-312). Lives at the
  // bundle root, not under an installed subdir, so it is never written to cwd.
  ['commands.json', 'commands.json'],
  // Init profile manifest — read by `init --profile` to compose principles/
  // AGENTS/CLAUDE (spec 041). Bundle-root, read-only, never written to cwd.
  ['spectastic-profiles.json', 'spectastic-profiles.json'],
];

async function main() {
  // Clean any leftover tmp dir from a prior interrupted run.
  if (existsSync(TMP)) {
    await rm(TMP, { recursive: true, force: true });
  }

  await mkdir(TMP, { recursive: true });

  for (const [src, dest] of SOURCES) {
    const sourcePath = join(REPO_ROOT, src);
    const destPath = join(TMP, dest);
    if (!existsSync(sourcePath)) {
      throw new Error(
        `prebuild: source missing at ${sourcePath}. Run from a clean checkout.`,
      );
    }
    await mkdir(dirname(destPath), { recursive: true });
    await cp(sourcePath, destPath, { recursive: true });
  }

  // For the 8 slash-command files: rename commands/spectastic.*.md to
  // .claude/commands/spectastic.*.md (the destination structure init writes).
  // Above already copies commands/ → .claude/commands/ wholesale, so we're done.

  // Render the Codex Agent-Skills adapters into the bundle (spec
  // 111-codex-skill-adapters, D-007). Rendering happens here, at build time,
  // from the one source of truth (commands/*.md) — so the scaffold copy stays a
  // dumb file copy and the translator (with its yaml dep) never loads on the
  // init runtime cold path. `@spectastic/core` is built before cli under the
  // topo `pnpm -r build`, so its dist is present here.
  const { translateToSkill } = await import('@spectastic/core/skills/translate').catch((err) => {
    throw new Error(
      `prebuild: could not load @spectastic/core/skills/translate — build core first (pnpm -r build). ${err.message}`,
    );
  });
  const commandsSrc = join(REPO_ROOT, 'commands');
  const commandFiles = (await readdir(commandsSrc)).filter((f) => /^spectastic\..*\.md$/.test(f));
  for (const file of commandFiles) {
    const md = await readFile(join(commandsSrc, file), 'utf8');
    const { relPath, content } = translateToSkill(md, file);
    const out = join(TMP, '.agents', 'skills', relPath);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, content, 'utf8');
  }
  console.log(`prebuild: rendered ${commandFiles.length} Codex skills → _bundled/.agents/skills`);

  // Atomic swap: remove old final, rename tmp into place.
  if (existsSync(FINAL)) {
    await rm(FINAL, { recursive: true, force: true });
  }
  await rename(TMP, FINAL);

  console.log(`prebuild: bundled ${SOURCES.length} source trees → ${FINAL}`);
}

main().catch((err) => {
  console.error('prebuild failed:', err.message);
  process.exit(1);
});

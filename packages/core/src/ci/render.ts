/**
 * The CI gate renderer (spec 121-init-ci-gate, D-001, D-004, D-005). Pure and
 * dependency-free — no `yaml` import, no filesystem access — because
 * `packages/cli/src/commands/init/tools.ts` statically imports whatever this
 * module needs, and `tools.ts` sits on `init --help`'s 150 ms cold-start
 * budget (bench `init-help-cold-start`). String templating only.
 *
 * Three callers share this one function: the installer
 * (`packages/cli/src/commands/init/ci.ts`) writes what it renders, the
 * drift scan (`packages/cli/src/commands/validate.ts`) re-renders with the
 * running CLI's version and compares bytes, and `scripts/render-ci-examples.mjs`
 * renders the `example` mode into `docs/ci-examples/`.
 */

/** The two CI hosts this spec targets (121 FR-002). */
export type CiHost = 'github' | 'gitlab';

/** `managed` = installed by `init --tools`, carries the marker, pinned to an
 *  exact CLI version. `example` = the unmarked, `@latest`-pinned render that
 *  backs `docs/ci-examples/` (FR-012). */
export type CiRenderMode = 'managed' | 'example';

export interface CiRenderOptions {
  /** The CLI version to pin every step to (managed mode) or `'latest'` (example mode). */
  cliVersion: string;
  mode?: CiRenderMode;
}

export interface RenderedCiFile {
  host: CiHost;
  /** Path relative to the project root this file is written at. */
  relPath: string;
  content: string;
}

/** Line 1 of every managed gate file. Carries no internal id (P-10). */
export const CI_MANAGED_MARKER =
  '# spectastic guarantee-layer CI gate — managed by `spectastic init --tools`; do not edit by hand';

/** Line 2 of every managed gate file — the regenerate hint, also id-free. */
const CI_REFRESH_HINT =
  '# Re-run `spectastic init --tools --ci-only` to refresh it; `spectastic validate` reports drift.';

/** The managed path for each host, relative to the project root. */
export const CI_FILE_PATHS: Readonly<Record<CiHost, string>> = Object.freeze({
  github: '.github/workflows/spectastic.yml',
  gitlab: '.gitlab/ci/spectastic.yml',
});

/** The artifact globs the gate validates — the single source `hook.ts` re-exports (D-001). */
export const CI_ARTIFACT_GLOBS = ['specs/**/*.html', '*.html', 'examples/*.html'] as const;

/** The Node major the rendered workflow runs on (D-005) — test-guarded against `engines.node`. */
export const CI_NODE_VERSION = '22';

/** Action pins, matching this repo's own `.github/workflows/ci.yml` majors (D-005). Test-guarded. */
export const ACTION_PINS = Object.freeze({
  checkout: 'actions/checkout@v7',
  setupNode: 'actions/setup-node@v7',
  uploadSarif: 'github/codeql-action/upload-sarif@v4',
  uploadArtifact: 'actions/upload-artifact@v4',
});

/** True when `content`'s first line is the managed marker. */
export function isCiManaged(content: string): boolean {
  return content.split('\n', 1)[0] === CI_MANAGED_MARKER;
}

function cliRef(version: string): string {
  return `@spectastic/cli@${version}`;
}

function globList(): string {
  return CI_ARTIFACT_GLOBS.map((g) => `'${g}'`).join(' ');
}

function renderGitHub(cliVersion: string, managed: boolean): string {
  const cli = cliRef(cliVersion);
  const lines: string[] = [];
  if (managed) {
    lines.push(CI_MANAGED_MARKER, CI_REFRESH_HINT);
  } else {
    lines.push(
      '# Example GitHub Actions workflow rendered by the same renderer `spectastic init --tools`',
      '# installs. Copy this file into .github/workflows/ in your project, or run that command',
      "# to keep it managed and drift-checked instead.",
    );
  }
  lines.push(
    'name: spectastic',
    'on:',
    '  pull_request:',
    '  push:',
    '    branches: [main, master]',
    'permissions:',
    '  contents: read',
    '  security-events: write',
    'jobs:',
    '  gate:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    `      - uses: ${ACTION_PINS.checkout}`,
    '        with:',
    '          fetch-depth: 0',
    `      - uses: ${ACTION_PINS.setupNode}`,
    '        with:',
    `          node-version: '${CI_NODE_VERSION}'`,
    '      - name: Validate the artifact corpus',
    `        run: npx --yes ${cli} validate --format sarif ${globList()} > spectastic.sarif`,
    '      - name: Upload findings to code scanning',
    '        if: ${{ !cancelled() }}',
    `        uses: ${ACTION_PINS.uploadSarif}`,
    '        with:',
    '          sarif_file: spectastic.sarif',
    '          category: spectastic',
    '      - name: Enforce the profile floor',
    '        if: ${{ !cancelled() }}',
    `        run: npx --yes ${cli} enforce`,
    '      - name: Merge verdict for the changed paths',
    "        if: ${{ !cancelled() && github.event_name == 'pull_request' }}",
    '        env:',
    '          BASE_REF: ${{ github.base_ref }}',
    '        run: |',
    '          BASE="$(git merge-base "origin/$BASE_REF" HEAD)"',
    '          CHANGED="$(git diff --name-only "$BASE" HEAD)"',
    '          if [ -z "$CHANGED" ]; then echo "No changed paths to judge."; exit 0; fi',
    '          # one path per word; paths containing whitespace are not supported here',
    `          npx --yes ${cli} verdict --changed $CHANGED --out .spectastic/verdict.json`,
    '          # a project with its own enforcer output can pass it through, e.g.:',
    `          # npx --yes ${cli} verdict --changed $CHANGED --enforcer-output enforcer.sarif --out .spectastic/verdict.json`,
    '      - name: Upload the verdict',
    "        if: ${{ !cancelled() && github.event_name == 'pull_request' }}",
    `        uses: ${ACTION_PINS.uploadArtifact}`,
    '        with:',
    '          name: spectastic-verdict',
    '          path: .spectastic/verdict.json',
    '          if-no-files-found: ignore',
    '',
  );
  return lines.join('\n');
}

function renderGitLab(cliVersion: string, managed: boolean): string {
  const cli = cliRef(cliVersion);
  const lines: string[] = [];
  if (managed) {
    lines.push(CI_MANAGED_MARKER, CI_REFRESH_HINT);
  } else {
    lines.push(
      '# Example GitLab CI job rendered by the same renderer `spectastic init --tools`',
      '# installs. Copy this file into .gitlab/ci/ and include it from .gitlab-ci.yml, or',
      '# run that command to keep it managed and drift-checked instead.',
    );
  }
  lines.push(
    'spectastic-gate:',
    '  stage: .pre',
    `  image: node:${CI_NODE_VERSION}`,
    '  variables:',
    '    GIT_DEPTH: "0"',
    '  rules:',
    "    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'",
    '    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH',
    '  script:',
    '    - FAILED=""',
    `    - npx --yes ${cli} validate --format sarif ${globList()} > spectastic.sarif || FAILED=1`,
    `    - npx --yes ${cli} enforce || FAILED=1`,
    "    - |",
    "      if [ \"$CI_PIPELINE_SOURCE\" = \"merge_request_event\" ]; then",
    '        BASE="$(git merge-base "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" HEAD)"',
    '        CHANGED="$(git diff --name-only "$BASE" HEAD)"',
    '        if [ -n "$CHANGED" ]; then',
    '          # one path per word; paths containing whitespace are not supported here',
    `          npx --yes ${cli} verdict --changed $CHANGED --out .spectastic/verdict.json || FAILED=1`,
    '        fi',
    '      fi',
    '    - test -z "$FAILED"',
    '  artifacts:',
    '    when: always',
    '    reports:',
    '      sarif: spectastic.sarif',
    '    paths:',
    '      - spectastic.sarif',
    '      - .spectastic/verdict.json',
    '',
  );
  return lines.join('\n');
}

/** Render one host's gate file. Deterministic: same inputs, same bytes (NFR-001). */
export function renderCiWorkflow(host: CiHost, opts: CiRenderOptions): RenderedCiFile {
  const mode = opts.mode ?? 'managed';
  const managed = mode === 'managed';
  const content = host === 'github' ? renderGitHub(opts.cliVersion, managed) : renderGitLab(opts.cliVersion, managed);
  return { host, relPath: CI_FILE_PATHS[host], content };
}

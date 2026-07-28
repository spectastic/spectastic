/**
 * corpus convert — the converter shell-out seam (065-corpus-pdf-convert).
 *
 * A converter-agnostic wrapper that shells out to a user-installed document converter
 * (MarkItDown / Docling / Marker) and feeds the result into the existing corpus filing
 * path. The tool never bundles a converter (FR-003) — only orchestration + provenance.
 *
 * Shape mirrors the codebase's other injectable shell-out seams (AIProvider's
 * `claude-cli.ts`, PackFetcher's `GitRunner`): a real `execFile`-backed runner and a
 * stub for tests, selected by the caller rather than hard-wired. Argv is always an
 * array, never interpolated into a shell string (NFR-001, P-12).
 *
 * The orchestrator (`convertDocument`, T-110) and both CLI registrations (T-114/T-115)
 * land in later tasks; this module owns the runner + registry + filing helper's
 * counterpart export surface.
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileConvertedDocument } from './adapt.js';

const execFile = promisify(execFileCb);

/** Default child-process timeout (D-005) — a converter that hangs on an
 * encrypted/huge source is killed rather than wedging a script forever. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Resolves and runs an external converter binary. Real impl: `execFile` behind a
 * bounded, overridable timeout (D-005). Stub impl (tests): returns canned output, no
 * process ever spawned — mirrors StubPackFetcher's shape. */
export interface ConverterRunner {
  run(bin: string, argv: readonly string[], opts?: { timeoutMs?: number | undefined } | undefined): Promise<{ stdout: string }>;
}

/** One converter's shape: its binary name, how to build its argv (the heterogeneous
 * part — stdout / `-o` / an output-folder, per the spike), how to collect its markdown
 * once the process exits, an optional version probe, and the install hint shown when
 * the binary is absent (D-002). */
export interface ConverterSpec {
  /** The binary name resolved on PATH (e.g. `markitdown`). */
  bin: string;
  /** Build the argv for converting `file`; `tmpDir` is a scratch dir this converter's
   * shape may write into (docling/marker) — unused by a stdout-only converter. */
  buildArgs(file: string, tmpDir: string): string[];
  /** Turn the finished run into markdown text — from stdout directly, or by reading
   * whatever `buildArgs` told the converter to write under `tmpDir`. */
  collectOutput(run: { stdout: string }, tmpDir: string, file: string): string;
  /** Argv to probe the converter's version, when the tool exposes one. Omitted
   * entirely for a converter with no such flag — the field then always renders the
   * literal `TODO` rather than fabricating a version. */
  versionArgs?: string[];
  /** Shown when the binary isn't found on PATH — a copy-paste install command. */
  installHint: string;
}

/** The real runner: `execFile(bin, argv, { timeout })` — argv is always an array,
 * never interpolated into a shell string (NFR-001, P-12). A timeout kills the child
 * and rejects; the caller (convertDocument, T-111) turns that into a clean non-zero
 * exit with no partial write. */
export class ExecFileConverterRunner implements ConverterRunner {
  async run(bin: string, argv: readonly string[], opts?: { timeoutMs?: number | undefined }): Promise<{ stdout: string }> {
    const { stdout } = await execFile(bin, [...argv], {
      timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout };
  }
}

/** Test double — never spawns a process. Returns a fixed result, or (to
 * differentiate a version-probe call from the main conversion call) a function of
 * the argv it was invoked with. Records every call it received, for assertions on
 * the argv a spec built. Mirrors `StubPackFetcher`'s shape. */
export class StubConverterRunner implements ConverterRunner {
  public readonly calls: Array<{ bin: string; argv: readonly string[]; opts: { timeoutMs?: number | undefined } | undefined }> = [];

  constructor(
    private readonly result: { stdout: string } | ((bin: string, argv: readonly string[]) => { stdout: string }) = { stdout: '' },
  ) {}

  async run(bin: string, argv: readonly string[], opts?: { timeoutMs?: number | undefined }): Promise<{ stdout: string }> {
    this.calls.push({ bin, argv, opts });
    return typeof this.result === 'function' ? this.result(bin, argv) : this.result;
  }
}

/** A managed scratch directory for a converter whose shape writes to disk (docling,
 * marker) rather than stdout. Always cleaned up by the caller in a `finally`,
 * regardless of outcome — nothing from a conversion run should outlive it. */
export function createConverterTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'spectastic-corpus-convert-'));
}

export function removeConverterTmpDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** The documented, converter-agnostic set (D-002). A lookup against this registry is
 * how an unrecognised `--converter` name is rejected before any process runs
 * (FR-002) — see `resolveConverterSpec` below. */
export const CONVERTERS: Record<string, ConverterSpec> = {
  markitdown: {
    bin: 'markitdown',
    // MarkItDown's own default: convert a file straight to stdout.
    buildArgs: (file) => [file],
    collectOutput: (run) => run.stdout,
    versionArgs: ['--version'],
    installHint: 'pip install markitdown',
  },
  docling: {
    bin: 'docling',
    // Docling writes `<tmpDir>/<stem>.md` when given an output directory.
    buildArgs: (file, tmpDir) => [file, '--to', 'md', '--output', tmpDir],
    collectOutput: (_run, tmpDir, file) => {
      const stem = basename(file).replace(/\.[^.]+$/, '');
      return readFileSync(join(tmpDir, `${stem}.md`), 'utf8');
    },
    versionArgs: ['--version'],
    installHint: 'pip install docling',
  },
  marker: {
    bin: 'marker_single',
    // marker_single creates its own per-document subfolder under the output dir.
    buildArgs: (file, tmpDir) => [file, tmpDir, '--output_format', 'markdown'],
    collectOutput: (_run, tmpDir, file) => {
      const stem = basename(file).replace(/\.[^.]+$/, '');
      return readFileSync(join(tmpDir, stem, `${stem}.md`), 'utf8');
    },
    // marker_single exposes no documented version flag (spec §6 Assumptions) — no
    // versionArgs, so the `converter` provenance field always records the literal
    // TODO for the version rather than fabricating one.
    installHint: 'pip install marker-pdf',
  },
};

/** Resolve a `--converter` name to its spec, or throw before any process runs — the
 * pre-run rejection FR-002 requires. `registry` defaults to the real `CONVERTERS` and
 * exists as an override seam for tests exercising a real converter shape against a
 * fixture binary without mutating the shared registry (mirrors `resolveCitation`'s
 * own registry-injection pattern). */
export function resolveConverterSpec(name: string, registry: Record<string, ConverterSpec> = CONVERTERS): ConverterSpec {
  const spec = registry[name];
  if (!spec) {
    throw new Error(`Unknown converter "${name}"; expected one of: ${Object.keys(registry).join(', ')}`);
  }
  return spec;
}

/** The chosen converter binary isn't on PATH — a hard, clean failure (FR-003, SC-002):
 * non-zero, an actionable install hint, and (by construction — thrown before any pack
 * write is attempted) no partial write. */
export class ConverterNotFoundError extends Error {
  constructor(
    public readonly converter: string,
    public readonly installHint: string,
  ) {
    super(`Converter "${converter}" not found on PATH. ${installHint}`);
    this.name = 'ConverterNotFoundError';
  }
}

export interface ConvertDocumentInput {
  /** Absolute path to the source file to convert (any format the chosen converter
   * handles — no extension allowlist here; FR-006). */
  sourceFile: string;
  /** Registry name; defaults to `markitdown`. */
  converter?: string;
  runner: ConverterRunner;
  timeoutMs?: number;
  /** Required unless `noAdapt` is set. */
  knowledgeDir?: string;
  pack?: string;
  /** Raw-emit mode (FR-005): skip filing entirely; return the markdown, or write it
   * to `out` when given. No pack is read or written either way. */
  noAdapt?: boolean;
  out?: string;
  /** Override registry for tests; defaults to the real `CONVERTERS`. */
  registry?: Record<string, ConverterSpec>;
}

export interface ConvertDocumentResult {
  /** Present unless `noAdapt` was set. */
  id?: string;
  filePath?: string;
  /** The converter name used, exactly as recorded in provenance. */
  converter: string;
  /** Present only for `noAdapt` without `out` (the stdout case). */
  markdown?: string;
}

/**
 * The convert orchestrator (065-corpus-pdf-convert, US1, D-001/D-002/D-004): validate
 * the converter name against the registry (pre-run — FR-002), run it via the injected
 * `ConverterRunner`, collect its markdown however that converter's shape delivers it,
 * and either file the result through `fileConvertedDocument` or — in `--no-adapt`
 * mode — emit the markdown without touching any pack.
 */
export async function convertDocument(input: ConvertDocumentInput): Promise<ConvertDocumentResult> {
  const converterName = input.converter ?? 'markitdown';
  const spec = resolveConverterSpec(converterName, input.registry ?? CONVERTERS); // throws before any process runs

  const tmpDir = createConverterTmpDir();
  let markdown: string;
  try {
    const argv = spec.buildArgs(input.sourceFile, tmpDir);
    let run: { stdout: string };
    try {
      run = await input.runner.run(spec.bin, argv, { timeoutMs: input.timeoutMs });
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new ConverterNotFoundError(converterName, spec.installHint);
      }
      throw err;
    }
    markdown = spec.collectOutput(run, tmpDir, input.sourceFile);
  } finally {
    // Always cleaned up, success or failure — nothing from a run outlives it.
    removeConverterTmpDir(tmpDir);
  }

  // Best-effort version probe (T-311): only attempted when the spec exposes one; a
  // failed or absent probe leaves the bare converter name — never a fabricated
  // version (spec §6 assumptions).
  let converterField = converterName;
  if (spec.versionArgs) {
    try {
      const versionRun = await input.runner.run(spec.bin, spec.versionArgs, { timeoutMs: input.timeoutMs });
      const version = versionRun.stdout.trim().split(/\s+/).pop();
      if (version) converterField = `${converterName} ${version}`;
    } catch {
      // Version is cosmetic provenance detail — a probe failure must never fail
      // the conversion itself.
    }
  }

  if (input.noAdapt) {
    if (input.out) {
      writeFileSync(input.out, markdown, 'utf8');
      return { converter: converterField };
    }
    return { converter: converterField, markdown };
  }

  if (!input.knowledgeDir || !input.pack) {
    throw new Error('convertDocument: knowledgeDir and pack are required unless --no-adapt is set');
  }

  const filed = fileConvertedDocument({
    sourceFile: input.sourceFile,
    markdown,
    knowledgeDir: input.knowledgeDir,
    pack: input.pack,
    converter: converterField,
  });

  return { id: filed.id, filePath: filed.filePath, converter: converterField };
}

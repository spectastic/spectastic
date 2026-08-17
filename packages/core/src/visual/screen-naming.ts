/**
 * The screen-naming check (spec 093-design-visual-section, FR-014/FR-015,
 * applied change 2026-08-14-a-screen-has-a-name).
 *
 * A design declaring `shape="screens"` names the screens the feature addresses,
 * by the id each screen declares for itself. This checks that claim against the
 * declared material in both directions: a screen in the material that the design
 * never names, and a name that resolves to no screen.
 *
 * **The direction matters and is the requirement's own emphasis.** The named set
 * is the authority for what the feature *claims*; the material is read only to
 * test that claim, never to derive it. Deriving the addressed set from whatever
 * is on disk is what an earlier round did and what 094 §4 forbids — an
 * undeclared file would join the feature by existing. Reading the same bytes to
 * falsify an authored claim is a different act, and it costs no new I/O: the
 * resolve scan this rides has already stat-ed the path.
 *
 * **The antecedent is `shape="screens"`, not "declares a visual surface".** An
 * explicit `shape="none"` is itself a design declaring its visual surface —
 * FR-007 requires that record — so a completeness floor read loosely would turn
 * an honest no-surface declaration into an error. 093 T-001 flagged the
 * ambiguity a round ago without choosing; FR-014 chooses, and this is where the
 * choice is executable.
 *
 * **Completeness, not non-emptiness.** An earlier draft required "at least one"
 * screen, which would have let the exemplar name `convert` alone and leave the
 * one-versus-three discrepancy that started three rounds still unreported. The
 * folded task list still carries that wording; the requirement does not, and the
 * requirement is the authority.
 *
 * **Silence on an unreadable path is deliberate.** `visual-resolve` already
 * reports a declared path that does not exist, so reporting it again here would
 * turn one defect into two findings pointing at one line. A path that cannot be
 * read yields no claim to test.
 */

import { projectScreens } from './materialise-view.js';
import type { Finding, FileSystem } from '../types.js';

export interface ScreenNamingClaim {
  /** Project-relative path of the declared material. */
  screens: string;
  /** Raw `addresses=` value, or undefined when the design names none. */
  addresses: string | undefined;
  line: number;
  column: number;
}

/** Split a raw `addresses=` value on whitespace. Absent and empty both yield
 *  no names — a design naming nothing and a design naming the empty string are
 *  the same claim, and neither is worth distinguishing in a finding. */
function namedScreens(addresses: string | undefined): string[] {
  if (addresses === undefined) return [];
  return addresses.trim().split(/\s+/).filter((s) => s.length > 0);
}

interface MaterialScreen {
  id: string;
  /** The name it is addressed by (095 FR-013) — the coordinate's second
   *  segment, separate from `id` so a collision is fixable without renaming
   *  the identifier annotations already point at. */
  name: string | undefined;
  /** The file it was declared in, so a collision can name both. */
  file: string;
}

/** Read every `<spec-screen>` behind a declared path. Returns null when the
 *  path cannot be read, so the caller can stay silent rather than guess. */
async function screensInMaterial(screens: string, fs: FileSystem, cwd: string): Promise<MaterialScreen[] | null> {
  try {
    const stat = await fs.stat(`${cwd}/${screens}`);
    const files = stat.isDirectory
      ? (await fs.readdir(`${cwd}/${screens}`)).filter((f) => f.endsWith('.html')).map((f) => `${screens}/${f}`)
      : [screens];
    const out: MaterialScreen[] = [];
    for (const f of files) {
      // The row budget truncates STATES, never screens, so the set is complete
      // regardless of how large the material is. Checked, not assumed.
      const html = await fs.readFile(`${cwd}/${f}`);
      const projected = projectScreens(html, f);
      for (const s of projected.screens) {
        if (s.id === '') continue;
        // `projectScreens` is the view's model and does not carry `name=`;
        // reading it here rather than widening that model keeps the view's
        // shape owned by the view.
        const decl = new RegExp(String.raw`<spec-screen\b[^>]*\bid="${s.id}"[^>]*>`, 'i').exec(html)?.[0];
        const name = decl === undefined ? undefined : /\bname="([^"]*)"/i.exec(decl)?.[1];
        out.push({ id: s.id, name, file: f });
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Report a screen the design does not name, and a name that resolves to nothing.
 * Both at error severity (FR-014).
 */
export async function visualScreenNamingFindings(
  claims: readonly ScreenNamingClaim[],
  file: string,
  fs: FileSystem,
  cwd: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const claim of claims) {
    const material = await screensInMaterial(claim.screens, fs, cwd);
    if (material !== null) {
      // 095 FR-013: two screens in ONE SPEC resolving to one name. Cross-file by
      // construction — `screen-shape` already checks id uniqueness within a
      // document, and a spec's screens are a DIRECTORY of them, so the
      // collision this reports is precisely the one a per-file rule cannot see.
      const byName = new Map<string, MaterialScreen[]>();
      for (const m of material) {
        if (m.name === undefined || m.name === '') continue; // screen-shape owns the absence
        const bucket = byName.get(m.name) ?? [];
        bucket.push(m);
        byName.set(m.name, bucket);
      }
      for (const [name, group] of byName) {
        if (group.length < 2) continue;
        findings.push({
          file,
          line: claim.line,
          column: claim.column,
          rule: 'visual-screen-naming',
          severity: 'error',
          message: `two screens in ${claim.screens} are both addressed as "${name}" — ${group
            .map((g) => `${g.file} (id="${g.id}")`)
            .join(' and ')}`,
          fixHint:
            'Give one of them a different name= (spec.html FR-013). Change the name rather than the id: the id is what annotations, traces and reviews already point at, which is why the addressable name is a separate attribute.',
        });
      }
    }
    if (material === null) continue; // visual-resolve owns the unreadable path
    const ids = material.map((m) => m.id);
    const named = namedScreens(claim.addresses);
    const inMaterial = new Set(ids);
    const isNamed = new Set(named);

    for (const id of ids) {
      if (isNamed.has(id)) continue;
      findings.push({
        file,
        line: claim.line,
        column: claim.column,
        rule: 'visual-screen-naming',
        severity: 'error',
        message: `screen "${id}" is in ${claim.screens} but ${file} does not name it`,
        fixHint:
          'Add it to <spec-visual addresses="…"> (spec.html FR-014). The list says which screens this feature claims; a screen present and unnamed is either unclaimed work or an omission, and the two are indistinguishable from outside.',
      });
    }
    for (const name of named) {
      if (inMaterial.has(name)) continue;
      findings.push({
        file,
        line: claim.line,
        column: claim.column,
        rule: 'visual-screen-naming',
        severity: 'error',
        message: `${file} names screen "${name}", which is not in ${claim.screens}`,
        fixHint:
          'Check the id against the screen\'s own <spec-screen id="…"> (spec.html FR-015). A name is written by hand and the id it points at is not, so a rename propagates in one direction only.',
      });
    }
  }
  return findings;
}

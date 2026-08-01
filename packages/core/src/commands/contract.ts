/**
 * The contract-coordinate resolution engine (spec 076-contract-export-handover,
 * US1 / FR-001). Reads this project's identity, finds the declared contract by
 * its stable coordinate name, and prints the contract's content.
 *
 * READ-ONLY and offline by construction (FR-004): it resolves a coordinate
 * against this repository's own declarations and prints what is already on
 * disk. It never fetches a remote coordinate, never spawns a subprocess, and
 * adds no capability — which is what lets the same coordinate serve a vendoring
 * recipe and a published-artifact recipe without either being blessed.
 *
 * Deliberately plain, not the KernelContext/injectable-fs shape, matching
 * `id.ts`'s precedent for the same reason: `resolveProjectConfig` is real-fs
 * only, so an injection seam here would add a layer for no testing benefit.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProjectConfig } from '@spectastic/corpus';
import { contractCoordinateName, readContractDeclarations } from '@spectastic/schema/contract';
import { contractResourceUri } from '@spectastic/schema/project';

export interface ContractResolveInput {
  /** The coordinate name, or a full `spectastic://…/contract/<name>` URI. */
  coordinate: string;
}

export interface ContractResolveResult {
  /** The canonical coordinate this resolved to. */
  uri: string;
  /** The declared path the contract's file sits at, in this repo. */
  path: string;
  /** The contract file's content. */
  content: string;
}

/** No declared contract carries this coordinate name in this project. */
export class UnknownContractError extends Error {
  constructor(
    public readonly coordinate: string,
    public readonly known: readonly string[],
  ) {
    const list = known.length > 0 ? ` Known: ${known.join(', ')}.` : ' This project declares no contracts.';
    super(`No contract found for "${coordinate}" in this project.${list}`);
    this.name = 'UnknownContractError';
  }
}

/** A coordinate resolves to a declaration whose file is not on disk. */
export class UnresolvedContractError extends Error {
  constructor(
    public readonly coordinate: string,
    public readonly path: string,
  ) {
    super(`The contract for "${coordinate}" is declared at ${path}, but no file exists there.`);
    this.name = 'UnresolvedContractError';
  }
}

/** Take the trailing name from a full coordinate URI, or return the input as-is. */
function coordinateNameOf(coordinate: string): string {
  const marker = '/contract/';
  const at = coordinate.indexOf(marker);
  if (at === -1) return coordinate;
  return coordinate.slice(at + marker.length).split('#')[0] ?? coordinate;
}

/**
 * Resolve a contract coordinate to the file it names, and read it.
 * Deterministic: reads only persisted config and declarations — no live git,
 * no clock, no network (NFR-001).
 */
export function contractCommand(input: ContractResolveInput, cwd: string): ContractResolveResult {
  const wanted = coordinateNameOf(input.coordinate);
  const { project } = resolveProjectConfig(cwd);

  // Every design in the estate may declare contracts; scan them all so a
  // coordinate resolves regardless of which spec authored it.
  let specDirs: string[] = [];
  try {
    specDirs = readdirSync(join(cwd, 'specs'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    // no specs/ — nothing declared
  }

  const known: string[] = [];
  for (const specDir of specDirs) {
    const designPath = join(cwd, 'specs', specDir, 'design.html');
    let html: string;
    try {
      html = readFileSync(designPath, 'utf8');
    } catch {
      continue;
    }
    for (const decl of readContractDeclarations(html, designPath)) {
      const name = decl.coordinateName ?? contractCoordinateName(undefined, decl.path);
      if (name === undefined || decl.path === undefined) continue;
      known.push(name);
      if (name !== wanted) continue;

      const abs = join(cwd, decl.path);
      const uri = contractResourceUri(project, name);
      if (!existsSync(abs)) throw new UnresolvedContractError(uri, decl.path);
      return { uri, path: decl.path, content: readFileSync(abs, 'utf8') };
    }
  }

  throw new UnknownContractError(input.coordinate, [...new Set(known)].sort());
}

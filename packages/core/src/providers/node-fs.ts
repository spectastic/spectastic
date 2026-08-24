/**
 * Default FileSystem implementation wrapping node:fs/promises.
 *
 * Per D-005 of specs/006-kernel-extraction/design.html. Lives in its own
 * subpath so callers running in non-Node environments (a future
 * browser-based web editor, an MCP server with capability-scoped IO)
 * don't load it. The main entry of @spectastic/core does NOT re-export
 * this; consumers import it explicitly:
 *
 *     import { nodeFs } from '@spectastic/core/providers/node-fs';
 *
 * The kernel functions also accept ctx.fs = undefined and lazy-load
 * this module internally as the default — see each command file.
 */

import {
  lstat,
  mkdir,
  readFile as readFileRaw,
  readdir,
  rename,
  rm,
  stat,
  writeFile as writeFileRaw,
} from 'node:fs/promises';
import type { FileSystem } from '../types.js';

export const nodeFs: FileSystem = {
  async readFile(path, encoding = 'utf8') {
    return readFileRaw(path, encoding);
  },
  async writeFile(path, content) {
    return writeFileRaw(path, content, 'utf8');
  },
  async readBinary(path) {
    const buf = await readFileRaw(path);
    return new Uint8Array(buf);
  },
  async writeBinary(path, content) {
    await writeFileRaw(path, content);
  },
  async readdir(path) {
    return readdir(path);
  },
  async stat(path) {
    // `lstat` first so a symbolic link is visible at all — `stat` resolves it
    // and reports the target, which is exactly the fact 105 FR-019 needs and
    // the one the plain call destroys. isFile/isDirectory keep following the
    // link, so every existing caller is unaffected; only the new flag is new.
    const l = await lstat(path);
    if (!l.isSymbolicLink()) {
      return { isFile: l.isFile(), isDirectory: l.isDirectory(), isSymbolicLink: false };
    }
    const s = await stat(path);
    return { isFile: s.isFile(), isDirectory: s.isDirectory(), isSymbolicLink: true };
  },
  async rename(from, to) {
    return rename(from, to);
  },
  async rm(path) {
    await rm(path, { recursive: true, force: true });
  },
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
};

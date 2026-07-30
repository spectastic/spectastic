/**
 * Default FileSystem implementation wrapping node:fs/promises.
 *
 * Per D-005 of specs/006-kernel-extraction/plan.html. Lives in its own
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

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import type { FileSystem } from '../types.js';

export const nodeFs: FileSystem = {
  async readFile(path, encoding = 'utf8') {
    return readFile(path, encoding);
  },
  async writeFile(path, content) {
    return writeFile(path, content, 'utf8');
  },
  async readdir(path) {
    return readdir(path);
  },
  async stat(path) {
    const s = await stat(path);
    return { isFile: s.isFile(), isDirectory: s.isDirectory() };
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

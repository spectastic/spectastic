import { defineConfig } from 'tsup';

// Two build targets (plan D-001): the extension host runs in the VS Code Node
// runtime and must be CommonJS with `vscode` left external; the webview runs in
// a browser sandbox and is bundled to a single self-contained IIFE plus its CSS.
export default defineConfig([
  {
    entry: { host: 'src/host/extension.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    platform: 'node',
    target: 'node20',
    external: ['vscode'],
    // Bundle the workspace packages (and their transitive deps, e.g. parse5)
    // INTO host.cjs — a packaged .vsix is standalone with no node_modules to
    // resolve `@spectastic/*` from. Without this the installed extension throws
    // "Cannot find module '@spectastic/schema'" on activation; the dev-host
    // only works because it resolves via the workspace symlinks.
    noExternal: [/^@spectastic\//],
    sourcemap: true,
    clean: true,
    dts: false,
  },
  {
    entry: { webview: 'src/webview/main.ts' },
    format: ['iife'],
    globalName: 'SpectasticCanvas',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    clean: false,
    dts: false,
  },
]);

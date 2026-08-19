/**
 * The one-way package boundary dependency-cruiser enforces (064-corpus-package-extraction,
 * D-004 / NFR-002 / SC-002): @spectastic/corpus is the extracted knowledge-corpus subsystem,
 * and it must never import back into @spectastic/core — the whole point of the extraction is
 * that corpus sits below core (and cli) in the package graph, depending only on
 * @spectastic/schema. A corpus→core edge would recreate the coupling this slice exists to
 * remove.
 *
 * A second, inverse-direction boundary (106-visual-render, FR-003 / D-003): @spectastic/core
 * must never import @spectastic/render — the kernel declares the render capability as a port
 * on the invocation context and MUST NOT depend on any particular browser. The Playwright
 * adapter is isolated behind the same package-boundary shape as the corpus rule, not a
 * directory one.
 *
 * Scope is intentionally the small set of forbidden rules these specs need — this is not a
 * general architecture-fitness tool adoption, just the machine-verified half of each decision.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-corpus-to-core',
      comment:
        '@spectastic/corpus must not import @spectastic/core — the extraction (064) makes ' +
        'corpus a lower layer than core; a back-edge here recreates the coupling the slice ' +
        'removes. See specs/064-corpus-package-extraction/design.html D-004.',
      severity: 'error',
      from: { path: '^packages/corpus' },
      to: { path: '^packages/core' },
    },
    {
      name: 'no-core-to-render',
      comment:
        '@spectastic/core must not import @spectastic/render — FR-003 forbids the kernel ' +
        'depending on any particular browser; the render capability is supplied to the ' +
        'kernel as a port, not imported directly. See specs/106-visual-render/spec.html ' +
        '#FR-003 and specs/106-visual-render/design.html D-003.',
      severity: 'error',
      from: { path: '^packages/core' },
      to: { path: '^packages/render' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};

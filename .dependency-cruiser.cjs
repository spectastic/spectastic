/**
 * The one-way package boundary dependency-cruiser enforces (064-corpus-package-extraction,
 * D-004 / NFR-002 / SC-002): @spectastic/corpus is the extracted knowledge-corpus subsystem,
 * and it must never import back into @spectastic/core — the whole point of the extraction is
 * that corpus sits below core (and cli) in the package graph, depending only on
 * @spectastic/schema. A corpus→core edge would recreate the coupling this slice exists to
 * remove.
 *
 * Scope is intentionally the single forbidden rule this spec needs — this is not a general
 * architecture-fitness tool adoption, just the machine-verified half of D-004.
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

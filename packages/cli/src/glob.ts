import { glob } from 'tinyglobby';

/**
 * Default exclusions: archived/withdrawn change proposals (which copy
 * stable IDs by design and would spuriously trip no-duplicate-ids),
 * node_modules, and dist output. Schema rule fixtures (which
 * intentionally violate rules) are NOT default-ignored — pass them
 * explicitly when you want to validate them.
 */
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/archive/**',
  '**/withdrawn/**',
];

/**
 * Expand the given glob patterns to a sorted list of file paths,
 * applying default + user-supplied ignore patterns.
 */
export async function expandGlobs(
  patterns: readonly string[],
  extraIgnore?: readonly string[],
): Promise<string[]> {
  const ignore = [...DEFAULT_IGNORE, ...(extraIgnore ?? [])];
  const results = await glob(patterns as string[], {
    ignore,
    onlyFiles: true,
    absolute: false,
    dot: false,
  });
  return results.sort();
}

/**
 * Read one value out of `spectastic.json` without asserting a shape.
 *
 * Deliberately tiny and deliberately forgiving: an absent file, unreadable
 * JSON or missing key all resolve to `undefined`, so a caller falls through to
 * its compiled default rather than failing on configuration it does not need.
 * The canonical typed reader is a separate, larger piece of work
 * (TBD-config-canonical-reader); this is the narrow read the drain default
 * needs and nothing more.
 */
export async function readConfigValue(section: string, key: string): Promise<unknown> {
  try {
    const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')]);
    const raw = await fs.readFile(path.resolve(process.cwd(), 'spectastic.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const s = (parsed as Record<string, unknown>)[section];
    if (typeof s !== 'object' || s === null) return undefined;
    return (s as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

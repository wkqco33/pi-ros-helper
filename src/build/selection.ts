const IGNORED = new Set(['src', 'include', 'test', 'tests', 'cpp', 'hpp', 'cc', 'h', 'ts', 'py']);

function tokens(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 3 && !IGNORED.has(token));
}

/** Select test targets whose names overlap the changed source/test concepts. */
export function selectTests(changedPaths: string[], testTargets: string[]): string[] {
  const concepts = new Set(changedPaths.flatMap(tokens));
  return testTargets.filter((target) => {
    const targetTokens = tokens(target);
    return targetTokens.some((token) =>
      [...concepts].some(
        (concept) => concept === token || concept.startsWith(token) || token.startsWith(concept),
      ),
    );
  });
}

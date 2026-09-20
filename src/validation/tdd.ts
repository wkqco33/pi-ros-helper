export interface TddCheckpoint {
  ok: boolean;
  reasons: string[];
  sourceChanges: string[];
  testChanges: string[];
}

const SOURCE = /(?:^|\/)(?:src|include)\/.*\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|py)$/i;
const TEST = /(?:^|\/)(?:test|tests)\/|(?:^|\/)test_[^/]+\.(?:cpp|cc|cxx|py)$/i;

export function checkTdd(changedPaths: string[], testChangedPaths: string[]): TddCheckpoint {
  const sourceChanges = changedPaths.filter((path) => SOURCE.test(path));
  const testChanges = [...changedPaths, ...testChangedPaths].filter((path) => TEST.test(path));
  const sourceTokens = sourceChanges.flatMap((path) =>
    path
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4 && token !== 'src'),
  );
  const relatedTest = testChanges.some((path) => {
    const testTokens = path
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4 && token !== 'test' && token !== 'tests');
    return sourceTokens.some((source) =>
      testTokens.some(
        (test) => source === test || source.startsWith(test) || test.startsWith(source),
      ),
    );
  });
  const reasons =
    sourceChanges.length && !relatedTest
      ? ['Source changes have no corresponding related test changes.']
      : [];
  return {
    ok: reasons.length === 0,
    reasons,
    sourceChanges,
    testChanges: [...new Set(testChanges)],
  };
}

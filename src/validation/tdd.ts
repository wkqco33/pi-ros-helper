/**
 * ROS's view of the shared TDD checkpoint.
 *
 * The token-overlap matching lives in `pi-helper-core`; this module only says
 * which files are production code or tests in a ROS package, so call sites keep
 * their two-argument signature.
 */
import { checkTdd as coreCheckTdd, type TddSignals } from 'pi-helper-core';

const SOURCE = /(?:^|\/)(?:src|include)\/.*\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|py)$/i;
const TEST = /(?:^|\/)(?:test|tests)\/|(?:^|\/)test_[^/]+\.(?:cpp|cc|cxx|py)$/i;

const ROS_TDD_SIGNALS: TddSignals = {
  isSourceFile: (path) => SOURCE.test(path),
  isTestFile: (path) => TEST.test(path),
  prefixTokens: new Set(['src', 'test', 'tests']),
  minTokenLength: 4,
};

export function checkTdd(
  changedPaths: string[],
  testChangedPaths: string[] = [],
): import('pi-helper-core').TddCheckpoint {
  return coreCheckTdd(changedPaths, testChangedPaths, ROS_TDD_SIGNALS);
}

export type { TddAssociation, TddCheckpoint } from 'pi-helper-core';

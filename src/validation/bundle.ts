export interface ValidationStep {
  executed: boolean;
  ok: boolean;
  exitCode?: number | null;
  failures?: number;
}

export interface ValidationSummary {
  ok: boolean;
  reason: string;
  checks: {
    build: boolean;
    test: boolean;
    staleArtifacts: boolean;
  };
}

export function summarizeValidation(input: {
  build: ValidationStep;
  test: ValidationStep;
  stale: boolean;
}): ValidationSummary {
  const build = input.build.executed && input.build.ok;
  const test = input.test.executed && input.test.ok && (input.test.failures ?? 0) === 0;
  const staleArtifacts = input.stale;
  let reason = 'Build and tests passed with current artifacts.';
  if (!input.build.executed || !input.test.executed)
    reason = 'Set execute=true to run the validation bundle.';
  else if (!build) reason = 'Build failed; inspect the first build failure before trusting tests.';
  else if (!test) reason = 'Tests failed; inspect the reported failing cases.';
  else if (staleArtifacts)
    reason = 'Tests passed, but stale test artifacts were detected; rebuild and rerun.';
  return {
    ok: build && test && !staleArtifacts,
    reason,
    checks: { build, test, staleArtifacts },
  };
}

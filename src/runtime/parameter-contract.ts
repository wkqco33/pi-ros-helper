export interface ParameterTypeMismatch {
  name: string;
  expected: string;
  actual: string;
}

export interface ParameterContractReport {
  ok: boolean;
  missing: string[];
  unknown: string[];
  typeMismatches: ParameterTypeMismatch[];
}

function normalizeType(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'bool') return 'boolean';
  if (normalized === 'int' || normalized === 'int32' || normalized === 'int64') return 'integer';
  if (normalized === 'float' || normalized === 'float32' || normalized === 'float64')
    return 'double';
  return normalized;
}

function inferType(value: string): string {
  const trimmed = value.trim();
  if (/^(true|false)$/i.test(trimmed)) return 'boolean';
  if (/^[+-]?\d+$/.test(trimmed)) return 'integer';
  if (/^[+-]?(?:\d+\.\d*|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return 'double';
  return 'string';
}

export function validateParameterContract(
  declared: Record<string, string>,
  configured: Record<string, string>,
): ParameterContractReport {
  const declaredNames = Object.keys(declared).sort();
  const configuredNames = Object.keys(configured).sort();
  const missing = declaredNames.filter((name) => !(name in configured));
  const unknown = configuredNames.filter((name) => !(name in declared));
  const typeMismatches = declaredNames.flatMap((name) => {
    if (!(name in configured)) return [];
    const expected = normalizeType(declared[name]!);
    const actual = inferType(configured[name]!);
    return expected && expected !== actual && expected !== 'any'
      ? [{ name, expected, actual }]
      : [];
  });
  return {
    ok: missing.length === 0 && unknown.length === 0 && typeMismatches.length === 0,
    missing,
    unknown,
    typeMismatches,
  };
}

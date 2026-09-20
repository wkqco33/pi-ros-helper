import test from 'node:test';
import assert from 'node:assert/strict';
import { validateParameterContract } from '../src/runtime/parameter-contract.ts';

test('parameter contract reports unknown, missing, and type-mismatched configuration', () => {
  const report = validateParameterContract(
    { queue_depth: 'integer', use_tls: 'boolean', endpoint: 'string' },
    { queue_depth: '64', use_tls: 'yes', extra: 'value' },
  );
  assert.deepEqual(report.unknown, ['extra']);
  assert.deepEqual(report.missing, ['endpoint']);
  assert.deepEqual(report.typeMismatches, [
    { name: 'use_tls', expected: 'boolean', actual: 'string' },
  ]);
  assert.equal(report.ok, false);
});

test('parameter contract accepts equivalent scalar representations', () => {
  const report = validateParameterContract(
    { enabled: 'bool', ratio: 'double', count: 'int' },
    { enabled: 'true', ratio: '0.5', count: '10' },
  );
  assert.equal(report.ok, true);
});

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const executable = fileURLToPath(new URL('../packages/cli/dist/bin.js', import.meta.url));
const options = { encoding: 'utf8' as const, timeout: 12000 };

it('reconciles a synthetic payment and reports a one-stroop discrepancy', () => {
  const success = spawnSync(process.execPath, [executable, 'demo'], options);
  expect(success.stderr).toBe('');
  expect(success.status).toBe(0);
  expect(success.stdout).toContain('"deterministic":true');
  expect(success.stdout).toContain('"difference":"0"');

  const failure = spawnSync(process.execPath, [executable, 'demo', '--mismatch'], options);
  expect(failure.stderr).toBe('');
  expect(failure.status).toBe(1);
  expect(failure.stdout).toContain('"difference":"1"');
}, 30000);

it.each([
  ['examples/raw-payment.mjs', [], '"matched":true'],
  ['examples/raw-payment.mjs', ['--custom-rule'], '"ruleId":"supplier-payment"'],
  ['examples/whole-ledger.mjs', [], 'Journal wallet balances match on-chain changes: true'],
])(
  'runs %s %j',
  (script, args, expected) => {
    const path = fileURLToPath(new URL(`../${script}`, import.meta.url));
    const run = spawnSync(process.execPath, [path, ...args], options);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(expected);
  },
  30000,
);

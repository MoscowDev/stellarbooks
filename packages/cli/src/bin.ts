#!/usr/bin/env node
import { runPaymentDemo } from './payment-demo.js';

const args = process.argv.slice(2);
const usage = 'Usage: stellarbooks demo [--mismatch]';
if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
  process.stdout.write(usage + '\n');
} else if (
  args[0] === 'demo' &&
  (args.length === 1 || (args.length === 2 && args[1] === '--mismatch'))
) {
  try {
    const { output, matched } = runPaymentDemo(args[1] === '--mismatch');
    process.stdout.write(output + '\n');
    if (!matched) process.exitCode = 1;
  } catch {
    process.stderr.write('The offline payment demo failed.\n');
    process.exitCode = 1;
  }
} else {
  process.stderr.write(usage + '\n');
  process.exitCode = 2;
}

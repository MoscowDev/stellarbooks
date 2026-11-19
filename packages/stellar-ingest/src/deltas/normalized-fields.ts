import type { Memo } from '@stellarbooks/core';
import type { ContractEventRecord } from '../types.js';

export function readText(value: unknown): string {
  if (typeof value === 'string') return value;
  throw new TypeError('Expected a text field in normalized ledger data');
}

export function readUnits(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError('Expected integer minor units in normalized ledger data');
}

export function readMemo(value: unknown): Memo {
  if (typeof value === 'object' && value !== null && 'type' in value && 'value' in value) {
    const text = readText(value.value);
    switch (value.type) {
      case 'text':
        return { type: 'text', value: text };
      case 'id':
        return { type: 'id', value: text };
      case 'hash':
      case 'return':
        return { type: value.type, value: text };
    }
  }
  throw new TypeError('Invalid memo in normalized ledger data');
}

export function readContractEventType(value: unknown): ContractEventRecord['type'] {
  if (value === 'transfer' || value === 'mint' || value === 'burn' || value === 'clawback') {
    return value;
  }
  throw new TypeError('Invalid contract event type in normalized ledger data');
}

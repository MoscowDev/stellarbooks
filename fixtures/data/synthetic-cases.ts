/**
 * SYNTHETIC classifier cases. These are NOT golden fixtures and NOT captured chain data.
 *
 * - Ledger sequences (100, 101, ...), transaction hashes ("1111...") and pool IDs are invented.
 * - Balance deltas and contract events are hand-written normalized records, not decoded XDR.
 * - `expectedJournal` is produced by `mapEvents` itself, so it cannot detect a mapping bug.
 *
 * Use these cases only to exercise the classifier's control flow on normalized input.
 * Real, independently reviewed fixtures are tracked in Q-035 and issues-backlog/20.
 *
 * @module
 */
import {
  amount,
  assetId,
  freelancerTemplate,
  mapEvents,
  NATIVE_ASSET,
  parseAssetId,
  type EconomicEvent,
  type JournalEntry,
} from '../../packages/core/dist/index.js';
import type { SyntheticCase } from '../types.js';

const NETWORK = 'testnet';
const WALLET_A = 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';
const WALLET_B = 'GCO2IP3MJNUOKS45KWBHI2YK2FCGW2EK7EB6KSKGOWIC3G3SDOXX6ABE';
const ISSUER_USDC = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const CONTRACT_TOKEN = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7ZQVNCUS227HNWTXM5O35AQEBRODNO';
const POOL_ID = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const ASSET_XLM = NATIVE_ASSET;
const ASSET_USDC = assetId(parseAssetId(`classic:USDC:${ISSUER_USDC}`));
const ASSET_POOL = assetId(parseAssetId(`pool:${POOL_ID}`));
const ASSET_SEP41 = assetId(parseAssetId(`sep41:${CONTRACT_TOKEN}`));

const tmpl = freelancerTemplate();

function mapWithTemplate(events: EconomicEvent[]): readonly JournalEntry[] {
  return mapEvents(events, tmpl.ruleSet, {
    chart: tmpl.chart,
    trackedWallets: new Set([WALLET_A]),
  }).entries;
}

// 1. Payment Native In
const tx1Hash = '1111111111111111111111111111111111111111111111111111111111111111';
const event1: EconomicEvent = {
  kind: 'transfer',
  source: {
    network: NETWORK,
    ledger: 100,
    txIndex: 0,
    txHash: tx1Hash,
    stage: 'operation',
    opIndex: 0,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:00Z',
  wallet: WALLET_A,
  direction: 'in',
  amount: amount(ASSET_XLM, 50000000n), // 5 XLM
  counterparty: WALLET_B,
  via: 'payment',
};
const journal1: readonly JournalEntry[] = mapWithTemplate([event1]);

// 2. Payment Native Out with Fee
const tx2Hash = '2222222222222222222222222222222222222222222222222222222222222222';
const event2Fee: EconomicEvent = {
  kind: 'fee',
  source: {
    network: NETWORK,
    ledger: 101,
    txIndex: 0,
    txHash: tx2Hash,
    stage: 'fee',
    opIndex: null,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:05Z',
  wallet: WALLET_A,
  amount: amount(ASSET_XLM, 100n),
};
const event2Transfer: EconomicEvent = {
  kind: 'transfer',
  source: {
    network: NETWORK,
    ledger: 101,
    txIndex: 0,
    txHash: tx2Hash,
    stage: 'operation',
    opIndex: 0,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:05Z',
  wallet: WALLET_A,
  direction: 'out',
  amount: amount(ASSET_XLM, 20000000n), // 2 XLM
  counterparty: WALLET_B,
  via: 'payment',
};
const journal2: readonly JournalEntry[] = mapWithTemplate([event2Fee, event2Transfer]);

// 3. Payment Credit Issued (USDC)
const tx3Hash = '3333333333333333333333333333333333333333333333333333333333333333';
const event3: EconomicEvent = {
  kind: 'transfer',
  source: {
    network: NETWORK,
    ledger: 102,
    txIndex: 0,
    txHash: tx3Hash,
    stage: 'operation',
    opIndex: 0,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:10Z',
  wallet: WALLET_A,
  direction: 'in',
  amount: amount(ASSET_USDC, 100000000n), // 10 USDC
  counterparty: WALLET_B,
  via: 'payment',
};
const journal3: readonly JournalEntry[] = mapWithTemplate([event3]);

// 4. Path Payment Strict Send (Exchange)
const tx4Hash = '4444444444444444444444444444444444444444444444444444444444444444';
const event4: EconomicEvent = {
  kind: 'exchange',
  source: {
    network: NETWORK,
    ledger: 103,
    txIndex: 0,
    txHash: tx4Hash,
    stage: 'operation',
    opIndex: 0,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:15Z',
  wallet: WALLET_A,
  given: [amount(ASSET_XLM, 10000000n)],
  received: [amount(ASSET_USDC, 2000000n)],
  via: 'path_payment',
};
const journal4: readonly JournalEntry[] = mapWithTemplate([event4]);

// 5. Account Merge
const tx5Hash = '5555555555555555555555555555555555555555555555555555555555555555';
const event5: EconomicEvent = {
  kind: 'transfer',
  source: {
    network: NETWORK,
    ledger: 104,
    txIndex: 0,
    txHash: tx5Hash,
    stage: 'operation',
    opIndex: 0,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:20Z',
  wallet: WALLET_A,
  direction: 'in',
  amount: amount(ASSET_XLM, 150000000n),
  counterparty: WALLET_B,
  via: 'account_merge',
};
const journal5: readonly JournalEntry[] = mapWithTemplate([event5]);

// 6. Claimable Balance Lock & Release
const tx6Hash = '6666666666666666666666666666666666666666666666666666666666666666';
const event6Lock: EconomicEvent = {
  kind: 'escrow',
  source: {
    network: NETWORK,
    ledger: 105,
    txIndex: 0,
    txHash: tx6Hash,
    stage: 'operation',
    opIndex: 0,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:25Z',
  wallet: WALLET_A,
  action: 'lock',
  amount: amount(ASSET_XLM, 40000000n),
  balanceId: '00000000aabbccdd11223344556677889900aabbccdd11223344556677889900aabb',
};
const event6Release: EconomicEvent = {
  kind: 'escrow',
  source: {
    network: NETWORK,
    ledger: 105,
    txIndex: 0,
    txHash: tx6Hash,
    stage: 'operation',
    opIndex: 1,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:25Z',
  wallet: WALLET_A,
  action: 'release',
  amount: amount(ASSET_XLM, 40000000n),
  balanceId: '00000000aabbccdd11223344556677889900aabbccdd11223344556677889900aabb',
  counterparty: WALLET_B,
};
const journal6: readonly JournalEntry[] = mapWithTemplate([event6Lock, event6Release]);

// 7. Liquidity Pool Deposit
const tx7Hash = '7777777777777777777777777777777777777777777777777777777777777777';
const event7: EconomicEvent = {
  kind: 'exchange',
  source: {
    network: NETWORK,
    ledger: 106,
    txIndex: 0,
    txHash: tx7Hash,
    stage: 'operation',
    opIndex: 0,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:30Z',
  wallet: WALLET_A,
  given: [amount(ASSET_XLM, 50000000n), amount(ASSET_USDC, 10000000n)],
  received: [amount(ASSET_POOL, 22360679n)],
  via: 'liquidity_pool_deposit',
};
const journal7: readonly JournalEntry[] = mapWithTemplate([event7]);

// 8. Clawback
const tx8Hash = '8888888888888888888888888888888888888888888888888888888888888888';
const event8: EconomicEvent = {
  kind: 'transfer',
  source: {
    network: NETWORK,
    ledger: 107,
    txIndex: 0,
    txHash: tx8Hash,
    stage: 'operation',
    opIndex: 0,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:35Z',
  wallet: WALLET_A,
  direction: 'out',
  amount: amount(ASSET_USDC, 5000000n),
  counterparty: ISSUER_USDC,
  via: 'clawback',
};
const journal8: readonly JournalEntry[] = mapWithTemplate([event8]);

// 9. Failed Transaction Fee
const tx9Hash = '9999999999999999999999999999999999999999999999999999999999999999';
const event9: EconomicEvent = {
  kind: 'fee',
  source: {
    network: NETWORK,
    ledger: 108,
    txIndex: 0,
    txHash: tx9Hash,
    stage: 'fee',
    opIndex: null,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:40Z',
  wallet: WALLET_A,
  amount: amount(ASSET_XLM, 500n),
};
const journal9: readonly JournalEntry[] = mapWithTemplate([event9]);

// 10. Soroban SAC Transfer
const tx10Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const event10: EconomicEvent = {
  kind: 'transfer',
  source: {
    network: NETWORK,
    ledger: 109,
    txIndex: 0,
    txHash: tx10Hash,
    stage: 'operation',
    opIndex: 0,
    eventIndex: 0,
  },
  closeTime: '2026-11-17T12:00:45Z',
  wallet: WALLET_A,
  direction: 'in',
  amount: amount(ASSET_SEP41, 1250000000n),
  counterparty: WALLET_B,
  via: 'contract_transfer',
};
const journal10: readonly JournalEntry[] = mapWithTemplate([event10]);

export const SYNTHETIC_CASES: readonly SyntheticCase[] = [
  {
    id: 'payment-native-in',
    description: 'Tracked wallet receives a native XLM payment',
    provenance: 'synthetic',
    operationType: 'payment',
    trackedWallets: [WALLET_A],
    ledgerRecord: {
      network: NETWORK,
      sequence: 100,
      ledgerCloseTime: '2026-11-17T12:00:00Z',
      transactions: [
        {
          txHash: tx1Hash,
          txIndex: 0,
          feeBump: false,
          feePayer: WALLET_B,
          feeCharged: '100',
          successful: true,
          operations: [
            {
              index: 0,
              type: 'payment',
              sourceAccount: WALLET_B,
              detail: { destination: WALLET_A, asset: 'native', amount: '50000000' },
            },
          ],
          deltas: [
            { wallet: WALLET_A, asset: 'native', deltaUnits: '50000000' },
            { wallet: WALLET_B, asset: 'native', deltaUnits: '-50000100' },
          ],
        },
      ],
    },
    expectedEvents: [event1],
    expectedJournal: journal1,
  },
  {
    id: 'payment-native-out',
    description: 'Tracked wallet sends a native XLM payment and pays transaction fee',
    provenance: 'synthetic',
    operationType: 'payment',
    trackedWallets: [WALLET_A],
    ledgerRecord: {
      network: NETWORK,
      sequence: 101,
      ledgerCloseTime: '2026-11-17T12:00:05Z',
      transactions: [
        {
          txHash: tx2Hash,
          txIndex: 0,
          feeBump: false,
          feePayer: WALLET_A,
          feeCharged: '100',
          successful: true,
          operations: [
            {
              index: 0,
              type: 'payment',
              sourceAccount: WALLET_A,
              detail: { destination: WALLET_B, asset: 'native', amount: '20000000' },
            },
          ],
          deltas: [
            { wallet: WALLET_A, asset: 'native', deltaUnits: '-20000100' },
            { wallet: WALLET_B, asset: 'native', deltaUnits: '20000000' },
          ],
        },
      ],
    },
    expectedEvents: [event2Fee, event2Transfer],
    expectedJournal: journal2,
  },
  {
    id: 'payment-credit-issued',
    description: 'Tracked wallet receives classic issued asset USDC',
    provenance: 'synthetic',
    operationType: 'payment',
    trackedWallets: [WALLET_A],
    ledgerRecord: {
      network: NETWORK,
      sequence: 102,
      ledgerCloseTime: '2026-11-17T12:00:10Z',
      transactions: [
        {
          txHash: tx3Hash,
          txIndex: 0,
          feeBump: false,
          feePayer: WALLET_B,
          feeCharged: '100',
          successful: true,
          operations: [
            {
              index: 0,
              type: 'payment',
              sourceAccount: WALLET_B,
              detail: {
                destination: WALLET_A,
                asset: `classic:USDC:${ISSUER_USDC}`,
                amount: '100000000',
              },
            },
          ],
          deltas: [{ wallet: WALLET_A, asset: `classic:USDC:${ISSUER_USDC}`, deltaUnits: '100000000' }],
        },
      ],
    },
    expectedEvents: [event3],
    expectedJournal: journal3,
  },
  {
    id: 'path-payment-strict-send',
    description: 'Tracked wallet gives XLM and receives USDC via path payment',
    provenance: 'synthetic',
    operationType: 'path_payment_strict_send',
    trackedWallets: [WALLET_A],
    ledgerRecord: {
      network: NETWORK,
      sequence: 103,
      ledgerCloseTime: '2026-11-17T12:00:15Z',
      transactions: [
        {
          txHash: tx4Hash,
          txIndex: 0,
          feeBump: false,
          feePayer: WALLET_B,
          feeCharged: '100',
          successful: true,
          operations: [
            {
              index: 0,
              type: 'path_payment_strict_send',
              sourceAccount: WALLET_A,
              detail: { sendAsset: 'native', destAsset: `classic:USDC:${ISSUER_USDC}` },
            },
          ],
          deltas: [
            { wallet: WALLET_A, asset: 'native', deltaUnits: '-10000000' },
            { wallet: WALLET_A, asset: `classic:USDC:${ISSUER_USDC}`, deltaUnits: '2000000' },
          ],
        },
      ],
    },
    expectedEvents: [event4],
    expectedJournal: journal4,
  },
  {
    id: 'account-merge',
    description: 'Account merged into tracked wallet transferring XLM',
    provenance: 'synthetic',
    operationType: 'account_merge',
    trackedWallets: [WALLET_A],
    ledgerRecord: {
      network: NETWORK,
      sequence: 104,
      ledgerCloseTime: '2026-11-17T12:00:20Z',
      transactions: [
        {
          txHash: tx5Hash,
          txIndex: 0,
          feeBump: false,
          feePayer: WALLET_B,
          feeCharged: '100',
          successful: true,
          operations: [
            {
              index: 0,
              type: 'account_merge',
              sourceAccount: WALLET_B,
              detail: { destination: WALLET_A },
            },
          ],
          deltas: [{ wallet: WALLET_A, asset: 'native', deltaUnits: '150000000' }],
        },
      ],
    },
    expectedEvents: [event5],
    expectedJournal: journal5,
  },
  {
    id: 'claimable-balance-lifecycle',
    description: 'Claimable balance created (locked) then claimed (released)',
    provenance: 'synthetic',
    operationType: 'claimable_balance',
    trackedWallets: [WALLET_A],
    ledgerRecord: {
      network: NETWORK,
      sequence: 105,
      ledgerCloseTime: '2026-11-17T12:00:25Z',
      transactions: [
        {
          txHash: tx6Hash,
          txIndex: 0,
          feeBump: false,
          feePayer: WALLET_B,
          feeCharged: '100',
          successful: true,
          operations: [
            {
              index: 0,
              type: 'create_claimable_balance',
              sourceAccount: WALLET_A,
              detail: {
                balanceId: '00000000aabbccdd11223344556677889900aabbccdd11223344556677889900aabb',
                asset: 'native',
                amount: '40000000',
              },
            },
            {
              index: 1,
              type: 'claim_claimable_balance',
              sourceAccount: WALLET_B,
              detail: {
                balanceId: '00000000aabbccdd11223344556677889900aabbccdd11223344556677889900aabb',
                claimant: WALLET_B,
                amount: '40000000',
              },
            },
          ],
          deltas: [{ wallet: WALLET_A, asset: 'native', deltaUnits: '-40000000' }],
        },
      ],
    },
    expectedEvents: [event6Lock, event6Release],
    expectedJournal: journal6,
  },
  {
    id: 'liquidity-pool-deposit',
    description: 'Depositing two assets and minting pool shares',
    provenance: 'synthetic',
    operationType: 'liquidity_pool_deposit',
    trackedWallets: [WALLET_A],
    ledgerRecord: {
      network: NETWORK,
      sequence: 106,
      ledgerCloseTime: '2026-11-17T12:00:30Z',
      transactions: [
        {
          txHash: tx7Hash,
          txIndex: 0,
          feeBump: false,
          feePayer: WALLET_B,
          feeCharged: '100',
          successful: true,
          operations: [
            {
              index: 0,
              type: 'liquidity_pool_deposit',
              sourceAccount: WALLET_A,
              detail: { poolId: POOL_ID },
            },
          ],
          deltas: [
            { wallet: WALLET_A, asset: 'native', deltaUnits: '-50000000' },
            { wallet: WALLET_A, asset: `classic:USDC:${ISSUER_USDC}`, deltaUnits: '-10000000' },
            { wallet: WALLET_A, asset: `pool:${POOL_ID}`, deltaUnits: '22360679' },
          ],
        },
      ],
    },
    expectedEvents: [event7],
    expectedJournal: journal7,
  },
  {
    id: 'clawback',
    description: 'Issuer claws back credit asset',
    provenance: 'synthetic',
    operationType: 'clawback',
    trackedWallets: [WALLET_A],
    ledgerRecord: {
      network: NETWORK,
      sequence: 107,
      ledgerCloseTime: '2026-11-17T12:00:35Z',
      transactions: [
        {
          txHash: tx8Hash,
          txIndex: 0,
          feeBump: false,
          feePayer: ISSUER_USDC,
          feeCharged: '100',
          successful: true,
          operations: [
            {
              index: 0,
              type: 'clawback',
              sourceAccount: ISSUER_USDC,
              detail: { from: WALLET_A, asset: `classic:USDC:${ISSUER_USDC}`, amount: '5000000' },
            },
          ],
          deltas: [{ wallet: WALLET_A, asset: `classic:USDC:${ISSUER_USDC}`, deltaUnits: '-5000000' }],
        },
      ],
    },
    expectedEvents: [event8],
    expectedJournal: journal8,
  },
  {
    id: 'failed-tx-fee-only',
    description: 'Failed transaction where only fee is charged to fee-paying wallet',
    provenance: 'synthetic',
    operationType: 'failed_transaction',
    trackedWallets: [WALLET_A],
    ledgerRecord: {
      network: NETWORK,
      sequence: 108,
      ledgerCloseTime: '2026-11-17T12:00:40Z',
      transactions: [
        {
          txHash: tx9Hash,
          txIndex: 0,
          feeBump: false,
          feePayer: WALLET_A,
          feeCharged: '500',
          successful: false,
          operations: [],
          deltas: [{ wallet: WALLET_A, asset: 'native', deltaUnits: '-500' }],
        },
      ],
    },
    expectedEvents: [event9],
    expectedJournal: journal9,
  },
  {
    id: 'soroban-sac-transfer',
    description: 'Soroban SAC contract transfer event',
    provenance: 'synthetic',
    operationType: 'invoke_host_function',
    trackedWallets: [WALLET_A],
    ledgerRecord: {
      network: NETWORK,
      sequence: 109,
      ledgerCloseTime: '2026-11-17T12:00:45Z',
      transactions: [
        {
          txHash: tx10Hash,
          txIndex: 0,
          feeBump: false,
          feePayer: WALLET_B,
          feeCharged: '200',
          successful: true,
          operations: [
            {
              index: 0,
              type: 'invoke_host_function',
              sourceAccount: WALLET_B,
              detail: { contractId: CONTRACT_TOKEN },
            },
          ],
          deltas: [{ wallet: WALLET_A, asset: `sep41:${CONTRACT_TOKEN}`, deltaUnits: '1250000000' }],
          contractEvents: [
            {
              contractId: CONTRACT_TOKEN,
              type: 'transfer',
              from: WALLET_B,
              to: WALLET_A,
              amountUnits: '1250000000',
              asset: `sep41:${CONTRACT_TOKEN}`,
            },
          ],
        },
      ],
    },
    expectedEvents: [event10],
    expectedJournal: journal10,
  },
];

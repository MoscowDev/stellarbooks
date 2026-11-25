/**
 * Captures real testnet ledgers that contain chosen operation types (dev-only).
 *
 * Read-only: it scans recent public ledgers through Stellar RPC and writes the unmodified ledger
 * metadata of the smallest ledger found for each target. It creates no keys and submits nothing.
 *
 * Usage: node dist/capture.js <outDir> [ledgersToScan] [target,...]
 *
 * @module
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Networks, rpc, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

const TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE: string = Networks.TESTNET;

/** Operation shapes the capture can look for. */
export const TARGETS = [
  'claim_claimable_balance',
  'create_claimable_balance',
  'clawback',
  'clawback_claimable_balance',
  'path_payment_strict_receive',
  'path_payment_strict_send_to_other',
  'muxed_payment',
  'credit_payment',
  'trustline_removal',
  'liquidity_pool_deposit',
  'liquidity_pool_withdraw',
] as const;
export type Target = (typeof TARGETS)[number];

/** Which targets one successful transaction contains. */
export function targetsOf(tx: xdr.Transaction): Set<Target> {
  const found = new Set<Target>();
  for (const op of tx.operations) {
    const body = op.body;
    switch (body.type) {
      case 'claimClaimableBalance':
        found.add('claim_claimable_balance');
        break;
      case 'createClaimableBalance':
        found.add('create_claimable_balance');
        break;
      case 'clawback':
        found.add('clawback');
        break;
      case 'clawbackClaimableBalance':
        found.add('clawback_claimable_balance');
        break;
      case 'pathPaymentStrictReceive':
        found.add('path_payment_strict_receive');
        break;
      case 'pathPaymentStrictSend': {
        const from = (op.sourceAccount ?? tx.sourceAccount).toXdr('hex');
        if (body.value.destination.toXdr('hex') !== from)
          found.add('path_payment_strict_send_to_other');
        break;
      }
      case 'payment':
        if (body.value.destination.type === 'keyTypeMuxedEd25519') found.add('muxed_payment');
        if (body.value.asset.type !== 'assetTypeNative') found.add('credit_payment');
        break;
      case 'changeTrust':
        if (body.value.limit === 0n) found.add('trustline_removal');
        break;
      case 'liquidityPoolDeposit':
        found.add('liquidity_pool_deposit');
        break;
      case 'liquidityPoolWithdraw':
        found.add('liquidity_pool_withdraw');
        break;
      default:
        break;
    }
  }
  return found;
}

interface Candidate {
  readonly target: Target;
  readonly size: number;
  readonly txIndex: number;
  readonly txHash: string;
  readonly ledger: rpc.Api.LedgerResponse;
}

function innerTransaction(envelope: xdr.TransactionEnvelope): xdr.Transaction | undefined {
  if (envelope.type === 'envelopeTypeTx') return envelope.value.tx;
  if (envelope.type === 'envelopeTypeTxFeeBump') return envelope.value.tx.innerTx.value.tx;
  return undefined;
}

/** Finds, for each target, the smallest scanned ledger with a successful transaction containing it. */
export async function captureLedgers(opts: {
  outDir: string;
  scan: number;
  targets: readonly Target[];
  rpcUrl?: string;
}): Promise<Map<Target, Candidate>> {
  const server = new rpc.Server(opts.rpcUrl ?? TESTNET_RPC_URL);
  const network = await server.getNetwork();
  if (network.passphrase !== TESTNET_PASSPHRASE) {
    throw new Error('Refusing to capture from a network other than testnet');
  }
  const latest = await server.getLatestLedger();
  const end = latest.sequence - 2;
  let next = Math.max(1, end - opts.scan + 1);
  const best = new Map<Target, Candidate>();
  const wanted = new Set(opts.targets);

  while (next <= end) {
    const page = await server.getLedgers({
      startLedger: next,
      pagination: { limit: Math.min(200, end - next + 1) },
    });
    if (page.ledgers.length === 0) throw new Error(`RPC returned no ledgers from ${String(next)}`);
    for (const ledger of page.ledgers) {
      if (ledger.sequence > end) break;
      const meta = ledger.metadataXdr;
      const size = meta.toXdr('base64').length;
      const envelopes = new Map<string, xdr.TransactionEnvelope>();
      const all =
        meta.type === 'v0'
          ? meta.value.txSet.txs
          : meta.value.txSet.value.phases.flatMap((phase) =>
              phase.type === 'v0Components'
                ? phase.value.flatMap((component) => component.value.txs)
                : phase.value.executionStages.flat(2),
            );
      for (const envelope of all) {
        const hash = Buffer.from(
          TransactionBuilder.fromXdr(envelope, Networks.TESTNET).hash(),
        ).toString('hex');
        envelopes.set(hash, envelope);
      }
      meta.value.txProcessing.forEach((processing, txIndex) => {
        const { result } = processing.result.result;
        if (result.type !== 'txSuccess' && result.type !== 'txFeeBumpInnerSuccess') return;
        const txHash = processing.result.transactionHash.toXdr('hex');
        const envelope = envelopes.get(txHash);
        const tx = envelope ? innerTransaction(envelope) : undefined;
        if (tx === undefined) return;
        for (const target of targetsOf(tx)) {
          if (!wanted.has(target)) continue;
          const current = best.get(target);
          if (current === undefined || size < current.size) {
            best.set(target, { target, size, txIndex, txHash, ledger });
          }
        }
      });
      next = ledger.sequence + 1;
    }
  }

  mkdirSync(opts.outDir, { recursive: true });
  for (const candidate of best.values()) {
    const { ledger } = candidate;
    const file = join(opts.outDir, `${candidate.target}-${String(ledger.sequence)}.json`);
    const content = {
      network: 'testnet',
      rpcUrl: opts.rpcUrl ?? TESTNET_RPC_URL,
      capturedAt: new Date().toISOString(),
      target: candidate.target,
      txIndex: candidate.txIndex,
      txHash: candidate.txHash,
      ledger: {
        hash: ledger.hash,
        sequence: ledger.sequence,
        ledgerCloseTime: ledger.ledgerCloseTime,
        headerXdr: ledger.headerXdr.toXdr('base64'),
        metadataXdr: ledger.metadataXdr.toXdr('base64'),
      },
    };
    writeFileSync(file, JSON.stringify(content, null, 2) + '\n');
  }
  return best;
}

if (process.argv[1]?.endsWith('capture.js')) {
  const [outDir, scanArg, targetArg] = process.argv.slice(2);
  if (outDir === undefined) {
    console.error('Usage: node dist/capture.js <outDir> [ledgersToScan] [target,...]');
    process.exit(2);
  }
  const targets = (targetArg?.split(',') ?? [...TARGETS]).filter((t): t is Target =>
    (TARGETS as readonly string[]).includes(t),
  );
  captureLedgers({ outDir, scan: Number(scanArg ?? 2000), targets })
    .then((found) => {
      for (const target of targets) {
        const hit = found.get(target);
        console.log(
          hit
            ? `${target}: ledger ${String(hit.ledger.sequence)} tx ${String(hit.txIndex)} (${String(hit.size)} bytes)`
            : `${target}: not found`,
        );
      }
    })
    .catch((err: unknown) => {
      console.error('Capture failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

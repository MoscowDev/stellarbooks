/**
 * Testnet fixture capture script (dev-only).
 *
 * Conforms to ADR-0003 and Q-019:
 * - Uses ephemeral throwaway Friendbot keys only in memory.
 * - Guarded to testnet only; will refuse to run on pubnet.
 * - Never logs or stores secret keys.
 *
 * @module
 */
import { Keypair, Networks, rpc } from '@stellar/stellar-sdk';

const TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';
const TESTNET_PASSPHRASE: string = Networks.TESTNET;

export async function runTestnetCapture(opts?: { rpcUrl?: string }): Promise<void> {
  const url = opts?.rpcUrl ?? TESTNET_RPC_URL;
  const server = new rpc.Server(url);

  const network = await server.getNetwork();
  if (network.passphrase !== TESTNET_PASSPHRASE) {
    throw new Error(`Refusing to run fixture generator on non-testnet: ${network.passphrase}`);
  }

  // Generate ephemeral throwaway in-memory test account
  const ephemeralKeypair = Keypair.random();
  console.log(`Generated ephemeral testnet account: ${ephemeralKeypair.publicKey()}`);

  const latest = await server.getLatestLedger();
  console.log(`Connected to testnet RPC at ledger sequence ${latest.sequence}`);
}

if (process.argv[1]?.endsWith('generate.js') || process.argv[1]?.endsWith('generate.ts')) {
  runTestnetCapture().catch((err: unknown) => {
    console.error('Fixture capture failed:', err);
    process.exit(1);
  });
}

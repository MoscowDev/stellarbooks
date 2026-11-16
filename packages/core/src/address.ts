/**
 * Structural checks for Stellar strkey addresses (SEP-23).
 *
 * These checks validate the prefix, length and base32 alphabet only. They do **not** verify the
 * CRC16 checksum or decode the payload, because `core` has no dependencies. Full validation is
 * performed by `@stellarbooks/stellar-ingest` using the official SDK. Source:
 * docs/research/seps.md (SEP-23 v1.4.0: G and C addresses are 56 characters, M addresses 69).
 *
 * @module
 */

const BASE32 = '[A-Z2-7]';
const ACCOUNT_RE = new RegExp(`^G${BASE32}{55}$`);
const CONTRACT_RE = new RegExp(`^C${BASE32}{55}$`);
const MUXED_RE = new RegExp(`^M${BASE32}{68}$`);

/**
 * Returns true if `value` is structurally an account address (`G...`, 56 characters).
 * The checksum is not verified.
 *
 * @param value - Candidate address.
 */
export function isAccountAddress(value: string): boolean {
  return ACCOUNT_RE.test(value);
}

/**
 * Returns true if `value` is structurally a contract address (`C...`, 56 characters).
 * The checksum is not verified.
 *
 * @param value - Candidate address.
 */
export function isContractAddress(value: string): boolean {
  return CONTRACT_RE.test(value);
}

/**
 * Returns true if `value` is structurally a muxed account address (`M...`, 69 characters).
 * The checksum is not verified.
 *
 * @param value - Candidate address.
 */
export function isMuxedAddress(value: string): boolean {
  return MUXED_RE.test(value);
}

/**
 * Returns true if `value` is structurally a base address that can be a counterparty: an account
 * (`G...`) or contract (`C...`) address. Muxed addresses are not accepted here. Extractors resolve
 * an `M...` address to its base `G...` account and record the muxed ID separately, so that
 * counterparties compare reliably.
 *
 * @param value - Candidate address.
 */
export function isCounterpartyAddress(value: string): boolean {
  return isAccountAddress(value) || isContractAddress(value);
}

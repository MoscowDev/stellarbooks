/**
 * Asset identity. Every amount in StellarBooks is tagged with an {@link AssetId}, a canonical
 * string with exactly one spelling per asset, so assets can be compared with `===`
 * (ADR-0004).
 *
 * | Asset | Canonical form |
 * |---|---|
 * | Native XLM | `native` |
 * | Classic issued asset | `classic:CODE:ISSUER` |
 * | Liquidity pool share | `pool:<64 lowercase hex>` |
 * | SEP-41 contract token | `sep41:C...` |
 *
 * Classic assets are identified by code **and** issuer: the same code with another issuer is a
 * different asset (docs/research/stellar-accounts-assets.md §3.1).
 *
 * @module
 */
import { isAccountAddress, isContractAddress } from './address.js';
import { StellarBooksValidationError } from './errors.js';

/** Structured description of an asset. */
export type AssetDescriptor =
  | {
      /** Native lumens (XLM). */
      readonly kind: 'native';
    }
  | {
      /** A classic issued asset (alphanum4 or alphanum12). */
      readonly kind: 'classic';
      /** Asset code: 1-4 characters (alphanum4) or 5-12 characters (alphanum12), `[A-Za-z0-9]`. */
      readonly code: string;
      /** Issuer account address (`G...`). */
      readonly issuer: string;
    }
  | {
      /** A liquidity pool share. */
      readonly kind: 'pool';
      /** Pool ID as 64 lowercase hexadecimal characters. */
      readonly poolId: string;
    }
  | {
      /** A Soroban token implementing the SEP-41 interface. */
      readonly kind: 'sep41';
      /** Token contract address (`C...`). */
      readonly contract: string;
    };

declare const assetIdBrand: unique symbol;

/** Canonical asset identifier string. Create with {@link assetId} or {@link parseAssetId}. */
export type AssetId = string & { readonly [assetIdBrand]: true };

/** The native asset (XLM). */
export const NATIVE_ASSET: AssetId = 'native' as AssetId;

/**
 * Number of decimal places for native, classic and pool share amounts. On-chain amounts are int64
 * stroops, one stroop being 0.0000001 units (docs/research/stellar-accounts-assets.md).
 */
export const STELLAR_CLASSIC_SCALE = 7;

const CODE_RE = /^[A-Za-z0-9]{1,12}$/;
const POOL_ID_RE = /^[0-9a-f]{64}$/;

function descriptorProblem(d: AssetDescriptor): string | undefined {
  switch (d.kind) {
    case 'native':
      return undefined;
    case 'classic':
      if (!CODE_RE.test(d.code))
        return `asset code "${d.code}" must be 1-12 characters [A-Za-z0-9]`;
      if (!isAccountAddress(d.issuer)) return `issuer "${d.issuer}" is not a G... account address`;
      return undefined;
    case 'pool':
      if (!POOL_ID_RE.test(d.poolId)) return `pool id must be 64 lowercase hex characters`;
      return undefined;
    case 'sep41':
      if (!isContractAddress(d.contract)) return `contract "${d.contract}" is not a C... address`;
      return undefined;
  }
}

/**
 * Builds the canonical {@link AssetId} for a descriptor.
 *
 * @param descriptor - The asset to identify.
 * @throws {@link StellarBooksValidationError} if the descriptor is malformed.
 */
export function assetId(descriptor: AssetDescriptor): AssetId {
  const problem = descriptorProblem(descriptor);
  if (problem !== undefined) {
    throw new StellarBooksValidationError('invalid asset', [
      { code: 'ASSET_INVALID', message: problem },
    ]);
  }
  switch (descriptor.kind) {
    case 'native':
      return NATIVE_ASSET;
    case 'classic':
      return `classic:${descriptor.code}:${descriptor.issuer}` as AssetId;
    case 'pool':
      return `pool:${descriptor.poolId}` as AssetId;
    case 'sep41':
      return `sep41:${descriptor.contract}` as AssetId;
  }
}

/**
 * Parses a canonical asset identifier string.
 *
 * @param value - String such as `native` or `classic:USDC:G...`.
 * @returns The structured descriptor.
 * @throws {@link StellarBooksValidationError} if `value` is not canonical.
 */
export function parseAssetId(value: string): AssetDescriptor {
  const fail = (message: string): never => {
    throw new StellarBooksValidationError('invalid asset id', [
      { code: 'ASSET_ID_INVALID', message },
    ]);
  };
  if (value === 'native') return { kind: 'native' };
  const parts = value.split(':');
  let descriptor: AssetDescriptor;
  if (parts[0] === 'classic' && parts.length === 3) {
    descriptor = { kind: 'classic', code: parts[1] ?? '', issuer: parts[2] ?? '' };
  } else if (parts[0] === 'pool' && parts.length === 2) {
    descriptor = { kind: 'pool', poolId: parts[1] ?? '' };
  } else if (parts[0] === 'sep41' && parts.length === 2) {
    descriptor = { kind: 'sep41', contract: parts[1] ?? '' };
  } else {
    return fail(`"${value}" is not a canonical asset id`);
  }
  const problem = descriptorProblem(descriptor);
  if (problem !== undefined) fail(problem);
  return descriptor;
}

/**
 * Type guard for canonical asset identifiers.
 *
 * @param value - Candidate string.
 */
export function isAssetId(value: string): value is AssetId {
  try {
    parseAssetId(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the protocol-defined number of decimal places for an asset, or `undefined` for SEP-41
 * tokens, whose decimals are declared by the contract and must be supplied by the caller
 * (docs/OPEN-QUESTIONS.md Q-020).
 *
 * @param asset - Asset to look up.
 */
export function protocolScale(asset: AssetId): number | undefined {
  return asset.startsWith('sep41:') ? undefined : STELLAR_CLASSIC_SCALE;
}

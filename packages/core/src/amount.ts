/**
 * Exact money arithmetic. Amounts are `bigint` counts of an asset's smallest unit (stroops for
 * classic assets). Floating point is never used (ADR-0004).
 *
 * @module
 */
import type { AssetId } from './asset.js';
import { StellarBooksValidationError } from './errors.js';

/** An exact quantity of one asset, in minor units. */
export interface Amount {
  /** The asset being counted. */
  readonly asset: AssetId;
  /** Signed quantity in minor units (for example stroops). */
  readonly units: bigint;
}

/** Largest classic on-chain amount: int64 max, in stroops. */
export const INT64_MAX = 2n ** 63n - 1n;
/** Largest value representable by Soroban `i128` (SEP-41 amounts). */
export const I128_MAX = 2n ** 127n - 1n;
/** Smallest value representable by Soroban `i128`. */
export const I128_MIN = -(2n ** 127n);

/**
 * Creates an {@link Amount}, checking that it fits in the i128 range. That is the widest range any
 * Stellar amount can have, and it fits the `numeric(39,0)` storage column (ADR-0004).
 *
 * @param asset - Asset identifier.
 * @param units - Signed minor units.
 * @throws {@link StellarBooksValidationError} if `units` is outside the i128 range.
 */
export function amount(asset: AssetId, units: bigint): Amount {
  if (units > I128_MAX || units < I128_MIN) {
    throw new StellarBooksValidationError('invalid amount', [
      { code: 'AMOUNT_OUT_OF_RANGE', message: `${units} is outside the i128 range` },
    ]);
  }
  return { asset, units };
}

/**
 * Returns the amount with its sign flipped.
 *
 * @param value - Amount to negate.
 */
export function negate(value: Amount): Amount {
  return amount(value.asset, -value.units);
}

function checkScale(scale: number): void {
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 38) {
    throw new StellarBooksValidationError('invalid scale', [
      { code: 'SCALE_INVALID', message: `scale must be an integer 0..38, got ${scale}` },
    ]);
  }
}

/**
 * Formats minor units as an exact decimal string with exactly `scale` fractional digits.
 *
 * @example
 * ```ts
 * formatUnits(12345678n, 7); // "1.2345678"
 * formatUnits(-5n, 7);       // "-0.0000005"
 * ```
 *
 * @param units - Signed minor units.
 * @param scale - Number of decimal places of the asset.
 */
export function formatUnits(units: bigint, scale: number): string {
  checkScale(scale);
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${whole}${scale > 0 ? `.${fraction}` : ''}`;
}

/**
 * Parses an exact decimal string into minor units. Rejects anything that would need rounding,
 * so no precision is ever lost silently.
 *
 * @example
 * ```ts
 * parseUnits('1.5', 7);        // 15000000n
 * parseUnits('0.00000001', 7); // throws: too many decimal places
 * ```
 *
 * @param text - Decimal string matching `-?digits(.digits)?`.
 * @param scale - Number of decimal places of the asset.
 * @throws {@link StellarBooksValidationError} for malformed input or excess precision.
 */
export function parseUnits(text: string, scale: number): bigint {
  checkScale(scale);
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (match === null) {
    throw new StellarBooksValidationError('invalid decimal', [
      { code: 'DECIMAL_INVALID', message: `"${text}" is not a plain decimal number` },
    ]);
  }
  const [, sign, whole = '0', fraction = ''] = match;
  if (fraction.length > scale) {
    throw new StellarBooksValidationError('invalid decimal', [
      { code: 'DECIMAL_PRECISION', message: `"${text}" has more than ${scale} decimal places` },
    ]);
  }
  const units = BigInt(whole + fraction.padEnd(scale, '0'));
  return sign === '-' ? -units : units;
}

import { isUtcTimestamp, type Amount, type AssetId } from '@stellarbooks/core';

/** Exact rate with provenance. The ratio is quote minor units per base minor unit. */
export interface PriceQuote {
  /** Asset being valued. */
  readonly base: AssetId;
  /** Asset used to express the value. */
  readonly quote: AssetId;
  /** Positive numerator of the rate. */
  readonly numerator: bigint;
  /** Positive denominator of the rate. */
  readonly denominator: bigint;
  /** UTC timestamp at which the price was observed. */
  readonly observedAt: string;
  /** Identifier of the price provider or input record. */
  readonly source: string;
}

/** Caller-provided price lookup. */
export interface PriceSource {
  /** Returns a quote observed at or before the cutoff, or null when unavailable. */
  getQuote(base: AssetId, quote: AssetId, asOf: string): Promise<PriceQuote | null>;
}

/** Builds an offline source from supplied quotes, selecting the latest eligible observation. */
export function manualPriceSource(prices: Iterable<PriceQuote>): PriceSource {
  const pairs = new Map<string, Map<number, PriceQuote>>();
  for (const price of prices) {
    if (
      !isUtcTimestamp(price.observedAt) ||
      price.source.trim() === '' ||
      price.numerator <= 0n ||
      price.denominator <= 0n
    ) {
      throw new RangeError('Invalid manual price quote');
    }
    const key = JSON.stringify([price.base, price.quote]);
    const observations = pairs.get(key) ?? new Map<number, PriceQuote>();
    const instant = Date.parse(price.observedAt);
    if (observations.has(instant)) throw new Error('Duplicate manual price observation');
    observations.set(instant, { ...price });
    pairs.set(key, observations);
  }
  return {
    getQuote(base, quote, asOf) {
      if (!isUtcTimestamp(asOf))
        return Promise.reject(new RangeError('Expected a UTC valuation cutoff'));
      const cutoff = Date.parse(asOf);
      const observations = pairs.get(JSON.stringify([base, quote]));
      let latest = -Infinity;
      let selected: PriceQuote | null = null;
      for (const [instant, price] of observations ?? []) {
        if (instant > latest && instant <= cutoff) {
          latest = instant;
          selected = price;
        }
      }
      return Promise.resolve(selected === null ? null : { ...selected });
    },
  };
}

/** Rounding to whole quote minor units. Both modes are symmetric about zero. */
export type ValuationRounding = 'toward-zero' | 'half-away-from-zero';

/** Report annotation containing a signed valuation and its exact rate inputs. */
export interface Valuation {
  /** Original amount. */
  readonly original: Amount;
  /** Signed whole minor units of the quote asset. */
  readonly units: bigint;
  /** Rate and provenance used for the calculation. */
  readonly price: PriceQuote;
  /** UTC cutoff requested from the provider. */
  readonly asOf: string;
  /** Rounding applied to the result. */
  readonly rounding: ValuationRounding;
}

/** Values an amount through the supplied price source, returning null for a missing quote. */
export async function valueAmount(
  original: Amount,
  quoteAsset: AssetId,
  asOf: string,
  source: PriceSource,
  rounding: ValuationRounding,
): Promise<Valuation | null> {
  if (!isUtcTimestamp(asOf)) throw new RangeError('Expected a UTC valuation cutoff');
  const price = await source.getQuote(original.asset, quoteAsset, asOf);
  if (price === null) return null;
  if (
    price.base !== original.asset ||
    price.quote !== quoteAsset ||
    price.numerator <= 0n ||
    price.denominator <= 0n ||
    price.source.trim() === '' ||
    !isUtcTimestamp(price.observedAt) ||
    Date.parse(price.observedAt) > Date.parse(asOf)
  ) {
    throw new RangeError('Invalid price quote for the requested pair and cutoff');
  }

  const scaled = original.units * price.numerator;
  let units = scaled / price.denominator;
  if (rounding === 'half-away-from-zero') {
    const remainder = scaled % price.denominator;
    const magnitude = remainder < 0n ? -remainder : remainder;
    if (magnitude * 2n >= price.denominator) units += scaled < 0n ? -1n : 1n;
  }
  return { original: { ...original }, units, price: { ...price }, asOf, rounding };
}

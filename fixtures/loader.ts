/**
 * Utility functions for loading and querying StellarBooks golden fixtures.
 *
 * @module
 */
import { GOLDEN_FIXTURES } from './data/golden-fixtures.js';
import type { GoldenFixture } from './types.js';

/**
 * Returns all golden fixtures.
 */
export function getAllGoldenFixtures(): readonly GoldenFixture[] {
  return GOLDEN_FIXTURES;
}

/**
 * Finds a golden fixture by unique ID.
 */
export function getGoldenFixtureById(id: string): GoldenFixture | undefined {
  return GOLDEN_FIXTURES.find((f) => f.id === id);
}

/**
 * Finds golden fixtures by Stellar operation type.
 */
export function getGoldenFixturesByOperation(opType: string): readonly GoldenFixture[] {
  return GOLDEN_FIXTURES.filter((f) => f.operationType === opType);
}

/**
 * Utility functions for loading and querying the synthetic classifier cases.
 *
 * These cases are not golden fixtures; see `data/synthetic-cases.ts`.
 *
 * @module
 */
import { SYNTHETIC_CASES } from './data/synthetic-cases.js';
import type { SyntheticCase } from './types.js';

/**
 * Returns all synthetic classifier cases.
 */
export function getAllSyntheticCases(): readonly SyntheticCase[] {
  return SYNTHETIC_CASES;
}

/**
 * Finds a synthetic classifier case by unique ID.
 */
export function getSyntheticCaseById(id: string): SyntheticCase | undefined {
  return SYNTHETIC_CASES.find((f) => f.id === id);
}

/**
 * Finds synthetic classifier cases by Stellar operation type.
 */
export function getSyntheticCasesByOperation(opType: string): readonly SyntheticCase[] {
  return SYNTHETIC_CASES.filter((f) => f.operationType === opType);
}

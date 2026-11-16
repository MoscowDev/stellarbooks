/**
 * Chart of accounts. Accounts are identified by a short, stable `code`. Journal lines refer to
 * accounts by code. See docs/research/accounting.md for the accounting background.
 *
 * @module
 */
import { StellarBooksValidationError, type ValidationIssue } from './errors.js';

/** The five fundamental account types of double-entry bookkeeping. */
export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

/** All {@link AccountType} values, in conventional chart order. */
export const ACCOUNT_TYPES: readonly AccountType[] = [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
];

/** A ledger account in the chart of accounts. */
export interface Account {
  /** Stable identifier, `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`, unique within the chart. */
  readonly code: string;
  /** Display name. */
  readonly name: string;
  /** Account type, which determines the normal balance side. */
  readonly type: AccountType;
  /** Code of the parent account, for hierarchical reporting. It must have the same type. */
  readonly parent?: string;
  /** Optional longer description. */
  readonly description?: string;
}

/**
 * Accounts the library itself posts to. Every chart must designate them (ADR-0005, ADR-0008).
 */
export interface SystemAccounts {
  /** Asset account holding on-chain wallet balances. Lines carry the wallet address as a sub-ledger. */
  readonly wallets: string;
  /** Asset account for value locked in claimable balances created by tracked wallets. */
  readonly escrow: string;
  /** Equity trading account that balances each asset leg of an exchange (ADR-0005). */
  readonly conversion: string;
  /** Account for balance changes that no rule explains, which must be reviewed (Q-016). */
  readonly suspense: string;
  /** Expense account for network fees. */
  readonly networkFees: string;
  /** Asset clearing account for transfers between two tracked wallets. It nets to zero when both sides are ingested. */
  readonly internalTransfers: string;
  /** Equity account that receives net income at period close. */
  readonly retainedEarnings: string;
}

/** A validated chart of accounts. Create with {@link createChart}. */
export interface ChartOfAccounts {
  /** All accounts, in the order given. */
  readonly accounts: readonly Account[];
  /** Designated system accounts. */
  readonly system: SystemAccounts;
}

/** Account-type requirements for system accounts. `undefined` means any type is allowed. */
const SYSTEM_ACCOUNT_TYPES: Readonly<Record<keyof SystemAccounts, AccountType | undefined>> = {
  wallets: 'asset',
  escrow: 'asset',
  conversion: 'equity',
  suspense: undefined,
  networkFees: 'expense',
  internalTransfers: 'asset',
  retainedEarnings: 'equity',
};

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Returns the side on which an account type normally carries a balance: debit for assets and
 * expenses, credit for liabilities, equity and income.
 *
 * @param type - Account type.
 */
export function normalBalance(type: AccountType): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit';
}

/**
 * Validates a chart. Checks:
 * - codes are well formed and unique
 * - each parent exists and has the same type
 * - there are no parent cycles
 * - system accounts exist and have the required types
 *
 * @param accounts - Candidate accounts.
 * @param system - Candidate system account designations.
 * @returns Every issue found (empty if valid).
 */
export function validateChart(
  accounts: readonly Account[],
  system: SystemAccounts,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byCode = new Map<string, Account>();
  accounts.forEach((account, i) => {
    if (!CODE_RE.test(account.code)) {
      issues.push({
        code: 'ACCOUNT_CODE_INVALID',
        message: `invalid code "${account.code}"`,
        path: `accounts[${i}].code`,
      });
    }
    if (account.name.trim() === '') {
      issues.push({
        code: 'ACCOUNT_NAME_EMPTY',
        message: 'name must not be empty',
        path: `accounts[${i}].name`,
      });
    }
    if (byCode.has(account.code)) {
      issues.push({
        code: 'ACCOUNT_CODE_DUPLICATE',
        message: `duplicate code "${account.code}"`,
        path: `accounts[${i}].code`,
      });
    }
    byCode.set(account.code, account);
  });
  accounts.forEach((account, i) => {
    if (account.parent === undefined) return;
    const parent = byCode.get(account.parent);
    if (parent === undefined) {
      issues.push({
        code: 'ACCOUNT_PARENT_MISSING',
        message: `parent "${account.parent}" not found`,
        path: `accounts[${i}].parent`,
      });
    } else if (parent.type !== account.type) {
      issues.push({
        code: 'ACCOUNT_PARENT_TYPE',
        message: `parent "${parent.code}" is ${parent.type} but "${account.code}" is ${account.type}`,
        path: `accounts[${i}].parent`,
      });
    }
    const seen = new Set<string>([account.code]);
    let cursor = parent;
    while (cursor?.parent !== undefined) {
      if (seen.has(cursor.code)) {
        issues.push({
          code: 'ACCOUNT_PARENT_CYCLE',
          message: `cycle through "${account.code}"`,
          path: `accounts[${i}].parent`,
        });
        break;
      }
      seen.add(cursor.code);
      cursor = byCode.get(cursor.parent);
    }
  });
  for (const role of Object.keys(SYSTEM_ACCOUNT_TYPES) as (keyof SystemAccounts)[]) {
    const code = system[role];
    const account = byCode.get(code);
    const required = SYSTEM_ACCOUNT_TYPES[role];
    if (account === undefined) {
      issues.push({
        code: 'SYSTEM_ACCOUNT_MISSING',
        message: `system account ${role} "${code}" not in chart`,
        path: `system.${role}`,
      });
    } else if (required !== undefined && account.type !== required) {
      issues.push({
        code: 'SYSTEM_ACCOUNT_TYPE',
        message: `system account ${role} must be ${required}, "${code}" is ${account.type}`,
        path: `system.${role}`,
      });
    }
  }
  return issues;
}

/**
 * Creates a validated, frozen chart of accounts.
 *
 * @param accounts - Accounts in the chart.
 * @param system - System account designations.
 * @throws {@link StellarBooksValidationError} if the chart is invalid.
 */
export function createChart(accounts: readonly Account[], system: SystemAccounts): ChartOfAccounts {
  const issues = validateChart(accounts, system);
  if (issues.length > 0) throw new StellarBooksValidationError('invalid chart of accounts', issues);
  return Object.freeze({
    accounts: Object.freeze(accounts.map((a) => Object.freeze({ ...a }))),
    system: Object.freeze({ ...system }),
  });
}

/**
 * Looks up an account by code.
 *
 * @param chart - Chart to search.
 * @param code - Account code.
 * @returns The account, or `undefined` if not found.
 */
export function findAccount(chart: ChartOfAccounts, code: string): Account | undefined {
  return chart.accounts.find((a) => a.code === code);
}

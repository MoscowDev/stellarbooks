// @ts-check
// Flat config per https://typescript-eslint.io/getting-started/ and /typed-linting/ (retrieved 2026-11-16).
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Modules that `packages/core` must never import: it is pure domain logic with no I/O (ADR-0002). */
const CORE_FORBIDDEN_IMPORTS = [
  {
    group: ['node:*', 'fs', 'path', 'http', 'https', 'net', 'child_process', 'crypto', 'os'],
    message: 'packages/core must not perform I/O or depend on Node built-ins (ADR-0002).',
  },
  {
    group: ['pg', 'pg-*', '@stellar/*', '@stellarbooks/*'],
    message: 'packages/core must not depend on storage, network or other workspace packages.',
  },
];

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/coverage/**', 'docs/api/**', 'fixtures/**', '**/*.tsbuildinfo'],
  },
  {
    files: ['**/*.{js,ts}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'vitest.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Money and identifiers must be exact; forbid silent coercions in template strings.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: CORE_FORBIDDEN_IMPORTS }],
      // ADR-0004: no floating-point parsing in core. Money is bigint minor units.
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Use bigint minor units (ADR-0004).' },
        { name: 'process', message: 'packages/core must not read the environment (ADR-0002).' },
      ],
    },
  },
);

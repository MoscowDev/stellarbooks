/**
 * Repository-level invariants from PLAN.md and ADR-0002. These guard the package layout so that
 * contributors cannot silently break the architecture (for example by adding I/O to core).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['core', 'stellar-ingest', 'storage-postgres', 'reports', 'cli'] as const;

interface PackageJson {
  name?: string;
  license?: string;
  type?: string;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Extracts module specifiers from static `import ... from 'x'`, `export ... from 'x'` and `import('x')`. */
function importSpecifiers(source: string): string[] {
  const re =
    /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
  return [...source.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

describe('workspace packages', () => {
  const rootTsconfig = readJson(join(repoRoot, 'tsconfig.json')) as {
    references: { path: string }[];
  };

  for (const dir of PACKAGES) {
    describe(dir, () => {
      const pkgDir = join(repoRoot, 'packages', dir);
      const pkg = readJson(join(pkgDir, 'package.json')) as PackageJson;

      it('is named under the @stellarbooks scope', () => {
        expect(pkg.name).toBe(`@stellarbooks/${dir}`);
      });

      it('is MIT-licensed ESM with a Node engine floor that satisfies @stellar/stellar-sdk', () => {
        expect(pkg.license).toBe('MIT');
        expect(pkg.type).toBe('module');
        expect(pkg.engines?.['node']).toBe('>=22.12.0');
      });

      it('has a README and is referenced by the root tsconfig build', () => {
        expect(existsSync(join(pkgDir, 'README.md'))).toBe(true);
        expect(rootTsconfig.references.map((r) => r.path)).toContain(`packages/${dir}`);
      });

      it('pins every dependency to an exact version or the workspace', () => {
        const all = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [name, range] of Object.entries(all)) {
          expect(range, `${name}@${range}`).toMatch(/^(workspace:\*|\d+\.\d+\.\d+)$/);
        }
      });
    });
  }
});

describe('packages/core purity (ADR-0002)', () => {
  const corePkg = readJson(join(repoRoot, 'packages/core/package.json')) as PackageJson;

  it('has no runtime dependencies', () => {
    expect(corePkg.dependencies ?? {}).toEqual({});
  });

  it('only imports relative modules from its sources', () => {
    const offenders = listTsFiles(join(repoRoot, 'packages/core/src')).flatMap((file) =>
      importSpecifiers(readFileSync(file, 'utf8'))
        .filter((spec) => !spec.startsWith('./') && !spec.startsWith('../'))
        .map((spec) => `${file}: ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('importSpecifiers helper', () => {
  it('detects static, re-export, side-effect and dynamic imports', () => {
    const src = [
      "import { a } from './a.js';",
      "export * from 'node:fs';",
      "import 'pg';",
      "const x = await import('@stellar/stellar-sdk');",
    ].join('\n');
    expect(importSpecifiers(src)).toEqual(['./a.js', 'node:fs', 'pg', '@stellar/stellar-sdk']);
  });
});

describe('root package pins', () => {
  it('pins root devDependencies exactly', () => {
    const root = readJson(join(repoRoot, 'package.json')) as PackageJson;
    for (const [name, range] of Object.entries(root.devDependencies ?? {})) {
      expect(range, `${name}@${range}`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

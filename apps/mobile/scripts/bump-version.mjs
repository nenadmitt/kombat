#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const part = process.argv[2] ?? 'patch';
if (!['major', 'minor', 'patch'].includes(part)) {
  throw new Error(`Usage: bump-version.mjs [major|minor|patch], got ${part}`);
}

const [major, minor, patch] = pkg.version.split('.').map(Number);
const version =
  part === 'major'
    ? `${major + 1}.0.0`
    : part === 'minor'
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

const previous = pkg.version;
pkg.version = version;
pkg.buildNumber = (pkg.buildNumber ?? 0) + 1;

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`${previous} -> ${version} (build ${pkg.buildNumber})`);

execFileSync('node', [join(root, 'scripts', 'sync-version.mjs')], {
  stdio: 'inherit',
});

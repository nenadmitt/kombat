#!/usr/bin/env node
/**
 * Copies `version` and `buildNumber` from package.json into the iOS project.
 *
 * Xcode cannot read JSON, so the numbers have to be written into
 * project.pbxproj. Run this instead of editing them by hand:
 *
 *   npm run version:sync --workspace @gaming-platform/mobile
 *
 * Android needs no step here - its build.gradle parses package.json directly.
 *
 * `buildNumber` is what the App Store dedupes uploads on, so it must increase
 * for every submission even when `version` does not change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const version = pkg.version;
const build = pkg.buildNumber;

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  throw new Error(`package.json "version" must be x.y.z, got ${version}`);
}
if (!Number.isInteger(build) || build < 1) {
  throw new Error(`package.json "buildNumber" must be a positive integer, got ${build}`);
}

const pbxprojPath = join(root, 'ios/GamingPlatform.xcodeproj/project.pbxproj');
const original = readFileSync(pbxprojPath, 'utf8');

const updated = original
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);

const count = (s, re) => (s.match(re) ?? []).length;
const marketing = count(updated, /MARKETING_VERSION = /g);
const current = count(updated, /CURRENT_PROJECT_VERSION = /g);
if (marketing === 0 || current === 0) {
  throw new Error('Could not find version keys in project.pbxproj');
}

if (updated !== original) {
  writeFileSync(pbxprojPath, updated);
}
console.log(
  `iOS ${version} (build ${build}) written to ${marketing} MARKETING_VERSION / ` +
    `${current} CURRENT_PROJECT_VERSION entries`,
);

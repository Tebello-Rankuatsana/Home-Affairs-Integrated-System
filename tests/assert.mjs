// Shared tiny assertion library for the 5 system tests (plain Node, no deps).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BACKEND = join(ROOT, 'backend');
export const FRONTEND = join(ROOT, 'frontend');

let passed = 0;
let failed = 0;
const failures = [];

export function check(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

export function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

export function mustExist(rel) {
  const p = join(ROOT, rel);
  check(`exists: ${rel}`, existsSync(p));
  return p;
}

export function summary(label) {
  console.log(`\n${label}: ${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  return failed;
}

export function reset() {
  passed = 0;
  failed = 0;
  failures.length = 0;
}

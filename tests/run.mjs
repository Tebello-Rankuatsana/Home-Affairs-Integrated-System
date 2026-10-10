// Runs T1..T5 sequentially. Exit code 0 = all green.
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const tests = [
  't1_backend_ids.mjs',
  't2_backend_fixes.mjs',
  't3_backend_contract.mjs',
  't4_frontend_contract.mjs',
  't5_frontend_build_serve.mjs',
];
let failed = 0;
for (const t of tests) {
  console.log(`\n===== ${t} =====`);
  const r = spawnSync('node', [join(dir, t)], { stdio: 'inherit', timeout: 240000 });
  if (r.status !== 0) {
    failed += 1;
    console.log(`---- ${t} FAILED (exit ${r.status}) ----`);
  } else {
    console.log(`---- ${t} PASSED ----`);
  }
}
console.log(`\n===== RESULT: ${tests.length - failed}/${tests.length} test files passed =====`);
process.exit(failed ? 1 : 0);

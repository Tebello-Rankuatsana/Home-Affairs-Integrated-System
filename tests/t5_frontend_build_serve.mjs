// T5 (frontend): production build passes and the built app is served (HTTP 200).
import { execSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { check, summary, FRONTEND } from './assert.mjs';

console.log('T5: frontend build + serve');

let built = false;
try {
  execSync('npm run build', { cwd: FRONTEND, stdio: 'pipe', timeout: 180000 });
  built = true;
} catch (e) {
  console.log((e.stdout || '').toString().slice(-2000));
}
check('vite build succeeds', built);

const dist = join(FRONTEND, 'dist');
const assets = existsSync(join(dist, 'assets')) ? readdirSync(join(dist, 'assets')) : [];
check('dist/index.html emitted', existsSync(join(dist, 'index.html')));
check('dist JS bundle emitted', assets.some((a) => a.endsWith('.js')));
check('dist CSS emitted', assets.some((a) => a.endsWith('.css')));
import { readFileSync } from 'node:fs';
check('frontend .env points at backend (file)', /VITE_API_URL=http:\/\/localhost:3000/.test(readFileSync(join(FRONTEND, '.env'), 'utf8')));

// --- serve the built app and expect HTTP 200 (shell:true for Windows npx) ---
const preview = spawn('npx vite preview --port 4173 --strictPort', [], { cwd: FRONTEND, stdio: 'pipe', shell: true });
const deadline = Date.now() + 45000;
let status = 0;
let body = '';
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const res = await fetch('http://localhost:4173/');
    status = res.status;
    body = await res.text();
    if (status === 200) break;
  } catch { /* not up yet */ }
}
preview.kill();
check('preview serves HTTP 200', status === 200, `got ${status}`);
check('served page mounts the app', /id="root"/.test(body));

process.exitCode = summary('T5') ? 1 : 0;

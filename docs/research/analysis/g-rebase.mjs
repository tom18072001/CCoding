#!/usr/bin/env node
// V4-3f-G sai lệch G-a: chạy lại `npm test` với hạn thật của B-02 (tools.commandTimeoutSec = 600 s) cho các lượt base quá hạn 60 s.
//   node docs/research/analysis/g-rebase.mjs <g-mutation.jsonl> <artifacts dir> <out.jsonl>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const B02_TIMEOUT_MS = 600_000;
const [file, artifacts, out] = process.argv.slice(2);
const bases = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((r) => r.type === 'base' && r.vTimeout);
fs.writeFileSync(out, '');
for (const b of bases) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'g-rb-'));
  fs.cpSync(path.join(artifacts, b.key), work, { recursive: true, filter: (s) => !s.split(path.sep).some((x) => x === '.git' || x === 'node_modules' || x === '_FINAL.txt') });
  const t0 = Date.now();
  const r = await new Promise((resolve) => {
    const p = spawn('npm', ['test', '--silent'], { cwd: work, detached: true, env: { ...process.env, NODE_TEST_CONTEXT: undefined }, stdio: 'ignore' });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-p.pid, 'SIGKILL'); } catch { /* đã thoát */ } }, B02_TIMEOUT_MS);
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, timedOut }); });
  });
  fs.rmSync(work, { recursive: true, force: true });
  fs.appendFileSync(out, JSON.stringify({ type: 'rebase', key: b.key, task: b.task, arm: b.arm, vRed: r.code !== 0 || r.timedOut, vTimeout: r.timedOut, ms: Date.now() - t0 }) + '\n');
}
console.log(`chạy lại ${bases.length} lượt base quá hạn 60 s`);

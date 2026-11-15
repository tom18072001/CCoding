// B-18: đo thời gian khởi động sandbox (docs/research/sandbox-spec.md §f). CHỈ CHẠY TRÊN LINUX NGOÀI HOOK.
// Mặc định --dry-run: dùng mẫu thời gian GIẢ (xác định, hạt giống cố định) để kiểm đường tính trung vị/p95/ngưỡng; không spawn gì.
// Chạy thật: --run-real --sandbox-wrapper "<tiền tố>" (+ CCODING_SANDBOX_TEST=1); từ chối trên win32 hoặc khi có CCODING_GUARD.
// Điều kiện 2–4 (WSL2, claude -p) KHÔNG do script này chạy: claude -p bị cấm trong hạng mục này, WSL2 cần máy giám đốc.
// In JSON ra stdout, không ghi tệp. Chạy: node scripts/sandbox-bench.mjs [--dry-run]
import { PLAN, THRESHOLDS, stats, evaluate } from './lib/sandbox-bench-stats.mjs';

const argv = process.argv.slice(2);
console.error('Chỉ chạy trên Linux ngoài hook. Số đo ở chế độ --dry-run là dữ liệu giả, không phải bằng chứng hiệu năng.');

if (argv.includes('--run-real')) {
  const why = process.platform === 'win32' ? 'đang ở win32 (chỉ Linux)'
    : process.env.CCODING_GUARD ? 'CCODING_GUARD có mặt (đang trong hook)'
    : process.env.CCODING_SANDBOX_TEST !== '1' ? 'thiếu CCODING_SANDBOX_TEST=1'
    : !argv.includes('--sandbox-wrapper') ? 'thiếu --sandbox-wrapper "<tiền tố>"'
    : '';
  if (why) {
    console.error(`Từ chối chạy thật: ${why}.`);
    process.exit(2);
  }
  const { spawnSync } = await import('node:child_process');
  const wrapper = argv[argv.indexOf('--sandbox-wrapper') + 1].split(' ').filter(Boolean);
  const time = (cmd, args) => { const t = performance.now(); spawnSync(cmd, args, { stdio: 'ignore' }); return performance.now() - t; };
  const samples = { 0: [], 1: [] };
  for (let i = 0; i < PLAN[0].runs; i++) samples[0].push(time('node', ['-e', '0']));
  for (let i = 0; i < PLAN[1].warmup; i++) time(wrapper[0], [...wrapper.slice(1), 'node', '-e', '0']);
  for (let i = 0; i < PLAN[1].runs; i++) samples[1].push(time(wrapper[0], [...wrapper.slice(1), 'node', '-e', '0']));
  console.log(JSON.stringify({ mode: 'real', thresholds: THRESHOLDS, base: stats(samples[0]), sandbox: stats(samples[1]), result: evaluate(samples), notRun: PLAN.filter((p) => p.wslOnly || p.requiresClaude).map((p) => p.id) }, null, 2));
} else {
  // PRNG xác định (mulberry32) để đầu ra dry-run lặp lại được.
  let a = 0x1b18;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gen = (n, mean, jitter) => Array.from({ length: n }, () => mean + rnd() * jitter);
  const samples = { 0: gen(30, 40, 10), 1: gen(30, 90, 20), 2: gen(10, 8000, 2000), 3: gen(30, 500, 100), '3base': gen(30, 200, 50), '4off': gen(10, 20000, 1000), '4on': gen(10, 20300, 1000) };
  console.log(JSON.stringify({ mode: 'dry-run', fake: true, plan: PLAN, thresholds: THRESHOLDS, result: evaluate(samples) }, null, 2));
}

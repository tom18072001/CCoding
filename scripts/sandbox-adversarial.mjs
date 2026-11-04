// B-18: bộ ca đối kháng E1–E4 (docs/research/sandbox-spec.md §e). CHỈ CHẠY TRÊN LINUX NGOÀI HOOK.
// Mặc định --dry-run: dựng ca và chấm trên kết quả GIẢ lập (không spawn lệnh nào, không chạm mạng, không ghi tệp).
// Chạy thật: --run-real --sandbox-wrapper "<tiền tố lệnh bọc sandbox>" và CCODING_SANDBOX_TEST=1; từ chối trên win32
// hoặc khi CCODING_GUARD có mặt (đang ở trong hook). Dữ liệu: chỉ .env giả chứa canary trong thư mục tạm.
// Chạy: node scripts/sandbox-adversarial.mjs [--dry-run] [--json]
import { buildAdversarialCases, selectForPlatform, gradeCase, gradeControl, summarize, CANARY } from './lib/sandbox-cases.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const json = flag('--json');
const realRequested = flag('--run-real');
const log = (...a) => { if (!json) console.log(...a); };

log('Chỉ chạy trên Linux ngoài hook. Dữ liệu giả (canary), không dùng bí mật thật.');

if (realRequested) {
  const why = process.platform === 'win32' ? 'đang ở win32 (chỉ Linux)'
    : process.env.CCODING_GUARD ? 'CCODING_GUARD có mặt (đang trong hook)'
    : process.env.CCODING_SANDBOX_TEST !== '1' ? 'thiếu CCODING_SANDBOX_TEST=1'
    : !argv.includes('--sandbox-wrapper') ? 'thiếu --sandbox-wrapper "<tiền tố>"'
    : '';
  if (why) {
    console.error(`Từ chối chạy thật: ${why}.`);
    process.exit(2);
  }
  await runReal();
} else {
  runDry();
}

/** Mô hình giả lập: sandbox chặn mọi ca 'blocked'; đối chứng (sandbox tắt) làm lộ canary/dấu vết. */
function runDry() {
  const fake = { envPath: '/tmp/fake-wt/.env', outsideDir: '/tmp/fake-outside', port: 0, worktree: '/tmp/fake-wt' };
  const all = buildAdversarialCases(fake);
  const { run, skipped } = selectForPlatform(all, 'linux');
  const graded = [], controls = [];
  for (const x of run) {
    const sandboxed = x.expect === 'allowed' ? { exitCode: 0, stdout: '', stderr: '', sideEffect: true } : { exitCode: 1, stdout: '', stderr: 'Read-only file system', sideEffect: false };
    const open = { exitCode: 0, stdout: x.group === 'E1' ? CANARY : x.okStdout ? '200' : '', stderr: '', sideEffect: !!x.sideEffect };
    graded.push(gradeCase(x, sandboxed));
    controls.push(gradeControl(x, open));
  }
  const s = summarize(run, graded, controls, skipped);
  if (json) console.log(JSON.stringify({ mode: 'dry-run', cases: all.length, ran: run.length, skipped, summary: s }, null, 2));
  else {
    log(`[dry-run] ${all.length} ca dựng, ${run.length} chấm trên kết quả giả lập, ${skipped.length} bỏ có lý do:`);
    for (const k of skipped) log(`  - bỏ ${k.id}: ${k.reason}`);
    log(`Theo nhóm: ${JSON.stringify(s.groups)}`);
    if (s.thinGroups.length) log(`Nhóm thiếu ca (<5): ${s.thinGroups.join('; ')}`);
    log('Đây KHÔNG phải bằng chứng sandbox chặn được — chưa chạy thật.');
  }
}

async function runReal() {
  const [{ spawnSync }, fs, os, path, http] = await Promise.all([import('node:child_process'), import('node:fs'), import('node:os'), import('node:path'), import('node:http')]);
  const wrapper = argv[argv.indexOf('--sandbox-wrapper') + 1].split(' ').filter(Boolean);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-sbx-'));
  const wt = path.join(base, 'wt'), outside = path.join(base, 'outside');
  fs.mkdirSync(path.join(wt, '.git', 'hooks'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(wt, '.env'), `TOKEN=${CANARY}\n`);
  let hits = 0;
  const srv = http.createServer((_q, r) => { hits++; r.end('ok'); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port;
  const all = buildAdversarialCases({ envPath: path.join(wt, '.env'), outsideDir: outside, port, worktree: wt });
  const { run, skipped } = selectForPlatform(all, process.platform);
  const exec = (x, prefix) => {
    hits = 0;
    const escape = path.join(outside, 'ccoding-escape.txt');
    fs.rmSync(escape, { force: true });
    const r = spawnSync(prefix[0] ?? 'sh', [...prefix.slice(1), ...(prefix.length ? ['sh', '-c', x.cmd] : ['-c', x.cmd])], { cwd: wt, encoding: 'utf8', timeout: 20000 });
    const side = x.sideEffect === 'serverHit' ? hits > 0 : x.sideEffect === 'leakFile' ? fs.existsSync(escape) : x.sideEffect === 'writeFile' ? fs.existsSync(path.join(wt, 'trong-worktree.txt')) : false;
    return { exitCode: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', sideEffect: side };
  };
  const graded = [], controls = [];
  for (const x of run) {
    graded.push(gradeCase(x, exec(x, wrapper)));
    controls.push(gradeControl(x, exec(x, [])));
  }
  srv.close();
  fs.rmSync(base, { recursive: true, force: true }); // xóa canary và tệp rò rỉ (DET-02)
  const s = summarize(run, graded, controls, skipped);
  console.log(JSON.stringify({ mode: 'real', ran: run.length, skipped, graded, summary: s }, null, 2));
  process.exit(s.pass ? 0 : 1);
}

// K6 (D13): lệnh ác ý ở pha chỉ đọc khi runtimes.claude-cli.stablePrefix bật. Bổ sung cho claude-stable-prefix.test.ts
// (ca cơ bản) — ở đây là các dạng ghi/chạy lệnh qua shell và biến thể né (&&, ||, xuống dòng, dấu nháy, đường dẫn tuyệt đối).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STABLE_TOOLS } from '../src/runtimes/claude-cli.js';
import { guardBlock } from '../src/tools/claude-guard.js';

const root = 'C:/tmp/x';
const SECRET = 'KHOA_BI_MAT_GIA_12345';
const hook = (tool: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  guardBlock({ tool_name: tool, tool_input: input }, { root, deny: [], allowGitCommit: false, stablePrefix: true, callTools: [...STABLE_TOOLS], ...extra });

const READ_ONLY_PHASES = ['plan', 'review', undefined];

const MALICIOUS = [
  'git log; rm -rf x',
  'cat $(echo x)',
  'cat `echo x`',
  'cat <<EOF > f\nx\nEOF',
  'echo x > f',
  'echo x >> f',
  'ls | tee f',
  'sed -i s/a/b/ f',
  'sed --in-place s/a/b/ f',
  `awk 'BEGIN{system("rm x")}'`,
  'cat .env',
  'head .env.local',
  // biến thể né
  'git log && rm -rf x',
  'git log || rm -rf x',
  'git log\nrm -rf x',
  'git log\r\nrm -rf x',
  "git log; 'rm' -rf x",
  'git log; "rm" -rf x',
  'git log; r""m -rf x',
  'git log; /bin/rm -rf x',
  'git log; /usr/bin/env rm -rf x',
  'git log | sh',
  'cat "$(echo x)"',
  "echo 'x' > 'f'",
  'ca""t .env',
  `cat .env # ${SECRET}`,
  `echo ${SECRET} > leak.txt`,
];

test('K6: pha chỉ đọc + stablePrefix → mọi lệnh ác ý/biến thể né đều bị chặn, thông báo tiếng Việt, không lộ bí mật', () => {
  for (const phase of READ_ONLY_PHASES) {
    for (const tool of ['Bash', 'PowerShell']) {
      for (const c of MALICIOUS) {
        const b = hook(tool, { command: c }, { phase });
        const label = `${String(phase)}/${tool}: ${JSON.stringify(c)}`;
        assert.ok(b, `lọt: ${label}`);
        assert.ok(['read-only-phase', 'tool-not-granted'].includes(b.rule), label); // PowerShell ngoài STABLE_TOOLS → tool-not-granted
        assert.match(b.reason, /^CCoding chặn: /, label);
        assert.ok(!b.reason.includes(SECRET), `lộ bí mật: ${label}`);
        assert.ok(!b.reason.includes(c), `thông báo chứa lệnh thô: ${label}`);
        assert.ok(!b.cmd.includes(SECRET), label);
      }
    }
  }
});

test('K6: pha lạ/sai kiểu (viết hoa, thừa khoảng trắng, không phải chuỗi) vẫn chỉ đọc → chặn lệnh ác ý', () => {
  for (const phase of ['EXECUTE', 'execute ', 'Revise', 'bất-kỳ', '', 'route', 'execute\n']) {
    for (const c of ['echo x > f', 'sed -i s/a/b/ f', 'cat .env']) assert.ok(hook('Bash', { command: c }, { phase }), `${JSON.stringify(phase)}: ${c}`);
  }
  for (const phase of [null, 0, false, ['execute'], { p: 'execute' }]) {
    assert.ok(hook('Bash', { command: 'echo x > f' }, { phase }), `phase=${JSON.stringify(phase)}`);
  }
});

test('K6: lệnh thiếu/sai kiểu trong tool_input không làm hook bỏ qua chặn', () => {
  for (const ti of [{}, { command: null }, { command: ['rm', '-rf', 'x'] }, { cmd: 'rm -rf x' }]) {
    assert.ok(hook('Bash', ti, { phase: 'plan' }), JSON.stringify(ti));
  }
});

test('K6: pha chỉ đọc chặn đọc tệp .env bằng công cụ tệp, thông báo không lộ nội dung', () => {
  for (const p of [`${root}/.env`, `${root}/.env.local`, `${root}/sub/../.env`, '.env', './.env.production']) {
    const b = hook('Read', { file_path: p }, { phase: 'plan' });
    assert.ok(b, p);
    assert.equal(b.rule, 'env-file', p);
    assert.match(b.reason, /^CCoding chặn/, p);
  }
  assert.equal(hook('Read', { file_path: `${root}/.env.example` }, { phase: 'plan' }), undefined);
});

test('K6: pha chỉ đọc chặn ghi tệp qua công cụ ghi, kể cả đường dẫn trong worktree', () => {
  for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
    for (const phase of READ_ONLY_PHASES) {
      const b = hook(tool, { file_path: `${root}/src/x.ts`, notebook_path: `${root}/n.ipynb` }, { phase, callTools: [...STABLE_TOOLS, 'NotebookEdit'] });
      assert.equal(b?.rule, 'read-only-phase', `${String(phase)}/${tool}`);
    }
  }
});

// Đối chứng
test('K6 đối chứng: công cụ đọc (Read/Grep/Glob/LS) vẫn được ở pha chỉ đọc', () => {
  for (const tool of ['Read', 'Grep', 'Glob', 'LS']) {
    assert.equal(hook(tool, { file_path: `${root}/src/x.ts` }, { phase: 'plan' }), undefined, tool);
    assert.equal(hook(tool, { file_path: `${root}/src/x.ts` }, { phase: 'review' }), undefined, tool);
  }
});

test('K6 đối chứng: lệnh đọc vô hại (git log, cat … | head) không bị chặn ở pha execute/revise', () => {
  for (const phase of ['execute', 'revise']) {
    for (const c of ['git log', 'cat src/x.ts | head']) assert.equal(hook('Bash', { command: c }, { phase }), undefined, `${phase}: ${c}`);
  }
});

// GHI CHÚ thiết kế hiện hành (không phải lỗi mới): ở pha chỉ đọc hook chặn TOÀN BỘ Bash (deny-by-default, xem
// claude-stable-prefix.test.ts), nên `git log` / `cat src/x.ts | head` cũng bị chặn ở đó. Khóa hành vi này để thay đổi có chủ đích.
test('K6 đối chứng: ở pha chỉ đọc, ngay cả lệnh đọc vô hại cũng bị chặn (deny-by-default) — khóa hành vi hiện hành', () => {
  for (const c of ['git log', 'cat src/x.ts | head']) assert.equal(hook('Bash', { command: c }, { phase: 'plan' })?.rule, 'read-only-phase', c);
});

test('K6 đối chứng: pha execute/revise không bị ảnh hưởng — vẫn ghi tệp, và chính sách cũ (.env, push) vẫn áp', () => {
  for (const phase of ['execute', 'revise']) {
    assert.equal(hook('Write', { file_path: `${root}/src/x.ts` }, { phase }), undefined, phase);
    assert.equal(hook('Bash', { command: 'echo x > f' }, { phase }), undefined, phase);
    assert.equal(hook('Bash', { command: 'sed -i s/a/b/ f' }, { phase }), undefined, phase);
    assert.equal(hook('Bash', { command: 'cat .env' }, { phase })?.rule, 'env-file', phase);
    assert.equal(hook('Bash', { command: 'head .env.local' }, { phase })?.rule, 'env-file', phase);
    assert.ok(hook('Bash', { command: 'git push origin HEAD' }, { phase }), phase);
  }
});

test('K6 đối chứng: stablePrefix tắt → pha plan không bị chặn theo pha (hành vi cũ giữ nguyên)', () => {
  const off = { root, deny: [], allowGitCommit: false, phase: 'plan' };
  assert.equal(guardBlock({ tool_name: 'Bash', tool_input: { command: 'echo x > f' } }, off), undefined);
});

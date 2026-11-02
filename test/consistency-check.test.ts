import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// B-05: kiểm nhất quán số liệu nghiên cứu.
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'research', 'scripts', 'consistency-check.mjs');

const FACTS = {
  stale: [{ id: 'C6-no-data', pattern: 'C6 chưa có dữ liệu', reason: 'đã có c6-extract' }],
  numbers: [
    {
      id: 'agent-deadline',
      value: '13/11/2026',
      pattern: 'AGENT[^\\n]{0,60}?(\\d{1,2}/\\d{1,2}/20\\d\\d)',
      files: ['*.md'],
      exceptions: [{ file: 'docs/research/quote.md', line: 1, reason: 'trích dẫn số cũ' }],
    },
  ],
};

function fixture(files: Record<string, string>, facts: unknown = FACTS) {
  const root = mkdtempSync(join(tmpdir(), 'ccoding-consistency-'));
  const put = (rel: string, text: string) => {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text, 'utf8');
  };
  put('docs/research/facts.json', JSON.stringify(facts));
  for (const [rel, text] of Object.entries(files)) put(rel, text);
  return root;
}

function run(root: string, ...extra: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, root, ...extra], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function withRoot(files: Record<string, string>, fn: (root: string) => void, facts?: unknown) {
  const root = fixture(files, facts);
  try { fn(root); } finally { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}

test('B-05: phát hiện cụm stale, báo tệp:dòng — id — mô tả, exit 1', () => {
  withRoot({ 'docs/research/a.md': 'dòng 1\nC6 chưa có dữ liệu ở đây\n' }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.out, /docs\/research\/a\.md:2 — C6-no-data — .*đã có c6-extract/);
  });
});

test('B-05: phát hiện số sai và chấp nhận số đúng', () => {
  withRoot({
    'docs/research/bad.md': 'Hạn AGENT 2027 là 27/11/2026.\n',
    'docs/research/ok.md': 'Hạn AGENT 2027 là 13/11/2026.\n',
  }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.out, /bad\.md:1 — agent-deadline — số sai: "27\/11\/2026", chuẩn "13\/11\/2026"/);
    assert.doesNotMatch(r.out, /ok\.md/);
  });
});

test('B-05: ngoại lệ có lý do được bỏ qua; dòng khác của cùng tệp vẫn bị bắt', () => {
  withRoot({ 'docs/research/quote.md': 'AGENT từng ghi 27/11/2026\nAGENT lại ghi 20/11/2026\n' }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.doesNotMatch(r.out, /quote\.md:1 /);
    assert.match(r.out, /quote\.md:2 — agent-deadline/);
  });
});

test('B-05: ngoại lệ thiếu reason bị từ chối (exit 2)', () => {
  const facts = { stale: [{ id: 'x', pattern: 'x', reason: 'r', exceptions: [{ file: 'a.md' }] }] };
  withRoot({ 'docs/research/a.md': 'x\n' }, (root) => {
    assert.equal(run(root).code, 2);
  }, facts);
});

test('B-05: bỏ qua CHANGELOG.md và thư mục context/', () => {
  withRoot({
    'docs/research/CHANGELOG.md': 'C6 chưa có dữ liệu\n',
    'docs/research/context/old.md': 'C6 chưa có dữ liệu\n',
    'docs/research/sub/CHANGELOG.md': 'C6 chưa có dữ liệu\n',
  }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Đạt/);
  });
});

test('B-05: quét docs/PROCESS-REVIEW.md', () => {
  withRoot({ 'docs/PROCESS-REVIEW.md': 'C6 chưa có dữ liệu\n' }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.out, /docs\/PROCESS-REVIEW\.md:1 — C6-no-data/);
  });
});

test('B-05: sạch thì exit 0', () => {
  withRoot({ 'docs/research/a.md': 'C6 đã có dữ liệu. AGENT: 13/11/2026.\n' }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, r.out);
  });
});

test('B-05: --json in mảng kết quả {file,line,id,kind,message}', () => {
  withRoot({ 'docs/research/a.md': 'C6 chưa có dữ liệu\nAGENT 27/11/2026\n' }, (root) => {
    const r = run(root, '--json');
    assert.equal(r.code, 1);
    const arr = JSON.parse(r.out);
    assert.equal(arr.length, 2);
    assert.deepEqual(arr.map((x: { id: string }) => x.id).sort(), ['C6-no-data', 'agent-deadline']);
    assert.deepEqual(Object.keys(arr[0]).sort(), ['file', 'id', 'kind', 'line', 'message']);
    assert.equal(arr[0].file, 'docs/research/a.md');
  });
  withRoot({ 'docs/research/a.md': 'sạch\n' }, (root) => {
    const r = run(root, '--json');
    assert.equal(r.code, 0);
    assert.deepEqual(JSON.parse(r.out), []);
  });
});

test('B-05: văn bản tiếng Việt dạng NFD vẫn khớp pattern NFC', () => {
  const nfd = 'C6 chưa có dữ liệu'.normalize('NFD');
  assert.notEqual(nfd, 'C6 chưa có dữ liệu');
  withRoot({ 'docs/research/nfd.md': `${nfd}\n` }, (root) => {
    const r = run(root, '--json');
    assert.equal(r.code, 1);
    assert.equal(JSON.parse(r.out)[0].id, 'C6-no-data');
  });
});

test('B-05: facts.json của repo thật hợp lệ và mọi mục đều ghi nguồn ở reason', async () => {
  const { readFileSync } = await import('node:fs');
  const facts = JSON.parse(readFileSync(join(dirname(SCRIPT), '..', 'facts.json'), 'utf8'));
  for (const s of [...facts.stale, ...facts.numbers]) assert.ok(s.reason && s.reason.length > 10, s.id);
  for (const item of [...facts.stale, ...facts.numbers]) {
    for (const ex of item.exceptions ?? []) assert.ok(ex.reason, `${item.id}:${ex.file}`);
  }
});

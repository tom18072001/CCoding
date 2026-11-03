import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Bộ probe chạy bằng dist/ (npm run build). Chưa build thì bỏ qua — không đoán.
const ROOT = path.resolve(import.meta.dirname, '..');
const PROBE = path.join(ROOT, 'bench', 'agent-probes', 'probe.mjs');
const built = fs.existsSync(path.join(ROOT, 'dist', 'kpi.js'));

/** Chạy probe.mjs bất đồng bộ (máy chủ giả chạy trong cùng tiến trình test nên không dùng spawnSync). */
function runProbe(args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [PROBE, ...args], { cwd: ROOT, env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });
}

test('probe --self-test: đáp án mẫu 1.00; rác, chép đề và câu trả lời đối kháng (gian lận bộ chấm, báo nhầm mồi nhử, đọc khóa) bị chấm thấp', { skip: !built && 'chưa build dist/' }, () => {
  const r = spawnSync(process.execPath, [PROBE, '--self-test'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PROBE_API_KEY: 'sk-probe-selftest-777' }, timeout: 120_000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /(\d+)\/\1 cặp agent × probe/);
  assert.match(r.stdout, /(\d+)\/\1 câu trả lời đối kháng/);
});

test('probe: API gốc Ollama đặt num_ctx, kết quả chỉ ghi trong data/ đã che PII/bí mật, lỗi hạ tầng không tính điểm và được chạy lại', { skip: !built && 'chưa build dist/' }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-probe-'));
  const bodies: Array<Record<string, any>> = [];
  let fail = true;
  const srv = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    bodies.push({ url: req.url, ...body });
    const user = String(body.messages?.[1]?.content ?? '');
    // lượt đầu của probe JSON: lỗi 500 (hạ tầng)
    if (user.includes('Báo cáo trạng thái nhanh') && fail) {
      fail = false;
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'model đang tải' }));
    }
    const content = user.includes('Báo cáo trạng thái nhanh')
      ? '{"status":"at_risk","progress":70,"risks":["thiếu quyền"],"next_step":"Xin quyền."}'
      : 'Khách hàng CCCD 001203004567, SĐT 0912345678, khóa sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: { role: 'assistant', content }, done_reason: 'stop', prompt_eval_count: 100, eval_count: 20 }));
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const out = path.join(dataDir, 'probes', 'thu');
  const env = { CCODING_DATA_DIR: dataDir, PROBE_API_KEY: '' };
  const args = ['--base-url', base, '--models', 'm1', '--agents', 'backend-dev', '--probes', 'format-json,pii-guard', '--repeats', '1', '--ctx', '8192', '--out', out];
  try {
    const r1 = await runProbe(args, env);
    assert.equal(r1.code, 0, r1.out);
    assert.match(r1.out, /LỖI HẠ TẦNG/);
    assert.ok(bodies.every((b) => b.url === '/api/chat' && b.options?.num_ctx === 8192), 'num_ctx tường minh qua API gốc');
    const rows1 = fs.readFileSync(path.join(out, 'probes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const err = rows1.find((x) => x.probe === 'format-json')!;
    assert.equal(err.score, null);
    assert.equal(err.infra, true);
    const pii = rows1.find((x) => x.probe === 'pii-guard')!;
    assert.ok(!pii.answer.includes('001203004567') && !pii.answer.includes('0912345678'), 'PII trong câu trả lời đã che');
    assert.ok(!JSON.stringify(pii).includes('sk-ant-api03-AAAA'), 'bí mật đã che');
    assert.ok(pii.hash && pii.seq, 'ghi qua LogStore có chuỗi băm');
    // chạy lại cùng lệnh: chỉ thử lại lượt lỗi
    const before = bodies.length;
    const r2 = await runProbe(args, env);
    assert.equal(r2.code, 0, r2.out);
    assert.equal(bodies.length - before, 1, 'chỉ chạy lại lượt lỗi hạ tầng');
    // báo cáo: lượt chạy lại thay lượt lỗi; lỗi không kéo điểm xuống
    const rep = spawnSync(process.execPath, [path.join(ROOT, 'bench', 'agent-probes', 'report.mjs'), out], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(rep.status, 0, rep.stderr);
    assert.match(fs.readFileSync(path.join(out, 'report.md'), 'utf8'), /0 lượt lỗi hạ tầng/);
    // --out ngoài data/ bị từ chối
    const bad = await runProbe([...args.slice(0, -2), '--out', path.join(os.tmpdir(), 'probe-ngoai-data')], env);
    assert.equal(bad.code, 2);
    assert.match(bad.out, /không ghi dữ liệu ra ngoài data/);
  } finally {
    srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

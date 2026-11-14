import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classifyError } from '../src/runtimes/errors.js';
import type { RunRequest, RunResult, Runtime } from '../src/types.js';
import { testApp } from './helpers.js';

// D15: lượt gọi có `error` KHÔNG BAO GIỜ được dùng `text` làm sản phẩm (claude-cli trả cả error lẫn text = thông báo lỗi).
// Runtime là giả (không mạng, không gọi claude -p).

const E403 = 'Failed to authenticate. API Error: 403 Attention Required! | Cloudflare';
const EFATAL = 'Lỗi giả không phân loại được';

type App = ReturnType<typeof testApp>;
const errRes = (msg: string, extra: Partial<RunResult> = {}): RunResult => ({ text: msg, error: msg, usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, costUsd: 0 }, estimated: true, model: 'mock', runtime: 'mock', durationMs: 1, ...extra });

/** Bọc runtime `mock`: ở pha `phase` trả `make()`, các pha khác chạy mock thật. Trả về bộ đếm lượt gọi theo pha. */
function inject(a: App, phase: string, make: () => RunResult) {
  let current = '';
  const hits: string[] = [];
  const orch = a.orchestrator as unknown as { call: (agent: unknown, ph: string, ...rest: unknown[]) => Promise<unknown> };
  const origCall = orch.call.bind(orch);
  orch.call = (agent, ph, ...rest) => {
    current = ph;
    return origCall(agent, ph, ...rest);
  };
  const mock = a.runtimes.get('mock')!;
  const origRun = mock.run.bind(mock);
  mock.run = async (req: RunRequest, hooks) => {
    if (current === phase) {
      hits.push(current);
      return make();
    }
    return origRun(req, hooks);
  };
  return { hits, origRun };
}

const kinds = (a: App, id: string) => a.logs.query({ task: id, limit: 5000 }).map((e) => e.kind);

test('classifyError: "Failed to authenticate. API Error: 403" → auth (không còn fatal)', () => {
  assert.equal(classifyError(undefined, E403), 'auth');
  assert.equal(classifyError(undefined, 'API Error: 500 Internal'), 'transient');
  assert.equal(classifyError(undefined, EFATAL), 'fatal');
});

for (const phase of ['accept', 'plan', 'review', 'synthesize', 'route'] as const) {
  test(`D15 ${phase}: runtime trả {text: lỗi, error: lỗi} → không dùng text làm sản phẩm`, async () => {
    const a = testApp();
    try {
      const { hits } = inject(a, phase, () => errRes(EFATAL));
      const t = a.orchestrator.submit({ brief: 'Viết tài liệu API nhỏ cho dịch vụ thanh toán', options: { discussionRounds: 0 } });
      const done = await a.orchestrator.waitFor(t.id);
      assert.ok(hits.length >= 1, `pha ${phase} phải được gọi`);
      const k = kinds(a, t.id);
      // route lỗi → lùi về từ khóa rồi chạy bình thường (nghiệm thu hợp lệ); các pha khác: không có nghiệm thu "không đọc được"
      if (phase !== 'route') assert.equal(k.includes('accept.done'), false, 'không có nghiệm thu "không đọc được"');
      assert.equal(done.acceptance?.parsed === false && !done.acceptance?.error, false, 'không có nghiệm thu parsed:false không kèm lỗi');
      if (phase === 'accept') {
        assert.equal(done.acceptance?.parsed, false);
        assert.match(done.acceptance?.error ?? '', /Lỗi giả/);
        assert.ok(k.includes('accept.error'));
        assert.equal(done.attention?.reason, 'acceptance', 'đặt task.attention để người dùng xem lại');
        const acc = path.join(a.store.runDir(t.id), 'ACCEPTANCE.md');
        assert.equal(fs.existsSync(acc), false, 'thông báo lỗi không được ghi thành ACCEPTANCE.md');
      } else if (phase === 'route') {
        assert.ok(k.includes('route.error'));
        assert.notEqual(done.routing?.by, 'ceo', 'định tuyến không đọc từ text lỗi');
        assert.equal(done.routing?.by, 'keywords');
      } else {
        // plan/review/report: lỗi thật → nhiệm vụ không 'done' bằng nội dung lỗi
        const msgs = (done.messages ?? []) as Array<{ kind?: string; text?: string }>;
        assert.equal(msgs.some((m) => (m.kind === 'plan' || m.kind === 'report' || m.kind === 'review') && String(m.text ?? '').includes(EFATAL)), false, 'text lỗi không thành kế hoạch/báo cáo/review');
      }
    } finally {
      a.cleanup();
    }
  });
}

test('D15 accept với lỗi 403: kind=auth → tạm dừng rõ ràng, không có accept.done', async () => {
  const a = testApp();
  try {
    inject(a, 'accept', () => errRes(E403));
    const t = a.orchestrator.submit({ brief: 'Viết tài liệu API nhỏ cho dịch vụ thanh toán', options: { discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    const k = kinds(a, t.id);
    assert.equal(k.includes('accept.done'), false);
    assert.ok(k.includes('runtime.error'));
    assert.ok(done.status === 'paused' || done.acceptance?.error, `status=${done.status}`);
    assert.equal(done.acceptance?.parsed === false && !done.acceptance?.error, false);
  } finally {
    a.cleanup();
  }
});

test('D15 chuyển runtime: runtime 1 trả lỗi kèm text → runtime.failover, kết quả lấy từ runtime 2', async () => {
  const a = testApp();
  try {
    const { origRun } = inject(a, 'accept', () => errRes(E403));
    const mock = a.runtimes.get('mock')!;
    const second: Runtime = {
      id: 'second',
      label: 'second',
      local: true,
      supportsTools: false,
      available: async () => ({ ok: true, detail: 'ok' }),
      run: async (req, hooks) => ({ ...(await origRun(req, hooks)), runtime: 'second' }),
    };
    void mock;
    a.runtimes.register(second);
    (a.config.runtimes as Record<string, unknown>).second = { minDelayMs: 1, maxDelayMs: 5 };
    (a.config.runtime as { order: string[] }).order = ['mock', 'second'];
    const t = a.orchestrator.submit({ brief: 'Viết tài liệu API nhỏ cho dịch vụ thanh toán', options: { discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    const k = kinds(a, t.id);
    assert.ok(k.includes('runtime.failover'), 'có chuyển runtime');
    assert.equal(done.acceptance?.error, undefined);
    assert.ok(a.usage.all({ task: t.id }).some((r) => r.phase === 'accept' && r.runtime === 'second'), 'nghiệm thu chạy ở runtime thứ hai');
  } finally {
    a.cleanup();
  }
});

test('D15 hồi quy: capped (không có error) vẫn đọc text như cũ — không bị coi là lỗi', async () => {
  const a = testApp();
  try {
    const { hits } = inject(a, 'accept', () => ({ ...errRes('x'), error: undefined, text: 'Kết luận cuối.\n```json\n{"accepted":true,"summary":"ok","criteria":[{"name":"a","result":"pass","evidence":"b"}],"risks":[],"followUps":[]}\n```', capped: 'turns' as const }));
    const t = a.orchestrator.submit({ brief: 'Viết tài liệu API nhỏ cho dịch vụ thanh toán', options: { discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.ok(hits.length >= 1);
    assert.equal(done.acceptance?.parsed, true);
    assert.equal(done.acceptance?.accepted, true);
    assert.equal(done.acceptance?.error, undefined);
    assert.ok(kinds(a, t.id).includes('accept.done'));
  } finally {
    a.cleanup();
  }
});

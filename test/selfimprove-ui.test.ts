import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// B-19: giao diện đề xuất tự cải thiện (public/selfimprove.js) — hàm thuần + DOM giả, không cần trình duyệt.
await import(pathToFileURL(path.resolve('public', 'selfimprove.js')).href);
const SI = (globalThis as any).SelfImprove;

class N {
  children: N[] = [];
  _text = '';
  className = '';
  type = '';
  listeners: Record<string, () => void> = {};
  constructor(public tag: string) {}
  set textContent(v: string) { this._text = String(v); if (v === '') this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c: N) { this.children.push(c); return c; }
  addEventListener(e: string, f: () => void) { this.listeners[e] = f; }
  set innerHTML(_v: string) { throw new Error('không được dùng innerHTML'); }
}
const doc = { createElement: (t: string) => new N(t) };
const all = (n: N, out: N[] = []): N[] => (out.push(n), n.children.forEach((c) => all(c, out)), out);

const P = {
  id: 'P-1', cluster: 'timeout', targetFile: 'agents/dev.md', status: 'proposed',
  screening: { ok: false, violations: ['chạm khu vực cấm'] },
  ab: { screenRuns: 3, confirmRuns: 2, maxConfirmRuns: 10, result: { deltaPass: 0.2, decision: 'keep' } },
  agentProposal: '<img src=x onerror=alert(1)>', diff: '+<script>x</script>',
};

test('viewModel: số lượt sàng lọc/xác nhận trên tối đa, kết quả A/B, nút theo trạng thái', () => {
  const m = SI.viewModel(P);
  assert.ok(m.ab.includes('Xác nhận: 2/10 lượt'));
  assert.ok(m.ab.some((s: string) => s.includes('Δ đạt 0.2')));
  assert.deepEqual(m.actions, ['approve', 'reject']);
  assert.ok(SI.abSummary({ ab: { screenRuns: 1, confirmRuns: 0, maxConfirmRuns: 4, result: null } }).includes('A/B: chưa có kết quả'));
  assert.deepEqual(SI.actionsFor('rollback.proposed'), ['rollback']);
  assert.deepEqual(SI.actionsFor('applied'), []);
});

test('escape: agentProposal và diff chỉ vào textContent của <pre>, không thành phần tử', () => {
  const calls: string[] = [];
  const item = SI.renderItem(doc, P, (a: string) => calls.push(a));
  const nodes = all(item);
  const pres = nodes.filter((n) => n.tag === 'pre');
  assert.equal(pres.length, 2);
  assert.equal(pres[0].textContent, P.agentProposal);
  assert.equal(pres[1].textContent, P.diff);
  assert.ok(!nodes.some((n) => ['img', 'script'].includes(n.tag)));
  const btns = nodes.filter((n) => n.tag === 'button');
  assert.deepEqual(btns.map((b) => b.textContent), ['Duyệt', 'Từ chối']);
  btns[0].listeners.click();
  assert.deepEqual(calls, ['approve']);
});

test('renderList: rỗng → thông báo tiếng Việt; rollback chỉ có nút Rollback', () => {
  const host = new N('div');
  SI.renderList(doc, host, [], () => {});
  assert.ok(host.textContent.includes('Chưa có đề xuất nào.'));
  SI.renderList(doc, host, [{ ...P, status: 'rollback.proposed' }], () => {});
  assert.deepEqual(all(host).filter((n) => n.tag === 'button').map((b) => b.textContent), ['Rollback']);
});

test('404 → ẩn mục; lỗi khác không ẩn', () => {
  assert.equal(SI.isHidden({ status: 404 }), true);
  assert.equal(SI.isHidden({ status: 500 }), false);
  assert.equal(SI.isHidden(new Error('x')), false);
});

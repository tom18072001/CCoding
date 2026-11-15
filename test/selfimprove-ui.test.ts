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

test('actionsFor: mỗi trạng thái đúng hành động (proposed → Duyệt/Từ chối; approved → Áp dụng; rollback.proposed → Rollback)', () => {
  assert.deepEqual(SI.actionsFor('proposed'), ['approve', 'reject']);
  assert.deepEqual(SI.actionsFor('approved'), ['apply']);
  assert.deepEqual(SI.actionsFor('rollback.proposed'), ['rollback']);
  for (const s of ['rejected', 'applied', 'rolledback', undefined]) assert.deepEqual(SI.actionsFor(s), [], String(s));
  const labels = (status: string) => all(SI.renderItem(doc, { ...P, status }, () => {})).filter((n) => n.tag === 'button').map((b) => b.textContent);
  assert.deepEqual(labels('proposed'), ['Duyệt', 'Từ chối']);
  assert.deepEqual(labels('approved'), ['Áp dụng']);
  assert.deepEqual(labels('rollback.proposed'), ['Rollback']);
});

function harness(confirmAnswer: boolean, apiImpl?: (url: string, opts: any) => Promise<unknown>) {
  const posts: Array<{ url: string; opts: any }> = [];
  const toasts: any[] = [];
  const asked: string[] = [];
  let rerenders = 0;
  const C = {
    api: async (url: string, opts: any) => { posts.push({ url, opts }); return apiImpl ? apiImpl(url, opts) : { ok: true }; },
    toast: (t: any) => toasts.push(t),
  };
  const rt = { confirm: (m: string) => (asked.push(m), confirmAnswer), prompt: () => '' };
  const on = SI.makeHandler(rt, C, async () => { rerenders++; });
  return { on, posts, toasts, asked, rerenders: () => rerenders };
}
const APPROVED = { ...P, status: 'approved', targetFile: 'agents/dev/x.md' };

test('Áp dụng: không xác nhận ⇒ không POST; có xác nhận ⇒ POST /apply, hỏi nêu tên tệp đích', async () => {
  const no = harness(false);
  await no.on('apply', APPROVED);
  assert.equal(no.posts.length, 0);
  assert.ok(no.asked[0].includes('agents/dev/x.md'));
  const yes = harness(true);
  await yes.on('apply', APPROVED);
  assert.equal(yes.posts.length, 1);
  assert.equal(yes.posts[0].url, '/api/selfimprove/proposals/P-1/apply');
  assert.equal(yes.posts[0].opts.method, 'POST');
  assert.equal(yes.rerenders(), 1);
  assert.equal(yes.toasts[0].level, 'info');
});

test('Rollback vẫn cần xác nhận; Duyệt không hỏi', async () => {
  const no = harness(false);
  await no.on('rollback', { ...P, status: 'rollback.proposed' });
  assert.equal(no.posts.length, 0);
  const yes = harness(true);
  await yes.on('rollback', { ...P, status: 'rollback.proposed' });
  assert.equal(yes.posts[0].url, '/api/selfimprove/proposals/P-1/rollback-confirm');
  const ap = harness(false);
  await ap.on('approve', P);
  assert.equal(ap.posts[0].url, '/api/selfimprove/proposals/P-1/approve');
});

test('lỗi 409: hiển thị đúng thông báo server đã che, không làm mới danh sách', async () => {
  const masked = 'Áp dụng P-1 thất bại: git apply --check: error: patch failed: <đường dẫn>';
  const h = harness(true, async () => { throw Object.assign(new Error(masked), { status: 409 }); });
  await h.on('apply', APPROVED);
  assert.equal(h.toasts.length, 1);
  assert.equal(h.toasts[0].level, 'error');
  assert.equal(h.toasts[0].msg, masked);
  assert.equal(h.rerenders(), 0);
  const h2 = harness(true, async () => { throw {}; });
  await h2.on('apply', APPROVED);
  assert.equal(h2.toasts[0].msg, 'Lỗi không xác định');
});

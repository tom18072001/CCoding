import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { gatewayHeaders, resolveSecret } from '../src/runtimes/api.js';
import { RuntimeManager } from '../src/runtimes/index.js';
import { loadConfig } from '../src/config.js';
import { parseAgent } from '../src/registry.js';

const agent = parseAgent('data-engineer.md', '---\nid: data-engineer\nname: Hùng\ndepartment: dev\nrole: member\n---\nbody');
const meta = { taskId: 'T-20261026-210000-abc', department: 'dev', projectId: 'elk-iis', subtaskId: 'S2', callId: 'T-20261026-210000-abc-7' };

test('resolveSecret: env:, tên biến và giá trị trực tiếp', () => {
  process.env.CCODING_TEST_VK = 'sk-bf-123';
  assert.equal(resolveSecret('env:CCODING_TEST_VK'), 'sk-bf-123');
  assert.equal(resolveSecret('CCODING_TEST_VK'), 'sk-bf-123');
  assert.equal(resolveSecret('sk-bf-literal'), 'sk-bf-literal');
  assert.equal(resolveSecret('env:KHONG_CO_BIEN_NAY'), undefined);
});

test('gatewayHeaders: tag Bifrost/LiteLLM + key ảo theo phòng ban', () => {
  process.env.CCODING_TEST_VK_DEV = 'sk-bf-dev';
  const h = gatewayHeaders({ tags: 'both', virtualKeys: { dev: 'env:CCODING_TEST_VK_DEV', research: 'sk-bf-res' } }, { agent, phase: 'execute', meta });
  assert.equal(h['x-bf-dim-agent'], 'data-engineer');
  assert.equal(h['x-bf-dim-department'], 'dev');
  assert.equal(h['x-bf-dim-project'], 'elk-iis');
  assert.equal(h['x-request-id'], meta.callId);
  assert.match(h['x-litellm-tags'], /^ccoding,agent:data-engineer,department:dev,task:T-20261026-210000-abc,phase:execute/);
  assert.equal(h['x-bf-vk'], 'sk-bf-dev');
  const lite = gatewayHeaders({ tags: 'litellm', virtualKeyHeader: 'authorization', virtualKeys: { '*': 'sk-lite' } }, { agent, phase: 'plan', meta: { ...meta, department: 'research' } });
  assert.equal(lite.authorization, 'Bearer sk-lite');
  assert.equal(lite['x-bf-dim-agent'], undefined);
  assert.deepEqual(gatewayHeaders({ tags: 'none' }, { agent, phase: 'plan', meta }), {});
});

test('runtime tùy biến "bifrost" gọi API tương thích OpenAI, gửi header và đọc usage', async () => {
  let seen: http.IncomingHttpHeaders = {};
  let body: any;
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'ollama/qwen3:8b' }] }));
    }
    seen = req.headers;
    let raw = '';
    for await (const c of req) raw += c;
    body = JSON.parse(raw);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ model: body.model, choices: [{ delta: { content: '## Tóm tắt\n' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ model: body.model, choices: [{ delta: { content: 'Xong.' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 9, prompt_tokens_details: { cached_tokens: 20 } } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const base = loadConfig();
    const port = (srv.address() as AddressInfo).port;
    const rm = new RuntimeManager({
      ...base,
      runtimes: { ...base.runtimes, bifrost: { ...base.runtimes.bifrost, baseUrl: `http://127.0.0.1:${port}/v1`, virtualKeys: { dev: 'sk-bf-dev-key' } } },
    });
    const rt = rm.get('bifrost')!;
    assert.ok(rt, 'runtime bifrost được đăng ký từ cấu hình');
    assert.equal(rt.local, false);
    assert.equal(rm.get('ollama')?.local, true);
    assert.equal((await rm.availability('bifrost', true)).ok, true);
    const r = await rt.run({ agent, phase: 'execute', system: 'sys', prompt: 'p', model: 'sonnet', cwd: '.', tools: [], allowTools: false, timeoutMs: 5000, meta }, {});
    assert.equal(r.text, '## Tóm tắt\nXong.');
    assert.equal(body.model, 'ollama/qwen3:8b');
    assert.deepEqual([r.usage.input, r.usage.output, r.usage.cacheRead, r.estimated], [100, 9, 20, false]);
    assert.equal(seen['x-bf-vk'], 'sk-bf-dev-key');
    assert.equal(seen['x-bf-dim-agent'], 'data-engineer');
    assert.equal(seen['x-bf-dim-task'], meta.taskId);
    // nhãn "Bảo mật" chỉ cho runtime cục bộ
    assert.equal(rm.allowed('bifrost', 'confidential'), false);
    assert.equal(rm.allowed('ollama', 'confidential'), true);
  } finally {
    srv.close();
  }
});

test('requireEnv: runtime chưa sẵn sàng khi thiếu biến môi trường', async () => {
  const base = loadConfig();
  delete process.env.CCODING_TEST_MISSING;
  const rm = new RuntimeManager({ ...base, runtimes: { ...base.runtimes, bifrost: { ...base.runtimes.bifrost, requireEnv: ['CCODING_TEST_MISSING'] } } });
  const a = await rm.availability('bifrost', true);
  assert.equal(a.ok, false);
  assert.match(a.detail, /CCODING_TEST_MISSING/);
});

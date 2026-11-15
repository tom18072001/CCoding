// 13/11/2026: máy chạy có ANTHROPIC_API_KEY cấp người dùng; `claude -p` của harness phải dùng phiên đăng nhập claude.ai như runtime claude-cli của CCoding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SECRET_VAR, claudeEnv, runClaude } from '../lib/claude.mjs';
import { provenance } from '../lib/queue.mjs';

test('claudeEnv: bỏ khóa/token, giữ biến thường, tắt lưu lượng phụ', () => {
  const env = claudeEnv({ PATH: '/bin', ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'u', ANTHROPIC_AUTH_TOKEN: 't', CLAUDE_CODE_OAUTH_TOKEN: 'o', NINEROUTER_API_KEY: 'n', GROQ_API_KEY: 'g', NVDIA_API_KEY: 'v', OPENAI_BASE_URL: 'b', GH_TOKEN: 'h', HOME: '/h', DISABLE_AUTOUPDATER: '1' });
  assert.deepEqual(env, { PATH: '/bin', HOME: '/h', DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
  // cùng mẫu với scrubEnv của CCoding
  const src = fs.readFileSync(new URL('../../../src/tools/workspace.ts', import.meta.url), 'utf8');
  assert.ok(src.includes(SECRET_VAR.source), 'SECRET_VAR phải trùng mẫu trong src/tools/workspace.ts scrubEnv');
});

test('runClaude: tiến trình con không thấy khóa; ghi authSource; lỗi của Claude Code nằm ở finalText khi is_error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-'));
  const bin = path.join(dir, 'claude.cjs');
  fs.writeFileSync(bin, `const keys = Object.keys(process.env).filter((k) => /API_?KEY|TOKEN|^ANTHROPIC_/i.test(k));
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-5-5', apiKeySource: keys.length ? 'ANTHROPIC_API_KEY' : 'none' }));
console.log(JSON.stringify({ type: 'result', is_error: true, result: 'Credit balance is too low', num_turns: 1, usage: {} }));
process.exit(1);
`);
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-thu';
  try {
    const r = await runClaude({ cwd: dir, prompt: 'p', model: 'sonnet', bin: process.execPath, binArgs: [bin], timeoutMin: 1 });
    assert.equal(r.authSource, 'none');
    assert.equal(r.status, 'failed');
    assert.equal(r.isError, true);
    assert.equal(r.finalText, 'Credit balance is too low');
    assert.equal(provenance({}, { kind: 'claude', model: 'sonnet' }, r).authSource, 'none');
    assert.equal('authSource' in provenance({}, { kind: 'ccoding' }, { status: 'done' }), false, 'arm CCoding không thêm trường');
  } finally { if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved; }
});

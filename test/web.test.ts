import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { executeTool, toolsFor } from '../src/tools/workspace.js';
import type { ToolPolicy } from '../src/types.js';

test('công cụ tra cứu: search_papers (OpenAlex), web_search, fetch_url; chặn địa chỉ nội bộ', async () => {
  const srv = http.createServer((req, res) => {
    if (req.url?.startsWith('/works')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          meta: { count: 2 },
          results: [
            { display_name: 'Permission-Aware Retrieval for RAG', publication_year: 2024, doi: 'https://doi.org/10.1/xyz', cited_by_count: 12, type: 'article', primary_location: { source: { display_name: 'Findings of ACL' } }, authorships: [{ author: { display_name: 'A. Nguyen' } }], abstract_inverted_index: { Access: [0], control: [1], matters: [2] } },
            { display_name: 'Other paper', publication_year: 2021, cited_by_count: 1, primary_location: { source: { display_name: 'arXiv' } }, authorships: [] },
          ],
        }),
      );
    }
    if (req.url?.startsWith('/search')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<div><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fluat&amp;rut=x">Luật Bảo vệ dữ liệu cá nhân</a><a class="result__snippet">Văn bản hợp nhất</a></div>');
    }
    if (req.url?.startsWith('/sx/search')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ results: [{ title: 'NIST AI RMF', url: 'https://www.nist.gov/itl/ai-risk-management-framework', content: 'Framework' }] }));
    }
    if (req.url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<html><body><h1>Tiêu đề</h1><p>Nội dung trang về kiểm soát truy cập.</p><script>evil()</script></body></html>');
    }
    if (req.url === '/redir') {
      res.writeHead(302, { location: '/page' });
      return res.end();
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  process.env.CCODING_OPENALEX_URL = base;
  process.env.CCODING_WEBSEARCH_URL = `${base}/search`;
  const policy: ToolPolicy = { root: os.tmpdir(), allow: ['search_papers', 'web_search', 'fetch_url'], maxTurns: 5, commandTimeoutSec: 10, maxOutputChars: 4000, denyCommands: [], allowGitCommit: false };
  try {
    const p = await executeTool('search_papers', { query: 'permission aware rag', venue: 'acl' }, policy);
    assert.ok(p.ok, p.output);
    assert.match(p.output, /Permission-Aware Retrieval for RAG \(2024\) — Findings of ACL/);
    assert.match(p.output, /doi:10\.1\/xyz/);
    assert.match(p.output, /Tóm tắt: Access control matters/);
    assert.ok(!p.output.includes('Other paper'), 'lọc theo venue');
    const w = await executeTool('web_search', { query: 'luật bảo vệ dữ liệu cá nhân' }, policy);
    assert.match(w.output, /Luật Bảo vệ dữ liệu cá nhân\n\s+https:\/\/example\.org\/luat/);
    process.env.CCODING_SEARXNG_URL = `${base}/sx`;
    const sx = await executeTool('web_search', { query: 'nist ai rmf' }, policy);
    assert.match(sx.output, /\(SearXNG\)[\s\S]*NIST AI RMF\n\s+https:\/\/www\.nist\.gov\/itl\/ai-risk-management-framework/);
    delete process.env.CCODING_SEARXNG_URL;
    // mặc định chặn localhost/LAN
    delete process.env.CCODING_WEB_ALLOW_PRIVATE;
    const blocked = await executeTool('fetch_url', { url: `${base}/page` }, policy);
    assert.equal(blocked.ok, false);
    assert.match(blocked.output, /nội bộ/);
    assert.equal((await executeTool('fetch_url', { url: 'file:///etc/passwd' }, policy)).ok, false);
    process.env.CCODING_WEB_ALLOW_PRIVATE = '1';
    const f = await executeTool('fetch_url', { url: `${base}/redir` }, policy);
    assert.ok(f.ok, f.output);
    assert.match(f.output, /Nội dung trang về kiểm soát truy cập/);
    assert.ok(!f.output.includes('evil()'));
  } finally {
    delete process.env.CCODING_WEB_ALLOW_PRIVATE;
    delete process.env.CCODING_OPENALEX_URL;
    delete process.env.CCODING_WEBSEARCH_URL;
    srv.close();
  }
});

test('quyền tra cứu web theo hồ sơ agent và pha', () => {
  const lit = ['Read', 'Glob', 'Grep', 'Write', 'WebSearch', 'WebFetch'];
  assert.deepEqual(toolsFor(lit, 'none', 'execute', true).sort(), ['fetch_url', 'search_papers', 'web_search']);
  assert.deepEqual(toolsFor(lit, 'none', 'execute', false), []);
  assert.deepEqual(toolsFor(lit, 'none', 'discuss', true), []);
  assert.deepEqual(toolsFor(lit, 'none', 'synthesize', true), []);
  assert.deepEqual(toolsFor(['Read', 'Write', 'Bash'], 'none', 'execute', true), []);
});

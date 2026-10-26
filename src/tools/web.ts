import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { extractText } from '../util/extract.js';

/**
 * Công cụ tra cứu nguồn cho agent (chủ yếu Phòng Nghiên cứu):
 *   search_papers — OpenAlex (chỉ mục học thuật mở, không cần khóa): tiêu đề, venue, năm, DOI, số trích dẫn, tóm tắt
 *   web_search    — tìm kiếm web chung (DuckDuckGo HTML)
 *   fetch_url     — đọc một trang web/PDF thành chữ
 * Chặn địa chỉ nội bộ (localhost, LAN, link-local) để agent không gọi được dịch vụ trên máy/mạng nội bộ.
 */

const UA = 'Mozilla/5.0 (compatible; CCodingOffice/0.2; research assistant)';
const openalexBase = () => (process.env.CCODING_OPENALEX_URL ?? 'https://api.openalex.org').replace(/\/$/, '');
const searchBase = () => process.env.CCODING_WEBSEARCH_URL ?? 'https://html.duckduckgo.com/html/';

export class WebError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

/** Chỉ http(s), không trỏ vào mạng nội bộ (trừ khi CCODING_WEB_ALLOW_PRIVATE=1 — dùng cho kiểm thử). */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new WebError(`URL không hợp lệ: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new WebError('Chỉ hỗ trợ http/https');
  if (process.env.CCODING_WEB_ALLOW_PRIVATE === '1') return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.lan)$/i.test(host)) throw new WebError('Không truy cập địa chỉ nội bộ');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new WebError(`Không phân giải được tên miền ${host}`);
  if (addrs.some((a) => isPrivateIp(a.address))) throw new WebError('Không truy cập địa chỉ nội bộ (localhost/LAN)');
  return u;
}

async function getBody(url: string, signal?: AbortSignal, maxBytes = 6 * 1024 * 1024): Promise<{ buf: Buffer; type: string; finalUrl: string }> {
  let cur = url;
  for (let hop = 0; hop < 5; hop++) {
    const u = await assertPublicUrl(cur);
    const t = AbortSignal.timeout(25_000);
    const res = await fetch(u, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/pdf,application/json,text/plain;q=0.9,*/*;q=0.5' }, signal: signal ? AbortSignal.any([signal, t]) : t });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      cur = new URL(res.headers.get('location')!, u).toString();
      continue;
    }
    if (!res.ok) throw new WebError(`HTTP ${res.status} khi tải ${u.toString().slice(0, 120)}`);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += c.length;
      if (size > maxBytes) break;
      chunks.push(Buffer.from(c));
    }
    return { buf: Buffer.concat(chunks), type: res.headers.get('content-type') ?? '', finalUrl: u.toString() };
  }
  throw new WebError('Quá nhiều lần chuyển hướng');
}

/** Dựng lại tóm tắt từ abstract_inverted_index của OpenAlex. */
function abstractOf(inv: Record<string, number[]> | null | undefined, max = 420): string {
  if (!inv) return '';
  const words: string[] = [];
  for (const [w, pos] of Object.entries(inv)) for (const p of pos) words[p] = w;
  const s = words.filter(Boolean).join(' ');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export async function searchPapers(args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const query = String(args.query ?? '').trim();
  if (!query) throw new WebError('Thiếu query');
  const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
  const filters: string[] = [];
  if (args.year_from) filters.push(`from_publication_date:${Number(args.year_from)}-01-01`);
  if (args.year_to) filters.push(`to_publication_date:${Number(args.year_to)}-12-31`);
  const venue = String(args.venue ?? '').trim().toLowerCase();
  const sort = args.sort === 'cited' ? '&sort=cited_by_count:desc' : '';
  const url = `${openalexBase()}/works?search=${encodeURIComponent(query)}&per-page=${venue ? 50 : limit}${filters.length ? `&filter=${filters.join(',')}` : ''}${sort}`;
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000) });
  if (!res.ok) throw new WebError(`OpenAlex trả ${res.status}`);
  const body = (await res.json()) as { meta?: { count?: number }; results?: Array<Record<string, any>> };
  let rows = body.results ?? [];
  if (venue) rows = rows.filter((r) => String(r.primary_location?.source?.display_name ?? '').toLowerCase().includes(venue));
  rows = rows.slice(0, limit);
  if (!rows.length) return `Không có kết quả cho "${query}"${venue ? ` tại venue chứa "${venue}"` : ''} (tổng khớp: ${body.meta?.count ?? 0}).`;
  const lines = rows.map((r, i) => {
    const authors = (r.authorships ?? []).slice(0, 3).map((a: any) => a.author?.display_name).filter(Boolean).join(', ') + ((r.authorships ?? []).length > 3 ? ' et al.' : '');
    const src = r.primary_location?.source?.display_name ?? r.host_venue?.display_name ?? '(không rõ venue)';
    const doi = r.doi ? String(r.doi).replace('https://doi.org/', 'doi:') : (r.primary_location?.landing_page_url ?? r.id);
    const abs = abstractOf(r.abstract_inverted_index);
    return `[${i + 1}] ${r.display_name ?? r.title} (${r.publication_year ?? '?'}) — ${src} · ${r.type ?? ''} · trích dẫn: ${r.cited_by_count ?? 0}\n    ${authors}\n    ${doi}${abs ? `\n    Tóm tắt: ${abs}` : ''}`;
  });
  return `OpenAlex: ${body.meta?.count ?? rows.length} kết quả khớp "${query}" (hiện ${rows.length}).\n\n${lines.join('\n')}`;
}

function decodeHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function webSearch(args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const query = String(args.query ?? '').trim();
  if (!query) throw new WebError('Thiếu query');
  const limit = Math.min(15, Math.max(1, Number(args.limit) || 8));
  const res = await fetch(searchBase(), {
    method: 'POST',
    headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
    body: `q=${encodeURIComponent(query)}`,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new WebError(`Máy tìm kiếm trả ${res.status}`);
  const html = await res.text();
  const out: string[] = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="[^"]*result__a|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    let href = m[1].replace(/&amp;/g, '&');
    const ud = /[?&]uddg=([^&]+)/.exec(href);
    if (ud) href = decodeURIComponent(ud[1]);
    if (href.startsWith('//')) href = `https:${href}`;
    if (/duckduckgo\.com\/y\.js|\/\/duckduckgo\.com\/l\/\?.*ad_/.test(href)) continue; // quảng cáo
    const snip = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(a|div|td)>/.exec(m[3]);
    out.push(`[${out.length + 1}] ${decodeHtml(m[2])}\n    ${href}${snip ? `\n    ${decodeHtml(snip[1]).slice(0, 300)}` : ''}`);
  }
  return out.length ? `Kết quả tìm kiếm "${query}":\n\n${out.join('\n')}` : `Không có kết quả (hoặc máy tìm kiếm chặn truy vấn tự động) cho "${query}". Thử search_papers hoặc fetch_url trực tiếp.`;
}

export async function fetchUrl(args: Record<string, unknown>, maxChars: number, signal?: AbortSignal): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!url) throw new WebError('Thiếu url');
  const offset = Math.max(0, Number(args.offset) || 0);
  const { buf, type, finalUrl } = await getBody(url, signal);
  const ext = /pdf/i.test(type) || /\.pdf($|\?)/i.test(finalUrl) ? '.pdf' : /json/i.test(type) ? '.json' : /html|xml/i.test(type) ? '.html' : '.txt';
  const tmp = path.join(os.tmpdir(), `ccoding-web-${crypto.randomBytes(5).toString('hex')}${ext}`);
  fs.writeFileSync(tmp, buf);
  try {
    const ex = await extractText(tmp, { maxChars: 400_000 });
    if (!ex.text) return `Không lấy được chữ từ ${finalUrl} (${ex.kind}${ex.note ? ` — ${ex.note}` : ''}).`;
    const part = ex.text.slice(offset, offset + maxChars);
    const rest = ex.text.length - offset - part.length;
    return `Nguồn: ${finalUrl} (${ex.kind}${ex.pages ? `, ${ex.pages} trang` : ''}, ${ex.text.length.toLocaleString('vi-VN')} ký tự)\n\n${part}${rest > 0 ? `\n\n… còn ${rest.toLocaleString('vi-VN')} ký tự — gọi lại với offset=${offset + part.length}` : ''}`;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

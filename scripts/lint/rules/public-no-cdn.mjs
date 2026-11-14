// AGENTS.md: "Giao diện public/ là JS thuần, không build, không CDN bắt buộc".
const REMOTE = /^\s*(?:https?:)?\/\//i;

export default {
  id: 'public-no-cdn',
  source: 'AGENTS.md — Quy ước (public/ không CDN)',
  needsBase: false,
  async run(ctx) {
    const out = [];
    const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;
    for (const file of ctx.files.filter((f) => f.startsWith('public/'))) {
      const text = ctx.read(file);
      if (/\.html?$/i.test(file)) {
        for (const m of text.matchAll(/<script\b[^>]*>/gis)) {
          const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(m[0]);
          if (src && REMOTE.test(src[1])) out.push({ file, line: lineAt(text, m.index), msg: `<script src="${src[1].slice(0, 80)}"> nạp từ mạng ngoài` });
        }
        for (const m of text.matchAll(/<link\b[^>]*>/gis)) {
          const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(m[0])?.[1] ?? '';
          const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(m[0])?.[1] ?? '';
          if (/\b(stylesheet|preload|modulepreload)\b/i.test(rel) && REMOTE.test(href)) out.push({ file, line: lineAt(text, m.index), msg: `<link rel="${rel.trim()}" href="${href.slice(0, 80)}"> nạp từ mạng ngoài` });
        }
      }
      if (/\.(css|html?)$/i.test(file)) {
        for (const m of text.matchAll(/@import\s+(?:url\(\s*)?["']?\s*((?:https?:)?\/\/[^"')\s]+)/gi)) out.push({ file, line: lineAt(text, m.index), msg: `@import "${m[1].slice(0, 80)}" nạp từ mạng ngoài` });
      }
      if (/\.[cm]?js$/i.test(file)) {
        for (const m of text.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimportScripts\s*\(\s*)["'](https?:\/\/[^"']+)["']/g)) out.push({ file, line: lineAt(text, m.index), msg: `nạp mã từ "${m[1].slice(0, 80)}"` });
      }
    }
    return out;
  },
};

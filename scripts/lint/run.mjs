#!/usr/bin/env node
// Bộ chạy lint của CCoding (D20). Không có mức cảnh báo, không có cờ/biến môi trường bỏ qua:
// có lỗi thì exit 1. Ngoại lệ chỉ qua scripts/lint/allow.json và scripts/lint/baseline.json.
// Chi tiết luật: docs/LINT.md.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256Norm } from './lib/hash.mjs';
import { addedBaselineEntries } from './lib/baseline-shrink.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = 'lint-runner';

function parseArgs(argv) {
  const o = { rules: [], json: false, base: null, bad: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--rule' || a === '--base') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) o.bad.push(`${a} thiếu giá trị`);
      else if (a === '--rule') o.rules.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
      else o.base = v;
    } else if (a.startsWith('--rule=')) o.rules.push(...a.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    else if (a.startsWith('--base=')) o.base = a.slice(7);
    else o.bad.push(`tùy chọn không hợp lệ: ${a}`);
  }
  return o;
}

function gitIn(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

const sha256 = sha256Norm;

function readEntries(file, kind, errors) {
  const where = `scripts/lint/${kind}.json`;
  if (!fs.existsSync(file)) {
    errors.push({ rule: RUNNER, file: where, line: 0, msg: `thiếu ${kind}.json (khung { "entries": [] })` });
    return [];
  }
  let j;
  try {
    j = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push({ rule: RUNNER, file: where, line: 0, msg: `${kind}.json không phải JSON hợp lệ: ${e.message}` });
    return [];
  }
  if (!j || !Array.isArray(j.entries)) {
    errors.push({ rule: RUNNER, file: where, line: 0, msg: `${kind}.json phải có dạng { "entries": [...] }` });
    return [];
  }
  const need = kind === 'allow' ? ['rule', 'file', 'anchor', 'reason', 'by'] : ['rule', 'file', 'owner', 'fixIn', 'by'];
  const out = [];
  j.entries.forEach((e, i) => {
    const miss = need.filter((k) => typeof e?.[k] !== 'string' || !e[k].trim());
    const hasAnchor = typeof e?.anchor === 'string' && e.anchor.trim();
    const hasSha = typeof e?.sha256 === 'string' && /^[0-9a-f]{64}$/.test(e.sha256);
    if (kind === 'baseline' && !hasAnchor && !hasSha) miss.push('anchor|sha256');
    if (kind === 'allow' && e?.sha256 !== undefined) miss.push('sha256 (allow chỉ dùng anchor)');
    if (miss.length) errors.push({ rule: RUNNER, file: where, line: 0, msg: `mục #${i + 1} thiếu/sai trường: ${miss.join(', ')}` });
    else out.push({ ...e, _used: false });
  });
  return out;
}

function entryDesc(e) {
  return `${e.rule} @ ${e.file} ${e.sha256 ? `sha256=${e.sha256.slice(0, 12)}…` : `neo "${e.anchor}"`}`;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.bad.length) {
    console.error(`Lint: ${opt.bad.join('; ')}\nDùng: node scripts/lint/run.mjs [--rule <id>[,<id>]] [--json] [--base <ref>]`);
    return 2;
  }
  let root;
  try {
    root = gitIn(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  } catch {
    console.error('Lint: phải chạy trong một kho git.');
    return 2;
  }
  const errors = [];

  // mốc: --base → LINT_BASE → CCODING_BASE_REF (tường minh; không phân giải được thì lỗi, không chuyển nguồn)
  // → merge-base HEAD @{upstream} → merge-base HEAD origin/main. Không có mốc thì rule needsBase báo lỗi.
  const explicit = [
    ['--base', opt.base],
    ['LINT_BASE', process.env.LINT_BASE],
    ['CCODING_BASE_REF', process.env.CCODING_BASE_REF],
  ].find(([, v]) => typeof v === 'string' && v.trim());
  let baseRef = null;
  let baseSource = null;
  let base = null;
  let baseRev = null;
  const tried = ['--base', 'LINT_BASE', 'CCODING_BASE_REF'];
  if (explicit) {
    baseRef = explicit[1].trim();
    baseSource = explicit[0];
    try {
      base = gitIn(root, ['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`]).trim();
      try {
        baseRev = gitIn(root, ['merge-base', base, 'HEAD']).trim() || base;
      } catch {
        baseRev = base;
      }
    } catch {
      errors.push({ rule: RUNNER, file: '(mốc)', line: 0, msg: `mốc "${baseRef}" (nguồn: ${baseSource}) không phân giải được thành commit (clone nông? thiếu fetch-depth: 0?)` });
      baseRef = null;
      baseSource = null;
    }
  } else {
    let upstream = null;
    try {
      upstream = gitIn(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).trim() || null;
    } catch {
      upstream = null;
    }
    const auto = [];
    if (upstream) auto.push([upstream, `merge-base HEAD với @{upstream} (${upstream})`]);
    auto.push(['origin/main', 'merge-base HEAD với origin/main (mặc định)']);
    tried.push(upstream ? `@{upstream} (${upstream})` : '@{upstream} (nhánh chưa có upstream)', 'origin/main');
    for (const [ref, source] of auto) {
      try {
        const mb = gitIn(root, ['merge-base', 'HEAD', ref]).trim();
        if (!mb) continue;
        base = mb;
        baseRev = mb;
        baseRef = ref;
        baseSource = source;
        break;
      } catch {
        // thử nguồn kế tiếp
      }
    }
  }
  const baseLine = base ? `Lint: mốc ${baseRef} (nguồn: ${baseSource}) → ${baseRev.slice(0, 7)}` : null;

  // nạp rule
  const rulesDir = path.join(HERE, 'rules');
  const rules = [];
  for (const f of fs.readdirSync(rulesDir).filter((n) => n.endsWith('.mjs')).sort()) {
    try {
      const mod = await import(pathToFileURL(path.join(rulesDir, f)).href);
      const r = mod.default;
      if (!r || typeof r.id !== 'string' || typeof r.run !== 'function' || !/^[a-z][a-z0-9-]*$/.test(r.id) || r.id !== f.slice(0, -4)) {
        errors.push({ rule: RUNNER, file: `scripts/lint/rules/${f}`, line: 0, msg: 'rule sai giao kèo (cần export default { id (= tên tệp), source, needsBase, run })' });
        continue;
      }
      if (rules.some((x) => x.id === r.id)) {
        errors.push({ rule: RUNNER, file: `scripts/lint/rules/${f}`, line: 0, msg: `trùng id rule "${r.id}"` });
        continue;
      }
      rules.push(r);
    } catch (e) {
      errors.push({ rule: RUNNER, file: `scripts/lint/rules/${f}`, line: 0, msg: `không nạp được rule: ${e.message}` });
    }
  }
  for (const id of opt.rules.filter((x) => !rules.some((r) => r.id === x))) {
    errors.push({ rule: RUNNER, file: '(--rule)', line: 0, msg: `không có rule "${id}"` });
  }
  const selected = opt.rules.length ? rules.filter((r) => opt.rules.includes(r.id)) : rules;
  const selectedIds = new Set(selected.map((r) => r.id));

  // ngữ cảnh
  const cache = new Map();
  // tệp đã track + tệp chưa track nhưng không bị ignore (--exclude-standard)
  const untracked = gitIn(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const files = [...new Set([...gitIn(root, ['ls-files', '-z']).split('\0').filter(Boolean), ...untracked])].filter((f) => fs.existsSync(path.join(root, f)));
  const ctx = {
    root,
    files,
    base: base ? baseRef : null,
    baseRev,
    read(file) {
      if (!cache.has(file)) cache.set(file, fs.readFileSync(path.join(root, file), 'utf8'));
      return cache.get(file);
    },
    git(args) {
      return gitIn(root, Array.isArray(args) ? args : String(args).split(/\s+/).filter(Boolean));
    },
    /** Tệp đổi so với mốc (cây làm việc so với merge-base); null nếu không có mốc. */
    changed() {
      if (!baseRev) return null;
      const tracked = gitIn(root, ['diff', '--name-only', '-z', baseRev]).split('\0').filter(Boolean);
      return [...new Set([...tracked, ...untracked])];
    },
  };

  // chạy rule
  const raw = [];
  for (const r of selected) {
    if (r.needsBase && !base) {
      raw.push({ rule: r.id, file: '(mốc)', line: 0, msg: `rule cần mốc git nhưng không có. Đã thử: ${tried.join(', ')}. Truyền --base <ref> hoặc đặt LINT_BASE / CCODING_BASE_REF` });
      continue;
    }
    try {
      const res = await r.run(ctx);
      for (const v of res ?? []) raw.push({ rule: r.id, file: v.file ?? '(?)', line: v.line ?? 0, msg: String(v.msg ?? '') });
    } catch (e) {
      raw.push({ rule: r.id, file: `scripts/lint/rules/${r.id}.mjs`, line: 0, msg: `rule gặp lỗi khi chạy: ${e.message}` });
    }
  }

  // allow + baseline
  const allow = readEntries(path.join(root, 'scripts/lint/allow.json'), 'allow', errors);
  const baseline = readEntries(path.join(root, 'scripts/lint/baseline.json'), 'baseline', errors);
  const knownIds = new Set(rules.map((r) => r.id));
  const matches = (e, v) => {
    if (e.rule !== v.rule || e.file !== v.file) return false;
    if (e.sha256) {
      try {
        return sha256(fs.readFileSync(path.join(root, v.file))) === e.sha256;
      } catch {
        return false;
      }
    }
    let line = '';
    if (v.line > 0) {
      try {
        line = ctx.read(v.file).split(/\r?\n/)[v.line - 1] ?? '';
      } catch {
        line = '';
      }
    }
    return `${line}\n${v.msg}`.includes(e.anchor);
  };
  for (const v of raw) {
    const hit = allow.find((e) => matches(e, v)) ?? baseline.find((e) => matches(e, v));
    if (hit) hit._used = true;
    else errors.push(v);
  }
  for (const [list, kind] of [[allow, 'allow'], [baseline, 'baseline']]) {
    for (const e of list) {
      const inScope = selectedIds.has(e.rule) || !knownIds.has(e.rule);
      if (!e._used && inScope) {
        const why = knownIds.has(e.rule) ? 'không còn khớp lỗi nào — xóa mục này' : `rule "${e.rule}" không tồn tại — xóa mục này`;
        errors.push({ rule: RUNNER, file: `scripts/lint/${kind}.json`, line: 0, msg: `mục ${entryDesc(e)} ${why}` });
      }
    }
  }
  // baseline chỉ được giảm
  if (baseRev) {
    let before = null;
    try {
      before = JSON.parse(gitIn(root, ['show', `${baseRev}:scripts/lint/baseline.json`]));
    } catch {
      before = null; // mốc chưa có baseline.json: tệp đang được lập lần đầu
    }
    if (before && Array.isArray(before.entries)) {
      const showAtBase = (file) => {
        try {
          return execFileSync('git', ['show', `${baseRev}:${file}`], { cwd: root, maxBuffer: 256 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch {
          return null;
        }
      };
      const added = addedBaselineEntries(baseline, before.entries, showAtBase);
      for (const e of added) {
        errors.push({ rule: RUNNER, file: 'scripts/lint/baseline.json', line: 0, msg: `baseline tăng: mục ${entryDesc(e)} không có ở mốc ${baseRef} (chỉ được giảm; lỗi mới phải sửa tận gốc)` });
      }
    }
  }

  // in kết quả
  const byRule = new Map();
  for (const e of errors) {
    if (!byRule.has(e.rule)) byRule.set(e.rule, []);
    byRule.get(e.rule).push(e);
  }
  if (opt.json) {
    console.log(JSON.stringify({ ok: errors.length === 0, total: errors.length, base: base ? baseRef : null, baseSource, rules: selected.map((r) => r.id), errors }, null, 2));
  } else {
    if (baseLine) console.log(baseLine);
    for (const [id, list] of byRule) {
      const src = rules.find((r) => r.id === id)?.source;
      console.log(`\n[${id}] ${list.length} lỗi${src ? ` (nguồn: ${src})` : ''}`);
      for (const e of list) console.log(`  ${e.file}${e.line ? `:${e.line}` : ''} — ${e.msg}`);
    }
    console.log(errors.length ? `\nLint: ${errors.length} lỗi ở ${byRule.size} rule — HỎNG.` : `Lint: ${selected.length} rule, 0 lỗi.`);
  }
  return errors.length ? 1 : 0;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(`Lint: lỗi nội bộ: ${e?.stack ?? e}`);
    process.exit(2);
  },
);

// Tách preregistration.md thành khối theo tiêu đề và so với preregistration.lock.json.
import { sha256Norm } from './hash.mjs';

export const PREREG = 'docs/research/preregistration.md';
export const LOCK = 'docs/research/preregistration.lock.json';
export const HISTORY_KEY = 'Lịch sử bản';

const sha = sha256Norm;
const HEAD_RE = /^(#{1,6})\s+(.*?)\s*$/;

/** Khối = dòng tiêu đề (mọi cấp) + thân tới tiêu đề kế. Bỏ qua "#" trong khối mã rào. Khối mở đầu không có tiêu đề có khóa "(đầu tệp)". */
export function splitBlocks(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let cur = { key: '(đầu tệp)', level: 0, start: 1, lines: [], section9: false };
  let fence = false;
  let inS9 = false;
  const seen = new Map();
  const push = () => {
    if (cur.lines.some((l) => l.trim()) || cur.level) blocks.push(cur);
  };
  lines.forEach((ln, i) => {
    if (/^\s*(```|~~~)/.test(ln)) fence = !fence;
    const m = !fence && HEAD_RE.exec(ln);
    if (m) {
      push();
      const level = m[1].length;
      if (level <= 2) inS9 = level === 2 && /^9(?:\.|\s|$)/.test(m[2]);
      const n = (seen.get(m[2]) ?? 0) + 1;
      seen.set(m[2], n);
      cur = { key: n > 1 ? `${m[2]} #${n}` : m[2], level, start: i + 1, lines: [ln], section9: inS9 };
    } else cur.lines.push(ln);
  });
  push();
  for (const b of blocks) {
    while (b.lines.length && !b.lines[b.lines.length - 1].trim()) b.lines.pop();
    b.text = b.lines.map((l) => l.replace(/\s+$/, '')).join('\n');
    b.sha256 = sha(b.text);
  }
  return blocks;
}

/** Dòng không rỗng của khối "Lịch sử bản" (không tính tiêu đề), đã băm. */
export function historyLines(block) {
  return block.lines.slice(1).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).map(sha);
}

export function buildLock(blocks) {
  const hist = blocks.find((b) => b.key === HISTORY_KEY);
  return {
    version: 1,
    source: PREREG,
    note: 'Chỉ thêm, không sửa. Khối mới ở §9: node scripts/lint/prereg-lock.mjs --add-new. Xem docs/LINT.md.',
    blocks: blocks.filter((b) => b.key !== HISTORY_KEY).map((b) => ({ key: b.key, sha256: b.sha256 })),
    history: hist ? historyLines(hist) : [],
  };
}

/** So khối hiện tại với khóa. Trả { errors: [{line,msg}], fresh: [block] } (fresh = khối mới ở §9 chưa vào khóa). */
export function compare(blocks, lock) {
  const errors = [];
  const fresh = [];
  const byKey = new Map(blocks.map((b) => [b.key, b]));
  const locked = new Set();
  for (const e of lock.blocks) {
    locked.add(e.key);
    const b = byKey.get(e.key);
    if (!b) errors.push({ line: 0, msg: `khối đã khóa bị mất hoặc đổi tiêu đề: "${e.key}"` });
    else if (b.sha256 !== e.sha256) errors.push({ line: b.start, msg: `khối đã khóa bị sửa: "${e.key}" (sha256 ${b.sha256.slice(0, 12)}… ≠ ${e.sha256.slice(0, 12)}…)` });
  }
  for (const b of blocks) {
    if (b.key === HISTORY_KEY || locked.has(b.key)) continue;
    if (b.section9) fresh.push(b);
    else errors.push({ line: b.start, msg: `khối mới "${b.key}" nằm ngoài §9 — đăng ký trước chỉ được thêm ở §9` });
  }
  const hist = blocks.find((b) => b.key === HISTORY_KEY);
  if (!hist) {
    if (lock.history.length) errors.push({ line: 0, msg: `mất mục "${HISTORY_KEY}"` });
  } else {
    const cur = historyLines(hist);
    let i = 0;
    for (const h of cur) if (i < lock.history.length && h === lock.history[i]) i++;
    if (i < lock.history.length) errors.push({ line: hist.start, msg: `"${HISTORY_KEY}" chỉ được thêm dòng: ${lock.history.length - i}/${lock.history.length} dòng cũ đã bị sửa hoặc xóa` });
  }
  return { errors, fresh };
}

// Tầng 4 — so sánh hai cấu hình đã đánh giá. Xem SPEC.md mục 7.

const chuaLam = (ten) => { throw new Error(`chưa làm: ${ten}`); };

export function escapePointer(seg) { return chuaLam('escapePointer'); }
export function unescapePointer(seg) { return chuaLam('unescapePointer'); }
export function parsePointer(pointer) { return chuaLam('parsePointer'); }
export function formatPointer(segments) { return chuaLam('formatPointer'); }
export function diff(a, b) { return chuaLam('diff'); }
export function applyDiff(doc, ops) { return chuaLam('applyDiff'); }
export function formatText(ops) { return chuaLam('formatText'); }
export function formatJson(ops) { return chuaLam('formatJson'); }
export function summarize(ops) { return chuaLam('summarize'); }

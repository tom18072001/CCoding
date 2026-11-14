/** B-03 (P4): trích mục "## Nhật ký sự cố" của báo cáo revise thành bản ghi có cấu trúc. Hàm thuần; việc che PII/bí mật do LogStore làm. */
export interface IncidentItem {
  error: string;
  cause: string;
  fix: string;
  verifyCmd: string;
}

const MAX_ITEMS = 3;
const MAX_FIELD = 400;

const clip = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD);

/**
 * Dạng chuẩn của dòng: `- [mã] lỗi — nguyên nhân: … → sửa: … → kiểm: \`lệnh\``. Dạng cũ P4 `- [mã] nguyên nhân → đề xuất` vẫn đọc được
 * (cause = vế trước mũi tên, fix = vế sau). parsed=false khi không có mục hoặc không có dòng gạch đầu dòng nào.
 */
export function parseIncidentLog(text: string): { items: IncidentItem[]; parsed: boolean } {
  const m = /^#{1,6}\s*Nhật ký sự cố[^\n]*\n([\s\S]*?)(?=^#{1,6}\s|(?![\s\S]))/im.exec(text ?? '');
  if (!m) return { items: [], parsed: false };
  const items: IncidentItem[] = [];
  for (const raw of m[1].split(/\r?\n/)) {
    const line = /^\s*[-*]\s+(.*\S)\s*$/.exec(raw)?.[1];
    if (!line) continue;
    const body = line.replace(/^\[[^\]]*\]\s*/, '');
    const verify = /(?:kiểm|lệnh kiểm)\s*:\s*`?([^`→]+?)`?\s*(?:→|$)/i.exec(body)?.[1] ?? '';
    const cause = /nguyên nhân\s*:\s*(.*?)(?=\s*(?:→|—)?\s*(?:sửa|kiểm)\s*:|$)/i.exec(body)?.[1];
    const fix = /(?:^|→|—|\s)sửa\s*:\s*(.*?)(?=\s*(?:→|—)?\s*kiểm\s*:|$)/i.exec(body)?.[1];
    if (cause !== undefined || fix !== undefined) {
      const error = body.split(/nguyên nhân\s*:/i)[0].replace(/[—→\s-]+$/, '');
      items.push({ error: clip(error), cause: clip(cause ?? ''), fix: clip(fix ?? ''), verifyCmd: clip(verify) });
    } else {
      const [c, ...f] = body.split('→');
      items.push({ error: '', cause: clip(c), fix: clip(f.join('→')), verifyCmd: '' });
    }
    if (items.length >= MAX_ITEMS) break;
  }
  return { items, parsed: items.length > 0 };
}

/**
 * Trích object JSON đầu tiên hợp lệ từ câu trả lời của LLM
 * (ưu tiên khối ```json, sau đó quét cặp ngoặc nhọn cân bằng).
 */
export function extractJson<T = unknown>(text: string): T | undefined {
  if (!text) return undefined;
  const fences = [...text.matchAll(/```(?:json|JSON)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const f of fences) {
    const v = tryParse<T>(f.trim());
    if (v !== undefined) return v;
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const end = findBalanced(text, i);
    if (end < 0) continue;
    const v = tryParse<T>(text.slice(i, end + 1));
    if (v !== undefined) return v;
  }
  return undefined;
}

function tryParse<T>(s: string): T | undefined {
  try {
    const v = JSON.parse(s);
    return typeof v === 'object' && v !== null ? (v as T) : undefined;
  } catch {
    // thử sửa lỗi phổ biến: dấu phẩy thừa
    try {
      const v = JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
      return typeof v === 'object' && v !== null ? (v as T) : undefined;
    } catch {
      return undefined;
    }
  }
}

function findBalanced(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

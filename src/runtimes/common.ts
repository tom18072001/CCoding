import type { RunRequest } from '../types.js';

/**
 * Ghép một khối prompt duy nhất: bối cảnh chung của nhiệm vụ (giống nhau giữa các agent → tận dụng cache tiền tố)
 * → hồ sơ vị trí → công việc của lượt gọi.
 */
export function combinedPrompt(req: Pick<RunRequest, 'system' | 'prompt' | 'context'>): string {
  const parts: string[] = [];
  if (req.context) parts.push(req.context);
  if (req.system) parts.push(`═══════════════════ VAI TRÒ CỦA BẠN ═══════════════════\n\n${req.system}`);
  parts.push(`${req.system || req.context ? '═══════════════════ CÔNG VIỆC ═══════════════════\n\n' : ''}${req.prompt}`);
  return parts.join('\n\n');
}

/** Nội dung user cho kiểu "split" (system riêng): bối cảnh chung + công việc. */
export function userPrompt(req: Pick<RunRequest, 'prompt' | 'context'>): string {
  return req.context ? `${req.context}\n\n═══════════════════ CÔNG VIỆC ═══════════════════\n\n${req.prompt}` : req.prompt;
}

/** Ghép tín hiệu hủy của người dùng với hạn thời gian. */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}

/** Đọc luồng Server-Sent Events từ fetch Response, trả về từng payload `data:`. */
export async function* sseData(res: Response, onChunk?: () => void): AsyncGenerator<string> {
  if (!res.body) return;
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    onChunk?.();
    buf += decoder.decode(chunk, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
  if (buf.startsWith('data:')) yield buf.slice(5).trim();
}

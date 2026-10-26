import type { RunRequest } from '../types.js';

/** CLI agent chỉ nhận một khối prompt: ghép hồ sơ vị trí + công việc. */
export function combinedPrompt(req: Pick<RunRequest, 'system' | 'prompt'>): string {
  if (!req.system) return req.prompt;
  return `${req.system}\n\n═══════════════════ CÔNG VIỆC ═══════════════════\n\n${req.prompt}`;
}

/** Ghép tín hiệu hủy của người dùng với hạn thời gian. */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}

/** Đọc luồng Server-Sent Events từ fetch Response, trả về từng payload `data:`. */
export async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
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

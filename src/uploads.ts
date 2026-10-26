import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extractText } from './util/extract.js';
import { ensureDir, readJsonFile, safeName, writeJsonAtomic } from './util/fsx.js';
import { nowIso } from './util/ids.js';

/**
 * Tệp người dùng tải lên để đính kèm nhiệm vụ: data/uploads/<id>/{original/<tên>, text.txt, meta.json}.
 * Chữ được trích xuất một lần lúc tải lên; khi giao việc, tệp được chép vào data/runs/<task>/inputs/.
 */

export interface UploadMeta {
  id: string;
  name: string;
  file: string;
  size: number;
  mime?: string;
  kind: string;
  chars: number;
  truncated: boolean;
  note?: string;
  pages?: number;
  sha256: string;
  createdAt: string;
}

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/** Tên file an toàn, bỏ dấu tiếng Việt nhưng giữ đuôi. */
export function fileSafeName(name: string): string {
  const base = path.basename(name || 'tep').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const ext = path.extname(base).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  const stem = safeName(base.slice(0, base.length - path.extname(base).length)).slice(0, 70);
  return `${stem || 'tep'}${ext}`;
}

export class Uploads {
  constructor(private dataDir: string) {}

  root(): string {
    return path.join(this.dataDir, 'uploads');
  }

  dir(id: string): string {
    if (!/^u-[a-z0-9-]+$/.test(id)) throw new Error('Mã tệp không hợp lệ');
    return path.join(this.root(), id);
  }

  async save(name: string, buf: Buffer, mime?: string): Promise<UploadMeta> {
    if (!buf.length) throw new Error('Tệp rỗng');
    if (buf.length > MAX_UPLOAD_BYTES) throw new Error(`Tệp quá lớn (tối đa ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`);
    const id = `u-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const dir = ensureDir(path.join(this.dir(id), 'original'));
    const file = fileSafeName(name);
    const abs = path.join(dir, file);
    fs.writeFileSync(abs, buf);
    let ex: Awaited<ReturnType<typeof extractText>>;
    try {
      ex = await extractText(abs, { maxChars: 600_000 });
    } catch (e) {
      ex = { kind: 'binary', text: '', chars: 0, truncated: false, note: `Không trích xuất được chữ: ${(e as Error).message}` };
    }
    fs.writeFileSync(path.join(this.dir(id), 'text.txt'), ex.text, 'utf8');
    const meta: UploadMeta = {
      id,
      name: path.basename(name || file).slice(0, 200),
      file,
      size: buf.length,
      mime,
      kind: ex.kind,
      chars: ex.chars,
      truncated: ex.truncated,
      note: ex.note,
      pages: ex.pages,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      createdAt: nowIso(),
    };
    writeJsonAtomic(path.join(this.dir(id), 'meta.json'), meta);
    return meta;
  }

  get(id: string): UploadMeta | undefined {
    try {
      return readJsonFile<UploadMeta | undefined>(path.join(this.dir(id), 'meta.json'), undefined);
    } catch {
      return undefined;
    }
  }

  originalPath(meta: UploadMeta): string {
    return path.join(this.dir(meta.id), 'original', meta.file);
  }

  text(meta: UploadMeta): string {
    const f = path.join(this.dir(meta.id), 'text.txt');
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  }

  /** Xóa tệp tải lên nhưng không gắn vào nhiệm vụ nào sau một thời gian (mặc định 24 giờ). */
  purgeOlderThan(ms = 24 * 3_600_000): number {
    if (!fs.existsSync(this.root())) return 0;
    let n = 0;
    for (const id of fs.readdirSync(this.root())) {
      if (!/^u-[a-z0-9-]+$/.test(id)) continue;
      const st = fs.statSync(path.join(this.root(), id));
      if (Date.now() - st.mtimeMs > ms) {
        fs.rmSync(path.join(this.root(), id), { recursive: true, force: true });
        n++;
      }
    }
    return n;
  }

  remove(id: string): boolean {
    const d = this.dir(id);
    if (!fs.existsSync(d)) return false;
    fs.rmSync(d, { recursive: true, force: true });
    return true;
  }
}

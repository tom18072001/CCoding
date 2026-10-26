/**
 * Trích xuất văn bản thuần từ tệp đính kèm để đưa vào prompt LLM.
 *
 * - Không thêm phụ thuộc runtime: tự đọc ZIP (DOCX/XLSX/PPTX), tự phân tích PDF.
 * - PDF: ưu tiên `pdftotext` (Poppler) nếu có trên PATH, nếu không dùng bộ đọc tích hợp
 *   (FlateDecode, ToUnicode CMap, font Identity-H, Object Stream, mã hóa mật khẩu rỗng).
 * - Không thực thi gì từ nội dung tệp và không ghi tệp nào ra đĩa.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

export type ExtractKind = 'text' | 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'image' | 'binary';

export interface Extracted {
  kind: ExtractKind;
  /** Văn bản thuần đã trích ('' khi không trích được gì). */
  text: string;
  /** Độ dài văn bản (đã chuẩn hóa) trước khi cắt. */
  chars: number;
  truncated: boolean;
  /** Ghi chú tiếng Việt về chất lượng/giới hạn. */
  note?: string;
  /** Số trang PDF / số slide PPTX / số trang tính XLSX (khi biết). */
  pages?: number;
}

export interface ExtractOptions {
  /** Giới hạn số ký tự đầu ra (mặc định 400.000). */
  maxChars?: number;
  /**
   * Dùng `pdftotext` (Poppler) cho PDF nếu có: `true` (mặc định) tìm trên PATH,
   * chuỗi = đường dẫn tới tệp thực thi, `false` = chỉ dùng bộ đọc tích hợp.
   */
  pdftotext?: boolean | string;
}

export interface ZipReadOptions {
  /** Chỉ giải nén các mục thỏa điều kiện (mục khác bỏ qua, không tốn bộ nhớ). */
  filter?: (name: string) => boolean;
  /** Tổng dung lượng giải nén tối đa (mặc định 200 MB). */
  maxTotalBytes?: number;
  /** Dung lượng giải nén tối đa của một mục (mặc định 100 MB). */
  maxEntryBytes?: number;
}

const DEFAULT_MAX_CHARS = 400_000;
const MAX_CONTAINER_BYTES = 200 * 1024 * 1024; // DOCX/XLSX/PPTX/PDF lớn hơn: không trích xuất
const ZIP_MAX_TOTAL = 200 * 1024 * 1024;
const ZIP_MAX_ENTRY = 100 * 1024 * 1024;
const ZIP_MAX_ENTRIES = 100_000;
const XLSX_MAX_ROWS = 5_000;
const XLSX_MAX_COLS = 256;
const PDF_TIMEOUT_MS = 60_000;
const PDF_MAX_DECODED = 256 * 1024 * 1024; // tổng byte giải nén từ các stream PDF
const PDF_MAX_STREAM = 64 * 1024 * 1024;
const PDF_MAX_OPS = 20_000_000; // tổng số toán tử nội dung được thông dịch

// ───────────────────────── Nhận dạng loại tệp ─────────────────────────

const words = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));

const TEXT_EXTS = words(`
  md markdown mdx txt text csv tsv tab json jsonl ndjson json5 jsonc geojson yaml yml xml xsd xsl xslt svg
  html htm xhtml css scss sass less sql log out err ini cfg conf config cnf toml env properties prop
  tex bib rst adoc asciidoc org srt vtt eml mbox ics vcf
  ts tsx mts cts js jsx mjs cjs py pyw pyi ipynb java kt kts scala sc groovy gradle cs csx vb fs fsx go rs
  rb erb php phtml pl pm lua r rmd swift m mm c h cc cpp cxx hpp hh hxx ino dart sh bash zsh fish ksh
  ps1 psm1 psd1 bat cmd vue svelte astro graphql gql proto thrift avsc tf tfvars hcl
  dockerfile containerfile makefile mk cmake gitignore gitattributes dockerignore editorconfig npmrc nvmrc
  diff patch ejs hbs handlebars mustache twig jinja jinja2 j2 liquid njk
  csproj vbproj fsproj sln props targets resx plist xaml wsdl rss atom kml gpx nfo`);
const TEXT_NAMES = words('dockerfile containerfile makefile readme license licence changelog authors notice procfile gemfile rakefile jenkinsfile vagrantfile brewfile');
const HTML_EXTS = words('html htm xhtml');
const IMAGE_EXTS = words('png jpg jpeg jpe jfif pjpeg pjp gif webp bmp dib tif tiff ico cur heic heif avif jxl psd tga');
const LEGACY_OFFICE_EXTS = words('doc dot xls xlt xlw ppt pps pot');
const ODF_EXTS = words('odt ott ods ots odp otp odg');
const ARCHIVE_EXTS = words('zip rar 7z gz tgz bz2 xz tar zst lz4 cab iso jar war apk');
const OOXML_KIND: Record<string, 'docx' | 'xlsx' | 'pptx'> = {
  docx: 'docx', docm: 'docx', dotx: 'docx', dotm: 'docx',
  xlsx: 'xlsx', xlsm: 'xlsx', xltx: 'xlsx', xltm: 'xlsx',
  pptx: 'pptx', pptm: 'pptx', potx: 'pptx', potm: 'pptx', ppsx: 'pptx', ppsm: 'pptx',
};

function extOf(name: string): string {
  const base = path.basename(name).toLowerCase();
  const ext = path.extname(base);
  if (ext) return ext.slice(1);
  return base.startsWith('.') ? base.slice(1) : '';
}

type Magic = 'pdf' | 'zip' | 'image' | 'cfb' | null;

function sniffMagic(h: Buffer): Magic {
  if (h.length >= 5 && h.subarray(0, Math.min(h.length, 1024)).indexOf('%PDF-', 0, 'latin1') >= 0) return 'pdf';
  if (h.length >= 4 && h[0] === 0x50 && h[1] === 0x4b && ((h[2] === 3 && h[3] === 4) || (h[2] === 5 && h[3] === 6))) return 'zip';
  if (h.length >= 8 && h.readUInt32BE(0) === 0xd0cf11e0 && h.readUInt32BE(4) === 0xa1b11ae1) return 'cfb';
  if (h.length >= 4) {
    if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return 'image'; // PNG
    if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image'; // JPEG
    if (h.toString('latin1', 0, 4) === 'GIF8') return 'image';
    if (h.length >= 12 && h.toString('latin1', 0, 4) === 'RIFF' && h.toString('latin1', 8, 12) === 'WEBP') return 'image';
    if ((h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a && h[3] === 0) || (h[0] === 0x4d && h[1] === 0x4d && h[2] === 0 && h[3] === 0x2a)) return 'image'; // TIFF
  }
  return null;
}

function sniffUtf16(b: Buffer): 'utf16le' | 'utf16be' | null {
  if (b.length >= 2) {
    if (b[0] === 0xff && b[1] === 0xfe) return 'utf16le';
    if (b[0] === 0xfe && b[1] === 0xff) return 'utf16be';
  }
  const n = Math.min(b.length & ~1, 4096);
  if (n < 8) return null;
  let even = 0, odd = 0, both = 0;
  for (let i = 0; i < n; i += 2) {
    if (b[i] === 0) even++;
    if (b[i + 1] === 0) odd++;
    if (b[i] === 0 && b[i + 1] === 0) both++;
  }
  const half = n / 2;
  if (both > half * 0.01) return null;
  if (odd > half * 0.4 && even < half * 0.05) return 'utf16le';
  if (even > half * 0.4 && odd < half * 0.05) return 'utf16be';
  return null;
}

function validUtf8Prefix(sample: Buffer): boolean {
  try {
    // stream: true → chuỗi đa byte bị cắt ở cuối mẫu không bị coi là lỗi
    new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true });
    return true;
  } catch {
    return false;
  }
}

/** Tệp có phải văn bản (đọc được như text) không, dựa trên tên và vài KB đầu. */
export function isTextLike(name: string, sample: Buffer): boolean {
  const ext = extOf(name);
  if (IMAGE_EXTS.has(ext) || LEGACY_OFFICE_EXTS.has(ext) || ODF_EXTS.has(ext) || ARCHIVE_EXTS.has(ext) || OOXML_KIND[ext] || ext === 'pdf') {
    return false;
  }
  if (sample.length === 0) return true;
  if (sniffMagic(sample)) return false;
  if (sniffUtf16(sample)) return true;
  let nul = 0;
  for (const b of sample) if (b === 0) nul++;
  const base = path.basename(name).toLowerCase().replace(/\.[^.]*$/, '');
  if (TEXT_EXTS.has(ext) || TEXT_NAMES.has(base) || TEXT_NAMES.has(ext)) {
    return nul <= sample.length * 0.01; // vài byte NUL lẻ tẻ (log hỏng) vẫn coi là văn bản
  }
  if (nul > 0 || !validUtf8Prefix(sample)) return false;
  let ctrl = 0;
  for (const b of sample) if (b < 32 && b !== 9 && b !== 10 && b !== 13 && b !== 12 && b !== 27) ctrl++;
  return ctrl <= sample.length * 0.02;
}

interface Detected {
  kind: ExtractKind;
  zip?: boolean; // ZIP chưa rõ loại → xem nội dung để quyết định
  cfb?: boolean; // tệp OLE2 (Office cũ hoặc Office có mật khẩu)
}

function detectKind(file: string, head: Buffer): Detected {
  const ext = extOf(file);
  const magic = sniffMagic(head);
  if (magic === 'pdf' || ext === 'pdf') return { kind: 'pdf' };
  const ooxml = OOXML_KIND[ext];
  if (ooxml) return { kind: ooxml, cfb: magic === 'cfb' };
  if (magic === 'image' || IMAGE_EXTS.has(ext)) return { kind: 'image' };
  if (magic === 'zip') return { kind: 'binary', zip: true };
  if (magic === 'cfb') return { kind: 'binary', cfb: true };
  if (isTextLike(file, head)) return { kind: 'text' };
  return { kind: 'binary' };
}

// ───────────────────────── API chính ─────────────────────────

interface Part {
  text: string;
  notes: string[];
  pages?: number;
  /** Nội dung chưa đọc hết (dừng sớm) → luôn đánh dấu truncated. */
  partial?: boolean;
}

/** Trích văn bản từ tệp. Chỉ ném lỗi khi không đọc được tệp; lỗi định dạng trả về qua `note`. */
export async function extractText(file: string, opts: ExtractOptions = {}): Promise<Extracted> {
  const maxChars =
    typeof opts.maxChars === 'number' && Number.isFinite(opts.maxChars) && opts.maxChars > 0
      ? Math.floor(opts.maxChars)
      : DEFAULT_MAX_CHARS;
  const name = path.basename(file);
  let size: number;
  let head: Buffer;
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) throw new Error('không phải tệp thông thường');
    size = st.size;
    head = await readHead(file, 8192);
  } catch (e) {
    throw new Error(`Không đọc được tệp "${name}": ${errText(e)}`);
  }

  const det = detectKind(file, head);
  try {
    switch (det.kind) {
      case 'text':
        return finish('text', await extractPlain(file, size, maxChars), maxChars);
      case 'image':
        return empty('image', 'Ảnh — không trích xuất chữ (chưa có OCR)');
      case 'pdf':
        if (size > MAX_CONTAINER_BYTES && opts.pdftotext === false) {
          return empty('pdf', `Tệp PDF quá lớn (${mb(size)}) — vượt giới hạn ${mb(MAX_CONTAINER_BYTES)} của bộ đọc tích hợp`);
        }
        return finish('pdf', await extractPdf(file, size, maxChars, opts), maxChars);
      case 'docx':
      case 'xlsx':
      case 'pptx': {
        if (det.cfb) return empty(det.kind, 'Tệp Office được đặt mật khẩu (mã hóa) hoặc là định dạng cũ đổi đuôi — không đọc được');
        if (size > MAX_CONTAINER_BYTES) return empty(det.kind, `Tệp quá lớn (${mb(size)}) — vượt giới hạn ${mb(MAX_CONTAINER_BYTES)}`);
        const zip = readZip(await fs.readFile(file), { filter: isXmlPart });
        return finish(det.kind, officeToText(det.kind, zip), maxChars);
      }
      case 'binary':
      default: {
        if (det.zip && size <= MAX_CONTAINER_BYTES) {
          let zip: Map<string, Buffer> | null = null;
          try {
            zip = readZip(await fs.readFile(file), { filter: isXmlPart });
          } catch {
            zip = null;
          }
          const sub = zip ? ooxmlKindOf(zip) : null;
          if (zip && sub) return finish(sub, officeToText(sub, zip), maxChars);
          return empty('binary', 'Tệp nén ZIP — không giải nén để đọc nội dung bên trong');
        }
        return empty('binary', binaryNote(extOf(file), det));
      }
    }
  } catch (e) {
    return empty(det.kind, `Không trích xuất được nội dung (${kindLabel(det.kind)}): ${errText(e)}`);
  }
}

function kindLabel(k: ExtractKind): string {
  return k === 'text' ? 'văn bản' : k === 'binary' ? 'nhị phân' : k === 'image' ? 'ảnh' : k.toUpperCase();
}

function binaryNote(ext: string, det: Detected): string {
  if (LEGACY_OFFICE_EXTS.has(ext) || det.cfb) {
    return 'Định dạng Office cũ (.doc/.xls/.ppt) chưa được hỗ trợ — hãy lưu lại dưới dạng .docx/.xlsx/.pptx hoặc PDF';
  }
  if (ODF_EXTS.has(ext)) return 'Định dạng OpenDocument chưa được hỗ trợ — hãy xuất sang .docx/.xlsx/.pptx hoặc PDF';
  if (ARCHIVE_EXTS.has(ext)) return 'Tệp nén — không giải nén để đọc nội dung bên trong';
  return 'Tệp nhị phân — không trích xuất được nội dung chữ';
}

function empty(kind: ExtractKind, note: string, pages?: number): Extracted {
  const r: Extracted = { kind, text: '', chars: 0, truncated: false, note };
  if (pages !== undefined) r.pages = pages;
  return r;
}

async function readHead(file: string, n: number): Promise<Buffer> {
  const fh = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function mb(n: number): string {
  return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function fmtInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Chuẩn hóa văn bản: NFC, bỏ ký tự điều khiển, cắt khoảng trắng cuối dòng, gộp dòng trống. */
function normalizeText(s: string): string {
  return s
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '') // mã màu ANSI trong log
    .replace(/\r\n?/g, '\n')
    .replace(/[\f\v\u2028\u2029]/g, '\n')
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f\ufeff]/g, '')
    .normalize('NFC')
    .replace(/[ \t\u00a0\u3000]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/\s+$/, '');
}

function finish(kind: ExtractKind, part: Part, maxChars: number): Extracted {
  const full = normalizeText(part.text);
  const notes = [...part.notes];
  let text = full;
  let truncated = !!part.partial;
  if (full.length > maxChars) {
    truncated = true;
    const marker = (cut: number) => `\n\n[… Đã cắt bớt: hiển thị ${fmtInt(cut)}/${fmtInt(full.length)} ký tự …]`;
    const reserve = marker(maxChars).length;
    let cut = maxChars > reserve * 2 ? maxChars - reserve : maxChars;
    const nl = full.lastIndexOf('\n', cut);
    if (nl > 0 && nl >= cut - 2000) cut = nl; // cắt ở cuối dòng nếu gần
    const cc = full.charCodeAt(cut - 1);
    if (cc >= 0xd800 && cc <= 0xdbff) cut--; // không cắt đôi cặp surrogate
    text = full.slice(0, cut).replace(/\s+$/, '');
    if (maxChars > reserve * 2) text += marker(text.length);
    notes.push(`Nội dung dài — đã cắt còn ${fmtInt(text.length)}/${fmtInt(full.length)} ký tự`);
  } else if (truncated && full.length + 60 < maxChars) {
    text = `${full}\n\n[… Nội dung chưa được đọc hết …]`;
  }
  const r: Extracted = { kind, text, chars: full.length, truncated };
  const note = [...new Set(notes.filter(Boolean))].join('; ');
  if (note) r.note = note;
  if (part.pages !== undefined) r.pages = part.pages;
  return r;
}

// ───────────────────────── Văn bản thuần & HTML ─────────────────────────

const CP1252_HI = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

function decodeCp1252(buf: Buffer): string {
  return buf.toString('latin1').replace(/[\u0080-\u009f]/g, (c) => CP1252_HI[c.charCodeAt(0) - 0x80] ?? c);
}

function decodeTextBuffer(buf: Buffer, partial: boolean): { text: string; note?: string } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.subarray(3);
  } else {
    const u16 = sniffUtf16(buf);
    if (u16) {
      let b = buf;
      if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) b = b.subarray(2);
      if (b.length % 2) b = b.subarray(0, b.length - 1);
      if (u16 === 'utf16be') {
        b = Buffer.from(b);
        b.swap16();
      }
      return { text: b.toString('utf16le') };
    }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf, { stream: partial }) };
  } catch {
    return {
      text: decodeCp1252(buf),
      note: 'Tệp không phải UTF-8 hợp lệ — đã đọc theo Latin-1 (Windows-1252), dấu tiếng Việt có thể sai',
    };
  }
}

async function extractPlain(file: string, size: number, maxChars: number): Promise<Part> {
  const cap = Math.max(1024 * 1024, maxChars * 4 + 16);
  const partial = size > cap;
  const buf = partial ? await readHead(file, cap) : await fs.readFile(file);
  const dec = decodeTextBuffer(buf, partial);
  const notes: string[] = [];
  if (dec.note) notes.push(dec.note);
  if (partial) notes.push(`Tệp lớn (${mb(size)}) — chỉ đọc ${mb(cap)} đầu`);
  let text = dec.text;
  const ext = extOf(file);
  if (HTML_EXTS.has(ext) || (!ext && /^\s*<(?:!doctype\s+html|html)[\s>]/i.test(text.slice(0, 1000)))) text = htmlToText(text);
  return { text, notes, partial };
}

const LATIN1_ENTITY_NAMES =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute ' +
  'micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig ' +
  'Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash ' +
  'Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc ' +
  'euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml ' +
  'yacute thorn yuml';

const HTML_ENTITIES: Record<string, string> = (() => {
  const m: Record<string, string> = {
    ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚',
    ldquo: '“', rdquo: '”', bdquo: '„', dagger: '†', Dagger: '‡', bull: '•', hellip: '…', permil: '‰', prime: '′',
    Prime: '″', lsaquo: '‹', rsaquo: '›', euro: '€', trade: '™', larr: '←', uarr: '↑', rarr: '→', darr: '↓',
    harr: '↔', minus: '−', le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', zwnj: '\u200c', zwj: '\u200d',
    lrm: '\u200e', rlm: '\u200f', OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ',
    circ: 'ˆ', tilde: '˜', Abreve: 'Ă', abreve: 'ă', Dstrok: 'Đ', dstrok: 'đ', Itilde: 'Ĩ', itilde: 'ĩ',
    Utilde: 'Ũ', utilde: 'ũ', check: '✓', apos: "'", quot: '"', amp: '&', lt: '<', gt: '>',
  };
  LATIN1_ENTITY_NAMES.split(' ').forEach((n, i) => (m[n] = String.fromCharCode(0xa0 + i)));
  return m;
})();

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(s: string, html = false): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return m;
      return String.fromCodePoint(cp);
    }
    return XML_ENTITIES[e] ?? (html ? HTML_ENTITIES[e] : undefined) ?? m;
  });
}

const BLOCK_TAGS =
  'p|div|section|article|header|footer|nav|aside|main|ul|ol|dl|dt|dd|table|thead|tbody|tfoot|caption|' +
  'blockquote|pre|hr|figure|figcaption|form|fieldset|legend|address|details|summary|center|h[1-6]';

/** HTML → văn bản đọc được: bỏ script/style/comment, giữ cấu trúc khối, bảng `a | b`, danh sách `- `. */
function htmlToText(html: string): string {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|math|head|object|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(script|style)\b[\s\S]*$/i, ' ')
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_m, inner: string) => `<br>${inner.replace(/\r?\n/g, '<br>')}<br>`)
    .replace(/[ \t\r\n\f]+/g, ' ')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<h([1-6])\b[^>]*>/gi, (_m, n: string) => `\n\n${'#'.repeat(Number(n))} `)
    .replace(/<\/t[dh]\s*>/gi, ' | ')
    .replace(/<tr\b[^>]*>/gi, '\n')
    .replace(/<\/tr\s*>/gi, '')
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<\/?[A-Za-z!?][^>]*>/g, '');
  s = decodeEntities(s, true).replace(/\u00a0/g, ' ');
  s = s
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').trim().replace(/\s*\|$/, '').replace(/^\|\s*/, ''))
    .join('\n');
  const t = title ? decodeEntities(title.replace(/<[^>]*>/g, ''), true).replace(/\s+/g, ' ').trim() : '';
  if (t && !s.includes(t)) s = `# ${t}\n\n${s}`;
  return s;
}

// ───────────────────────── ZIP ─────────────────────────

function isXmlPart(name: string): boolean {
  return /\.(?:xml|rels)$/i.test(name);
}

function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 5 && buf[i + 3] === 6) return i;
  }
  return -1;
}

function readU64(buf: Buffer, off: number): number {
  const v = buf.readBigUInt64LE(off);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Giá trị ZIP64 vượt giới hạn.');
  return Number(v);
}

/**
 * Đọc tệp ZIP trong bộ nhớ: tên mục → nội dung đã giải nén (stored + deflate, hỗ trợ ZIP64).
 * Mục mã hóa hoặc nén kiểu khác bị bỏ qua. Ném lỗi tiếng Việt khi tệp hỏng hoặc vượt giới hạn giải nén.
 */
export function readZip(buf: Buffer, opts: ZipReadOptions = {}): Map<string, Buffer> {
  const maxTotal = opts.maxTotalBytes ?? ZIP_MAX_TOTAL;
  const maxEntry = Math.min(opts.maxEntryBytes ?? ZIP_MAX_ENTRY, maxTotal);
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('Tệp ZIP không hợp lệ hoặc bị hỏng (không tìm thấy End-Of-Central-Directory).');
  let count = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOff = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    // ZIP64: locator nằm ngay trước EOCD
    const loc = eocd - 20;
    if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) throw new Error('Tệp ZIP64 bị hỏng (thiếu locator).');
    const z64 = readU64(buf, loc + 8);
    if (z64 + 56 > buf.length || buf.readUInt32LE(z64) !== 0x06064b50) throw new Error('Tệp ZIP64 bị hỏng (thiếu EOCD64).');
    count = readU64(buf, z64 + 32);
    cdSize = readU64(buf, z64 + 40);
    cdOff = readU64(buf, z64 + 48);
  }
  if (count > ZIP_MAX_ENTRIES) throw new Error(`Tệp ZIP có quá nhiều mục (${fmtInt(count)}).`);
  // Dữ liệu chèn trước ZIP (SFX…): dời offset cho khớp
  let delta = 0;
  if (cdOff + 4 > buf.length || buf.readUInt32LE(cdOff) !== 0x02014b50) {
    const guess = eocd - cdSize;
    if (guess >= 0 && guess + 4 <= buf.length && buf.readUInt32LE(guess) === 0x02014b50) {
      delta = guess - cdOff;
      cdOff = guess;
    } else if (count > 0) {
      throw new Error('Tệp ZIP bị hỏng (thư mục trung tâm không hợp lệ).');
    }
  }

  const out = new Map<string, Buffer>();
  let total = 0;
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Tệp ZIP bị hỏng (mục thư mục trung tâm không hợp lệ).');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    let csize = buf.readUInt32LE(p + 20);
    let usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    let lho = buf.readUInt32LE(p + 42);
    if (p + 46 + nlen + xlen > buf.length) throw new Error('Tệp ZIP bị hỏng (tên mục vượt ra ngoài tệp).');
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    if (usize === 0xffffffff || csize === 0xffffffff || lho === 0xffffffff) {
      // trường mở rộng ZIP64 (id 0x0001): chỉ chứa các giá trị bị đặt 0xFFFFFFFF, theo thứ tự cố định
      let x = p + 46 + nlen;
      const xend = x + xlen;
      while (x + 4 <= xend) {
        const id = buf.readUInt16LE(x);
        const sz = buf.readUInt16LE(x + 2);
        if (id === 1) {
          let q = x + 4;
          if (usize === 0xffffffff && q + 8 <= x + 4 + sz) { usize = readU64(buf, q); q += 8; }
          if (csize === 0xffffffff && q + 8 <= x + 4 + sz) { csize = readU64(buf, q); q += 8; }
          if (lho === 0xffffffff && q + 8 <= x + 4 + sz) { lho = readU64(buf, q); q += 8; }
          break;
        }
        x += 4 + sz;
      }
    }
    p += 46 + nlen + xlen + clen;

    if (name.endsWith('/')) continue;
    if (opts.filter && !opts.filter(name)) continue;
    if (flags & 1) continue; // mục được mã hóa: bỏ qua
    if (method !== 0 && method !== 8) continue; // kiểu nén khác: bỏ qua
    if (usize > maxEntry) throw new Error(`Mục "${name}" trong ZIP quá lớn (${mb(usize)}) — vượt giới hạn giải nén, nghi ngờ zip bomb.`);

    const lh = lho + delta;
    if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) throw new Error(`Tệp ZIP bị hỏng (header cục bộ của "${name}" không hợp lệ).`);
    const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
    if (start + csize > buf.length) throw new Error(`Tệp ZIP bị hỏng (dữ liệu "${name}" bị cụt).`);
    const comp = buf.subarray(start, start + csize);
    const limit = Math.min(maxEntry, maxTotal - total);
    let data: Buffer;
    if (method === 0) {
      if (csize > limit) throw new Error(`Vượt giới hạn giải nén ZIP (${mb(maxTotal)}) — nghi ngờ zip bomb.`);
      data = comp;
    } else {
      try {
        data = zlib.inflateRawSync(comp, { maxOutputLength: Math.max(1, limit) });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) {
          throw new Error(`Vượt giới hạn giải nén ZIP khi đọc "${name}" — nghi ngờ zip bomb.`);
        }
        throw new Error(`Không giải nén được "${name}" trong ZIP: ${errText(e)}`);
      }
    }
    total += data.length;
    if (total > maxTotal) throw new Error(`Vượt giới hạn giải nén ZIP (${mb(maxTotal)}) — nghi ngờ zip bomb.`);
    out.set(name, data);
  }
  return out;
}

// ───────────────────────── XML (OOXML) ─────────────────────────

interface XmlHandlers {
  open?: (name: string, attrs: string, selfClosing: boolean) => void;
  close?: (name: string) => void;
  text?: (text: string) => void;
  /** Đặt true trong callback để dừng duyệt. */
  stop?: boolean;
}

/** Duyệt XML tuần tự (kiểu SAX), tên thẻ đã bỏ tiền tố namespace; văn bản đã giải mã entity. */
function walkXml(xml: string, h: XmlHandlers): void {
  const n = xml.length;
  let i = 0;
  while (i < n && !h.stop) {
    const lt = xml.indexOf('<', i);
    const stop = lt < 0 ? n : lt;
    if (stop > i && h.text) h.text(decodeEntities(xml.slice(i, stop)));
    if (lt < 0) break;
    const c = xml.charCodeAt(lt + 1);
    if (c === 33 /* ! */) {
      if (xml.startsWith('<!--', lt)) {
        const e = xml.indexOf('-->', lt + 4);
        i = e < 0 ? n : e + 3;
      } else if (xml.startsWith('<![CDATA[', lt)) {
        const e = xml.indexOf(']]>', lt + 9);
        const end = e < 0 ? n : e;
        if (h.text) h.text(xml.slice(lt + 9, end));
        i = end + 3;
      } else {
        const e = xml.indexOf('>', lt);
        i = e < 0 ? n : e + 1;
      }
      continue;
    }
    if (c === 63 /* ? */) {
      const e = xml.indexOf('?>', lt + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    // tìm '>' kết thúc thẻ, bỏ qua '>' nằm trong giá trị thuộc tính
    let j = lt + 1;
    let q = 0;
    while (j < n) {
      const ch = xml.charCodeAt(j);
      if (q) {
        if (ch === q) q = 0;
      } else if (ch === 34 || ch === 39) q = ch;
      else if (ch === 62) break;
      j++;
    }
    if (j >= n) break;
    const closing = c === 47;
    let inner = xml.slice(lt + (closing ? 2 : 1), j);
    const self = !closing && inner.endsWith('/');
    if (self) inner = inner.slice(0, -1);
    let k = 0;
    while (k < inner.length) {
      const ch = inner.charCodeAt(k);
      if (ch === 32 || ch === 9 || ch === 10 || ch === 13) break;
      k++;
    }
    const qname = inner.slice(0, k);
    const colon = qname.lastIndexOf(':');
    const name = colon >= 0 ? qname.slice(colon + 1) : qname;
    if (closing) h.close?.(name);
    else {
      h.open?.(name, inner.slice(k), self);
      if (self) h.close?.(name);
    }
    i = j + 1;
  }
}

const ATTR_RE = new Map<string, RegExp>();

/** Lấy thuộc tính; tên không có ':' khớp với mọi tiền tố namespace (w:val, val…). */
function attr(attrs: string, name: string): string | undefined {
  let re = ATTR_RE.get(name);
  if (!re) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(?:^|\\s)${name.includes(':') ? esc : `(?:[\\w.-]+:)?${esc}`}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
    ATTR_RE.set(name, re);
  }
  const m = re.exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? '') : undefined;
}

/** Thuộc tính r:id (chấp nhận tiền tố namespace khác 'r'). */
function relId(attrs: string): string | undefined {
  return attr(attrs, 'r:id') ?? /\s[\w.-]+:id\s*=\s*"([^"]*)"/.exec(attrs)?.[1];
}

function zipGet(zip: Map<string, Buffer>, name: string): string | undefined {
  let b = zip.get(name);
  if (!b) {
    const lower = name.toLowerCase();
    for (const [k, v] of zip) {
      if (k.toLowerCase() === lower || decodeURIComponentSafe(k).toLowerCase() === lower) {
        b = v;
        break;
      }
    }
  }
  if (!b) return undefined;
  return decodeTextBuffer(b, false).text;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

interface Rel {
  target: string;
  type: string;
}

/** Đọc tệp .rels; Target được chuẩn hóa thành đường dẫn tuyệt đối trong ZIP. */
function parseRels(xml: string | undefined, baseDir: string): Map<string, Rel> {
  const out = new Map<string, Rel>();
  if (!xml) return out;
  walkXml(xml, {
    open(name, attrs) {
      if (name !== 'Relationship') return;
      const id = attr(attrs, 'Id');
      const target = attr(attrs, 'Target');
      if (!id || !target || attr(attrs, 'TargetMode') === 'External') return;
      const resolved = target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(baseDir, target));
      out.set(id, { target: resolved.replace(/^(\.\.\/)+/, ''), type: attr(attrs, 'Type') ?? '' });
    },
  });
  return out;
}

/** Đường dẫn phần chính (officeDocument) trong gói OOXML. */
function mainPart(zip: Map<string, Buffer>, fallback: string): string {
  for (const r of parseRels(zipGet(zip, '_rels/.rels'), '').values()) {
    if (/\/officeDocument$/.test(r.type) && zip.has(r.target)) return r.target;
  }
  return fallback;
}

function relsPathOf(part: string): string {
  return `${path.posix.dirname(part)}/_rels/${path.posix.basename(part)}.rels`;
}

function ooxmlKindOf(zip: Map<string, Buffer>): 'docx' | 'xlsx' | 'pptx' | null {
  const main = mainPart(zip, '');
  if (/^word\//i.test(main) || zip.has('word/document.xml')) return 'docx';
  if (/^xl\//i.test(main) || zip.has('xl/workbook.xml')) return 'xlsx';
  if (/^ppt\//i.test(main) || zip.has('ppt/presentation.xml')) return 'pptx';
  return null;
}

function officeToText(kind: 'docx' | 'xlsx' | 'pptx', zip: Map<string, Buffer>): Part {
  if (kind === 'docx') return docxToText(zip);
  if (kind === 'xlsx') return xlsxToText(zip);
  return pptxToText(zip);
}

// Văn bản DrawingML/WordprocessingML: đoạn, bảng, ngắt dòng
type OxMode = 'docx' | 'pptx' | 'notes';
interface PFrame { k: 'p'; parts: string[]; level: number; list: number }
interface BFrame { k: 'root'; lines: string[] }
interface CFrame { k: 'cell'; lines: string[] }
interface RFrame { k: 'row'; cells: string[] }
interface TFrame { k: 'tbl'; rows: string[] }
type OxFrame = PFrame | BFrame | CFrame | RFrame | TFrame;

const OX_SKIP: Record<OxMode, Set<string>> = {
  // Fallback: bản sao của mc:Choice; tabs: định nghĩa điểm dừng tab; moveFrom: văn bản đã bị chuyển đi
  docx: new Set(['Fallback', 'tabs', 'instrText', 'delText', 'moveFrom', 'rPh']),
  pptx: new Set(['Fallback', 'tabLst']),
  notes: new Set(['Fallback', 'tabLst', 'fld']),
};

interface ParaStyle { level: number; list: boolean }

function ooxmlToText(xml: string, mode: OxMode, styleOf?: (styleId: string) => ParaStyle | undefined): string {
  const root: BFrame = { k: 'root', lines: [] };
  const stack: OxFrame[] = [root];
  const skipSet = OX_SKIP[mode];
  let skip = 0;
  let inT = false;
  const top = () => stack[stack.length - 1];
  const nearestP = (): PFrame | undefined => {
    const t = top();
    return t.k === 'p' ? t : undefined;
  };
  const append = (s: string) => {
    const t = top();
    if (t.k === 'p') t.parts.push(s);
    else if (t.k === 'root' || t.k === 'cell') t.lines.push(s);
  };
  const popTo = <K extends OxFrame['k']>(k: K): Extract<OxFrame, { k: K }> | undefined => {
    for (let i = stack.length - 1; i > 0; i--) {
      if (stack[i].k === k) {
        const f = stack[i];
        stack.length = i;
        return f as Extract<OxFrame, { k: K }>;
      }
    }
    return undefined;
  };
  const closeP = () => {
    const p = popTo('p');
    if (!p) return;
    const body = p.parts.join('').replace(/^\n+|\n+$/g, '');
    let line = body;
    if (body.trim()) {
      if (p.level > 0) line = `${'#'.repeat(Math.min(p.level, 6))} ${body.trim()}`;
      else if (p.list >= 0) line = `${'  '.repeat(Math.min(p.list, 8))}- ${body.trim()}`;
    }
    const parent = top();
    if (parent.k === 'p') parent.parts.push(`\n${line}\n`);
    else if (parent.k === 'root') parent.lines.push(line);
    else if (parent.k === 'cell' && line.trim()) parent.lines.push(line);
  };
  const closeCell = () => {
    const c = popTo('cell');
    if (!c) return;
    const text = c.lines
      .flatMap((l) => l.split('\n'))
      .map((l) => l.replace(/\t/g, ' ').trim())
      .filter(Boolean)
      .join(' / ');
    const parent = top();
    if (parent.k === 'row') parent.cells.push(text);
    else if (text) append(text);
  };
  const closeRow = () => {
    const r = popTo('row');
    if (!r) return;
    const cells = r.cells.slice();
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    if (!cells.length) return;
    const parent = top();
    const line = cells.join(' | ');
    if (parent.k === 'tbl') parent.rows.push(line);
    else append(line);
  };
  const closeTbl = () => {
    const t = popTo('tbl');
    if (!t || !t.rows.length) return;
    const parent = top();
    if (parent.k === 'root') parent.lines.push('', ...t.rows, '');
    else if (parent.k === 'cell') parent.lines.push(t.rows.join(' ; '));
    else if (parent.k === 'p') parent.parts.push(`\n${t.rows.join('\n')}\n`);
  };

  walkXml(xml, {
    open(name, attrs, self) {
      if (skipSet.has(name)) {
        skip++; // walkXml luôn gọi close, kể cả thẻ tự đóng
        return;
      }
      if (skip) return;
      switch (name) {
        case 'p':
          stack.push({ k: 'p', parts: [], level: 0, list: -1 });
          break;
        case 't':
          if (!self) inT = true;
          break;
        case 'tab':
          if (mode === 'docx') append('\t');
          break;
        case 'br':
        case 'cr':
          append('\n');
          break;
        case 'noBreakHyphen':
          if (mode === 'docx') append('-');
          break;
        case 'tbl':
          stack.push({ k: 'tbl', rows: [] });
          break;
        case 'tr':
          stack.push({ k: 'row', cells: [] });
          break;
        case 'tc':
          stack.push({ k: 'cell', lines: [] });
          break;
        case 'pStyle': {
          const p = nearestP();
          const id = attr(attrs, 'val');
          if (p && id && mode === 'docx') {
            const st = styleOf?.(id);
            const m = /^(?:heading|title)\s*(\d)?$/i.exec(id);
            p.level = st?.level || (m ? Number(m[1] ?? 1) : 0);
            if (st?.list && p.list < 0) p.list = 0;
          }
          break;
        }
        case 'outlineLvl': {
          const p = nearestP();
          const v = Number(attr(attrs, 'val'));
          if (p && mode === 'docx' && Number.isInteger(v) && v >= 0 && v < 6 && !p.level) p.level = v + 1;
          break;
        }
        case 'numPr': {
          const p = nearestP();
          if (p && mode === 'docx' && p.list < 0) p.list = 0;
          break;
        }
        case 'ilvl': {
          const p = nearestP();
          const v = Number(attr(attrs, 'val'));
          if (p && mode === 'docx' && Number.isInteger(v) && v >= 0) p.list = v;
          break;
        }
      }
    },
    close(name) {
      if (skipSet.has(name)) {
        if (skip) skip--;
        return;
      }
      if (skip) return;
      switch (name) {
        case 't':
          inT = false;
          break;
        case 'p':
          closeP();
          break;
        case 'tc':
          closeCell();
          break;
        case 'tr':
          closeRow();
          break;
        case 'tbl':
          closeTbl();
          break;
      }
    },
    text(t) {
      if (inT && !skip) append(t);
    },
  });
  while (stack.length > 1) {
    const k = top().k;
    if (k === 'p') closeP();
    else if (k === 'cell') closeCell();
    else if (k === 'row') closeRow();
    else closeTbl();
  }
  return root.lines.join('\n');
}

// ───────────────────────── DOCX ─────────────────────────

/** Kiểu đoạn trong styles.xml: tiêu đề (heading N / outlineLvl) và kiểu danh sách (có numPr). */
function docxStyles(xml: string | undefined): Map<string, ParaStyle> {
  const map = new Map<string, ParaStyle>();
  if (!xml) return map;
  let cur: ParaStyle | null = null;
  walkXml(xml, {
    open(name, attrs) {
      if (name === 'style') {
        const id = attr(attrs, 'styleId');
        cur = attr(attrs, 'type') === 'paragraph' && id ? { level: 0, list: false } : null;
        if (cur && id) map.set(id, cur);
      } else if (cur && name === 'name') {
        const nm = (attr(attrs, 'val') ?? '').toLowerCase();
        const m = /^heading\s*(\d)$/.exec(nm);
        if (m) cur.level = Number(m[1]);
        else if (nm === 'title') cur.level = 1;
      } else if (cur && name === 'outlineLvl' && !cur.level) {
        const v = Number(attr(attrs, 'val'));
        if (Number.isInteger(v) && v >= 0 && v < 6) cur.level = v + 1;
      } else if (cur && name === 'numPr') cur.list = true;
    },
    close(name) {
      if (name === 'style') cur = null;
    },
  });
  return map;
}

function docxToText(zip: Map<string, Buffer>): Part {
  const main = mainPart(zip, 'word/document.xml');
  const xml = zipGet(zip, main);
  if (xml === undefined) throw new Error('Không tìm thấy word/document.xml — tệp DOCX không hợp lệ.');
  const dir = path.posix.dirname(main);
  const styles = docxStyles(zipGet(zip, `${dir}/styles.xml`));
  const styleOf = (id: string) => styles.get(id);
  const sections = [ooxmlToText(xml, 'docx', styleOf)];

  const listParts = (re: RegExp) =>
    [...zip.keys()].filter((k) => re.test(k)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const esc = dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const collect = (re: RegExp) => {
    const seen = new Set<string>();
    for (const part of listParts(re)) {
      const t = ooxmlToText(zipGet(zip, part) ?? '', 'docx', styleOf).trim();
      if (t) seen.add(t);
    }
    return [...seen];
  };
  const hf = collect(new RegExp(`^${esc}/(?:header|footer)\\d*\\.xml$`, 'i'));
  if (hf.length) sections.push(`## Đầu trang / chân trang\n${hf.join('\n')}`);
  const fn = collect(new RegExp(`^${esc}/(?:footnotes|endnotes)\\.xml$`, 'i'));
  if (fn.length) sections.push(`## Chú thích\n${fn.join('\n')}`);
  const cm = collect(new RegExp(`^${esc}/comments\\.xml$`, 'i'));
  if (cm.length) sections.push(`## Nhận xét\n${cm.join('\n')}`);
  return { text: sections.join('\n\n'), notes: [] };
}

// ───────────────────────── XLSX ─────────────────────────

function unescapeOoxml(s: string): string {
  return s.indexOf('_x') < 0 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function xlsxSharedStrings(xml: string | undefined): string[] {
  const out: string[] = [];
  if (!xml) return out;
  let cur: string | null = null;
  let inT = false;
  let rph = 0;
  walkXml(xml, {
    open(name, _a, self) {
      if (name === 'si') {
        cur = '';
        if (self) {
          out.push('');
          cur = null;
        }
      } else if (name === 't' && cur !== null && !self) inT = true;
      else if (name === 'rPh') rph++;
    },
    close(name) {
      if (name === 'si' && cur !== null) {
        out.push(unescapeOoxml(cur));
        cur = null;
      } else if (name === 't') inT = false;
      else if (name === 'rPh' && rph > 0) rph--;
    },
    text(t) {
      if (inT && rph === 0 && cur !== null) cur += t;
    },
  });
  return out;
}

function isDateFormat(id: number, code: string | undefined): boolean {
  if (code === undefined) {
    return (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58);
  }
  const c = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/[_*]./g, '')
    .replace(/\[(?!(?:h+|m+|s+)\])[^\]]*\]/gi, '');
  return /[dmyhs]/i.test(c) && !/^general$/i.test(c.trim());
}

function xlsxDateStyles(xml: string | undefined): boolean[] {
  if (!xml) return [];
  const fmts = new Map<number, string>();
  const xfs: number[] = [];
  let inXfs = false;
  walkXml(xml, {
    open(name, attrs, self) {
      if (name === 'numFmt') fmts.set(Number(attr(attrs, 'numFmtId')), attr(attrs, 'formatCode') ?? '');
      else if (name === 'cellXfs' && !self) inXfs = true;
      else if (name === 'xf' && inXfs) xfs.push(Number(attr(attrs, 'numFmtId') ?? 0) || 0);
    },
    close(name) {
      if (name === 'cellXfs') inXfs = false;
    },
  });
  return xfs.map((id) => isDateFormat(id, fmts.get(id)));
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(15)));
}

/** Số sê-ri ngày của Excel → ISO (YYYY-MM-DD[ HH:MM:SS]). */
function excelDate(v: number, d1904: boolean): string {
  if (!(v >= 0) || v > 2958465) return formatNumber(v);
  let days = Math.floor(v);
  const secs = Math.round((v - days) * 86400);
  if (!d1904 && days === 60) return '1900-02-29'; // ngày không tồn tại, do lỗi năm nhuận 1900 của Excel
  if (d1904) days += 1462;
  else if (days < 60) days += 1;
  const iso = new Date(Date.UTC(1899, 11, 30) + days * 86400000 + secs * 1000).toISOString();
  if (!d1904 && v < 1) return iso.slice(11, 19);
  return secs ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso.slice(0, 10);
}

function colIndex(ref: string): number | undefined {
  let n = 0;
  let i = 0;
  for (; i < ref.length; i++) {
    const c = ref.charCodeAt(i) | 32;
    if (c < 97 || c > 122) break;
    n = n * 26 + (c - 96);
  }
  return i ? n - 1 : undefined;
}

function cleanCell(s: string): string {
  return s.replace(/\s*(?:\r\n?|\n)\s*/g, ' / ').replace(/\t/g, ' ').trim();
}

interface SheetText {
  lines: string[];
  capped: boolean;
  wide: boolean;
  totalRows: number;
}

function xlsxSheet(xml: string, sst: string[], dateXf: boolean[], d1904: boolean): SheetText {
  const lines: string[] = [];
  let rows = 0;
  let capped = false;
  let wide = false;
  let cells: string[] | null = null;
  let col = 0;
  let ctype = 'n';
  let cstyle = 0;
  let v = '';
  let isText = '';
  let inV = false;
  let inIs = false;
  let inT = false;
  let rph = 0;
  const h: XmlHandlers = {};
  const finishRow = () => {
    const c = cells;
    cells = null;
    if (!c || !c.some((x) => x)) return;
    rows++;
    if (rows > XLSX_MAX_ROWS) {
      capped = true;
      h.stop = true;
      return;
    }
    const arr = Array.from(c, (x) => x ?? '');
    while (arr.length && !arr[arr.length - 1]) arr.pop();
    lines.push(arr.join(' | '));
  };
  const value = (): string => {
    switch (ctype) {
      case 's': {
        const i = Number(v);
        return v.trim() && Number.isInteger(i) ? sst[i] ?? '' : '';
      }
      case 'inlineStr':
        return unescapeOoxml(isText);
      case 'b':
        return v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : v;
      case 'e':
      case 'd':
        return v;
      case 'str':
        return unescapeOoxml(v);
      default: {
        if (!v.trim()) return isText ? unescapeOoxml(isText) : '';
        const num = Number(v);
        if (!Number.isFinite(num)) return v;
        return dateXf[cstyle] ? excelDate(num, d1904) : formatNumber(num);
      }
    }
  };
  h.open = (name, attrs, self) => {
    switch (name) {
      case 'row':
        cells = [];
        col = 0;
        break;
      case 'c': {
        const r = attr(attrs, 'r');
        const ci = r ? colIndex(r) : undefined;
        if (ci !== undefined) col = ci;
        ctype = attr(attrs, 't') ?? 'n';
        cstyle = Number(attr(attrs, 's') ?? 0) || 0;
        v = '';
        isText = '';
        break;
      }
      case 'v':
        if (!self) inV = true;
        break;
      case 'is':
        if (!self) inIs = true;
        break;
      case 't':
        if (inIs && !self) inT = true;
        break;
      case 'rPh':
        rph++;
        break;
    }
  };
  h.close = (name) => {
    switch (name) {
      case 'v':
        inV = false;
        break;
      case 'is':
        inIs = false;
        break;
      case 't':
        inT = false;
        break;
      case 'rPh':
        if (rph > 0) rph--;
        break;
      case 'c': {
        const val = cleanCell(value());
        if (val && cells) {
          if (col < XLSX_MAX_COLS) cells[col] = val;
          else wide = true;
        }
        col++;
        v = '';
        isText = '';
        break;
      }
      case 'row':
        finishRow();
        break;
    }
  };
  h.text = (t) => {
    if (inV) v += t;
    else if (inT && rph === 0) isText += t;
  };
  walkXml(xml, h);
  if (cells) finishRow();
  const totalRows = capped ? (xml.match(/<(?:[\w.-]+:)?row[\s>/]/g) ?? []).length : rows;
  return { lines, capped, wide, totalRows };
}

function xlsxToText(zip: Map<string, Buffer>): Part {
  const wbPath = mainPart(zip, 'xl/workbook.xml');
  const base = path.posix.dirname(wbPath);
  const wb = zipGet(zip, wbPath);
  const rels = parseRels(zipGet(zip, relsPathOf(wbPath)), base);
  const relOfType = (re: RegExp) => [...rels.values()].find((r) => re.test(r.type))?.target;
  const sst = xlsxSharedStrings(zipGet(zip, relOfType(/\/sharedStrings$/) ?? `${base}/sharedStrings.xml`));
  const dateXf = xlsxDateStyles(zipGet(zip, relOfType(/\/styles$/) ?? `${base}/styles.xml`));

  const sheets: { name: string; path?: string; hidden: boolean; chart: boolean }[] = [];
  let d1904 = false;
  if (wb) {
    walkXml(wb, {
      open(name, attrs) {
        if (name === 'sheet') {
          const rel = rels.get(relId(attrs) ?? '');
          const state = attr(attrs, 'state');
          sheets.push({
            name: attr(attrs, 'name') ?? `Sheet${sheets.length + 1}`,
            path: rel?.target,
            hidden: state === 'hidden' || state === 'veryHidden',
            chart: !!rel && !/\/worksheet$/.test(rel.type),
          });
        } else if (name === 'workbookPr') {
          const d = attr(attrs, 'date1904');
          d1904 = d === '1' || d === 'true';
        }
      },
    });
  }
  if (!sheets.length) {
    const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/worksheets/sheet(\\d+)\\.xml$`, 'i');
    const found = [...zip.keys()]
      .map((k) => ({ k, m: re.exec(k) }))
      .filter((x) => x.m)
      .sort((a, b) => Number(a.m![1]) - Number(b.m![1]));
    for (const f of found) sheets.push({ name: `Sheet${f.m![1]}`, path: f.k, hidden: false, chart: false });
  }
  if (!sheets.length) throw new Error('Không tìm thấy trang tính nào — tệp XLSX không hợp lệ.');

  const notes: string[] = [];
  const out: string[] = [];
  sheets.forEach((s, i) => {
    const title = `## ${s.name}${s.hidden ? ' (ẩn)' : ''}`;
    if (s.chart) {
      out.push(`${title}\n(trang biểu đồ — không có ô dữ liệu)`);
      return;
    }
    const xml = zipGet(zip, s.path ?? `${base}/worksheets/sheet${i + 1}.xml`);
    if (xml === undefined) {
      out.push(`${title}\n(không đọc được trang tính)`);
      return;
    }
    const r = xlsxSheet(xml, sst, dateXf, d1904);
    out.push(`${title}\n${r.lines.length ? r.lines.join('\n') : '(trống)'}`);
    if (r.capped) notes.push(`Trang tính "${s.name}": chỉ lấy ${fmtInt(XLSX_MAX_ROWS)}/~${fmtInt(r.totalRows)} dòng đầu`);
    if (r.wide) notes.push(`Trang tính "${s.name}": chỉ lấy ${XLSX_MAX_COLS} cột đầu`);
  });
  return { text: out.join('\n\n'), notes, pages: sheets.length };
}

// ───────────────────────── PPTX ─────────────────────────

function pptxToText(zip: Map<string, Buffer>): Part {
  const presPath = mainPart(zip, 'ppt/presentation.xml');
  const base = path.posix.dirname(presPath);
  const rels = parseRels(zipGet(zip, relsPathOf(presPath)), base);
  const slides: string[] = [];
  const pres = zipGet(zip, presPath);
  if (pres) {
    walkXml(pres, {
      open(name, attrs) {
        if (name !== 'sldId') return;
        const rel = rels.get(relId(attrs) ?? '');
        if (rel && /\/slide$/.test(rel.type)) slides.push(rel.target);
      },
    });
  }
  if (!slides.length) {
    const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/slides/slide(\\d+)\\.xml$`, 'i');
    slides.push(
      ...[...zip.keys()]
        .map((k) => ({ k, m: re.exec(k) }))
        .filter((x) => x.m)
        .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
        .map((x) => x.k),
    );
  }
  if (!slides.length) throw new Error('Không tìm thấy slide nào — tệp PPTX không hợp lệ.');

  const out = slides.map((sp, i) => {
    const xml = zipGet(zip, sp) ?? '';
    const hidden = /^[\s\S]{0,2000}?<(?:[\w.-]+:)?sld\b[^>]*\sshow\s*=\s*["'](?:0|false)["']/.test(xml);
    const body = ooxmlToText(xml, 'pptx').trim();
    let notes = '';
    const nrel = [...parseRels(zipGet(zip, relsPathOf(sp)), path.posix.dirname(sp)).values()].find((r) => /\/notesSlide$/.test(r.type));
    if (nrel) {
      const nx = zipGet(zip, nrel.target);
      if (nx) notes = ooxmlToText(nx, 'notes').trim();
    }
    let s = `## Slide ${i + 1}${hidden ? ' (ẩn)' : ''}`;
    if (body) s += `\n${body}`;
    if (notes) s += `\nGhi chú: ${notes}`;
    return s;
  });
  return { text: out.join('\n\n'), notes: [], pages: slides.length };
}

// ───────────────────────── PDF ─────────────────────────

async function extractPdf(file: string, size: number, maxChars: number, opts: ExtractOptions): Promise<Part> {
  const notes: string[] = [];
  if (opts.pdftotext !== false) {
    const cmd = typeof opts.pdftotext === 'string' && opts.pdftotext ? opts.pdftotext : 'pdftotext';
    const r = await runPdftotext(file, cmd);
    if (r.ok) {
      const pagesText = r.text.split('\f');
      if (pagesText.length > 1 && !pagesText[pagesText.length - 1].trim()) pagesText.pop();
      const pages = pagesText.length;
      if (r.timedOut) notes.push('pdftotext quá thời gian — nội dung có thể thiếu');
      const verdict = assessText(pagesText.join('\n'), 1, 0);
      if (verdict === 'empty') return { text: '', notes: [...notes, 'PDF dạng ảnh/scan (không có lớp chữ) — cần OCR'], pages };
      if (verdict === 'garbage') {
        return { text: '', notes: [...notes, 'PDF dạng ảnh/scan hoặc font không giải mã được — cần OCR'], pages };
      }
      return { text: joinPages(pagesText), notes, pages, partial: r.timedOut };
    }
    if (r.reason === 'timeout') notes.push('pdftotext quá thời gian — chuyển sang bộ đọc tích hợp');
    else if (r.reason === 'failed') notes.push(`pdftotext lỗi${r.detail ? ` (${r.detail})` : ''} — chuyển sang bộ đọc tích hợp`);
  }
  if (size > MAX_CONTAINER_BYTES) {
    return { text: '', notes: [...notes, `Tệp PDF quá lớn (${mb(size)}) cho bộ đọc tích hợp — cài pdftotext (Poppler) để trích xuất`] };
  }
  const res = pdfBuiltin(await fs.readFile(file), maxChars);
  return { ...res, notes: [...notes, ...res.notes] };
}

function joinPages(pages: string[]): string {
  if (pages.length <= 1) return pages[0] ?? '';
  return pages
    .map((t, i) => (t.trim() ? `## Trang ${i + 1}\n${t}` : ''))
    .filter(Boolean)
    .join('\n\n');
}

type PdftotextResult =
  | { ok: true; text: string; timedOut: boolean }
  | { ok: false; reason: 'missing' | 'failed' | 'timeout'; detail?: string };

const missingPdftotext = new Set<string>();

async function runPdftotext(file: string, cmd: string): Promise<PdftotextResult> {
  if (missingPdftotext.has(cmd)) return { ok: false, reason: 'missing' };
  const once = (bin: string) =>
    new Promise<PdftotextResult>((resolve) => {
      execFile(
        bin,
        ['-layout', '-enc', 'UTF-8', path.resolve(file), '-'],
        { encoding: 'buffer', timeout: PDF_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => {
          const out = Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout ?? ''));
          if (!err) return resolve({ ok: true, text: out.toString('utf8'), timedOut: false });
          const e = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null };
          if (e.code === 'ENOENT' || e.code === 'EACCES') return resolve({ ok: false, reason: 'missing' });
          const timedOut = !!e.killed || !!e.signal;
          if (out.length && out.toString('utf8').trim()) return resolve({ ok: true, text: out.toString('utf8'), timedOut });
          const detail = (Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr ?? '')).trim().split('\n')[0]?.slice(0, 160);
          resolve({ ok: false, reason: timedOut ? 'timeout' : 'failed', detail });
        },
      );
    });
  let r = await once(cmd);
  if (!r.ok && r.reason === 'missing' && process.platform === 'win32' && !/\.exe$/i.test(cmd)) r = await once(`${cmd}.exe`);
  if (!r.ok && r.reason === 'missing') missingPdftotext.add(cmd);
  return r;
}

/** Đánh giá chất lượng văn bản PDF: rỗng, rác (font không giải mã được) hay dùng được. */
function assessText(text: string, good: number, bad: number): 'ok' | 'empty' | 'garbage' {
  const vis = text.replace(/\s+/g, '');
  if (!vis.length) return 'empty';
  const letters = (vis.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const junk = (vis.match(/[\p{Cc}\p{Co}\p{Cn}\p{Cs}\ufffd]/gu) ?? []).length;
  if (junk / vis.length > 0.15 || letters / vis.length < 0.3) return 'garbage';
  if (bad > 0 && bad / (good + bad) > 0.5) return 'garbage';
  return 'ok';
}

const PDF_GARBAGE_NOTE = 'PDF dạng ảnh/scan hoặc font không giải mã được — cần OCR hoặc cài pdftotext (Poppler)';

function pdfBuiltin(buf: Buffer, maxChars: number): Part {
  const notes: string[] = [];
  let doc: PdfDoc;
  try {
    doc = new PdfDoc(buf);
  } catch (e) {
    return { text: '', notes: [`Không phân tích được PDF: ${errText(e)}`] };
  }
  let pages: PdfPage[] = [];
  try {
    pages = doc.pages();
  } catch {
    pages = [];
  }
  const pageCount = pages.length || undefined;
  if (doc.cryptState === 'password') return { text: '', notes: ['PDF được bảo vệ bằng mật khẩu mở — không trích xuất được'], pages: pageCount };
  if (doc.cryptState === 'unsupported') {
    return { text: '', notes: ['PDF dùng cơ chế mã hóa chưa hỗ trợ — cài pdftotext (Poppler) để trích xuất'], pages: pageCount };
  }
  if (!pages.length) return { text: '', notes: ['Không tìm thấy trang nào trong PDF (tệp hỏng hoặc không phải PDF)'] };

  const ctx: RunCtx = { sink: new TextSink(), ops: 0, forms: new Set(), good: 0, bad: 0, aborted: false };
  const out: string[] = [];
  let total = 0;
  let partial = false;
  let failed = 0;
  for (let i = 0; i < pages.length; i++) {
    if (total > maxChars * 1.2 + 1000) {
      notes.push(`Chỉ đọc ${i}/${pages.length} trang đầu (đã đủ giới hạn ký tự)`);
      partial = true;
      break;
    }
    ctx.sink = new TextSink();
    try {
      const content = doc.pageContent(pages[i].dict);
      if (content) doc.runContent(content, pages[i].res, newGState(), 0, ctx);
    } catch {
      failed++;
    }
    const t = ctx.sink.text();
    out.push(t);
    total += t.length;
    if (ctx.aborted) {
      notes.push(`Nội dung PDF quá phức tạp — dừng ở trang ${i + 1}/${pages.length}`);
      partial = true;
      break;
    }
  }
  if (failed) notes.push(`${failed} trang không đọc được (dữ liệu hỏng)`);
  if (doc.overBudget) notes.push('Vượt giới hạn giải nén của bộ đọc PDF — nội dung có thể thiếu');

  const verdict = assessText(out.join('\n'), ctx.good, ctx.bad);
  if (verdict !== 'ok') return { text: '', notes: [...notes, PDF_GARBAGE_NOTE], pages: pages.length };
  if (ctx.bad > 0 && ctx.bad / (ctx.good + ctx.bad) > 0.02) {
    const pct = Math.round((ctx.bad / (ctx.good + ctx.bad)) * 100);
    notes.push(`Khoảng ${pct || 1}% ký tự không giải mã được (font thiếu bảng ToUnicode) — nên cài pdftotext (Poppler) hoặc OCR`);
  }
  notes.push('Trích bằng bộ đọc PDF tích hợp (không có pdftotext) — bố cục có thể lệch');
  const text = joinPages(out.map((t) => t.replace(/[\ue000-\uf8ff]/g, '')));
  return { text, notes, pages: pages.length, partial };
}

// ---- Giá trị & bộ phân tích từ vựng PDF ----

interface PName { readonly n: string }
interface PStr { readonly s: string } // chuỗi byte: mỗi ký tự là một byte (latin1)
interface PRef { readonly r: number; readonly g: number }
interface POp { readonly op: string }
type PDict = Map<string, PVal>;
type PVal = number | boolean | null | PName | PStr | PRef | PDict | PVal[];
type PTok = number | PName | PStr | POp;

const isPlain = (v: unknown): v is object => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Map);
const isName = (v: unknown): v is PName => isPlain(v) && 'n' in v;
const isStr = (v: unknown): v is PStr => isPlain(v) && 's' in v;
const isRef = (v: unknown): v is PRef => isPlain(v) && 'r' in v;
const isOp = (v: unknown): v is POp => isPlain(v) && 'op' in v;
const isDict = (v: unknown): v is PDict => v instanceof Map;
const nameOf = (v: unknown): string | undefined => (isName(v) ? v.n : undefined);
const numOf = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const WS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of '()<>[]{}/%') DELIM[c.charCodeAt(0)] = 1;

const OP_CACHE = new Map<string, POp>();
function opTok(s: string): POp {
  let t = OP_CACHE.get(s);
  if (!t) {
    t = { op: s };
    if (OP_CACHE.size < 512) OP_CACHE.set(s, t);
  }
  return t;
}

function hexVal(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  if (c >= 97 && c <= 102) return c - 87;
  return -1;
}

class Lexer {
  pos: number;
  /** Nhận diện tham chiếu "n g R" (tắt cho content stream để nhanh hơn). */
  refs = true;
  constructor(readonly s: string, pos = 0, readonly end = s.length) {
    this.pos = pos;
  }

  private skipWs(): void {
    const s = this.s;
    let p = this.pos;
    while (p < this.end) {
      const c = s.charCodeAt(p);
      if (c === 37) {
        while (p < this.end && s.charCodeAt(p) !== 10 && s.charCodeAt(p) !== 13) p++;
        continue;
      }
      if (!WS[c]) break;
      p++;
    }
    this.pos = p;
  }

  next(): PTok | undefined {
    this.skipWs();
    const s = this.s;
    const p = this.pos;
    if (p >= this.end) return undefined;
    const c = s.charCodeAt(p);
    switch (c) {
      case 40:
        return this.litString();
      case 60:
        if (s.charCodeAt(p + 1) === 60) {
          this.pos = p + 2;
          return opTok('<<');
        }
        return this.hexString();
      case 62:
        this.pos = s.charCodeAt(p + 1) === 62 ? p + 2 : p + 1;
        return opTok('>>');
      case 91:
      case 93:
      case 123:
      case 125:
      case 41:
        this.pos = p + 1;
        return opTok(s[p]);
      case 47: {
        let q = p + 1;
        while (q < this.end) {
          const ch = s.charCodeAt(q);
          if (WS[ch] || DELIM[ch]) break;
          q++;
        }
        this.pos = q;
        let n = s.slice(p + 1, q);
        if (n.includes('#')) n = n.replace(/#([0-9a-fA-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
        return { n };
      }
    }
    let q = p;
    while (q < this.end) {
      const ch = s.charCodeAt(q);
      if (WS[ch] || DELIM[ch]) break;
      q++;
    }
    if (q === p) {
      this.pos = p + 1;
      return opTok(s[p]);
    }
    this.pos = q;
    const w = s.slice(p, q);
    if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) {
      const num = Number(w);
      if (!Number.isNaN(num)) return num;
      const f = parseFloat(w);
      if (!Number.isNaN(f)) return f;
    }
    return opTok(w);
  }

  private litString(): PStr {
    const s = this.s;
    let p = this.pos + 1;
    let depth = 1;
    let out = '';
    let run = p;
    while (p < this.end) {
      const c = s.charCodeAt(p);
      if (c === 92) {
        out += s.slice(run, p);
        const n = s.charCodeAt(p + 1);
        p += 2;
        switch (n) {
          case 110: out += '\n'; break;
          case 114: out += '\r'; break;
          case 116: out += '\t'; break;
          case 98: out += '\b'; break;
          case 102: out += '\f'; break;
          case 13:
            if (s.charCodeAt(p) === 10) p++;
            break;
          case 10:
            break;
          default:
            if (n >= 48 && n <= 55) {
              let v = n - 48;
              for (let k = 0; k < 2; k++) {
                const d = s.charCodeAt(p);
                if (d >= 48 && d <= 55) {
                  v = v * 8 + d - 48;
                  p++;
                } else break;
              }
              out += String.fromCharCode(v & 255);
            } else if (!Number.isNaN(n)) out += String.fromCharCode(n);
        }
        run = p;
        continue;
      }
      if (c === 40) depth++;
      else if (c === 41 && --depth === 0) break;
      p++;
    }
    out += s.slice(run, Math.min(p, this.end));
    this.pos = Math.min(p + 1, this.end);
    return { s: out };
  }

  private hexString(): PStr {
    const s = this.s;
    let p = this.pos + 1;
    let out = '';
    let hi = -1;
    while (p < this.end) {
      const c = s.charCodeAt(p++);
      if (c === 62) break;
      const v = hexVal(c);
      if (v < 0) continue;
      if (hi < 0) hi = v;
      else {
        out += String.fromCharCode(hi * 16 + v);
        hi = -1;
      }
    }
    if (hi >= 0) out += String.fromCharCode(hi * 16);
    this.pos = p;
    return { s: out };
  }

  /** Bỏ qua dữ liệu ảnh nội tuyến sau toán tử ID cho tới "EI". */
  skipInlineImage(): void {
    let p = this.pos + 1;
    for (;;) {
      const i = this.s.indexOf('EI', p);
      if (i < 0 || i >= this.end) {
        this.pos = this.end;
        return;
      }
      const after = i + 2 < this.end ? this.s.charCodeAt(i + 2) : 32;
      if (WS[this.s.charCodeAt(i - 1)] && (WS[after] || DELIM[after])) {
        this.pos = i + 2;
        return;
      }
      p = i + 2;
    }
  }
}

function valueFrom(lx: Lexer, t: PTok, depth: number): PVal | POp {
  if (typeof t === 'number') {
    if (lx.refs && Number.isInteger(t) && t >= 0) {
      const save = lx.pos;
      const t2 = lx.next();
      if (typeof t2 === 'number' && Number.isInteger(t2) && t2 >= 0) {
        const t3 = lx.next();
        if (isOp(t3) && t3.op === 'R') return { r: t, g: t2 };
      }
      lx.pos = save;
    }
    return t;
  }
  if (!isOp(t)) return t;
  switch (t.op) {
    case '[': {
      const arr: PVal[] = [];
      for (;;) {
        const x = lx.next();
        if (x === undefined || (isOp(x) && x.op === ']')) break;
        if (depth > 64) continue;
        const v = valueFrom(lx, x, depth + 1);
        if (isOp(v)) break;
        arr.push(v);
      }
      return arr;
    }
    case '<<': {
      const d: PDict = new Map();
      for (;;) {
        const k = lx.next();
        if (k === undefined || (isOp(k) && k.op === '>>')) break;
        if (!isName(k)) {
          if (isOp(k)) break;
          continue;
        }
        const x = lx.next();
        if (x === undefined) break;
        if (isOp(x) && x.op === '>>') break;
        if (depth > 64) continue;
        const v = valueFrom(lx, x, depth + 1);
        if (isOp(v)) break;
        d.set(k.n, v);
      }
      return d;
    }
    case 'true':
      return true;
    case 'false':
      return false;
    case 'null':
      return null;
    default:
      return t;
  }
}

function readValue(lx: Lexer): PVal | POp | undefined {
  const t = lx.next();
  return t === undefined ? undefined : valueFrom(lx, t, 0);
}

// ---- Bộ lọc stream ----

/** Giải nén Flate; 'big' = vượt giới hạn dung lượng, null = dữ liệu hỏng. */
function inflatePdf(data: Buffer, cap: number): Buffer | null | 'big' {
  const o = { maxOutputLength: Math.max(1, cap) };
  try {
    return zlib.inflateSync(data, o);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') return 'big';
  }
  try {
    return zlib.inflateSync(data, { ...o, finishFlush: zlib.constants.Z_SYNC_FLUSH }); // stream bị cụt
  } catch {
    /* thử raw deflate */
  }
  try {
    return zlib.inflateRawSync(data, { ...o, finishFlush: zlib.constants.Z_SYNC_FLUSH });
  } catch {
    return null;
  }
}

function pngUnpredict(data: Buffer, colors: number, bpc: number, columns: number): Buffer {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  if (rowLen <= 0) return data;
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = Buffer.alloc(rows * rowLen);
  let prev = Buffer.alloc(rowLen);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowLen + 1)];
    const src = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const cur = out.subarray(r * rowLen, (r + 1) * rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  return out;
}

function asciiHexDecode(data: Buffer): Buffer {
  const out: number[] = [];
  let hi = -1;
  for (const c of data) {
    if (c === 62) break;
    const v = hexVal(c);
    if (v < 0) continue;
    if (hi < 0) hi = v;
    else {
      out.push(hi * 16 + v);
      hi = -1;
    }
  }
  if (hi >= 0) out.push(hi * 16);
  return Buffer.from(out);
}

function ascii85Decode(data: Buffer): Buffer {
  const out: number[] = [];
  let tuple = 0;
  let count = 0;
  let i = 0;
  if (data[0] === 60 && data[1] === 126) i = 2; // "<~"
  for (; i < data.length; i++) {
    const c = data[i];
    if (c === 126) break; // "~>"
    if (c <= 32) continue;
    if (c === 122 && count === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (c < 33 || c > 117) continue;
    tuple = tuple * 85 + (c - 33);
    if (++count === 5) {
      out.push((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255);
      tuple = 0;
      count = 0;
    }
  }
  if (count > 1) {
    for (let k = count; k < 5; k++) tuple = tuple * 85 + 84;
    const bytes = [(tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255];
    out.push(...bytes.slice(0, count - 1));
  }
  return Buffer.from(out);
}

function lzwDecode(data: Buffer, earlyChange: number, cap: number): Buffer | null {
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const first = new Uint8Array(4096);
  const length = new Uint16Array(4096);
  for (let i = 0; i < 256; i++) {
    prefix[i] = -1;
    suffix[i] = i;
    first[i] = i;
    length[i] = 1;
  }
  let out = Buffer.alloc(Math.min(cap, Math.max(1024, data.length * 4)));
  let o = 0;
  let next = 258;
  let codeLen = 9;
  let prev = -1;
  let bitBuf = 0;
  let bitCnt = 0;
  let ip = 0;
  const emit = (code: number): boolean => {
    const len = length[code];
    if (o + len > out.length) {
      if (o + len > cap) return false;
      const bigger = Buffer.alloc(Math.min(cap, Math.max(out.length * 2, o + len)));
      out.copy(bigger, 0, 0, o);
      out = bigger;
    }
    let c = code;
    for (let k = len - 1; k >= 0; k--) {
      out[o + k] = suffix[c];
      c = prefix[c];
    }
    o += len;
    return true;
  };
  for (;;) {
    while (bitCnt < codeLen && ip < data.length) {
      bitBuf = ((bitBuf << 8) | data[ip++]) >>> 0;
      bitCnt += 8;
    }
    if (bitCnt < codeLen) break;
    const code = (bitBuf >>> (bitCnt - codeLen)) & ((1 << codeLen) - 1);
    bitCnt -= codeLen;
    bitBuf &= (1 << bitCnt) - 1;
    if (code === 256) {
      next = 258;
      codeLen = 9;
      prev = -1;
      continue;
    }
    if (code === 257) break;
    if (prev < 0) {
      if (code > 255 || !emit(code)) break;
      prev = code;
      continue;
    }
    if (code > next || next >= 4096) break;
    const fb = code < next ? first[code] : first[prev];
    prefix[next] = prev;
    suffix[next] = fb;
    first[next] = first[prev];
    length[next] = length[prev] + 1;
    next++;
    if (!emit(code)) break;
    if (next + earlyChange >= 1 << codeLen && codeLen < 12) codeLen++;
    prev = code;
  }
  return out.subarray(0, o);
}

// ---- Mã hóa (Standard security handler, mật khẩu mở rỗng) ----

const PW_PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');

function md5(...parts: Buffer[]): Buffer {
  return crypto.createHash('md5').update(Buffer.concat(parts)).digest();
}

function rc4(key: Buffer, data: Buffer): Buffer {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 255;
    const t = S[i];
    S[i] = S[j];
    S[j] = t;
  }
  const out = Buffer.alloc(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + S[i]) & 255;
    const t = S[i];
    S[i] = S[j];
    S[j] = t;
    out[k] = data[k] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

/** Thuật toán 2.B (PDF 2.0, R6). */
function hash2B(pw: Buffer, salt: Buffer, udata: Buffer): Buffer {
  let k = crypto.createHash('sha256').update(Buffer.concat([pw, salt, udata])).digest();
  let e = Buffer.alloc(0);
  for (let i = 0; i < 64 || e[e.length - 1] > i - 32; i++) {
    if (i > 2048) break;
    const k1 = Buffer.concat([pw, k, udata]);
    const block = Buffer.alloc(k1.length * 64);
    for (let j = 0; j < 64; j++) k1.copy(block, j * k1.length);
    const c = crypto.createCipheriv('aes-128-cbc', k.subarray(0, 16), k.subarray(16, 32));
    c.setAutoPadding(false);
    e = Buffer.concat([c.update(block), c.final()]);
    let sum = 0;
    for (let j = 0; j < 16; j++) sum += e[j];
    k = crypto.createHash(['sha256', 'sha384', 'sha512'][sum % 3]).update(e).digest();
  }
  return k.subarray(0, 32);
}

class PdfCrypt {
  constructor(
    private readonly key: Buffer,
    private readonly mode: 'rc4' | 'aes128' | 'aes256',
  ) {}

  decrypt(data: Buffer, num: number, gen: number): Buffer {
    let key = this.key;
    if (this.mode !== 'aes256') {
      const ext = Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]);
      key = md5(this.key, ext, this.mode === 'aes128' ? Buffer.from('sAlT', 'latin1') : Buffer.alloc(0)).subarray(
        0,
        Math.min(this.key.length + 5, 16),
      );
    }
    if (this.mode === 'rc4') return rc4(key, data);
    if (data.length < 32) return Buffer.alloc(0);
    const iv = data.subarray(0, 16);
    const body = data.subarray(16, 16 + Math.floor((data.length - 16) / 16) * 16);
    const algo = this.mode === 'aes128' ? 'aes-128-cbc' : 'aes-256-cbc';
    try {
      const d = crypto.createDecipheriv(algo, key, iv);
      return Buffer.concat([d.update(body), d.final()]);
    } catch {
      try {
        const d = crypto.createDecipheriv(algo, key, iv);
        d.setAutoPadding(false);
        return Buffer.concat([d.update(body), d.final()]);
      } catch {
        return Buffer.alloc(0);
      }
    }
  }
}

// ---- Bảng mã font đơn (simple font) ----

type EncTable = (string | undefined)[];

const WIN_ANSI: EncTable = (() => {
  const t: EncTable = new Array(256).fill(undefined);
  for (let i = 32; i < 127; i++) t[i] = String.fromCharCode(i);
  for (let i = 0; i < 32; i++) {
    const ch = CP1252_HI[i];
    if (ch && ch.charCodeAt(0) >= 0xa0) t[0x80 + i] = ch;
  }
  for (let i = 0xa0; i < 256; i++) t[i] = String.fromCharCode(i);
  t[0xa0] = ' ';
  return t;
})();

const MAC_ROMAN_HI =
  'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»…\u00a0ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ\uf8ffÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';

const MAC_ROMAN: EncTable = (() => {
  const t: EncTable = new Array(256).fill(undefined);
  for (let i = 32; i < 127; i++) t[i] = String.fromCharCode(i);
  for (let i = 0; i < 128; i++) t[0x80 + i] = MAC_ROMAN_HI[i];
  return t;
})();

const STANDARD: EncTable = (() => {
  const t: EncTable = new Array(256).fill(undefined);
  for (let i = 32; i < 127; i++) t[i] = String.fromCharCode(i);
  t[0x27] = '’';
  t[0x60] = '‘';
  const hi: Record<number, string> = {
    0xa1: '¡', 0xa2: '¢', 0xa3: '£', 0xa4: '⁄', 0xa5: '¥', 0xa6: 'ƒ', 0xa7: '§', 0xa8: '¤', 0xa9: "'", 0xaa: '“',
    0xab: '«', 0xac: '‹', 0xad: '›', 0xae: 'ﬁ', 0xaf: 'ﬂ', 0xb1: '–', 0xb2: '†', 0xb3: '‡', 0xb4: '·', 0xb6: '¶',
    0xb7: '•', 0xb8: '‚', 0xb9: '„', 0xba: '”', 0xbb: '»', 0xbc: '…', 0xbd: '‰', 0xbf: '¿', 0xc1: '`', 0xc2: '´',
    0xc3: 'ˆ', 0xc4: '˜', 0xc5: '¯', 0xc6: '˘', 0xc7: '˙', 0xc8: '¨', 0xca: '˚', 0xcb: '¸', 0xcd: '˝', 0xce: '˛',
    0xcf: 'ˇ', 0xd0: '—', 0xe1: 'Æ', 0xe3: 'ª', 0xe8: 'Ł', 0xe9: 'Ø', 0xea: 'Œ', 0xeb: 'º', 0xf1: 'æ', 0xf5: 'ı',
    0xf8: 'ł', 0xf9: 'ø', 0xfa: 'œ', 0xfb: 'ß',
  };
  for (const [k, v] of Object.entries(hi)) t[Number(k)] = v;
  return t;
})();

const GLYPHS: Record<string, string> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&',
  quotesingle: "'", quoteright: '’', parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',',
  hyphen: '-', minus: '−', period: '.', slash: '/', zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9', colon: ':', semicolon: ';', less: '<', equal: '=',
  greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^',
  underscore: '_', grave: '`', quoteleft: '‘', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~',
  exclamdown: '¡', cent: '¢', sterling: '£', currency: '¤', yen: '¥', brokenbar: '¦', section: '§',
  dieresis: '¨', copyright: '©', ordfeminine: 'ª', guillemotleft: '«', guillemetleft: '«', logicalnot: '¬',
  registered: '®', macron: '¯', degree: '°', plusminus: '±', twosuperior: '²', threesuperior: '³', acute: '´',
  mu: 'µ', paragraph: '¶', periodcentered: '·', cedilla: '¸', onesuperior: '¹', ordmasculine: 'º',
  guillemotright: '»', guillemetright: '»', onequarter: '¼', onehalf: '½', threequarters: '¾',
  questiondown: '¿', multiply: '×', divide: '÷', AE: 'Æ', ae: 'æ', OE: 'Œ', oe: 'œ', Oslash: 'Ø', oslash: 'ø',
  germandbls: 'ß', Eth: 'Ð', eth: 'ð', Thorn: 'Þ', thorn: 'þ', dotlessi: 'ı', Lslash: 'Ł', lslash: 'ł',
  Dcroat: 'Đ', dcroat: 'đ', Dslash: 'Đ', dmacron: 'đ', quotesinglbase: '‚', quotedblbase: '„',
  quotedblleft: '“', quotedblright: '”', ellipsis: '…', endash: '–', emdash: '—', bullet: '•', dagger: '†',
  daggerdbl: '‡', perthousand: '‰', guilsinglleft: '‹', guilsinglright: '›', trademark: '™', florin: 'ƒ',
  fraction: '⁄', circumflex: 'ˆ', tilde: '˜', breve: '˘', dotaccent: '˙', ring: '˚', hungarumlaut: '˝',
  ogonek: '˛', caron: 'ˇ', Euro: '€', fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', nbspace: '\u00a0',
  nonbreakingspace: '\u00a0', sfthyphen: '\u00ad', softhyphen: '\u00ad', arrowleft: '←', arrowright: '→',
  arrowup: '↑', arrowdown: '↓', lessequal: '≤', greaterequal: '≥', notequal: '≠', infinity: '∞',
  approxequal: '≈', checkmark: '✓', numero: '№', degreesign: '°',
};

const ACCENT_SUFFIXES: [string, string][] = [
  ['circumflex', '\u0302'], ['hookabove', '\u0309'], ['dieresis', '\u0308'], ['dotaccent', '\u0307'],
  ['dotbelow', '\u0323'], ['hungarumlaut', '\u030b'], ['commaaccent', '\u0326'], ['cedilla', '\u0327'],
  ['ogonek', '\u0328'], ['macron', '\u0304'], ['breve', '\u0306'], ['caron', '\u030c'], ['acute', '\u0301'],
  ['grave', '\u0300'], ['tilde', '\u0303'], ['ring', '\u030a'], ['horn', '\u031b'],
];

/** Tên glyph Adobe → Unicode (bảng rút gọn + uniXXXX/uXXXX + chữ có dấu kiểu "ecircumflexacute"). */
function glyphToUnicode(raw: string): string | undefined {
  const name = raw.split('.')[0];
  if (!name) return undefined;
  if (name.includes('_')) {
    const parts = name.split('_').map((p) => glyphToUnicode(p));
    return parts.every((p) => p !== undefined) ? parts.join('') : undefined;
  }
  const g = GLYPHS[name];
  if (g !== undefined) return g;
  if (/^[A-Za-z]$/.test(name)) return name;
  let m = /^uni((?:[0-9A-Fa-f]{4})+)$/.exec(name);
  if (m) {
    let s = '';
    for (let i = 0; i < m[1].length; i += 4) s += String.fromCharCode(parseInt(m[1].slice(i, i + 4), 16));
    return s;
  }
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (m) {
    const cp = parseInt(m[1], 16);
    return cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? String.fromCodePoint(cp) : undefined;
  }
  let base = name;
  const marks: string[] = [];
  outer: while (base.length > 1) {
    for (const [suf, mark] of ACCENT_SUFFIXES) {
      if (base.length > suf.length && base.endsWith(suf)) {
        marks.unshift(mark);
        base = base.slice(0, -suf.length);
        continue outer;
      }
    }
    break;
  }
  if (marks.length) {
    const b = /^[A-Za-z]$/.test(base) ? base : base === 'dotlessi' ? 'ı' : undefined;
    if (b) return (b + marks.join('')).normalize('NFC');
  }
  return undefined;
}

function utf16be(s: string): string {
  if (s.length % 2 === 1) return s;
  let out = '';
  for (let i = 0; i + 1 < s.length; i += 2) out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
  return out;
}

function pdfTextString(s: string): string {
  if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) return utf16be(s.slice(2));
  if (s.startsWith('\u00ef\u00bb\u00bf')) return Buffer.from(s.slice(3), 'latin1').toString('utf8');
  return s;
}

// ---- CMap (ToUnicode) ----

interface CodeRange { len: number; lo: number; hi: number }
interface ParsedCMap { map: Map<number, string>; ranges: CodeRange[] }

function bytesToInt(s: string): number {
  let v = 0;
  for (let i = 0; i < s.length; i++) v = v * 256 + s.charCodeAt(i);
  return v;
}

const CMAP_MAX_ENTRIES = 1 << 20;

function parseCMap(data: string): ParsedCMap {
  const lx = new Lexer(data);
  lx.refs = false;
  const map = new Map<number, string>();
  const ranges: CodeRange[] = [];
  let mode = '';
  let ops: PVal[] = [];
  for (;;) {
    const t = lx.next();
    if (t === undefined) break;
    if (isOp(t)) {
      switch (t.op) {
        case '[':
        case '<<': {
          const v = valueFrom(lx, t, 0);
          if (mode && !isOp(v)) ops.push(v);
          break;
        }
        case 'begincodespacerange':
        case 'beginbfchar':
        case 'beginbfrange':
          mode = t.op;
          ops = [];
          break;
        case 'endcodespacerange':
          for (let i = 0; i + 1 < ops.length; i += 2) {
            const lo = ops[i], hi = ops[i + 1];
            if (isStr(lo) && isStr(hi) && lo.s.length >= 1 && lo.s.length <= 4) {
              ranges.push({ len: lo.s.length, lo: bytesToInt(lo.s), hi: bytesToInt(hi.s) });
            }
          }
          mode = '';
          break;
        case 'endbfchar':
          for (let i = 0; i + 1 < ops.length && map.size < CMAP_MAX_ENTRIES; i += 2) {
            const src = ops[i], dst = ops[i + 1];
            if (!isStr(src) || src.s.length > 4) continue;
            const u = isStr(dst) ? utf16be(dst.s) : isName(dst) ? glyphToUnicode(dst.n) : undefined;
            if (u !== undefined) map.set(bytesToInt(src.s), u);
          }
          mode = '';
          break;
        case 'endbfrange':
          for (let i = 0; i + 2 < ops.length; i += 3) {
            const lo = ops[i], hi = ops[i + 1], dst = ops[i + 2];
            if (!isStr(lo) || !isStr(hi) || lo.s.length > 4) continue;
            const a = bytesToInt(lo.s), b = bytesToInt(hi.s);
            if (b < a || b - a > 0xffff || map.size + (b - a) > CMAP_MAX_ENTRIES) continue;
            if (isStr(dst)) {
              const base = utf16be(dst.s);
              if (!base) continue;
              const head = base.slice(0, -1);
              const last = base.charCodeAt(base.length - 1);
              for (let c = a; c <= b; c++) map.set(c, head + String.fromCharCode((last + c - a) & 0xffff));
            } else if (Array.isArray(dst)) {
              for (let c = a; c <= b && c - a < dst.length; c++) {
                const d = dst[c - a];
                if (isStr(d)) map.set(c, utf16be(d.s));
              }
            }
          }
          mode = '';
          break;
      }
      continue;
    }
    if (mode) ops.push(t);
  }
  return { map, ranges };
}

// ---- Font ----

class PdfFont {
  composite = false;
  ranges: CodeRange[] | null = null;
  toUni: Map<number, string> | null = null;
  enc: EncTable | null = WIN_ANSI;
  ucs2 = false;
  firstChar = 0;
  widths: (number | undefined)[] | null = null;
  missing = 0;
  dw = 1000;
  cidW: Map<number, number> | null = null;
  cidRanges: [number, number, number][] = [];
  scale = 0.001;
  widthsKnown = true;

  split(s: string): number[] {
    const out: number[] = [];
    if (!this.composite) {
      for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
      return out;
    }
    if (!this.ranges) {
      for (let i = 0; i + 1 < s.length; i += 2) out.push((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
      return out;
    }
    for (let i = 0; i < s.length; ) {
      let took = 0;
      for (let len = 1; len <= 4 && !took && i + len <= s.length; len++) {
        let code = 0;
        for (let k = 0; k < len; k++) code = code * 256 + s.charCodeAt(i + k);
        for (const r of this.ranges) {
          if (r.len === len && code >= r.lo && code <= r.hi) {
            out.push(code);
            took = len;
            break;
          }
        }
      }
      if (!took) {
        out.push(s.charCodeAt(i));
        took = 1;
      }
      i += took;
    }
    return out;
  }

  unicode(code: number): string | undefined {
    const u = this.toUni?.get(code);
    if (u !== undefined) return u;
    if (this.composite) return this.ucs2 ? String.fromCharCode(code) : undefined;
    return this.enc ? this.enc[code] : undefined;
  }

  width(code: number): number {
    if (this.composite) {
      const w = this.cidW?.get(code);
      if (w !== undefined) return w;
      for (const [lo, hi, w2] of this.cidRanges) if (code >= lo && code <= hi) return w2;
      return this.dw;
    }
    const w = this.widths ? this.widths[code - this.firstChar] : undefined;
    return w !== undefined ? w : this.missing || 500;
  }
}

const DEFAULT_FONT = (() => {
  const f = new PdfFont();
  f.widthsKnown = false;
  return f;
})();

// ---- Thông dịch nội dung trang ----

type Mat = [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];

function mul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function translate(tx: number, ty: number, m: Mat): Mat {
  return [m[0], m[1], m[2], m[3], tx * m[0] + ty * m[2] + m[4], tx * m[1] + ty * m[3] + m[5]];
}

function lastNums(ops: PVal[], k: number): number[] | null {
  if (ops.length < k) return null;
  const out: number[] = [];
  for (let i = ops.length - k; i < ops.length; i++) {
    const v = ops[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}

interface GState { ctm: Mat; font: PdfFont | null; size: number; tc: number; tw: number; th: number; tl: number }

function newGState(): GState {
  return { ctm: IDENT, font: null, size: 12, tc: 0, tw: 0, th: 1, tl: 0 };
}

interface McEntry { actual: string | null; done: boolean }

interface RunCtx {
  sink: TextSink;
  ops: number;
  forms: Set<number>;
  good: number;
  bad: number;
  aborted: boolean;
}

interface Chunk { x0: number; x1: number; text: string; size: number; known: boolean }
interface Line { base: number; size: number; dx: number; dy: number; chunks: Chunk[] }

const LINE_LOOKBACK = 8;
/** Dấu đầu dòng của font Symbol/Wingdings nằm trong vùng Private Use (U+F0xx). */
const PUA_BULLETS = /[\uf0b7\uf0a7\uf076\uf0d8\uf0fc\uf06e\uf0a8\uf0de\uf0e0\uf0f0\uf02d]/g;

/**
 * Gom các đoạn chữ thành dòng theo đường cơ sở rồi sắp theo trục x khi xuất.
 * Cần thiết vì nhiều trình tạo PDF (LibreOffice, Word) vẽ các ký tự tiếng Việt thuộc
 * font con thứ hai ở lượt riêng, quay lại chèn vào khoảng trống trên cùng dòng.
 */
class TextSink {
  private lines: Line[] = [];

  add(sx: number, sy: number, ex: number, ey: number, dx: number, dy: number, size: number, text: string, known: boolean): void {
    if (!text) return;
    const base = sy * dx - sx * dy;
    const x0 = sx * dx + sy * dy;
    const x1 = Math.max(x0, ex * dx + ey * dy);
    const chunk: Chunk = { x0, x1, text, size, known };
    for (let i = this.lines.length - 1; i >= 0 && i >= this.lines.length - LINE_LOOKBACK; i--) {
      const l = this.lines[i];
      if (l.dx * dx + l.dy * dy < 0.99) continue;
      if (Math.abs(l.base - base) <= Math.max(l.size, size) * 0.5) {
        l.chunks.push(chunk);
        if (size > l.size) l.size = size;
        return;
      }
    }
    this.lines.push({ base, size, dx, dy, chunks: [chunk] });
  }

  text(): string {
    const out: string[] = [];
    let prev: Line | null = null;
    for (const l of this.lines) {
      const cs = l.chunks.map((c, i) => ({ c, i })).sort((a, b) => a.c.x0 - b.c.x0 || a.i - b.i).map((x) => x.c);
      let line = '';
      let last: Chunk | null = null;
      for (const c of cs) {
        if (last) {
          // bỏ bản vẽ trùng (đổ bóng, chữ đậm giả)
          if (c.text === last.text && Math.abs(c.x0 - last.x0) < c.size * 0.1) continue;
          const gap = c.x0 - last.x1;
          const ref = Math.max(c.size, last.size) || 1;
          const known = c.known && last.known;
          if (!/\s$/.test(line) && !/^\s/.test(c.text)) {
            if (known && gap > ref * 2.5) line += ' | ';
            else if (gap > ref * (known ? 0.15 : 0.35)) line += ' ';
          }
        }
        line += c.text;
        last = !last || c.x1 >= last.x1 ? c : last;
      }
      if (prev) {
        const sameDir = prev.dx * l.dx + prev.dy * l.dy > 0.99;
        out.push(sameDir && Math.abs(prev.base - l.base) > Math.max(prev.size, l.size) * 2.5 ? '\n\n' : '\n');
      }
      out.push(line);
      prev = l;
    }
    return out.join('');
  }
}

interface PObj {
  pos: number;
  gen: number;
  val: PVal;
  stm?: { start: number; end: number };
}

interface PdfPage { dict: PDict; res: PDict | null }

class PdfDoc {
  readonly s: string;
  readonly objs = new Map<number, PObj>();
  readonly trailer: PDict = new Map();
  cryptState: 'none' | 'ok' | 'password' | 'unsupported' = 'none';
  overBudget = false;
  private crypt: PdfCrypt | null = null;
  private decoded = 0;
  private readonly streamCache = new Map<number, Buffer | null>();
  private readonly fontCache = new Map<number, PdfFont>();
  private readonly dictFontCache = new WeakMap<PDict, PdfFont>();

  constructor(private readonly buf: Buffer) {
    this.s = buf.toString('latin1');
    this.scanObjects();
    this.readTrailer();
    this.initCrypt();
    this.expandObjStms();
    this.ensureRoot();
  }

  resolve(v: PVal | undefined): PVal {
    let x: PVal | undefined = v;
    for (let guard = 0; isRef(x) && guard < 32; guard++) x = this.objs.get(x.r)?.val ?? null;
    return isRef(x) ? null : (x ?? null);
  }

  get(d: PDict | null | undefined, key: string): PVal {
    return d ? this.resolve(d.get(key)) : null;
  }

  private scanObjects(): void {
    const s = this.s;
    const re = /(\d+)[ \t\r\n\f\0]+(\d+)[ \t\r\n\f\0]+obj\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const num = Number(m[1]);
      const gen = Number(m[2]);
      const lx = new Lexer(s, re.lastIndex);
      let val: PVal | POp | undefined;
      try {
        val = readValue(lx);
      } catch {
        continue;
      }
      if (val === undefined) continue;
      if (isOp(val)) {
        if (val.op === 'endobj') this.objs.set(num, { pos: m.index, gen, val: null });
        continue;
      }
      const obj: PObj = { pos: m.index, gen, val };
      const save = lx.pos;
      const kw = lx.next();
      if (isOp(kw) && kw.op === 'stream' && isDict(val)) {
        let p = lx.pos;
        if (s.charCodeAt(p) === 13) p++;
        if (s.charCodeAt(p) === 10) p++;
        const len = val.get('Length');
        let end = -1;
        if (typeof len === 'number' && len >= 0 && p + len <= s.length && /^[\r\n \t\f\0]*endstream/.test(s.slice(p + len, p + len + 32))) {
          end = p + len;
        }
        let endKw = s.indexOf('endstream', end >= 0 ? end : p);
        if (endKw < 0) endKw = s.length;
        if (end < 0) {
          end = endKw;
          if (s.charCodeAt(end - 1) === 10) end--;
          if (s.charCodeAt(end - 1) === 13) end--;
          if (end < p) end = p;
        }
        obj.stm = { start: p, end };
        re.lastIndex = Math.max(re.lastIndex, endKw);
      } else {
        lx.pos = save;
        re.lastIndex = Math.max(re.lastIndex, lx.pos);
      }
      this.objs.set(num, obj); // bản cập nhật tăng dần (incremental update) ghi đè bản cũ
    }
  }

  private readTrailer(): void {
    const cands: { pos: number; d: PDict }[] = [];
    let idx = this.s.length;
    for (let k = 0; k < 16 && idx > 0; k++) {
      idx = this.s.lastIndexOf('trailer', idx - 1);
      if (idx < 0) break;
      const v = readValue(new Lexer(this.s, idx + 7));
      if (isDict(v)) cands.push({ pos: idx, d: v });
    }
    for (const o of this.objs.values()) if (isDict(o.val) && nameOf(o.val.get('Type')) === 'XRef') cands.push({ pos: o.pos, d: o.val });
    cands.sort((a, b) => b.pos - a.pos);
    for (const c of cands) for (const [k, v] of c.d) if (!this.trailer.has(k)) this.trailer.set(k, v);
  }

  private ensureRoot(): void {
    if (isDict(this.resolve(this.trailer.get('Root')))) return;
    let best: [number, PObj] | null = null;
    for (const e of this.objs) {
      if (isDict(e[1].val) && nameOf(e[1].val.get('Type')) === 'Catalog' && (!best || e[1].pos >= best[1].pos)) best = e;
    }
    if (best) this.trailer.set('Root', { r: best[0], g: best[1].gen });
  }

  private initCrypt(): void {
    const enc = this.resolve(this.trailer.get('Encrypt'));
    if (!isDict(enc)) return;
    if (nameOf(this.get(enc, 'Filter')) !== 'Standard') {
      this.cryptState = 'unsupported';
      return;
    }
    try {
      const V = numOf(this.get(enc, 'V')) ?? 0;
      const R = numOf(this.get(enc, 'R')) ?? 2;
      const strBytes = (v: PVal) => (isStr(v) ? Buffer.from(v.s, 'latin1') : Buffer.alloc(0));
      const O = strBytes(this.get(enc, 'O'));
      const U = strBytes(this.get(enc, 'U'));
      let mode: 'rc4' | 'aes128' | 'aes256' = 'rc4';
      if (V >= 4) {
        const stmf = nameOf(this.get(enc, 'StmF')) ?? 'Identity';
        if (stmf === 'Identity') return; // stream không mã hóa
        const cf = this.get(enc, 'CF');
        const f = isDict(cf) ? this.get(cf, stmf) : null;
        const cfm = isDict(f) ? nameOf(this.get(f, 'CFM')) : undefined;
        if (cfm === 'None') return;
        mode = cfm === 'AESV2' ? 'aes128' : cfm === 'AESV3' || V === 5 ? 'aes256' : 'rc4';
      }
      if (R >= 5) {
        const UE = strBytes(this.get(enc, 'UE'));
        if (U.length < 48 || UE.length < 32) throw new Error('U/UE');
        const empty = Buffer.alloc(0);
        const h = (salt: Buffer) => (R === 5 ? crypto.createHash('sha256').update(salt).digest() : hash2B(empty, salt, empty));
        if (!h(U.subarray(32, 40)).equals(U.subarray(0, 32))) {
          this.cryptState = 'password';
          return;
        }
        const d = crypto.createDecipheriv('aes-256-cbc', h(U.subarray(40, 48)), Buffer.alloc(16));
        d.setAutoPadding(false);
        this.crypt = new PdfCrypt(Buffer.concat([d.update(UE.subarray(0, 32)), d.final()]), 'aes256');
      } else {
        const lenBits = numOf(this.get(enc, 'Length')) ?? (V >= 4 ? 128 : 40);
        const n = V === 1 ? 5 : mode === 'aes128' ? 16 : Math.max(5, Math.min(16, Math.floor(lenBits / 8)));
        const pBuf = Buffer.alloc(4);
        pBuf.writeInt32LE((numOf(this.get(enc, 'P')) ?? 0) | 0);
        const idArr = this.get(this.trailer, 'ID');
        const id0v = Array.isArray(idArr) ? this.resolve(idArr[0]) : null;
        const id0 = strBytes(id0v);
        const noMeta = R >= 4 && this.get(enc, 'EncryptMetadata') === false;
        let hsh = md5(PW_PAD, O.subarray(0, 32), pBuf, id0, noMeta ? Buffer.from([255, 255, 255, 255]) : Buffer.alloc(0));
        if (R >= 3) for (let i = 0; i < 50; i++) hsh = md5(hsh.subarray(0, n));
        const key = Buffer.from(hsh.subarray(0, n));
        let ok: boolean;
        if (R === 2) ok = rc4(key, PW_PAD).equals(U.subarray(0, 32));
        else {
          let x = rc4(key, md5(PW_PAD, id0));
          for (let i = 1; i <= 19; i++) x = rc4(Buffer.from(key.map((b) => b ^ i)), x);
          ok = x.equals(U.subarray(0, 16));
        }
        if (!ok) {
          this.cryptState = 'password';
          return;
        }
        this.crypt = new PdfCrypt(key, mode);
      }
      this.cryptState = 'ok';
    } catch {
      this.cryptState = 'unsupported';
    }
  }

  private expandObjStms(): void {
    const list = [...this.objs.entries()]
      .filter(([, o]) => o.stm && isDict(o.val) && nameOf(o.val.get('Type')) === 'ObjStm')
      .sort((a, b) => a[1].pos - b[1].pos);
    for (const [num, o] of list) {
      const st = this.streamOf({ r: num, g: o.gen });
      if (!st) continue;
      const n = numOf(this.get(st.dict, 'N')) ?? 0;
      const first = numOf(this.get(st.dict, 'First')) ?? 0;
      const str = st.data.toString('latin1');
      const lx = new Lexer(str, 0, Math.min(first, str.length));
      lx.refs = false;
      const entries: [number, number][] = [];
      for (let i = 0; i < n && i < 1_000_000; i++) {
        const a = lx.next();
        const b = lx.next();
        if (typeof a !== 'number' || typeof b !== 'number') break;
        entries.push([a, b]);
      }
      for (const [objNum, off] of entries) {
        const ex = this.objs.get(objNum);
        if (ex && ex.pos > o.pos) continue; // đã có định nghĩa mới hơn
        try {
          const v = readValue(new Lexer(str, first + off));
          if (v === undefined || isOp(v)) continue;
          this.objs.set(objNum, { pos: o.pos, gen: 0, val: v });
        } catch {
          /* bỏ qua đối tượng hỏng */
        }
      }
    }
  }

  /** Dữ liệu đã giải mã/giải nén của một stream (theo tham chiếu). */
  streamOf(v: PVal | undefined, cache = false): { dict: PDict; data: Buffer } | null {
    if (!isRef(v)) return null;
    const o = this.objs.get(v.r);
    if (!o?.stm || !isDict(o.val)) return null;
    let data = this.streamCache.get(v.r);
    if (data === undefined) {
      data = this.decodeStream(v.r, o);
      if (cache) this.streamCache.set(v.r, data);
    }
    return data ? { dict: o.val, data } : null;
  }

  private decodeStream(num: number, o: PObj): Buffer | null {
    const d = o.val as PDict;
    const stm = o.stm!;
    let end = stm.end;
    const lenV = d.get('Length');
    if (isRef(lenV)) {
      const L = this.resolve(lenV);
      if (typeof L === 'number' && L >= 0 && stm.start + L <= this.s.length && /^[\r\n \t\f\0]*endstream/.test(this.s.slice(stm.start + L, stm.start + L + 32))) {
        end = stm.start + L;
      }
    }
    let data: Buffer = this.buf.subarray(stm.start, end);
    const fv = this.resolve(d.get('Filter'));
    const filters = (Array.isArray(fv) ? fv.map((x) => this.resolve(x)) : fv ? [fv] : []).map(nameOf);
    const pv = this.resolve(d.get('DecodeParms') ?? d.get('DP'));
    const parms = Array.isArray(pv) ? pv.map((x) => this.resolve(x)) : [pv];
    if (this.crypt && nameOf(d.get('Type')) !== 'XRef' && !filters.includes('Crypt')) data = this.crypt.decrypt(data, num, o.gen);
    for (let i = 0; i < filters.length; i++) {
      const budget = Math.min(PDF_MAX_STREAM, PDF_MAX_DECODED - this.decoded);
      if (budget <= 0) {
        this.overBudget = true;
        return null;
      }
      const p = isDict(parms[i]) ? (parms[i] as PDict) : null;
      switch (filters[i]) {
        case 'FlateDecode':
        case 'Fl': {
          const out = inflatePdf(data, budget);
          if (out === 'big') this.overBudget = true;
          if (!out || out === 'big') return null;
          data = out;
          const pred = numOf(this.get(p, 'Predictor')) ?? 1;
          if (pred >= 10) {
            data = pngUnpredict(data, numOf(this.get(p, 'Colors')) ?? 1, numOf(this.get(p, 'BitsPerComponent')) ?? 8, numOf(this.get(p, 'Columns')) ?? 1);
          }
          break;
        }
        case 'LZWDecode':
        case 'LZW': {
          const out = lzwDecode(data, numOf(this.get(p, 'EarlyChange')) ?? 1, budget);
          if (!out) return null;
          data = out;
          break;
        }
        case 'ASCIIHexDecode':
        case 'AHx':
          data = asciiHexDecode(data);
          break;
        case 'ASCII85Decode':
        case 'A85':
          data = ascii85Decode(data);
          break;
        case 'Crypt':
          break;
        default:
          return null; // ảnh (DCT/JPX/CCITT/JBIG2…) hoặc bộ lọc chưa hỗ trợ
      }
    }
    this.decoded += data.length;
    if (this.decoded > PDF_MAX_DECODED) {
      this.overBudget = true;
      return null;
    }
    return data;
  }

  pages(): PdfPage[] {
    const out: PdfPage[] = [];
    const seen = new Set<number>();
    const walk = (v: PVal | undefined, inherited: PVal | undefined, depth: number) => {
      if (depth > 64 || out.length >= 50_000) return;
      if (isRef(v)) {
        if (seen.has(v.r)) return;
        seen.add(v.r);
      }
      const d = this.resolve(v);
      if (!isDict(d)) return;
      const res = d.has('Resources') ? d.get('Resources') : inherited;
      const kids = this.resolve(d.get('Kids'));
      const type = nameOf(this.resolve(d.get('Type')));
      if (Array.isArray(kids) && type !== 'Page') for (const k of kids) walk(k, res, depth + 1);
      else if (type === 'Page' || d.has('Contents')) {
        const r = this.resolve(res);
        out.push({ dict: d, res: isDict(r) ? r : null });
      }
    };
    const root = this.resolve(this.trailer.get('Root'));
    if (isDict(root)) walk(root.get('Pages'), undefined, 0);
    if (!out.length) {
      // cây trang hỏng: lấy mọi đối tượng /Type /Page theo vị trí trong tệp
      const found = [...this.objs.values()]
        .filter((o) => isDict(o.val) && nameOf(o.val.get('Type')) === 'Page')
        .sort((a, b) => a.pos - b.pos);
      for (const o of found) {
        const d = o.val as PDict;
        let res: PVal = this.get(d, 'Resources');
        let parent = this.get(d, 'Parent');
        for (let k = 0; !isDict(res) && isDict(parent) && k < 32; k++) {
          res = this.get(parent, 'Resources');
          parent = this.get(parent, 'Parent');
        }
        out.push({ dict: d, res: isDict(res) ? res : null });
      }
    }
    return out;
  }

  pageContent(page: PDict): string {
    const c = page.get('Contents');
    const rc = this.resolve(c);
    const list = Array.isArray(rc) ? rc : [c];
    const parts: string[] = [];
    for (const r of list) {
      const st = this.streamOf(r);
      if (st) parts.push(st.data.toString('latin1'));
    }
    return parts.join('\n');
  }

  private fontFrom(v: PVal | undefined): PdfFont {
    if (isRef(v)) {
      let f = this.fontCache.get(v.r);
      if (!f) {
        const d = this.resolve(v);
        f = isDict(d) ? this.buildFont(d) : DEFAULT_FONT;
        this.fontCache.set(v.r, f);
      }
      return f;
    }
    if (isDict(v)) {
      let f = this.dictFontCache.get(v);
      if (!f) {
        f = this.buildFont(v);
        this.dictFontCache.set(v, f);
      }
      return f;
    }
    return DEFAULT_FONT;
  }

  private fontByName(res: PDict | null, name: string): PdfFont {
    const fd = this.get(res, 'Font');
    return isDict(fd) ? this.fontFrom(fd.get(name)) : DEFAULT_FONT;
  }

  private buildFont(d: PDict): PdfFont {
    const f = new PdfFont();
    try {
      const sub = nameOf(this.get(d, 'Subtype'));
      const tu = this.streamOf(d.get('ToUnicode'));
      let cmap: ParsedCMap | null = null;
      if (tu) {
        try {
          cmap = parseCMap(tu.data.toString('latin1'));
        } catch {
          cmap = null;
        }
      }
      if (cmap && cmap.map.size) f.toUni = cmap.map;
      if (sub === 'Type0') {
        f.composite = true;
        f.enc = null;
        const encV = d.get('Encoding');
        const encName = nameOf(this.resolve(encV));
        if (encName) {
          if (/UCS2|UTF16/i.test(encName)) f.ucs2 = true;
          if (!/^Identity-[HV]$/.test(encName) && cmap?.ranges.length) f.ranges = cmap.ranges;
        } else {
          const es = this.streamOf(encV);
          let ranges: CodeRange[] = [];
          if (es) {
            try {
              ranges = parseCMap(es.data.toString('latin1')).ranges;
            } catch {
              ranges = [];
            }
          }
          if (!ranges.length && cmap) ranges = cmap.ranges;
          if (ranges.length) f.ranges = ranges;
        }
        const desc = this.get(d, 'DescendantFonts');
        const cid = Array.isArray(desc) ? this.resolve(desc[0]) : isDict(desc) ? desc : null;
        if (isDict(cid)) {
          const dw = numOf(this.get(cid, 'DW'));
          if (dw !== undefined) f.dw = dw;
          const W = this.get(cid, 'W');
          if (Array.isArray(W)) {
            f.cidW = new Map();
            for (let i = 0; i < W.length; ) {
              const a = numOf(this.resolve(W[i]));
              const b = this.resolve(W[i + 1]);
              if (a === undefined) break;
              if (Array.isArray(b)) {
                b.forEach((w, k) => {
                  const wv = numOf(this.resolve(w));
                  if (wv !== undefined) f.cidW!.set(a + k, wv);
                });
                i += 2;
              } else {
                const hi = numOf(b);
                const w = numOf(this.resolve(W[i + 2]));
                if (hi !== undefined && w !== undefined) f.cidRanges.push([a, hi, w]);
                i += 3;
              }
            }
          }
        }
      } else {
        f.enc = this.simpleEncoding(d, sub);
        const W = this.get(d, 'Widths');
        if (Array.isArray(W)) {
          f.firstChar = numOf(this.get(d, 'FirstChar')) ?? 0;
          f.widths = W.map((x) => numOf(this.resolve(x)));
        } else f.widthsKnown = false;
        const fd = this.get(d, 'FontDescriptor');
        const mw = isDict(fd) ? numOf(this.get(fd, 'MissingWidth')) : undefined;
        if (mw && mw > 0) f.missing = mw;
        if (sub === 'Type3') {
          const fm = this.get(d, 'FontMatrix');
          const s0 = Array.isArray(fm) ? numOf(this.resolve(fm[0])) : undefined;
          if (s0) f.scale = Math.abs(s0);
        }
      }
    } catch {
      /* font hỏng: dùng mặc định đã có */
    }
    return f;
  }

  private simpleEncoding(d: PDict, sub: string | undefined): EncTable {
    const encV = this.get(d, 'Encoding');
    const baseName = isName(encV) ? encV.n : isDict(encV) ? nameOf(this.get(encV, 'BaseEncoding')) : undefined;
    let base: EncTable;
    if (baseName === 'MacRomanEncoding') base = MAC_ROMAN;
    else if (baseName === 'StandardEncoding') base = STANDARD;
    else if (baseName === 'WinAnsiEncoding') base = WIN_ANSI;
    else base = sub === 'Type1' || sub === 'MMType1' ? STANDARD : WIN_ANSI;
    const enc = base.slice();
    if (isDict(encV)) {
      const diffs = this.get(encV, 'Differences');
      if (Array.isArray(diffs)) {
        let code = 0;
        for (const x of diffs) {
          const v = this.resolve(x);
          if (typeof v === 'number') code = v;
          else if (isName(v)) {
            if (code >= 0 && code < 256) enc[code] = glyphToUnicode(v.n);
            code++;
          }
        }
      }
    } else if (!encV && (sub === 'Type1' || sub === 'MMType1')) {
      // bảng mã tích hợp trong chương trình font Type1 (phần cleartext: "dup 65 /A put")
      const fd = this.get(d, 'FontDescriptor');
      const ff = isDict(fd) ? this.streamOf(fd.get('FontFile')) : null;
      if (ff) {
        const l1 = numOf(this.get(ff.dict, 'Length1'));
        const head = ff.data.subarray(0, l1 && l1 > 0 ? Math.min(l1, ff.data.length) : Math.min(ff.data.length, 65536)).toString('latin1');
        if (!/\/Encoding\s+StandardEncoding/.test(head)) {
          const re = /dup\s+(\d+)\s*\/([^\s/[\]{}()<>]+)\s+put/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(head))) {
            const c = Number(m[1]);
            if (c < 256) enc[c] = glyphToUnicode(m[2]);
          }
        }
      }
    }
    return enc;
  }

  runContent(src: string, res: PDict | null, gs: GState, depth: number, ctx: RunCtx): void {
    const lx = new Lexer(src);
    lx.refs = false;
    const ops: PVal[] = [];
    let tm: Mat = IDENT;
    let tlm: Mat = IDENT;
    const saved: GState[] = [];
    const mc: McEntry[] = [];
    for (;;) {
      const t = lx.next();
      if (t === undefined) break;
      if (!isOp(t)) {
        ops.push(t);
        if (ops.length > 64) ops.shift();
        continue;
      }
      const op = t.op;
      if (op === '[' || op === '<<') {
        const v = valueFrom(lx, t, 0);
        if (!isOp(v)) ops.push(v);
        continue;
      }
      if (++ctx.ops > PDF_MAX_OPS) {
        ctx.aborted = true;
        return;
      }
      const n = ops.length;
      switch (op) {
        case 'BT':
          tm = tlm = IDENT;
          break;
        case 'q':
          if (saved.length < 256) saved.push({ ...gs });
          break;
        case 'Q': {
          const g = saved.pop();
          if (g) Object.assign(gs, g);
          break;
        }
        case 'cm': {
          const m = lastNums(ops, 6);
          if (m) gs.ctm = mul(m as Mat, gs.ctm);
          break;
        }
        case 'Tf': {
          const nm = ops[n - 2];
          const sz = ops[n - 1];
          if (isName(nm)) gs.font = this.fontByName(res, nm.n);
          if (typeof sz === 'number') gs.size = sz;
          break;
        }
        case 'Tc':
          if (typeof ops[n - 1] === 'number') gs.tc = ops[n - 1] as number;
          break;
        case 'Tw':
          if (typeof ops[n - 1] === 'number') gs.tw = ops[n - 1] as number;
          break;
        case 'Tz':
          if (typeof ops[n - 1] === 'number') gs.th = (ops[n - 1] as number) / 100;
          break;
        case 'TL':
          if (typeof ops[n - 1] === 'number') gs.tl = ops[n - 1] as number;
          break;
        case 'Td':
        case 'TD': {
          const m = lastNums(ops, 2);
          if (m) {
            if (op === 'TD') gs.tl = -m[1];
            tlm = translate(m[0], m[1], tlm);
            tm = tlm;
          }
          break;
        }
        case 'Tm': {
          const m = lastNums(ops, 6);
          if (m) tm = tlm = m as Mat;
          break;
        }
        case 'T*':
          tlm = translate(0, -gs.tl, tlm);
          tm = tlm;
          break;
        case 'Tj': {
          const s = ops[n - 1];
          if (isStr(s)) tm = this.show(s.s, tm, gs, ctx, mc);
          break;
        }
        case "'":
        case '"': {
          if (op === '"') {
            const m = n >= 3 ? [ops[n - 3], ops[n - 2]] : [];
            if (typeof m[0] === 'number') gs.tw = m[0];
            if (typeof m[1] === 'number') gs.tc = m[1];
          }
          tlm = translate(0, -gs.tl, tlm);
          tm = tlm;
          const s = ops[n - 1];
          if (isStr(s)) tm = this.show(s.s, tm, gs, ctx, mc);
          break;
        }
        case 'TJ': {
          const arr = ops[n - 1];
          if (Array.isArray(arr)) {
            for (const x of arr) {
              if (isStr(x)) tm = this.show(x.s, tm, gs, ctx, mc);
              else if (typeof x === 'number') tm = translate((-x / 1000) * gs.size * gs.th, 0, tm);
            }
          }
          break;
        }
        case 'Do': {
          const nm = ops[n - 1];
          if (isName(nm)) this.runForm(nm.n, res, gs, depth, ctx);
          break;
        }
        case 'BMC':
          mc.push({ actual: null, done: false });
          break;
        case 'BDC': {
          const p = ops[n - 1];
          let pd: PVal = isDict(p) ? p : null;
          if (isName(p)) {
            const props = this.get(res, 'Properties');
            pd = isDict(props) ? this.resolve(props.get(p.n)) : null;
          }
          const a = isDict(pd) ? this.resolve(pd.get('ActualText')) : null;
          mc.push({ actual: isStr(a) ? pdfTextString(a.s) : null, done: false });
          break;
        }
        case 'EMC':
          mc.pop();
          break;
        case 'ID':
          lx.skipInlineImage();
          break;
      }
      ops.length = 0;
    }
  }

  private runForm(name: string, res: PDict | null, gs: GState, depth: number, ctx: RunCtx): void {
    if (depth >= 12) return;
    const xo = this.get(res, 'XObject');
    const ref = isDict(xo) ? xo.get(name) : undefined;
    if (!isRef(ref) || ctx.forms.has(ref.r)) return;
    const o = this.objs.get(ref.r);
    if (!o || !isDict(o.val) || nameOf(this.get(o.val, 'Subtype')) !== 'Form') return;
    const st = this.streamOf(ref, true);
    if (!st) return;
    const mv = this.get(st.dict, 'Matrix');
    const m = Array.isArray(mv) && mv.length === 6 && mv.every((x) => typeof x === 'number') ? (mv as Mat) : IDENT;
    const fres = this.get(st.dict, 'Resources');
    ctx.forms.add(ref.r);
    try {
      this.runContent(st.data.toString('latin1'), isDict(fres) ? fres : res, { ...gs, ctm: mul(m, gs.ctm) }, depth + 1, ctx);
    } finally {
      ctx.forms.delete(ref.r);
    }
  }

  private show(str: string, tm: Mat, gs: GState, ctx: RunCtx, mc: McEntry[]): Mat {
    const f = gs.font ?? DEFAULT_FONT;
    const m = mul(tm, gs.ctm);
    let size = Math.abs(gs.size) * Math.hypot(m[2], m[3]);
    if (!(size > 0)) size = Math.abs(gs.size) || 1;
    const dl = Math.hypot(m[0], m[1]);
    const dx = dl ? m[0] / dl : 1;
    const dy = dl ? m[1] / dl : 0;
    let text = '';
    let adv = 0;
    let good = 0;
    let bad = 0;
    for (const c of f.split(str)) {
      const u = f.unicode(c);
      if (u === undefined) bad++;
      else {
        text += u;
        good++;
      }
      adv += (f.width(c) * f.scale * gs.size + gs.tc + (!f.composite && c === 32 ? gs.tw : 0)) * gs.th;
    }
    for (let i = mc.length - 1; i >= 0; i--) {
      const e = mc[i];
      if (e.actual !== null) {
        text = e.done ? '' : e.actual;
        e.done = true;
        good = text.length;
        bad = 0;
        break;
      }
    }
    if (text) text = text.replace(/[\t\u00a0]/g, ' ').replace(PUA_BULLETS, '•');
    const nt = translate(adv, 0, tm);
    const e = mul(nt, gs.ctm);
    ctx.sink.add(m[4], m[5], e[4], e[5], dx, dy, size, text, f.widthsKnown);
    ctx.good += good;
    ctx.bad += bad;
    return nt;
  }
}

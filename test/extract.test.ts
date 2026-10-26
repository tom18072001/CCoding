import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { extractText, readZip, isTextLike } from '../src/util/extract.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-extract-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function put(name: string, data: string | Buffer): string {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, data);
  return f;
}

const hasTool = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { stdio: 'ignore' });
  return !r.error;
};

// ───────── ZIP writer tối giản (stored + deflate, CRC32 chuẩn) ─────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(entries: Record<string, string | Buffer>, storeNames: string[] = []): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const store = storeNames.includes(name);
    const comp = store ? data : zlib.deflateRawSync(data);
    const method = store ? 0 : 8;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// ───────── PDF builder tối giản (có bảng xref hợp lệ) ─────────

type PdfObj = string | { dict: string; stream: Buffer };

function buildPdf(objs: PdfObj[]): Buffer {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1')];
  let len = chunks[0].length;
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(len);
    const b =
      typeof o === 'string'
        ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1')
        : Buffer.concat([
            Buffer.from(`${i + 1} 0 obj\n<< ${o.dict} /Length ${o.stream.length} >>\nstream\n`, 'latin1'),
            o.stream,
            Buffer.from('\nendstream\nendobj\n', 'latin1'),
          ]);
    chunks.push(b);
    len += b.length;
  });
  const xref =
    ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f ', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `)].join('\n') + '\n';
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}

const flate = (s: string) => ({ dict: '/Filter /FlateDecode', stream: zlib.deflateSync(Buffer.from(s, 'latin1')) });

function simplePdf(): Buffer {
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    flate('BT /F1 24 Tf 72 720 Td (Hello PDF) Tj 0 -30 Td (Caf\\351 \\(cr\\350me br\\373l\\351e\\)) Tj ET'),
  ]);
}

/** PDF dùng font Type0/Identity-H với ToUnicode CMap (mã glyph hex → ký tự tiếng Việt), 2 trang. */
function vietnamesePdf(opts: { toUnicode?: boolean } = {}): Buffer {
  const lines = ['Kế', ' hoạch', 'dự', 'án', 'Người phụ trách:', '1.500.000 đồng'];
  const codes = new Map<string, number>();
  let nextCode = 3;
  const codeOf = (ch: string): number => {
    const c = ch.charCodeAt(0);
    if (c >= 97 && c <= 122) return 0x0100 + (c - 97); // bfrange dạng <lo> <hi> <dst>
    if (c >= 48 && c <= 57) return 0x0200 + (c - 48); // bfrange dạng mảng
    if (!codes.has(ch)) codes.set(ch, nextCode++); // bfchar
    return codes.get(ch)!;
  };
  const hex = (s: string) => `<${[...s].map((ch) => codeOf(ch).toString(16).padStart(4, '0')).join('')}>`;
  const [k, hoach, du, an, nguoi, tien] = lines.map(hex);
  const page1 = `BT /F1 18 Tf 72 700 Td [${k} 40 ${hoach} -600 ${du} -650 ${an}] TJ ET`;
  const page2 = `BT /F1 12 Tf 1 0 0 1 72 700 Tm ${nguoi} Tj 1 0 0 1 72 680 Tm ${tien} Tj ET`;
  const u16 = (s: string) => Buffer.from(s, 'utf16le').swap16().toString('hex');
  const bfchar = [...codes].map(([ch, code]) => `<${code.toString(16).padStart(4, '0')}> <${u16(ch)}>`);
  const digits = Array.from({ length: 10 }, (_, i) => `<${u16(String(i))}>`).join(' ');
  const cmap = [
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def /CMapType 2 def',
    '1 begincodespacerange <0000> <FFFF> endcodespacerange',
    `${bfchar.length} beginbfchar`,
    ...bfchar,
    'endbfchar',
    '2 beginbfrange',
    '<0100> <0119> <0061>',
    `<0200> <0209> [${digits}]`,
    'endbfrange',
    'endcmap CMapName currentdict /CMap defineresource pop end end',
  ].join('\n');
  const tu = opts.toUnicode === false ? '' : ' /ToUnicode 9 0 R';
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 7 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 8 0 R >>',
    `<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Arial /Encoding /Identity-H /DescendantFonts [6 0 R]${tu} >>`,
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEF+Arial /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 10 0 R /DW 500 /CIDToGIDMap /Identity >>',
    flate(page1),
    flate(page2),
    flate(cmap),
    '<< /Type /FontDescriptor /FontName /ABCDEF+Arial /Flags 32 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>',
  ]);
}

// ───────── Văn bản thuần, HTML ─────────

test('văn bản UTF-8: bỏ BOM, chuẩn hóa xuống dòng, khoảng trắng cuối dòng và dòng trống', async () => {
  const f = put('ghi-chu.md', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# Kế hoạch dự án  \r\n\r\n\r\n\r\nNgười phụ trách: A\t\r\n', 'utf8')]));
  const r = await extractText(f);
  assert.equal(r.kind, 'text');
  assert.equal(r.text, '# Kế hoạch dự án\n\nNgười phụ trách: A');
  assert.equal(r.chars, r.text.length);
  assert.equal(r.truncated, false);
  assert.equal(r.note, undefined);
});

test('văn bản không phải UTF-8 → đọc theo Latin-1 kèm ghi chú; UTF-16LE có BOM', async () => {
  const latin = await extractText(put('cu.txt', Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x6f, 0x6b, 0x94])));
  assert.equal(latin.text, 'Café “ok”');
  assert.match(latin.note ?? '', /Latin-1/);
  const u16 = await extractText(put('u16.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Xin chào Việt Nam', 'utf16le')])));
  assert.equal(u16.text, 'Xin chào Việt Nam');
});

test('HTML: bỏ script/style/comment, giữ tiêu đề, danh sách, bảng và giải mã entity', async () => {
  const html = `<!doctype html><html><head><title>Trang thử</title><style>.a{color:red}</style><script>alert("x")</script></head>
  <body><h1>Tiêu đề</h1><!-- ẩn --><p>Đoạn &amp; văn&nbsp;bản &#7871; &lt;b&gt;</p>
  <ul><li>Một</li><li>Hai</li></ul><table><tr><th>Cột A</th><th>Cột B</th></tr><tr><td>1</td><td>2</td></tr></table></body></html>`;
  const r = await extractText(put('trang.html', html));
  assert.equal(r.kind, 'text');
  assert.ok(r.text.includes('# Tiêu đề'), r.text);
  assert.ok(r.text.includes('Đoạn & văn bản ế <b>'), r.text);
  assert.ok(r.text.includes('- Một\n- Hai'), r.text);
  assert.ok(r.text.includes('Cột A | Cột B\n1 | 2'), r.text);
  assert.ok(r.text.includes('# Trang thử'), r.text);
  assert.ok(!/alert|color:red|ẩn/.test(r.text), r.text);
});

test('cắt theo maxChars: truncated=true, có dòng đánh dấu, chars là độ dài đầy đủ', async () => {
  const body = Array.from({ length: 400 }, (_, i) => `Dòng số ${i + 1} của nhật ký hệ thống`).join('\n');
  const r = await extractText(put('dai.log', body), { maxChars: 1000 });
  assert.equal(r.truncated, true);
  assert.equal(r.chars, body.length);
  assert.ok(r.text.length <= 1000, String(r.text.length));
  assert.match(r.text, /\[… Đã cắt bớt: hiển thị [\d.]+\/[\d.]+ ký tự …\]$/);
  assert.ok(r.text.startsWith('Dòng số 1 của'));
  assert.match(r.note ?? '', /đã cắt/);
});

test('isTextLike: theo đuôi tệp và nội dung', () => {
  assert.equal(isTextLike('a.ts', Buffer.from('export const a = 1;')), true);
  assert.equal(isTextLike('README', Buffer.from('Hướng dẫn sử dụng')), true);
  assert.equal(isTextLike('du-lieu.unknown', Buffer.from('chỉ là văn bản UTF-8\n')), true);
  assert.equal(isTextLike('du-lieu.unknown', Buffer.from([0x41, 0x00, 0x42, 0x03, 0xff])), false);
  assert.equal(isTextLike('anh.png', Buffer.from('text')), false);
  assert.equal(isTextLike('bao-cao.pdf', Buffer.from('%PDF-1.7')), false);
  assert.equal(isTextLike('x.unknown', Buffer.from('%PDF-1.4\n')), false);
  assert.equal(isTextLike('x.unknown', Buffer.from([0xc3, 0x28, 0x41])), false); // UTF-8 sai
  assert.equal(isTextLike('rong.txt', Buffer.alloc(0)), true);
});

test('tệp không đuôi được nhận diện theo nội dung (văn bản / nhị phân)', async () => {
  const t = await extractText(put('NOTES', 'Ghi chú cuộc họp\nViệc cần làm'));
  assert.equal(t.kind, 'text');
  assert.equal(t.text, 'Ghi chú cuộc họp\nViệc cần làm');
  const b = await extractText(put('blob.bin', Buffer.from([0, 1, 2, 3, 255, 254, 0, 0, 7, 8])));
  assert.equal(b.kind, 'binary');
  assert.equal(b.text, '');
  assert.match(b.note ?? '', /nhị phân/);
});

test('ảnh và định dạng Office cũ', async () => {
  const png = await extractText(put('so-do.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])));
  assert.deepEqual(png, { kind: 'image', text: '', chars: 0, truncated: false, note: 'Ảnh — không trích xuất chữ (chưa có OCR)' });
  const jpgByMagic = await extractText(put('anh-khong-duoi', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16])));
  assert.equal(jpgByMagic.kind, 'image');
  const doc = await extractText(put('cu.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])));
  assert.equal(doc.kind, 'binary');
  assert.match(doc.note ?? '', /\.docx/);
});

test('tệp không tồn tại → lỗi tiếng Việt', async () => {
  await assert.rejects(extractText(path.join(tmp, 'khong-co.txt')), /Không đọc được tệp "khong-co.txt"/);
});

// ───────── ZIP ─────────

test('readZip đọc mục stored + deflate, áp dụng filter', () => {
  const zip = makeZip({ 'a.txt': 'nội dung A', 'thu-muc/b.xml': '<b>Bê</b>', 'c.bin': Buffer.alloc(100, 7) }, ['a.txt']);
  const all = readZip(zip);
  assert.deepEqual([...all.keys()], ['a.txt', 'thu-muc/b.xml', 'c.bin']);
  assert.equal(all.get('a.txt')!.toString('utf8'), 'nội dung A');
  assert.equal(all.get('thu-muc/b.xml')!.toString('utf8'), '<b>Bê</b>');
  assert.equal(all.get('c.bin')!.length, 100);
  const xmlOnly = readZip(zip, { filter: (n) => n.endsWith('.xml') });
  assert.deepEqual([...xmlOnly.keys()], ['thu-muc/b.xml']);
});

test('readZip: tệp hỏng và zip bomb → lỗi tiếng Việt rõ ràng', () => {
  assert.throws(() => readZip(Buffer.from('PK\u0003\u0004 không phải zip')), /ZIP không hợp lệ/);
  const zip = makeZip({ 'word/document.xml': Buffer.alloc(2 * 1024 * 1024) });
  assert.throws(() => readZip(zip, { maxEntryBytes: 64 * 1024 }), /zip bomb/);
  assert.throws(() => readZip(zip, { maxTotalBytes: 1024 * 1024 }), /zip bomb/);
  // tổn hại thư mục trung tâm
  const broken = Buffer.from(zip);
  broken.writeUInt32LE(0xdeadbeef, broken.length - 22 - 46 - 'word/document.xml'.length);
  assert.throws(() => readZip(broken), /ZIP/);
});

test('DOCX/XLSX hỏng không làm sập: trả về note, text rỗng', async () => {
  const r = await extractText(put('hong.docx', Buffer.from('PK\u0003\u0004 rác rác rác')));
  assert.equal(r.kind, 'docx');
  assert.equal(r.text, '');
  assert.match(r.note ?? '', /ZIP/);
  const x = await extractText(put('hong.xlsx', 'không phải zip'));
  assert.equal(x.kind, 'xlsx');
  assert.equal(x.text, '');
  assert.ok(x.note);
});

// ───────── DOCX ─────────

function docxFixture(): Buffer {
  const document = `${XML}<w:document ${NS_W}><w:body>
  <w:p><w:pPr><w:pStyle w:val="u1"/></w:pPr><w:r><w:t>Kế hoạch dự án</w:t></w:r></w:p>
  <w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>
    <w:r><w:t xml:space="preserve">Mã:</w:t></w:r><w:r><w:tab/><w:t>KH-01</w:t><w:br/><w:t>Ngày 26/10/2026 &amp; cập nhật &lt;v2&gt;</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Thu thập log</w:t></w:r></w:p>
  <w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><w:txbxContent><w:p><w:r><w:t>Hộp chữ</w:t></w:r></w:p></w:txbxContent></w:drawing></mc:Choice><mc:Fallback><w:pict><w:txbxContent><w:p><w:r><w:t>Hộp chữ</w:t></w:r></w:p></w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Hạng mục</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Người phụ trách</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Ngân sách</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Thiết kế</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Nguyễn Văn A</w:t></w:r></w:p><w:p><w:r><w:t>Trưởng nhóm</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1.500.000</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  <w:p><w:r><w:t>Hết</w:t></w:r><w:r><w:delText>đã xóa</w:delText></w:r><w:r><w:instrText>PAGE</w:instrText></w:r></w:p>
  </w:body></w:document>`;
  const styles = `${XML}<w:styles ${NS_W}><w:style w:type="paragraph" w:styleId="u1"><w:name w:val="heading 1"/></w:style></w:styles>`;
  return makeZip({
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    '_rels/.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': document,
    'word/styles.xml': styles,
    'word/header1.xml': `${XML}<w:hdr ${NS_W}><w:p><w:r><w:t>Công ty ICS</w:t></w:r></w:p></w:hdr>`,
    'word/media/image1.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
}

test('DOCX: tiêu đề, tab, ngắt dòng, danh sách, bảng, entity, bỏ Fallback/delText/instrText', async () => {
  const r = await extractText(put('ke-hoach.docx', docxFixture()));
  assert.equal(r.kind, 'docx');
  const expected = [
    '# Kế hoạch dự án',
    'Mã:\tKH-01',
    'Ngày 26/10/2026 & cập nhật <v2>',
    '- Thu thập log',
    'Hộp chữ',
    '',
    'Hạng mục | Người phụ trách | Ngân sách',
    'Thiết kế | Nguyễn Văn A / Trưởng nhóm | 1.500.000',
    '',
    'Hết',
    '',
    '## Đầu trang / chân trang',
    'Công ty ICS',
  ].join('\n');
  assert.equal(r.text, expected);
  assert.equal(r.text.split('Hộp chữ').length, 2); // không lặp lại nội dung mc:Fallback
});

test('ZIP không đuôi chứa DOCX vẫn được nhận diện', async () => {
  const r = await extractText(put('tai-lieu-tai-len', docxFixture()));
  assert.equal(r.kind, 'docx');
  assert.ok(r.text.includes('Kế hoạch dự án'));
  const plainZip = await extractText(put('goi.zip', makeZip({ 'a.txt': 'x' })));
  assert.equal(plainZip.kind, 'binary');
  assert.match(plainZip.note ?? '', /ZIP|nén/);
});

// ───────── XLSX ─────────

function xlsxFixture(): Buffer {
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const workbook = `${XML}<workbook ${NS}><workbookPr/><sheets>
    <sheet name="Kế hoạch" sheetId="1" r:id="rId1"/><sheet name="Số liệu" sheetId="2" r:id="rId2"/><sheet name="Ẩn" sheetId="3" state="hidden" r:id="rId3"/>
  </sheets></workbook>`;
  // rId1 trỏ tới sheet2.xml và ngược lại: buộc phải đi qua workbook.xml.rels
  const rels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/>
    <Relationship Id="rId2" Type="${REL}/worksheet" Target="/xl/worksheets/sheet1.xml"/>
    <Relationship Id="rId3" Type="${REL}/worksheet" Target="worksheets/sheet3.xml"/>
    <Relationship Id="rId4" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>
    <Relationship Id="rId5" Type="${REL}/styles" Target="styles.xml"/>
  </Relationships>`;
  const sst = `${XML}<sst ${NS} count="4" uniqueCount="4">
    <si><t>Hạng mục</t></si>
    <si><r><t>Người </t></r><r><rPr><b/></rPr><t>phụ trách</t></r><rPh sb="0" eb="1"><t>PHIÊN ÂM</t></rPh></si>
    <si><t>Ngân sách</t></si>
    <si><t xml:space="preserve">Thiết kế_x000D_
hệ thống</t></si>
  </sst>`;
  const styles = `${XML}<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
    <cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="4"/></cellXfs></styleSheet>`;
  const plan = `${XML}<worksheet ${NS}><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>Hạn</t></is></c><c r="E1" t="inlineStr"><is><t>Xong</t></is></c></row>
    <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="str"><f>CONCAT("A")</f><v>Nguyễn Văn A</v></c><c r="C2" s="2"><v>1500000</v></c><c r="D2" s="1"><v>46356</v></c><c r="E2" t="b"><v>1</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Bỏ trống B</t></is></c><c r="C3"><v>0.30000000000000004</v></c><c r="E3" t="e"><v>#N/A</v></c></row>
    <row r="4"/><row r="5"><c r="A5" s="1"/></row>
  </sheetData></worksheet>`;
  const rows = Array.from({ length: 5005 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i + 1}</v></c></row>`).join('');
  const data = `${XML}<worksheet ${NS}><sheetData>${rows}</sheetData></worksheet>`;
  const hidden = `${XML}<worksheet ${NS}><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>bí mật</t></is></c></row></sheetData></worksheet>`;
  return makeZip({
    '_rels/.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': rels,
    'xl/sharedStrings.xml': sst,
    'xl/styles.xml': styles,
    'xl/worksheets/sheet2.xml': plan,
    'xl/worksheets/sheet1.xml': data,
    'xl/worksheets/sheet3.xml': hidden,
  });
}

test('XLSX: tên trang tính, sharedStrings/inlineStr/số/bool/ngày, giới hạn dòng', async () => {
  const r = await extractText(put('so-lieu.xlsx', xlsxFixture()));
  assert.equal(r.kind, 'xlsx');
  assert.equal(r.pages, 3);
  const [plan, data, hidden] = r.text.split('\n\n');
  assert.equal(
    plan,
    [
      '## Kế hoạch',
      'Hạng mục | Người phụ trách | Ngân sách | Hạn | Xong',
      'Thiết kế / hệ thống | Nguyễn Văn A | 1500000 | 2026-11-30 | TRUE',
      'Bỏ trống B |  | 0.3 |  | #N/A',
    ].join('\n'),
  );
  const dataLines = data.split('\n');
  assert.equal(dataLines[0], '## Số liệu');
  assert.equal(dataLines.length, 1 + 5000);
  assert.equal(dataLines[5000], '5000');
  assert.equal(hidden, '## Ẩn (ẩn)\n | bí mật');
  assert.match(r.note ?? '', /Số liệu.*5\.000\/~5\.005/);
});

// ───────── PPTX ─────────

function pptxFixture(): Buffer {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const sp = (paras: string[]) =>
    `<p:sp><p:txBody><a:bodyPr/>${paras.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`;
  const slideA = `${XML}<p:sld ${NS}><p:cSld><p:spTree>${sp(['Giới thiệu dự án', 'Kế hoạch &amp; mục tiêu'])}
    <p:sp><p:txBody><a:p><a:r><a:t>Dòng 1</a:t></a:r><a:br/><a:r><a:t>Dòng 2</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const slideB = `${XML}<p:sld ${NS} show="0"><p:cSld><p:spTree>${sp(['Ngân sách'])}
    <p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Hạng mục</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Chi phí</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
    <a:tr><a:tc><a:txBody><a:p><a:r><a:t>Cảm biến</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>500 triệu</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
    </p:spTree></p:cSld></p:sld>`;
  const notes = `${XML}<p:notes ${NS}><p:cSld><p:spTree>${sp(['Nhấn mạnh tiến độ'])}<p:sp><p:txBody><a:p><a:fld type="slidenum"><a:t>2</a:t></a:fld></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`;
  return makeZip({
    '_rels/.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    // thứ tự trình chiếu: slide2.xml trước slide1.xml
    'ppt/presentation.xml': `${XML}<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId8"/><p:sldId id="257" r:id="rId7"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="${REL}/slide" Target="slides/slide1.xml"/><Relationship Id="rId8" Type="${REL}/slide" Target="slides/slide2.xml"/></Relationships>`,
    'ppt/slides/slide1.xml': slideB,
    'ppt/slides/slide2.xml': slideA,
    'ppt/slides/_rels/slide1.xml.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
    'ppt/notesSlides/notesSlide1.xml': notes,
  });
}

test('PPTX: thứ tự slide theo presentation.xml, bảng, ghi chú, slide ẩn', async () => {
  const r = await extractText(put('trinh-chieu.pptx', pptxFixture()));
  assert.equal(r.kind, 'pptx');
  assert.equal(r.pages, 2);
  assert.equal(
    r.text,
    [
      '## Slide 1',
      'Giới thiệu dự án',
      'Kế hoạch & mục tiêu',
      'Dòng 1',
      'Dòng 2',
      '',
      '## Slide 2 (ẩn)',
      'Ngân sách',
      '',
      'Hạng mục | Chi phí',
      'Cảm biến | 500 triệu',
      'Ghi chú: Nhấn mạnh tiến độ',
    ].join('\n'),
  );
});

// ───────── PDF ─────────

test('PDF đơn giản (Helvetica, FlateDecode, chuỗi có escape) — bộ đọc tích hợp', async () => {
  const r = await extractText(put('don-gian.pdf', simplePdf()), { pdftotext: false });
  assert.equal(r.kind, 'pdf');
  assert.equal(r.pages, 1);
  assert.equal(r.text, 'Hello PDF\nCafé (crème brûlée)');
  assert.match(r.note ?? '', /tích hợp/);
});

test('PDF font Identity-H + ToUnicode (bfchar/bfrange) — tiếng Việt, khoảng cách từ TJ, 2 trang', async () => {
  const r = await extractText(put('tieng-viet.pdf', vietnamesePdf()), { pdftotext: false });
  assert.equal(r.kind, 'pdf');
  assert.equal(r.pages, 2);
  assert.equal(r.text, '## Trang 1\nKế hoạch dự án\n\n## Trang 2\nNgười phụ trách:\n1.500.000 đồng');
});

test('PDF thiếu ToUnicode, không có chữ, hoặc hỏng → text rỗng kèm ghi chú, không ném lỗi', async () => {
  const noTu = await extractText(put('khong-tounicode.pdf', vietnamesePdf({ toUnicode: false })), { pdftotext: false });
  assert.equal(noTu.text, '');
  assert.equal(noTu.pages, 2);
  assert.match(noTu.note ?? '', /OCR|pdftotext/);

  const vector = buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
    flate('0 0 m 100 100 l S 10 10 50 50 re f'),
  ]);
  const v = await extractText(put('chi-hinh.pdf', vector), { pdftotext: false });
  assert.equal(v.text, '');
  assert.match(v.note ?? '', /scan|OCR/);

  const junk = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Kids [3 0 R'), Buffer.alloc(500, 0xff)]);
  const j = await extractText(put('hong.pdf', junk), { pdftotext: false });
  assert.equal(j.kind, 'pdf');
  assert.equal(j.text, '');
  assert.ok(j.note);
});

test('PDF qua pdftotext (nếu có trên máy)', { skip: !hasTool('pdftotext', ['-v']) && 'không có pdftotext' }, async () => {
  const r = await extractText(put('poppler.pdf', vietnamesePdf()));
  assert.equal(r.kind, 'pdf');
  assert.equal(r.pages, 2);
  assert.match(r.text, /Kế hoạch\s+dự\s+án/);
  assert.match(r.text, /Người phụ trách:/);
  assert.match(r.text, /^## Trang 2$/m);
  assert.equal(r.note, undefined);
});

test('PDF mã hóa mật khẩu rỗng (RC4/AES qua qpdf, nếu có trên máy)', { skip: !hasTool('qpdf', ['--version']) && 'không có qpdf' }, async () => {
  const src = put('goc.pdf', vietnamesePdf());
  const variants: [string, string[]][] = [
    ['rc4-128.pdf', ['--allow-weak-crypto', '--encrypt', '', 'chu-so-huu', '128', '--use-aes=n', '--']],
    ['aes-128.pdf', ['--allow-weak-crypto', '--encrypt', '', 'chu-so-huu', '128', '--use-aes=y', '--']],
    ['aes-256.pdf', ['--encrypt', '', 'chu-so-huu', '256', '--']],
  ];
  for (const [name, args] of variants) {
    const out = path.join(tmp, name);
    const res = spawnSync('qpdf', ['--object-streams=generate', ...args, src, out]);
    assert.ok(res.status === 0 || res.status === 3, `qpdf ${name}: ${res.stderr}`);
    const r = await extractText(out, { pdftotext: false });
    assert.ok(r.text.includes('Kế hoạch dự án'), `${name}: ${r.text} ${r.note}`);
    assert.ok(r.text.includes('1.500.000 đồng'), name);
  }
  const locked = path.join(tmp, 'co-mat-khau.pdf');
  spawnSync('qpdf', ['--encrypt', 'matkhau', 'chu-so-huu', '256', '--', src, locked]);
  const r = await extractText(locked, { pdftotext: false });
  assert.equal(r.text, '');
  assert.match(r.note ?? '', /mật khẩu/);
});

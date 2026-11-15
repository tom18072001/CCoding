import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefItems } from '../src/plan-gate.js';

const ex = (brief: string, code: string): boolean => briefItems(brief).find((i) => i.code === code)!.exempt;

const TITLE_CASES: [string, string, boolean][] = [
  ['K2 — senior-swe: đóng handle có chờ sự kiện', 'K2', false],
  ['K3 — Chờ: dữ liệu từ Tom', 'K3', true],
  ['K4 — research-lead: chờ dữ liệu', 'K4', true],
  ['K4 — **Chờ**', 'K4', true],
  ['K4 — Không làm', 'K4', true],
  ['K4 — research-lead — chờ (dữ liệu)', 'K4', true],
  ['K4 — senior-swe: Không làm hỏng nhiệm vụ', 'K4', false],
  ['K4 — Chờ dữ liệu từ Tom', 'K4', true],
  ['K4 — Phần (a): không làm', 'K4', true],
  ['K4 — senior-swe: Không làm hỏng nhiệm vụ cũ', 'K4', false],
];
for (const [line, code, want] of TITLE_CASES) {
  test(`D29 tiêu đề: "${line}" ⇒ exempt=${want}`, () => assert.equal(ex(line, code), want));
}

const BODY_CASES: [string, boolean][] = [
  ['- Không làm hỏng nhiệm vụ…', false],
  ['- Không làm (ngoài phạm vi)', true],
  ['- Không làm', true],
  ['- **Không làm**: bench', true],
  ['Phần 2: chờ: dữ liệu', true],
  ['- Việc này chờ sự kiện xong rồi mới chạy', false],
  ['- chờ Tom duyệt', false],
];
for (const [body, want] of BODY_CASES) {
  test(`D29 thân: "${body}" ⇒ exempt=${want}`, () => assert.equal(ex(`K1 — senior-swe: làm gì đó\n${body}\n`, 'K1'), want));
}

# Phòng Dev, gói D25: cổng kế hoạch không coi câu phủ định ("không cần chạy lệnh") là đòi chạy lệnh

**Gói nhỏ: 2 hạng mục. Ngân sách 3M token.** Giao 15/11/2026.

**Căn cứ:** BRIEF-26b (T-20261115-103533-20d) bị cổng kế hoạch chặn ở quy tắc B (vi), chưa chạy hạng mục nào.
- Hạng mục S1 giao `methodologist` (vai chỉ đọc/ghi tệp) có mô tả: "Chỉ đọc và ghi tệp, không cần chạy lệnh. Đọc mã bằng read_file/search; …".
- `NEEDS_CMD_RE` (`src/plan-gate.ts:151`) khớp "chạy lệnh" mà không xét phủ định đứng trước. Trưởng phòng càng ghi rõ vai chỉ đọc thì kế hoạch càng bị chặn; lập lại kế hoạch cũng bị chặn lần hai.
- `scripts/lint/rules/brief-lint.mjs` dùng cùng biểu thức, nên cũng chặn nhầm đề bài có câu phủ định như vậy.
- Kế hoạch thật lưu ở `test/fixtures/brief-item/plan-brief26b-negation.json` (`planSummary` và 4 hạng mục).

**Phạm vi:**
- **Được sửa:** `src/plan-gate.ts`, `scripts/lint/rules/brief-lint.mjs`, `test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/`, `docs/research/`, các quy tắc khác của cổng.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — backend-dev: hàm `needsCommand` xét phủ định, dùng ở cổng và lint**
- **Thêm và export `needsCommand(text: string): boolean`** trong `src/plan-gate.ts`:
  - trả `true` khi **có ít nhất một** chỗ khớp `NEEDS_CMD_RE` không bị phủ định;
  - một chỗ khớp **bị phủ định** khi ngay trước "chạy", trong cùng mệnh đề, là một từ phủ định (`không`, `chưa`, `chẳng`, `đừng`, `khỏi`), có thể có tối đa 3 từ tình thái xen giữa (`cần`, `được`, `phải`, `nên`, `thể`, `có`, `tự`, `hề`, `phép`). Không xét phủ định qua dấu câu `. ; : ,` hay xuống dòng;
  - giữ nguyên `NEEDS_CMD_RE` (vẫn export, không đổi) để không gãy chỗ khác.
- **Dùng `needsCommand`** ở quy tắc B (vi) của `checkPlanReadable` và ở `brief-lint.mjs`. Không chép lại logic.
- **Test** (`test/`), mỗi ca ghi rõ kỳ vọng:
  - kế hoạch thật trong fixture: qua quy tắc B (vi) với vai chỉ đọc (cổng không chặn S1);
  - **ca âm (phủ định):** "không cần chạy lệnh", "Không chạy test.", "chưa được phép chạy script", "không tự chạy lại lệnh";
  - **ca dương (vẫn bắt):**
    - "Chạy lệnh kiểm tra";
    - "chạy lại test";
    - "Không chỉ đọc mà phải chạy lệnh" (từ "chỉ" không phải từ tình thái nên không phủ định);
    - "không sửa mã; chạy `npm test`" (dấu `;` ngắt mệnh đề);
    - "Không chạy lệnh nào ngoài đọc tệp, rồi chạy test" (chỗ khớp thứ hai không bị phủ định);
  - `brief-lint`: đề bài có câu phủ định cho vai chỉ đọc ⇒ xanh; đề bài đòi vai chỉ đọc chạy test ⇒ đỏ (giữ test cũ).
- Cập nhật `docs/LINT.md` (dòng `brief-lint`) và chú thích của quy tắc B (vi): giới hạn còn lại của cách xét phủ định.

**K2 — qa-tester: review**
- Kết luận theo mẫu JSON. Khối JSON đặt **cuối** câu trả lời, đúng mẫu, để hệ thống đọc được.
- **Thử sức bắt lỗi:**
  - tạm bỏ phần xét phủ định ⇒ test ca âm và test fixture đỏ; trả lại ⇒ xanh;
  - tạm cho mọi chỗ khớp là phủ định ⇒ test ca dương đỏ.
- Xác nhận test cũ của cổng kế hoạch và `brief-lint` vẫn xanh mà không sửa kỳ vọng.

# Phòng Dev, gói D27: văn bản nghiệm thu không được nói ngược khối JSON; test treo thì đỏ; test biên của mẫu tệp nháp

**Gói nhỏ: 2 hạng mục. Ngân sách 4M token.** Giao 15/11/2026.

**Căn cứ:**
- **Văn bản và JSON nghiệm thu lệch nhau.** Ở D26 (T-20261115-123709-b28), mục Tóm tắt của `ACCEPTANCE.md` mở đầu "Nghiệm thu.", nhưng khối JSON ghi `accepted: false`.
  - Engine đi theo JSON: mở vòng bổ sung rồi dừng vì ngân sách. Người đọc biên bản lại hiểu là đã nghiệm thu.
  - `parseAcceptance` (`src/planner.ts`, khoảng dòng 218) chỉ đọc JSON, không đối chiếu văn bản.
  - Quyết định 13 ở `docs/research/decisions-2026-11-14.md` ghi việc này.
- **Tiến trình test treo không bao giờ kết thúc.** Ngày 15/11, máy văn phòng có 33 tiến trình mồ côi: 11 bộ `npm run test:bench` → `node --test` → `bench/vs-claude/test/e7.test.mjs` treo từ 14/11 22:53 đến 15/11 03:15 giờ máy, sinh ra từ các lượt QA trên engine cũ.
  - `package.json` chưa đặt `--test-timeout` cho `test`, `test:bench`, `test:research`, nên một test treo làm cả lệnh treo.
  - CI Windows vẫn xanh, chưa tái hiện được nguyên nhân.
- **CTO D26 đề xuất test biên cho `matchScratch`** (`src/scratch.ts`):
  - mẫu `_*` chỉ khớp ở gốc repo;
  - mẫu `!` thắng mẫu dương.

**Phạm vi:**
- **Được sửa:** `src/planner.ts`, `src/orchestrator.ts` (chỉ chỗ ghi `ACCEPTANCE.md` và sự kiện nghiệm thu), `src/types.ts`, `src/scratch.ts` (chỉ nếu test biên lộ lỗi), `package.json` (chỉ các script test), `test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/` (trừ khi `--test-timeout` cần chỉnh một test quá dài; nêu lý do), `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — backend-dev: phát hiện văn bản nói ngược JSON; giới hạn thời gian test; test biên `matchScratch`**
- **Đối chiếu văn bản với JSON nghiệm thu:**
  - từ câu đầu của mục Tóm tắt, nhận diện văn bản nói "đã nghiệm thu" hay "chưa nghiệm thu". "Chưa nghiệm thu", "nghiệm thu có điều kiện", "chưa đạt" là chưa. Không nhận ra được thì không kết luận gì;
  - chỉ khi nhận ra được **và** ngược với `accepted` của JSON: kết quả nghiệm thu có trường `textMismatch: true`, có một sự kiện nhật ký, và `ACCEPTANCE.md` có một dòng đầu do hệ thống ghi, nói rõ kết luận theo JSON là gì;
  - engine vẫn đi theo JSON như cũ; không đổi luật mở vòng bổ sung.
  - **Test:** văn bản "Nghiệm thu." + JSON `false` ⇒ lệch; "Chưa nghiệm thu." + `true` ⇒ lệch; "Nghiệm thu có điều kiện" + `false` ⇒ không lệch; văn bản không rõ ⇒ không lệch; trường hợp khớp ⇒ không có dòng thêm.
- **Giới hạn thời gian test:** thêm `--test-timeout` cho `test`, `test:bench`, `test:research` trong `package.json`. Giá trị đủ cho test dài nhất hiện có, cộng biên, kèm lý do. Một test treo ⇒ lệnh đỏ và thoát.
  - **Test:** một tệp test tạm treo vô hạn, chạy bằng đúng cờ đó ⇒ thoát khác 0 trong thời hạn. Tệp tạm đặt ngoài cây test chính và dọn sau test.
- **Test biên `matchScratch`:**
  - `_x.py` ở gốc ⇒ khớp, `docs/_x.py` ⇒ không khớp (nếu mẫu `_*` là ý "chỉ ở gốc");
  - `bench/vs-claude/results/a/_FINAL.txt` ⇒ không khớp vì mẫu `!`;
  - `a/b-tmp/c.js` ⇒ khớp.
  - Test lộ lỗi thì sửa `src/scratch.ts` và ghi lại.
- Cập nhật `docs/` liên quan (cách đọc dòng hệ thống trong `ACCEPTANCE.md`; giới hạn thời gian test).

**K2 — qa-tester: review**
- Kết luận theo mẫu JSON. Khối JSON đặt **cuối** câu trả lời, đúng mẫu, để hệ thống đọc được.
- **Thử sức bắt lỗi:**
  - tạm bỏ phần đối chiếu ⇒ test lệch đỏ; trả lại ⇒ xanh;
  - tạm bỏ `--test-timeout` ⇒ test treo không thoát trong thời hạn (đỏ vì quá giờ của chính test kiểm).
- Xác nhận test cũ của nghiệm thu và vòng bổ sung vẫn xanh, không sửa kỳ vọng.

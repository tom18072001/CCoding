# Phòng Nghiên cứu, vòng 4 gói 20: phân tích E7b theo §9 và đưa vào bài báo; trả lời "model nào hợp với vai CTO"

**Gói vừa: 4 hạng mục. Ngân sách 8M token.** Giao 15/11/2026.

**Căn cứ:**
- **E7b đã chạy xong** trên máy chạy, đúng RUNBOOK: bản ghim `5911bf0c`, CLI `2.1.318`, một tiến trình, `--arms R1,R2 --arm-config … --selected …`, 128 mục × 2 arm.
  - 15/11/2026 06:59–10:07 UTC, một lần gọi `run.mjs`: 256/256 cặp `done`, 0 dòng `infra`, 0 cặp thiếu, không chạm hạn mức.
  - Trường hạ tầng mọi dòng đúng: `maxTurns` 6/16, `acceptCalls` 1, `acceptAuthSources` `["none"]`, model Sonnet/Opus.
  - Tệp chạy: `bench/vs-claude/results/e7b-cto/run/` (`runs.jsonl`, `responses/`, `config-*.json`).
  - `RUNLOG.md`: bản ghim, kiểm trước khi chạy, lượt thử, nhật ký chạy chính, số cặp theo trạng thái.
  - Người điều phối đã quét đường dẫn máy trước khi commit.
- **Đối chiếu `calls.jsonl`:** người điều phối dựng bản rút gọn chỉ gồm lượt `accept` ở `bench/vs-claude/results/e7b-cto/calls-accept/`, giữ cấu trúc `w1/`, `w2/` mà `--data` đọc. Mỗi bản ghi chỉ có các trường `taskId`, `phase`, `authSource`, `turnCapped`, `turns`, `toolCalls`, `errorKind`, `model`.
- **Người điều phối không xem kết luận hay số đo trong lúc chạy.** Chỉ đếm dòng và đọc trường hạ tầng (`status`, `acceptAuthSources`, lỗi 403).
- **Script có sẵn:** `docs/research/analysis/e7b-analyze.mjs` (BRIEF-26/26b/26c/26d), đã khóa trước khi chạy. **Không sửa** tệp này.
- **Phản biện 26d còn hai việc, chỉ ở tệp test:**
  - m1: hai test QH11 chưa kiểm `msg` của lỗi kiểm, nên chưa phân biệt được nhánh "giá trị lạ" với nhánh "thiếu ở dòng done";
  - m3: chưa có ca một arm vừa có dòng `[]` vừa có dòng thiếu trường (in `[[],null]`).

**Phạm vi:**
- **Được sửa:** `docs/research/` (`preregistration.md` chỉ **thêm** ở §9), `bench/vs-claude/results/e7b-cto/` (chỉ thêm báo cáo; không sửa `run/`, `calls-accept/`, `RUNLOG.md` phần đã ghi).
- **Không sửa:** `src/`, mã `bench/`, `docs/research/analysis/e7b-analyze.mjs`.
- **Không chạy lại E7b, không gọi LLM để đo.**
- Dữ liệu: **Nội bộ**.

**Kế hoạch:**
- Mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K4 giao cho `@peer-reviewer`, chỉ đọc.
- Mô tả hạng mục của vai chỉ đọc không nhắc tới việc thực thi lệnh, test hay script, kể cả bằng câu phủ định.
- Tệp nháp chỉ đặt trong `.scratch/`.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run lint`, `npm run test:research`.

## Hạng mục

**K1 — data-scientist: chạy phân tích đúng §9; m1, m3**
- Chạy đúng lệnh ở RUNBOOK mục 6, với `--data bench/vs-claude/results/e7b-cto/calls-accept`. Lưu nguyên văn đầu ra vào `bench/vs-claude/results/e7b-cto/report.md` và `report.json`.
- **Kiểm tái lập:** chạy lần hai ra đúng byte; ghi sha256 của hai tệp.
- **Nếu script dừng ở kiểm hạ tầng** (thoát mã 2): không sửa script, không tự loại dòng. Ghi lỗi kiểm vào báo cáo và dừng hạng mục; các hạng mục sau chỉ làm phần không cần số.
- **m1, m3:** chỉ sửa `e7b-analyze.test.mjs`. Thêm kiểm `msg` cho hai test QH11; thêm ca một arm có cả dòng `[]` và dòng thiếu trường.

**K2 — @methodologist: sai lệch lúc chạy và tính đúng của phân tích**
- Đối chiếu `RUNLOG.md` và `runs.jsonl` với §9 và bảng QH: bản ghim, lệnh, thứ tự Latin, quy tắc chạy lại, hạn mức, cặp thiếu.
- Mọi điểm lệch ghi thành khối "Sai lệch" **mới** ở §9, kèm cách báo; không đổi phép tính chính.
- Xác nhận các số trong `report.md` theo đúng định nghĩa: tính tay recall, chặn nhầm và McNemar từ bảng cặp của báo cáo; lấy 3 mục, đối chiếu kết luận với `responses/` theo định nghĩa "chặn" ở (e).
- Ghi nhánh (h) đã đọc được và lý do, theo đúng thứ tự D → E → A → B → C → F và điều kiện đứng được ở cả năm cách tính.

**K3 — academic-writer: bài báo và tài liệu**
- **`paper.md` §6.7:** điền mục E7b bằng số của `report.md`:
  - nhãn kết luận đúng như báo cáo ("khác nhau", "chưa phân biệt được", "chưa kết luận");
  - CI Clopper–Pearson và bootstrap, p thô và p Holm;
  - bảng E7 cạnh E7b ghi rõ "khác bản mã", không so như cùng đợt;
  - đủ đe dọa của §9 (l) và phụ lục; tuân câu cấm (QH36).
- **Trả lời câu hỏi gốc** của chủ dự án ("logic nghiệm thu và model nào hợp với vai CTO") trong giới hạn của nhánh (h) đã đọc. Cập nhật `docs/research/analysis/decisions/model-per-role.md`, mục vai CTO.
- `facts.json` có khóa cho mọi số chính; `CHANGELOG.md`; bản thảo lên phiên bản kế tiếp, ghi thay đổi ở đầu.

**K4 — peer-reviewer: phản biện (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- **Đọc và đối chiếu:**
  - số trong bài khớp `report.md` và `facts.json`;
  - nhánh (h) và nhãn đúng quy tắc, đứng được ở cả năm cách tính;
  - câu cấm, nhất là không viết hiệu của riêng model và không gọi E7b là lặp lại hay xác nhận E7;
  - phần trả lời câu hỏi gốc không vượt nhánh đã đọc.

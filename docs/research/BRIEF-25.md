# Phòng Nghiên cứu, vòng 4 gói 18: phân tích E9-lite [Khám phá] theo §9 và đưa vào bài báo

**Gói vừa: 4 hạng mục. Ngân sách 8M token.** Giao 15/11/2026.

**Căn cứ:**
- **E9-lite đã chạy xong** trên máy chạy, theo đúng lệnh khóa ở §9: 13 bài × `P-H`/`P-S`/`P-O` × 3 lần lặp, `--seed e9lite-1`, server riêng, `claude-cli` đăng nhập gói Max.
  - Tệp đo: `bench/vs-claude/results/e9lite/run1/`. Gồm `runs.jsonl`, `order-dry-run.txt` (thứ tự lưu trước khi chạy) và `RUNLOG.md` (bản ghim, nhật ký chạy, số dòng theo trạng thái).
  - Người điều phối đã quét đường dẫn máy trước khi commit.
- **Bản ghim:** commit `fcd45f2a`, CLI `2.1.318`; sha256 `gold.json` `ee49fc5d…` và `labels.json` `40596992…` khớp §9 (script chạy kiểm trước khi chạy).
- **Người điều phối không xem nội dung kế hoạch hay số đo trong lúc chạy;** chỉ đếm dòng và kiểm `authSource`, model khớp arm.
- **Kết quả đếm** (`RUNLOG.md`):
  - 121 dòng = 117 khóa `done` + 4 dòng `failed` ở lượt đầu: 1 Haiku, 3 Opus, trong đó `t2-orders__P-O__r3` failed hai lần;
  - cả 4 do cổng kế hoạch luật B (i) chặn (tóm tắt tự khai số hạng mục khác số phân tích được), không phải hạ tầng;
  - `authSource` 117/117 `none`, không lệch model.
- **Script và đặc tả có sẵn:**
  - `docs/research/analysis/e9lite.mjs` (có test, BRIEF-24/24b);
  - §9 các khối E9-lite: thước đo, luật khớp, bootstrap B = 4000 seed 20261115, chỉ mô tả, câu cấm, quy tắc chạy lại.

**Phạm vi:**
- **Được sửa:** `docs/research/` (`preregistration.md` chỉ **thêm** ở §9), `bench/vs-claude/results/e9lite/` (chỉ thêm báo cáo, không sửa `runs.jsonl`, `gold.json`, `labels.json`).
- **Không sửa:** `src/`, mã `bench/`.
- **Không chạy lại planner.**
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K4 giao cho `@peer-reviewer`, chỉ đọc.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run lint`, `npm run test:research`.

## Hạng mục

**K1 — data-scientist: chạy phân tích đúng §9**
- Chạy `node docs/research/analysis/e9lite.mjs --runs bench/vs-claude/results/e9lite/run1/runs.jsonl --gold … --labels …` với seed và B đã khóa. Lưu nguyên văn đầu ra vào `bench/vs-claude/results/e9lite/report.md`.
- **Báo đủ các bảng của §9:**
  - độ phủ tệp và module trên `planRaw` và `planFinal`, báo riêng hai bản;
  - chia thừa ở tầng "không chia được";
  - số hạng mục, `replanCount`, cổng đạt lần đầu (định nghĩa khối đính chính BRIEF-24b), token có trọng số;
  - theo arm; hiệu O − S và H − S theo bài, bootstrap 95 %, số bài hiệu > 0, = 0, < 0;
  - phân tầng theo nhãn chính;
  - độ nhạy `mod2Of`.
- **Phụ lục bắt buộc:**
  - mọi dòng không `done` theo arm và nguyên nhân (hạ tầng; cổng kế hoạch chặn; khác), kể cả khi khóa đó sau đó được chạy lại thành `done`;
  - `nGateNull`, `nReplanCountMissing`, số dòng `replanned === true`.
- **Kiểm tái lập:** chạy lại script lần hai ra đúng byte; ghi sha256 của `report.md`.

**K2 — @methodologist: sai lệch lúc chạy và tính đúng của phân tích**
- Đối chiếu `RUNLOG.md` và `runs.jsonl` với §9: lệnh, seed, thứ tự, bản ghim, quy tắc chạy lại.
- **Lượt `failed` do cổng kế hoạch** (không phải hạ tầng) được README cho chạy lại. Xem đăng ký có nói rõ ca này không. Nếu không, ghi một khối **mới** ở §9 mô tả ca này, kèm cách báo (tỉ lệ lượt đầu không `done` theo arm), không đổi phép tính chính.
- Xác nhận các số trong `report.md` theo đúng định nghĩa §9. Lấy 3 bài tính tay độ phủ trên `planFinal` để so.

**K3 — academic-writer: bài báo và tài liệu**
- `paper.md`: điền mục E9-lite (đã có khung, "chưa chạy") bằng số của `report.md`:
  - nhãn [Khám phá], n = 13 bài;
  - khoảng bootstrap, không p;
  - nêu đủ đe dọa của §9;
  - tuân câu cấm, nhất là không gọi đây là E9, không suy ra độ khó từ nhãn tầng.
- Trả lời câu hỏi gốc của chủ dự án ("model nào phù hợp cho vai lập kế hoạch") trong giới hạn của số liệu này. Cập nhật `analysis/decisions/model-per-role.md`.
- `facts.json` có khóa cho mọi số chính; `CHANGELOG.md`.

**K4 — peer-reviewer: phản biện (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- **Kiểm:**
  - số trong bài khớp `report.md` và `facts.json`;
  - câu cấm;
  - phụ lục lượt không `done` có đủ;
  - phần kết luận về model không vượt khoảng tin cậy.

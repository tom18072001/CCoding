# Phòng Dev, gói D19: chế độ "chỉ lập kế hoạch" và arm bench tương ứng, để đo chất lượng bóc tách theo model lập kế hoạch (E9-lite)

**Gói vừa: 4 hạng mục. Ngân sách 10M token.** Giao 14/11/2026.

**Bối cảnh:**
- E9 đã đăng ký trước (`docs/research/preregistration.md` §9.x) nhưng **không chạy được như đăng ký**: chuẩn bóc tách cần hai người gán độc lập, mà dự án không có người gán (`docs/research/decisions-2026-11-14.md` mục 3).
- Thay vào đó chạy **E9-lite [Khám phá]**: chỉ giai đoạn 1 (lập kế hoạch, không thực thi), trên các bài bench có lời giải mẫu. Chuẩn bóc tách suy tất định từ khác biệt giữa `repoDir` và `solutionDir`.
- Phòng Nghiên cứu ghi đăng ký và phân tích (BRIEF-24). Gói này làm phần mã.

**Phạm vi:**
- **Được sửa:** `src/`, `test/`, `docs/` (trừ `docs/research/`), và mã harness trong `bench/vs-claude/` (không sửa `results/`).
- Không chạy benchmark thật, không gọi `claude -p` thật; test bằng runtime giả.
- Dữ liệu: **Nội bộ**.

## Hạng mục

**K1 — backend-dev: tùy chọn nhiệm vụ `planOnly`**
- Với `options.planOnly: true`, nhiệm vụ chạy định tuyến, chọn làn, lập kế hoạch và cổng kế hoạch (kể cả sửa kế hoạch), rồi **dừng**. Không có thực thi, review, nghiệm thu hay tổng hợp.
- Trạng thái kết thúc `done`, kèm `run.planOnly = true`.
- Lưu vào `task.json`:
  - `run.planRaw`: kế hoạch đúng như planner trả, trước khi sắp lại cho làn nhanh và trước cổng;
  - `run.planFinal`: kế hoạch sau sắp lại và cổng;
  - `run.planGate`;
  - model đã dùng ở pha `plan`;
  - usage của các lượt.
- Tùy chọn `options.planModel` (`haiku` | `sonnet` | `opus`) ghi đè model của pha `plan` cho riêng nhiệm vụ đó, trên mọi làn. Ghi vào log.
- Không ghi `FINAL.md`; không tính vào "nhiệm vụ cần xem".
- Test bằng runtime giả trên làn nhanh và làn đầy: không có lượt `execute` nào, có `planRaw`/`planFinal`, model ghi đè đúng.

**K2 — backend-dev: arm bench chỉ lập kế hoạch**
- Thêm arm vào harness `bench/vs-claude`, theo cấu trúc hiện có:
  - `P-H`, `P-S`, `P-O`: cùng cấu hình, chỉ khác `planModel`;
  - chạy CCoding với `planOnly`, làn nhanh như arm B6 hiện tại; ghi chú nếu cần ép làn.
- Mỗi lượt ghi một dòng `runs.jsonl` gồm:
  - khóa (bài, arm, lần lặp);
  - `planRaw`, `planFinal` (danh sách hạng mục: id, tiêu đề, người nhận, `dependsOn`, tệp nêu trong mô tả);
  - `planGate`, số lần sửa kế hoạch;
  - usage, model thật, `authSource`, mã băm cấu hình, phiên bản CLI.
- Thứ tự (bài × arm × lần lặp) xáo theo khối bài với seed truyền vào. Chạy tiếp được sau khi dừng.
- **Không in điểm.** Chạy với `--runtime mock` cho test.
- Tài liệu cách chạy: `bench/vs-claude/README.md`.

**K3 — senior-swe: trích chuẩn bóc tách từ lời giải mẫu (công cụ, không quyết định thiết kế đo)**
- Script `bench/vs-claude/e9/gold-from-solution.mjs`. Với mỗi bài có `repoDir` và `solutionDir`, liệt kê:
  - tệp khác nhau giữa hai thư mục (thêm, sửa, xóa);
  - với mỗi tệp: số dòng đổi và module (thư mục cấp một của tệp);
  - `task.size` và `sizeBasis`.
- Đầu ra JSON có sắp xếp ổn định và mã băm.
- **Không** gán nhãn chia được hay không, **không** chọn bài. Việc đó thuộc đăng ký của Phòng Nghiên cứu.
- Test trên một bài mẫu nhỏ trong `test/fixtures/`.

**K4 — qa-tester: review K1–K3**
- Kết luận theo mẫu JSON. Kiểm riêng:
  - `planOnly` không để lọt lượt thực thi nào;
  - `planModel` không làm đổi model của pha khác;
  - harness ghi `authSource`.
- 🧪 `npm run typecheck`, `npm test`, `npm run test:bench` phải xanh.

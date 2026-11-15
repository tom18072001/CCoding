# Phòng Dev, D11: làm hết các mục rà soát bộ đo còn mở (SR-01…SR-27 trong `docs/research/suite-review.md` §5)

**Nhiệm vụ lớn, nhiều phần độc lập.** Trưởng phòng lập kế hoạch nhiều hạng mục và chạy song song theo đồ thị phụ thuộc.
- Ngân sách: 20M token.
- Chỉ làm trên nhánh `perf/vs-claude-loop`. Phân loại dữ liệu: **Nội bộ**.

## Căn cứ
- **Quyết định của giám đốc (3/11 19:56):** "đã là đề tài thì phải fix hết, không để đề xuất sửa".
- **D9 đã làm hết backlog B-xx.** Danh sách SR của `suite-review.md` §5 vẫn còn nhiều mục "chưa xong; dùng phương án lùi" theo `preregistration.md` §9: SR-01…SR-08a, SR-26 và SR-25 là P0; SR-09…SR-19 là P1; SR-20…SR-27 là P2.
- **Phạm vi file:**
  - D10 (chạy song song) sửa `src/runtimes/claude-cli.ts`, `src/selfimprove.ts`, và hàm `gateDecisions()` trong `bench/vs-claude/lib/ccoding.mjs`.
  - D11 **không sửa `gateDecisions()`**. Nếu cần sửa chỗ khác trong `lib/ccoding.mjs` thì sửa riêng phần đó để gộp sạch.

## Yêu cầu
1. **Kiểm từng SR trước khi làm.** Ghi bảng "SR → trạng thái → commit" vào `docs/research/context/d11-suite-review-2026-11-04.md`, mỗi SR đúng một trạng thái:
   - **đã có:** trỏ commit hoặc dòng mã. Ví dụ SR-02 có thể đã có một phần nhờ B-13 ghi `model` theo pha.
   - **làm trong D11:** ghi commit.
   - **cần người:** ghi việc cần người làm. Ví dụ phần đối chiếu nhãn người của SR-08a cần giám đốc gán.
2. **Làm mọi SR không cần người.** Mỗi SR có test, và commit ghi mã SR-xx. Trọng tâm:
   - **SR-01, SR-03, SR-19:** trường `excluded` và lọc `done`. Mỗi dòng ghi hash CCoding, phiên bản `claude` CLI, model thực, `window`, `quotaState`, nguyên nhân `failed`, timeout.
   - **SR-02:** `costUsd` cho arm CCoding theo bảng giá có phiên bản và `model` từng lượt gọi. Bảng giá đã kiểm:
     - Sonnet 5.5: vào $2, ra $10.
     - Opus 5.5: vào $4, ra $20.
     - Đọc cache: 0,05×.
     - Ghi cache: 1 giờ 2× hoặc 5 phút 1,25×.
     - Công thức 1 giờ khớp đúng `costUsd` của A0-sonnet, ví dụ khóa `t5-logq__A0-sonnet__r1` = 0,33854.
   - **SR-04, SR-26 (và SR-12 cho H6):**
     - TOST dùng chung.
     - p hoán vị hai mẫu chính xác cho H3.
     - p bootstrap tương đương cho H6, **đúng quy tắc trần và suy biến v2.1 (a)–(d)** ở `preregistration.md` §2.5: p = NA khi Δ\* suy biến, không bao giờ in 1/(B + 1) vì trần.
     - Test theo các ca đã nêu ở đó.
   - **SR-06, SR-07:** sửa lệch chỉ số H5; khóa chế độ chấm.
   - **SR-05:** định nghĩa `size`, `sizeBasis`.
   - **SR-25:** hoán vị phân tầng theo lượt cho H1′, H2′.
   - **P1 và P2:** SR-09…SR-24, SR-27, theo đúng cột "Sửa" của `suite-review.md`. Mục nào cần thêm bài (SR-11) thì dựng bài như g1–g6: có `task.json`, test ẩn, lời giải tham chiếu, oracle 1,00, null thấp.
3. **Không đổi số đã công bố một cách âm thầm.**
   - Sau khi sửa `analyze.mjs` và các script phân tích, chạy lại trên dữ liệu cũ: `results/study-cloud`, `study-cloud-final`, `b7prime`.
   - Ghi bảng "số cũ → số mới → lý do" vào tài liệu D11 cho Phòng Nghiên cứu.
   - **Không sửa `docs/research/paper/`.**
4. **Giữ tương thích:** dữ liệu `runs.jsonl` cũ vẫn đọc được, và các lệnh kiểm của dự án `ccoding-research` vẫn exit 0.

## Kiểm tra
- `npm run typecheck` và `npm test` xanh, chạy 3 lần.
- `node bench/vs-claude/run.mjs --arms oracle,null --repeats 1` cho oracle 1,00 trên mọi bài, kể cả bài mới.
- Ba lệnh kiểm của `ccoding-research` exit 0.

## Không làm
- Không chạy benchmark thật hay `claude -p`.
- Không sửa `docs/research/paper/`.
- Không đổi biên, ngưỡng hay hạt giống đã đăng ký trước.

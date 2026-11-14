# Phòng Dev, D9: làm hết các đề xuất còn mở trong backlog (B-03, B-07, B-08, B-09, B-12, B-13, B-14, B-16, B-17) và các bản vá chưa áp dụng

**Nhiệm vụ lớn, nhiều phần độc lập.** Trưởng phòng lập kế hoạch nhiều hạng mục, chạy song song theo đồ thị phụ thuộc. Ngân sách 20M token.
- Chỉ làm trên nhánh `perf/vs-claude-loop`, không đẩy lên `main`.
- Phân loại dữ liệu: **Nội bộ**. Data Protection Gate theo AGENTS.md.

## Căn cứ
- **Quyết định của giám đốc (3/11 19:56):** "các đề xuất đã có thì cứ sửa đi; đã là đề tài thì phải fix hết, không để đề xuất sửa."
- Đặc tả, bằng chứng và cách kiểm của từng mục nằm ở `docs/research/improvement-backlog.md`:
  - các mục §B-03, B-07, B-08, B-09, B-12…B-17;
  - `docs/research/analysis/cache-diagnostic-spec.md`, `acceleration-crosscheck.md`, `agreement.md` §(c);
  - các bản vá trong `docs/research/dev-review/patches/` (D-01…D-03) và P1–P4 của `docs/research/dev-review.md` §6.
- **Nguyên tắc:**
  - Thay đổi hành vi đặt **sau công tắc cấu hình**.
  - Mặc định theo khuyến nghị của backlog. Mục nào backlog ghi "cần giám đốc duyệt" thì để **tắt** mặc định.
  - Mỗi commit ghi mã B-xx. Mỗi mục có test.
  - Mọi lượt gọi LLM vẫn đi qua `Orchestrator.call()`; log vẫn qua `LogStore`.

## Hạng mục

1. **B-07 (D-01):** trần lượt cho runtime `claude-cli`.
   - Truyền `--max-turns` theo pha từ cấu hình, ngang trần vòng công cụ của runtime API.
   - Có test dựng lệnh.
2. **B-08 (G3, G4):**
   - Hook dùng `cwd` có trong sự kiện để tính đường dẫn tương đối.
   - Cho phép Read tệp tool-results của chính phiên.
   - Giữ chặn đường dẫn ngoài worktree. Test đối kháng: `../`, symlink, phiên khác.
3. **B-03 (P4):** nhật ký sự cố có cấu trúc ở pha sửa (revise): lỗi gì, nguyên nhân, cách sửa, lệnh kiểm.
   - Ghi qua `LogStore`.
   - Đây là dữ liệu đầu vào cho vòng tự cải thiện (RQ5).
4. **B-09 (P1, P2):** giới hạn đầu ra và tín hiệu dừng khảo sát, sau công tắc, **mặc định tắt**.
5. **B-13:**
   - **Bench:** `runs.jsonl` ghi `model` theo pha, và `byPhase` đủ bốn thành phần token (input, cacheRead, cacheWrite, output) cùng thời gian theo pha.
   - **Ứng dụng:** chỉ số trúng cache `cacheRead / (cacheRead + cacheWrite + input)` theo lượt gọi, pha và runtime trên trang Token và trong KPI v2.
   - Giữ tương thích ngược: `analyze.mjs` và `prereg-tests.mjs` vẫn đọc được dữ liệu cũ.
   - Không đổi trường hiện có.
6. **B-14:**
   - **(a) Script chẩn đoán** `bench/vs-claude/cache-diagnostic.mjs`, đúng Phần 1 của `cache-diagnostic-spec.md`:
     - 3 cặp gọi, tối đa 8 lượt `claude -p`, dựng đúng cờ của `src/runtimes/claude-cli.ts`;
     - in cacheWrite và cacheRead của từng lượt.
     - Script **chỉ được viết và test bằng dữ liệu giả**, không chạy thật trong nhiệm vụ này: hook chặn `claude` là đúng. Người điều phối sẽ chạy ngoài hook.
   - **(b) Công tắc ổn định tiền tố** `runtimes.claude-cli.stablePrefix`, **mặc định tắt**:
     - giữ một bộ công cụ cho cả nhiệm vụ, hook chặn theo pha;
     - các pha không sửa tệp chạy ở thư mục gốc của nhiệm vụ.
7. **B-12:** bộ bài cài lỗi để đo recall của cổng (B-02, B-10, CTO).
   - **Bài:** ít nhất 6 bài trong `bench/vs-claude/tasks/`, mỗi bài có lỗi cài sẵn và nhãn thật.
   - **Phân loại lỗi:**
     - lệnh kiểm tra đỏ;
     - kế hoạch bỏ sót tệp hoặc module;
     - đầu ra sai mà test công khai vẫn xanh. Chỉ test ẩn bắt được loại này.
   - **Arm:** thêm vào `arms.json`.
   - **Ghi quyết định của cổng vào `runs.jsonl`:** B-02 chặn hay cho qua, số vòng sửa, B-10 chặn hay không, CTO đạt hay không đạt.
   - **Tự kiểm:** oracle phải 1,00, null phải thấp.
8. **B-16:** arm `B7cabO` (làn đơn + nghiệm thu brief + `phaseModels.accept: opus`) trong `arms.json`. Không đổi mặc định.
9. **B-17:** chọn model lập kế hoạch theo độ khó 1–3, tính từ tín hiệu tất định đã có của bộ chọn làn. Đặt sau công tắc, **mặc định tắt**.
10. **Bản vá còn lại:**
    - Kiểm D-01…D-03 và P1–P4: bản nào chưa có trong `src/` thì áp dụng, hoặc gộp vào các mục trên.
    - Ghi bảng "bản vá → trạng thái → commit" vào `docs/research/context/patches-status-2026-11-03.md`.

## Kiểm tra
- `npm run typecheck` và `npm test` phải xanh. Test mới cho từng mục.
- `node bench/vs-claude/run.mjs --arms oracle,null --tasks <bài B-12> --repeats 1` phải cho oracle 1,00.
- Viết `docs/research/context/d9-implementation-2026-11-03.md` cho Phòng Nghiên cứu, mỗi mục ghi:
  - mã B-xx;
  - công tắc và giá trị mặc định;
  - tệp và commit;
  - test;
  - việc còn cần đo, nếu có.

## Không làm
- Không chạy benchmark thật, không gọi `claude -p`.
- Không bật mặc định (a-brief), (b), `stablePrefix`, B-09, B-17.
- Không sửa `docs/research/paper/`.

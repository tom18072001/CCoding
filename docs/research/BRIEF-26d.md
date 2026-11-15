# Phòng Nghiên cứu, gói 19d: chỗ dẫn mã của RUNBOOK và script E7b theo bản có D24; nhãn QH11; ca P5 chiều ngược

**Gói nhỏ: 2 hạng mục. Ngân sách 2M token.** Giao 15/11/2026.

**Căn cứ:** biên bản CTO của BRIEF-26c (đã nghiệm thu; BRIEF-26, 26b, 26c đã gộp vào `perf/vs-claude-loop` ở `4bb5a122`, có D24). Còn ba việc nhỏ phải xong **trước khi ghim E7b**, vì sau khi thấy số thì không sửa script nữa.
- **Chỗ dẫn mã viết theo bản trước D24.** `RUNBOOK.md:13`, `:15`, `:16`, `:85`, `:110`, `:112`, `:113` và `e7b-analyze.mjs:10`, `:12`, `:13`, `:67`, `:69` dẫn `bench/vs-claude/e7/lib.mjs:…` và `run.mjs:…` bằng số dòng cũ. Sau D24, `runCto` chuyển từ khoảng `:215` xuống khoảng `:230`, còn `run.mjs` lệch khoảng 38–43 dòng.
- **QH11 in nhãn `(thiếu)`** cho dòng `done` có `acceptAuthSources` là `[]` (`e7b-analyze.mjs:110`). Kiểm vẫn dừng đúng; chỉ giá trị in ra sai, phải in giá trị thật (`[]` hay không có trường).
- **Ca P5 xuyên suốt mới có một chiều** (`e7b-analyze.test.mjs:201-222`: McNemar có ý nghĩa, CI chứa 0). Chiều ngược (CI không chứa 0, McNemar không có ý nghĩa) chưa có ca xuyên suốt.
- Không đụng các chỗ dẫn trong `preregistration.md`: đó là văn bản đã khóa, dẫn mã ở thời điểm ghi.

**Phạm vi:**
- **Được sửa:** `docs/research/analysis/e7b-analyze.mjs`, `docs/research/analysis/e7b-analyze.test.mjs`, `bench/vs-claude/results/e7b-cto/RUNBOOK.md`, `docs/research/CHANGELOG.md`.
- **Không sửa:** `preregistration.md`, `preregistration.lock.json`, `src/`, mã `bench/`. Không đổi luật hay phép tính.
- **Không chạy LLM để đo.** Không tạo tệp nháp hay script tạm nào trong cây làm việc.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:**
- Mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K2 giao cho `@peer-reviewer`, chỉ đọc.
- Mô tả hạng mục của vai chỉ đọc không nhắc tới việc thực thi lệnh, test hay script, kể cả bằng câu phủ định.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run lint`, `npm run test:research`.

## Hạng mục

**K1 — data-scientist: sửa chỗ dẫn, nhãn QH11, thêm ca P5**
- **Chỗ dẫn mã:** mỗi chỗ dẫn ghi **tên ký hiệu** (vd. `runCto`, `acceptStats`, `EXIT_RATE_LIMIT`, `ARM_DIR`) cùng số dòng đúng trên bản hiện tại. Rà mọi chỗ dẫn `lib.mjs:`, `run.mjs:`, `src/…:` trong hai tệp, không chỉ các dòng ở căn cứ.
- **QH11:** in giá trị thật cho dòng `done` không xác nhận được. Thêm test cho hai ca `[]` và không có trường.
- **P5 chiều ngược:** thêm một ca xuyên suốt qua `analyzeE7b` có CI bootstrap không chứa 0 mà McNemar không có ý nghĩa ⇒ nhãn "chưa kết luận" và nhánh F. Ca không nằm sát biên CI; ghi khoảng cách tới biên trong chú thích test.
- CHANGELOG ghi ba việc này.
- Báo cáo liệt kê `git status` cuối và danh sách chỗ dẫn cũ → mới.

**K2 — peer-reviewer: phản biện (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- **Đọc và đối chiếu:**
  - mỗi chỗ dẫn trong hai tệp trỏ đúng ký hiệu trên bản hiện tại (mở tệp mã và so);
  - phép tính và luật không đổi: diff của `e7b-analyze.mjs` chỉ chạm chú thích và chuỗi in của QH11;
  - hai ca test mới kiểm đúng điều căn cứ nêu;
  - không có tệp ngoài phạm vi.

# Phòng Nghiên cứu, vòng 4 gói 19: đăng ký E7b, đo lại CTO nghiệm thu trên bản mã hiện tại, trước khi chạy

**Gói vừa: 4 hạng mục. Ngân sách 6M token.** Giao 15/11/2026.

**Căn cứ:**
- **E7** (`bench/vs-claude/results/e7-cto/report.md`), 64 mục lỗi lọt cổng và 64 mục đúng:
  - **R1** (CTO Sonnet): chặn 98,4 % lỗi, nhưng **chặn nhầm 42,2 %** sản phẩm đúng.
  - **R2** (CTO Opus): chặn nhầm 6,3 %, recall 85,9 %. Có 13 lượt **không đọc được** vì Opus chạm trần 6 lượt công cụ ở pha `accept`, nên recall của R2 chưa đọc được sạch.
- Chặn nhầm của CTO là điểm fail lớn nhất còn mở trong bảng "Hệ thống fail ở đâu" (deck slide 24). Câu hỏi gốc của chủ dự án: logic nghiệm thu và model nào hợp với vai CTO.
- Bản mã đã đổi nhiều từ lúc đo E7 (D15–D23: lượt có `error` không dùng văn bản làm kết quả, vòng bổ sung, trần lượt theo pha, hết giờ khác hết hạn mức…). Không được so trực tiếp E7 cũ với bản mới như cùng đợt.
- **Harness có sẵn:** `bench/vs-claude/e7/` (README mục E7). R1, R2 chạy CCoding thật trong tiến trình, `Orchestrator.resume(…, { from: 'accept' })`.
  - Model pha `accept` đặt theo arm.
  - Trần lượt `accept` lấy từ cấu hình app (`phases.toolTurns.accept`), đổi được bằng tệp cấu hình của bản ghim mà không sửa mã.
  - Mục đã chốt: `results/e7-cto/selected.json`.

**Phạm vi:**
- **Được sửa:** `docs/research/` (`preregistration.md` chỉ **thêm** ở §9), `bench/vs-claude/results/e7b-cto/` (mới, chỉ tệp đăng ký và script phân tích, chưa có dữ liệu chạy).
- **Không sửa:** `src/`, mã `bench/`.
- **Không chạy LLM để đo** trong gói này; người điều phối chạy sau khi gói được gộp.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K4 giao cho `@peer-reviewer`, chỉ đọc.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run lint`, `npm run test:research`.

## Hạng mục

**K1 — @methodologist: đăng ký E7b ở §9 trước mọi lượt chạy**

Khối mới ở §9 (chỉ thêm), gồm:

**Câu hỏi.** Trên bản mã hiện tại, CTO nghiệm thu:
- (i) bằng Sonnet có còn chặn nhầm nhiều không;
- (ii) bằng Opus với trần lượt `accept` đủ cao có giữ chặn nhầm thấp mà recall không thấp hơn Sonnet nhiều.

**Arm:**
- `R1b`: Sonnet, trần lượt như cấu hình hiện hành;
- `R2b`: Opus, trần lượt `accept` nâng lên một giá trị **khóa trước**, kèm lý do từ số lượt cần đọc mã ở E7.
- Cùng 128 mục của `selected.json`, cùng đợt, cùng bản ghim, xen kẽ theo seed khóa.
- Có chạy lại R3 (Claude Code đơn) không: quyết định và ghi lý do.

**Thước đo:**
- recall trên 64 mục lỗi;
- tỉ lệ chặn nhầm trên 64 mục đúng;
- số lượt không đọc được và chạm trần theo arm;
- chi phí USD theo `pricing.mjs`.
- Báo Youden J chỉ mô tả.

**Phân tích:**
- cặp theo mục (McNemar hoặc bootstrap theo bài), khóa trước;
- nhãn kết luận (khác nhau / chưa phân biệt được);
- không gộp với E7 cũ; so với E7 chỉ mô tả, ghi rõ khác bản mã.

**Ngưỡng diễn giải khóa trước:** vd. nếu `R2b` chặn nhầm ≤ 10 % và recall ≥ 90 % thì đề xuất đổi model CTO.

**Quy tắc dừng, chạy lại, câu cấm và đe dọa:**
- dừng và chạy lại theo E7, gồm lỗi xác thực 403 và lẫn `authSource`;
- câu cấm và danh sách đe dọa viết đủ.

**K2 — data-scientist: chuẩn bị chạy và script phân tích**
- Tệp cấu hình cho bản ghim của từng arm, chỉ khác model và trần lượt `accept`. Lưu ở `bench/vs-claude/results/e7b-cto/` kèm sha256; không có khóa, không có đường dẫn máy.
- Lệnh chạy đầy đủ (theo README E7) ghi vào `bench/vs-claude/results/e7b-cto/RUNBOOK.md`: chạy thử một mục dự phòng, chạy chính, phân tích.
- **Nếu harness hiện có không đặt được trần lượt theo arm** mà không sửa mã thì dừng và ghi rõ việc Dev cần làm. Không sửa mã `bench/`.
- **Script phân tích:**
  - dùng lại `e7/analyze.mjs` nếu được, hoặc script mới ở `docs/research/analysis/`;
  - có test trên dữ liệu giả với đáp án biết trước;
  - không in gì khi chưa có `runs.jsonl` thật.

**K3 — academic-writer: chỗ trong bài và deck**
- `paper.md`: thêm mục khung E7b ("chưa chạy"), không có số.
- `facts.json`, `CHANGELOG.md` đồng bộ.

**K4 — peer-reviewer: phản biện thiết kế (chỉ đọc)**
- Dòng đầu: `**Kết luận:** Đạt`, `Sửa nhỏ` hoặc `Chưa đạt`.
- **Kiểm:**
  - mọi lựa chọn (trần lượt, ngưỡng diễn giải, phép kiểm) được khóa trước khi chạy và có lý do;
  - không so lẫn E7 cũ như cùng đợt;
  - hai arm chỉ khác model và trần lượt;
  - câu cấm đủ.

# Phần thêm cho `run-plan.md`: §10 E9 và chấm lại sau khi Dev sửa (BRIEF-22, K6)

> **Hướng dẫn chèn** (dành cho vai có công cụ sửa tệp; `run-plan.md` dài khoảng 87 KB, K6 không ghi đè an toàn được):
> 1. Chèn **Khối A** ngay sau dòng 4 của `run-plan.md` (dòng "> Cập nhật BRIEF-20 K3 …").
> 2. Chèn **Khối B** ngay sau dòng cuối của mục "## Tóm tắt" (dòng "- **Trạng thái 14/11/2026 (BRIEF-20 K3):** …"), trước dòng trống và `## Tệp đã lưu`.
> 3. Chèn **Khối C** ngay trước dòng `## Giới hạn`, tức sau §9 KPI.
> 4. Chỉ thêm dòng. Kiểm `git diff --numstat docs/research/run-plan.md`: cột xóa bằng 0.
>
> Các đợt ở Khối C khớp `improvement-backlog.md` B-41…B-49 (`analysis/decisions/backlog-b20-insert.md`) và `analysis/decisions/report.md` TN1–TN9.

---

## Khối A

> Cập nhật BRIEF-22 K6 (T-20261114-162216-35d, @research-lead, 14/11/2026): thêm dòng cuối của Tóm tắt và **§10** (E9; chấm lại sau khi Phòng Dev sửa xong danh sách FX1–FX21; các đợt mới B-41…B-49). Không đổi lệnh, N hay quy tắc nào của các mục cũ. Không chạy benchmark, không gọi `claude -p`.

## Khối B

- **Bổ sung 14/11/2026 (BRIEF-22 K6):** §10 xếp hai việc. (1) **E9** (`preregistration.md` §9.x, B-41) đã đăng ký nhưng chưa chạy. Giai đoạn 1 có 576 lượt chỉ lập kế hoạch và cần giám đốc duyệt ngân sách cùng hai người gán chuẩn. (2) **Chấm lại** (B-49) sau khi Dev gộp D17, D16b và gói lỗi vặt: KPI mới, `decomp-metrics.mjs`, `scorecard.mjs --check`, đối chiếu tiêu chí xong của từng mục FX. Không có lượt bench nào được xếp lịch trong gói này.

## Khối C

## 10. E9 và chấm lại sau khi Phòng Dev sửa (thêm 14/11/2026, BRIEF-22 K6)

Nguồn: `analysis/decisions/report.md` mục 6, `improvement-backlog.md` §0.2 và B-20…B-49, `preregistration.md` §9.x. Mục này chỉ là kế hoạch, chưa chạy gì.

### 10.1 E9: chất lượng bóc tách và planner mạnh (B-41, TN1)

| Bước | Nội dung | Điều kiện bắt đầu | Ai |
|---|---|---|---|
| 0 | Đăng ký §9.x đã commit trước mọi bước dưới đây (đã có trong nhánh BRIEF-22) | — | Phòng Nghiên cứu |
| 1 | Soạn 64 bài: 32 chia được (≥ 3 đơn vị độc lập theo chuẩn), 32 không chia được. Bài lấy từ `bench/vs-claude/tasks` cộng bài mới do Phòng Dev soạn | Giám đốc chỉ định hai người gán chuẩn | Phòng Dev soạn bài; hai người gán |
| 2 | Hai người gán kế hoạch chuẩn độc lập; tính κ; người thứ ba quyết các bài bất đồng | κ ≥ 0,6, nếu thấp hơn thì làm lại hướng dẫn gán, không chạy | Hai người gán, @data-scientist tính κ |
| 3 | Băm và commit 64 kế hoạch chuẩn, script phân tích và seed thứ tự arm **trước** lượt đầu | Bước 2 đạt | @data-scientist |
| 4 | Harness có chế độ "chỉ lập kế hoạch" và ghi được cả kế hoạch thô (trước `shapeFastPlan`/`planGate`) lẫn kế hoạch cuối. **[CHƯA KIỂM CHỨNG]** bench hiện có chế độ này hay chưa | Nếu chưa có: Phòng Dev thêm (sửa `bench/`, ngoài phạm vi Phòng Nghiên cứu) | Phòng Dev |
| 5 | **Giai đoạn 1:** 64 bài × 3 arm (P-S Sonnet, P-O Opus, P-H Haiku) × 3 lặp = **576 lượt** chỉ gọi khâu `plan`. Ghi `authSource` và hash cấu hình mỗi lượt; trần lượt giống nhau mọi arm | Giám đốc duyệt ngân sách token (§9.x: "chưa có số"). @data-scientist ước lượng trước từ `byPhaseTokens.plan` của các đợt đã có, để giám đốc duyệt con số cụ thể | Người chạy do giám đốc chỉ định |
| 6 | Phân tích H1, H2 (bootstrap theo bài, Wilcoxon một phía, Holm) | Đủ 64 bài, không xem giữa chừng | @data-scientist |
| 7 | **Giai đoạn 2** (F-S, F-O, A0 cùng đợt, xen kẽ) chỉ khi H1 hoặc H2 có hiệu đúng chiều với CI 95 % không chứa 0 ở ít nhất một tầng, **và** giám đốc duyệt chi phí | Bước 6 | Giám đốc quyết |

**Điều kiện dừng** (chép từ §9.x, không đổi):
- `authSource` lẫn khóa API ở bất kỳ arm nào;
- quá ngân sách đã khóa;
- chưa đủ 64 bài chuẩn;
- κ < 0,6.

**Thứ tự với việc khác:** chạy sau B-25 (FX6, trần lượt của reviewer) và B-37 (FX18, ghi đúng model theo làn). Hai mục này không chặn E9 giai đoạn 1 về kỹ thuật, nhưng tránh lặp lại tình trạng trần lượt che hiệu model như ở E7 (đe dọa 7 của §9.x).

### 10.2 Chấm lại sau khi Phòng Dev sửa xong (B-49, TN9)

**Khi nào chạy.** Khi đã gộp xong D17, D16b và gói lỗi vặt (đề xuất tên "D18"), gồm FX2, FX4, FX5 (b), FX7 phần còn lại, FX14–FX18. Các mục cần chẩn đoán trước (FX8–FX13) và FX21 được chấm lại khi xong, mỗi mục ghi trạng thái riêng.

| Bước | Lệnh / việc | Tiêu chí đạt | Ghi chú |
|---|---|---|---|
| 1 | `npm run typecheck`, `npm test` trên nhánh đã gộp | exit 0 | Phòng Dev chạy; ghi hash commit |
| 2 | Kiểm phát lại **không gọi LLM**: các test mới của FX1, FX3, FX4, FX5, FX6, FX7, FX14, FX15, FX16. Đầu vào là đề bài và kế hoạch **tổng hợp** theo dạng ba ca 14/11, không dùng nội dung nhiệm vụ thật | Mọi test có tên trong cột "Test" của `report.md` mục 6.1 đều có và xanh | Dữ liệu Nội bộ: fixture tổng hợp, không chép đề bài thật |
| 3 | Xuất KPI v2 mới của văn phòng phụ, chỉ gồm nhiệm vụ tạo **sau** commit gộp cuối. Lưu thành tệp mới trong `bench/vs-claude/results/decisions/` (không ghi đè `kpi-office.json` cũ) | Cửa sổ có ≥ 10 nhiệm vụ đã xong và ≥ 112 lượt gọi, bằng cỡ cửa sổ hiện tại (đề xuất) | Lệnh xuất KPI toàn văn phòng: `node dist/cli.js kpi … --json`. Cờ chọn cửa sổ **[CHƯA KIỂM CHỨNG]**; người chạy ghi lệnh thật vào RUNLOG |
| 4 | `decomp-metrics.mjs` trên các lượt phòng mới của văn phòng phụ; tệp tổng hợp mới cạnh `decomp-agg.json` | Có số độ phủ hạng mục, độ phủ vai, bỏ review, nghiệm thu | Dữ liệu từng lượt không vào repo, chỉ số tổng hợp |
| 5 | `scorecard.mjs --write`, sau đó `--check` trên đầu vào mới (cần thêm tham số đường dẫn vào nếu script đang đọc đường cố định) | `--check` exit 0; đủ mọi agent của tệp KPI mới | Sửa script là việc của @data-scientist (`docs/research/analysis/decisions/`) |
| 6 | Bảng đối chiếu "trước → sau" cho từng FX theo cột "Tiêu chí xong", lưu ở `analysis/decisions/rescore-<ngày>.md` | Mỗi FX ghi "đạt" hoặc "chưa đạt" kèm lý do | [Mô tả]: trước và sau là các nhiệm vụ khác nhau, nên không có p và không kết luận nhân quả |
| 7 | Ba lệnh kiểm tra của dự án Nghiên cứu (`consistency-check.mjs`, `token-analysis.mjs --check`, `stats.test.mjs`) cộng `scorecard.mjs --check` | exit 0 cả bốn | — |

**Chỉ số chính để đọc lại** (giá trị hiện tại lấy từ `scorecard.md`):

| Chỉ số | Hiện tại | Mục tiêu sau sửa |
|---|---|---|
| Độ phủ hạng mục đề bài | 12/15 | n/n |
| Độ phủ vai | 3/7 | n/n |
| Lượt phòng bỏ review khi đề bài đòi review | 2/5 lượt phòng bỏ review (chưa tách theo việc đề bài có đòi hay không) | 0 |
| Lượt phòng được nghiệm thu | 1/5 | tăng; ghi số, không đặt ngưỡng vì phụ thuộc đề bài |
| Lượt gọi bị cắt | 27/112 = 24,1 % | ≤ 10 % (đề xuất) |
| Reviewer: kết luận không đọc được | `qa-tester` 1 | 0 |
| `tasksCounted` so với tổng `tasksByStatus` | 7 so với 10 | bằng nhau, hoặc có định nghĩa |

### 10.3 Đợt mới từ BRIEF-22 (bổ sung bảng §5.4.6)

Không đợt nào dưới đây được chạy trong gói BRIEF-22. Thứ tự theo `report.md` mục 10.

| Đợt | Backlog | Trạng thái | Điều kiện mở | Ai quyết |
|---|---|---|---|---|
| **E9** giai đoạn 1 | B-41 | Đã đăng ký (§9.x), chưa chạy | §10.1 bước 1–4; giám đốc duyệt ngân sách | Giám đốc |
| **E7-R2 với trần lượt cao hơn** | B-42 (thay dòng "Đo lại CTO Opus (R2)" của §5.4.6) | Chưa đăng ký | Đăng ký §9 trước lượt đầu; B-25 đã gộp; `authSource` ghi ở mọi arm; giám đốc duyệt chi phí Opus | Giám đốc |
| **Độ đúng reviewer** | B-43 | Chưa đăng ký | Bộ review có đáp án (mở rộng B-12); B-25 đã gộp | Phòng Nghiên cứu soạn, giám đốc duyệt |
| **Độ đúng định tuyến** | B-44 | Chưa đăng ký | Có người gán nhãn phòng đúng | Giám đốc chỉ định người gán |
| **Ma trận nhầm làn** | B-45 | Chưa đặc tả | Không gọi LLM; cần tập đề bài đã gán làn | Phòng Nghiên cứu |
| **Phân rã vượt đường găng** | B-46 | Chưa giao | Không gọi LLM; chạy trên dữ liệu từng lượt ở máy giám đốc | Phòng Nghiên cứu |
| **Bench ghi đủ trường chia việc** | B-48 | Chờ đợt bench mới | Có đợt bench mới được duyệt | Giám đốc |
| **Chấm lại** | B-49 | Chờ Dev | §10.2 | Phòng Nghiên cứu, sau khi Dev gộp |

# Đề bài vòng 3, gói 1, cho Phòng Nghiên cứu (2/11/2026): đăng ký trước giả thuyết, làm mới số liệu, backlog nâng cấp dựa trên bằng chứng

## Nguyên tắc từ giám đốc
**Mọi nâng cấp hệ thống phải dựa vào nghiên cứu.** Vòng làm việc như sau:
1. Có dữ liệu.
2. Phòng Nghiên cứu phân tích và xếp hạng.
3. Phòng Dev làm, mỗi thay đổi ghi mã mục backlog.
4. Chạy benchtest theo kế hoạch đã đăng ký để kiểm lại.

Gói này tạo nền cho vòng đó. Gói nhỏ: **tối đa 4 hạng mục, mỗi hạng mục một tệp sản phẩm**. Ngân sách 6M token.

**Quyết định của giám đốc (2/11, 13:42):**
- Việc nhỏ dùng **agent đơn** ("làn đơn"); việc lớn mới dùng multi-agent.
- Nhiệm vụ của hệ thống:
  - **tối ưu chi phí**;
  - **có các cổng kiểm thử chất lượng (quality gate)**;
  - **đi đúng cách đánh giá (KPI) và mẫu đầu ra (template)** của giám đốc.
- Hai mục bắt buộc ở đầu backlog (R3):
  - **B-01 làn đơn**;
  - **B-02 cổng chất lượng**.

## Bối cảnh
- Phản biện vòng 2: mỗi ô chỉ có 1–2 lượt, nên p hoán vị không thể nhỏ. Cần thí nghiệm sâu hơn, có giả thuyết đăng ký trước.
- **Vòng C9 đang chạy trên cloud** (máy 2 nhân, cùng thời điểm):
  - Claude Code Sonnet: 8 lượt × t1–t5.
  - Làn nhanh CCoding (nhánh này, sau c55a249): 6 lượt × t1–t5.
  - Kết quả sẽ được thêm vào `bench/vs-claude/results/` ở gói sau.
- Phòng Dev đang dựng hai bài lớn. Sau đó sẽ dựng t6–t8, là bài **giữ lại**: không dùng để tinh chỉnh CCoding.
  - `l1-modules`: 5 module độc lập.
  - `l2-chain`: 4 tầng phụ thuộc.
- Dữ liệu KPI và lỗi công cụ ngày 2/11: `docs/research/context/kpi-research-2026-11-02.md` và `tool-failures-2026-11-02.csv`.
- Từ hôm nay, dự án có lệnh kiểm tra do CCoding tự chạy: `token-analysis.mjs --check` và `stats.test.mjs`. Lệnh `--check` hiện ĐỎ vì bảng T-0, T-e… chưa có C8. Đó là việc của R2.

## Hạng mục

**R1 — methodologist → `docs/research/preregistration.md`**
- Đăng ký trước các giả thuyết dưới đây. Được sửa hoặc bổ sung, nhưng phải giải thích lý do.
- Mỗi giả thuyết cần đủ:
  - biến đo chính và biến đo phụ;
  - hướng kỳ vọng;
  - ngưỡng, hoặc biên tương đương/không kém hơn;
  - phép kiểm: hoán vị phân tầng theo bài, CI bootstrap 95 %, Cliff's delta; hiệu chỉnh Holm cho họ giả thuyết chính;
  - số lượt mỗi ô: dùng `node bench/vs-claude/harness/stats.mjs --required-runs --sim …` hoặc lập luận từ phương sai đã có, và ghi lệnh hoặc công thức;
  - tiêu chí loại lượt, định nghĩa TRƯỚC khi có dữ liệu: treo do hạ tầng, timeout, lỗi đăng nhập hay hạn mức, lỗi harness;
  - quy tắc dừng.
- Tách rõ phân tích chính và phân tích khám phá. Thêm bảng "Sai lệch so với đăng ký", để trống.
- Bản nháp giả thuyết:
  - **H1** (bài nhỏ t1–t5, cùng Sonnet): thời gian làn nhanh / Claude Code ≥ 1,3.
  - **H2:** chi phí làn nhanh > Claude Code.
  - **H3:** tỉ lệ test ẩn đạt của làn nhanh không kém hơn, biên 2 điểm %.
  - **H4:** chi phí cố định của điều phối gần như hằng số: hồi quy thời gian CCoding theo thời gian Claude, hệ số chặn > 30 s.
  - **H5** (`l1-modules`): CCoding nhanh hơn Claude Code cùng mô hình.
  - **H6** (`l2-chain`): CCoding không nhanh hơn, và tốn hơn.
  - **H7** (t6–t8 giữ lại): hướng của H1 vẫn giữ.
  - **H8:** token ghi cache mỗi lượt chạy của CCoding ≥ 2 lần Claude Code.
- Ghi cả các nguy cơ đối với hiệu lực: máy 2 nhân chạy hai hệ cùng lúc, thứ tự chạy, phiên bản CCoding thay đổi giữa các vòng.

**R2 — data-scientist → làm mới `docs/research/performance/token-analysis.md`**
- Sinh lại bảng từ script với dữ liệu C1–C8, để `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md` trả exit 0.
- Cho script đọc được vòng mới (C9…) khi có, không cần sửa code thêm.
- Ghi chênh lệch đáng kể so với bản cũ vào `docs/research/CHANGELOG.md`.
- Chỉ chạy script và test. Sửa bằng Edit, đọc bằng Read/Grep.

**R3 — research-lead (hoặc data-scientist) → `docs/research/improvement-backlog.md`**
- Lập backlog nâng cấp CCoding dựa trên bằng chứng: KPI và log ngày 2/11, benchtest C1–C8, `docs/PROCESS-REVIEW.md` §13, `challenges.md`, `self-improvement/design.md`, `dev-review.md`.
- Mỗi mục (mã B-01…) có:
  - vấn đề;
  - **bằng chứng** (tệp:dòng hoặc truy vấn và số liệu);
  - nguyên nhân gốc (đã kiểm hay chỉ là giả thuyết);
  - thay đổi đề xuất;
  - **hiệu quả kỳ vọng** (chỉ số, độ lớn);
  - **cách kiểm lại**: vòng benchtest nào, giả thuyết nào, hoặc chỉ số KPI nào;
  - rủi ro và bảo vệ dữ liệu;
  - ưu tiên theo hiệu quả trên công sức;
  - mục đó có cần giám đốc duyệt để triển khai lên bản chính (main) hay không.
- Kiểm các nhận định N1–N5 trong `context/kpi-research-2026-11-02.md` bằng chính tệp CSV (đếm, phân loại lại nếu sai) và xếp hạng các bản sửa ứng viên G1–G7, D-01–D-03, P1–P4.

**B-01 làn đơn và B-02 cổng chất lượng phải là đặc tả mà Phòng Dev làm được ngay.** Các phần cần có:

- **Tiêu chí nhỏ/lớn, chọn tự động**
  - Dựa trên dữ liệu đã có: chi phí cố định của điều phối, và thời gian một agent cần cho t1–t5.
  - Nêu các tín hiệu dùng được trước khi chạy: độ dài đề bài, số tệp hoặc module bị đụng, số phần độc lập ước lượng, cỡ repo.
  - Nêu ngưỡng ban đầu. Ghi rõ ngưỡng sẽ hiệu chỉnh bằng C9 và hai bài `l1-modules`/`l2-chain`, theo giả thuyết nào.
  - Người dùng hoặc dự án ép làn được.
- **Luồng làn đơn**
  - Một agent đúng vai, chạy pha thực thi trong worktree.
  - Không có pha họp, lập kế hoạch nhiều bên hay tổng hợp bằng LLM. Báo cáo cuối theo mẫu.
- **Cổng chất lượng (đi theo KPI và mẫu đầu ra hiện có)**
  - Lệnh kiểm tra của dự án chạy trước khi sửa (baseline) và sau khi sửa. Đỏ hoặc hồi quy thì tự vào vòng sửa, giới hạn N vòng.
  - Đầu ra phải có đủ mục "Mẫu đầu ra" của vai trò. Thiếu thì sửa, dùng đúng phép kiểm tuân thủ của `src/kpi.ts`.
  - Mọi lượt gọi vẫn đi qua `Orchestrator.call()` và được chấm KPI như các làn khác.
  - Khi nào cần review của reviewer: ví dụ không có lệnh kiểm tra, hoặc thay đổi đụng bảo mật hay dữ liệu.
- **Nâng lên multi-agent**
  - Điều kiện: còn đỏ sau N vòng sửa, phạm vi phát sinh vượt ngưỡng, hoặc agent tự báo việc lớn.
  - Cách chuyển: giữ worktree và bàn giao dở dang.
- **Chỉ tiêu**
  - Thời gian và chi phí so với Claude Code đơn cùng mô hình (ví dụ trong khoảng ±15 %).
  - Tỉ lệ test ẩn không kém hơn.
  - KPI của agent không giảm.
  - Kiểm bằng vòng benchtest nào.
- **Bảo vệ dữ liệu**
  - Giữ nguyên Data Protection Gate, nhãn dữ liệu, hook và ghi log.

**R4 — peer-reviewer: review**
- Mỗi giả thuyết ở R1 có bác bỏ được bằng dữ liệu không?
- Mỗi mục ở R3 có bằng chứng truy được không?
- R2 kiểm bằng kết quả "🧪 Lệnh kiểm tra của dự án" do CCoding tự chạy.

## Không làm ở gói này
- Không viết lại paper hay slide.
- Không sửa `src/`.
- Không giao lại việc đã có.

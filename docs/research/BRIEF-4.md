# Đề bài vòng 3, gói 2, cho Phòng Nghiên cứu (2/11/2026): thẩm định bộ đo của giám đốc, hợp nhất đăng ký trước, kế hoạch chạy

## Bối cảnh
- Giám đốc đưa một bộ đo mới, commit `1568774`:
  - 13 bài thuộc 6 loại: coding, logic, review, requirements, design, research;
  - các arm A0-opus, A0-sonnet, A1 (agent đơn có lập kế hoạch và tự review), A2 (best-of-N cùng lượng tính toán), B0–B5 (biến thể CCoding), oracle, null;
  - giả thuyết H1–H10 trong `bench/vs-claude/analyze.mjs`;
  - giám khảo so cặp mù trong `pairwise.mjs`.
  - Đọc `bench/vs-claude/README.md` trước.
- Chỉ đạo của giám đốc:
  - việc nhỏ dùng agent đơn, việc lớn dùng multi-agent;
  - tối ưu chi phí; có cổng kiểm thử chất lượng;
  - **đi theo đúng đánh giá và template của giám đốc**. Bộ đo này và H1–H10 của nó là hệ đánh giá chính.
- Dữ liệu mới: `docs/research/context/c9-partial-2026-11-02.md`. Gồm C9 đã chạy một phần, và ca t5 chỉ đạt 95/146 vì kế hoạch bỏ sót `agg.js` trong khi `npm test` vẫn đỏ mà review vẫn duyệt.
- Phòng Dev đang làm song song:
  - sửa lỗi tự kiểm (4 bài thiếu `repo/`);
  - gộp `main` vào nhánh;
  - đưa t1–t5 vào bộ đo bằng `task.json`;
  - thêm arm làn nhanh;
  - cho runner nhận biết hạn mức 5 giờ;
  - dựng `l2-chain`.
- **Ràng buộc chạy:**
  - Hạn mức 5 giờ dùng chung cho mọi lượt LLM: cloud và CCoding trên máy giám đốc. Ngày 2/11, hạn mức hết sau khoảng 4,5 giờ dùng.
  - Credit cloud hết hạn ngày 5/11.
- Gói nhỏ: **tối đa 4 hạng mục, mỗi hạng mục một tệp**. Ngân sách 5M token. Đọc bằng Read/Grep.

## Hạng mục

**R5 — methodologist → `docs/research/suite-review.md`: thẩm định bộ đo của giám đốc**

Với từng bài, ghi:
- grader có đo đúng điều bài muốn đo không;
- rủi ro chấm nhầm: checklist regex bắt chữ thay vì ý, F1 với mồi nhử, kết quả có duy nhất không;
- `size` (số phần) được định nghĩa và gán có nhất quán không;
- điểm oracle và null.

Với H1–H10, ghi:
- câu giả thuyết; phép kiểm và ngưỡng như trong `analyze.mjs` (dẫn dòng mã);
- giả thuyết có kiểm định được với số lượt định chạy không;
- nguy cơ đối với hiệu lực, ví dụ thứ tự xen kẽ, cùng runtime, phiên bản CCoding khác nhau giữa các arm.

Đề xuất sửa, kèm mức ưu tiên, nhưng không tự sửa mã. Đặc biệt xét:
- trọng số token `5 × output`;
- `weighted` khác chi phí USD;
- H10 dùng `size` làm biến giải thích;
- giám khảo LLM chấm chính sản phẩm của LLM.

**R6 — methodologist → `docs/research/preregistration.md` bản 2 (sửa tại chỗ, ghi CHANGELOG)**
- Hệ chính: **H1–H10 của bộ đo giám đốc**, giữ nguyên mã.
- Các giả thuyết của bản 1 đổi mã thành **P1–P8**. Có bảng ánh xạ P↔H: trùng, bổ sung, hay chỉ áp dụng cho bộ cũ t1–t5.
- Thêm giả thuyết cho B-01 làn đơn và B-02 cổng chất lượng. Ví dụ: làn đơn tương đương ±15 % so với A0-sonnet; cổng chặn ca "đỏ kéo dài và bỏ sót phần việc". Ghi rõ arm nào và bài nào kiểm chúng.
- Tiêu chí loại lượt, đã định nghĩa ở bản 1, áp cho bộ mới: hạn mức, rò rỉ `leak`, timeout.

**R7 — data-scientist → `docs/research/run-plan.md`: kế hoạch chạy theo cửa sổ hạn mức**
- Ước lượng chi phí và thời gian mỗi lượt cho từng arm và loại bài. Dùng C1–C9; nếu có kết quả thử (pilot) trong `bench/vs-claude/results/pilot*` thì dùng cả kết quả đó.
- Từ đó xếp **thứ tự ưu tiên** arm × bài × lượt cho từ nay đến 5/11, chia theo từng cửa sổ 5 giờ:
  - lượt nào trước;
  - dừng ở đâu khi hết hạn mức;
  - số lượt tối thiểu để mỗi giả thuyết chính có kết luận.
- Gợi ý ưu tiên: A0-sonnet, B0, B5 và arm làn nhanh trước; rồi A1, A2 (H6); A0-opus và B3 sau cùng.
- Ghi lệnh chạy cụ thể (`node bench/vs-claude/run.mjs …`) và cách gộp kết quả với harness cũ.

**R8 — data-scientist (hoặc research-lead) → bổ sung `docs/research/improvement-backlog.md`**
- Thêm **B-10 cổng phủ kế hoạch**, dùng ca t5 trong `context/c9-partial-2026-11-02.md` làm bằng chứng:
  - tệp hoặc module nêu trong đề bài hay trong tóm tắt kế hoạch mà không hạng mục nào nhận ⇒ chặn trước khi thực thi;
  - kế hoạch không đọc được đầy đủ ⇒ không chạy kế hoạch dở.
- Sửa B-02 §4.1 bước 2 theo ca này. Đề bài yêu cầu lệnh xanh và lệnh vẫn đỏ ⇒ bắt buộc vào vòng sửa. Đây cũng là bằng chứng rằng review LLM đã duyệt nhầm.
- Cập nhật bảng xếp hạng. Ghi nhận rằng H8 của giám đốc ("lỗi điều phối: sản phẩm thiếu, yêu cầu bị rơi") đo đúng loại lỗi này.

**Review — peer-reviewer**
- Mỗi H có phép kiểm, ngưỡng và số lượt không?
- Kế hoạch chạy có vừa hạn mức không?
- B-10 có bằng chứng truy được không?
- Dùng kết quả "🧪 Lệnh kiểm tra của dự án".

## Không làm
- Không sửa `src/` hay `bench/`.
- Không viết lại paper hay slide.

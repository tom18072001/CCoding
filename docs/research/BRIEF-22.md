# Phòng Nghiên cứu, vòng 4 gói 16: quyết định chia việc (định tuyến, chọn làn, bóc tách, nghiệm thu) đang làm thế nào, có hiệu quả không, model nào phù hợp

**Gói lớn: 6 hạng mục. Ngân sách 10M token.** Giao 14/11/2026.

**Câu hỏi của giám đốc (14/11, nguyên văn ý):**
- Tổng hợp lại các quyết định của CTO đang chạy: liệu có hiệu quả không, model nào phù hợp.
- Logic chia việc và bóc tách thành các task song song đang thực hiện thế nào, có hiệu quả không.
- Key của cả hệ thống đặt nặng lên cách CTO phân chia công việc; nếu làm không tốt sẽ ảnh hưởng tới hiệu suất toàn hệ thống.

**Phạm vi:**
- **Được sửa:** `docs/research/` (thư mục mới `analysis/decisions/`, `context/`, `improvement-backlog.md`, `run-plan.md`; `preregistration.md` chỉ **thêm** ở §9) và `bench/vs-claude/results/decisions/` (chỉ thêm tệp phân tích).
- **Không sửa:** `src/`, mã và cấu hình `bench/`.
- Không chạy benchmark, không gọi `claude -p`.
- Phân loại dữ liệu: **Nội bộ**. Không đưa dữ liệu từng nhiệm vụ của vận hành thật vào repo; giữ ẩn danh "dự án A".

**Lưu ý thuật ngữ:** trong mã hiện tại, vai "CTO" (`agents/cto.md`) **chỉ nghiệm thu**.
- Định tuyến: điều phối viên (`agents/orchestrator.md`).
- Chọn làn: hàm quy tắc, không gọi LLM.
- Bóc tách: trưởng phòng (`dev-lead`, `research-lead`).

Báo cáo trả lời câu hỏi theo đúng phân vai này, và nói rõ chỗ nào giám đốc đang gọi chung là "CTO".

## Căn cứ có sẵn

- **Chỉ số cấu trúc kế hoạch trên vận hành thật:** `bench/vs-claude/results/decisions/decomp-agg.json` và `RUNLOG.md`. Gồm 56 lượt phòng ở server chính (P) và 5 lượt ở văn phòng phụ; người điều phối tính bằng `docs/research/analysis/decisions/decomp-metrics.mjs`. Đọc số từ tệp, không chép tay.
- **Bench:** mọi `bench/vs-claude/results/*/runs.jsonl`. Các arm CCoding có `lane`, `subtasksTimed`, `maxConcSubtasks`, `byPhase`, `byPhaseTokens`, `byPhaseModel`, `score`, `pass`, `wallSec`; arm agent đơn A0 là mốc.
- **Kết quả đã có:** W1–W5 (B-01), E5′ (họp), E7 (nghiệm thu), E8 (song song), P (song song trong vận hành), B-14, B-17 (model lập kế hoạch theo độ khó, mặc định tắt). Nguồn ghi trong `paper/paper.md` v0.7 và `improvement-backlog.md`.
- **Ca vận hành 14/11 (người điều phối đã đọc biên bản):**
  - BRIEF-20: kế hoạch 6 hạng mục bỏ K4 (peer-reviewer) mà cổng phủ kế hoạch vẫn đạt; cổng chất lượng bỏ review; CTO kết luận 3/9 tiêu chí chưa đạt, nhưng nhiệm vụ vẫn đóng "hoàn thành, cần xem".
  - BRIEF-D16: reviewer chạm trần lượt, không ra kết luận; CTO chưa nghiệm thu; một đường chạy lệnh chưa nối rule mới.
  - Phòng Dev đang sửa ba lỗi hệ thống này ở BRIEF-D17 và BRIEF-D16b.
- **Tài liệu bên ngoài:** `docs/research/context/decomposition-literature-2026-11-14.md`, bản tóm tắt báo cáo nghiên cứu sâu do người điều phối đưa vào khi có.

## Hạng mục

**K1 — methodologist: bản đồ logic quyết định hiện hành (đọc mã, có tệp:dòng)**
- Với mỗi quyết định, ghi:
  - ai hoặc cái gì quyết định;
  - model (mặc định và trong bench);
  - tín hiệu đầu vào, khóa cấu hình;
  - cổng kiểm đi kèm;
  - số đo đã có về hiệu quả.
- Các quyết định cần phủ:
  1. định tuyến phòng;
  2. chọn làn (`src/lane.ts`, quy tắc 1–4);
  3. lập kế hoạch và bóc tách (lời nhắc lập kế hoạch, `parsePlan`, chọn model theo độ khó, họp chốt);
  4. sắp lại kế hoạch làn nhanh;
  5. cổng phủ kế hoạch và lập lại;
  6. lập lịch song song (`maxParallel`, `dependsOn`, worktree, gộp);
  7. cổng chất lượng và review;
  8. nghiệm thu của CTO.
- Kết quả: `analysis/decisions/logic-map.md`, có một sơ đồ luồng.

**K2 — data-scientist: số đo hiệu quả của các quyết định (mô tả, không p trừ khi so cùng đợt)**
- **(a) Vận hành thật**, từ `decomp-agg.json`. Đọc các chỉ số:
  - mức song song cấu trúc kế hoạch cho phép (`potentialSpeedup`) và mức đạt được (`achievedSpeedup`);
  - tỉ trọng hạng mục dài nhất;
  - tỉ lệ làm lại;
  - kế hoạch chỉ một hạng mục;
  - phân phối số hạng mục.
  - Diễn giải: giới hạn tốc độ nằm ở **cấu trúc kế hoạch** hay ở **lập lịch** (`slackOverCp`).
- **(b) Bench:**
  - với mỗi bài và đợt, tỉ số token và thời gian của từng arm CCoding so với A0 cùng đợt;
  - tỉ trọng token của các khâu phối hợp (route, plan, discuss, review, accept, synthesize) so với execute;
  - quan hệ giữa số hạng mục và chi phí, thời gian, điểm.
  - Ghi rõ so chéo đợt chỉ là mô tả.
- **(c) Văn phòng phụ (5 lượt):**
  - model lập kế hoạch;
  - số lần lập lại kế hoạch, review bị bỏ;
  - kết luận nghiệm thu;
  - độ phủ hạng mục đề bài (`decomp-agg.json` → `office`).
- Kết quả: `analysis/decisions/effectiveness.md` (+ script nếu tính thêm).

**K3 — literature-researcher: đối chiếu tài liệu**
- Đọc `context/decomposition-literature-2026-11-14.md` nếu đã có. Kiểm lại nguồn chính cho mỗi số sẽ dùng trong báo cáo (bài bình duyệt, preprint hay blog).
- Chưa có tệp đó thì tự rà ít nhất 8 nguồn chính về:
  - khi nào nhiều agent hay một agent;
  - chất lượng bóc tách;
  - model cho vai lập kế hoạch và nghiệm thu;
  - định tuyến model theo độ khó.
- Kết quả: `context/decomposition-sources-2026-11-14.md`.

**K4 — methodologist: model cho từng vai và thí nghiệm đo chất lượng bóc tách**
- Đề xuất model cho từng vai: định tuyến, lập kế hoạch theo độ khó, thực thi, review, nghiệm thu. Mỗi đề xuất có bằng chứng nội bộ (E7, B-17, tỉ trọng chi phí khâu `plan`) và bên ngoài (K3), kèm mức bằng chứng.
- Thiết kế **E9**: đo chất lượng bóc tách và lợi ích của model lập kế hoạch mạnh, trên bài **chia được** và **không chia được**.
  - Arm gợi ý: agent đơn, làn nhanh với planner Sonnet, làn nhanh với planner Opus, và quy tắc "không chia khi cấu trúc không cho song song".
  - Ghi: thước đo chính, cỡ mẫu và power, quy tắc dừng.
- Ghi đăng ký trước vào `preregistration.md` §9 (chỉ thêm). **Không chạy.**

**K5 — research-lead: báo cáo trả lời giám đốc và danh sách thay đổi**
- `analysis/decisions/report.md` trả lời bốn câu:
  1. logic chia việc đang làm thế nào;
  2. có hiệu quả không (số);
  3. model nào phù hợp cho từng vai;
  4. chia kém ảnh hưởng hiệu suất toàn hệ thống bao nhiêu (định lượng từ K2).
- Danh sách thay đổi cho phòng Dev. Mỗi thay đổi có: bằng chứng, mức bằng chứng, chỉ số kiểm lại, và gói đo (nếu cần).
  - Người điều phối sẽ giao Dev **làm hết** các thay đổi có bằng chứng đủ. Thay đổi chưa đủ bằng chứng thì ghi thí nghiệm cần chạy; không để ở dạng "đề xuất" mơ hồ.
- Cập nhật `improvement-backlog.md` (mục mới B-20 trở đi) và `run-plan.md`.

**K6 — peer-reviewer: review phản biện K1–K5**
- Mỗi số có nguồn (tệp:dòng hoặc lệnh) và khớp nguồn.
- Không câu nào vượt mức bằng chứng: quan sát không viết thành nhân quả; so chéo đợt không viết thành hiệu ứng.
- Kết luận theo mẫu; mỗi phát hiện mức "chặn" phải được sửa trong gói.
- Chạy "🧪 Lệnh kiểm tra của dự án"; `git status` sạch.

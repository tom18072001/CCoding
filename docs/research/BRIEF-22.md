# Phòng Nghiên cứu, vòng 4 gói 16 (giao lại): engine và logic từng agent, bảng điểm từng agent và chỗ hỏng, quyết định chia việc có hiệu quả không, model nào phù hợp

**Gói lớn: 7 hạng mục. Ngân sách 12M token.** Giao 14/11/2026. Bản đầu được hủy trước khi chạy để thêm yêu cầu mới của giám đốc.

**Yêu cầu của giám đốc (14/11):**
- Tổng hợp các quyết định của CTO đang chạy: có hiệu quả không, model nào phù hợp; logic chia việc và bóc tách thành task song song đang làm thế nào, có hiệu quả không. Cả hệ thống đặt nặng lên cách chia việc; làm không tốt sẽ ảnh hưởng hiệu suất toàn hệ thống.
- **Báo cáo đề tài phải nêu rõ logic và kết quả mà từng agent bên trong xử lý; làm rõ engine và logic.**
- **Phải có chấm điểm, và nêu nó fail ở những phần nào.** Ở bản final, phải sửa cho đến khi hết các lỗi vặt, những lỗi sửa được.

**Phạm vi:**
- **Được sửa:**
  - `docs/research/` (`paper/`, thư mục mới `analysis/decisions/`, `context/`, `facts.json`, `CHANGELOG.md`, `improvement-backlog.md`, `run-plan.md`; `preregistration.md` chỉ **thêm** ở §9);
  - `bench/vs-claude/results/decisions/` (chỉ thêm tệp phân tích).
- **Không sửa:** `src/`, mã và cấu hình `bench/`.
- Không chạy benchmark, không gọi `claude -p`.
- Phân loại dữ liệu: **Nội bộ**. Không đưa dữ liệu từng nhiệm vụ của vận hành thật vào repo; giữ ẩn danh "dự án A".

**Lưu ý thuật ngữ:** trong mã hiện tại, vai "CTO" (`agents/cto.md`) **chỉ nghiệm thu**.
- Định tuyến: điều phối viên (`agents/orchestrator.md`).
- Chọn làn: hàm quy tắc, không gọi LLM.
- Bóc tách: trưởng phòng (`dev-lead`, `research-lead`).

Báo cáo trả lời theo đúng phân vai này, và nói rõ chỗ nào giám đốc đang gọi chung là "CTO".

## Căn cứ có sẵn (đọc số từ tệp, không chép tay)

- **Cấu trúc kế hoạch trên vận hành thật:** `bench/vs-claude/results/decisions/decomp-agg.json` và `RUNLOG.md`. Gồm 56 lượt phòng ở server chính (P) và 5 lượt ở văn phòng phụ; tính bằng `docs/research/analysis/decisions/decomp-metrics.mjs`.
- **KPI từng agent trên văn phòng phụ:** `bench/vs-claude/results/decisions/kpi-office.json`, KPI v2 theo mẫu của giám đốc. Gồm 14 agent: điểm 6 nhóm, `findings` (việc cần sửa), lượt hỏng, đầu ra bị cắt.
- **Bench:** mọi `bench/vs-claude/results/*/runs.jsonl`. Arm CCoding có `lane`, `subtasksTimed`, `maxConcSubtasks`, `byPhase`, `byPhaseTokens`, `byPhaseModel`, `score`, `pass`, `wallSec`, `fixRounds`, `gates`; arm agent đơn A0 là mốc.
- **Kết quả đã có:** W1–W5 (B-01), G, E4, E5′, E6, E7, E8, P, B-14, B-17, trục 2 (b). Nguồn trong `paper/paper.md` v0.7.1 và `improvement-backlog.md`.
- **Ca vận hành 14/11 (người điều phối đã đọc biên bản):**
  - BRIEF-20: kế hoạch 6 hạng mục bỏ K4 (peer-reviewer) mà cổng phủ kế hoạch vẫn đạt; cổng chất lượng bỏ review; CTO kết luận 3/9 tiêu chí chưa đạt nhưng nhiệm vụ vẫn đóng "hoàn thành, cần xem".
  - BRIEF-D16: reviewer chạm trần lượt, không ra kết luận; CTO chưa nghiệm thu; một đường chạy lệnh chưa nối rule mới.
  - BRIEF-21: CTO chưa nghiệm thu (Điều 23 Luật chưa đọc được chữ; đường dẫn máy sót). Người điều phối đã xử lý sau đó.
  - Phòng Dev đang sửa các lỗi hệ thống ở BRIEF-D17 và BRIEF-D16b.
- **Tài liệu bên ngoài:** `docs/research/context/decomposition-literature-2026-11-14.md`, bản tóm tắt báo cáo nghiên cứu sâu do người điều phối đưa vào khi có.

## Hạng mục

**K1 — methodologist: engine và logic từng agent (đọc mã, có tệp:dòng)**
- **Engine:**
  - vòng đời nhiệm vụ và các pha (route, plan, discuss, finalize, execute, review, revise, synthesize, accept);
  - lập lịch theo `dependsOn` và `maxParallel`; worktree, commit, gộp và giải xung đột;
  - lệnh kiểm tra của dự án;
  - các cổng không dùng LLM: chọn làn, cổng phủ kế hoạch, cổng chất lượng, cổng mẫu đầu ra, bộ kiểm lệnh (hook);
  - ngân sách, ước lượng; tạm dừng và tiếp tục; runtime và chuyển runtime;
  - ghi log và chuỗi băm.
- **Từng agent** (điều phối viên, trưởng phòng, mỗi vai thành viên Dev và Nghiên cứu, reviewer, CTO), ghi:
  - nhận gì; quyết định gì theo logic nào (lời nhắc, mã);
  - trả gì; model mặc định và trong bench;
  - công cụ được cấp; cổng nào kiểm đầu ra của agent đó.
- Kết quả: `analysis/decisions/logic-map.md`, có sơ đồ luồng (mermaid) và một bảng mỗi agent một dòng.

**K2 — data-scientist: kết quả và bảng điểm từng agent, kèm chỗ fail**
- **Bảng điểm từng agent:**
  - KPI v2 từ `kpi-office.json`: điểm tổng, 6 nhóm, mức bằng chứng;
  - các số đo đặc thù vai:
    - **trưởng phòng:** cấu trúc kế hoạch (mức song song cho phép và đạt được, tỉ trọng hạng mục dài nhất, làm lại), lập lại kế hoạch, độ phủ hạng mục đề bài;
    - **reviewer:** tỉ lệ review bị bỏ hoặc không ra kết luận; độ đúng của kết luận nếu có;
    - **CTO:** E7 (recall, chặn nhầm), kết luận trên văn phòng phụ;
    - **điều phối viên:** chi phí khâu route;
    - **cổng và engine:** G-3 (90,7 %), xung đột khi gộp, trục 2 (b).
- **Chỗ fail của từng agent và từng thành phần engine**, mỗi chỗ có:
  - bằng chứng (tệp:dòng hoặc số);
  - tần suất;
  - phân loại: **sửa được trong mã/lời nhắc** · **cần đo thêm** · **ngoài tầm (cần giám đốc hoặc hạ tầng)**.
- **Quyết định chia việc có hiệu quả không** (mô tả; p chỉ khi so cùng đợt):
  - vận hành thật: giới hạn tốc độ nằm ở cấu trúc kế hoạch hay ở lập lịch;
  - bench: tỉ số token và thời gian so với A0 cùng đợt, tỉ trọng token của các khâu phối hợp, quan hệ số hạng mục với chi phí, thời gian, điểm.
- Kết quả: `analysis/decisions/scorecard.md` và `analysis/decisions/effectiveness.md` (+ script nếu tính thêm).

**K3 — literature-researcher: đối chiếu tài liệu**
- Đọc `context/decomposition-literature-2026-11-14.md` nếu đã có. Kiểm nguồn chính cho mỗi số được dùng (bình duyệt, preprint hay blog).
- Chưa có tệp đó thì tự rà ít nhất 8 nguồn chính về:
  - một agent hay nhiều agent;
  - chất lượng bóc tách;
  - model cho vai lập kế hoạch và nghiệm thu;
  - định tuyến theo độ khó;
  - LLM làm bộ chấm.
- Kết quả: `context/decomposition-sources-2026-11-14.md`.

**K4 — methodologist: model cho từng vai và E9**
- Đề xuất model cho từng vai; mỗi đề xuất có bằng chứng nội bộ, bằng chứng ngoài, và mức bằng chứng.
- Thiết kế E9 (đo chất lượng bóc tách và lợi ích của planner mạnh, trên bài chia được và không chia được): thước đo chính, cỡ mẫu và power, quy tắc dừng.
- Ghi đăng ký trước vào `preregistration.md` §9 (chỉ thêm). **Không chạy.**

**K5 — academic-writer (data-scientist kiểm số): đưa vào bài báo, bản v0.8**
- **Mục mới "Engine và logic từng agent"** (gộp vào §4): tóm tắt K1, có sơ đồ và bảng.
- **Mục mới "Bảng điểm từng agent và chỗ fail"** (gộp vào §6): tóm tắt K2. Mỗi chỗ fail ghi trạng thái: **đã sửa** (commit), **đang sửa** (gói D…), **cần đo thêm**, **ngoài tầm**. Nhãn [Mô tả] cho số quan sát.
- `facts.json`, `CHANGELOG.md` đồng bộ; `consistency-check` đạt.

**K6 — research-lead: báo cáo trả lời giám đốc và danh sách lỗi sửa được**
- `analysis/decisions/report.md` trả lời:
  1. engine và logic từng agent;
  2. chia việc có hiệu quả không (số);
  3. model nào phù hợp cho từng vai;
  4. chia kém ảnh hưởng hiệu suất toàn hệ thống bao nhiêu;
  5. bảng điểm và chỗ fail.
- **Danh sách mọi lỗi sửa được** (mã, lời nhắc, cấu hình, `agent.md`), mỗi lỗi có: bằng chứng, chỗ sửa (tệp), tiêu chí xong đo được, test hoặc chỉ số kiểm lại.
  - Người điều phối giao Dev sửa **hết** danh sách này trước bản final, rồi chấm lại.
  - Lỗi chưa đủ bằng chứng thì ghi thí nghiệm cần chạy; không để ở dạng "đề xuất" mơ hồ.
- Cập nhật `improvement-backlog.md` (B-20 trở đi) và `run-plan.md`.

**K7 — peer-reviewer: review phản biện K1–K6**
- Mỗi số có nguồn và khớp nguồn.
- Không câu nào vượt mức bằng chứng: quan sát không thành nhân quả; so chéo đợt không thành hiệu ứng.
- Bảng điểm không bỏ sót agent nào có trong `kpi-office.json`.
- Kết luận theo mẫu; mọi phát hiện mức "chặn" được sửa trong gói.
- Chạy "🧪 Lệnh kiểm tra của dự án"; `git status` sạch.

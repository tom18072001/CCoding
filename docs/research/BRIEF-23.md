# Phòng Nghiên cứu, vòng 4 gói 17: đo lại trục 2 (b) sau khi vá bộ kiểm lệnh; kiểm lại phép tính cascade nghiệm thu trên E7

**Gói vừa: 4 hạng mục. Ngân sách 6M token.** Giao 14/11/2026, chạy sau BRIEF-22.

**Căn cứ:**
- Phòng Dev đã vá chỗ hở của bộ kiểm lệnh ở tầng `full` và đã gộp vào nhánh:
  - D16: rule `outside-root-write`;
  - D16b: nối rule vào `run_command`; kiểm chặn nhầm trên 33 lệnh dev tự viết.
- Đo ngày 14/11 trước khi vá: `bench/vs-claude/results/axis2-guard/` — `git-read` 82/82; `full` 30/82 = 36,6 % [26,2; 48,0].
- Tính nhanh cascade nghiệm thu: `docs/research/context/decomposition-literature-2026-11-14.md` §4.

**Phạm vi:**
- **Được sửa:**
  - `docs/research/` (`analysis/axis2/`: script mới, không sửa script cũ; `paper/`, `facts.json`, `CHANGELOG.md`; `preregistration.md` chỉ **thêm** ở §9);
  - thư mục kết quả **mới** `bench/vs-claude/results/axis2-guard-postfix/`.
- **Không sửa:** `src/`, mã `bench/`, kết quả cũ trong `results/axis2-guard/`.
- Không gọi LLM khi đo; không chạy benchmark.
- Dữ liệu: **Nội bộ**. Bộ ngoài là công khai, CC BY 4.0, phải ghi nguồn.

## Hạng mục

**K1 — methodologist: ghi §9 trước khi chạy**
- Thêm mục "Đo lại trục 2 (b) sau vá" vào `preregistration.md` §9. Ghi giờ, và commit **trước** khi chạy bất kỳ phép đo nào. Nội dung:
  - **(1) RedCode, cùng 82 ca, mã sau vá:** chạy lại đúng cách đo cũ.
    - Nhãn **hồi quy sau vá, không phải ước lượng độc lập**: bản vá được thiết kế sau khi đã thấy các ca lọt, dù test của Dev không chép lệnh RedCode.
    - Báo theo tầng, theo nhóm kỹ thuật, theo rule (gồm `outside-root-write`).
  - **(2) Bộ dự phòng đã đăng ký:** Agentic Execution Guardrail Eval (Hugging Face `ole-tail/agentic-execution-guardrail-eval`).
    - Kiểm giấy phép từ thẻ dữ liệu.
    - Quy ca theo quy tắc 1–7 đã khóa; ghi mã băm danh sách trước khi chạy.
    - Đo ở **cả hai bản mã**: trước vá (commit `618cb2c`, mở worktree tạm, không sửa) và sau vá.
    - `blocked` ⇒ chặn đúng. `approved` ⇒ **chặn nhầm trên bộ ngoài**, phép đo chặn nhầm đầu tiên của trục 2. `require_approval` báo riêng.
    - Nhãn **[Khám phá]**: dùng sau khi đã thấy kết quả của RedCode, và bộ chỉ 37 dòng.
  - **(3)** Ngưỡng diễn giải: giữ ngưỡng đã khóa của (b).

**K2 — data-scientist: chạy và báo**
- Script mới trong `docs/research/analysis/axis2/`, sao từ script cũ nếu cần thêm tham số.
- Báo n, k, Clopper–Pearson 95 %, theo bộ, tầng, rule và nhóm. Bảng trước/sau vá trên cùng bộ ca.
- Liệt kê ca còn lọt sau vá và nguyên nhân (đã che), **và ca bị chặn nhầm** ở bộ dự phòng.
- Kết quả: `results/axis2-guard-postfix/{RUNLOG.md, report.md, results.json, cases-*.jsonl}`.

**K3 — data-scientist: kiểm lại phép tính cascade nghiệm thu trên E7**
- Từ `results/e7-cto/` (theo ngữ nghĩa phân tích E7 đã khóa: dòng cuối mỗi cặp, phân loại lại), tính ba cách:
  - **cascade:** R1 chặn trước, chỉ ca R1 chặn mới xét R2, chặn khi cả hai chặn;
  - **R2 đơn**;
  - **R1 đơn**.
- Mỗi cách báo: recall trên mục lỗi, chặn nhầm trên mục đúng, chi phí USD ước tính (Opus chỉ trên ca R1 chặn).
- Thêm hai bảng độ nhạy: (i) coi "không đọc được" là chặn; (ii) bỏ các mục có cặp bị phân loại lại.
- Nhãn **[Khám phá]**.
- Kết quả: `analysis/e7-cascade.md` (+ script). Đối chiếu với số tính nhanh của người điều phối; sai thì ghi rõ chỗ sai.

**K4 — academic-writer, peer-reviewer:**
- Đưa kết quả K2, K3 vào `paper.md` (trục 2 §6.3.2; trục 1 phần E7) với nhãn đúng.
- `facts.json`, `CHANGELOG.md` đồng bộ; `consistency-check` đạt.
- peer-reviewer phản biện: số khớp nguồn; không câu nào vượt nhãn. Không viết "bộ kiểm chặn X % tấn công", không viết hồi quy sau vá thành ước lượng độc lập.
- Chạy "🧪 Lệnh kiểm tra của dự án"; `git status` sạch.

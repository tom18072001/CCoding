# Phòng Nghiên cứu, vòng 4 gói 14: bài báo v0.7 (ba trục, số đo mới), đo trục 2 phần (b), cập nhật backlog và run-plan

**Gói lớn: 4 hạng mục + review. Ngân sách 8M token.** Soạn 13/11/2026, giao 13/11/2026 sau khi E7 và E8 xong (văn phòng không chạy chồng lên E8, vì thước đo chính của E8 là thời gian). Giám đốc 12/11 23:47: dùng tối đa hạn mức, chỉ cần kết quả cuối; 12/11 22:58: "cần chuẩn công bố khoa học".
- **Được sửa:** `docs/research/` (gồm `paper/`, `facts.json`, `CHANGELOG.md`, `analysis/`, `context/`, `improvement-backlog.md`, `run-plan.md`, `preregistration.md` §6 và §9) và `bench/vs-claude/results/*/RUNLOG.md`.
- **Không sửa:** `src/`, mã và cấu hình của `bench/` (trừ RUNLOG).
- Không chạy benchmark, không gọi `claude -p`.
- Phân loại dữ liệu: **Nội bộ**. Repo công khai: không đưa tệp từng lượt của P, không đưa lệnh thật chưa che.

## Căn cứ (số đã có, đọc từ nguồn, không chép tay)

| Khối | Nguồn | Trạng thái |
|---|---|---|
| G (cổng `npm test` trên lỗi cài máy) | `results/g-mutation/RUNLOG.md`; G-3Δ sau BRIEF-19 S1: CI [−5,4; 8,8] | xong, đã thẩm định (BRIEF-19 K1) |
| P (song song trong vận hành thật) | `results/p-parallel/RUNLOG.md`, mục "Chạy lại … sau BRIEF-19" (13/11): P-1/P-2/P-3 trùng; đường găng gộp 771 so với 717 phút | xong |
| E4 (cổng chất lượng), E5′ (họp), E6 (H6) | `results/gates-main/report-e4.md`, `results/b15f-main/report.md`, `results/h6-3e/report.md`, `report-h6-sensitivity.md`; §9 A1–A5 | xong, đã thẩm định |
| B-14 bước 2 (`stablePrefix`) | `results/b14-step2/report.md`, `analysis.json`; §9 "Sai lệch phân tích bước 2 của B-14" | xong 13/11: R̂ 0,999 [0,886; 1,127], p 0,983, không phân biệt được; power ở 10 % ≈ 0,38 |
| E7 (CTO nghiệm thu trên lỗi lọt cổng) | `results/e7-cto/report.md`, `RUNLOG.md`, `label-trials.jsonl`; §9 "Sai lệch thực thi E7: chạm trần lượt và lỗi xác thực…" | xong 13/11. Recall R1/R2/R3: 98,4/85,9/95,3 %; chặn nhầm: 42,2/6,3/46,9 %. Chính R1 so với R3: 3 so với 1, p 0,625; 4 cặp bất đồng < 10 nên **p chỉ mô tả**. 16 cặp được phân loại lại **sau khi** đã thấy kết quả; ba cách tính cho cùng cách đọc |
| E8 (song song có worktree) | `results/e8-parallel/report.md`, `RUNLOG.md`, `extract-*.json` | xong 13/11. `wallSecTask` B6w4/B6w1 0,520 [0,488; 0,552], p ≤ 0,0001; token 1,008 [0,942; 1,075]; chạy chồng 17/18 và 0/18; gộp có 1 xung đột trên 70; so với A0 theo bài, chỉ `l1-modules` nhanh hơn agent đơn |
| Sai lệch đường xác thực | §9 "Sai lệch thực thi E7/E8 …" (13/11): arm `claude -p` của harness nhận `ANTHROPIC_API_KEY` của máy chạy; sửa ở `7ff4b9c`; các đợt cũ không có `authSource` | ghi rồi |
| Trục 2 (quản trị) | §9 "Đăng ký trước trục 2" (BRIEF-19 K1b) | đã đăng ký, chưa đo |

## Hạng mục

**K1 — academic-writer (data-scientist kiểm từng số): bài báo v0.7**
- **Dựng lại đóng góp quanh ba trục**; mỗi trục ghi số đo, nhãn [Xác nhận]/[Mô tả]/[Khám phá] và giới hạn:
  - (1) **nghiệm thu bằng kiểm chứng thật:** G-1, G-2, G-3, G-3Δ (CI mới); E4; **E7** (recall R1, R2, R3; McNemar R1 so với R3 đọc cùng bootstrap theo bài theo điều kiện K3; bảng theo bài; độ nhạy bỏ `t5-logq` và coi "không đọc được" là chặn). Viết đúng: R1 − R3 là hiệu của hồ sơ CTO **cộng** lớp vận hành CCoding.
  - (2) **khung quản trị:** hiện trạng, đăng ký trước trục 2, kết quả K2 (b) nếu có, và câu "chặn nhầm trên lệnh thật chưa đo, chờ chỉ định người gán nhãn".
  - (3) **song song an toàn:** P-1, P-2, P-3 kèm đường găng; **E8** (exp(Δ) của `wallSecTask` B6w4/B6w1, CI, p; mô tả chạy chồng, chia dưới 2 hạng mục, xung đột khi gộp, cổng cuối, A0-sonnet làm mốc) với các câu giới hạn điều kiện 4–6 của K3; câu "bench W1–W5 đo chi phí chia việc mà không có song song".
- **Kết quả chi phí đã đăng ký trước (W1–W5, B-01) giữ nguyên và giữ làm kết quả chính.**
- **Thêm kết quả:** E5′, E6 (H6) và B-14 bước 2 (chỉ số tiết kiệm cache: không phân biệt được, kèm power và bảng độ nhạy).
- **§8 (đe dọa):** thêm (v) E7: hai lần ghi sai loại lượt và quyết định phân loại lại 16 lượt sau khi đã thấy kết quả (§9), lỗi 403 chưa rõ nguyên nhân, trần 6 lượt bất lợi cho Opus; (vi) E8: server A/B lẫn với arm, σ kế hoạch lấy từ arm khác; và (i) harness bench `isolation: none` khác cấu hình vận hành; (ii) đường xác thực của arm `claude -p` trước 13/11 không được ghi (bằng chứng gián tiếp: hạn mức kiểu gói claude.ai ở h6-3e); (iii) σ quan sát của B-14 lớn hơn kế hoạch; (iv) phân tích B-14 sửa cách gom dòng sau khi đã thấy kết quả bản đầu (cả hai cùng phán quyết).
- **Thay Nghị định 13/2023/NĐ-CP bằng Nghị định 356/2025/NĐ-CP** ở mọi chỗ (bài báo, `facts.json`, tài liệu trong `docs/`), ghi hiệu lực từ 01/01/2026. Đọc lại văn bản gốc trước khi viết; không đọc được thì ghi [CHƯA KIỂM CHỨNG].
- `facts.json` và `CHANGELOG.md` đồng bộ; `consistency-check` đạt. Ẩn danh "dự án A" giữ nguyên.

**K2 — methodologist: đo trục 2 phần (b), không gọi LLM khi đo**
- Làm đúng §9 "Đăng ký trước trục 2", phần (b): RedCode-Exec (bộ chính), bộ dự phòng nếu quy được < 30 ca.
- Quy ca bằng **script có quy tắc cố định** (không dùng phán đoán của LLM cho từng ca); ghi mã băm danh sách đã quy ca vào RUNLOG **trước** khi chạy `guardDecision`. Tải bộ chỉ vào `docs/research/` hoặc `data/`; kiểm giấy phép theo đăng ký.
- Báo n, Clopper–Pearson 95 %, theo bộ, tầng và quy tắc; ngưỡng diễn giải đã khóa.
- Phần (a) (lệnh thật, người gán nhãn): **không làm**; ghi "chờ giám đốc chỉ định hai người gán nhãn".
- Kết quả và RUNLOG ở `results/axis2-guard/`.

**K3 — research-lead: backlog, run-plan, KPI**
- `improvement-backlog.md`: B-14 (`stablePrefix` giữ tắt; muốn trả lời ở mức 10 % cần khoảng 276 lượt), E7, E8 theo kết quả; hạng mục tiếp theo xếp theo bằng chứng.
- `run-plan.md`: đóng E7, E8, B-14 bước 2; ghi các đợt còn mở.
- KPI theo mẫu của giám đốc.

**K4 — peer-reviewer:** review K1–K3.
- Mỗi số trong bài báo có nguồn (tệp + dòng hoặc lệnh tái lập) và khớp nguồn.
- Không câu nào vượt mức của nhãn (vd. "không phân biệt được" không viết thành "không có hiệu ứng").
- Kiểm bằng "🧪 Lệnh kiểm tra của dự án". `git status` sạch.

## Người điều phối làm (ngoài văn phòng)
- Đã làm trước khi giao gói: chạy `e7/analyze.mjs`, `e8/analyze.mjs`, trích xung đột E8 và ghi `report.md` của hai đợt. K1 đọc số từ hai báo cáo đó, không tính lại.
- Cập nhật deck theo v0.7 (gồm CI G-3Δ [−5,4; 8,8] ở PL10), đọc bản đang công bố trước khi sửa.

## Không làm
- Không chạy benchmark, không gọi `claude -p`, không chạy sandbox thật.
- Không sửa `src/`, `bench/` (trừ RUNLOG).

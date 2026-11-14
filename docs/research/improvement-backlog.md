# Backlog nâng cấp dựa trên bằng chứng — vòng 3, gói 1 (R3) · cập nhật gói 2 (R8)

> Phòng Nghiên cứu · hạng mục S3 (@data-scientist) · 2/11/2026 · phân loại dữ liệu: nội bộ.
> Cập nhật R8 (T-20261102-175854-65c, S3, @research-lead, 2/11/2026): thêm **B-10** (cổng phủ kế hoạch, §5), sửa B-02 §4.1 bước 2 (lệnh đỏ mà đề bài yêu cầu xanh ⇒ bắt buộc vòng sửa), cập nhật §0 và §6, đổi mã giả thuyết. Bằng chứng mới: ca `t5-logq.ccoding-fastlane.2` của C9 (`docs/research/context/c9-partial-2026-11-02.md` §2).
> Cập nhật R12 (T-20261103-025758-514, S3, @methodologist, 3/11/2026): thêm **B-11** (làm gọn làn đơn, §5), đề xuất chỉ tiêu B-01′ (×1,3, chờ giám đốc duyệt; `preregistration.md` §9 V4-01, nhãn post-hoc) và kế hoạch đo B7′ (§5 B-11.5). Số lấy từ `analysis/b7-cost-decomposition.md` và `analysis/b02m-replay.md`.
> Cập nhật R13 (T-20261103-034225-3c7, S1, @methodologist, 3/11/2026): sửa B-11 theo review — (d) **đóng** (trích mã `route()` và cấu hình arm B7); (a) tách (a-skip) bị chặn / (a-brief) cần giám đốc duyệt; B-11.5 viết lại theo arm B7c/B7cb/B7cab (điều kiện chạy, ngân sách lượt trong trần 3,6 giờ, kết quả dự kiến, điểm dừng vô ích sau 20 lượt); CI dự kiến lấy từ `analysis/variance-decomposition.md` (S2, @data-scientist); minor: lịch ≈ 3,5 giờ, V4-01 "chỉ báo thô", T-6 là Δ gộp, `b02m-replay` đã đọc `finalPath`.
> Cập nhật R14 (T-20261103-115014-174, S3, @research-lead, 3/11/2026): thêm **B-13…B-17** (§5) từ đối chiếu tài liệu "4 hướng tăng tốc" của giám đốc (`analysis/acceleration-crosscheck.md`). Số lấy từ `analysis/cache-sensitivity.md` (C-0…C-5, ảnh chụp `838a5f1`), `analysis/cache-diagnostic-spec.md`, `analysis/b7-cost-decomposition.md` (T-x), `analysis/agreement.md`, `related-work.md` §2.16–2.22. Cả năm mục là **đề xuất, chưa chạy**; không đưa lên `main`.
> Cập nhật R15 (T-20261103-214233-452, S3, @data-scientist, 3/11/2026): thêm **B-18** (sandbox cấp hệ điều hành cho hook; `sandbox-spec.md`) và **B-19** (triển khai vòng tự cải thiện RQ5; `self-improvement/implementation-spec.md`) vào §0, §5, §6. Cả hai chỉ là đặc tả cho D10, mặc định tắt, chưa có mã và chưa chạy đo. Bộ giữ lại của B-19 đã khóa hash; t1–t5 và g1–g6 chỉ dùng chẩn đoán (D7).
> Cập nhật vòng 4 gói 6 (T-20261103-195822-b03, S2, @research-lead, 3/11/2026): §0 có thêm cột **Trạng thái** (đúng một trong bốn giá trị: `đã làm (<commit>)` / `D9` / `cần đo` / `cần giám đốc duyệt`; riêng B-12, B-14, B-16 ghi `D9 → sau đó cần đo`) và cột **Ghi chú trạng thái** (commit, mục `BRIEF-D9.md`, số lượt cần đo theo đặc tả). Căn cứ: quyết định của giám đốc 3/11 19:56 ("đã là đề tài thì phải fix hết, không để đề xuất sửa") và `BRIEF-D9.md` (`90cd913`). Các nhãn "đề xuất", "hoãn", "bị chặn" ở cột Mã và tiêu đề §5 của B-09, B-12…B-17 được thay bằng trạng thái. Câu "Cả năm mục là **đề xuất, chưa chạy**" ở dòng trên là trạng thái tại R14. Hash đã kiểm bằng `git show --stat`.
> Cập nhật R16 (T-20261104-123641-21b, S1, @data-scientist, 4/11/2026): đóng gói 10 (N-1 của CTO). B-12, B-16: E2 xong, E4 đang chạy, N cố định. B-14: E1 xong, đổi bộ công cụ là nguồn ghi cache; bước 2 đã đăng ký, 96 lượt, chờ giám đốc duyệt (giới hạn: `preregistration.md` §9 V4-3e-K3). B-15: E3 cho thấy không đo được với B0/B1 vì B0 không có pha `discuss` (l1-modules: `chooseLane` quy tắc 3 chọn làn nhanh; l2-chain: làn đơn nâng lên làn nhanh; hai làn này không họp); chờ §9 V4-3e-E5′ (đã đăng ký; chờ D12 và giám đốc duyệt). B-19: khóa lại `84ded09`. Chỉ dựa vào lane, byPhase, token, thời gian; không mở điểm E3/E4.
> Cập nhật R17 (T-20261104-135425-669, S4, @research-lead, 4/11/2026; BRIEF-18 K4): **B-14:** giám đốc đã duyệt bước 2 (96 lượt) lúc 12:50 ngày 4/11 (`results/local-3e/RUNLOG.md:23`, `9e3c410`), nên trạng thái chuyển sang `cần đo`. Tiền điều kiện (6) đạt: script `4e546f4`, dòng hash ở `results/b14-step2/RUNLOG.md:2`, commit `c6fd35f`. Tiền điều kiện (7) chưa đạt, chờ D13 K6: thiếu 3 ca (kết luận K3(b), `f211bc7`). **B-15:** E5′ đã đăng ký (§9 V4-3e-E5′, `f36a1d9`) và đã duyệt; sổ chạy `results/b15f-main/RUNLOG.md`, chạy sau E6. Thêm ghi chú đo lường về arm null trên `t2-orders`, `t4-perf` (§0), áp cho lần đo sau, không đổi đợt 3e. Thứ tự còn lại của đợt 3e: `run-plan.md` §5.4.4. Không mở điểm E3, E4, E6.
> Cập nhật R18 (T-20261114-133920-30b, S4, @research-lead, 14/11/2026; BRIEF-20 K3): thêm **§0.1** (kết quả mới của B-14 bước 2, E4, E5′, E7, E8, trục 2 phần (b); thứ tự việc tiếp theo theo mức bằng chứng). Cột "Trạng thái" của §0 có thêm giá trị `đã đo` (đợt đã có `report.md`; không có nghĩa là đã đổi mặc định); đổi ô trạng thái của B-12, B-14, B-15, B-16 và tiêu đề §5 của B-14. Mọi số ở §0.1 chép từ `report.md`/`RUNLOG.md` của từng đợt, không tính lại; mã commit đọc bằng `git log`. Không sửa `src/`, `bench/`.
> Nguyên tắc của giám đốc: mọi nâng cấp phải dựa vào nghiên cứu; mỗi thay đổi của Phòng Dev ghi mã `B-xx`; benchtest chạy theo `preregistration.md` để kiểm lại.
> Số từ `token-analysis.md` dẫn theo **mã bảng** (T-0, T-d…), không chép lại bản S1 đang làm mới.
> **Mã giả thuyết (từ R8):** hệ chính là **H1–H10 của bộ đo giám đốc** (`bench/vs-claude/analyze.mjs:61-115`), viết `H_i` trong tệp này. Giả thuyết H1–H9 của `preregistration.md` bản 1 đổi mã theo quy ước H_i → ĐK-P_i (bản 2, hạng mục S4; cùng quy ước với `preregistration.md` §3.3, thống nhất ở v2.1). **Trùng mã:** P1–P4 ở cột "Gộp ứng viên", B-02, B-03, B-09 là **bản vá prompt** trong `self-improvement/prompt-patches/`; vì vậy trong tệp này giả thuyết bản 1 ghi là **ĐK-P_i** (= P_i của `preregistration.md` bản 2). Đề nghị S4 ghi chú trùng mã này trong bảng ánh xạ P↔H.
> Phạm vi: chỉ viết tài liệu. Không sửa `src/`. Các số "kỳ vọng" là **giả thuyết cần kiểm**, không phải kết quả.

## 0. Tóm tắt xếp hạng

| Hạng | Mã | Nâng cấp | Gộp ứng viên | Hiệu quả (1–5) | Công sức (1–5) | Ưu tiên = H/E | Giám đốc duyệt lên main | Trạng thái (3/11/2026) | Ghi chú trạng thái |
|---:|---|---|---|---:|---:|---:|---|---|---|
| 1 | **B-01** | Làn đơn cho việc nhỏ | "làn đơn" | 5 | 3 | 1,7 | Có | đã làm (`e2a029c`, `994d9c8`) | Bộ chọn làn `e2a029c`, luồng làn đơn `994d9c8`, gộp `630e2b7`. Đo xác nhận đã chạy: TOST bác giả thuyết B-01 (`9b57f5a`); làm gọn tiếp ở B-11 |
| 2 | **B-02** | Cổng chất lượng (kiểm → sửa → mẫu đầu ra → reviewer có điều kiện) | lệnh đỏ vào vòng sửa (đề bài đòi xanh ⇒ bắt buộc, R8); P3; D-02; G5 (loại) | 4 | 3 | 1,3 | Có | đã làm (`28d041d`) | Gộp `6b84363`; mọi làn `b127308`. `gate.maxFixRounds: 2` (`src/config.ts:295`); P3 `src/prompts.ts:543`; D-02 `src/orchestrator.ts:1981`. Recall của cổng đo qua B-12 |
| 3 | **B-10** | Cổng phủ kế hoạch (phần việc không ai nhận ⇒ chặn; kế hoạch đọc dở ⇒ không chạy) | ca t5 C9 (R8) | 4 | 2 | 2,0 | Có | đã làm (`08a5f6f`) | Gộp `fd35de9`. Ghi quyết định cổng vào `runs.jsonl` thuộc B-12 (D9) |
| 4 | B-03 | Nhật ký sự cố khi sửa | P4 | 2 | 1 | 2,0 | Có | D9 | `BRIEF-D9.md` mục 3 |
| 5 | B-04 | Bộ phân tích lệnh shell của hook (nháy, lệnh đọc) | G1, G2 | 3 | 2 | 1,5 | Có (biên bảo mật) | đã làm (`7760ca7`) | Gộp `21502be` |
| 6 | B-05 | Script kiểm nhất quán số liệu | G7 | 3 | 2 | 1,5 | Không | đã làm (`c82cdc0`) | Gộp `fb70da6`; bỏ qua BRIEF*.md `34deadd` |
| 7 | B-06 | Chẩn đoán chặn của hook | G6, D-03 | 2 | 2 | 1,0 | Có | đã làm (`5fd6604`) | Gộp `2b3d439` |
| 8 | B-07 | Trần lượt cho `claude-cli` | D-01 | 2 | 2 | 1,0 | Có | D9 | `BRIEF-D9.md` mục 1 |
| 9 | B-08 | `cwd` của hook và Read tệp tool-results | G3, G4 | 2 | 3 | 0,7 | Có (biên bảo mật) | D9 | `BRIEF-D9.md` mục 2 |
| 10 | B-09 | Giới hạn đầu ra / tín hiệu dừng khảo sát (sau công tắc, mặc định tắt) | P1, P2 | 1 | 1 | 1,0 | Có | D9 | `BRIEF-D9.md` mục 4; trước 3/11 ghi "hoãn" |
| — | **B-11** (R12, vòng 4) | Làm gọn làn đơn: (a-skip) bỏ nghiệm thu [**bị chặn**], (a-brief) bảng tiêu chí ngắn [**cần giám đốc duyệt**], (b) mẫu gọn [**cần giám đốc duyệt**], (c) prompt, (d) định tuyến [**đã có, đóng**: `route()` bỏ lượt LLM khi ép làn đơn]; đo theo arm B7c/B7cb/B7cab; đề xuất chỉ tiêu B-01′ ×1,3 (§5 B-11). **Trạng thái 3/11/2026: B7′ GĐ1 đã chạy, dừng vô ích (R̂ token 2,04, thời gian 2,16 > 1,6; n = 2 mỗi ô); chưa phải kết luận; B7c hủy; ba công tắc chưa đủ cho ×1,3 (mô tả); xem B-11.5** | S1 `b7-cost-decomposition.md`; S2 `b02m-replay.md` (cho (a)); `variance-decomposition.md` (cỡ mẫu B-11.5) | chưa chấm | chưa chấm | — | Có | cần giám đốc duyệt | Công tắc `lanes.single.slim` đã làm (`5e296af`, mặc định: nghiệm thu `full`, mẫu gọn tắt). Chờ duyệt: bật (a-brief), (b), chỉ tiêu B-01′ (`preregistration.md` §9 V4-01). (a-skip) bị chặn |
| — | **B-12** (vòng 4 gói 2) | Bộ bài cài lỗi để đo recall của cổng chất lượng (B-02, B-10, CTO): lượt có lỗi cài sẵn, nhãn thật biết trước, ghi quyết định cổng từng lần | `analysis/agreement.md` §(c) (C-1…C-3) | 3 | 3 | 1,0 | Có (mở đo mới, tốn hạn mức) | đã đo (R18: E4 xong, `f9a5887`; recall b02 và cto chưa ước lượng được vì 0 lượt dương thật; CTO đo lại trên lỗi lọt cổng ở E7; §0.1) | `BRIEF-D9.md` mục 7 (≥ 6 bài, oracle 1,00). Chỉ còn đo sau D9: khoảng 25–46 lượt bài cài lỗi (r = 0,8; B-12 trường 5, `agreement.md` C-3, Bảng 14 của paper), cộng lượt sạch để đo chặn nhầm (n ≥ 72 khi 0 chặn nhầm, B-12 trường 4(b)) |
| — | **B-13** (R14) | Chỉ số trúng cache theo lượt gọi/pha/runtime + ghi `model` và `byPhase` đủ 4 thành phần token | đề xuất 1 của tài liệu "4 hướng"; `cache-sensitivity.md` C-0, C-2; T-2 | 3 | 2 | 1,5 | Có (đổi schema `runs.jsonl` của bench) | D9 | `BRIEF-D9.md` mục 5 |
| — | **B-14** (R14) | Chẩn đoán cache claude-cli (≤ 8 lượt), rồi ổn định tiền tố theo kết quả | đề xuất 2 (và câu hỏi TTL của đề xuất 8); `cache-diagnostic-spec.md` Phần 1; C-1, C-3, C-5 | 3 | 2 | 1,5 | Có (gọi `claude -p`; đổi bộ công cụ chạm hook) | đã đo, giữ tắt (R18: bước 2 xong 13/11/2026, `d312b76`; R̂ 0,999 [0,886; 1,127], p 0,983, không phân biệt được; §0.1) | `BRIEF-D9.md` mục 6: script chẩn đoán và công tắc `stablePrefix` (mặc định tắt). Chỉ còn đo sau D9: chẩn đoán ≤ 8 lượt `claude -p` (6 đo, 1 khởi động, 1 dự phòng; B-14 trường 4), chạy ngoài hook. E1 xong: đổi bộ công cụ là nguồn ghi cache. Bước 2 (A/B trên bench, 96 lượt) giám đốc duyệt lúc 12:50 ngày 4/11 (`results/local-3e/RUNLOG.md:23`, `9e3c410`), chạy local sau E5′, sổ chạy `results/b14-step2/RUNLOG.md`. Tiền điều kiện (6) đạt (script `4e546f4`, dòng hash `c6fd35f`); (7) chưa đạt, thiếu 3 ca, chờ D13 K6 (`f211bc7`); chi tiết ở §5 B-14. Giới hạn ở `preregistration.md` §9 V4-3e-K3 |
| — | **B-15** (R14) | Đo họp bằng arm B1 (`discussionRounds: 0`) trên bài lớn | đề xuất 3; `cache-diagnostic-spec.md` Phần 2 | chưa chấm | 3 | — | Có (mở đo mới) | đã đo (R18: E5′ xong, `f9a5887`; chưa đổi mặc định; §0.1) | E3 xong: B0 không có `discuss` ở cả hai bài (l1-modules: quy tắc 3 của `chooseLane` chọn làn nhanh; l2-chain: làn đơn được nâng lên làn nhanh; hai làn này không họp), nên B0/B1 không đo được họp. E5′ đã đăng ký (§9 V4-3e-E5′, `f36a1d9`; B0F so với B1F, 10 lượt × 2 arm × 2 bài = 40 lượt), D12 đã gộp (`57148de`), giám đốc duyệt lúc 12:50 ngày 4/11 (`9e3c410`). Sổ chạy `results/b15f-main/RUNLOG.md`; chạy sau E6 (§5 B-15). Tiên quyết đã xong: `task.json` của hai bài (`3ff7df3`, D8) |
| — | **B-16** (R14) | Thí điểm "CTO Opus + nghiệm thu brief", đo bằng bộ bài B-12 | đề xuất 4; `cache-diagnostic-spec.md` Phần 3; T-5; C-5; B-11 (a-brief) | chưa chấm | 3 | — | Có (cần duyệt (a-brief) và B-12) | đã đo (R18: E4 H-O1 chưa ước lượng được, `f9a5887`; E7 R2 so với R1 chỉ mô tả, `80f7e94`; chưa đổi mặc định; §0.1) | `BRIEF-D9.md` mục 8: arm `B7cabO`, không đổi mặc định. Chỉ còn đo sau D9: thí điểm 12 cặp (B-16 trường 4), rồi 25–46 lượt lỗi cài mỗi arm (B-16 trường 5); cần bộ bài B-12 |
| — | **B-17** (R14) | Model lập kế hoạch theo độ khó 1–3 | đề xuất 6; tín hiệu tất định của bộ chọn làn; trường `model` của B-13 | chưa chấm | 3 | — | Có | D9 | `BRIEF-D9.md` mục 9: sau công tắc, mặc định tắt; trước 3/11 ghi "hoãn". Đo A/B: chưa có đặc tả số lượt |
| — | **B-18** (R15) | Sandbox cấp hệ điều hành làm lớp 2 sau hook `claude-guard` | `paper.md` §4.2, §8.2 (hook chỉ kiểm mẫu chuỗi); slide bảo vệ dữ liệu; TeamBench tách quyền bằng hệ điều hành | chưa chấm | 4 | — | Có (đổi biên bảo mật; mặc định tắt) | D10 (đặc tả xong, mặc định tắt) | `sandbox-spec.md`: Linux dùng sandbox có sẵn của Claude Code; Windows ứng viên WSL2, dự phòng AppContainer/Job Object + ACL; cần spike G1 trước khi viết mã. Đánh giá 5 lớp: `data-protection-assessment.md` mục "B-18 Sandbox cho hook" |
| — | **B-19** (R15) | Triển khai vòng tự cải thiện RQ5 (7 bước, bộ giữ lại khóa hash) | `self-improvement/design.md`; B-03 (nhật ký sự cố làm đầu vào) | chưa chấm | 4 | — | Có (không tự áp bản vá; mặc định tắt) | đã làm (khóa lại `84ded09`) | `self-improvement/implementation-spec.md`: khóa `selfImprove.enabled: false`; bộ giữ lại 10 bài, sàng lọc 60 lượt, xác nhận 160 lượt (`holdout-and-sample-size.md`, `holdout-lock.json`) |

B-01 và B-02 đứng đầu theo quyết định của giám đốc (2/11, 13:42), không phải theo điểm. **B-10 đứng thứ ba** (R8): cùng điểm ưu tiên 2,0 với B-03, nhưng là mục duy nhất ngoài B-01/B-02 có số đo chất lượng trực tiếp (t5: 95/146 test ẩn, §5 B-10), chặn một loại lỗi mà reviewer LLM đã bỏ lọt, và nên triển khai cùng B-02 (chung bước "trước thực thi/sau thực thi" của pipeline). Thang điểm 1–5 là đánh giá chuyên gia; chỉ B-01/B-02/B-10 có số đo hỗ trợ trực tiếp (§3, §5 B-10).

**Phủ ứng viên:** G1→B-04 · G2→B-04 · G3→B-08 · G4→B-08 · G5→loại, ghi ở B-02 · G6→B-06 · G7→B-05 · D-01→B-07 · D-02→B-02 · D-03→B-06 · P1→B-09 · P2→B-09 · P3→B-02 · P4→B-03 · ca t5 C9 (kế hoạch bỏ sót `agg.js`)→B-10 · ca t5 C9 (`npm test` đỏ mà review duyệt)→B-02 §4.1. **(R14) Tám đề xuất của tài liệu "4 hướng":** 1→B-13 · 2→B-14 · 3→B-15 · 4→B-16 · 5→đã có — B-01 · 6→B-17 · 7→không mở mã · 8→không mở mã, câu hỏi TTL nằm trong B-14 (`analysis/acceleration-crosscheck.md` §1).

**Ghi chú đo lường (R17, BRIEF-18 K4): arm null ăn điểm cao trên `t2-orders` (0,53) và `t4-perf` (0,84).** Theo kết luận K3(a) (`context/k3-open-points-2026-11-04.md` a.1–a.6, commit `f211bc7`), hai bài này làm H6 nghiêng về phía "tương đương giả", không về phía suy biến. Đề xuất S3(a) cho **lần đo sau** (mục a.6): (1) thêm test ẩn để sàn null ≤ 0,25 ở hai bài, kèm rà diff và khóa lại `hidden/`; (2) điểm chuẩn hóa (score − null)/(oracle − null) chỉ làm phân tích phụ; (3) tiêu chí nhận bài vào họ H là null ≤ 0,25 (có thể thêm oracle − nearmiss ≥ 0,05, nhưng tiêu chí này loại thêm bốn bài); (4) báo Δ_i theo bài song song với Δ trung bình. **Không áp cho đợt 3e:** không đổi bài, tham số, H1–H10, biên hay họ Holm. Đợt 3e chỉ thêm phân tích độ nhạy mô tả "bỏ t2, t4" ở cuối `preregistration.md` §9, nhãn "đặt trước dữ liệu E6".

### 0.1 Cập nhật BRIEF-20 (R18, 14/11/2026): kết quả mới và thứ tự việc tiếp theo

Đường dẫn `results/…` dưới đây là `bench/vs-claude/results/…`. Số chép từ báo cáo của từng đợt, không tính lại. Nhãn [Xác nhận]/[Mô tả]/[Khám phá] theo bảng ba trục của S3 (`paper/v07-axes-threats-draft.md`); S6 kiểm lại nhãn khi đồng bộ bài báo.

**(a) Kết quả mới theo hạng mục backlog**

| Đợt (ngày, commit) | Hạng mục | Kết quả (chép từ nguồn) | Nhãn / cách đọc | Quyết định cho backlog | Nguồn |
|---|---|---|---|---|---|
| **B-14 bước 2** (chạy 5/11–12/11, phân tích 13/11/2026, `d312b76`) | B-14 | 96/96 lượt; R̂ = 0,999, CI 95 % [0,886; 1,127], p = 0,983 ⇒ **không phân biệt được**. σ quan sát 0,312 so với 0,182 của kế hoạch; power ở mức 10 % ≈ 0,38; mức tiết kiệm nhỏ nhất phát hiện được (power 0,8) ≈ 16,3 %. Muốn trả lời ở mức 10 % cần ≈ 46 lượt mỗi ô, tổng ≈ **276 lượt**. Độ nhạy (bỏ lượt chạy sớm; cách gom dòng bản đầu; bỏ từng bài) cùng phán quyết | Phép kiểm đăng ký trước; "không phân biệt được" **không** có nghĩa "không có hiệu ứng": CI tương thích với tiết kiệm tới ≈ 11 % hoặc tốn thêm tới ≈ 13 %. Cách gom dòng được sửa sau khi đã thấy bản đầu (đe dọa (iv) của §8 nháp) | **`stablePrefix` giữ tắt** (theo (10) của đăng ký; dữ liệu không ủng hộ bật). Đo lại 276 lượt xếp cuối hàng (mục (b), hạng 9) | `results/b14-step2/report.md` §2, §3, §6; `analysis.json` |
| **E4** (12/11/2026, `f9a5887`) | B-12, B-16 | Recall b02 và cto: **chưa ước lượng được** (0 lượt dương thật trên 64 lượt mỗi cổng); b10: 1/64 = 1,6 % [0,0; 8,4]. Lượt sạch (n = 65, mô tả): b02 0/65, b10 5/60, cto 62/65 [87,1; 99,0]. B-16 H-O1: 0 lượt dương thật, chưa ước lượng được; khám phá ngoài đăng ký: chặn lượt có test ẩn đạt B7cab 23/64, B7cabO 1/64 | [Mô tả]; n < 72 nên không tuyên bố "chặn nhầm ≤ 5 %" | Câu hỏi recall của CTO chuyển sang E7 (lỗi đã lọt cổng). B-12 không mở đo thêm ở gói này | `results/gates-main/report-e4.md` |
| **E5′** (12/11/2026, `f9a5887`) | B-15 | B1F so với B0F (2 bài, 10 lượt mỗi ô): token có trọng số R̂ = 0,722, CI 90 % [0,668; 0,790]; thời gian thực R̂ = 0,717 [0,667; 0,779]; điểm test ẩn Δ = −0,000 [−0,001; 0,000] (không phân biệt được) | Ước lượng đăng ký trước (CI 90 %, không p); chỉ 2 bài, làn đầy đủ **ép** | Chưa đổi `discussionRounds` mặc định: cần giám đốc duyệt (B-15 trường 9). Đưa vào bài báo v0.7 như kết quả phụ | `results/b15f-main/report.md` (bảng "Phân tích chính") |
| **E7** (13/11/2026, `80f7e94`) | B-16 (CTO Opus), B-12 (recall CTO) | 128 mục (64 lỗi lọt `npm test`, 64 đúng). Recall R1/R2/R3: 63/64 = 98,4 % [91,6; 100,0]; 55/64 = 85,9 % [75,0; 93,4]; 61/64 = 95,3 % [86,9; 99,0]. Chặn nhầm: 27/64 = 42,2 % [29,9; 55,2]; 4/64 = 6,3 % [1,7; 15,2]; 30/64 = 46,9 % [34,3; 59,8]. **Chính, R1 so với R3:** chỉ R1 chặn 3, chỉ R3 chặn 1, McNemar p = 0,625; hiệu +3,1 điểm % [−5,1; 11,4]. USD R1/R2/R3: 11,84 / 31,34 / 10,06. R2 có 13 lượt không đọc được kết luận (chạm trần 6 lượt) | Phép kiểm đăng ký trước, nhưng **p chỉ mô tả** (4 cặp bất đồng < 10). R1 − R3 là hiệu của hồ sơ CTO **cộng** lớp vận hành CCoding. **16 cặp (R1 8, R2 8) được phân loại lại thành lỗi hạ tầng và chạy lại sau khi đã thấy kết quả chính**; ba cách tính (như đã ghi lúc đầu, bỏ mục bị phân loại lại, sau chạy lại) cho cùng cách đọc. So sánh R1/R2, Youden J: [Mô tả]/[Khám phá] | Chưa trả lời được "lớp CCoding giúp nghiệm thu bắt lỗi tốt hơn". Không đổi `phaseModels.accept`. Hai việc phát sinh: lỗi 403 bị ghi thành "không đọc được" (BRIEF-D15) và trần lượt bất lợi cho Opus (mục (b), hạng 1, 3, 7) | `results/e7-cto/report.md` §2, §5–§7; `RUNLOG.md`; `preregistration.md` §9 "Sai lệch thực thi E7…" |
| **E8** (13/11/2026, `80f7e94`) | không có mã B (song song có worktree, `fastLane.maxParallel`; trục 3 của bài báo) | `wallSecTask` B6w4/B6w1 = **0,520**, CI 95 % [0,488; 0,552], p ≤ 0,0001 (n = 6/6 ở 3 bài); token có trọng số 1,008 [0,942; 1,075], p = 0,84. Chạy chồng 17/18 (B6w4) và 0/18 (B6w1). Gộp: B6w4 70 lần, 1 tin xung đột, không ca nào còn xung đột; B6w1 70 lần, 0. Cổng cuối đỏ 0/18 ở cả hai. Pass 13/18, 15/18, A0 17/18. So với A0-sonnet (mô tả): thời gian B6w4/A0 0,59 (`l1-modules`), 2,08 (`t2-orders`), 1,36 (`t3-api`); token 1,41 / 3,95 / 2,11 | Tỉ số thời gian: phép kiểm đăng ký trước. So với A0: [Mô tả], **chỉ `l1-modules` nhanh hơn agent đơn**. Giới hạn: server A/B lẫn với arm; σ kế hoạch 0,178 lấy từ arm một agent | Giữ `fastLane.maxParallel` mặc định (4, cấu hình server A của E8). Không đổi mã. Việc khám phá tiếp: chỉ chia việc khi bài chia được (mục (b), hạng 8) | `results/e8-parallel/report.md` §2–§5; `RUNLOG.md`; `extract-*.json` |
| **Trục 2 phần (b)** (14/11/2026; khóa danh sách `74f11d9` trước kết quả `6dac52c`) | B-18 (sandbox), B-04 (bộ phân tích lệnh) | RedCode-Exec, 600 mục Bash → 82 lệnh một dòng, đều "nên chặn". Tầng `git-read`: 82/82, CI 95 % [95,6; 100] % ⇒ "chặn được phần lớn ca của bộ này ở tầng chính sách tĩnh" (52 ca do `not-read-only`, 30 do `deny-list`). Tầng `full`: 30/82 = 36,6 % [26,2; 48,0] % ⇒ "bộ kiểm không phải rào chính cho loại ca này, cần lớp khác (sandbox)". Theo nhóm ở `full`: `wget` 0/30, `cp` 0/2, xóa tệp hệ thống 0/20, alias vào `.bashrc` 30/30 | **[Mô tả]**: 82 ca thuộc 4 nhóm kỹ thuật nên CI theo ca hẹp hơn độ bất định thật; cận trên 48,0 % sát ngưỡng 50 %. Bộ dự phòng không dùng (82 ≥ 30), nên **chặn nhầm trên ca vô hại không đo**. Phần (a): **chặn nhầm trên lệnh thật chưa đo, chờ giám đốc chỉ định hai người gán nhãn** | Không sửa chính sách trong lần đo này. Số của tầng `full` là bằng chứng mô tả cho B-18; cơ chế lọt chưa đọc lại mã (mục (b), hạng 4–5) | `results/axis2-guard/report.md`, `RUNLOG.md`, `results.json`; `preregistration.md` §9 "Đăng ký trước trục 2" |
| **P chạy lại** (13/11/2026, `b3485bb`) | không có mã B (trục 3) | P-1, P-2, P-3 trùng bảng cũ: 42/54 [64,4; 88,0]; 375 phút, 27,5 % (cận trên); xung đột 6/213; đỏ mới 2/47. Số mới ngoài đăng ký: đường găng 771 so với 717 phút (42 lượt) | [Mô tả]; số đường găng [Khám phá] | Tái lập độc lập trên máy giám đốc (mục (b), hạng 6) | `results/p-parallel/RUNLOG.md`, mục "Chạy lại bằng `p-analyze.mjs` sau BRIEF-19" |

**(b) Thứ tự việc tiếp theo, xếp theo mức bằng chứng**

Mức bằng chứng (thang dùng cho bảng này, do trưởng phòng đặt): **M1** — hiện tượng đã quan sát và đếm được trong dữ liệu đo, có hậu quả vận hành; **M2** — sai lệch quy trình đã ghi ở §9 hoặc RUNLOG, làm giảm giá trị các đợt sau nếu không sửa; **M3** — kết quả [Mô tả]/[Khám phá] chỉ ra chỗ hở, chưa có số đo về cách sửa; **M4** — chưa có số đo, chờ quyết định hoặc người. Trong cùng mức, việc rẻ và không tốn hạn mức LLM đứng trước.

| Hạng | Việc | Mức | Căn cứ (tệp) | Ai / điều kiện | Trạng thái 14/11/2026 |
|---:|---|---|---|---|---|
| 1 | **BRIEF-D15 K1:** lượt gọi có `error` không được dùng `text` làm kết quả; lỗi hạ tầng ở accept không được ghi thành "không đọc được kết luận" | M1 | E7: 16 cặp accept (R1 8, R2 8) gặp lỗi xác thực 403, bị ghi "không đọc được" rồi vẫn giao (`results/e7-cto/report.md` §5; `BRIEF-D15.md` mục "Hiện tượng") | Phòng Dev (sửa `src/`, có test runtime giả); không gọi `claude -p` thật | Đã giao 13/11 (`be17221`). `git log --grep D15` trên nhánh này (14/11) chỉ thấy commit giao, chưa thấy commit gộp |
| 2 | **Ghi `authSource` ở mọi arm và đặt thành điều kiện dừng của mọi đợt sau** | M2 | §9 "Sai lệch thực thi E7/E8 …": arm `claude -p` từng nhận `ANTHROPIC_API_KEY` của máy chạy, sửa ở `7ff4b9c`. Harness ghi trường này (`bench/vs-claude/lib/claude.mjs:39`, `lib/queue.mjs:180`); E8 RUNLOG: `authSource` của A0 đều `none`. Tìm `authSource` trong `src/` (14/11) cho 0 kết quả, tức runtime CCoding chưa ghi nguồn xác thực | Phòng Dev (gói riêng, chạm `src/runtimes/claude-cli.ts`); Phòng Nghiên cứu thêm dòng kiểm vào mẫu RUNLOG. Các đợt trước 13/11 ghi "không biết" (đe dọa (ii)) | Chưa giao |
| 3 | **BRIEF-D15 K2:** chẩn đoán vì sao 403 chỉ xảy ra trên đường runtime CCoding | M1 (hiện tượng) / nguyên nhân [CHƯA KIỂM CHỨNG] | Cùng khoảng thời gian, `claude -p` gọi thẳng chạy bình thường (`BRIEF-D15.md`); E7 phải chạy lại 16 cặp muộn 6–7 giờ (`report.md` §7) | Phòng Dev; ghi chú chẩn đoán, không đổi cơ chế đăng nhập, không thêm khóa API | Đã giao 13/11 (`be17221`), chưa có kết quả trên nhánh này |
| 4 | **Trục 2 phần (a):** chặn nhầm trên lệnh thật | M4 | Phần (b) chỉ đo một phía (chặn đúng trên ca nguy hại); bộ dự phòng không kích hoạt nên chặn nhầm trên ca vô hại cũng chưa đo (`results/axis2-guard/report.md:13`, `:71`). Mốc n = 72 cho cận trên < 5 % khi 0 chặn nhầm đã kiểm bằng script (`report.md:44`) | **Chặn nhầm trên lệnh thật chưa đo, chờ giám đốc chỉ định hai người gán nhãn.** Lệnh thật là dữ liệu Nội bộ: che trước khi vào repo, không commit lệnh chưa che | Chờ giám đốc |
| 5 | **Trục 2 phần (b), chỗ hở ở tầng `full`:** xác định cơ chế 52 ca lọt trước khi đề xuất rule | M3 | `wget` 0/30, `cp` 0/2, xóa tệp hệ thống 0/20 ở `full`; cơ chế "chưa đọc lại mã", nhóm 9 chưa tách được do chuỗi alias hay do chuyển hướng (`report.md:46-50`) | Phòng Nghiên cứu đọc `deniedReason` và mã (không gọi LLM); mọi đổi chính sách là biên bảo mật ⇒ giám đốc duyệt + bộ test lệnh ác ý (B-04 trường 7). Là bằng chứng mô tả cho B-18 | Chưa giao |
| 6 | **Tái lập P trên máy giám đốc** | M2 | P-b: sha256 script không có mốc git trước lần chạy; RUNLOG commit sau khi trích (`results/p-parallel/RUNLOG.md:42-44`). Lần chạy lại 13/11 do chính người điều phối làm trên bản sao | Giám đốc hoặc người được chỉ định chạy `p-extract.mjs`/`p-analyze.mjs` ở commit đã ghim, ghi sha256 vào RUNLOG **trước** khi chạy. Tệp từng lượt vẫn không vào repo; bỏ hoặc làm mờ `createdAt` nếu cần chia sẻ (`RUNLOG.md:45`) | Chưa giao |
| 7 | **Model nghiệm thu (E7):** đăng ký trước một phép đo R2 với trần lượt cao hơn trước khi xét đổi `phaseModels.accept` | M3 | Sonnet chặn nhầm 42,2 % (R1) và 46,9 % (R3); Opus 6,3 % nhưng recall 85,9 % và 13 lượt không đọc được do trần 6 lượt; USD ×2,6 (`results/e7-cto/report.md` §2, §5, §6). E4 khám phá cùng chiều (B7cab 23/64, B7cabO 1/64) | Phòng Nghiên cứu viết đăng ký; giám đốc duyệt chi phí Opus (B-16 trường 9). Chạy sau hạng 1–3 | Chưa đăng ký |
| 8 | **Chia việc theo khả năng chia (E8):** chỉ chia nhiều agent khi bài chia được thành phần độc lập | M3 | E8: B6w4 nhanh hơn A0 chỉ ở `l1-modules` (0,59); `t2-orders` 2,08, `t3-api` 1,36, token 2–4 lần (`results/e8-parallel/report.md` §3, §4). P: lợi ích còn lại bị giới hạn bởi phụ thuộc (đường găng 771/717) | Nối với tín hiệu `parts` của B-01 §3.1; cần đặc tả và đăng ký trước, không mở đo ở gói này | Khám phá, chưa đặc tả |
| 9 | **B-14: đo lại `stablePrefix` ở mức 10 %** | M3 (tín hiệu không phân biệt được) | ≈ 276 lượt, power hiện tại 0,38 (`results/b14-step2/report.md` §2, §6) | Chỉ mở nếu giám đốc cần câu trả lời ở mức 10 %; theo report §6, nên ưu tiên hạng mục khác | Không xếp lịch |

---

## 1. Kiểm nhận định N1–N5 bằng CSV

**Nguồn:** `docs/research/context/tool-failures-2026-11-02.csv` (75 dòng dữ liệu, 2 nhiệm vụ: `…112755-181` 39 dòng, `…121636-dd9` 36 dòng).
**Lệnh:** `node docs/research/context/failures-count.mjs` (đếm), `… --list <category>` (liệt kê, cột đầu là số thứ tự dòng dữ liệu `#`), `… --ro-other` (lượt chỉ đọc chưa giải thích). Script phân tích CSV có trường nhiều dòng; chỉ đọc.

### 1.1 Đếm lại (khớp bảng của người giao việc)

| Loại | Số lượt | Theo công cụ | Theo vai trò (số lượt) |
|---|---:|---|---|
| `git-read-deny` | 44 | 44 `run_command` | academic-writer 16 · peer-reviewer 8 · solution-architect 5 · methodologist 4 · research-lead 4 · dev-lead 4 · literature-researcher 3 |
| `outside-path` | 10 | 8 `run_command`, 1 `write_file`, 1 `read_file` | data-scientist 5 · qa-tester, backend-dev, devops, solution-architect, academic-writer 1 mỗi vai trò |
| `exit-nonzero` | 8 | 8 `run_command` | data-scientist 6 · qa-tester 1 · literature-researcher 1 |
| `tool-error` | 6 | 4 `edit_file`, 1 `fetch_url`, 1 `write_file` | academic-writer 4 · methodologist 1 · data-scientist 1 |
| `read-gate-nudge` | 5 | 4 `read_file`, 1 `search` | solution-architect 3 · methodologist 1 · academic-writer 1 |
| `policy-other` | 2 | 2 `run_command` | data-scientist 2 |
| **Tổng** | **75** | 56 pha execute · 8 review · 5 revise · 4 plan · 2 synthesize | |

### 1.2 Bảng kiểm

| # | Nhận định | Truy vấn / lệnh | Kết quả | Kết luận |
|---|---|---|---|---|
| N1a | Phần lớn `git-read-deny` thực chất chỉ đọc | `failures-count.mjs` (mục "N1: … phân loại tĩnh"): bỏ chuỗi trong nháy, rồi tìm chuyển hướng ra tệp, heredoc, `sed -i`, `rm/mv/cp/mkdir/touch/tee`, `node/python/npm` | **36/44 (81,8 %)** chỉ đọc · 3 chạy `node` (không ghi) · 5 có ghi hoặc heredoc (chặn đúng) | **Đúng** (phân loại tĩnh theo văn bản lệnh, chưa phát lại qua hook) |
| N1b | Nguyên nhân: tách theo `\|` và `;` không xét nháy | Trong 36 lượt chỉ đọc, đếm lượt có `\|` hoặc `;` nằm **bên trong** chuỗi có nháy; đối chiếu mã `shell-policy.ts:171` (`split(/&&\|;/)`), `:177` (`split('\|')`), `:170` (`[<>]` bất kỳ ⇒ chặn) | **30/36** có dấu tách trong nháy (vd. `grep "a\|b"`, `sed -n '271p;480p;524p'`, regex `^(a\|b)`) | **Đúng** — mã không biết nháy ở 3 chỗ trên. Lưu ý: dòng 170 còn chặn cả `>` trong nháy |
| N1c | Hook không nhận `echo`, `sed -n` nhiều địa chỉ, `tail -c`, `awk` | Trong 36 lượt chỉ đọc: đếm `echo`, `sed -n`, `awk`, `tail -c`, `for`; đối chiếu `READ_CMD` (`shell-policy.ts:149`), `SED_PRINT` (`:151`) | `echo` **4** · `awk` **1** · `for` **1** · `sed -n` **10** (không đếm riêng được bao nhiêu lượt nhiều địa chỉ) · `tail -c` **0** | **Đúng một phần.** `echo`, `awk` không có trong `READ_CMD` ⇒ đúng. `SED_PRINT` chỉ nhận một địa chỉ `Np`/`N,Mp` ⇒ nhiều địa chỉ bị chặn, đúng. **`tail -c` sai:** `tail` có trong `READ_CMD`; lần `tail -c 400 ../paper/paper.md` (dòng #45) bị chặn do đường dẫn, không do lệnh. Phân loại lại: `tail -c` → N2 |
| N1d | (bổ sung) lượt chỉ đọc chưa giải thích | `--ro-other` | 1 lượt (#5, lệnh bị cắt trong CSV) | Không đủ dữ liệu; nhiều khả năng cùng nguyên nhân N1b |
| N2a | Một số `outside-path` chặn nhầm vì `../` tính từ gốc worktree, trong khi Bash giữ `cwd` | `--list outside-path`; đọc các dòng #21, #45 | #45 `tail -c 400 ../paper/paper.md` chạy sau lệnh `cd docs/research/performance` ở lệnh trước (cùng vai trò) ⇒ nếu `cwd` được giữ thì đường dẫn nằm trong worktree. #21: `../data` nằm trong chuỗi `sed` | **Đúng một phần:** 2/10 lượt có dấu hiệu chặn nhầm; **không chứng minh được** từ CSV vì CSV không có `cwd` thật (đó là lý do cần G3) |
| N2b | Một lượt chặn Read tệp `tool-results` | `--list outside-path` dòng #33: `read_file` tới `<home>\.claude\projects\…\tool-results\…` | 1 lượt | **Đúng** (1/10) |
| N2c | (kết quả kiểm) chặn đúng chính sách | dòng #12 (`write_file` vào thư mục Temp), #51 (`cat > /tmp/patch.mjs`) | 2/10 | Đúng chính sách; hướng dẫn của giám đốc cũng cấm `/tmp` |
| N2d | (không xác định) | dòng #26, #27 (`cd ..; cd ..`, `cd ../../..`), #28, #50, #58 | 5/10 | Không thể kết luận từ CSV (thiếu `cwd` lúc gọi) |
| N3a | peer-reviewer không chạy được `token-analysis.mjs --check` và `node --test` | `--list git-read-deny`, lọc `agent=peer-reviewer` | 8/8 lượt bị chặn đều là `git-read-deny`; **4/8** (#16, #22, #70, #75) là lệnh `node …token-analysis.mjs` / `--check`; 4/8 còn lại là lệnh đọc bị tách sai (#17 `cat`, #18 `sed -n '271p;480p;524p'`, #20, #71–#72 tổ hợp `grep`/`ls`) | **Đúng một phần:** 50 % số lượt chặn của reviewer là lệnh kiểm tra thật; 50 % là lỗi parser (N1) |
| N3b | Đây là một nguồn làm điểm Chất lượng của reviewer thấp | Không kiểm được: CSV không chứa cách tính điểm; `kpi.ts` tính Chất lượng từ nhiều tín hiệu | — | **Chưa kiểm được.** Cần `GET /api/kpi?agent=peer-reviewer` kèm chi tiết phần Chất lượng trước/sau khi `checkCommands` chạy. Dùng làm KPI kiểm lại của B-02 |
| N3c | CCoding tự chạy `checkCommands` trước thực thi, sau thực thi, sau mỗi vòng sửa | Đọc `orchestrator.ts:1326` (baseline), `:2535` (chạy), `:1360` (chạy lại khi `staleAt`), `:1391-1393` (đưa kết quả vào bằng chứng review) | Có ở baseline, sau thực thi, và trước review khi workspace đã đổi | **Đúng**, nhưng reviewer vẫn bị gọi trước khi mã đỏ được xử lý (xem B-02) |
| N4 | Lỗi cuối của academic-writer là số cũ sót ở tệp khác | CSV không chứa nội dung tệp. Gián tiếp: các lệnh #42, #43, #60, #62–#68 của academic-writer là chuỗi `grep` tìm cụm lỗi thời. Kiểm hiện trạng: Grep `C6[^\|\n]{0,40}chưa có\|chưa có dữ liệu` trong `docs/research/*.md` | `paper.md` 0, `challenges.md` 0; còn 33 chỗ ở `CHANGELOG.md` 11, `dev-review.md` 8, `dev-review/verification.md` 13, `context/kpi-…md` 1 (đều là lịch sử hoặc trích dẫn) | **Không kiểm được từ CSV; hiện trạng đã sạch ở 2 tệp bị nêu.** Cơ chế "một số lệch giữa nhiều tệp" hợp lý (R1-xx trong `dev-review.md`) nên giữ B-05 ở mức hỗ trợ, không phải sửa nóng |
| N5 | Vượt ngân sách vì đề bài lớn | CSV không có token. `kpi-research…md:20-23`: data-scientist 3,9M/hạng mục; phòng 30,4M so với 10M | — | **Chưa kiểm được** từ CSV. Phép kiểm cần: token mỗi nhiệm vụ theo kích thước đề bài (API `kpi`), so gói nhỏ này (6M cho 3 hạng mục) với nhiệm vụ trước. Khớp với B-01: không chia việc nhỏ ra nhiều agent |

**Điều chưa nhận định nào nêu:** 75 lượt lỗi = 75 vòng gửi lại cả hội thoại. Chỉ riêng `git-read-deny` do parser (36) là 48 % tổng lỗi; sửa B-04 là cách rẻ nhất để bớt chúng. Số token thực của chúng **chưa đo** (CSV không có token).

---

## 2. Bằng chứng nền cho B-01 và B-02

Chạy: `node docs/research/context/lane-threshold.mjs` (đọc `bench/vs-claude/results/runs.csv`, vòng C7, Sonnet đơn và làn nhanh cùng thời điểm).

| Bài | Sonnet đơn (s) | Làn nhanh (s) | Tỉ lệ TG | Sonnet ($) | Làn nhanh ($) | Tỉ lệ chi phí | Test ẩn làn nhanh |
|---|---:|---:|---:|---:|---:|---:|---|
| t1-duration | 65,5 (n=2) | 109,0 (n=1) | 1,66 | 0,200 | 0,398 | 1,99 | 149/149 |
| t2-orders | 41,5 (n=2) | 71,0 (n=1) | 1,71 | 0,156 | 0,396 | 2,53 | **52/60** |
| t3-api | 107,5 (n=2) | 192,0 (n=1) | 1,79 | 0,341 | 1,126 | 3,30 | 87/87 |
| t4-perf | 49,0 (n=2) | 120,0 (n=1) | 2,45 | 0,150 | 0,533 | 3,56 | 19/19 |
| t5-logq | 165,5 (n=2) | 127,0 (n=1) | 0,77 | 0,439 | 1,038 | 2,36 | 146/146 |
| Σ | 429,0 | 619,0 | **1,44** | 1,286 | 3,492 | **2,72** | |

- **Cơ sở của các tỉ lệ:** 1,44 và 2,72 là tỉ lệ **tổng thô, chỉ C7** (Σ làn nhanh / Σ Sonnet đơn, 5 bài, đơn vị gốc). Các tỉ lệ của S1 trong `token-analysis.md` (1,545 và 2,947) là **C7+C8 phân tầng theo bài**; hai bộ số khác cơ sở chứ không mâu thuẫn. Backlog dùng bộ C7 vì C8 không có Sonnet đơn (D1). Nếu hai bộ cần so, dẫn theo mã bảng của S1.
- Tổng thời gian khớp bảng **T-d (3)** (`token-analysis.md:292`: 429,0 s và 619,0 s). Phần cố định của điều phối (kế hoạch + review + gộp) = **239,5 s = 55,8 %** thời gian Sonnet đơn (C7; `token-analysis.md:292`, đọc ở `:300`); gộp C5–C7 là 72,8 % (`:298`). C8 chỉ có 3 lượt làn nhanh trên t2 và không có Sonnet đơn (quyết định D1) nên không làm đổi 55,8 %.
- Cố định trung bình mỗi bài ở C7: 239,5 / 5 ≈ **48 s** (khoảng 38,5–58,6 s; `token-analysis.md:287-291`).
- Hồi quy thô (5 điểm, mỗi điểm 1 lượt làn nhanh): TG làn nhanh = **87,1 + 0,428 × TG đơn**; giao điểm T* = a/(1−b) = **152 s**. Dưới T*, làn nhanh chậm hơn; trên T*, nhanh hơn. Đây là **khám phá n=5**, không có CI; chính thức hóa bằng ĐK-P4 (hệ số chặn, độ dốc) ở C9.
- Bài duy nhất làn nhanh thắng về thời gian là t5 (165,5 s đơn). Về **chi phí** làn nhanh đắt hơn ở cả 5 bài (1,99–3,56 lần).
- Độ dài đề bài của t1–t5 là 372–542 ký tự (`bench/vs-claude/tasks/t*/prompt.txt`) và repo nhỏ, nên quy tắc làn tự chọn hiện có (`config.ts:294`: `maxBriefChars` 4000, `maxRepoFiles` 300; `orchestrator.ts:1115-1136`) chọn làn nhanh cho **cả 5 bài**, trong khi 4/5 bài chậm hơn Sonnet đơn. Tín hiệu hiện có không phân biệt được.
- t2 làn nhanh C7: 52/60 test ẩn, Sonnet đơn 60/60 (`runs.csv`, C7, t2). C8 (sau `c55a249`): 3/3 lượt 60/60 (166, 102, 120 s; $1,22, $0,55, $0,61). n quá nhỏ để kết luận; nhưng chứng minh test ẩn có thể tụt, cổng chất lượng là cần thiết.
- **(R8) C9, t5 làn nhanh lượt 2:** 95/146 test ẩn trong khi `npm test` vẫn đỏ và review vẫn duyệt (chi tiết và dòng dẫn ở §4.1 bước 2 và §5 B-10). Đây là ca thứ hai sau t2 C7 cho thấy test ẩn tụt ở làn nhanh, lần này do **kế hoạch bỏ sót phần việc**, không do lỗi cài đặt.

---

## 3. B-01 — Làn đơn cho việc nhỏ

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Với việc nhỏ, điều phối nhiều bên trả phí cố định mà một agent đơn không phải trả: làn nhanh C7 chậm 1,44 lần và đắt 2,72 lần Sonnet đơn (cùng mô hình). Mục tiêu giám đốc: việc nhỏ dùng agent đơn. |
| **2. Bằng chứng** | §2: `lane-threshold.mjs` (Σ 619,0 s so với 429,0 s; $3,492 so với $1,286). `token-analysis.md` T-d (3) `:292` (cố định 55,8 %). `PROCESS-REVIEW.md:221-280` (§13): C5 và C6 cùng chiều. Làn tự chọn hiện nay chọn làn nhanh cho cả t1–t5: `orchestrator.ts:1115-1136`, `config.ts:294`. |
| **3. Nguyên nhân gốc** | **Đã kiểm một phần:** phần cố định = kế hoạch (115,6 s) + review (116,8 s) + gộp (7,1 s) trên 5 bài (T-d (3)); mỗi lượt gọi agent là một phiên `claude -p` mới ghi lại tiền tố cache (`PROCESS-REVIEW.md:266`). **Giả thuyết:** execute song song không bù được (execute/Sonnet đơn 48–132 %, `token-analysis.md:287-291`) vì phần việc nhỏ không chia song song được. |
| **4. Thay đổi đề xuất** | Thêm `lane: 'single'` bên cạnh `'fast'`/`'full'`; chọn tự động theo §3.1; mặc định cho việc nhỏ. Luồng ở §3.2. |
| **5. Hiệu quả kỳ vọng** | Trên t1–t5: thời gian và chi phí trong **±15 %** Claude Code đơn cùng mô hình (từ 1,44× và 2,72× hiện nay). Kỳ vọng thời gian −30 % và chi phí −60 % so với làn nhanh (C7). **Giả thuyết**. |
| **6. Cách kiểm lại** | **Hệ chính (bộ đo giám đốc):** H5 (tỉ lệ chi phí token có trọng số và thời gian, `analyze.mjs:80-85`), H1/H2 (việc chia được / việc gắn chặt, `:61-68`), H10 (lợi thế tăng theo `size`, `:108-115`), H6 (agent đơn cùng lượng tính toán, `:86-91`); giả thuyết B-01 mới của bản 2 (TOST ±15 % so với A0-sonnet trên token có trọng số, thời gian thực, điểm — S4). **Bộ cũ t1–t5:** ĐK-P1 (thời gian làn nhanh/Claude Code ≥ 1,3 ⇒ lý do tồn tại B-01), ĐK-P2 (chi phí làn nhanh > Claude Code), ĐK-P3 (test ẩn không kém hơn, biên 2 điểm %), ĐK-P4 (hiệu chỉnh ngưỡng), ĐK-P5 (l1-modules), ĐK-P6 (l2-chain), ĐK-P9 (tương đương ±15 %, nay ánh xạ sang giả thuyết B-01 mới). Vòng benchtest: C9 cho ĐK-P1–P3 (sau `c55a249`; làn đơn chưa tồn tại ở C9 nên C9 chỉ cho baseline); vòng sau B-01 cho giả thuyết B-01; t6–t8 giữ lại cho ĐK-P7. |
| **7. Rủi ro và bảo vệ dữ liệu** | Rủi ro: (a) chọn sai làn ⇒ việc lớn chạy đơn chậm — giảm bằng §3.3 nâng cấp; (b) mất reviewer ⇒ chất lượng — giảm bằng B-02. Dữ liệu: làn đơn chạy trong worktree, qua `Orchestrator.call()`, `LogStore`, hook, nhãn dữ liệu và Data Protection Gate như làn khác; không thêm đường ghi ngoài `data/`. |
| **8. Ưu tiên** | Hiệu quả 5 / công sức 3 = 1,7. Bắt buộc đứng đầu. |
| **9. Giám đốc duyệt** | **Có** — thay đổi mặc định chọn làn của hệ thống. |

### 3.1 Tiêu chí nhỏ/lớn tự động

**Tín hiệu tính trước khi chạy** (không gọi LLM, tất cả đã có hoặc suy ra từ `git ls-files` và đề bài):

| Tín hiệu | Cách lấy | Giá trị t1–t5 | Dùng để |
|---|---|---|---|
| `briefChars` | `task.brief.length` (đã dùng ở `orchestrator.ts:1121`) | 372–542 | Chặn trên (đề dài ⇒ lớn); **không** phân biệt t1–t5 |
| `parts` — số phần độc lập | Đếm mục đánh số/gạch đầu dòng ở cấp cao nhất, hoặc số module được nêu tên trong đề | chưa đo; l1-modules = 5, l2-chain = 4 tầng phụ thuộc | Quyết định chính: cần ≥ 3 phần độc lập thì song song mới có ích |
| `filesTouched` | Số đường dẫn trong đề bài khớp `git ls-files`, cộng số thư mục được nêu | chưa đo | Phạm vi |
| `repoFiles`, `repoBytes` | `git ls-files` (đã có, `:1122-1135`) | nhỏ | Chặn trên |
| `forced` | `options.lane` hoặc cấu hình dự án | — | Người dùng/dự án ép làn (đã có `'fast'/'full'`, `:1116-1118`) |

**Công thức (theo D7):** dùng làn đơn khi `T̂_đơn < k × a`. Chỉ **một** định nghĩa của `a`: **hệ số chặn của hồi quy `TG_làn-nhanh = a + b × TG_đơn`** (đúng biến của ĐK-P4, `preregistration.md` §7); `k = 1/(1−b)`, nên `k × a` chính là giao điểm T* mà dưới đó đa-agent chậm hơn.

- Giá trị khởi đầu (hồi quy thô C7, n=5, §2): `a₀ = 87,1 s`, `b₀ = 0,428` ⇒ `k₀ = 1/(1−0,428) = 1,75` ⇒ `k₀ × a₀ ≈ 152 s`. Đây là **thăm dò trên chính C7**, không dùng làm bằng chứng cho ĐK-P1–P3.
- Con số 48 s (cố định trung bình mỗi bài, §2) là **đại lượng mô tả** các pha plan+review+gộp, **không** phải `a` và không vào công thức. (Bản trước trộn hai định nghĩa: 1,75 × 87,1 ≈ 152 ≈ 3 × 48; đã bỏ `k₀ = 3`.)
- **Bản đầu quyết định bằng quy tắc thứ tự 1–4 dưới đây; `k × a` chưa dùng để quyết định ở bản đầu.** Lý do: chưa có nguồn `T̂_đơn` đáng tin (5 điểm, `briefChars` không phân biệt).
  1. `forced` ⇒ theo ép.
  2. `briefChars > fastLane.maxBriefChars` hoặc repo vượt ngưỡng hiện có ⇒ **lớn**.
  3. `parts ≥ 5` hoặc `filesTouched ≥ 6` ⇒ **lớn** (ngưỡng đặt tại cỡ l1-modules; hiệu chỉnh theo ĐK-P5).
  4. Ngược lại ⇒ **nhỏ ⇒ làn đơn**.
- **Nguồn `T̂_đơn` cho giai đoạn 2** (bật khi dự án có ≥ 3 nhiệm vụ làn đơn đã xong): `T̂_đơn` = trung vị `wall` của các nhiệm vụ làn đơn trước đó **cùng dự án** có cùng `parts` (làm tròn lên bậc 1–2, 3–4, ≥ 5); thiếu lịch sử thì dùng quy tắc 1–4. Khi có `T̂_đơn`, thêm điều 5: `T̂_đơn ≥ k × a` ⇒ lớn. Hành vi hệ thống do đó **chỉ đổi theo `k`, `a` ở giai đoạn 2**; ở giai đoạn 1 C9/ĐK-P4 chỉ hiệu chỉnh ngưỡng `parts`/`filesTouched` (cùng ĐK-P5, ĐK-P6).
- **Mâu thuẫn đã biết, chấp nhận có chủ ý:** t5 (165,5 s đơn) lớn hơn `k₀ × a₀ = 152 s`, nhưng quy tắc 1–4 đưa t5 vào làn đơn (4 phần). Làn đơn trên t5 dự kiến ≈ Claude Code (không thua về thời gian so với Claude Code; chậm hơn làn nhanh C7 127 s) nhưng rẻ hơn nhiều (làn nhanh đắt 2,36× ở t5); mục tiêu giám đốc là tối ưu chi phí. Kiểm bằng giả thuyết B-01 (ĐK-P9) trên t5. Nếu C9 cho thấy giai đoạn 2 xếp t5 vào làn lớn mà đo được lợi, chuyển bằng điều 5. (R8: ca t5 C9 lượt 2 — kế hoạch đa-agent bỏ sót `agg.js`, §5 B-10 — là thêm một lý do giữ t5 ở làn đơn: một agent không có bước chia việc nên không thể "bỏ sót hạng mục".)
- Nhật ký bắt buộc ghi `signals`, `lane`, `why` (như `⚡ Làn nhanh (${pick.why})`, `orchestrator.ts:1169`) để hiệu chỉnh sau.

**Kế hoạch hiệu chỉnh** (S2 viết quy tắc cập nhật chính thức trong `preregistration.md`; phần S3 đề xuất để thống nhất):
- Với dữ liệu C9 (t1–t5) và l1-modules, l2-chain: hồi quy `TG_đa-agent = a + b × TG_đơn` (đó là ĐK-P4) cho `a` và `b`, từ đó `k = 1/(1−b)`; cập nhật `a₀, k₀` (§3.1) và chỉ có hiệu lực lên quyết định từ giai đoạn 2. Nhầm sang việc lớn rẻ hơn nhầm sang việc nhỏ về chi phí (làn nhanh đắt 2,72× ở C7), nên khi `b` ước lượng có CI rộng, lấy cận trên của `k`.
- Ngưỡng `parts` và `filesTouched`: chỉnh theo ĐK-P5 (l1-modules: CCoding nhanh hơn?) và ĐK-P6 (l2-chain: CCoding không nhanh hơn và tốn hơn ⇒ chuỗi phụ thuộc không nên vào đa-agent dù có nhiều tầng; ⇒ thêm tín hiệu `phụ thuộc tuần tự` giữ làn đơn). Trên bộ đo giám đốc, ngưỡng tương ứng được kiểm bằng H10 (`analyze.mjs:108-115`, biến `size`) — xem thẩm định `size` của S1 (`suite-review.md`).
- Không chỉnh ngưỡng bằng t6–t8 (bài giữ lại, chỉ để xác nhận, ĐK-P7).

### 3.2 Luồng làn đơn

1. Chọn làn (§3.1), ghi `signals`. Chạy `checkCommands` baseline (đã có `orchestrator.ts:1326`).
2. **Một agent đúng vai** (vai chọn theo loại việc; có quyền `exec` nếu dự án có `checkCommands`) chạy pha `execute` trong worktree nhiệm vụ. Không route/plan/discuss/finalize, không họp, không kế hoạch nhiều bên, không worktree con, không tổng hợp bằng LLM.
3. Gọi qua `Orchestrator.call()` (log, token, chính sách dữ liệu, KPI) — không gọi runtime trực tiếp.
4. Chạy cổng chất lượng (B-02).
5. Báo cáo (`FINAL.md`) dựng từ đầu ra theo **mẫu của giám đốc** không gọi LLM, như `finalReport: 'template'` (`orchestrator.ts:1488`); đầu ra của agent phải đủ mục "Mẫu đầu ra" của vai đó (kiểm ở B-02).
6. Chi phí cố định kỳ vọng còn lại: 0 pha plan/review/synthesize (trừ khi B-02 yêu cầu reviewer).

### 3.3 Nâng lên multi-agent

Điều kiện (một trong): (a) còn đỏ sau N vòng sửa của B-02; (b) phạm vi phát sinh vượt ngưỡng: `filesTouched` thực tế (từ diff) > 6 hoặc > 2 × ước lượng ban đầu, hoặc agent phát hiện `parts ≥ 5`; (c) agent đơn tự báo việc lớn (dòng `ESCALATE:` kèm danh sách phần độc lập trong đầu ra). **Giữ worktree** và bàn giao dở dang: diff hiện tại, kết quả `checkCommands` (`pc.baseline`, `pc.latest`), ghi chú của agent; làn đầy/nhanh nhận lại worktree thay vì làm lại từ đầu (cơ chế lưu trạng thái: `this.save(task)`, `run.revising`, `orchestrator.ts:1343-1350`). Sự kiện nâng cấp ghi vào log và vào `Sai lệch`/KPI vì đó là chi phí đã trả. Kế hoạch đa-agent sau nâng cấp phải qua cổng phủ kế hoạch B-10.

### 3.4 Chỉ tiêu nghiệm thu B-01

| Chỉ tiêu | Ngưỡng | Cách đo | Vòng |
|---|---|---|---|
| Thời gian so với Claude Code đơn cùng mô hình | trong ±15 % (tỉ lệ ∈ [0,85; 1,15]) | `runs.csv` `wall_s`, CI bootstrap 95 % | vòng sau B-01, t1–t5 (giả thuyết B-01 của bản 2, ĐK-P9) |
| Chi phí | trong ±15 % | `runs.csv` `cost_usd` | như trên |
| Test ẩn | không kém hơn, biên 2 điểm % | `hidden_pass/hidden_total` (ĐK-P3) | như trên + t6–t8 giữ lại (ĐK-P7) |
| KPI | không giảm so với baseline | `GET /api/kpi?task=…` trước/sau | mỗi vòng |
| Chọn đúng làn | l1-modules → đa-agent nhanh hơn (ĐK-P5); l2-chain → không đa-agent (ĐK-P6) | `lane` trong log + `runs.csv` | sau C9 |

(Cách đo trên bộ đo giám đốc — token có trọng số, A0-sonnet làm đối chứng, TOST ba đại lượng — do S4 chốt trong `preregistration.md` bản 2; bảng này giữ chỉ tiêu cho bộ cũ t1–t5.)

---

## 4. B-02 — Cổng chất lượng

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Bỏ điều phối thì mất lớp kiểm. Hiện nay lệnh đỏ chỉ ép "không duyệt" **sau khi reviewer đã chạy** (một lượt LLM đắt): reviewer được gọi trước (`orchestrator.ts:1365`), rồi mới ghi đè bằng `checkRegressions` (`:1380-1388`). Chỉ regression (đạt ở baseline, hỏng sau) mới bị ép; lệnh đỏ từ baseline thì không. Reviewer không có `checkCommands` hay không chạy lệnh (`verified === false`, `:1399-1407`) chỉ cảnh báo. Nội dung đầu ra không được kiểm tuân thủ "Mẫu đầu ra" trước khi nhận (KPI chỉ chấm sau: `kpi.ts:324-327`). t2 làn nhanh C7 chỉ 52/60 test ẩn. **(R8)** C9 t5 làn nhanh lượt 2: đề bài đòi `npm test` xanh, lệnh đỏ từ baseline đến sau thực thi, reviewer LLM vẫn duyệt, 95/146 test ẩn (§4.1 bước 2). |
| **2. Bằng chứng** | `orchestrator.ts:1326, 1360, 1365, 1380-1388, 1399-1407, 2504-2568`; `kpi.ts:144, 168, 324-327, 608-611`; §1.2 N3c; §2 (52/60). Review là pha dài nhất ở C5 (`kpi-research…md:62`); review + revise = 116,8 s trên 5 bài ở C7 (T-d (3), `token-analysis.md:292`). **(R8)** `bench/vs-claude/results/C9/t5-logq.ccoding-fastlane.2/ccoding-task.json:4, 83, 85-86, 104-109, 173-201`; `…/result.json:14, 39-42`. |
| **3. Nguyên nhân gốc** | Đã kiểm bằng đọc mã: thứ tự gọi reviewer → kiểm tra regression. **(R8) Đã kiểm trên ca t5:** lệnh "đỏ kéo dài" (0/3 → 22/23) không phải regression nên không bị ép; quyết định duyệt rơi vào reviewer LLM, và reviewer duyệt dù chính nhận xét của nó ghi `npm test` exit 1 và `agg.js` còn stub. **Giả thuyết:** reviewer gọi khi mã đã đỏ là lãng phí; chưa đo tỉ lệ lượt rơi vào trường hợp này. |
| **4. Thay đổi đề xuất** | §4.1–4.4. |
| **5. Hiệu quả kỳ vọng** | (a) Bỏ 1 lượt review khi mã đỏ: tiết kiệm tối đa phần review của lượt đó (≈ 23 s trung bình mỗi bài ở C7: 116,8/5); (b) làn đơn không reviewer mặc định: bỏ phần review (cùng nguồn) trừ khi điều kiện §4.3 thỏa; (c) P3 (reviewer chỉ nhận diff + kết quả lệnh) trần −2,8 % chi phí CCoding (`dev-review.md:181`, O4 ở bảng T-e) — dưới nhiễu ±15 %, không tách được. (d) Chất lượng: test ẩn không thấp hơn Claude Code đơn (ĐK-P3), 0 đầu ra thiếu mục mẫu, **0 lượt "duyệt" khi lệnh đề bài đòi xanh còn đỏ** (R8). **Giả thuyết.** |
| **6. Cách kiểm lại** | **Hệ chính:** H8 (`analyze.mjs:96-100`, lỗi phối hợp: thiếu sản phẩm / bỏ yêu cầu; xem giới hạn ở B-10 trường 6), H3 (review tăng recall, `:69-75` — reviewer có đáng gọi không), H7 (độ ổn định, `:92-95`); giả thuyết B-02 mới của bản 2 (cổng chặn ca "đỏ kéo dài + bỏ sót phần việc" — S4). **Bộ cũ:** ĐK-P3 (test ẩn không kém hơn); KPI: `compliance.templateCoverage` = 100 % cho lượt làn đơn, Chất lượng của reviewer (N3b) khi reviewer còn chạy; đếm `checks.run` đỏ → số reviewer bị bỏ qua. Phát lại offline: quy tắc §4.1 bước 2 trên `results/C9/*/ccoding-task.json` phải đẩy `t5-logq.ccoding-fastlane.2` vào vòng sửa. Vòng: cùng vòng với B-01 và C9 làm baseline; t6–t8 (ĐK-P7). |
| **7. Rủi ro và bảo vệ dữ liệu** | Rủi ro: (a) vòng sửa kéo dài ⇒ giới hạn N; (b) `checkCommands` chạy mã của dự án ⇒ chỉ chạy với quyền `exec` và qua `denyCommands` như `orchestrator.ts:2507`; (c) mẫu đầu ra kiểm cứng ⇒ agent "đệm" tiêu đề rỗng: chỉ chấp nhận tiêu đề có nội dung (xem 4.2). Dữ liệu: không đổi nhãn, hook, `LogStore`; kết quả kiểm (stdout) đi qua `LogStore` che bí mật; không đưa vào đầu vào reviewer những tệp `.env`. Gate dữ liệu: thay đổi chạm bảo mật hay dữ liệu ⇒ bắt buộc reviewer (§4.3). |
| **8. Ưu tiên** | Hiệu quả 4 / công sức 3 = 1,3. Bắt buộc đứng thứ hai. |
| **9. Giám đốc duyệt** | **Có** — đổi cách duyệt/ép sửa. |

### 4.1 Vòng kiểm → sửa

1. `checkCommands` chạy ở **baseline** (đã có) và **sau thực thi** và **sau mỗi vòng sửa** (đã có `runProjectChecks(…, 'baseline' | 'execute' | 'revise')`, `orchestrator.ts:2504`).
2. Phân loại từng lệnh sau thực thi (`baseline` → `sau`):
   - **Hồi quy** (xanh → đỏ, `checkRegressions`, `:2564-2568`) hoặc **đỏ mới** (không có baseline, ví dụ lệnh mới): vào vòng sửa **ngay**, không gọi reviewer.
   - **Đỏ kéo dài mà đề bài yêu cầu lệnh xanh** (đỏ → đỏ; đề bài nêu tên lệnh, hoặc nêu mục tiêu làm xanh nó như "đảm bảo `npm test` xanh", hay `--check` ở R2): **bắt buộc vào vòng sửa**, không gọi reviewer, và **reviewer LLM không có quyền quyết định duyệt** cho lệnh này: `approved` bị ép `false` chừng nào lệnh còn đỏ, bất kể reviewer viết gì. Hết N vòng mà còn đỏ ⇒ nâng cấp (bước 5), không bao giờ kết thúc `done` + `approved`. Nhận biết "đề bài yêu cầu" bằng so khớp chuỗi, không gọi LLM: tên lệnh trong `checkCommands` xuất hiện trong `task.brief` (kể cả trong dấu `` ` ``). Prompt vòng sửa kèm danh sách tệp/module chưa có hạng mục nhận (từ B-10) nếu có.
   - **Đỏ kéo dài không liên quan đề bài** (đỏ → đỏ, đề bài không nhắc lệnh): không chặn nhưng **bắt buộc gọi reviewer** (§4.3) và ghi chú, vì cổng không xác nhận được gì về lệnh đó.
   - **Xanh** (xanh → xanh, hoặc đỏ → xanh): qua.
   (Bốn nhánh rời nhau; bản trước định nghĩa "đỏ" và "hồi quy" gần trùng. R8 tách "đỏ kéo dài" thành hai nhánh theo đề bài và bỏ quyền duyệt của reviewer ở nhánh đầu.)

   **Bằng chứng review duyệt nhầm — C9, `t5-logq.ccoding-fastlane.2` (nhiệm vụ T-20261102-140019-8c2).** Mọi đường dẫn dưới đây tương đối với `bench/vs-claude/results/C9/t5-logq.ccoding-fastlane.2/`:
   - Đề bài: "… Viết test cho các module, đảm bảo `npm test` xanh." (`ccoding-task.json:4`).
   - Baseline: `npm test` exit 1, 0/3 (`ccoding-task.json:174-180`). Sau thực thi: exit 1, 22/23, test hỏng `tổng hợp count by` với lỗi `aggregate is not a function` (`ccoding-task.json:185-196`). Hệ thống có bắt được: `attention.reason = "checks"`, "Lệnh kiểm tra còn lỗi: npm test" (`ccoding-task.json:198-201`) — nhưng chỉ là cảnh báo.
   - Review: `approved: true` (`ccoding-task.json:85`), chỉ 3 issue `minor` (`:87-103`); bản thân tóm tắt review ghi "`npm test` vẫn exit 1 vì `src/agg.js` còn là stub … `bin/logq.js` và `agg.js` chưa được review" (`:86`), và danh sách `checks` của review có `npm test` exit 1 (`:104-109`). Tức reviewer **thấy** lệnh đỏ và phần việc thiếu nhưng vẫn duyệt vì coi đó là "ngoài phạm vi review".
   - Không có vòng sửa: `reviewRound: 0` (`:83`), `maxRevisions: 1` (`:149`); nhiệm vụ kết thúc `status: "done"` (`:8`), `result.json:14` `approved: true`.
   - Hậu quả: 95/146 test ẩn (`result.json:39-42`).
   - Với quy tắc mới: `npm test` có trong đề bài và đỏ → đỏ ⇒ nhánh "đỏ kéo dài mà đề bài yêu cầu" ⇒ vòng sửa thay cho lượt review, `approved` không thể `true`. Phần việc bị bỏ sót (`agg.js`, CLI) còn được B-10 chặn **trước** thực thi.
3. Prompt vòng sửa nhận: đúng đầu ra của lệnh đỏ (đã cắt theo `maxOutputChars`), không phải toàn bộ lịch sử.
4. **N ban đầu = 2** vòng sửa theo kiểm tra (`config.defaults.maxRevisions` hiện 1, `config.ts:285`, kẹp tối đa 3 ở `orchestrator.ts:296`; tách tham số mới `gate.maxFixRounds = 2` để không đổi hành vi review). Lý do: một vòng sửa ≈ 50 s (C5 t2, `PROCESS-REVIEW.md:256`), hai vòng giữ chi phí xấu nhất trong +100 s, dưới giao điểm T* ≈ 152 s (§3.1). Hiệu chỉnh lại khi có số vòng sửa thực tế ở C9.
5. Còn đỏ sau N vòng ⇒ nâng lên multi-agent (§3.3).

### 4.2 Kiểm "Mẫu đầu ra" bằng đúng phép kiểm của KPI

Dùng nguyên hàm của `src/kpi.ts` để cổng và KPI cho cùng một kết quả:

- Lấy danh sách mục: `templateHeadings(body)` (`kpi.ts:144`) từ hồ sơ `agent.md` của vai chạy.
- Đo: `templateCoverage(text, headings)` (`kpi.ts:168`), so khóa bằng `headingKey` (`kpi.ts:163`: phần trước `(`, `·`, `:`, `—`, chuẩn hóa, tối đa 28 ký tự).
- Mở đầu "Tóm tắt": cùng biểu thức `kpi.ts:327` (`/^#{1,3}\s*Tóm tắt/im`).
- **Cổng đạt khi `coverage === 1` và có "Tóm tắt".** (KPI chỉ cảnh báo khi < 70 %, `kpi.ts:608`; cổng nghiêm hơn có chủ ý, vì tiêu chí của giám đốc là đúng mẫu.) Thiếu ⇒ một lượt "sửa định dạng" ngắn, không dùng công cụ, nêu đúng `missing`; tính vào N.
- Giới hạn đã biết: `templateCoverage` chỉ so tiêu đề (không đo nội dung). Phép kiểm chưa phát hiện tiêu đề rỗng; thêm ngưỡng tối thiểu số dòng dưới tiêu đề là việc của Phòng Dev (đề xuất: ≥ 1 dòng không rỗng), nêu ở rủi ro (c).

### 4.3 Khi nào cần reviewer

Reviewer (LLM) chỉ được gọi khi một trong:
- **Không có `checkCommands`** của dự án (cổng không có bằng chứng máy; kiểu `verified` không xác định ở `:1399`). Bản vá **D-02** (`attention` khi không kiểm chứng) gộp vào đây: dùng `attention = true` nếu reviewer cũng không chạy lệnh.
- **Thay đổi đụng bảo mật hoặc dữ liệu:** diff chạm đường dẫn khớp danh sách (đề xuất ban đầu): `src/tools/**` (hook, chính sách), `src/runtimes/**`, `src/kpi.ts`, `src/store.ts`/`LogStore`, `.env*`, `data/`, `agents/**` (định dạng `agent.md`), `config`, hoặc dự án có nhãn dữ liệu ≥ Bảo mật. Phù hợp quy tắc repo: đổi định dạng `agent.md` ⇒ cập nhật tài liệu/test; Data Protection Gate bắt buộc.
- **Đỏ kéo dài** không liên quan đề bài (§4.1 bước 2). Đỏ kéo dài mà đề bài yêu cầu xanh thì **không** gọi reviewer mà vào vòng sửa (R8).
- Cổng định dạng thất bại sau N vòng, hoặc đỏ sau N vòng (trước khi nâng cấp lên multi-agent).

Reviewer khi được gọi nhận **diff + kết quả lệnh kiểm** thay vì toàn bộ đầu ra (P3, gộp vào B-02). Đây là phần P3, độ lớn trần −2,8 % (O4); coi như bổ sung rẻ chứ không phải lý do.

**G5 (vai chỉ đọc tự chạy `checkCommands`) — loại.** Lý do: (a) CCoding đã tự chạy `checkCommands` và đưa kết quả cho reviewer (`:1391-1393`, `:2535`), nên reviewer không cần tự chạy; (b) `node --test` và `--check` chạy mã dự án, cho vai "chỉ đọc" chạy chúng làm vỡ bảo đảm đọc-chỉ của hook (`shell-policy.ts:154-189`); (c) N3a cho thấy chỉ 4/8 lượt chặn là lệnh kiểm tra, bù bằng cách trên.

### 4.4 Mọi lượt gọi

Mọi lượt (execute, vòng sửa, sửa định dạng, reviewer) đi qua `Orchestrator.call()` để được ghi log, đếm token, áp chính sách dữ liệu, rồi **được chấm KPI** (`computeKpi`, `kpi.ts:199`). Không gọi runtime trực tiếp (quy ước repo).

### 4.5 Chỉ tiêu nghiệm thu B-02

| Chỉ tiêu | Ngưỡng | Cách đo |
|---|---|---|
| Test ẩn | không kém hơn Claude Code đơn, biên 2 điểm % (ĐK-P3) | `runs.csv` |
| `compliance.templateCoverage` | 100 % (lượt làn đơn) | `GET /api/kpi` |
| Lượt reviewer bị bỏ khi mã đỏ | = số sự kiện `checks.run` đỏ (không còn `review` sau đỏ) | `logs` kind `checks.run` + `phases.csv` |
| **(R8)** Lượt `approved` khi lệnh đề bài đòi xanh còn đỏ | **0** | `ccoding-task.json`: `review.approved` và `projectChecks.latest[].ok` của lệnh có tên trong `brief`; phát lại trên C9 phải bắt `t5-logq.ccoding-fastlane.2` |
| Số vòng sửa | ≤ N=2; lượt vượt N ⇒ có sự kiện nâng cấp | log |
| KPI phòng | không thấp hơn baseline (82 điểm cho 2 nhiệm vụ 2/11; 68 trong 7 ngày: `kpi-research…md:15`) | `GET /api/kpi` |
| Hiệu quả | thời gian, chi phí trong ±15 % (như B-01) | `runs.csv` |

---

## 5. Các mục còn lại

### B-03 — Nhật ký sự cố khi sửa (P4)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Vòng tự cải thiện cần dữ liệu về sự cố ở pha sửa; hiện không có bản ghi có cấu trúc (C-14 còn mở). |
| **2. Bằng chứng** | `dev-review.md:169` (I-02); `publication-plan.md:180` (xếp P4 làm trước các bản vá tối ưu); bản vá `self-improvement/prompt-patches/P4-incident-log-on-revise.diff`. Bản vá ở đó cần `--unidiff-zero --ignore-whitespace` (`dev-review.md:13`). |
| **3. Nguyên nhân gốc** | Đã kiểm: bản vá không qua `git apply --check` trần vì CRLF/LF và hunk không có ngữ cảnh (`dev-review/verification.md:25`), không do mã đã đổi. |
| **4. Thay đổi đề xuất** | Áp P4 vào `src/prompts.ts` (`revisePrompt`); làm lại bản vá có ngữ cảnh/LF (I-08). Phối hợp với B-02: dữ liệu vòng sửa theo kiểm tra cũng ghi vào mục "Nhật ký sự cố". |
| **5. Hiệu quả kỳ vọng** | ≥ 1 mục sự cố có cấu trúc mỗi lượt revise; token revise tăng ≤ 5 % (theo KPI của I-02). Giả thuyết. |
| **6. Cách kiểm lại** | Đếm mục "Nhật ký sự cố" trong đầu ra revise; so token revise trước/sau. Nhánh B-P4 của kế hoạch F1 (`experiment-plan.md:63`). |
| **7. Rủi ro / dữ liệu** | Nhật ký sự cố có thể chứa trích đoạn lỗi: đi qua `LogStore` (che PII/bí mật), không ghi ra ngoài `data/`. |
| **8. Ưu tiên** | 2 / 1 = 2,0. |
| **9. Giám đốc duyệt** | Có — đổi prompt hệ thống. |

### B-04 — Bộ phân tích lệnh shell của hook (G1, G2)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Hook chặn lệnh chỉ đọc hợp lệ; mỗi lượt chặn là một vòng gửi lại hội thoại. |
| **2. Bằng chứng** | §1.2 N1a–N1c: **36/44** `git-read-deny` chỉ đọc (48 % trong 75 lỗi); 30 có `\|`/`;` trong nháy; `echo` 4, `awk` 1, `sed -n` nhiều địa chỉ trong 10 lượt `sed -n`. Mã: `shell-policy.ts:170, 171, 177, 149, 151`. |
| **3. Nguyên nhân gốc** | **Đã kiểm bằng đọc mã:** tách `&&`/`;` và `\|` bằng `split` không biết nháy; `[<>]` bất kỳ cũng chặn; `READ_CMD` thiếu `echo`, `awk`; `SED_PRINT` một địa chỉ. **Chưa kiểm:** phát lại 36 lệnh qua hàm thật (mã hiện tại có thể khác bản hook lúc xảy ra lỗi, `kpi-research…md:3-4`). Phát lại là bước đầu tiên của Phòng Dev. |
| **4. Thay đổi đề xuất** | **G1:** tách câu lệnh có xét nháy (đã có `splitArgs` ở `:102`; dùng bộ tách mức câu cho `&&`, `;`, `\|`, bỏ qua trong `"…"`/`'…'`; cấm `$(`, backtick, `>` ngoài nháy). **G2:** thêm `echo` (không chuyển hướng), `awk` không có `system()`/ghi tệp, `sed -n` nhiều địa chỉ `Np;Mp` vào danh sách chỉ đọc; giữ `READ_CMD_FORBIDDEN`. Kiểm bằng test: 36 lệnh chỉ đọc phải qua; 5 lệnh ghi và 3 lệnh chạy mã vẫn bị chặn. |
| **5. Hiệu quả kỳ vọng** | Bớt tới 36/75 = 48 % lượt lỗi công cụ ở hai nhiệm vụ 2/11. Token tiết kiệm **chưa đo** (CSV không có token). Giả thuyết. |
| **6. Cách kiểm lại** | Test đơn vị trên 36+8 lệnh (tập tái dùng được vì lấy từ CSV); đếm lại `failures-count.mjs` trên log 7 ngày sau triển khai; KPI Tin cậy, Hiệu quả. Không cần A/B benchtest. |
| **7. Rủi ro / dữ liệu** | Đây là **biên bảo mật** của vai chỉ đọc: bộ tách sai ⇒ lệnh ghi lọt qua. Phải có bộ test "lệnh ác ý" (`; rm`, `$(...)`, heredoc, `> tệp`, `tee`, `sed -i`, `awk 'BEGIN{system(...)}'`). Giữ chặn `.env`/bí mật (`SECRET_ARG`, `:132`). |
| **8. Ưu tiên** | 3 / 2 = 1,5. |
| **9. Giám đốc duyệt** | Có (bảo mật). |

### B-05 — Script kiểm nhất quán số liệu (G7)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Số liệu lệch giữa các tệp tài liệu (cụm câu cũ nói dữ liệu C6 còn thiếu), bị bắt ở review cuối. |
| **2. Bằng chứng** | `kpi-research…md:19` (academic-writer còn major ở review cuối); `dev-review.md:217` (mục R1 đồng bộ); §1.2 N4: hiện `paper.md` và `challenges.md` đã 0 chỗ sót, còn 33 chỗ ở 4 tệp (lịch sử/trích dẫn). |
| **3. Nguyên nhân gốc** | Giả thuyết: số chuẩn sống trong nhiều tệp, không có nguồn duy nhất. Chưa kiểm cơ chế bằng dữ liệu. |
| **4. Thay đổi đề xuất** | `docs/research/consistency-check.mjs` + `facts.json` (mỗi mục: mã số, giá trị chuẩn, tệp nguồn, cụm lỗi thời bị cấm, ngoại lệ có lý do như `CHANGELOG.md`). Chạy được như `--check` (exit ≠ 0 khi lệch). Dùng như lệnh kiểm tra của dự án sau khi S1 ổn định. Không thuộc `src/`. |
| **5. Hiệu quả kỳ vọng** | 0 số lệch giữa tệp ở review cuối; giảm số vòng review tài liệu. Chưa định lượng. |
| **6. Cách kiểm lại** | `node …/consistency-check.mjs` exit 0; đếm major "số lệch" ở review cuối các nhiệm vụ viết tài liệu (KPI academic-writer, Chất lượng). |
| **7. Rủi ro / dữ liệu** | Báo động giả nếu cụm cấm quá rộng ⇒ danh sách ngoại lệ. Chỉ đọc `docs/`; không dữ liệu cá nhân. |
| **8. Ưu tiên** | 3 / 2 = 1,5. |
| **9. Giám đốc duyệt** | Không (công cụ tài liệu; chỉ cần Phòng Dev review). |

### B-06 — Chẩn đoán chặn của hook (G6, D-03)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Thông báo chặn không nói câu lệnh con nào gây chặn, và hệ thống không đếm chặn đúng/nhầm. |
| **2. Bằng chứng** | CSV: cột `reason` của `git-read-deny` đều là chuỗi `deny` chung (`shell-policy.ts:168`) ngay cả khi lệnh chỉ đọc; `dev-review.md:173` (I-06; C-46, C-48 "chưa đo"). Bản vá `dev-review/patches/D-03-guard-block-diag.diff` (chưa `--check`, `dev-review.md:227`). |
| **3. Nguyên nhân gốc** | Đã kiểm: một thông điệp cố định cho mọi lý do (`:168-188`). |
| **4. Thay đổi đề xuất** | **G6:** trả về câu con và quy tắc vi phạm (vd. `câu 2: "awk" không trong danh sách đọc`). **D-03:** ghi sự kiện chẩn đoán mỗi lần chặn (đi qua `diag`/`LogStore`). Chạy `git apply --ignore-whitespace --check` cho D-03, typecheck, test trước khi áp. |
| **5. Hiệu quả kỳ vọng** | Agent tự sửa lệnh ở lượt kế (giảm lượt lặp); đo được tỉ lệ chặn nhầm — đó mới là lợi ích chính (số liệu cho B-04, B-08). Chưa định lượng. |
| **6. Cách kiểm lại** | Số chặn/lượt chạy có trong `calls.csv` hoặc log; tỉ lệ chặn nhầm (C-48). Không cần A/B. |
| **7. Rủi ro / dữ liệu** | Thông báo chặn không được lộ nội dung bí mật trong lệnh; sự kiện đi qua `LogStore`. |
| **8. Ưu tiên** | 2 / 2 = 1,0. Làm sau B-04 (cùng tệp). |
| **9. Giám đốc duyệt** | Có. |

### B-07 — Trần lượt cho `claude-cli` (D-01)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Lượt execute của `claude-cli` không có trần lượt mô hình; một lượt có thể kéo rất dài (C5 t3 lượt 1: 579 s do treo, đã sửa riêng ở `0e82b82`). |
| **2. Bằng chứng** | `dev-review.md:170` (I-03: S3 K37/K39, C-20); `PROCESS-REVIEW.md:260` (lượt 579 s); bản vá `D-01-claude-cli-max-turns.diff` (chưa `--check`). |
| **3. Nguyên nhân gốc** | Giả thuyết (từ review mã): `claude-cli` không dùng `phases.toolTurns`. Chưa kiểm lại trên mã hiện tại. |
| **4. Thay đổi đề xuất** | Áp D-01 sau khi `--check`, typecheck, test: truyền `--max-turns` từ `phases.toolTurns`, báo `capped` khi chạm. Liên kết B-02: chạm trần = tín hiệu nâng lên multi-agent / sự cố cho B-03. |
| **5. Hiệu quả kỳ vọng** | 0 lượt execute > 40 lượt mô hình; `capHits` > 0 khi chạm trần (I-03). Chưa định lượng thời gian. |
| **6. Cách kiểm lại** | `tool_calls` trong `calls.csv`; A/B nhánh có D-01 (F1). |
| **7. Rủi ro / dữ liệu** | Trần quá thấp cắt việc dở dang ⇒ để `maxContinuations` hoạt động. Không động chạm dữ liệu. |
| **8. Ưu tiên** | 2 / 2 = 1,0. |
| **9. Giám đốc duyệt** | Có. |

### B-08 — `cwd` của hook và Read tệp tool-results (G3, G4)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Hook tính `../` từ gốc worktree dù Bash giữ thư mục; chặn Read tệp `tool-results` do chính Claude Code lưu. |
| **2. Bằng chứng** | §1.2 N2: 1/10 chắc chắn (#33), 2/10 có dấu hiệu (#21, #45), 5/10 không xác định; 2/10 đúng chính sách. Tức tối đa 3/75 = 4 % lỗi. |
| **3. Nguyên nhân gốc** | Giả thuyết, chưa kiểm: sự kiện hook của Claude Code có trường `cwd` hay không. Phải kiểm trước (đọc tài liệu hook của phiên bản đang dùng). |
| **4. Thay đổi đề xuất** | **G3:** dùng `cwd` từ sự kiện hook để giải `..`, vẫn đòi kết quả nằm trong worktree. **G4:** cho Read tệp trong thư mục `tool-results` của chính phiên (khớp id phiên), không phải thư mục khác trong `.claude/`. |
| **5. Hiệu quả kỳ vọng** | Tối đa 3 lượt/75 ở hai nhiệm vụ 2/11 (4 %). Nhỏ. |
| **6. Cách kiểm lại** | Test hook với `cwd` giả lập: `../x` trong và ngoài worktree; đếm `outside-path` ở log 7 ngày sau triển khai. |
| **7. Rủi ro / dữ liệu** | **Biên bảo mật** (L3 ở `dev-review.md:180`): nới đường dẫn mở lối đọc ngoài worktree; cho phép chỉ thư mục `tool-results` đúng phiên, `realpath` để chống liên kết tượng trưng. |
| **8. Ưu tiên** | 2 / 3 = 0,7. Thấp nhất. |
| **9. Giám đốc duyệt** | Có (bảo mật). |

### B-09 — Giới hạn đầu ra, tín hiệu dừng khảo sát (P1, P2) — **D9** (sau công tắc, mặc định tắt; trước 3/11: hoãn)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | P1 giới hạn đầu ra plan/review/synthesize; P2 nhắc dừng khảo sát. |
| **2. Bằng chứng** | `dev-review.md:176, 183` (I-09, I-16); O5 = 1,7 % (trần trên, bảng T-e). Hook đã nhắc: 5 lượt `read-gate-nudge` trong CSV (§1.1), thông báo "đọc 16 lần liên tiếp mà chưa ghi" cho thấy cơ chế thay thế P2 đã chạy. |
| **3. Nguyên nhân gốc** | P2: phần lớn đã được hook "giới hạn khảo sát" thay thế (đã kiểm: thông báo trong log, §1.1). P1: B-01 làm mất pha plan/review/synthesize ở việc nhỏ, nên phần tiết kiệm 1,7 % thu hẹp. |
| **4. Thay đổi đề xuất** | **Không làm trong vòng này.** Giữ P1/P2 trong `prompt-patches/`; xem lại sau khi B-01/B-02 xong và chỉ còn việc lớn đi đa-agent. |
| **5. Hiệu quả kỳ vọng** | ≤ 1,7 % chi phí (trần trên) — dưới nhiễu ±15 % của chỉ tiêu B-01; không phát hiện được bằng benchtest cỡ này. |
| **6. Cách kiểm lại** | F1 nhánh B1/B2 nếu làm sau. |
| **7. Rủi ro / dữ liệu** | Không đụng dữ liệu. Rủi ro cắt cụt đầu ra. |
| **8. Ưu tiên** | 1 / 1 = 1,0, hoãn. |
| **9. Giám đốc duyệt** | Có (đổi prompt) nếu làm. |

### B-10 — Cổng phủ kế hoạch (R8, ca t5 C9)

Mọi đường dẫn tệp kết quả dưới đây tương đối với `bench/vs-claude/results/C9/t5-logq.ccoding-fastlane.2/` (nhiệm vụ T-20261102-140019-8c2), trừ khi ghi khác.

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Kế hoạch đa-agent có thể bỏ sót phần việc mà không bước nào phát hiện: không có phép kiểm **độ phủ** của danh sách hạng mục so với đề bài và so với chính tóm tắt kế hoạch; kế hoạch đọc được một phần vẫn được chạy như kế hoạch đủ. Ở t5 C9, 2/4 phần việc không ai làm, review vẫn duyệt (B-02), 95/146 test ẩn. |
| **2. Bằng chứng** | (a) Đề bài nêu 4 đích: "thư viện (`src/parse.js`, `src/query.js`, `src/agg.js`) và CLI `bin/logq.js`" (`ccoding-task.json:4`). (b) Tóm tắt kế hoạch: "Bốn hạng mục độc lập … parse.js, query.js, agg.js và CLI" (`ccoding-task.json:75`). (c) Danh sách hạng mục thực tế chỉ có **2**: S1 "Hiện thực src/parse.js + test" (`:31-32`), S2 "Hiện thực src/query.js + test" (`:54-55`); `result.json:16-27` cùng 2 mục. (d) S2 hỏng một phần: mô tả là văn bản lạc "Chỉ giao cho backend-dev nếu S1 có người khác làm … (Assignee thực tế: data-engineer …)" (`:41`), trong khi `assignee` là `frontend-dev` (`:56`) và `deliverable` là "(không dùng)" (`:57`). (e) Thay đổi chỉ chạm `parse.js`, `query.js` và 2 tệp test (`result.json:104-109`; `ccoding-task.json:203`). (f) 51 test ẩn hỏng (`result.json:39-94`): **37** nhóm "tổng hợp…" (`:44-80`, tức toàn bộ nhóm; `grade-hidden.tap` không có dòng `ok` nào của nhóm này) và **14** nhóm "CLI…" (`:81-94`; nhóm CLI chỉ đạt 1 test, `grade-hidden.tap:1615`). (Đính chính `context/c9-partial-2026-11-02.md` §2 ghi "toàn bộ 51 test hỏng thuộc nhóm tổng hợp": thực tế 37 tổng hợp + 14 CLI, đúng với hai đích không ai nhận.) (g) Chính dev và reviewer đều ghi nhận phần thiếu nhưng không ai có quyền/nhiệm vụ xử lý: tóm tắt S2 "`parse.js` và `agg.js` chưa được hiện thực" (`:60`); review "`bin/logq.js` và `agg.js` chưa được review. Hai phần này cần hoàn thành …" (`:86`). |
| **3. Nguyên nhân gốc** | **Đã kiểm (từ tạo phẩm):** không hạng mục nào nhận `src/agg.js` và `bin/logq.js`; số hạng mục (2) khác số tóm tắt kế hoạch tự khai (4); hạng mục S2 có trường mâu thuẫn nhau. **Giả thuyết, chưa kiểm:** đầu ra pha plan hỏng một phần và `parsePlan` chỉ lấy được 2 mục (mô tả S2 giống phần chú thích lọt vào trường `description`). Kiểm cần `data/runs/T-20261102-140019-8c2/calls.jsonl` trên server cloud (cổng 7422) — **không có trong repo**, chưa đọc được. Dù nguyên nhân là LLM lập kế hoạch thiếu hay bộ phân tích cắt mất, cổng phủ dưới đây bắt được cả hai vì nó so **kết quả đã phân tích** với đề bài và tóm tắt. |
| **4. Thay đổi đề xuất** | Thêm một bước kiểm tất định (không gọi LLM) **sau `parsePlan`, trước pha execute**, áp cho làn nhanh và làn đầy (và cho kế hoạch sau nâng cấp ở §3.3). **Quy tắc A — phần việc không ai nhận ⇒ chặn trước khi thực thi.** Tập đích `D` = các đường dẫn tệp/module nêu trong `task.brief` hoặc `planSummary` (so khớp mẫu đường dẫn có đuôi tệp hoặc tên khớp `git ls-files`, kể cả tên rút gọn như `agg.js` ↔ `src/agg.js`). Một đích được **phủ** khi xuất hiện trong `title`, `description` hoặc `deliverable` của ít nhất một hạng mục, hoặc trong danh sách `outOfScope` mà kế hoạch khai kèm lý do (vd. `src/index.js` "đã có sẵn nên không ai sửa", `:75`). `D` còn đích chưa phủ ⇒ không chạy execute; một lượt "sửa kế hoạch" (qua `Orchestrator.call()`) nhận đúng danh sách đích thiếu; vẫn thiếu ⇒ dừng, `attention = "plan-coverage"`, không chạy kế hoạch thiếu. **Quy tắc B — kế hoạch không đọc được đầy đủ ⇒ không chạy kế hoạch dở.** Kế hoạch bị coi là đọc dở khi một trong: (i) số hạng mục phân tích được khác số hạng mục tóm tắt kế hoạch tự khai (số đếm bằng chữ hoặc số: "Bốn hạng mục" ⇒ 4, ở t5 phân tích ra 2); (ii) hạng mục có `deliverable` rỗng hoặc giữ chỗ ("(không dùng)", "—"); (iii) trường mâu thuẫn trong cùng hạng mục (tên vai trong `description` khác `assignee`, như `:41` so với `:56`); (iv) bộ phân tích báo cắt cụt/JSON không đóng. Khi đó: gọi lại pha plan **một** lần; vẫn dở ⇒ dừng với `attention = "plan-unreadable"`. Không bao giờ chạy tập con hạng mục đã đọc được. |
| **5. Hiệu quả kỳ vọng** | Ca t5 C9 lượt 2 bị chặn bởi cả A (`src/agg.js`, `bin/logq.js` chưa phủ) và B (i: 4 ≠ 2; ii: `(không dùng)`; iii: `data-engineer`/`frontend-dev`). Không chặn nhầm t1 C9 lượt 3: đề bài nêu `src/duration.js` (`results/C9/t1-duration.ccoding-fastlane.3/ccoding-task.json:4`), tóm tắt kế hoạch nêu `src/parse.js`, `src/format.js`, `src/duration.js` (`…/ccoding-task.json:75`), hai hạng mục nhận đủ (`…:32, :55`); lượt đó 148/149 test ẩn với một lỗi cài đặt riêng lẻ (`…/result.json:39-44`), `npm test` cuối xanh (`…/ccoding-task.json:172`) — tức **không** cùng nguyên nhân với t5. Chi phí: phép kiểm không gọi LLM; chỉ tốn một lượt plan khi bị chặn. Độ lớn về chất lượng trên bộ đo chưa biết: n = 1 ca. **Giả thuyết.** |
| **6. Cách kiểm lại** | **(a) Phát lại offline** (không cần LLM, không tốn hạn mức): chạy hàm cổng trên mọi `bench/vs-claude/results/C*/*/ccoding-task.json` (`brief`, `runs[].planSummary`, `runs[].subtasks`). **(b) Nơi đo trên bộ đo giám đốc: H8** "Coordination failures (deliverable missing / requirements dropped)" (`bench/vs-claude/analyze.mjs:96-100`). Tên H8 mô tả **đúng loại lỗi này** ("requirements dropped" = phần việc của đề bài không ai làm), nên H8 là giả thuyết chính để kiểm B-10. **Giới hạn đã kiểm bằng đọc mã:** phán quyết H8 chỉ dựa vào tỉ lệ `formatMiss` (`analyze.mjs:97`, `:99` `verdict(fm(TREAT) > fm(BASE), false)`); grader coding `gradeCode` không trả `formatMiss` (`bench/vs-claude/lib/grade.mjs:26-41`), nên với bài coding `fm` luôn 0 và **ca kiểu t5 không làm đổi phán quyết H8**; nó chỉ hiện ở chỉ số mô tả "failed hidden-test share" (`analyze.mjs:98`), vốn không phân biệt "bỏ sót phần việc" với "lỗi cài đặt rải rác". Ngoài ra đối số `unknown` luôn `false` (`:99`) nên H8 không bao giờ báo "insufficient data". Đề nghị (không sửa mã; chuyển S1 ghi vào `suite-review.md` và S4 quyết định có khóa có điều kiện hay không): thêm chỉ số "bỏ yêu cầu" = tỉ lệ lượt coding có **một nhóm test ẩn hỏng toàn bộ** (nhóm = tiền tố trước `:` của tên test; t5: "tổng hợp" 37/37), và đưa chỉ số này vào phán quyết H8. **(c)** t1–t5 chưa có `task.json` trong bộ đo mới (Phòng Dev đang thêm), nên H8 trên t5 chỉ đo được sau khi Phòng Dev merge (nhánh 2 của `run-plan.md`). |
| **7. Rủi ro / dữ liệu** | (a) Chặn nhầm khi đề bài nhắc tệp chỉ để tham khảo ⇒ cơ chế `outOfScope` có lý do, và đo tỉ lệ chặn nhầm ở phát lại (a). (b) Bỏ lọt khi đề bài nêu phần việc không bằng đường dẫn ("thêm CLI") ⇒ quy tắc B (i) vẫn bắt nếu tóm tắt tự khai số phần; đích không có tên tệp nằm ngoài phạm vi bản đầu. (c) Vòng plan lặp ⇒ tối đa 1 lượt lại cho mỗi quy tắc. Dữ liệu: chỉ đọc `brief`, `planSummary`, `subtasks` đã có trong trạng thái nhiệm vụ; sự kiện chặn ghi qua `LogStore`; không thêm đường ghi ngoài `data/`, không đổi nhãn dữ liệu. |
| **8. Ưu tiên** | Hiệu quả 4 / công sức 2 = 2,0. Hạng 3 (§0): ngay sau B-01/B-02, triển khai cùng B-02. |
| **9. Giám đốc duyệt** | **Có** — thêm điểm chặn vào pipeline kế hoạch. |

**Chỉ tiêu nghiệm thu B-10**

| Chỉ tiêu | Ngưỡng | Cách đo |
|---|---|---|
| Bắt ca đã biết | `t5-logq.ccoding-fastlane.2` bị chặn bởi **cả** quy tắc A và B | phát lại (a) trên `results/C9/` |
| Chặn nhầm | ≤ 1 lượt bị chặn ngoài ca t5 trong toàn bộ lượt CCoding có `ccoding-task.json` ở `results/C*/`; mỗi lượt chặn có giải thích; `t1-duration.ccoding-fastlane.3` **không** bị chặn | phát lại (a) |
| Không chạy kế hoạch dở | 0 lượt có số hạng mục đã chạy < số hạng mục tóm tắt tự khai | `ccoding-task.json` (`runs[].subtasks` so với `planSummary`) |
| Lỗi phối hợp trên bộ đo | arm CCoding sau B-10: tỉ lệ "bỏ yêu cầu" (nhóm test ẩn hỏng toàn bộ, đề nghị ở trường 6) không lớn hơn A0-sonnet trên bài coding; phán quyết H8 không "SUPPORTED" theo chiều CCoding tệ hơn | H8, `analyze.mjs:96-100` (sau khi bổ sung chỉ số); trước đó đọc "failed hidden-test share" `:98` |
| Chi phí | 0 lượt LLM thêm khi kế hoạch đạt; ≤ 1 lượt plan khi bị chặn | log `plan` |

---

### B-11 — Làm gọn làn đơn (R12, vòng 4 gói 1; 3/11/2026; @methodologist)

**Mọi số dưới đây chép từ hai nguồn, không tự ước số mới:** `analysis/b7-cost-decomposition.md` (viết tắt **S1**, bảng T-n) và `analysis/b02m-replay.md` (**S2**). Mã gọi lại: sha256 `runs.jsonl` ở S1 T-0. Phép tính số học từ số của S1 được ghi công thức và nhãn "tính từ S1". Đây là **đề xuất**; chưa có biện pháp nào được triển khai hay đo.

**B-11.1 Bối cảnh.** B-01 bị bác bỏ ở vòng 3: B7/A0 = ×2,498 token có trọng số và ×2,566 thời gian (`results-round3.md` §5). S1 tái lập ×2,51 và ×2,56 (S1 T-7). Chênh weighted trên t1–t5: pha accept 47,7 % (đo trực tiếp), out vượt A0 43,6 %, cacheWrite vượt A0 8,7 %, khác + dư 0,0 % (S1 T-5, thứ tự quy phần accept → out → cacheWrite → khác). B7b: 46,8 % / 45,4 % / 7,8 % / 0,0 %. **Hạn chế quyết định cách đọc:** `byPhase` chỉ có weighted theo pha, không có out/cacheWrite/giây theo pha (S1 T-2, T-6), nên accept TRÙNG một phần với out và cacheWrite; cận dưới "accept độc lập" chỉ 14,5 % (B7b 6,0 %) ở thứ tự ngược (S1 T-5). Thời gian (×2,57) không tách được theo pha (S1 T-6). Các số thời gian của T-6 là số **gộp** (trung vị lượt gộp qua bài): A0 52,4 s → B7 140,2 s, hiệu ≈ 87,7 s (dòng "phần không quy được" của T-6) là **Δ gộp**, không phải Δ cặp-theo-bài; cột Ghi chú của T-6 còn có "Δ 71,2 s" chưa ghi phép tính nên backlog này **không dùng** số đó. Việc giải thích phép tính (hoặc xóa "Δ 71,2 s" khỏi cột Ghi chú của T-6) giao **người giữ `b7-cost-decomposition`** (Phòng Dev, B-05), hạn: trước commit khóa kế hoạch đo B7′; chưa xong thì số đó vẫn không được trích.

**B-11.2 Bốn biện pháp** (mỗi biện pháp 4 trường; "cận trên" = cắt hết phần tương ứng, không khả thi trọn vẹn; "ước lượng điểm" = số đo trực tiếp):

| | (a-skip) Bỏ nghiệm thu CTO (cột này; (a-brief) xem dưới bảng) | (b) Mẫu đầu ra gọn cho làn đơn | (c) Giảm prompt hệ thống, bản đồ repo, tài liệu cho lượt đơn | (d) Bỏ lượt định tuyến LLM khi `ProjectDef.lane` ép làn |
|---|---|---|---|---|
| **Trạng thái** | (a-skip) **BỊ CHẶN** (phán quyết B-02 của S2 là "không đủ dữ liệu", không phải "đạt"); (a-brief) **CẦN GIÁM ĐỐC DUYỆT** (xem dưới bảng) | Chờ giám đốc | Đề xuất | **ĐÃ CÓ, ĐÓNG** (R13): `route()` đã bỏ lượt LLM khi ép làn đơn (xem dưới bảng) |
| **1. Tiết kiệm token/thời gian ước lượng** | Token: pha accept = 47,7 % Δ (48,4k/bài) trên t1–t5; 46,8 % (29,0k/bài) trên B7b (S1 T-5). Là **ước lượng điểm của chính accept** nếu bỏ hẳn; là **cận trên** khi tính phần độc lập vì trùng out/cacheWrite: 14,5 % / 6,0 % (S1 T-5, thứ tự ngược). Trung vị accept mỗi lượt 46,6k (t1–t5), 28,9k (B7b) (S1 T-2). Thời gian: **không đo được** (S1 T-6) | Token: **cận trên** = out vượt A0: 43,6 % Δ (44,3k/bài) t1–t5; 45,4 % (28,1k) B7b (S1 T-5); theo thành phần 50,4 % / 56,1 % (S1 T-4). Không tách mẫu đầu ra khỏi báo cáo bàn giao, cũng không tách out của accept khỏi out của execute (S1 T-7), nên **không có ước lượng điểm**. Thời gian: không phân rã được; chỉ mô tả wall ~ out Spearman 0,97 (S1 T-6) | Token: **cận trên** = cacheWrite vượt A0: 8,7 % Δ (8,9k/bài) t1–t5; 7,8 % (4,9k) B7b (S1 T-5); theo thành phần 36,8 % / 38,0 % (S1 T-4). Prompt không được đo (`prompt.*Chars` chưa có, S1 §Đề xuất SR), nên **không có ước lượng điểm**. B7b yếu hơn: cacheWrite mỗi lượt gọi B7 10,8k < A0 13,2k (S1 T-4) | **Bằng 0 cho B7 và các arm sau nó** (đã nằm trong B7, không còn để tiết kiệm): lượt route LLM bị bỏ khi ép làn đơn, `src/orchestrator.ts:1083-1084`; arm B7 ép `single` thật (`bench/vs-claude/arms.json:80-86`). Chi tiết và cách kiểm ở "(d) ĐÃ CÓ, ĐÓNG" dưới bảng. Lượt định tuyến "không đo được" ở S1 T-6 vì `runs.jsonl` không có pha, không phải vì còn lượt |
| **2. Rủi ro chất lượng** | Mất lớp bắt lỗi mà reviewer/CTO từng bỏ lọt hoặc bắt được. Cổng B-02 (phát lại S2): bắt 1/1 ca dương (CI 95 % [2,5 %; 100 %]), chặn nhầm 0/53 lượt xanh ([0 %; 6,7 %]). Một ca dương không đủ để thay nghiệm thu. Vòng 3 mọi bài t1–t5 chạm trần điểm (`results-round3.md` §5 (c)) nên **không đo được** chênh chất lượng khi bỏ nghiệm thu | Mất thông tin cần cho KPI hoặc người đọc: `compliance.templateCoverage` phải giữ 100 % (§4.5). Giữ đúng tiêu đề mẫu nên rủi ro định dạng thấp; rủi ro là mục bị rút quá ngắn (vd. "Tệp đã lưu", "Lệnh kiểm chứng") | Thiếu ngữ cảnh ⇒ thêm lượt đọc tệp (đổi cacheWrite sang số lượt/lượt gọi, có thể tăng giờ); mất quy ước repo (`AGENTS.md`) ⇒ sai phong cách. **Không được lược** quy tắc dữ liệu/bảo mật | Thấp: cùng quy tắc chọn làn, chỉ khác "có/không gọi". Rủi ro duy nhất: ép làn đơn cho việc lớn (đã là quyết định của chủ dự án, `lane.ts:126`) |
| **3. Điều kiện áp dụng** | Chỉ khi **đồng thời**: (i) phán quyết B-02 = "đạt" (S2 hiện "không đủ dữ liệu"; cần thêm ca dương và dữ liệu B02-G/Q, §4.5); (ii) cổng B-02 xanh ở lượt đó (không còn lệnh đỏ mà đề bài nhắc); (iii) việc không đụng bảo mật/dữ liệu (§6, B-04, B-08); (iv) làn đơn. Phương án rút gọn (thay vì bỏ): nghiệm thu chỉ chạy khi cổng B-02 đỏ hoặc có `ESCALATE:` | Làn đơn; giữ nguyên tiêu đề mẫu (đúng chuỗi mà phép kiểm §4.2 tìm); giới hạn độ dài theo từng mục, mục "không áp dụng" ghi một dòng. **Phương án đề xuất:** mỗi mục tối đa N ký tự, N đặt sau khi có `outputChars` theo mục (SR mới của S1); phần dài (nhật ký chi tiết, liệt kê tệp) chuyển sang tệp trong workspace thay vì nằm trong thân báo cáo. **Không đặt N bây giờ** vì chưa có số đo | Làn đơn; đo `prompt.systemChars/repoMapChars/docsChars` trước (SR mới) rồi mới đặt ngưỡng; bản đồ repo chỉ lược cho việc có tệp nêu trong đề bài; tài liệu dài chuyển sang "đọc khi cần" | **Đã đóng, không triển khai.** Điều kiện duy nhất còn lại: mỗi arm mới phải giữ `options.lane: "single"` (xem B-11.5) |
| **4. Mục cần giám đốc duyệt** | Có: đổi cổng chất lượng; mở khóa sau khi B-02 "đạt" | **CẦN GIÁM ĐỐC DUYỆT — đụng mẫu đầu ra của giám đốc.** Duyệt: (1) giữ nguyên bộ tiêu đề; (2) có giới hạn độ dài từng mục; (3) giá trị N | Có đối với phần prompt mang quy tắc an toàn/dữ liệu (không lược). Không cần với bản đồ repo và tài liệu, Phòng Dev tự quyết kèm test | Không áp dụng (đã đóng) |

**(a-skip) và (a-brief) — tách theo bối cảnh mới (R13).** Các cột (a) ở bảng trên là của **(a-skip)** (bỏ hẳn nghiệm thu CTO). **(a-brief)** giữ lượt CTO nhưng CTO chỉ trả bảng tiêu chí ngắn thay cho báo cáo nghiệm thu.
- **(a-skip): BỊ CHẶN.** Phán quyết B-02 "không đủ dữ liệu": bắt 1/1 ca dương, chặn nhầm 0/53 (`b02m-replay.md`). Lần đọc `finalPath` (vòng 4 gói 1b) không đổi số này (xem B-11.6).
- **(a-brief): CẦN GIÁM ĐỐC DUYỆT** (không "bị chặn", không "mở"). *Vì sao không còn bị chặn cứng:* lượt CTO và cổng chất lượng còn, nên phụ thuộc vào B-02 yếu hơn; B-02 chỉ nói chưa đủ dữ liệu để **bỏ** lớp bắt lỗi, không nói gì về rút ngắn đầu ra. *Vì sao chưa "mở":* (i) đổi định dạng đầu ra của cổng chất lượng là quyết định của giám đốc, giống (b); (ii) chưa có bằng chứng bảng ngắn giữ được phát hiện: dữ liệu chỉ có 1 ca dương trong 54 lượt (CI 95 % của "bắt 1/1" là [2,5 %; 100 %]), nên không đo được việc mất phát hiện.
- **Rủi ro cần nêu:** (1) CTO bỏ lý do/chứng cứ, nên bước sửa không tái hiện được lỗi; (2) CTO chấp nhận nhiều hơn vì không phải biện minh bằng văn bản (thiên lệch, chưa đo); (3) `templateCoverage` giảm nếu bảng thiếu mục của mẫu; (4) tiết kiệm không chắc: tối đa bằng phần accept, 47,7 % Δ (cận trên, S1 T-5), mà accept gồm cả phần đầu vào (cacheRead) không bị rút; S1 không tách out theo pha nên **không có ước lượng điểm**.
- **Tiêu chí kiểm trước khi áp dụng** (áp dụng ≠ chạy đo; giám đốc có thể duyệt chạy B7cab để đo chi phí trước): (i) phát lại B-02 với đầu ra brief: mọi ca mà CTO đầy đủ đã bắt (hiện 1) vẫn bị bảng ngắn bắt; (ii) đủ ca dương: nếu 0 bỏ lọt trong n ca dương thì cận trên 95 % của tỷ lệ bỏ lọt ≈ 3/n (quy tắc ba, xấp xỉ, cần data-scientist kiểm), muốn ≤ 20 % cần n ≥ 15, hiện có 1; (iii) chặn nhầm không tăng so với 0/53; (iv) `templateCoverage` 100 %.

**(d) ĐÃ CÓ, ĐÓNG (R13).** Lượt định tuyến LLM nằm ở `route()`, không ở `pickLane`/`chooseLane` (hai hàm này không gọi LLM: `src/orchestrator.ts:1198-1200`). Đã đọc mã và lịch sử, không chạy lại:
- `src/orchestrator.ts:1083-1084` (HEAD): `// B-01: ép làn đơn → định tuyến bằng từ khóa, không gọi LLM (làn đơn không có lượt route)` rồi `const router = forcedLane(task.options.lane, project?.lane) === 'single' ? undefined : registry.router();`. `forcedLane` ở `src/lane.ts:100-106` trả `'single'` khi `options.lane` (hoặc `ProjectDef.lane`) là `single`.
- Tại `7fb18ba` (hash server chạy B7, §9 V3-02): `git show 7fb18ba:src/orchestrator.ts` dòng 1084 là `const router = task.options.lane === 'single' ? undefined : registry.router();` (chỉ `options.lane`; HEAD thêm `project?.lane`). Lưu ý: `7fb18ba` là commit sửa harness; dòng chú thích "làn đơn không có lượt route" do `994d9c8` đưa vào (`git log -S` chỉ liệt kê commit này), nên "có từ 7fb18ba" đúng về mã ở hash đó nhưng không phải commit gốc.
- **Cấu hình arm B7 ép `single` thật:** `bench/vs-claude/arms.json:80-86`, B7 có `"options": { "lane": "single" }` (dòng 82-84). `bench/vs-claude/run.mjs:145` truyền `taskOptions: spec.options ?? {}`. `bench/vs-claude/lib/ccoding.mjs:49` dựng `options: { budgetMode: 'complete', planApproval: false, ...opts.taskOptions, variant: opts.variant }` (tệp này không chứa từ `lane`/`single`, chỉ chuyển nguyên). Vậy `task.options.lane === 'single'` ⇒ `router` là `undefined` ⇒ B7 không có lượt route LLM. **Không có phát hiện trái ngược.**
- Hệ quả: (d) không còn là biện pháp tiết kiệm cho B7 và các arm sau nó (đã bằng 0). **Điều kiện kèm theo:** mỗi arm mới (B7c/B7cb/B7cab) phải sao chép `"lane": "single"`; thiếu dòng đó thì lượt route quay lại và (d) mở lại. Đưa vào kiểm tra trước commit khóa (B-11.5).

**B-11.3 Bảng chồng lấn theo thành phần phân rã của S1 (không cộng trùng).** Cột = phần Δ weighted theo thứ tự quy phần của S1 (t1–t5 / B7b, S1 T-5). Dấu ● = biện pháp rút từ phần đó; ◐ = rút từ phần đó nhưng token trùng với phần "accept" (S1 T-5 ghi: out và cacheWrite dùng số cả lượt nên trùng một phần accept).

| Biện pháp | accept (47,7 % / 46,8 %) | out vượt A0 (43,6 % / 45,4 %) | cacheWrite vượt A0 (8,7 % / 7,8 %) | khác + dư (0,0 % / 0,0 %) |
|---|:---:|:---:|:---:|:---:|
| (a) nghiệm thu | ● | ◐ (out của accept) | ◐ (cacheWrite của accept) | — |
| (b) mẫu gọn | — | ● (execute + accept) | — | — |
| (c) prompt | — | — | ● (phần còn lại ◐ trùng accept) | cacheRead (12,8 % / 5,9 % theo thành phần, S1 T-4) |
| (d) định tuyến (đã đóng) | — | — | — | 0 (không có lượt, xem "(d) ĐÃ CÓ, ĐÓNG") |

Quy tắc không cộng trùng: (i) không cộng (a) với (b) hay (c) bằng phép cộng phần trăm, vì token của accept nằm trong cả ba cột; (ii) hợp của ba cột đầu = 100 % Δ theo cách quy phần nên "cận trên cộng" không mang thông tin; (iii) chỉ nêu **mức cắt cần thiết** và **kịch bản đơn lẻ**. Kịch bản đơn lẻ áp công thức của S1 (§Hàm ý) R′ = 1 + (1 − f) × 1,51, với 2,51 là ước lượng điểm vòng 3 và f là phần Δ đã cắt (tính từ S1; chưa kiểm bằng dữ liệu):

| Kịch bản (cận trên cắt hết phần) | f (thứ tự chính) | R′ | f (thứ tự ngược) | R′ |
|---|---:|---:|---:|---:|
| (a) bỏ hẳn accept (**bị chặn**) | 47,7 % | ×1,79 (S1 §Hàm ý) | 14,5 % | ×2,29 |
| (b) cắt hết out vượt A0 | 43,6 % | ×1,85 | 49,4 % | ×1,76 |
| (c) cắt hết cacheWrite vượt A0 | 8,7 % | ×2,38 | 36,1 % | ×1,96 |

Các ô thứ tự chính của (b), (c) là phần còn lại sau khi accept đã quy phần (thứ tự accept → out → cacheWrite); R′ không áp dụng được cho tổ hợp. **Thang đo không tương thích (chỉ báo thô):** f là tỷ phần của Δ cộng theo bài (trung bình số học các trung vị, S1 T-5), còn 2,51 là trung bình hình học của tỷ số theo bài (S1 T-7). Tỷ số theo bài dao động ×1,73 … ×4,01 (S1 T-3), nên f bị các bài đắt chi phối. Vì vậy R′ và các ngưỡng 80,1 %/90,1 % dưới đây chỉ là chỉ báo thô về độ lớn, **không đủ làm lập luận định lượng** cho con số ×1,3. Cách chặt hơn (chưa làm): data-scientist trừ accept theo từng lượt trong `runs.jsonl` rồi tính lại tỷ số theo kiểu đăng ký trước. Mức cắt cần: ×1,3 cần f ≥ (2,51 − 1,3)/1,51 = **80,1 %** Δ; ±15 % (×1,15) cần f ≥ (2,51 − 1,15)/1,51 = **90,1 %** Δ (tính từ S1).

**B-11.4 Đọc kết quả và đề xuất chỉ tiêu B-01 mới (ĐỀ XUẤT, CHỜ GIÁM ĐỐC DUYỆT).**
- **Đề xuất:** sau B-11, B-01′: token có trọng số **và** thời gian thực của làn đơn ≤ **×1,3** A0-sonnet; **±15 % giữ làm mục tiêu dài hạn**, không bỏ. Chỉ tiêu chất lượng (test ẩn, KPI, `templateCoverage` 100 %) giữ nguyên §3.4.
- **Lập luận (từ S1):** (1) ×1,3 cần cắt ≥ 80,1 % Δ, ±15 % cần ≥ 90,1 %. Không biện pháp đơn nào của S1 làm được; (a) bị chặn. Nếu không có (a), phần rút được từ out + cacheWrite + khác là 52,3 % (thứ tự chính) đến 85,5 % (ngược) Δ (100 % − 47,7 % / 14,5 %), tức chỉ chạm ngưỡng 80,1 % khi cắt gần hết out vượt A0 và cacheWrite vượt A0 ở thứ tự ngược, không khả thi vì phần out gồm mã thật. (2) Phần chi phí cố định không thể bỏ: B7 luôn có execute (S1 T-2: 2 lượt gọi trở lên ở 100 % lượt B7 t1–t5); mỗi lượt gọi ghi cache ~ một lượt A0 (cacheWrite mỗi lượt gọi B7 17,8k so với 14,7k mỗi lượt A0, t1–t5, S1 T-4); nền thời gian B7b A0 15 s so với B7 hai lượt 80 s (S1 T-6). **Phần cố định chưa đo** (S1 T-6: giây theo pha, lệnh kiểm tra, tạo worktree đều "không đo được"), nên ×1,3 là con số **thực dụng**, không phải cận suy ra. (3) Tại sao không giữ ±15 % ngay: đạt ±15 % cần thực gần như xóa mọi chênh lệch.
- **Rủi ro của việc đổi chỉ tiêu (nêu rõ):** đổi sau khi thấy dữ liệu B7 (xem §9 V4-01, nhãn post-hoc). Biện pháp giảm: (i) giữ phán quyết "bác bỏ ±15 %" của vòng 3; (ii) chỉ tiêu mới chỉ áp cho dữ liệu B7′ mới, đã đăng ký và commit trước lượt đầu; (iii) gọi kết quả "B-01′", không gọi là xác nhận B-01; (iv) báo cả khoảng tin cậy so với ±15 %. Nếu giám đốc không đồng ý đổi, giữ ±15 % và coi B-11 là hướng giảm, phán quyết không đổi.
- Dòng sửa đăng ký trước: `preregistration.md` §9, mã **V4-01**.

**B-11.5 Kế hoạch đo lại B7′ (khóa đăng ký trước khi chạy).**
- **Hạn chót:** toàn bộ lượt chạy và phân tích xong trước **5/11/2026 14:59** (hết credit cloud). Mọi giờ theo múi giờ +07.
- **Arm theo mức duyệt.** "B7′" là tên chung của ba arm; mỗi arm = B7 + công tắc, và **phải giữ `"lane": "single"`** của B7 (kiểm trước commit khóa; xem "(d) ĐÃ CÓ, ĐÓNG"). (a-skip) bị chặn nên không có arm. Tên arm do Phòng Dev đặt trong `bench/vs-claude/arms.json`; tác giả không sửa `bench/`. **Nếu không arm nào đủ điều kiện và kịp hạn thì không chạy B7′**; ghi lại bằng dòng §9.

| Arm | Công tắc | Điều kiện chạy | Ưu tiên giai đoạn 2 |
|---|---|---|---|
| B7c | (c) | Phòng Dev triển khai (c) kịp, test xanh trước commit khóa; (c) không lược quy tắc dữ liệu/an toàn (B-11.2 mục 4). **Luôn chạy nếu (c) kịp** | 3 (cắt đầu tiên) |
| B7cb | (c)+(b) | Giám đốc **duyệt (b)** (3 mục duyệt, B-11.2 mục 4) và (b) triển khai kịp | 2 |
| B7cab | (c)+(b)+(a-brief) | Giám đốc **duyệt cả (a-brief) và (b)** (duyệt chạy đo, tách khỏi duyệt áp dụng) và (a-brief) triển khai kịp | 1 (cắt cuối cùng) |

- **A0 và arm chính.** Một nhóm A0-sonnet **dùng chung** cho mọi arm, cùng cửa sổ, xen kẽ lượt. **Arm chính xét B-01′ (×1,3)** = arm có mức cắt cao nhất đã duyệt và triển khai (B7cab > B7cb > B7c): theo B-11.3, (c) đơn lẻ cắt hết phần cacheWrite vẫn còn R′ ≥ ×1,96 và (b) đơn lẻ ≥ ×1,76, nên arm thấp không có đường tới ×1,3. Phép kiểm "đạt/bác bỏ" chỉ làm cho arm chính nên **không cần hiệu chỉnh so sánh bội**; các arm còn lại **mô tả** (R̂ kèm khoảng tin cậy, không tuyên bố đạt/bác bỏ), dùng để đọc đóng góp từng bước.
- **Đối chứng và môi trường.** A0-sonnet chạy **cùng cửa sổ, cùng server, cùng hash `commit`, xen kẽ lượt** với B7′ (khác vòng 3, khi A0 lấy từ hai cửa sổ: `validity-round3.md`; S1 §Phân tích lỗi). Máy cô lập nếu có thể: một server, một luồng tuần tự, không chạy CCoding khác (V3-10). Nếu không cô lập được, ghi là đe dọa và báo `wallSec` kèm cảnh báo.
- **Bài và số lượt.** Phương án cỡ mẫu **A: 10 lượt × 5 bài t1–t5** (cùng bài với B7a để ghép được với B7 cũ; chọn theo `variance-decomposition.md` V-3, xem "Độ rộng CI dự kiến"): tối đa 50 lượt mỗi arm và 50 lượt A0 dùng chung. Chia theo **khối** = 5 bài × 2 lượt cho mỗi arm đang chạy + 5 bài × 2 lượt A0 (10 lượt A0), xen kẽ theo bài. **Giai đoạn 1 (GĐ1)** = 1 khối cho mọi arm đủ điều kiện, tức **20 lượt đầu của mỗi arm (10 lượt arm + 10 lượt A0 ghép cặp)**. **Giai đoạn 2 (GĐ2)** = thêm khối cho arm qua điểm dừng, theo thứ tự ưu tiên ở bảng arm, tối đa 5 khối, trong trần thời gian. **Thứ tự cắt khi thiếu thời gian:** (1) phần phụ B7b (bài thêm, mô tả); (2) khối GĐ2 của B7c; (3) của B7cb; (4) của B7cab. **Không cắt A0 của GĐ1** (mất ghép cặp). Phần phụ B7b trong kế hoạch này **bị cắt hẳn** (xem bảng thời gian).
- **Độ rộng CI dự kiến (số của S2, `analysis/variance-decomposition.md`).** Điều kiện cứng **đã thỏa**: bootstrap tách phương sai log(B7/A0) đã chạy trên `bench/vs-claude/results/study-cloud/runs.jsonl` (240 dòng), sha256 chuẩn hóa LF `3a7c6e52991368875975d55474697c9669311f2c6caf766d3a88c4a4e113e354`, blob git `9e596ff3170b0dedef5df62ede7dadfc790cec8e` (V-0). Tách phương sai trên t1–t5 (V-1, CI 90 %): token σ²_task (giữa bài) 0,0974 [0; 0,1883], σ²_run (giữa lượt) 0,0873 [0,0359; 0,1354]; thời gian σ²_task 0,0994 [0; 0,1902], σ²_run 0,0809 [0,0360; 0,1151]. Hai phần cùng bậc và CI của σ²_task chạm 0 (chỉ 5 bài), nên "giữa bài lớn hơn giữa lượt" **chưa chắc**.
  - **Nửa độ rộng CI 90 % dự kiến, thang log, mô phỏng, R thật = 1,3, 100 lượt = 50 arm + 50 A0** (V-2): **A (10 lượt × 5 bài) 0,218** cho cả token và thời gian (giải tích 0,240 / 0,241; nhân tử ×1,25 … ×1,24); B (5 lượt × 10 bài, thêm 5 bài B7b) K1 0,170 / 0,170, K2 0,196 / 0,224, K3 0,245 / 0,291 (token / thời gian).
  - **Phương án chọn: A.** Điều kiện phương sai của quy tắc phân bổ (giữa bài > giữa lượt) thỏa 2/2 đại lượng; nếu áp nguyên văn thì ra B. S2 thêm **quy tắc phụ** (chỉ chọn B nếu B còn hẹp hơn A theo K2, ước lượng riêng của B7b) và theo K2 B kém A +0,006 trên thời gian; B chỉ hơn rõ ở K1, giả định B7b đồng nhất với t1–t5 chưa kiểm, mà σ²_task của B7b lẫn hiệu ứng cửa sổ (A0 B7b lấy từ cửa sổ khác). Quy tắc phụ này được **đăng ký tại đây** (S2 chốt trước khi chạy, V-3); giám đốc/data-scientist có thể đổi, kèm lý do. Chênh A–B ≤ 0,022 (gần hòa), nên A không mất nhiều.
  - **Hệ quả đăng ký trước.** Cận trên CI ≈ R̂ × 1,24 ⇒ **"R ≤ 1,3" chỉ có khi R thật ≲ 1,05** (S2); trường hợp khác là "không kết luận". Kế hoạch **chấp nhận rủi ro này**; ba trạng thái: **đạt** nếu cận trên CI 90 % ≤ 1,3 ở cả token và thời gian; **bác bỏ** nếu cận dưới > 1,3 ở một đại lượng; ngược lại **không kết luận**, báo R kèm CI so với ±15 % và ×1,3. Mô phỏng thường hẹp hơn giải tích khi T = 5, nên CI thật có thể rộng hơn 0,218 (S2 §Phân tích lỗi). Số trên áp cho **n = 50 lượt/arm**; arm dừng ở 10–40 lượt rộng hơn và **chưa được mô phỏng** (S2 chỉ cho độ phân tán của R̂ ở 20 lượt: khoảng 90 % ×0,97 … ×1,69 khi R thật = 1,3, V-4).
- **Ngân sách lượt theo arm, trong trần thời gian 3,6 giờ (= 12 960 s) của `preregistration.md` §4.4(d), gồm cả A0.** Cận trên thô: mỗi arm tốn bằng B7 (trung vị t1–t5 của S1 T-1: 198,7k weighted và 140,2 s mỗi lượt; A0 65,7k và 52,4 s mỗi lượt), vì mục đích B-11 là arm rẻ hơn B7. Một khối với k arm: thời gian = 10 × 52,4 + k × 10 × 140,2 = 524 + 1 402 k s; token = 657k + k × 1 987k. Cộng dự phòng 30 % cho **cả token và thời gian** (trung vị thấp hơn trung bình: có 3 lượt 6 lượt gọi ở 518k, S1 T-2). Trần token cửa sổ 22M. Số học tính từ S1 T-1, không đo mới; thời gian là chạy tuần tự, không gồm phân tích.

| Kịch bản | Số khối | Thời gian (có dự phòng) | Token (có dự phòng) | Trong trần 3,6 giờ |
|---|---|---|---|---|
| k = 1 (chỉ B7c) | GĐ1 (1) | 2 504 s = 0,70 giờ | 3,44M | có |
| k = 1 | 5 (n = 50) | 12 519 s = 3,48 giờ | 17,2M | có (sát) |
| k = 2 | GĐ1 (1) | 4 326 s = 1,20 giờ | 6,02M | có |
| k = 2 | GĐ1 + 1 khối cho cả 2 | 8 653 s = 2,40 giờ | 12,0M | có; khối thứ 3 cho cả 2 = 12 979 s = 3,61 giờ: **vượt** |
| k = 2 | GĐ1 + 3 khối cho 1 arm | 4 326 + 3 × 2 504 = 11 838 s = 3,29 giờ | 16,3M | có (arm đó đạt 40 lượt) |
| k = 3 | GĐ1 (1) | 6 149 s = 1,71 giờ | 8,60M | có |
| k = 3 | GĐ1 + 2 khối cho 1 arm | 6 149 + 2 × 2 504 = 11 157 s = 3,10 giờ | 15,5M | có (arm đó đạt 30 lượt) |
| k = 3 | GĐ1 + 1 khối cho cả 3 | 12 298 s = 3,42 giờ | 17,2M | có (sát) |

**Hệ quả:** n = 50 lượt/arm chỉ vừa trần khi chỉ có **một** arm chạy suốt (k = 1, ≈ 3,5 giờ); khi có nhiều arm đủ điều kiện, GĐ2 chỉ dành cho arm qua điểm dừng, theo ưu tiên B7cab > B7cb > B7c, và số khối thêm = số lớn nhất để tổng ≤ 12 960 s theo công thức trên, **thay 140,2 s bằng trung vị thời gian arm đo được ở GĐ1** (tính lại ngân sách, không dùng R̂). Phần phụ B7b (S1 T-6: B7 ≈ 80 s, A0 ≈ 15 s, 26 + 26 lượt ≈ 3 210 s = 0,9 giờ có dự phòng; token ≈ 3,4M) **bị cắt hẳn** vì không còn chỗ dưới trần; chỉ chạy nếu giám đốc cho vượt trần. **Chưa biết hạn mức credit cloud thật còn lại**: giám đốc xác nhận trước khi chạy.

- **Kết quả dự kiến theo arm** (giả thuyết để đối chiếu sau, không phải dự báo; "R′" lấy từ B-11.3 là chỉ báo thô vì thang đo không tương thích, và là **cận dưới của R** vì giả định cắt hết phần tương ứng; thời gian không có ước lượng, S1 T-6):

| Arm | R dự kiến (token) | Căn cứ | Kết luận trong từng kịch bản |
|---|---|---|---|
| B7c | R′ ≥ ×1,96 … ×2,38 | B-11.3: (c) đơn lẻ cắt hết cacheWrite vượt A0 (f = 36,1 % … 8,7 %) | R̂ > 1,6 (dự kiến): dừng, kết luận mô tả "(c) đơn lẻ không đủ", khớp B-11.3. R̂ ≤ 1,6: bất ngờ so với cận, nghi ngờ mô hình cận (vd. (c) làm giảm cả cacheRead, 12,8 %); chạy tiếp GĐ2 |
| B7cb | R′ ≥ ×1,22 … ×1,72 (thứ tự ngược … chính) | B-11.4(1): (c)+(b) cắt hết phần ngoài accept, f = 85,5 % … 52,3 %, R′ = 1 + (1 − f) × 1,51 (tính từ S1). Cắt hết là không khả thi (out gồm mã thật), nên R thật nhiều khả năng ở nửa trên | R̂ > 1,6: dừng, kết luận mô tả "(b) thêm vào (c) chưa đủ"; so với B7c cho phần đóng góp của (b). R̂ ≤ 1,6: chạy tiếp |
| B7cab | không có cận dùng được (cắt hết = 100 % Δ, vô nghĩa); cần f ≥ 80,1 % cho ×1,3 | (a-brief) chỉ cắt một phần accept (≤ 47,7 %, B-11.2); B-11.4(1) | R̂ > 1,6: dừng, "ba công tắc chưa đủ cho ×1,3". R̂ ≤ 1,6: chạy tiếp; chỉ arm này (hoặc arm chính) có thể ra "đạt" |

  **Kỳ vọng của người viết (giả định):** cả ba arm có R thật > ×1,3 và B-01′ ×1,3 có khả năng không đạt; giá trị chính của phép đo là **đóng góp từng bước** (c → +b → +a-brief) ở mức mô tả, kèm kết luận hợp pháp "không kết luận" hoặc "bác bỏ". Nếu giám đốc muốn chỉ tiêu ×1,3 là mục tiêu cứng, cần cắt phần cố định (B-11.4(2)), không chỉ ba công tắc này.

- **Điểm quyết định chạy tiếp/dừng (futility, sau GĐ1).**
  - **Khi nào:** sau 20 lượt đầu của mỗi arm (10 lượt arm + 10 lượt A0 ghép cặp), tính R̂ bằng thống kê đã đăng ký của `prereg-tests.mjs` (trung bình hình học theo bài của tỉ số các trung bình, như S2 V-4) cho token có trọng số và thời gian thực.
  - **Quy tắc:** R̂ > **1,6** ở **một trong hai** đại lượng ⇒ **dừng arm đó và báo trưởng phòng/giám đốc** (không tự bỏ qua); R̂ ≤ 1,6 ở cả hai ⇒ chạy GĐ2 theo ngân sách ở trên. Báo cáo dừng nêu R̂ kèm khoảng tin cậy mô tả và nói rõ "dừng vô ích, chưa phải kết luận".
  - **Hiệu chỉnh theo S2 V-4 (phương án A, 10 cặp, P(R̂ > ngưỡng), token / thời gian):**

| R thật | ngưỡng 1,45 | **ngưỡng 1,6 (chọn)** | ngưỡng 1,8 |
|---|---|---|---|
| 1,3 | 23,4 % / 24,0 % | **9,6 % / 10,0 %** | 2,1 % / 2,2 % |
| 1,6 | 69,4 % / 70,4 % | **47,0 % / 48,0 %** | 21,5 % / 22,2 % |
| 2,0 | 96,6 % / 96,9 % | **89,4 % / 90,0 %** | 70,2 % / 71,3 % |

  - **Vì sao 1,6:** 1,45 dừng nhầm hơn 1/4 arm có R thật 1,3; 1,8 chỉ dừng 21,5–22,2 % arm có R thật 1,6. Với "một trong hai đại lượng", dừng nhầm khi R thật = 1,3 nằm giữa 10,0 % và ≤ 19,6 % (cận hợp 9,6 + 10,0; chưa mô phỏng hợp, hai đại lượng tương quan cao nên gần 10 % hơn). **Giới hạn S2:** 20 lượt chỉ đủ bắt R lớn (≳ 2), không phân biệt 1,3 với 1,6 (R̂ khoảng 90 % ×0,97 … ×1,69 khi R thật = 1,3); vì vậy 1,6 là điểm "dừng và hỏi".
  - **Bản chất của quy tắc:** dừng vì **vô ích (futility)**, không phải dừng vì hiệu quả: không có nhánh "dừng vì đạt", và R̂ của GĐ1 **không** được dùng để tuyên bố đạt/bác bỏ. Không tuyên bố nào được rút ra từ phép xem giữa chừng, nên quy tắc **không tiêu alpha** của phép kiểm cuối (chỉ làm mất công suất: khoảng 10 % dừng nhầm mỗi đại lượng nếu R thật = 1,3; chi phí này được chấp nhận và ghi nhận). **@data-scientist** xác nhận ý này bằng văn bản trước commit khóa kế hoạch đo B7′ (hạn: cùng hạn với việc giải thích T-6); chưa xác nhận thì không khóa.
  - **Ngoại lệ của quy tắc dừng (1) bên dưới:** đây là ngoại lệ duy nhất cho "không dừng sớm vì kết quả".
- **Kết quả GĐ1 (3/11/2026; ghi sau khi dữ liệu đã có; nhãn [Mô tả]).** Nguồn: `bench/vs-claude/results/b7prime/runs.jsonl` (20 dòng) và `RUNLOG.md`; tính lại bằng `bootstrapRatio` đã khóa, chỉ hai đại lượng của quy tắc dừng (token có trọng số, thời gian thực); không đọc điểm.
  - **R̂ (B7cab so với A0-sonnet):** token có trọng số **R̂ = 2,04**, CI 90 % [1,45; 2,99]; thời gian thực **R̂ = 2,16**, CI 90 % [1,53; 3,21]. Tính lại khớp RUNLOG đến hai chữ số thập phân (2,0386 [1,4486; 2,9941] và 2,1646 [1,5333; 3,2104]).
  - **Tham số:** B = 4000, hạt 20261102, CI 90 %; n = 2 lượt mỗi ô × 5 bài (t1–t5), 10 lượt mỗi arm; server `1333eef`; Claude Code CLI 2.1.317 (W1–W5 dùng 2.1.316).
  - **Quyết định:** cả hai R̂ > 1,6 ⇒ **dừng vô ích theo quy tắc B-11.5, chưa phải kết luận** (không phải phép TOST của B-01; với n = 2 mỗi ô, CI rất rộng). Không chạy GĐ2. B7c bị hủy (task T-20261103-092333-123, t5-logq B7c r1) trước khi có dòng kết quả nào.
  - **Tái lập:** script tạm (không lưu trong repo) nhập `bootstrapRatio`, `SEED`, `B` từ `docs/research/analysis/prereg-tests.mjs`; lấy `tokens.weighted` và `wallSec` theo (arm, bài); `cells = bài.map(t => lượt của arm trong t)`; gọi `bootstrapRatio(cells('A0-sonnet'), cells('B7cab'), {reps: B, seed: SEED, level: 0.9})`. Cách dựng `cells` giống `bench/vs-claude/results/study-cloud-final/final-extra.mjs`.
- **Hàm ý của kết quả GĐ1 (3/11/2026; @methodologist; nhãn [Mô tả]; ghi sau khi dữ liệu đã có, xem `preregistration.md` §9 V4-04).**
  - **(a) So sánh mô tả với B7.** R̂ của B7cab là ×2,04 (token) và ×2,16 (thời gian); B7 là ×2,498 và ×2,566 (`paper.md` §6.1, Bảng 8). Số của B7cab thấp hơn về con số, nhưng **không suy ra hiệu ứng của ba công tắc**: khác cửa sổ đo, khác server (`7fb18ba` so với `1333eef`), khác Claude Code CLI (2.1.316 so với 2.1.317), và B7′ chỉ có n = 2 mỗi ô (10 lượt mỗi arm) với CI 90 % rộng ([1,45; 2,99] và [1,53; 3,21]), trùm cả hai phía của ×2,5.
  - **(b) Ba công tắc chưa đủ cho ×1,3.** Cận dưới CI 90 % của cả hai R̂ (1,45 và 1,53) đều trên ×1,3, và cả hai điểm ước lượng trên 1,6. Ở mức mô tả, bật cùng lúc (c), (b), (a-brief) chưa đưa làn đơn tới ×1,3; khớp "Kỳ vọng của người viết" ở trên. Chưa phải kết luận (dừng vô ích, không phải TOST). Nếu giám đốc giữ ×1,3 là mục tiêu cứng, cần cắt phần cố định (B-11.4(2)), không chỉ ba công tắc.
  - **(c) Bước tiếp theo.** Ứng viên theo `analysis/acceleration-crosscheck.md` là **B-13…B-17**. **B-14 (chẩn đoán cache) phải chạy được trước**, vì hiện bị hook chặn trên máy Windows nên chưa có số (`analysis/cache-diagnostic-result.md`). Mục này chỉ ghi hàm ý; chưa mở rộng B-13…B-17 và chưa chạy gì.
- **Lịch (đề xuất).** 3/11 tối: giám đốc duyệt B-11 và chỉ tiêu B-01′. 4/11 sáng: Phòng Dev triển khai (c) (và (b), (a-brief) nếu duyệt), test chạy xanh, mỗi arm giữ `"lane": "single"`; 4/11 trước 12:00: **commit khóa**. 4/11 12:00 – 5/11 06:00: chạy chính (GĐ1 rồi GĐ2; ≈ 3,5 giờ thời gian chạy khi chỉ một arm chạy đủ 50 lượt, ≤ 3,6 giờ ở mọi kịch bản của bảng; dư rộng về lịch cho lượt lỗi và chạy lại). 5/11 06:00 – 10:00: chỉ dự phòng chạy lại lượt lỗi hạ tầng (nằm trong dự phòng 30 %); không có phần phụ B7b trừ khi giám đốc cho vượt trần. 5/11 12:00: dừng, phân tích; 5/11 14:00: bàn giao. Không lượt nào bắt đầu sau 5/11 10:00.
- **Quy tắc dừng** (tuân §4.4): (1) không dừng sớm vì kết quả (**ngoại lệ duy nhất: điểm dừng vô ích sau GĐ1**, R̂ > 1,6), không tăng n để đuổi CI; (2) dừng cả hai nhánh khi gặp hạn mức/đăng nhập (E3); (3) dừng lô nếu ≥ 25 % lượt của một ô là lỗi hạ tầng E1/E4; (4) hết ngân sách cửa sổ thì dừng, báo n thực tế, ô thiếu đánh dấu, không đổi phép kiểm; (5) tới 5/11 12:00 chưa xong thì dừng và phân tích với n thực tế; (6) cắt theo thứ tự ở "Bài và số lượt" (phần phụ B7b, rồi khối GĐ2 của B7c, B7cb, B7cab), không cắt A0 của GĐ1 (mất ghép cặp); (7) không lượt nào làm tổng thời gian chạy vượt 12 960 s (3,6 giờ, §4.4(d)).
- **Yêu cầu khóa.** **Trước lượt chạy đầu tiên** phải có commit chứa: tệp này (mục B-11.5), dòng §9 V4-01, `arms.json` có các arm đủ điều kiện trong B7c/B7cb/B7cab (mỗi arm giữ `"lane": "single"`), hash script phân tích (`prereg-tests.mjs`, `b7-cost-decomposition.mjs`, `variance-decomposition.mjs`), đầu ra bootstrap tách phương sai giữa bài/giữa lượt (điều kiện cứng, **đã có**: `analysis/variance-decomposition.md`, xem "Độ rộng CI dự kiến"), hash server/commit (§8). Hash commit khóa ghi vào §8 trước khi mở `runs.jsonl` mới. Phần nào ghi sau khi đã có dữ liệu phải ghi §9 và nhãn "ghi sau khi dữ liệu đã có". Chưa ai commit khóa tại thời điểm viết (3/11/2026).
- **Chất lượng khi đo.** Điểm t1–t5 chạm trần (`results-round3.md` §5 (c)): B-01′(c) sẽ "không kết luận" lần nữa nếu vẫn chạm trần. Do đó giữ chất lượng bằng test ẩn không kém hơn (biên 2 điểm %), `templateCoverage` 100 %, KPI không giảm, và báo Δ điểm mô tả; phần phụ B7b (bài chưa chắc chạm trần) là chỗ tìm tín hiệu chất lượng, ở mức mô tả.
- **Trường cần ghi thêm cho B7′** (từ S1 §Đề xuất SR): `byPhase[phase].{output,cacheRead,cacheWrite,input,wallMs,calls}`, `timing.*Ms`, `prompt.*Chars`, `routing.llm/lane`, `outputChars` theo mục, giữ `calls.jsonl`, `window/serverPort/commit` mỗi dòng. Nếu những trường này chưa có trước 4/11 thì B7′ vẫn chạy được nhưng không tách được nguồn tiết kiệm; ghi rõ trong kết quả.

**B-11.6 Giới hạn.** Không có `calls.jsonl` của server cloud (S1 §Giới hạn dữ liệu); mọi "tiết kiệm" là cận trên hoặc cận không thông tin, không phải đo. Phán quyết B-02 "không đủ dữ liệu" (S2) dựa trên 1 ca dương trong 54 lượt; không phát biểu khác. **`b02m-replay` đọc `finalPath` (vòng 4 gói 1b, S2):** script đọc `runs[-1].finalPath`; 54/54 lượt có trường `finalPath` nhưng 0/54 có tệp báo cáo đọc được cạnh `ccoding-task.json` (bench không lưu `FINAL.md`), nên không có bằng chứng mới; bắt 1/1 và chặn nhầm 0/53 **không đổi** (`b02m-replay.md`). Muốn phát lại `templateGate` cho (a-brief) và (b), bench phải lưu văn bản đầu ra. Kiểm lại: `node docs/research/scripts/consistency-check.mjs` (xem tệp bàn giao).


### B-12 — Đo recall của cổng chất lượng bằng bộ bài cài lỗi (vòng 4 gói 2; 3/11/2026; @data-scientist) — **cần đo** (E2 xong, E4 đang chạy, N cố định; trước đó: D9, đề xuất)

> Theo `preregistration.md` §5.1: B-12 chỉ là đề xuất trong backlog. Không có lượt nào được chạy, không có dữ liệu nào sau ảnh chụp 276 dòng được đọc. Mọi số dưới đây lấy từ `analysis/agreement.md` §(c) (bảng C-0…C-3) hoặc là **giả định** (đánh dấu).
> **R18 (14/11/2026):** tiêu đề trên giữ trạng thái lúc ghi (3/11–4/11). Trạng thái hiện hành: **đã đo** (E4 xong 12/11, `f9a5887`; CTO đo trên lỗi lọt cổng ở E7, `80f7e94`). Số ở §0.1 (a).

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Chưa ước lượng được **recall** của cổng chất lượng (B-02, B-10, CTO "không đạt"): cần số lượt lỗi thật đủ lớn mà ngưỡng đăng ký là ≥ 10 lượt dương thật. Ngoài ra B-10 và CTO không có trường ghi quyết định nên chưa có phép đo nào. |
| **2. Bằng chứng** | C1–C9: 54 lượt, **4 lượt lỗi thật** (test ẩn < 100 %), B-02 chặn 1 (1/1 đúng, 0 chặn nhầm trong 50 lượt không lỗi; cận trên CP 95 % 7,1 %); 3 lỗi còn lại có lệnh kiểm tra xanh nên B-02 không thể thấy. Ảnh chụp 276 dòng: 120 lượt có cả pha điều phối và test ẩn, **7 lượt lỗi**, đại diện "vào vòng sửa" không bắt lượt nào. Recall: "chưa ước lượng được" (4 và 7 < 10). Lỗi tự nhiên hiếm (7,4 % và 5,8 % lượt), nên chờ lỗi tự nhiên không đủ. |
| **3. Nguyên nhân gốc** | **Đã kiểm:** bộ bài hiện tại thiết kế để so hiệu năng giữa các arm, không để bắt lỗi; lượt lỗi chiếm 6–7 %. B-10 và CTO không ghi quyết định. **Giả thuyết:** ba lượt lỗi còn lại (lệnh kiểm tra xanh, test ẩn hỏng) là loại lỗi nằm ngoài tầm cổng B-02 theo thiết kế (cổng đọc `projectChecks.latest`), nên recall của B-02 trên "lỗi thật" nói chung có thể thấp; chưa kiểm. |
| **4. Thay đổi đề xuất** | (a) Dựng **bộ bài cài lỗi** từ bài sẵn có: bản sao repo có một hoặc vài lỗi cài sẵn thuộc ba nhóm ứng với ba cơ chế: lệnh kiểm tra đỏ mà đề bài nêu (B-02), đích nêu trong đề bài mà kế hoạch không giao cho hạng mục nào (B-10), bản giao thiếu một yêu cầu đã nêu (CTO). Nhãn thật **biết trước theo cách cài**, không phụ thuộc vào cổng. (b) Thêm **lượt không cài lỗi** (nhãn sạch) để đo chặn nhầm: cần n ≥ 72 lượt sạch để cận trên CP ≤ 5 % khi 0 chặn nhầm (hiện có 50). (c) Phòng Dev thêm trường ghi **quyết định của từng cổng** (B-02, B-10, CTO) vào `ccoding-task.json` hoặc `runs.jsonl`; không có trường này thì chỉ đo được B-02 bằng phát lại. (d) Dùng bài **mới** (không phải t1–t5 đã dùng tinh chỉnh CCoding, `preregistration.md` §6 "Ngoại tại"). Không sửa `src/` hay `bench/` trong gói này. |
| **5. Hiệu quả kỳ vọng / cỡ mẫu** | Nửa độ rộng CI 95 % (Clopper–Pearson) của recall ≤ 0,15 cần, với recall kỳ vọng r = 0,6 / 0,8 / 0,9 (**giả định**), **45 / 32 / 21 dương thật độc lập** (`agreement.md` C-3). Quy ra lượt bài cài lỗi, ví dụ r = 0,8: **46 lượt** nếu mỗi lượt cài 1 lỗi và 70 % lỗi còn nguyên đến cổng (q = 0,7, **giả định**); **25 lượt** nếu 3 lỗi mỗi lượt với ρ = 0,3 (DEFF 1,6); **28 lượt** nếu 5 lỗi với ρ = 0,5 (DEFF 3,0). Với r = 0,6 và q = 0,5: 90 / 48 / 54 lượt. ρ và q **chưa có số đo**; nên chạy thử nhỏ để ước lượng trước khi chốt N. Cỡ chi phí tham khảo: C1–C9 trung bình 0,95 USD và 210 giây mỗi lượt CCoding, tức khoảng 24–44 USD và 1,5–2,7 giờ máy cho 25–46 lượt (không tính lượt sạch). |
| **6. Cách kiểm lại** | `node docs/research/analysis/agreement.mjs --pairs tệp.csv --positive 1` với cột `ref,pred,runId` (ref = có lỗi cài còn nguyên, pred = cổng ghi "không đạt", runId = lượt); CI bootstrap **theo lượt**, B = 2000, seed 20261103; báo kèm CP chính xác. Quy tắc: < 10 lượt dương thật ⇒ "recall chưa ước lượng được". Gộp mọi arm; đăng ký trước ở `preregistration.md` (thêm dòng §9) **trước** lượt đầu tiên. |
| **7. Rủi ro / dữ liệu** | (a) Lỗi cài sẵn không đại diện cho lỗi tự nhiên: recall chỉ cho lớp lỗi cài, không khái quát. (b) Nhãn đo ở **cuối** lượt: nếu cổng kích hoạt vòng sửa và vòng sửa chữa xong, lượt bị tính là sạch; cần ghi lỗi tại **thời điểm cổng quyết định**, không chỉ ở cuối. (c) Nhiều lỗi mỗi lượt tương quan (DEFF); (d) agent tự bắt lỗi trước cổng làm q < 1; (e) bài tổng hợp, một họ mô hình; (f) tốn hạn mức (hạn mức 5 giờ, C-49). (g) Phân tích B-12 phải ghi vào `preregistration.md` §9 như phân tích mới, vì không thuộc §5.1. |
| **8. Ưu tiên** | Hiệu quả 3 / công sức 3 = 1,0. **Không xếp hạng**; điều kiện: phán quyết B-02 hiện "không đủ dữ liệu" (`b02m-replay.md`) nên B-12 là con đường để đóng phán quyết đó, nhưng giám đốc quyết có mở đo mới hay không. |
| **9. Giám đốc duyệt** | **Có** — mở đo mới tốn hạn mức và cần Phòng Dev thêm trường ghi quyết định. |

### B-13 — Chỉ số trúng cache và trường ghi theo pha/model (vòng 4 gói 3; 3/11/2026; @research-lead) — **D9** (trước 3/11: đề xuất)

> Đề xuất 1 của tài liệu "4 hướng tăng tốc" (`context/acceleration-4-directions-2026-11-03.md` dòng 260–263). Số lấy từ `analysis/cache-sensitivity.md` (C-x, ảnh chụp `838a5f1`) và `analysis/b7-cost-decomposition.md` (T-x). Đối chiếu đầy đủ: `analysis/acceleration-crosscheck.md` §1 dòng 1.

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Hệ thống chưa có chỉ số tỉ lệ trúng cache `cacheRead / (cacheRead + cacheWrite + input)`. `runs.jsonl` không ghi `model` (C-0), và `byPhase` chỉ có weighted theo pha, không có từng thành phần token (T-2, T-6). Vì vậy không tách được cache theo pha, không tính được USD thật, và mọi thay đổi về cache (B-14) chỉ đo được ở mức cả lượt. |
| **2. Bằng chứng** | C-2 (tính ngoài luồng): tỉ lệ trúng gộp A0-sonnet 87,0 %, B0 76,5 %, B6 80,5 %, B7 82,2 %. C-0: "không có trường model". C-5: chỉ tính được USD theo hai kịch bản cận, toàn Sonnet 5.5 hoặc toàn Opus 5.5. T-2: `byPhase` chỉ có weighted. Mã: Grep "cacheHit", "trúng cache" trong `src/` và `public/` cho 0 kết quả. |
| **3. Nguyên nhân gốc** | **Đã kiểm:** chỉ số và trường chưa tồn tại (đọc mã, C-0). Không có giả thuyết nào cần kiểm thêm. |
| **4. Thay đổi đề xuất** | (a) Tính tỉ lệ trúng cache theo lượt gọi, pha và runtime từ `calls.jsonl` (qua `LogStore`), rồi hiển thị trên trang Token và KPI v2. (b) Trong `runs.jsonl` của bench: ghi `model` cho mỗi lượt gọi, và `byPhase[phase].{input,cacheRead,cacheWrite,output}` (trùng một phần với "Trường cần ghi thêm cho B7′" ở B-11.5). (c) **Chỉ thêm trường sau khi đợt `study-cloud` đang chạy kết thúc**, để không đổi schema giữa đợt. Gói này không sửa `src/` hay `bench/`. |
| **5. Hiệu quả kỳ vọng** | Không tự giảm chi phí. Đây là điều kiện để đo B-14, B-16, B-17 và để tính USD theo model thật thay cho hai kịch bản cận của C-5. |
| **6. Cách kiểm lại** | Tính lại offline từ một `calls.jsonl` mới phải cho cùng số với UI (sai số ≤ 0,1 điểm %). Trên lượt bench mới, tái lập được bảng C-2 từ trường mới. Chạy `node docs/research/scripts/consistency-check.mjs`. Thêm test đơn vị cho hàm tính tỉ lệ (mẫu số 0 ⇒ không hiển thị). |
| **7. Rủi ro / dữ liệu** | Chỉ ghi số token và tên model, không có nội dung lời nhắc. Ghi qua `LogStore`, không thêm đường ghi ngoài `data/`. Đổi schema `runs.jsonl` có thể làm vỡ script phân tích cũ, nên chỉ thêm trường, không đổi tên trường. |
| **8. Ưu tiên** | Hiệu quả 3 / công sức 2 = 1,5. Đề xuất số 2 cho Phòng Dev (`acceleration-crosscheck.md` §4). |
| **9. Giám đốc duyệt** | **Có**, vì đổi schema `runs.jsonl` của bench và chọn thời điểm sau đợt `study-cloud`. |

### B-14 — Chẩn đoán cache claude-cli, rồi ổn định tiền tố (vòng 4 gói 3; 3/11/2026; @research-lead) — **đã đo, giữ tắt** (R18: bước 2 xong 13/11/2026, `d312b76`, không phân biệt được; trước đó: cần đo — E1 xong, đổi bộ công cụ là nguồn ghi cache; bước 2, 96 lượt, giám đốc duyệt 12:50 ngày 4/11; tiền điều kiện (6) đạt, (7) chờ D13 K6; giới hạn ở §9 V4-3e-K3; trước đó nữa: cần giám đốc duyệt)

> Đề xuất 2 của tài liệu (dòng 265–271), cùng câu hỏi TTL ở đề xuất 8 (dòng 293–295). Đặc tả phép thử: `analysis/cache-diagnostic-spec.md` Phần 1 (S2). Gói này không gọi `claude -p`; Phòng Dev chạy.

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Mỗi lượt gọi claude-cli ghi một phần tiền tố cache mới. Chưa biết phần ghi đó đến từ bộ công cụ theo pha, `cwd`, hay phần stdin. Tài liệu đặt mục tiêu "ghi cache < 20 % chi phí" nhưng chưa có số đo nguồn gốc. |
| **2. Bằng chứng** | C-1: 1,25·cacheWrite chiếm 30,1 % (A0-sonnet), 41,7 % (B0), 35,9 % (B6), 34,8 % (B7) token có trọng số. T-4: cacheWrite chiếm 36,8 % phần chênh B7 − A0 trên t1–t5 (C-3 tính lại: 36,5 %). C-3: **không** tái hiện được 68 %, vì không lượt B0/B6/B7 nào đạt mức đó (max theo lượt 53,8–54,2 %). Mã: `claude-cli.ts` truyền `--tools`/`--allowedTools` theo pha (dòng 148, 169, 171) và `cwd` (dòng 183), còn lời nhắc của CCoding đi qua stdin (S2 Phần 1). |
| **3. Nguyên nhân gốc** | **Giả thuyết (S2):** lời nhắc của CCoding nằm trong tin nhắn người dùng, sau tools và system của Claude Code. Đổi bộ công cụ làm vỡ gần hết tiền tố cache, còn đổi stdin chỉ vỡ phần đuôi. `cwd` chỉ có tác động nếu nó lọt vào lời nhắc hệ thống. Chưa kiểm. **TTL [CHƯA KIỂM CHỨNG]:** C-5 cho thấy Σ `costUsd` của A0-sonnet ($14,43) khớp giá cacheWrite 1 giờ, không khớp giá 5 phút ($12,06). Đây là bằng chứng gián tiếp, chỉ cho A0, và giả định A0 chạy Sonnet 5.5. |
| **4. Thay đổi đề xuất** | **Bước 1, chẩn đoán:** 3 cặp gọi `claude -p` với đúng cờ của runtime: (a) giống hệt, (b) khác bộ công cụ, (c) khác `cwd` (đối chứng). Tổng ≤ 8 lượt (6 đo, 1 khởi động, 1 dự phòng). Đo `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens` và h của lượt 2 mỗi cặp. Ghi thêm TTL thật nếu trường usage có. Lời nhắc giả không chứa dữ liệu thật. Ngưỡng `MIN_CACHE_TOKENS` = 512 cho Sonnet/Opus 5.5 (S4, `related-work.md` §2.22). **Bước 2, chỉ khi bước 1 xác định được nguồn:** nếu do bộ công cụ thì giữ một bộ công cụ cố định trong cả nhiệm vụ và để hook claude-guard chặn theo pha; nếu do `cwd` thì xét chạy pha không sửa tệp ở thư mục gốc nhiệm vụ; nếu TTL là 1 giờ cho các lượt cách nhau < 5 phút thì xét chuyển sang 5 phút. |
| **5. Hiệu quả kỳ vọng** | **Cận trên** là toàn bộ phần cacheWrite: 34,8 % token có trọng số ở B7 (C-1). Cắt hết là không khả thi, vì lượt đầu luôn phải ghi. Nếu TTL thật là 1 giờ, tổng USD B7 theo giá Sonnet 5.5 là $31,03 so với $25,37 khi tính 5 phút (C-5) **[CHƯA KIỂM CHỨNG: TTL thật]**. Mục tiêu < 20 % của tài liệu chưa có căn cứ. **Giả thuyết.** |
| **6. Cách kiểm lại** | Bước 1: bảng quy tắc diễn giải của S2 (so h của (b), (c) với (a), ngưỡng 0,9 / 0,5 / 0,2 / 0,05 do người thiết kế chọn), không dùng p-giá trị (n = 1 mỗi cặp). Bước 2: A/B trên bench, đăng ký `preregistration.md` §9 trước lượt đầu. Thước đo chính là token có trọng số `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`; USD và hệ số 0,05 chỉ là phân tích phụ, ngoài họ Holm. Thêm tỉ lệ trúng cache (B-13) và test ẩn không kém hơn. |
| **7. Rủi ro / dữ liệu** | (a) n = 1 mỗi cặp, nên kết quả chỉ là chẩn đoán có/không. (b) Đọc chéo cache giữa các cặp: dùng nonce ở đầu stdin và chờ > 5 phút giữa các cặp (S2). (c) Bước 2 với bộ công cụ cố định chuyển việc chặn sang hook, tức chạm **biên bảo mật** (B-04, B-08), nên cần bộ test lệnh ác ý. Lời nhắc giả không có DLCN hay bí mật. |
| **8. Ưu tiên** | Hiệu quả 3 / công sức 2 = 1,5. Đề xuất số 1 cho Phòng Dev, bắt buộc theo đề bài (`acceleration-crosscheck.md` §4). |
| **9. Giám đốc duyệt** | **Có**: bước 1 gọi `claude -p` (tốn hạn mức nhỏ, ≤ 8 lượt); bước 2 đổi cấu hình công cụ và chạm hook. |

**Trạng thái bước 2 (R17, BRIEF-18 K4, 4/11/2026).** Chỉ dẫn kết luận đã commit của S1 và S3.

| Mục | Trạng thái | Nguồn |
|---|---|---|
| Duyệt | **Đã duyệt**: bước 2, 96 lượt, A/B `runtimes.claude-cli.stablePrefix`, chạy local, sau E5′ | Giám đốc duyệt lúc 12:50 ngày 4/11/2026 (`bench/vs-claude/results/local-3e/RUNLOG.md:23`, commit `9e3c410`) |
| Đăng ký | `preregistration.md` §9, mục "Đăng ký trước bước 2 của B-14"; giới hạn và độ nhạy ở `V4-3e-K3` (c) | Mốc khóa `8941103` (`results/b14-step2/RUNLOG.md:1`) |
| Sổ chạy | `bench/vs-claude/results/b14-step2/RUNLOG.md`; dữ liệu ở `results/b14-step2/on/` và `off/` | Thứ tự và điều kiện bắt đầu: `run-plan.md` §5.4.4 |
| Tiền điều kiện (6): script phân tích có test, commit, hash ghi trước lượt đầu | **Đạt.** `docs/research/analysis/b14-step2.mjs` và `b14-step2.test.mjs`, commit `4e546f47d2c17002971718492108c2dd330439b4` (`4e546f4`), 10/10 test xanh theo bàn giao S1. Script chưa chạy trên dữ liệu thật vì chưa có dữ liệu. Ô "Tiền điều kiện (6)" ở dòng 12 của sổ đã chốt "Đã có" ở `d06ae04` (BRIEF-18 S5) | Dòng hash ở `results/b14-step2/RUNLOG.md:2`, commit `c6fd35f`; gộp vào nhánh nhiệm vụ ở `f12816e` |
| Tiền điều kiện (7): bộ test lệnh ác ý cho `stablePrefix` (trường 7(c)) xanh trên commit ghim | **Chưa đạt, chờ D13 K6.** 5/8 ca có test ở chế độ `stablePrefix`. Thiếu 3 ca: (3) heredoc; (7) `awk 'BEGIN{system(...)}'`; (8) `.env` | Kết luận K3(b): `results/b14-step2/RUNLOG.md:13` và mục "Tiền điều kiện (7): đối chiếu ca lệnh ác ý" (`:18-39`); `context/k3-open-points-2026-11-04.md` (b); commit `f211bc7`, gộp ở `e6f5999` |
| Hệ quả | Chưa được chạy lượt đầu. Bước 2 chỉ bắt đầu khi E5′ xong **và** D13 K6 đã thêm 3 ca trên, bộ test xanh trên commit ghim | `run-plan.md` §5.4.4, bước 4 |

Danh sách ca giao D13 K6, chép từ `results/b14-step2/RUNLOG.md:33-37`: khung `hook(...)` của `test/claude-stable-prefix.test.ts` (dòng 49-50), pha chỉ đọc `plan`/`review`/`synthesize`/`accept`/`finalize`, `stablePrefix: true`.

- Ca 3: `Bash` ``cat <<'EOF' > a.txt\nx\nEOF`` và ``cat <<EOF\nx\nEOF`` → bị chặn, khớp `/chỉ đọc/`.
- Ca 7: `Bash` `awk 'BEGIN{system("rm -rf src")}'` (thêm `awk 'BEGIN{"id" | getline x; print x}'`, `awk -f prog.awk f`) → bị chặn, khớp `/chỉ đọc/`.
- Ca 8: `Bash` `cat .env`, `grep KEY app/.env.local` → bị chặn (`/chỉ đọc/` ở pha chỉ đọc; `env-file` ở `execute`). `Read` `${root}/.env`, `Grep`/`Glob` `${root}/.env.local` ở `plan` → bị chặn bởi `env-file`, thông báo khớp `/\.env/`; đối chứng `.env.example` không bị chặn.

**Kết quả bước 2 (R18, BRIEF-20 K3, 14/11/2026).** Bảng R17 ở trên giữ nguyên làm lịch sử; các dòng dưới thay cho dòng "Tiền điều kiện (7)" và "Hệ quả".

| Mục | Trạng thái | Nguồn |
|---|---|---|
| Tiền điều kiện (7) | **Đạt trước khối 1:** ba tệp test lệnh ác ý (gồm 3 ca D13 K6 thêm) 23/23 đạt, exit 0, trên commit ghim | `results/b14-step2/RUNLOG.md:53` (`setup/adv-tests.log`) |
| Chạy | 5/11–12/11/2026, server `0d216eb`, CLI 2.1.318, ABBA 8 khối × 12 lượt; 96/96 lượt dùng được (16 mỗi ô) | `results/b14-step2/report.md` §1, §2 |
| Kết quả chính | R̂ = 0,999, CI 95 % [0,886; 1,127], p = 0,983 ⇒ **không phân biệt được** | `report.md` §2; `analysis.json` |
| Lực thống kê | σ quan sát 0,312 (kế hoạch 0,182); power ở 10 % ≈ 0,38, ở 5 % ≈ 0,13; mức phát hiện được (power 0,8) ≈ 16,3 %; trả lời ở 10 % cần ≈ 46 lượt mỗi ô, tổng ≈ 276 lượt | `report.md` §2 |
| Sai lệch phân tích | Cách gom dòng chạy lại cùng khóa sửa sau khi người điều phối đã thấy bản đầu (n = 71, R̂ 0,974); cả hai bản cùng phán quyết | `report.md` §4; `preregistration.md` §9 "Sai lệch phân tích bước 2 của B-14" |
| Thước đo phụ (mô tả) | h và phần ghi cache chênh ≤ 0,03 giữa hai nhánh ở mọi bài; pass 97,9 % (tắt) so với 91,7 % (bật), CI Clopper–Pearson chồng nhau rộng, không đăng ký để kiểm | `report.md` §5 |
| Quyết định | **`stablePrefix` giữ tắt** theo (10) của đăng ký. Không mở đo 276 lượt trừ khi giám đốc cần câu trả lời ở mức 10 % (§0.1 (b), hạng 9). Kết luận chỉ áp cho `t2-orders`, `t3-api`, `t4-perf`, arm B7, CLI 2.1.318, `0d216eb` | `report.md` §6 |
| Commit | `d312b76` (13/11/2026 10:38 +07): dữ liệu, phân tích, báo cáo | `git log -1 d312b760` |

### B-15 — Đo họp bằng arm B1 trên bài lớn (vòng 4 gói 3; 3/11/2026; @research-lead) — **cần đo** (E3 cho thấy không đo được với B0/B1; E5′ đã đăng ký ở §9 V4-3e-E5′, D12 đã gộp, giám đốc duyệt 12:50 ngày 4/11; chạy sau E6)

> Đề xuất 3 của tài liệu (dòng 273–276). Điều kiện đo: `analysis/cache-diagnostic-spec.md` Phần 2 (S2).
> **R18 (14/11/2026):** tiêu đề trên giữ trạng thái lúc ghi. Trạng thái hiện hành: **đã đo** (E5′ xong 12/11, `f9a5887`; `results/b15f-main/report.md`). Số ở §0.1 (a); chưa đổi mặc định.

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Chưa có số đo về lợi ích hay chi phí của họp. Tài liệu đề xuất bỏ họp với kế hoạch ≤ 3 hạng mục, hoặc lấy ý kiến vòng đầu song song rồi chốt. |
| **2. Bằng chứng** | Mã trên nhánh perf: phát biểu trong một vòng **đã song song** (`phases.parallelDiscuss` mặc định bật, `orchestrator.ts:1611-1623`). Họp tự bỏ khi kế hoạch < `meetingMinSubtasks` (3) hạng mục hoặc < 2 người tham gia (`:1602-1604`). Mặc định `discussionRounds: 1` (`config.ts:297`). Arm B1 (`discussionRounds: 0`) có ở `arms.json:29-35`, **chưa chạy**. B7 là làn đơn, không họp (T-2). Tài liệu: Debate or Vote (`related-work.md` §2.16). |
| **3. Nguyên nhân gốc** | Không áp dụng: chưa có vấn đề đo được. Câu "họp chạy nối tiếp 5 lượt" của tài liệu mô tả `main@9e6079b`, không khớp mã trên nhánh perf. |
| **4. Thay đổi đề xuất** | Chưa đổi mặc định. Đo B1 so với đối chứng (làn đầy đủ, `discussionRounds: 1`) trên bài lớn. **Tiên quyết (đã xong 3/11/2026):** `l1-modules` và `l2-chain` đã có `task.json` (`3ff7df3`, D8; oracle 1,00, null ≤ 0,01). Kiểm trước: lượt đối chứng phải thật sự có pha `discuss`, nếu không thì kết quả rỗng. |
| **5. Hiệu quả kỳ vọng / cỡ mẫu** | Bỏ một vòng phát biểu song song và một lượt chốt trên đường găng. Độ lớn chưa biết. Cỡ mẫu tham chiếu: 10 lượt × 2 arm × 2 bài = 40 lượt, cộng 6 lượt thí điểm (S2). Với 2 bài, nửa độ rộng CI sẽ rộng hơn 0,218 của phương án A (V-2); con số chính xác chưa mô phỏng. **Giả thuyết.** |
| **6. Cách kiểm lại** | Token có trọng số (thước đo chính), thời gian thực, test ẩn, `byPhase.discuss`. Chỉ báo ước lượng điểm kèm CI. Đăng ký `preregistration.md` §9 trước lượt đầu. |
| **7. Rủi ro / dữ liệu** | Hai bài, nên kết quả khó khái quát. Bài tổng hợp, không có dữ liệu thật. |
| **8. Ưu tiên** | Chưa chấm; công sức 3. **Chỉ còn đo** (`task.json` đã có, `3ff7df3`): 40 lượt + 6 lượt thí điểm (trường 5). Đề xuất 7 của tài liệu (review từng hạng mục) chỉ xét lại sau B-15. |
| **9. Giám đốc duyệt** | **Có**: mở đo mới (`task.json` đã tạo ở `3ff7df3`). |

**Trạng thái E5′ (R17, BRIEF-18 K4, 4/11/2026).**

| Mục | Trạng thái | Nguồn |
|---|---|---|
| Đăng ký | **Đã đăng ký**: `preregistration.md` §9 `V4-3e-E5′`. B0F so với B1F, ép làn đầy đủ để lượt đối chứng có pha `discuss`; 10 lượt × 2 arm × 2 bài (`l1-modules`, `l2-chain`) = 40 lượt; R̂ = B1F/B0F, CI 90 % bootstrap phân tầng, không p | Gộp ở `f36a1d9` (BRIEF-17); arm `B0F`, `B1F` của D12 gộp ở `57148de` |
| Duyệt | **Đã duyệt** | Giám đốc duyệt lúc 12:50 ngày 4/11/2026 (`results/local-3e/RUNLOG.md:23`, commit `9e3c410`) |
| Sổ chạy | `bench/vs-claude/results/b15f-main/RUNLOG.md`, ghi trước lượt đầu lúc 13:55; `--out` `results/b15f-main` | Commit `5346275`, `8c6d2d1` |
| Thời điểm | **Chạy sau E6.** Cổng (3)(iii) của sổ: kịch bản `run3e-c.ps1` chờ dòng "XONG phan sau" của `run3e-b.ps1` | `results/b15f-main/RUNLOG.md:11`, `:16`; `run-plan.md` §5.4.4, bước 3 |
| Kết quả | Chưa có lượt E5′ nào | `results/b15f-main/RUNLOG.md:5` |

### B-16 — Thí điểm "CTO Opus + nghiệm thu brief" (vòng 4 gói 3; 3/11/2026; @research-lead) — **cần đo** (E2 xong, E4 đang chạy, N cố định; trước đó: D9, đề xuất)

> Đề xuất 4 của tài liệu (dòng 278–280). Thiết kế đo: `analysis/cache-diagnostic-spec.md` Phần 3 (S2). Phụ thuộc B-11 (a-brief) và B-12.
> **R18 (14/11/2026):** tiêu đề trên giữ trạng thái lúc ghi. Trạng thái hiện hành: **đã đo** — E4 (`f9a5887`): H-O1 chưa ước lượng được (0 lượt dương thật); E7 (`80f7e94`): R2 (CTO Opus) so với R1 chỉ ở mức mô tả. Số ở §0.1 (a); việc tiếp theo ở §0.1 (b), hạng 7. Không đổi `phaseModels.accept`.

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Tài liệu đề xuất cho CTO nghiệm thu bằng Opus và chuyển bước tổng hợp sang Sonnet. Pha accept đã là phần chênh lớn nhất của làn đơn, và chất lượng phán đoán của CTO (recall) chưa được đo. |
| **2. Bằng chứng** | T-5: pha accept chiếm 47,7 % phần chênh B7 − A0 trên t1–t5, cận dưới độc lập 14,5 %. C-5: giá Opus 5.5 đúng 2× Sonnet 5.5 ở mọi thành phần, nên USD của accept ×2 nếu token không đổi. `agreement.md` §(c) C-1…C-3: recall của cổng/CTO chưa ước lượng được (4 và 7 lượt lỗi < 10). Mã: `phaseModels` có sẵn (`types.ts:335-339`, `orchestrator.ts:3234`, `VARIANT_PHASES` có `accept` ở `:3776`). Chưa có arm nào đặt `accept: opus`. Làn đơn không có pha tổng hợp (B-01), nên phần "tổng hợp → Sonnet" chỉ áp cho làn đầy đủ. |
| **3. Nguyên nhân gốc** | **Giả thuyết:** Opus giảm tỉ lệ nghiệm thu sai, còn (a-brief) bù chi phí bằng cách rút đầu ra của accept. Chưa kiểm. |
| **4. Thay đổi đề xuất** | Hai arm làn đơn, cùng (a-brief), chỉ khác `phaseModels.accept` (Sonnet hoặc Opus). Chạy trên bộ bài cài lỗi B-12, có trường ghi quyết định của CTO (B-12 trường 4(c)). **Thí điểm 12 cặp** để ước lượng ρ, q và tỉ lệ bất đồng, rồi mới tính cỡ mẫu chính thức. Phần "tổng hợp → Sonnet" chỉ là cấu hình `phaseModels.synthesize` cho làn đầy đủ, đo sau khi B-15 có bài lớn. |
| **5. Hiệu quả kỳ vọng / cỡ mẫu** | Chất lượng: tỉ lệ nghiệm thu sai thấp hơn (độ lớn chưa biết). Chi phí: USD của accept tăng tới ×2 nếu (a-brief) không rút được token; (a-brief) có cận trên là toàn bộ phần accept (B-11.2). Cỡ mẫu một arm: 25–46 lượt lỗi cài (`agreement.md` C-3, B-12 trường 5). **Giả thuyết.** |
| **6. Cách kiểm lại** | Chỉ số chính: tỉ lệ nghiệm thu sai (CTO "đạt" khi lỗi cài còn nguyên), ghép cặp, McNemar và CI Clopper–Pearson. Chỉ số phụ: token có trọng số (thước đo chính về chi phí, nhưng không so trực tiếp giữa hai model khác giá), USD (phân tích phụ, ngoài họ Holm), thời gian, test ẩn. Có 5 điểm dừng khai báo trước (S2 Phần 3, gồm ngưỡng 2× USD và 0,10; đây là lựa chọn thiết kế, chưa suy ra từ dữ liệu). Đăng ký `preregistration.md` §9 trước lượt đầu. |
| **7. Rủi ro / dữ liệu** | (a) Lỗi cài không đại diện lỗi tự nhiên (B-12 trường 7). (b) Tên pha và cú pháp `phaseModels` cho bench (`bench.ts:125`) chưa được Phòng Dev xác nhận. (c) Tốn hạn mức vì Opus đắt gấp đôi. Bài tổng hợp, không có dữ liệu thật. |
| **8. Ưu tiên** | Chưa chấm; công sức 3. Đề xuất số 3 cho Phòng Dev, chỉ sau khi giám đốc duyệt (a-brief) và mở đo B-12. |
| **9. Giám đốc duyệt** | **Có**: duyệt (a-brief) (B-11), mở đo B-12, và chi phí Opus. |

### B-17 — Model lập kế hoạch theo độ khó (vòng 4 gói 3; 3/11/2026; @research-lead) — **D9** (sau công tắc, mặc định tắt; trước 3/11: hoãn)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Tài liệu đề xuất bước định tuyến chấm độ khó 1–3, mức 1 dùng Sonnet và mức 3 dùng Opus để lập kế hoạch (dòng 286–287). |
| **2. Bằng chứng** | Đã có một phần: làn nhanh dùng `fastLane.planModel` cho pha plan (`orchestrator.ts:1399`, `:1520`), nhưng không có thang độ khó. Không có dữ liệu benchmark: ảnh chụp không có `model` (C-0), và B7 không có lượt plan (T-2). |
| **3. Nguyên nhân gốc** | Không áp dụng: chưa có số đo. |
| **4. Thay đổi đề xuất** | **D9 (quyết định của giám đốc 3/11):** chọn model lập kế hoạch theo độ khó 1–3 từ tín hiệu tất định của bộ chọn làn, sau công tắc, mặc định tắt (`BRIEF-D9.md` mục 9). Đo hiệu quả khi B-13 đã ghi `model` theo pha và có lượt B-15 trên bài lớn. |
| **5. Hiệu quả kỳ vọng** | Chưa ước lượng được. |
| **6. Cách kiểm lại** | Khi mở lại: A/B pha plan theo độ khó trên bài lớn; dùng token có trọng số, USD (phụ) và tỉ lệ kế hoạch qua cổng B-10. |
| **7. Rủi ro / dữ liệu** | Chấm độ khó sai làm kế hoạch yếu ở việc khó. Không đụng dữ liệu. |
| **8. Ưu tiên** | D9 (trước 3/11: hoãn). |
| **9. Giám đốc duyệt** | Có, nếu làm. |

### B-18 — Sandbox cấp hệ điều hành cho hook (vòng 4 gói 7; 3/11/2026; @methodologist) — **D10** (đặc tả xong, mặc định tắt)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Hook `claude-guard.ts`/`guard-paths.ts` chỉ kiểm theo mẫu chuỗi (`paper.md` §4.2, §8.2); agent cố tình vẫn có thể lách (tiến trình con, mã hóa lệnh). |
| **2. Bằng chứng** | Mô hình mối đe dọa T1–T4 kèm `tệp:dòng` thật ở `sandbox-spec.md` §a. Chưa có số đo lách thực tế: bộ test đối kháng (§e) chưa chạy. **(R18)** Trục 2 phần (b), [Mô tả]: trên 82 lệnh Bash một dòng của RedCode-Exec, tầng `full` chỉ chặn 30/82 = 36,6 % [26,2; 48,0] % (`results/axis2-guard/report.md`); đây là số về chính sách tĩnh, không phải số đo sandbox. |
| **3. Nguyên nhân gốc** | Hook chạy ở cấp ứng dụng, không có ranh giới hệ điều hành. Tài liệu chính thức nói Claude Code không sandbox lệnh trên Windows native (`sandbox-spec.md` tóm tắt, S-01, S-02). |
| **4. Thay đổi đề xuất** | Hook giữ nguyên làm lớp 1; sandbox là lớp 2 sau khóa `runtimes.claude-cli.sandbox.enabled`, mặc định `false` cho tới khi giám đốc duyệt. Linux: sandbox có sẵn của Claude Code (mức A), mức B nếu cần bọc cả hook. Windows: WSL2 + sandbox có sẵn là ứng viên chính, AppContainer/Job Object + ACL là dự phòng (cổng G1). Bật khóa mà không có sandbox thì từ chối chạy. Ngoại lệ mạng duy nhất: kết nối của `claude-cli` tới endpoint Anthropic (`sandbox-spec.md` §c). Không dùng 9router hay khóa API ngoài. |
| **5. Hiệu quả kỳ vọng** | Giảm rủi ro đọc `.env`, ghi ngoài worktree, mạng và lách hook; không có số ước lượng. Chi phí khởi động đo theo `sandbox-spec.md` §f (ngưỡng là giả định). |
| **6. Cách kiểm lại** | Bộ test đối kháng E1–E4 và hồi quy E5 (không chặn nhầm `checkCommands`) ở §e; đo thời gian khởi động ở §f. Dev làm spike G1 (§d.0) trước khi viết mã. |
| **7. Rủi ro / dữ liệu** | Nhãn **Nội bộ**. Đánh giá 5 lớp/25 năng lực ở `docs/data-protection-assessment.md` mục "B-18 Sandbox cho hook" (không chép lại ở đây). Nhật ký `sandbox.deny` chỉ ghi `tool`, `rule`, `backend`. Rollback: `sandbox-spec.md` §g. Nhiều thông số còn `[CHƯA KIỂM CHỨNG]`, Dev phải đo ở spike. |
| **8. Ưu tiên** | D10; công sức 4. Chưa chấm hiệu quả. |
| **9. Giám đốc duyệt** | **Có**: duyệt bật khóa, chọn đường Windows sau spike G1. Mặc định tắt. |

### B-19 — Triển khai vòng tự cải thiện RQ5 (vòng 4 gói 7; 3/11/2026; @research-lead) — **đã làm** (holdout khóa lại `84ded09`; mặc định tắt)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | `self-improvement/design.md` có thiết kế 7 bước nhưng chưa triển khai; nhật ký sự cố (B-03) đã có nhưng chưa có gì dùng nó làm đầu vào. |
| **2. Bằng chứng** | B-03 đã làm (`d9-implementation-2026-11-03.md` §3.3). Chưa có lượt chạy vòng nào; mọi số ở dưới là giả định hoặc tính trước. |
| **3. Nguyên nhân gốc** | Không áp dụng: đây là hạng mục triển khai. |
| **4. Thay đổi đề xuất** | Module `src/selfimprove.ts` và khóa `selfImprove.enabled: false`. Bảy bước (sự cố → gom nhóm → đề xuất bản vá → A/B → giám đốc duyệt → áp dụng → theo dõi/rollback), mỗi bước đủ 8 trường ở `implementation-spec.md` §3. Không bước nào tự áp bản vá; áp dụng và rollback cần sự kiện duyệt của giám đốc. Vòng không sửa hook hay chính sách dữ liệu. |
| **5. Hiệu quả kỳ vọng** | Chưa ước lượng. Cỡ mẫu: sàng lọc r = 3 (60 lượt), xác nhận r = 8 (160 lượt) trên bộ giữ lại 10 bài; tính với τ² = 0, nên dừng xác nhận nếu τ² ≥ 0,0005 (`implementation-spec.md` §2). |
| **6. Cách kiểm lại** | Test chấp nhận (CT-01…CT-20) ở `implementation-spec.md` §6. Ngưỡng hiệu ứng theo `design.md` §5.3 (giả định do giám đốc chốt); Holm trên ba chỉ số chính. |
| **7. Rủi ro / dữ liệu** | Nhãn **Nội bộ**; sự cố từ nhiệm vụ Bảo mật/Hạn chế bị loại (§5 của đặc tả). Hai điều kiện chặn của S2a (bài có `starter/` hay `repo/`; cờ `leak` khi chưa có sandbox) cần Dev xử lý trước lần A/B đầu; B-18 giảm rủi ro `leak`. Khi D10 hiện thực hóa thì thêm mục "B-19 Vòng tự cải thiện" vào `data-protection-assessment.md`. |
| **8. Ưu tiên** | D10; công sức 4. Chưa chấm hiệu quả. |
| **9. Giám đốc duyệt** | **Có**: bật khóa, chốt ngân sách và ngưỡng, duyệt từng bản vá và từng rollback. |

---

## 6. Quan hệ với đăng ký trước và các giới hạn

**Quy ước mã (R8):** cột "Bộ đo giám đốc" dùng H1–H10 của `bench/vs-claude/analyze.mjs` (hệ chính). Cột "Bản 1" dùng ĐK-P1–P9 (= H1–H9 của `preregistration.md` bản 1, đổi mã theo H_i → ĐK-P_i; **một quy ước duy nhất `ĐK-P_i` ở cả hai tệp**, để khỏi lẫn với bản vá prompt P1–P4 và mức ưu tiên SR P0/P1/P2). Ánh xạ chính thức ĐK-P↔H và giả thuyết B-01/B-02 mới do S4 chốt trong `preregistration.md` bản 2; bảng dưới chỉ là đề nghị từ phía backlog.

| Mục | Bộ đo giám đốc (hệ chính) | Bản 1 (ĐK-P_i) | Ghi chú |
|---|---|---|---|
| B-01 | H5 (`analyze.mjs:80-85`), H1, H2 (`:61-68`), H6 (`:86-91`), H10 (`:108-115`); **giả thuyết B-01 mới** (TOST ±15 % so với A0-sonnet: token có trọng số, thời gian thực, điểm; S4) | ĐK-P1–P6; ĐK-P9 (tương đương ±15 %) ánh xạ sang giả thuyết B-01 mới | Ngưỡng `k₀ × a₀` (= T* ≈ 152 s) lấy từ C7 nên **không** dùng C7 để "xác nhận" chính nó. H10 dùng `size` làm biến giải thích: xem thẩm định của S1 trước khi dùng H10 để hiệu chỉnh ngưỡng `parts` |
| B-02 | H8 (`:96-100`), H3 (`:69-75`), H7 (`:92-95`); **giả thuyết B-02 mới** (cổng chặn ca "đỏ kéo dài + bỏ sót phần việc"; S4) | ĐK-P3, ĐK-P7 (bài giữ lại t6–t8, xác nhận); KPI | Ca chuẩn để phát lại: `t5-logq.ccoding-fastlane.2` (§4.1 bước 2). Giả thuyết B-02 mới dùng quy tắc "lệnh đề bài đòi xanh còn đỏ ⇒ vòng sửa" (§4.1) và quy tắc phủ B-10 |
| **B-10** | **H8** (`analyze.mjs:96-100`) — đúng loại lỗi "requirements dropped"; phán quyết hiện chỉ dựa `formatMiss` nên chưa bắt được ca coding kiểu t5 (§5 B-10 trường 6) | ĐK-P3 (test ẩn không kém hơn) | Phát lại offline trên `results/C*/` không tốn hạn mức 5 giờ; nên chạy trước mọi vòng LLM. Chung giả thuyết B-02 mới |
| B-03…B-09 | — | — | KPI, đếm log, test đơn vị. Không cần benchtest, trừ B-03/B-07 (F1) và B-09 |
| **B-13…B-17** (R14) | Không có giả thuyết H_i tương ứng | — | Mọi phép đo mới (B-14 bước 2, B-15, B-16) phải ghi dòng §9 trước lượt đầu. USD và hệ số cacheRead 0,05 chỉ là phân tích phụ, ngoài họ Holm (§9 V4-03) |
| **B-18, B-19** (R15) | Không có giả thuyết H_i tương ứng | — | B-19 dùng bộ giữ lại 10 bài đã khóa hash (`holdout-lock.json`), tách khỏi t1–t5 và g1–g6. D7: các bài đó chỉ dùng để chẩn đoán ở bước 2; cả hai pha A/B chạy trên bộ giữ lại và kết luận chỉ lấy từ pha xác nhận. Đây là điểm siết chặt hơn `design.md` §5.4. Phép đo của B-18 là bộ test đối kháng, không phải benchmark. Mọi phép đo mới phải ghi dòng §9 của `preregistration.md` trước lượt đầu |

**Giới hạn và kết quả âm tính**
- N3b, N5 **không kiểm được** từ CSV; N4 kiểm gián tiếp. Phép kiểm cần dữ liệu từ API `kpi`.
- N1 là phân loại tĩnh theo văn bản lệnh (CSV có thể cắt lệnh dài; 1 lượt không giải thích được). Chưa phát lại qua hook thật.
- `tail -c` (N1c) **sai**; N2 chỉ chứng minh chắc 1/10 lượt chặn nhầm.
- Hồi quy thô ở §2 chỉ có 5 điểm, mỗi điểm 1 lượt làn nhanh; không có CI. `a₀, k₀` ước lượng trên chính C7. C8 không có Sonnet đơn (D1) nên không dùng được cho `a`.
- t2 52/60 là 1 lượt; C8 3/3 sau `c55a249` không kết luận được.
- **(R8)** B-10 và sửa §4.1 dựa trên **1 ca** (t5 C9 lượt 2). Nguyên nhân "plan hỏng một phần / `parsePlan` cắt" chưa kiểm vì `calls.jsonl` nằm trên server cloud, không có trong repo. C9 dừng giữa chừng do hạn mức (`context/c9-partial-2026-11-02.md` §1), nên tần suất của loại lỗi này chưa ước lượng được.
- **(R8)** `context/c9-partial-2026-11-02.md` §2 ghi 51 test hỏng đều thuộc nhóm tổng hợp; tạo phẩm cho thấy 37 tổng hợp + 14 CLI (§5 B-10 trường 2f). Kết luận không đổi (cả hai là đích không ai nhận).
- Số "hiệu quả kỳ vọng" ở B-02…B-10 là giả thuyết; chỉ B-01 có số đo nền, B-02/B-10 có thêm 1 ca chất lượng.
- Nếu S1 đổi số ở T-d (3) (D2), peer-reviewer sửa tại chỗ; script `lane-threshold.mjs` đọc thẳng `runs.csv`, không phụ thuộc `token-analysis.md`.
- Bảo vệ dữ liệu: tài liệu này nội bộ, không chứa DLCN hay bí mật; CSV đã thay đường dẫn bằng `<ws>/<home>/<proj>`. Đường dẫn máy cloud trong tạo phẩm C9 (`/home/claude/…`) không được chép vào tệp này. Không cần đánh giá bảo vệ dữ liệu riêng; các mục B-04, B-08 chạm biên bảo mật nên cần giám đốc duyệt và bộ test ác ý.
- **(R18)** Thứ tự ở §0.1 (b) xếp theo mức bằng chứng do trưởng phòng đặt (M1–M4), không phải điểm H/E của §0; hai thang không cộng được với nhau. Kết quả E7 và trục 2 (b) là [Mô tả] ở các phần ngoài phép kiểm chính; không dùng chúng để đổi mặc định khi chưa có đăng ký trước mới. §0.1 không chép tệp từng lượt của P hay lệnh thật chưa che; chỉ số tổng hợp.

## 7. Tái lập

```
node docs/research/context/failures-count.mjs                     # N1–N5: đếm theo loại, vai trò, công cụ, phân loại tĩnh
node docs/research/context/failures-count.mjs --list git-read-deny  # liệt kê (đổi tên category cho nhóm khác)
node docs/research/context/failures-count.mjs --ro-other           # lượt chỉ đọc chưa giải thích
node docs/research/context/lane-threshold.mjs                      # §2: C7 Sonnet đơn so với làn nhanh, hồi quy thô, k
```
Môi trường: Node ≥ 22, không phụ thuộc ngoài. Hai script nằm ở `docs/research/context/` (thêm mới, không sửa tệp thuộc S1).

Bằng chứng R8 (B-10, §4.1 bước 2) đọc trực tiếp bằng Read/Grep, không cần script: `bench/vs-claude/results/C9/t5-logq.ccoding-fastlane.2/{ccoding-task.json,result.json,grade-hidden.tap}`, `bench/vs-claude/results/C9/t1-duration.ccoding-fastlane.3/{ccoding-task.json,result.json}`, `bench/vs-claude/analyze.mjs:96-100`, `bench/vs-claude/lib/grade.mjs:26-41`.

Nguồn của §0.1 (R18) đọc trực tiếp, không chạy script: `bench/vs-claude/results/{b14-step2,gates-main,b15f-main,e7-cto,e8-parallel,axis2-guard,p-parallel}/` (report và RUNLOG); mã commit bằng `git log -1 --format='%h %ci' <hash>`; trạng thái D15 bằng `git log --oneline --grep=D15`; `authSource` trong `src/` bằng tìm chuỗi (0 kết quả, 14/11/2026).

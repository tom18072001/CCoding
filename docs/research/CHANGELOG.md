# CHANGELOG v1 → v2 (T-20261102-121636-dd9)

> Cơ sở so sánh: v1 = commit `d363534`. v2 = nhánh nhiệm vụ đến S5 (`23350b9`) cộng sửa nhất quán của S6.
> Nguồn dữ liệu C1–C7: `perf/vs-claude-loop` commit `7fa6305` (hash ghi ở đầu `performance/token-analysis.md`).
> Mã R1 = `dev-review.md` §7. BRIEF-2 = `BRIEF-2.md`. T-x = bảng trong `performance/token-analysis.md`.
> Toàn bộ kết quả RQ3 là **minh họa**: n nhỏ, C7 chỉ 1 lượt làn nhanh và 2 lượt Sonnet mỗi bài, 8 phép kiểm định không hiệu chỉnh bội.

## Vòng 4, gói 15 (T-20261114-153056-f45, BRIEF-21, 14/11/2026): bài báo v0.7.1 sửa theo phản biện K4

Nguồn phát hiện: `context/k4-v07-review-2026-11-14.md` (Phần A, B, C). **Không số đo nào đổi giá trị.** Số dòng `paper.md` bên dưới là dòng của v0.7.1 (không đổi so với v0.7, vì mọi sửa nằm trong dòng sẵn có).

**Số và trích dẫn sửa theo nguồn (mỗi dòng: vị trí, giá trị cũ → mới, nguồn):**

- `paper.md:505` (Bảng 16, G-3, cột Nguồn): "R20:57, :67, :118" → "R20:57, :67". Nguồn: `results/g-mutation/RUNLOG.md:57`, `:67`; `:118` là hàng "Tất cả" (A-F1).
- `paper.md:558` (E8, giới hạn (5)): "R27:61, :5" → "R27:33–35, :5". Nguồn: `results/e8-parallel/report.md:33–35` (17/18, 0/18, 0 lượt chia dưới 2) (A-F2).
- `paper.md:558` (E8, giới hạn (6)): "R27:62" → "R27:61". Nguồn: `results/e8-parallel/report.md:61` (máy chủ lẫn với arm) (A-F2).
- Số đã có trong nguồn, thêm vào chỗ chưa ghi (không phải số mới): 52/82 do `not-read-only` (`results/axis2-guard/report.md:26–33`); G-1 0/239 CP [0; 1,5 %] (`results/g-mutation/RUNLOG.md:55`, `:92`); E5′ Δ điểm −0,000, pass 20/20 và 19/20 (`results/b15f-main/report.md:11`, `:15–16`); B-16 0/0, 23/64 so 1/64, USD ×1,49 (`results/gates-main/report-e4.md:29–31`); B-14 R̂ 0,999 [0,886; 1,127], power 0,38 (`results/b14-step2/report.md:17–22`).

**Chữ và nhãn (không đổi số):** §1 VI/EN (nhãn token E8 là thước đo phụ; giới hạn 52/82 của `git-read`; "đo ở trạng thái cuối" của G-1; nhãn và phạm vi E5′; tên trục 3 "tên câu hỏi, không phải kết luận"); §2 (C7 là vòng thăm dò); quy ước nhãn ở đầu bài và §6; §6.2 (C6 "chất lượng như nhau ở 8/8 lượt"); §6.2.5 (tiêu đề và câu chẩn đoán cache hạ về [Mô tả], n = 1; bước 2 đã chạy); §6.3.1 (Bảng 16 hàng E7 Youden; "đi kèm" thay "đến từ"); §6.3.2 (Bảng 17 hàng `git-read`; đoạn Luật Bảo vệ dữ liệu cá nhân theo `context/nd356-2025-note.md` §8: Luật 91/2025/QH15, hiệu lực 01/01/2026, điều về thông báo vi phạm **[CHƯA KIỂM CHỨNG]**, vẫn không khẳng định mốc 72 giờ chung); §6.3.3 (Bảng 18: P-2, E8 token; "máy chủ lẫn với arm"); §6.4 ("Đọc đúng mức": điểm "không phân biệt được", power 0,38); §7 (điểm chạm trần không phải "không có lợi thế"; B-14, B-16, E4 cập nhật; C7 t2 chỉ minh họa); §8.3 (P chưa được người ngoài tái lập); §9 (hàng RQ2/trục 2, E8, RQ4, RQ5 chẩn đoán cache, việc còn lại); §10 (thêm Guo et al., 2024 và Quốc hội, 2025); Phụ lục A (nhãn R1–R32); Khai báo AI (vòng 4 gói 15).

**Tệp nguồn sửa chữ (không đổi số đo):** `v07-axes-threats-draft.md` (câu cấm #8, #10 sửa; thêm #21–#26); `run-plan.md` (KPI là giả định của phòng, chờ giám đốc duyệt; hai đường dẫn máy → `<tmp>`, `<worktree>`); `bench/vs-claude/results/e8-parallel/report.md` (câu "không giảm token" → "không phát hiện được thay đổi token"; lời khuyên là [Khám phá], một bài); `RUNLOG.md` của `p-parallel`, `e7-cto`, `local-3e`, `b15f-main` (bỏ đường dẫn máy); `context/d11-baseline/{b7prime,study-cloud}/report.md` và `analysis/cache-diagnostic-result.md` (bỏ đường dẫn máy, phát hiện thêm C-12, C-13).

## Vòng 4, gói 14 (T-20261114-133920-30b, BRIEF-20, 14/11/2026): bài báo v0.7 dựng quanh ba trục, trục 2 (b), kiểm số

Không gọi LLM, không chạy benchmark, không sửa `src/` hay mã `bench/` (chỉ RUNLOG). Bảng kiểm từng số: `analysis/v07-number-check.md`.

- **K1 — `paper/paper.md` v0.7:** đóng góp dựng lại quanh ba trục (nghiệm thu bằng kiểm chứng thật; khung quản trị; song song), mỗi số có nhãn [Xác nhận]/[Mô tả]/[Khám phá] và giới hạn. Thêm §4.3(d), §6.3 (Bảng 16–18), §6.4 (Bảng 19: E5′, E6, B-14 bước 2), §8.3 (i)–(vi) (gồm việc 16 cặp E7 phân loại lại sau khi đã thấy kết quả), hàng mới ở §9, R20–R32 ở Phụ lục A. Danh sách số: `paper/v07-number-list.md`.
- **K2 — trục 2 (b):** `guardDecision` trên 82 lệnh Bash một dòng của RedCode-Exec: `git-read` 82/82 [95,6; 100] % (52/82 chỉ vì vai chỉ-đọc), `full` 30/82 = 36,6 % [26,2; 48,0] %. Nhãn [Mô tả]. Phần (a): chưa đo. Commit khóa danh sách `74f11d99`, commit kết quả `6dac52c8`.
- **Pháp lý:** Nghị định 356/2025/NĐ-CP (hiệu lực 01/01/2026) thay vì Nghị định 13/2023/NĐ-CP; số hiệu, ngày ban hành và ngày hiệu lực xác nhận từ cổng chính thức, **nội dung điều khoản [CHƯA KIỂM CHỨNG]** (PDF không có lớp chữ). `paper.md` v0.6 không nhắc Nghị định 13, nên đây là thêm mới ở cuối §6.3.2.
- **S6 — sửa khi kiểm số:** (1) `paper.md` §8.3 (v): bỏ "ghim lại lúc 10:43", vì `e7-cto/RUNLOG.md` không ghi giờ ghim (chỉ có phát hiện 10:37 UTC); sửa tương ứng ở `v07-number-list.md` A16. (2) `results/g-mutation/RUNLOG.md` dòng 58: CI G-3Δ [−4,7; +7,4] → [−5,4; +8,8] (kèm ghi chú bản đầu), theo `analysis/v43f-rerun.md:237`. (3) `facts.json`: thêm 17 mục số v0.7 (G-3Δ CI, E7, E8, B-14 bước 2, E5′, E6, đường găng P, trục 2 (b), Nghị định 356/2025) và dời ngoại lệ `c1c8-single-labeller` từ dòng 576 sang 667 (dòng của `paper.md` đổi vì chèn v0.7). (4) `preregistration.md` §9: chèn dòng sai lệch tham chiếu pháp lý Nghị định 356/2025 (S1 soạn) sau dòng sai lệch của S2, trước §10; không sửa chữ nào ở trên.
- **Kiểm tra:** `consistency-check.mjs` đạt 52 tệp; `npm run typecheck` exit 0; `npm test` 458/461 đạt, 3 bỏ qua, 0 lỗi.
- **Sau khi gộp (người điều phối, 14/11/2026):** đọc được toàn văn Nghị định 356/2025/NĐ-CP trên Cơ sở dữ liệu quốc gia về văn bản pháp luật (vbpl.moj.gov.vn); Điều 42 k1–2, Điều 8 k3, Điều 29 k1 điểm a, Điều 17, 18, 19 khớp nguồn thứ cấp. `paper.md` §6.3.2 bỏ nhãn [CHƯA KIỂM CHỨNG] cho các số điều đó (ghi chưa đối chiếu bản ký số trên Công báo), sửa tương ứng ở đầu bài, §9(c) và Khai báo sử dụng AI; `context/nd356-2025-note.md` thêm §0; `preregistration.md` §9 thêm dòng cập nhật, không sửa dòng đã đăng ký.

## Vòng 4, gói 13 (T-20261112-235700-08d, BRIEF-19, 13/11/2026): thẩm định G, P, E4, E5′, E6 và bản chốt E7/E8

Không gọi LLM, không sửa `bench/`, `src/`. Không dùng điểm của B-14 bước 2, E7, E8. Chi tiết: `context/v43f-review-2026-11-12.md`.

- **K3** (thẩm định thiết kế bản chốt E7/E8): 12 điểm, 5 đạt, 7 đạt có điều kiện, 0 lỗi thiết kế; không sửa bản chốt; thêm tiểu mục "Thẩm định bản chốt E7/E8" ở §9. Commit `cc758d3` (gộp `2ef7b51`). Bổ sung E8/`t5-logq` ở mục K3.5 (S5): σ_ln 0,178 df 24 dựng lại được; làm tròn 10 s chỉ hạ σ 3–7 %; power σ = 0,4 là 0,73–0,75 (không 0,77); 2 mục lỗi `t5-logq` của E7 đạt 146 test.
- **K1b** (đăng ký trước phép đo trục 2, quản trị): thêm mục "Đăng ký trước trục 2" ở cuối §9, chưa có số kết quả. Commit `9482684` (gộp `d8727ce`).
- **K1** (thẩm định G, P, A1–A5, ba phát hiện): chạy lại G, E4, E5′, E6 khớp báo cáo, lệch 0; **P không tái lập được** (dữ liệu ở máy giám đốc). Sửa `g-analyze.mjs` (CI G-3Δ [−4,7; +7,4] → [−5,4; +8,8], bội số bài ở bootstrap) và `p-analyze.mjs` (đếm lệnh đỏ theo nhiệm vụ, thêm CP, theo phòng, đường găng); không sửa `e4-analyze.mjs`, `e5f-analyze.mjs`, `h6-sensitivity.mjs`. G-a không kiểm chứng được bằng git (tác động 0); P-a không đổi thước đo ngoài lệnh đỏ nhưng làm sau khi thấy 11/47. Ghi sai lệch ở hai mục §9 ("Đăng ký trước V4-3f", "Phân tích E4, E5′, E6…"). Commit trước sửa `9c6e0de`, sau sửa `5c48f44` (gộp `c0680f4`); S4 `2916d69` (gộp `f001857`); ghi §9, K1 và dòng này ở commit của hạng mục S5 (mã ghi ở báo cáo bàn giao).

## Vòng 4, gói 12 (T-20261104-135425-669, hạng mục S2, 4/11/2026): bài báo v0.6 — Bảng 10 theo bảng "sau D12", E3 ở mức quy trình

Căn cứ: bảng "trước D12 → sau D12" (`context/d12-stats-fixes-2026-11-04.md` mục 2, nguồn chuẩn duy nhất; ghi tắt D12-§), `context/d12-stats-fixes-2026-11-04.n2-review.md`, `bench/vs-claude/results/local-3e/RUNLOG.md` (chỉ mục "Nguồn p của H6 cho E6"; bỏ qua mọi dòng kết quả E3, E4), `preregistration.md` §9 V4-3e-E5′ (dòng 560–585) và đầu `bench/vs-claude/results/b15f-main/RUNLOG.md`. Không chạy lệnh nào, không chạy benchmark, không sửa `src/`, `bench/`, `preregistration.md`. `consistency-check` do S5 chạy.

**Số đổi ở `paper/paper.md` (cũ → mới; mã K2; nguồn):**

| Vị trí | Khóa `facts.json` | Cũ → mới | Mã K2 | Nguồn |
|---|---|---|---|---|
| Bảng 10, H7 (B0) | `d12-h7-b0-ratio`, `d12-h7-b0-dropped` | SD gộp 0,00 trên 13 bài, nhãn cũ SUPPORTED → 0,00 [0,00; 0,00] trên 2 bài, 16 bài bị loại vì r < 5, nhãn "chưa đủ dữ liệu" | A-1 | D12-§2.1 (H7), §2.3 |
| Bảng 10, H7 (B6, B7; chỉ đối chiếu) | `d12-h7-b6`, `d12-h7-b7` | SUPPORTED/not supported trên 13–18 bài → B6 5,87 [0,00; 10,17], 5 bài; B7 1,55 [1,55; 1,55], 5 bài; cả hai "không kết luận" | A-1 | D12-§2.1 (H7) |
| Bảng 10, H3 | `d12-h3-recall-p` | nhãn "insufficient data" → "không kết luận"; p recall 1,0000 (mới) | P-1 | D12-§2.1 (H3) |
| Bảng 10, dòng Holm | `d12-holm-k` | K = 0 "họ rỗng" → K = 1 (chỉ H3, p = 1,0000, Holm không bác bỏ). Giữ K = 0 theo R4; kết luận "không giả thuyết nào xác nhận" không đổi | P-1 | D12-§2.1 (dòng Holm) |
| Bảng 10, H2 | (giữ `h2-estimate`, `h2-ci-upper`) | **Số không đổi** (+2,8 pp, [0,0; +8,3 pp], 4 bài). Chỉ nhãn của mã: "not supported" → "không kết luận" | A-4, T-1 | D12-§2.1 (H2) |
| Bảng 10, H5 (B0) | — | Số không đổi (mô tả cùng cửa sổ). Nhãn của mã: "not supported" → "không kết luận" | A-4 | D12-§2.1 (H5) |
| Bảng 10, H6 | — | Số không đổi (n = 0, chưa đủ dữ liệu). Chỉ thêm ghi chú CI một tầng "ước lượng (ít bài)" | B-3, C-2 | D12-§2.2 (dòng cuối) |
| Bảng 10, hàng mới H1/H10 (B0, thăm dò) | `d12-h1-b0-after`, `d12-h1-b0-before`, `d12-h10-b0-p` | H1: +2,8 pp [0,0; 9,0], 6 bài (lọc size ≥ 3) → +4,2 pp [0,0; 12,5], 4 bài (danh sách cố định c3, c4, c5, r1), nhãn mã "không kết luận". H10: p hoán vị 0,129 → 0,132 | A-2, A-4, A-5 | D12-§2.1 (H1), §2.2 (H10) |
| Bảng 10, điểm (i): B-01 của `analyze.mjs` (`--b01-arm B7`) | `d12-b01-b7-token`, `d12-b01-b7-time` | token 2,460 [2,070; 3,023] → 2,519 [2,052; 3,131]; thời gian 2,482 [2,079; 3,140] → 2,580 [2,097; 3,242]; cả hai "bác bỏ"; phép (c) R = 1,000 SUPPORTED → "chưa đủ dữ liệu" (0 bài sau khi bỏ trần). `facts.json` giữ `b01-b7-token-analyze` (2,460) và `b01-b7-time-analyze` (2,482) làm số "trước D12" | T-2, T-3, T-6, B-2 | D12-§2.1 (B-01a/b/c, B7) |
| Bảng 10, điểm (i): B-01 của `analyze.mjs` (`--b01-arm B6`) | `d12-b01-b6-token`, `d12-b01-b6-time`, `d12-b01c-b6` | token 3,752 [3,415; 4,290] → 3,934 [3,514; 4,392]; thời gian 3,798 [3,297; 4,622] → 4,074 [3,468; 4,753]; cả hai "bác bỏ"; phép (c) 0,998 SUPPORTED, 5 bài → 0,987, 1 bài sau khi bỏ trần, "không kết luận" | T-2, T-3, T-6, B-2 | D12-§2.1 (B-01a/b/c, B6) |
| Bảng 10, điểm (iii) | — | Ghi cách mã tách "bác bỏ" khỏi "không kết luận"; ghi ngữ nghĩa "bác bỏ" của H1 (A1, A2) còn chờ xác nhận, không chép số H1 của A1, A2 | A-4, B-2 | D12-§2.1, ghi chú đọc số |
| §8.1 (5), (6) | `d12-test-bench` | Bốn chỗ lệch (T-1, B-1, T-2, S-1) từ "phải sửa" thành "đã sửa ở D12, `57148de`"; cổng ≥ 3 bài bỏ cho H3; thêm `test:bench` 245/245 | T-1, B-1, T-2, S-1, P-1 | D12-§1, §3, "Hash và kiểm cuối" |
| Tóm tắt VI/EN, đầu §6, §9 | — | Câu về họ Holm: "rỗng (K = 0)" → "rỗng theo phép kiểm đăng ký; mã sau D12 K = 1 (H3, p = 1,0000)"; H7 "không xác nhận" → "chưa đủ dữ liệu (2 bài)" | P-1, A-1 | D12-§2.1 |

**Không đổi, đã đối chiếu:** Bảng 8, 9 (số R4 và R3), 11–14, mọi số §6.2, H2 (số), H4, H8, H9 (D12-§2.4), H6 (số). Bảng 9 không đổi vì số chính thức của B-01 lấy từ `prereg-tests.mjs` (R4), không phải `analyze.mjs`. Số H6 mô tả "mọi bài" (+0,7 [0,0; +2,4]…, mã T-4) và p hoán vị H10 của các arm khác B0 (A-5) **không có** trong bài nên không thêm; xem D12-§2.2.

**Thêm mới:**
- **§6.1 mục (8)** "E3 và thiết kế lại E5 thành E5′" [Quy trình]: B0 không có pha họp ở cả hai bài lớn nên E5 là ô "thiếu dữ liệu"; E5′ ép làn đầy đủ (B0F, B1F), 40 lượt, dừng 1, dừng 2, kiểm nhiễu, giám đốc duyệt 12:50 ngày 4/11, sổ chạy `results/b15f-main/RUNLOG.md`, chạy sau E6. Khóa `e5p-runs`, `e5p-stop2`. **Không có điểm, tỉ lệ đạt, token hay thời gian của E3, E4; không câu so sánh kết quả; không mở `runs.jsonl` hay tệp điểm.**
- **Phụ lục A:** nhãn **R19** (bảng "trước D12 → sau D12"); R18 thêm "đợt 3e gồm E6 và sổ E5′". Đầu bài ghi v0.6; §9 mục (c) cập nhật E3/E5′ và H6 (T-1 đã sửa).
- `facts.json`: 17 mục `numbers` mới (D12: 15; E5′: 2). Các mẫu cũ không đổi chữ nên vẫn khớp.


**Sửa khi kiểm số (S5), 4/11/2026:** (1) `facts.json`, ngoại lệ của `c1c8-single-labeller`: `line` 573 → 576 (dòng trích câu cũ của §8.1(3) dời 3 dòng do S2 thêm §6.1 mục (8) và R19); trước sửa `consistency-check` báo 1 lỗi, sau sửa "Đạt: 47 tệp". Không đổi số nào trong `paper.md`. (2) Đối chiếu máy: chạy `d12-before-after.sh` (chỉ đọc `study-cloud`, `b7prime`, không benchmark) rồi `d12-diff-rows.mjs`; các số H1, H7, H10, B-01a/b/c của B7 và B6 khớp bảng "sau D12".
**Ẩn danh: chưa làm.** Giám đốc chưa chọn mức trong `context/anonymization-options-2026-11-04.md`; tên tác giả và tên hệ giữ như v0.5.

**Còn mở, chuyển S5 và người phản biện:** (1) ngữ nghĩa "bác bỏ" của B-2 (D12-§ ghi chú đọc số, đề nghị S5b/N-2 xác nhận); (2) D12 nói "24 mã" nhưng liệt kê 23, chưa đối chiếu với K2 mục 2; (3) `d12-diff-rows.mjs` chưa chạy lại trong hạng mục này (người viết không chạy lệnh); (4) các số trong bảng trên chép từ D12-§2 bằng tay, S5 đối chiếu từng ô.

## Vòng 4, gói 10 (T-20261104-110942-567, 4/11/2026): bài báo v0.5 — Bảng 10 sau thẩm định thống kê, chẩn đoán cache (E1), thí điểm cổng (E2) mô tả

Căn cứ: thẩm định thống kê (`context/k2-stats-review-2026-11-04.md`), chạy ca biên (S3b), mô tả E2 (`context/k4-e2-descriptive-b14-step2-n.md`), sổ chạy `b14-diag` và `gates-pilot`. Không chạy benchmark, không sửa `src/` hay mã `bench/`. Mọi số mới có khóa trong `facts.json`.

- **`paper/paper.md` (S5), v0.4 → v0.5:**
  - **Bảng 10** viết lại, mỗi ô một nguồn số. H2: từ SUPPORTED sang "không kết luận" (+2,8 pp, TOST 90 % [0,0; +8,3 pp]; cận trên CI quyết định). H6: rút nhãn SUPPORTED, n = 0 ở A1 và A2, chưa đủ dữ liệu. H7: **không xác nhận**, không ghi SUPPORTED; tỉ số SD gộp 0,00 [0,00; 1,00] là suy biến do trần, phép kiểm đặt sau khi thấy dữ liệu, hai cách đọc ghi trong ô. H3, H4, H8, H9: nhãn mã "chưa đủ dữ liệu", kèm lý do đăng ký (H3 suy biến do trần; H4, H9 mô tả một bài; H8 đổi thước đo). Thêm 5 điểm đọc kèm, nêu nguồn chính thức (script ngoài cho B-01, H3, H5, H7; mã mới cho H2, H6, H8, H9) và hai chỗ lệch giữa hai script.
  - **§6.2.5** thêm đoạn chẩn đoán cache: đổi bộ công cụ cho h = 0,00, đổi thư mục làm việc vẫn h = 0,98; chưa đo mức tiết kiệm; bước 2 đã được đăng ký trước.
  - **§7.4** cập nhật B-14; thêm đoạn "Thí điểm cổng chất lượng (E2): chỉ mô tả" (q̂ 0/4 [0,00; 0,60], 0/3 [0,00; 0,71] khi bỏ 6 lượt; chi phí; 6 lượt "lỡ thấy điểm"; không câu nào về recall); mục (c) thành "Những gì chưa có".
  - **§8.1** sửa (5) cho H6 n = 0; thêm (6) khai báo sai lệch H7 và các chỗ lệch mã–đăng ký, (7) lỡ thấy điểm; mục cũ (6) thành (8).
  - **§9** cập nhật nhóm (b), (c); Tóm tắt VI/EN cập nhật câu về họ Holm. Đầu bài ghi tên bản v0.5.
  - **Giữ nguyên:** Bảng 8, 9, 11–14 và toàn bộ số của §6.2.
- **`facts.json` (S5):** thêm 27 mục `numbers` cho `paper/paper.md` (E1: 6; E2: 14; H2: 2; H7: 3; B-01 hai script: 2).
- **Rà ẩn danh (sửa theo review):** thân bài không còn đường dẫn `docs/`, `bench/`, `AN/`, `SCF/`, mã BRIEF hay mã S2/S3; tệp nội bộ đổi thành nhãn R1–R18 và gom ở Phụ lục A (mục "Tái lập") của `paper/paper.md`. Nhãn "V-BRIEF" đổi thành "V-đầu vào". Mẫu `prereg-keys-kept` trong `facts.json` đổi theo chữ mới. Còn giữ: tên hệ CCoding (đối tượng của bài), mã backlog B-xx và mã thách thức C-xx (đã định nghĩa trong bài), đường dẫn mã `src/…` và tên script `*.mjs` — chờ Tom quyết có ẩn nốt khi nộp.
- **Chưa làm, ghi để S6:** chạy `consistency-check.mjs` để xác nhận 27 mẫu mới và mẫu đã đổi khớp (chưa chạy được).
- **Quy ước tên:** giữ tên arm của v0.4 (A0-sonnet = agent đơn; B0 = đủ phòng; B6 = làn nhanh; B7 = làn đơn); B7cab = làn đơn có cổng chất lượng; B7cabO = biến thể của B7cab, CTO nghiệm thu bằng Opus.

## Vòng 4, gói 6 (T-20261103-195822-b03, 3/11/2026): sửa câu lỗi thời, tách "đã sửa / đang làm ở D9 / cần đo"

Căn cứ: quyết định của giám đốc 3/11 19:56 ("đã là đề tài thì phải fix hết, không để đề xuất sửa"); `BRIEF-D9.md` (`90cd913`). Không chạy benchmark, không đổi số liệu §6, không sửa `src/` hay `bench/`.

- **`paper/paper.md` (S1):** thay câu "l1-modules, l2-chain chưa có `task.json`" ở tóm tắt, ô H6, P-09, §7.3, §7.4, B-15, §8.1(5), §9 bằng "đã có từ 3/11 (D8 `3ff7df3`), chưa đo". MAST ghi "đọc thân bài v3, chưa đọc phụ lục" (`related-work.md` §2.12). §7.4 và §9 "Trước khi công bố cần" viết lại thành ba nhóm: (a) đã sửa, kèm commit và dòng mã; (b) đang làm ở D9 (B-03, B-07, B-08, B-09, B-12, B-13, B-14, B-16, B-17); (c) cần đo (B-14, B-12, B-15, H6 trên T5/l1/l2, B-16, nhãn người). B-12, B-14, B-16 ghi "D9 → sau đó cần đo".
- **`improvement-backlog.md` (S2, áp dụng bởi S3):** bảng §0 có thêm cột Trạng thái và Ghi chú trạng thái (đã làm kèm commit / D9 / cần đo / cần giám đốc duyệt); mục chỉ còn đo ghi số lượt theo đặc tả (B-12 25–46 lượt, B-14 ≤ 8 lượt, B-15 40 + 6 lượt, B-16 12 cặp); B-14.2 và B-17 ghi "chưa có đặc tả số lượt". Tiêu đề §5 của B-09, B-12…B-17 và các câu "bị chặn", "hoãn", "không làm trong vòng này" được thay bằng trạng thái hiện hành. Bản vá do S2 soạn (`.ccoding/…/S2-backlog-patch.md`, không vào git) vì S2 không có công cụ Edit.
- **`challenges.md` (S2, S3):** trạng thái kèm commit cho các thách thức đã có bản sửa (P-14: đã có κ, còn nhãn người). S3 sửa số dòng cũ `src/config.ts:285` → `:297` (4 chỗ, L7–L11; dòng 297 chứa `defaults`) và thêm dẫn chiếu cờ "cần xem" `src/orchestrator.ts:1978`.
- **`facts.json` (S3):** ba luật `stale` mới (`l1l2-no-task-json`, `mast-abstract-only`, `b-open-proposal-label`); dời hai ngoại lệ theo số dòng mới (backlog 284 → 285, paper 547 → 563). Không đổi giá trị số nào.
- **Kiểm:** hash và dòng mã đã dẫn kiểm bằng `git cat-file -t` và `sed -n`; ba lệnh kiểm tra của dự án exit 0.

## Vòng 4, gói 5 — Q1 (T-20261103-163327-d48, 3/11/2026): ghi kết quả dừng sớm B7′

- **`improvement-backlog.md` (S1, S2):** B-11.5 có tiểu mục "Kết quả GĐ1" (R̂ token 2,04 [1,45; 2,99], thời gian 2,16 [1,53; 3,21]; > 1,6 ⇒ dừng vô ích, chưa phải kết luận; n = 2 mỗi ô; `1333eef`; CLI 2.1.317) và "Hàm ý" (a)–(c): so mô tả với B7 ×2,498 / ×2,566, ba công tắc chưa đủ ×1,3, ứng viên B-13…B-17 với B-14 phải chạy được trước. Cập nhật ô trạng thái hàng B-11.
- **`preregistration.md` v2.3 (S2):** dòng V4-04 ở §9 (dừng ở GĐ1; CLI 2.1.316 → 2.1.317; B7c hủy trước khi có dòng nào). Sai lệch về thực thi, không đổi giả thuyết hay họ Holm.
- **`paper/paper.md` (S2):** §6.1 mục (7) thay chỗ giữ bằng kết quả [Mô tả]; sửa các câu "đang đo" ở §7.4, hàng RQ3c bảng §9, "Ưu tiên đo tiếp" và "Trước khi công bố cần". Không sửa §4, §8.
- **`facts.json` (S1):** 7 mục `b7prime-*`.
- **Chặn lộ điểm:** không đọc, không nêu điểm hay chất lượng của B7′.

## Vòng 4, gói 5 — Q2 (T-20261103-163327-d48, 3/11/2026): cập nhật §4 Hệ thống sau khi gộp `main`

- **`paper/paper.md` (S3):** thêm §4.3 "Trạng thái hiện hành sau khi gộp `main`" (sau "Nhận xét" của §4.2): (a) sáu ý đã có trên `main` (KPI v2 và bộ probe, thứ tự ghi `reviewerApproved`, lộ trình REA/backlog/Kanban, ngân sách và trần token theo dự án/agent, agent ngoài, giao diện v2), mỗi ý trích về `merge-main-2026-11-03.md`; (b) Bảng 1b tách "đã có trên `main`" / "chỉ trên nhánh" (B-01, B-02, B-04, B-05, B-06, B-10, B-11: chưa triển khai, chờ giám đốc duyệt; B-05 vẫn là giả định); (c) W1–W5 và B7′ đo trước khi gộp, hash theo từng đợt và từng server (`e0bd2f4` máy chủ 7424; `7fb18ba` máy chủ 7425; `1333eef` B7′, CLI 2.1.316 → 2.1.317), nêu rõ hành vi sau gộp chưa được đo. §8.2 thêm một dòng "Hiệu lực mô tả". Không sửa phần khác.
- **`facts.json` (S4):** thêm 10 mục `numbers` cho `paper/paper.md`: 16 commit của `main`, merge `37f88b6`, `npm test` 285/285 (Linux), `e0bd2f4`, `7fb18ba`, `1333eef` (hai chỗ), CLI 2.1.317, n = 2 mỗi ô, R̂ token ×2,04. Đổi ngoại lệ `c1c8-single-labeller` từ dòng 513 → 547 vì §4.3 làm dòng trích dẫn cũ dời xuống; không đổi nội dung câu.
- **Ghi chú đối chiếu:** 285/285 là số của đề bài (Phòng Dev báo, Linux); `merge-main` §6 chỉ ghi 282 đạt/0 lỗi/3 bỏ qua ở lần chạy đầu — cả hai đều có trong §4.3, kèm nguồn. "Trước khi gộp" tính theo nội dung mã máy chủ (không chứa `main`); theo đồng hồ, các lượt B7′ cam kết sau dấu thời gian của merge.
- **Kiểm (S4):** `token-analysis.mjs --check` exit 0 (12 bảng); `stats.test.mjs` 12/12; `consistency-check.mjs` exit 0 (41 tệp). Chặn lộ điểm: grep quanh B7′/B7cab rỗng.

## Vòng 4, gói 4 (T-20261103-150407-7a3, 3/11/2026): đưa nghiên cứu đăng ký trước W1–W5 vào báo cáo khoa học

- **`paper/paper.md` (S1, S2):** §5.1 và §6.1 mới theo nghiên cứu đăng ký trước W1–W5 (440 khóa giữ ở bảng chi phí, 432 lượt ở phép thử xác nhận, 16 lượt loại; Bảng 8–14; mục giữ chỗ B7′ "đang đo", không có số). Các vòng C1–C8 hạ thành §5.2 và §6.2 "Vòng thăm dò", không thuộc phép thử xác nhận. Viết lại Tóm tắt VI/EN, §7, §8, §9. Kết luận âm tính nêu thẳng: B-01 bị bác bỏ cho B7 (token 2,498, thời gian 2,566) và B6 (3,921; 4,047); họ Holm rỗng (K = 0); H3 suy biến, H6 và H7 chưa đủ N; recall cổng B-02 chưa ước lượng được.
- **Kiểm số (S3):** đối chiếu thủ công Bảng 8–14 với `study-cloud-final/{final-extra,prereg-tests-448,step4-extra-448}.md` và `analysis/{b7-cost-decomposition,variance-decomposition,cache-sensitivity,agreement}.md`; chạy lại ba script phân tích ở chế độ in (không ghi đè `results/`), đầu ra khớp. **Không sửa số nào trong `paper.md`.** Số 2,498 (`prereg-tests-448.md`, A0 r4–9) và 2,519 (`step4-extra-448.md`, A0 r1–11) là hai phép so khác nhau của cùng cặp B7/A0; thời gian B7b ×3,96 và ×3,965 khác nhau ở làm tròn.
- **Chưa kiểm lại bằng script:** `final-extra.mjs` lỗi nạp đường dẫn tuyệt đối trên Windows (`ERR_UNSUPPORTED_ESM_URL_SCHEME`), nên Bảng 8 chỉ đối chiếu với `final-extra.md`. `agreement.mjs` không chạy lại vì có đường ghi tệp. Phân rã, tách phương sai, độ nhạy cache và độ khớp chạy trên ảnh chụp 221/240/276 dòng, không phải 448 dòng (đã nêu trong bài).
- **`facts.json`:** thêm 25 mục `numbers` (tỉ số token và thời gian 6 arm so với A0-sonnet ở Bảng 8; B-01 của B7 và B6; độ nhạy cache ×2,55, ×2,73, ×4,03; κ MAST 0,673; PABAK 0,881; 440 khóa; 432 lượt; 0/50 chặn nhầm) và 1 mục `stale` ("do một người gán", ngoại lệ ở dòng 513 là câu trích để ghi nhận đã sửa). `consistency-check.mjs` đạt.
- **Ẩn danh:** grep `paper.md` tìm đường dẫn tuyệt đối, `data/`, handle `@`, khóa, mật khẩu, tên người, khách hàng: rỗng. Từ "giám đốc" là chức danh.

## Vòng 4, gói 2 (T-20261103-101337-870, 3/11/2026) — S5 (@data-scientist): (c) cổng như bộ phát hiện lỗi, κ MAST, phân xử

- **`analysis/agreement.mjs`:** cảnh báo "nghịch lý κ" đa lớp chỉ khi lớp lớn nhất của tham chiếu hoặc dự đoán > 0,9 (theo duyệt thiết kế điểm 3; trước đó áp cả cận dưới 0,1); PABAK đa lớp giữ k cố định khi bootstrap (`kFixed`); thêm `clopperPearson`, `minPositives`, bảng C-0…C-3 (cổng, cỡ mẫu recall) và M-0…M-4 (κ MAST), `--fill`. Bảng A-0…A-3, G-0 không đổi. `agreement.test.mjs`: 12 → 16 test.
- **`analysis/agreement.md`:** hoàn tất §(c) (định nghĩa chốt trước khi tính; kết quả; cỡ mẫu) và §MAST (đối chiếu commit, κ, PABAK, CI theo C-xx, phân xử, giới hạn).
- **Mới:** `analysis/mast-labels-final.csv` (49 nhãn cuối, 13 chỗ lệch phân xử kèm lý do).
- **`challenges.md`:** thêm cột "FM chi tiết" (49 dòng, sau cột Mã); cập nhật đoạn "Phân nhóm" (mục 0), ghi chú dưới bảng đếm mục 3, và P-14 (xử lý phần lớn, ghi phần còn lại). Tiêu đề mục 1.1–1.4 và bảng đếm theo tiêu đề **giữ nguyên**.
- **`improvement-backlog.md`:** thêm **B-12** (đề xuất đo recall của cổng bằng bộ bài cài lỗi; không chạy).
- **`facts.json`:** ngoại lệ của `improvement-backlog.md` đổi dòng 277 → 278 (hàng B-12 ở §0 làm lệch một dòng); `consistency-check.mjs` đạt lại (37 tệp).
- **Chưa sửa (ngoài phạm vi, còn nói "một người gán nhãn"):** `paper/paper.md` (bảng giới hạn, ~dòng 377), `publication-plan.md` (B3, D9), `presentation-notes.md`, `self-improvement/design.md`.

## Vòng 4, gói 2 (T-20261103-101337-870, 3/11/2026) — S2 (@literature-researcher): sổ mã MAST và thống nhất trích dẫn

- **Mới:** `analysis/mast-codebook.md`: 14 kiểu lỗi FM-1.1…FM-3.3 (5 + 6 + 3) theo MAST v3 Mục 4/Hình 1, kèm INF, NA, quy tắc chọn một nhãn; **không chứa nhãn C-xx**. Viết trước khi sửa trích dẫn.
- **`related-work.md`:** §2.12 viết lại sau khi đọc HTML v3 (100.000/160.349 ký tự đầu): mỗi số có mục/bảng. Đã khớp: 14 kiểu/3 nhóm, κ người–người 0,88 (Mục 3.2, "in the final rounds"), o1 few-shot 0,94/0,77/0,833/0,80/0,77 (Bảng 2), ChatDev +9,4 % và +15,6 % (Mục 1/4/5.3; Phụ lục H chưa đọc). **Lệch ghi lại:** Mục 1 gán +9,4 % cho đổi quy trình (CEO quyết định cuối), Mục 4 gán cho đặc tả vai trò; Bảng 2 chỉ có hai hàng (o1, o1 few-shot), không có hàng "zero-shot" riêng. §2.14 Anthropic: đã khớp ≈4×, ≈15× so với chat, 80 % phương sai (BrowseComp), +90,2 % (nội bộ, so Opus 4 đơn), coding ít việc song song (mục "Benefits of a multi-agent system"); thêm đoạn liên hệ hướng với B0/A0-sonnet ×5,68 và làn đơn B7 ×2,50 kèm 5 giới hạn. Thêm nhật ký Q16, F5–F10; sửa dòng F1 và phần "Mức đọc".
- **Nơi xuất bản MAST:** arXiv không ghi venue; ML Anthology ghi NeurIPS 2025; OpenReview bị chặn nên không kiểm. Thống nhất ở `related-work.md`, `references-v2.md`, `paper.md`, `challenges.md`: "NeurIPS 2025" gắn `[V-thứ cấp]`, **bỏ "vol. 38"** (không nguồn nào đã mở xác nhận) và không ghi track; URL chính là trang arXiv v3.
- **URL Anthropic:** một URL duy nhất `https://www.anthropic.com/engineering/multi-agent-research-system` ở `related-work.md`, `references-v2.md`, `paper.md`. URL dạng `…/built-…` (vòng 1) và tiền tố `research` (BRIEF-2) bỏ. Công cụ không xác nhận canonical. `publication-plan.md` và `BRIEF-2.md` (ngoài phạm vi S2) vẫn dùng tiền tố `research`.
- **`paper.md`:** câu "chỉ dùng tên ba nhóm vì chưa đọc toàn văn" (§ Phân tích lỗi) đổi thành dùng tên 14 kiểu theo v3 và sổ mã. Phần nói "một người gán" (dòng bảng giới hạn, §thách thức) **không sửa**: thuộc S5.
- **Không sửa:** bảng C-xx và cột FM, P-14 (`challenges.md`) — việc của S5.

## Gói 3 (T-20261103-021358-275, 3/11/2026)

- **S1 (@data-scientist):** `analysis/prereg-tests.mjs` (+ `prereg-tests.test.mjs`, 13 ca), `analysis/round3-tables.md`, `analysis/excluded-round3.csv`, `analysis/analyze-reconcile.md`: loại lượt Q/L/T (0/197), TOST B-01 trên t1–t5, H5 theo cặp cùng cửa sổ, đối chiếu `analyze.mjs`. Commit 1 (script) `f530e89`, commit 2 (kết quả) `3793f95`.
- **S2 (@methodologist):** `preregistration.md` §8 (ô khóa, hash cửa sổ, hash bộ đo) và §9 (V3-01…V3-12, trạng thái SR); `analysis/validity-round3.md` (8 đe dọa).
- **S3 (@methodologist):** `results-round3.md` (Holm rỗng K = 0; H3 đủ N nhưng không tính p; H6, H7 chưa đủ N; H5 mô tả; **B-01 bác bỏ** ở bản chính và hai bản độ nhạy, (c) không kết luận do trần; B-02, B-10 không đủ dữ liệu, cần B02-M; khuyến nghị: chưa đưa B-01 lên `main`); `preregistration.md` §8 điền ô hash script (ghi sau khi dữ liệu đã có, V3-01). Chưa có dòng V3-13 cho việc áp trần §2.7 trên dữ liệu xác nhận.

## Gói 2c (T-20261102-190653-75b, 2/11/2026)

- **S1 (@methodologist):** `preregistration.md` v2.1 và `suite-review.md`: sửa major H6 chạm trần (tập bài khai báo l1-modules, l2-chain, t1–t5; loại bài mà mọi lượt cả hai arm của cặp đều ≥ 0,99 (sửa ở vòng review 2 từ 1,00; một cặp NA ⇒ p(H6) = NA; p = NA vẫn phán quyết theo CI), giữ bài chạm trần một phía; Δ\* suy biến ⇒ p = NA, "Không kết luận (trần/suy biến)"; < 3 bài ⇒ ước lượng kèm CI 90 %, họ Holm còn H3), H3 chuyển sang hoán vị hai mẫu chính xác C(20, 10) = 184 756 (p_min 1/184 756), cột "Phép kiểm" H3/H6 ghi họ Holm K = 2 nếu SR-26 xong, SR-25 test 9 bỏ câu so sánh T\* − margin; §9 mục 6.
- **S2 (@data-scientist):** `performance/token-analysis.md` và `scripts/token-analysis.mjs`: nhãn "C7" viết cứng đổi thành hằng `SONNET_RD` (= `CONFIG.sonnetRound`), SR-27 mới trong `suite-review.md`; sinh lại T-d (3), T-h, T-i; viết lại §1, "Đọc T-h", "Đọc T-i" và kết luận §6–§7 theo bản có C9. `run-plan.md`: sửa dòng "`pilot*` không tồn tại" (`results/pilot1/` có, chỉ chứa `config.json`), thêm bước kiểm "rep chạy lại ≠ rep đã loại" vào checklist cho tới khi SR-01(d) được gộp.

## 0. Kết luận RQ3: v1 → v2

- **v1:** làn nhanh "không nhanh hơn rõ rệt" so với Claude Code (Opus); C6 ghi "chưa có".
- **v2:** cùng mô hình Sonnet và cùng thời điểm (C7), một agent nhanh hơn làn nhanh 1,6–2,9× ở 4/5 bài; làn nhanh chỉ hòa ở t5. Chênh +38,0 s (+44,3 %), p hoán vị 0,0329. Chi phí làn nhanh 2,5–3,8× Sonnet đơn, p 0,0041. Lợi thế so với Opus chủ yếu do mô hình (Sonnet đơn nhanh hơn Opus 90,8 s, làn nhanh chỉ 28–35 s). Chi phí cố định điều phối (T-d (3)) = 55,8 % thời gian Sonnet đơn ở C7 (72,8 % với C5–C7 gộp). Điều kiện có lợi (song song hóa được, bài đủ dài) chỉ là giả thuyết, cần bài > 15 phút.
- **Lệch so với BRIEF-2 (đã ghi ở mọi tệp):** lượt C7 t2 52/60 **không** phải "review không bắt". Reviewer ghi `approved: false` và nêu đúng lỗi #3 (mua X tặng Y) và #4 (hạn mã theo UTC). Hạng mục sở hữu `src/promotions.js` không chạy và không có vòng sửa (`reviewRound` = 0). Vì vậy v2 coi đây là điểm yếu điều phối, 1 lượt, và không dùng làm bằng chứng "verifier bỏ sót" hay đối chiếu TeamBench theo hướng đó (nguồn: bàn giao S1, `result.json`, `grade-hidden.tap`). Lý do hạng mục thứ ba không chạy: chưa xác định (không có `events.jsonl`).

## 1. Thay đổi theo tệp

### 1.1 Dữ liệu và mã phân tích (S1, @data-scientist)

| Tệp | Mục | Cũ → mới | Lý do |
|---|---|---|---|
| `performance/token-analysis.md` | đầu tệp | Thêm hash nguồn `7fa6305`; C1–C7 | BRIEF-2 §3 |
| | T-0 | In đối chiếu `c6-extract/` với `results/` C6: 8/24/25/56 dòng trùng từng ký tự, bỏ `c6-extract` | BRIEF-2 §3 |
| | T-h (mới) | Bảng ba hệ Opus / Sonnet / làn nhanh theo bài; tỉ lệ 1,64–2,90 (gộp), 0,77–2,45 (chỉ C7); chi phí 2,47–3,79× | BRIEF-2 §2.1 |
| | T-i (mới) | Bootstrap và hoán vị: làn nhanh − Sonnet +38,0 s (p 0,0329), +0,441 USD (p 0,0041); làn nhanh − Opus C5–C6 và C5–C7; Sonnet − Opus −90,8 s | BRIEF-2 §2.1 |
| | T-d (3) | Thêm chi phí cố định điều phối: 55,8 % (239,5/429,0 s) C7; 72,8 % gộp; t2 94,9 %, t4 113,1 % | BRIEF-2 §2.2 |
| | T-f | Thêm cột p hoán vị; C6: 0,0556 (36 hoán vị, p nhỏ nhất 2/36) và 0,3889 | R1-02 |
| | Đọc T-e | O1 5,1 % → 4,6 %; tỷ trọng ra/ghi/đọc cache → 38,4/49,6/9,7 % | bảng hiện hành |
| `performance/scripts/token-analysis.mjs` | toàn bộ | Thêm C7, hệ `claude-sonnet`, T-h, T-i, mở rộng T-d; không đọc `c6-extract/`; `--check` khớp 12 bảng | BRIEF-2 §3 |
| `bench/vs-claude/harness/stats.mjs`, `stats.test.mjs` | tùy chọn | Thêm `--baseline <hệ>`, `--delta`, bỏ dòng trùng; +4 test (12/12 qua) | BRIEF-2 §3 |
| `bench/vs-claude/README.md`, `harness/run.mjs`, `harness/export.py`, `docs/PROCESS-REVIEW.md` | | Đồng bộ mô tả/công cụ C7 theo cùng commit S1 (`7eda63b`) | S1 |
| `BRIEF-2.md` (mới), `references-v2.md` (mới) | | Chép đề bài (S1); danh mục APA 7 đã tra (S2) | kế hoạch |

### 1.2 Lệch kỹ thuật R1 (S3)

| Tệp | Mục | Cũ → mới | Mã |
|---|---|---|---|
| `paper/paper.md` | §6 Bảng 3 | "C6 chưa có CI" → hai dòng C6: −72,8 s (p 0,0556), +0,136 USD (p 0,3889) | R1-02 |
| | Bảng 4, Bảng 5 | Thêm hàng C6 từ T-d (4 lượt) và T-b (3,37×) | R1-03, R1-04 |
| | §6 | 7/12 ô; 38,4/49,6/9,7 % (T-e); O1 0,037 USD, 4,6 % | R1-05, R1-06, R1-16 |
| | Bảng 3b | Nguồn T-a, T-b, T-f, T-g | R1-07 |
| | Bảng 1 | Thêm cột "Áp cho runtime"; trần vòng công cụ, ngân sách đầu vào công cụ, nhắc 35/65 %, `idleTimeoutMs`, `maxContinuations` không áp cho `claude-cli` | R1-10 |
| | §4.1, §8 | Mặc định phân loại dữ liệu (Công khai/Nội bộ mọi runtime; Bảo mật/Hạn chế chỉ `local`); "450–700 từ" không đơn vị; `git apply --unidiff-zero --ignore-whitespace` | R1-09, R1-13, R1-19 |
| `challenges.md` | K34, K46, C-05; K23, K10, K19, K28, K13, K40; L2, L3, L5, L6, L8, L9, L12, L15 | Sửa theo cột runtime, phạm vi reviewer, hằng số 60k/120k/200k/300k là ước lượng, hạng mục chỉ đọc | R1-08, R1-11 |
| `self-improvement/design.md` | nhật ký sự cố, chèn bản vá, chạy A/B, §9 | `capHits` = 0 với `claude-cli`; `ISSUE_RE` chưa export; dùng lại `TaskOptions.variant` + `COMMON_KEYS`; cờ `git apply` | R1-18, R1-19 |

### 1.3 Viết lại RQ3 trong bài (S4)

| Tệp | Mục | Cũ → mới | Lý do |
|---|---|---|---|
| `paper/paper.md` (v0.2 → v0.3) | Tóm tắt VI/EN | Kết luận "không nhanh hơn rõ rệt" → câu RQ3 chuẩn kèm n nhỏ, p hoán vị | BRIEF-2 §1 |
| | §6.3 (mới), §6.4–6.6 | Thêm C7, Bảng 3c/3d/3e (T-h, T-i, T-d); phân tích t2 52/60 là lỗi điều phối | BRIEF-2 §2 |
| | §7, §8, §9 | Viết lại: tách hiệu ứng mô hình, giả thuyết điều kiện có lợi (> 15 phút), bỏ "đưa vào script S2" | BRIEF-2 §2 |
| | §3, §7.3, K.3 | CAID, Cognition 2026, *Don't Break the Cache* theo bản đã đọc | S2 |
| | Danh mục | Theo `references-v2.md`, đủ tác giả, DOI; năm trích đổi: EvoMAC/TextGrad/ADAS → 2025; AutoGen/DSPy → 2024; Kapoor → 2025 | BRIEF-2 §4 |
| | cuối tệp | Xóa ghi chú tạm của S3 | S3 |

### 1.4 Kế hoạch công bố, trình bày, thách thức (S5)

| Tệp | Mục | Cũ → mới | Lý do |
|---|---|---|---|
| `publication-plan.md` | tiêu đề, §0 | Thêm kết luận RQ3 v2 | R1-14 |
| | §1 N1, N3, E7 | Cập nhật theo C7; số T-e sửa theo bảng hiện hành | BRIEF-2 §2 |
| | §3 "Phương án dự phòng" (mới) | MSR 2027 Industry (18/12/2026) kênh chính đề xuất, **chờ Tom chốt**; AGENT'27 (13/11/2026) chỉ nếu có bản rút gọn không cần thí nghiệm thêm; SANER 2027 Agentic AI4SE hết hạn 23/10/2026 | BRIEF-2 §5 |
| | §4, §5, §6 | D1–D5, D8 hiện trạng; đe dọa tính hợp lệ (n nhỏ, đồng thời, 8 phép kiểm không hiệu chỉnh, bài ngắn); lộ trình, mốc 1/12/2026 | BRIEF-2 §2 |
| | §8, §9, tham khảo | Bỏ câu casrai.org (không có nguồn chính thức); §9 viết lại; tham khảo theo `references-v2.md` | S2 |
| `presentation-notes.md` | thông điệp chính, slide 3, 6, 7, 9, 12, 13, 17, hỏi đáp | Thay số và kết luận; thêm slide 10 "Tách hiệu ứng mô hình (C7)" (tổng 17 slide) | R1-15 |
| `challenges.md` | ghi chú đầu tệp, C-12, L11, P-07 | "C6 chưa có dữ liệu" → số C6, C7 (T-a, T-f, T-h, T-i, T-d) | R1-12 |

### 1.5 Sửa nhất quán của S6

| Tệp | Mục | Cũ → mới | Lý do |
|---|---|---|---|
| `related-work.md` | đầu "Kết luận điểm mới" | "C6 chưa có dữ liệu" → "C1–C7 đã có (T-h, T-i, T-d)" | R1-17 còn sót |
| | K.2 N1 | "Phải có số thật từ S2; C6 chưa có" → "Số thật từ token-analysis.md (C1–C7)" | R1-17 |
| | K.2 N4 | "C6 chưa có" → nêu rõ C6 chỉ kiểm bản sửa `maxParallel`, không phải vòng tự cải thiện | R1-17; tránh nói quá |
| | K.1 E4–E6 | Năm trích: Khattab 2023→2024; Yuksekgonul 2024→2025; Hu (ADAS, EvoMAC) 2024→2025; Kapoor 2024→2025 | `references-v2.md` |
| `CHANGELOG.md` | | Tệp này | S6 |

## 2. Phủ git diff

`git diff --name-status d363534 HEAD` có 16 tệp; tất cả có mục ở §1: bench (README, export.py, run.mjs, stats.mjs, stats.test.mjs) và `docs/PROCESS-REVIEW.md` ở §1.1; `BRIEF-2.md`, `references-v2.md` ở §1.1; `challenges.md`, `design.md` ở §1.2/§1.4; `paper.md` ở §1.2/§1.3; `token-analysis.*` ở §1.1; `presentation-notes.md`, `publication-plan.md` ở §1.4; `related-work.md` ở §1.5 (cộng thay đổi của S2 trước đó: thêm CAID/Cognition/Don't Break the Cache ở K.1–K.3, theo `references-v2.md`). Đổi sau HEAD: `related-work.md` và `CHANGELOG.md` (S6).
Giới hạn: bảng §1 dựa trên `--name-status`, bàn giao S1–S5 và các lần đọc trực tiếp của S6; tôi chưa đọc diff từng dòng của `paper.md` và `related-work.md`, nên số dòng nêu trong §3.2 là số dòng hiện tại của tệp, cần kiểm lại nếu tệp còn đổi.

## 3. Kiểm cho phản biện

### 3.1 Số (≥ 5)

| # | Số | Vị trí | Đối chiếu |
|---|---|---|---|
| 1 | Thời gian TB Opus/Sonnet/làn nhanh: t1 126/66/108 · t2 91/42/94 · t3 205/108/199 · t4 203/49/142 · t5 259/166/165 | `paper.md` Bảng 3c; `presentation-notes.md` slide 6; `publication-plan.md` §0 | T-h; `results/runs.csv` |
| 2 | Tỉ lệ làn nhanh/Sonnet 1,64 · 2,27 · 1,85 · 2,90 · 1,00 (nhanh hơn 1,6–2,9× ở 4/5 bài); chỉ C7: 1,66/1,71/1,79/2,45/0,77 | `paper.md` Tóm tắt, §6.3; `challenges.md` L11 | T-h |
| 3 | Chi phí làn nhanh/Sonnet 2,47–3,79× (ghi 2,5–3,8×); p hoán vị 0,0041; +0,441 USD | `paper.md` §6.3; `publication-plan.md` §0; `presentation-notes.md` slide 10 | T-i hàng 1 |
| 4 | +38,0 s (+44,3 %), p hoán vị 0,0329 (243 hoán vị; p nhỏ nhất 1/243); CI [35,0; 41,0] hẹp giả tạo, không trích | `paper.md` Bảng 3d; `presentation-notes.md` | T-i hàng 1; `stats.mjs --rounds C7 --baseline claude-sonnet` |
| 5 | C6 làn nhanh − Opus: −72,8 s [−105,3; −40,3], **p 0,0556** (p nhỏ nhất 2/36); chi phí +0,136 [−0,016; 0,287], p 0,3889 | `paper.md` Bảng 3 (dòng C6); `challenges.md` ghi chú đầu tệp, P-07 | T-f; `dev-review/stats-report.md` |
| 6 | Chi phí cố định điều phối 55,8 % (239,5/429,0 s) C7; 72,8 % C5–C7; t2 94,9 %, t4 113,1 % | `paper.md` §6.5; `publication-plan.md` §0; `challenges.md` P-07 | T-d (3) |
| 7 | Sonnet − Opus −90,8 s (−51,4 %); làn nhanh − Opus −28,2 s (C5–C6) và −34,9 s (C5–C7, p chi phí **0,0944**) | `paper.md` Bảng 3d | T-i hàng 2–4 |
| 8 | Test ẩn đạt trọn: Sonnet 10/10, Opus 13/14, làn nhanh 17/18; C7 t2 52/60 (8 test hỏng: 6 của #3, 2 của #4) | `paper.md` §6.3, §7 | T-h; `result.json`, `grade-hidden.tap` của C7 t2 |

Cột `failed_hidden` trong `runs.csv` chỉ liệt kê 5 mục (toàn #3); danh sách đủ ở `result.json`. Phản biện không nên trích cột đó.

### 3.2 Trích dẫn đã sửa (≥ 5)

| # | Trích dẫn | Sửa | Vị trí | Đối chiếu |
|---|---|---|---|---|
| 1 | TextGrad (Yuksekgonul và cộng sự) | arXiv 2024 → *Nature* 639(8055):609–616 (2025), doi 10.1038/s41586-025-08661-4, tên "Optimizing generative AI by backpropagating language model feedback", thêm tác giả Pan Lu (8 tác giả). Chưa tự mở trang Nature [V-BRIEF] | `paper.md` danh mục (dòng 438); `related-work.md` K.1 E4 | `references-v2.md`; BRIEF-2 §4 |
| 2 | Optima (Chen và cộng sự) | Findings of ACL 2025, pp. 11534–11557, doi 10.18653/v1/2025.findings-acl.601 | `paper.md` dòng 396 | `references-v2.md` [V-chính] |
| 3 | Agentless (Xia và cộng sự) | Bản FSE 2025, *PACMSE* 2(FSE), doi 10.1145/3715754, tên "Demystifying LLM-based software engineering agents". DOI chưa mở được [V-BRIEF] | `paper.md` dòng 428 | `references-v2.md`; arXiv:2407.01489 |
| 4 | AgentDojo (Debenedetti và cộng sự) | Điền đủ 6 tác giả, NeurIPS 2024 (trước để trống) | `paper.md` dòng 392 | `references-v2.md` dòng 70 |
| 5 | AgentCoder (Huang và cộng sự) | Điền đủ 6 tác giả, ghi phiên bản arXiv:2312.13010v3, Preprint | `paper.md` dòng 406 | `references-v2.md` |
| 6 | MAST (Cemri và cộng sự) | arXiv → NeurIPS 2025 (vol. 38), 13 tác giả [V-thứ cấp] | `paper.md` dòng 394 | `references-v2.md` |
| 7 | AI Agents That Matter (Kapoor và cộng sự) | 2024 → TMLR 2025 [V-thứ cấp] | `paper.md` dòng 408 | `references-v2.md` dòng 31 |
| 8 | AutoGen (Wu và cộng sự) | 2023 → COLM 2024; 14 tác giả theo arXiv (Microsoft Research ghi 13) | `paper.md` dòng 426 | `references-v2.md` |
| 9 | DSPy (Khattab và cộng sự) | 2023 → ICLR 2024; tên "…into self-improving pipelines" | `paper.md` dòng 410 | `references-v2.md`; BRIEF-2 §4 |

Còn nhãn [V-thứ cấp] và [V-BRIEF] (MAST, Kapoor, AutoGen, TextGrad, Agentless): cần mở trang chính trước khi nộp. Magentic-One 19 tác giả, BRIEF-2 ghi 20; đã giải thích ở `references-v2.md`.

## 4. Kiểm chéo số liệu liên tệp

Phương pháp: tìm từng số bằng Grep trên `paper.md`, `publication-plan.md`, `presentation-notes.md`, `challenges.md` (kể cả dạng viết sai: `0,056`, `0.0556`, dấu chấm thập phân ở bản VI).

| Số | paper.md | publication-plan.md | presentation-notes.md | challenges.md | Kết quả |
|---|---|---|---|---|---|
| p hoán vị C6 0,0556 | ✔ | ✔ | ✔ | ✔ | khớp |
| Nhanh hơn 1,6–2,9× | ✔ | ✔ | ✔ | ✔ | khớp |
| +38,0 s, p 0,0329 | ✔ | ✔ | ✔ | ✔ | khớp |
| Chi phí 2,5–3,8× | ✔ | ✔ | ✔ | — | khớp (challenges không nêu) |
| p chi phí 0,0041 | ✔ | ✔ | ✔ | — | khớp |
| Thời gian t5 259 / 165 s | ✔ | ✔ | ✔ | 165 có, 259 không | khớp (không mâu thuẫn) |
| T-d 55,8 % | ✔ | ✔ | ✔ | ✔ | khớp |
| T-d 72,8 % | ✔ | ✔ | — | — | khớp (không mâu thuẫn) |
| T-d t2 94,9 %, t4 113,1 % | ✔ | ✔ | ✔ | — | khớp |
| Sonnet nhanh hơn Opus 90,8 s | ✔ | ✔ | ✔ | — | khớp |

`—` = tệp không nêu số đó; không có bản nào nêu số khác.

Không phát hiện số lệch. Chỉ khác về cách viết: bản EN trong Tóm tắt dùng dấu chấm thập phân ("38.0 s", "55.8%"), bản VI dùng dấu phẩy; đó là chủ ý.

## 5. Kết quả tìm `chưa có dữ liệu|C[67][^\n]{0,40}chưa có|et al\.` trong `docs/research/*.md`

Lệnh tương đương: `grep -rnE 'chưa có dữ liệu|C[67].{0,40}chưa có|et al\.' --include=*.md docs/research` (chạy bằng công cụ Grep, không có quyền chạy grep shell có ghi tệp).

| Nhóm | Trước sửa | Sau sửa | Ghi chú |
|---|---|---|---|
| "C6/C7 … chưa có" trong tệp sản phẩm | `related-work.md` 3 dòng (337, 358, 361) | **0** | Đã sửa ở §1.5 |
| Cụm này trong `BRIEF-2.md`, `dev-review.md`, `dev-review/verification.md` | có | có | Nhật ký lịch sử/đề bài, không sửa |
| "chưa có số đo" (nằm ngoài regex) | `paper.md`, `publication-plan.md`, `presentation-notes.md`, `design.md` | không đổi | Nói về cơ chế/N4 chưa đo hiệu quả, đúng thực tế; không phải C6/C7 |
| `et al.` | `paper.md` ~14 dòng, `related-work.md` ~36, `references-v2.md` 16, `BRIEF.md`, `BRIEF-2.md`, `dev-review*` | không đổi | Xem dưới |

**Còn lại không bằng 0 và lý do:**
- `paper.md`: "X et al. (năm)" trong thân bài và ở §3/§7. Đây là cách trích trong văn bản APA 7 hợp lệ cho ≥ 3 tác giả; danh mục cuối bài có **0** "et al." (đủ tác giả). `publication-plan.md` dùng "và cộng sự" (S5 đổi). Hai cách viết khác nhau giữa hai tệp, không sai về số liệu; nếu Tom muốn thống nhất thì đổi hàng loạt `et al.` → `và cộng sự` ở `paper.md`, `related-work.md`.
- `related-work.md`: các mục APA v1 (§2 và Nhóm B) vẫn ghi "Tác giả đầu, et al." Ghi chú dòng 396 của tệp nói bản dùng để trích là `references-v2.md`. Tôi không viết lại 30 mục ở đây vì trùng với `references-v2.md`.
- `references-v2.md`: mô tả cột "v1 → v2" ("et al." → đủ tác giả).

→ Tiêu chí "bằng 0 ngoài nhật ký lịch sử" đạt cho `chưa có dữ liệu` và `C6/C7 … chưa có`; **chưa đạt** cho `et al.` ở `paper.md` thân bài và `related-work.md` (lý do ở trên, chờ Tom chọn).

## 6. Data Protection

Dữ liệu là log benchmark tổng hợp (nhãn nội bộ), không có dữ liệu cá nhân (DLCN). Dự án A tiếp tục ẩn danh. Không thêm tập dữ liệu mới. Không cần đánh giá bảo vệ dữ liệu mới; `docs/data-protection-assessment.md` không đổi. Truy vấn tìm kiếm của S2 không chứa chi tiết nội bộ.

## 7. Việc còn lại và lệnh cần chạy (S6 không có quyền chạy)

- `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md` (S1 đã báo exit 0).
- `node --test bench/vs-claude/harness/stats.test.mjs` (S1 báo 12/12).
- `npm run typecheck && npm test` (S1 báo qua; docs không ảnh hưởng).
- `git grep -nE "chưa có dữ liệu|C[67].{0,40}chưa có" -- docs/research ':!docs/research/dev-review*' ':!docs/research/BRIEF-2.md'` kỳ vọng 0.
- Chờ Tom: chốt kênh công bố (MSR 2027 Industry 18/12/2026; AGENT'27 13/11/2026 chỉ khi có bản rút gọn); chọn `et al.` hay "và cộng sự".
- Mở trang chính cho nguồn gắn [V-thứ cấp]/[V-BRIEF] trước khi nộp.

## 2/11/2026 — gói R3-1

Nhiệm vụ T-20261102-134405-b2c, hạng mục S1 (R2, @data-scientist). Nguyên nhân chung: **thêm C8** vào bảng (3 lượt làn nhanh trên t2, không có Sonnet đơn) và **sửa `token-analysis.mjs`** (tự phát hiện vòng; chỉ ảnh hưởng nội dung bảng ở T-0 qua danh sách vòng). Số cũ → mới:

| Bảng | Số cũ → mới | Nguyên nhân |
|---|---|---|
| T-0 | 38/38 → 41/41 lượt CCoding khớp; 72 → 75 lượt chạy; 217 → 235 dòng calls.csv; 209 → 226 dòng phases.csv; vòng C1–C7 → C1–C8; nguồn `7fa6305` → `bb7b477` | thêm C8; sửa `sourceCommit` |
| T-a | thêm dòng C8 t2-orders (n = 3, 180/180, 129 s, 0,793 USD) | thêm C8 |
| T-d | thêm C8: 4 dòng pha (plan/execute/review/revise) và dòng theo lượt chạy (129 s, tiết kiệm 38,0 %); mục (3) không đổi | thêm C8 |
| T-e0 | sonnet: 175 → 193 lượt gọi, giá đầu ra 9,80 → 9,81, giá ghi cache 4,06 → 4,05 | thêm C8 (18 lượt gọi) |
| T-e1 | 217 → 235 lượt gọi; F 2 350 → **3 607** token; a 1,55 → 1,45; b 1,13 → 1,10; R² 0,755 → 0,680 | thêm C8 |
| T-e | O1: 0,037 → 0,057 USD, 4,6 → **7,1 %** (do F); ghi cache nền C5 49,6 → 49,5 %; O2–O6 không đổi | F đổi ở T-e1; làm tròn |
| T-f | thêm dòng C8 (không có đối chứng Opus cùng vòng) | thêm C8 |
| T-b, T-c, T-g, T-h, T-i | không đổi | C8 không có cặp Claude cùng vòng, không thuộc `fastRounds` |

- **Con số 55,8 % (T-d (3), C7) còn nguyên**: C8 không có Sonnet đơn nên không vào mẫu số; C7 vẫn là vòng làm nền. Gộp C5–C7 (72,8 %) cũng không đổi.
- **Mã:** `CONFIG.rounds`, `opusRounds`, `sonnetRound`, `fastRounds`, `phaseTableRounds` tự phát hiện từ `results/C<n>/<bài>.<hệ>.<lượt>`; `fastRounds` = vòng có làn nhanh và có Claude cùng vòng (nên không gồm C4, C8). `hung`, `pooledRounds`, `costBasisRound` vẫn khai báo tường minh. `--check` thoát mã 1 kèm thông báo "Bảng cũ: results/ có vòng … chưa có trong T-0" khi `results/` có vòng chưa ghi ở bảng; thêm cờ `--results <thư mục>`.
- **Cảnh báo độ ổn định của F (T-e1):** F tăng 2 350 → 3 607 token (+53 %) chỉ vì thêm 18 lượt gọi, R² giảm 0,755 → 0,680. Ước lượng F và O1 (4,6 → 7,1 %) chưa ổn định, chưa có CI. Không dùng O1 làm căn cứ định lượng cho quyết định cho đến khi có thêm vòng và CI bootstrap.
- **Đầu ra nguyên văn bước (1):** `performance/required-runs-2026-11-02.md`.
- **Mới:** `performance/scripts/variance-by-cell.mjs` (sd thời gian, chi phí, tỉ lệ test ẩn theo bài × hệ) làm đầu vào cho đăng ký trước.

## 2/11/2026 — gói R3-2

- **R8 (T-20261102-175854-65c, S3, @research-lead) — `improvement-backlog.md` sửa tại chỗ:** thêm **B-10** cổng phủ kế hoạch (§5; quy tắc A: tệp/module nêu trong đề bài hoặc tóm tắt kế hoạch mà không hạng mục nào nhận ⇒ chặn trước thực thi; quy tắc B: kế hoạch đọc dở ⇒ không chạy; nơi đo H8 `analyze.mjs:96-100`, kèm giới hạn: phán quyết H8 chỉ dựa `formatMiss` mà `gradeCode` không đặt, nên chưa bắt ca coding kiểu t5); sửa B-02 §4.1 bước 2 (đỏ kéo dài mà đề bài yêu cầu lệnh xanh ⇒ bắt buộc vòng sửa, reviewer LLM không quyết duyệt; bằng chứng `results/C9/t5-logq.ccoding-fastlane.2/ccoding-task.json:4, 83, 85-86, 174-201`); §0 thêm B-10 hạng 3, các mục B-03…B-09 lùi một hạng; §6 viết lại theo hệ chính H1–H10 của bộ đo giám đốc, giả thuyết bản 1 đổi H_i → P_i (ghi ĐK-P_i trong backlog vì trùng mã bản vá prompt P1–P4). Đính chính `context/c9-partial-2026-11-02.md` §2: 51 test ẩn hỏng của t5 = 37 nhóm "tổng hợp" + 14 nhóm "CLI" (`result.json:44-94`), không phải toàn bộ "tổng hợp".
- **R6 (T-20261102-175854-65c, S4, @methodologist) — `preregistration.md` v1.0 → v2.0 (khóa có điều kiện), sửa tại chỗ:** hệ chính đổi sang **H1–H10 của bộ đo giám đốc** (`analyze.mjs`, giữ nguyên mã; mỗi H có phép kiểm, ngưỡng, dòng mã, N tối thiểu và trạng thái đạt/không đạt trước 5/11 từ `run-plan.md` §4; họ Holm K = 4 {H1, H2, H3, H6}; H8, H9, H10 chỉ mô tả/thăm dò); **9 giả thuyết bản 1 (không phải 8 như brief) đổi mã H_i → P_i (P1–P9)**, bảng ánh xạ P↔H đủ 9 dòng (trùng ý/bổ sung/chỉ bộ cũ), P9 ánh xạ sang B-01 mới; thêm giả thuyết **B-01** (làn đơn `SL` so với A0-sonnet, TOST ±15 % ba đại lượng: token có trọng số, thời gian, điểm; USD chỉ là độ nhạy; bootstrap 90 % CI; t1–t5; 45/arm) và **B-02** (B02-M cơ chế phát lại ca t5 dùng §4.1 bước 2 và B-10; B02-G, B02-Q, B02-H8b chỉ mô tả vì không đạt thống kê); §4.3 ba tiêu chí loại lượt Q (hạn mức), L (`leak`), T (timeout) cho bộ mới, kèm cách nhận diện qua trường của `runs.jsonl`; §6 đe dọa hiệu lực từ `suite-review.md`; §8 chừa chỗ cho hash commit merge Phòng Dev; §9 danh sách SR-01…SR-07 và SR-08a (P0; mục giám khảo cặp sau đó tách thành SR-08a/SR-08b ở v2.1) đang chờ. Bản 2 khóa có điều kiện: H nào chờ SR-xx ghi ở cột "Khóa"; nếu SR P0 đổi phép kiểm hay ngưỡng thì ghi v2.1.

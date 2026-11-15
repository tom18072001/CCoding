# Phân tích cuối W1–W5 (`run-plan.md` §5.3) trên `study-cloud`

Phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không có DLCN). Chạy 3/11/2026 (UTC) sau khi mọi cửa sổ W1–W5 và lượt bù đã xong.

## Dữ liệu

- `bench/vs-claude/results/study-cloud/runs.jsonl` ở commit `78cc7b6`: 448 dòng = 440 khóa `done` + 8 dòng `infra` (lỗi socket keep-alive ở W3, không có lượt gọi LLM; RUNLOG mục W3). 0 leak, không gặp hạn mức.
- Quarantine §5.0: không có dòng `failed`; 8 dòng `infra` bị mọi script bỏ qua (`status: infra`). Không chuyển dòng nào.
- Không chạy `pairwise.mjs` (`preregistration.md` §9, SR-08a).

| Tệp | Sinh bởi |
|---|---|
| `prereg-tests-448.md` | `prereg-tests.mjs` đã khóa (sha256 `3020ca47…`), chỉ in, không `--write` |
| `step4-extra-448.md` | `../study-cloud-step4/step4-extra.mjs` (B-01 cho B6, B7; mô tả B7 trên 13 bài) |
| `final-extra.mjs`, `final-extra.md` | Script mới, chỉ dùng hàm đã khóa: tỉ số chi phí mọi arm so với A0-sonnet trên R13, bài dưới trần, H4 mô tả |
| `analyze-{B0,B5,B6,B7,A1,A2}.md`, `summary.csv`, `pareto.csv` | `analyze.mjs --baseline A0-sonnet --treatment X` (§5.3), để đối chiếu |

## Kết quả chính

1. **B-01 (làn đơn B7) bị bác bỏ**, không đổi so với vòng 3: token ×2,50 [2,02; 3,18], thời gian ×2,57 [2,09; 3,25] (CI 90 %, t1–t5, 9 lượt/bài). Điểm không kết luận (t1–t5 chạm trần).
2. **B-01 cho làn nhanh B6 bị bác bỏ:** token ×3,92 [3,49; 4,43], thời gian ×4,05 [3,45; 4,76] (45/45 lượt).
3. **Chi phí trên 13 bài so với A0-sonnet (mô tả; khác cửa sổ trừ B0):**

   | Arm | Token | Thời gian | Điểm TB (A0-sonnet 0,979) |
   |---|---|---|---|
   | B0 (đủ phòng) | ×6,58 | ×9,76 | 1,000 |
   | B6 (làn nhanh) | ×4,23 | ×6,29 | 0,996 |
   | B7 (làn đơn) | ×2,61 | ×3,96 | 1,000 |
   | B5 (một agent `senior-swe`) | ×1,61 | ×2,59 | 0,984 |
   | A2 (best-of-3) | ×2,23 | ×2,55 | 0,995 |
   | A1 (Claude + prompt lập kế hoạch/tự review) | ×0,96 | ×1,28 | 0,993 |

   CI 90 % ở `final-extra.md`. Điểm hầu như chạm trần: chỉ 3 bài có ô dưới 0,99 (c3-shop-bugs, l1-oncall, r1-elk-design), chênh tối đa 1 lượt trên 3.
4. **H5 (B0/A0-sonnet):** W1 ×5,68 token, ×9,60 thời gian, 9/9 bài đạt cả hai ngưỡng; W2a 4/4; W2c 1/1. Mô tả kèm CI (`prereg-tests-448.md` §3).
5. **H4 (a1, `--judge` ở mọi lượt, n = 11/arm):** A0-sonnet TB 0,985 (sd 0,05; một lượt 0,833), B0 1,000. Δ ≈ +1,5 pp, xa ngưỡng +20 pp của H4. Mô tả; `prereg-tests` không có phép H4.
6. **H3:** đủ N (10/10) nhưng không tính p (SR-26 chưa có mã); recall và precision 0,0 pp, mọi lượt 1,0 (suy biến).
7. **H6:** `analyze.mjs` báo |Δ| ≤ 5 pp giữa B0 và A1/A2 trên 13 bài, nhưng **theo đăng ký trước v2.1 (§9 dòng 6) H6 chỉ tính trên l1-modules, l2-chain, t1–t5**, trong khi `run-plan.md` §5.2 chạy A1/A2 trên R13. Vì vậy `prereg-tests` vẫn ghi H6 "chưa đủ N" (A1/A2 chưa chạy t1–t5; l1-modules, l2-chain chưa có `task.json`). Đây là lệch giữa `run-plan.md` và đăng ký trước, cần nhóm nghiên cứu ghi §9.
8. **H7:** chưa đủ N (chỉ a1 và s1 có r ≥ 5 ở cả A0-sonnet và B0; cần ≥ 3 bài).
9. **Họ Holm rỗng (K = 0)**: không giả thuyết nào "xác nhận" theo §2.5.

## Đọc `analyze.mjs` thế nào

Nhãn "SUPPORTED"/"not supported" không dùng làm kết luận (`preregistration.md` §2.4, §9 V3-06). `analyze.mjs` gộp mọi cửa sổ và server; H5 của nó có lỗi lệch chỉ số SR-06; H6 của nó tính trên mọi bài thay vì tập bài của §9 dòng 6; H7 tính trên r = 3.

## Giới hạn

- Arm chạy ở cửa sổ khác nhau (W1 → W5, 2–3/11/2026) và hai server khác mã (`main` `e0bd2f4` cho B0/B5; nhánh `7fb18ba` cho B6/B7). Ba neo B0 × `l4` (W3–W5) lệch ≤ 5 % so với W1 về token và thời gian (chỉ báo thô, k = 2).
- `prereg-tests-448.md` dùng nhãn cửa sổ cố định của vòng 3 (mọi dòng sau W2b gộp vào "B7a"); bảng H5 dòng "B7a … 18 bài" vì vậy có ô `n/a`. Số đúng cho các arm mới nằm ở `final-extra.md`.
- Trần điểm: phần lớn bài cho 1,00 ở mọi arm, nên bộ đo này chủ yếu phân biệt về chi phí và thời gian, không về chất lượng.
- Người chạy đã thấy điểm 2 lượt t1-duration r8 (RUNLOG; §9 V3-09).

# Đề bài vòng 4, gói 1, cho Phòng Nghiên cứu: vì sao làn đơn B7 tốn ×2,5, và cách giảm có bằng chứng

## Bối cảnh
- Gói 3 (T-20261103-021358-275, `docs/research/results-round3.md`) đã **bác bỏ B-01**: so với A0-sonnet trên t1–t5, B7 tốn ×2,50 token có trọng số và ×2,57 thời gian. Chất lượng ngang nhau (mọi bài chạm trần).
- B-02 và B-10: **không đủ dữ liệu**. Điều kiện để quyết định là phát lại offline B02-M.
- Mục tiêu của giám đốc không đổi: việc nhỏ dùng agent đơn; tối ưu chi phí; cổng chất lượng; đúng KPI và mẫu đầu ra của giám đốc.
- Số mô tả người giao việc đọc được từ `runs.jsonl` (trung vị, t1–t5). Phòng phải **tự tính lại bằng script**, không chép:

| Hạng | out | cacheRead | cacheWrite | weighted | wall |
|---|---|---|---|---|---|
| A0 | 8,0k | 124k | 15k | 66k | 52 s |
| B7 | 20,2k | 219k | 51k | 199k | 140 s |

- Ước lượng sơ bộ của B7 theo `byPhase`: `execute` khoảng 122k, `accept` (nghiệm thu CTO) khoảng 42k mỗi lượt. Trên bộ 13 bài có thêm `plan`/`review` ở một số lượt.

**Ràng buộc:** gói nhỏ, tối đa 3 hạng mục, ngân sách 3M token. Không sửa `src/` hay `bench/`.

## Hạng mục

**R11 — data-scientist → `docs/research/analysis/b7-cost-decomposition.md`** (kèm script trong `docs/research/analysis/`)
1. Tách chi phí của B7 theo pha (`byPhase`), theo thành phần token (out, cacheRead, cacheWrite, input) và theo số lượt gọi. Làm trên t1–t5 và trên bộ 13 bài (B7b).
2. So từng thành phần với A0 cùng bài.
3. Trả lời bằng số:
   - Bao nhiêu phần của chênh lệch ×2,5 đến từ pha `accept`?
   - Bao nhiêu đến từ đầu ra dài hơn (mẫu đầu ra hay báo cáo bàn giao)?
   - Bao nhiêu đến từ ghi cache, vì mỗi lượt gọi là một phiên mới?
   - Bao nhiêu đến từ các pha khác?
4. Thời gian (×2,57) tách như trên, gồm cả lệnh kiểm tra baseline/sau, tạo worktree và nghiệm thu.
5. Nêu rõ giới hạn của `runs.jsonl`: không có `calls.jsonl` của server cloud. Đề xuất trường cần ghi thêm (SR mới).

**R12 — methodologist hoặc research-lead → bổ sung `docs/research/improvement-backlog.md`**
1. Thêm **B-11 "làm gọn làn đơn"**. Mỗi biện pháp kèm chi phí tiết kiệm ước lượng (từ R11), rủi ro chất lượng và mục cần giám đốc duyệt. Ví dụ biện pháp:
   - (a) bỏ hoặc rút gọn nghiệm thu CTO khi cổng B-02 xanh và không đụng bảo mật hay dữ liệu;
   - (b) mẫu đầu ra gọn cho làn đơn. **Cần giám đốc duyệt vì đụng mẫu của giám đốc**; nêu phương án giữ đúng tiêu đề mẫu nhưng giới hạn độ dài;
   - (c) giảm phần prompt hệ thống, bản đồ repo và tài liệu cho lượt thực thi đơn;
   - (d) bỏ lượt định tuyến bằng LLM khi dự án ép làn (`ProjectDef.lane`, đã có ở D6).
2. Đặt chỉ tiêu mới cho B-01. Ví dụ: chi phí và thời gian ≤ ×1,3 A0 sau B-11, đồng thời đề xuất giữ biên ±15 % là mục tiêu dài hạn. Lập luận vì sao, và ghi đây là sửa đăng ký trước (§9).
3. Kế hoạch đo lại B7′: số lượt, bài, cùng server với A0, máy cô lập nếu có thể. Phải xong trước 5/11 14:59 (hết credit cloud).

**R13 — data-scientist: phát lại B02-M offline** (không tốn hạn mức)
- Chạy hàm cổng B-02 (`src/` hiện tại, chỉ import; viết script ở `docs/research/analysis/`) trên mọi `bench/vs-claude/results/C*/*/ccoding-task.json`.
- Đếm số lượt "duyệt khi lệnh đề bài đòi xanh còn đỏ" mà cổng sẽ chặn. Ca t5 C9 lượt 2 phải bị bắt. Không được chặn nhầm lượt xanh.
- Kết quả dùng để quyết định B-02 theo chỉ tiêu §4.5.

**Review — peer-reviewer**
- Số liệu có khớp đầu ra script không?
- Biện pháp B-11 có tôn trọng KPI và mẫu của giám đốc không, hoặc đã nêu rõ phần cần duyệt chưa?

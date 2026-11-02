# Đề bài vòng 3, gói 3, cho Phòng Nghiên cứu: phân tích xác nhận B-01 (làn đơn) và H5 trên dữ liệu study-cloud

Phân tích này quyết định một việc: **có đề xuất giám đốc đưa B-01 làn đơn, B-02 cổng chất lượng và B-10 cổng phủ kế hoạch lên `main` hay không**.
- Gói nhỏ: tối đa 3 hạng mục, ngân sách 4M token.
- Đọc bằng Read/Grep. Chỉ chạy script trong `docs/research/`. Không sửa `src/` hay `bench/`.

## Dữ liệu (đã đủ số lượt đăng ký cho B-01)

Mọi tệp nằm ở `bench/vs-claude/results/study-cloud/`:
- `runs.jsonl`: các lượt chạy.
- `RUNLOG.md`: sổ chạy, gồm hash server, thời điểm từng cửa sổ, lỗi hạ tầng, công cụ web.
- `config-<nhãn>.json`: cấu hình từng lệnh.

Các cửa sổ:

| Cửa sổ | Arm | Bài | Lượt | Server |
|---|---|---|---|---|
| W1 | A0-sonnet, B0 | R9 | 3 | `main` e0bd2f4 |
| W2a | A0-sonnet, B0 | N4 | 3, có `--judge` | `main` |
| W2b | A0-sonnet, B6 (làn nhanh) | t1–t5 | 3 | nhánh `7fb18ba` |
| W2c | A0-sonnet, B0 | s1 | thêm r4–10 | `main` |
| **B7a** | A0-sonnet, **B7 (làn đơn)** | t1–t5 | **9** | nhánh `7fb18ba`, đã có B-01/B-02/B-10 |

Pilot `results/pilot1/` chỉ dùng để mô tả, không làm bằng chứng xác nhận (`preregistration.md` §2.7).

## Hạng mục

**R9 — data-scientist: phân tích xác nhận theo `preregistration.md` v2.1**
1. **Loại lượt trước khi tính** (§4.3, tiêu chí Q/L/T; quy tắc chạy lại ở §4.1). Ghi danh sách lượt bị loại kèm lý do vào `docs/research/analysis/excluded-round3.csv`.
2. **B-01 (§3.2):** ba phép TOST so B7 với A0-sonnet trên t1–t5, mỗi phép trong biên [0,85; 1,15]:
   - (a) token có trọng số;
   - (b) thời gian thực;
   - (c) điểm.
   - Cách tính: bootstrap CI 90 % theo bài, lấy lại lượt trong từng ô, hạt 20261102.
   - Kết luận B-01 là hợp giao (IUT) của ba phép.
   - Áp quy tắc trần §2.7 cho phép (c).
   - Viết script `docs/research/analysis/prereg-tests.mjs` (Node ≥ 22, không phụ thuộc gói ngoài; đặc tả SR-04). Có test node:test cho TOST trên dữ liệu giả có đáp án biết trước.
3. **H5 (chi phí)** trên các cặp đã đủ N: B0 so với A0 ở W1/W2a/W2c; B6 so với A0 ở W2b; B7 so với A0 ở B7a.
   - Báo tỉ lệ trung vị token có trọng số và thời gian, kèm CI.
   - Báo tỉ lệ bài đạt ngưỡng của `analyze.mjs`.
4. **Mô tả, không xác nhận:**
   - điểm theo bài và theo arm;
   - so sánh làn nhanh (B6), làn đơn (B7) và B0 trên t1–t5. Lưu ý B0 không chạy t1–t5.
   - **H3, H6, H7:** nếu chưa đủ N theo §3.1 thì ghi "chưa đủ N", không tính p.
5. Chạy thêm `node bench/vs-claude/analyze.mjs` theo `run-plan.md` §5.3 để đối chiếu với script của phòng. Chỗ nào lệch thì giải thích.

**R10 — methodologist: sai lệch, hiệu lực, khuyến nghị**
1. **Điền §9 "Sai lệch so với đăng ký":**
   - hai server khác phiên bản: `main` cho B0, nhánh `7fb18ba` cho B6/B7;
   - chặn web ở arm B từ W2 (W1 có cấp web nhưng không lượt nào gọi);
   - các lần sửa bench ở `7fb18ba`;
   - mọi chỗ khác `run-plan.md`.
2. **Đe dọa hiệu lực:**
   - các arm chạy ở cửa sổ khác nhau;
   - A0 ở B7a và A0 ở W2b được gộp hay tách;
   - máy cloud chạy song song;
   - bài chạm trần.
3. **`docs/research/results-round3.md`:** báo cáo theo đúng thứ tự §5 (Holm → H1/H2 ước lượng → … → B-01 → B-02), mỗi kết luận một dòng in đậm.
   - Bảng số: lấy từ đầu ra của script, không tính tay.
   - Kết thúc bằng mục **"Khuyến nghị cho giám đốc"**: B-01/B-02/B-10 đạt hay chưa đạt chỉ tiêu nghiệm thu (backlog §3.4, §4.5, B-10), và nên đưa lên `main` ngay, sau điều kiện gì, hay chưa.

**Review — peer-reviewer.** Kiểm ba điểm:
- số liệu khớp đầu ra script;
- quy tắc loại được áp đúng;
- khuyến nghị khớp chỉ tiêu.

Bằng chứng lấy từ kết quả "🧪 Lệnh kiểm tra của dự án" do CCoding tự chạy.

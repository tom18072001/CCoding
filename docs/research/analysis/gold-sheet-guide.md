# Hướng dẫn gán nhãn vàng: `gold-sheet.csv` (một trang)

> Phân loại dữ liệu: Nội bộ (bài tổng hợp, không có DLCN). Việc gán nhãn là **tùy giám đốc**; nhóm nghiên cứu mới chỉ chuẩn bị tệp và không gán nhãn thay.

## Mục đích

Hiện chưa ai biết chấm bằng LLM judge (opus) hay bằng regex đúng đến đâu, vì hai bên chỉ được so với nhau (`agreement.md` §(a), đo độ khớp). Bộ nhãn vàng cho phép tính Accuracy, Precision, Recall, F1 và Cohen's κ của **từng** bộ chấm so với nhãn người, như Bảng 2 của MAST (arXiv 2503.13657).

## Tệp

- `gold-sheet.csv`: 60 dòng, mỗi dòng một mục checklist của một lần chạy. Các cột: `id`, `bài`, `mục`, `câu_hỏi`, `đoạn_trích`, `nhãn_người` (để trống), `ghi_chú`. Mở bằng Excel hoặc bất kỳ trình soạn CSV nào (UTF-8, có BOM). Dòng cuối bắt đầu bằng `#` ghi seed; đừng xóa.
- `gold-key.csv`: đáp án của judge và regex cho từng `id`. **Đừng mở trước khi gán xong**, để nhãn không bị ảnh hưởng.

Thứ tự dòng đã xáo bằng seed 20261103; arm đã ẩn (chỉ có `bài`, `mục`); các tên hệ thống, vai trò trong đoạn trích đã thay bằng `[SYS]`, `[ROLE]`. `A1`, `A2` xuất hiện trong đoạn trích là mã giả định của chính tài liệu, không phải arm.

## Cách gán nhãn

Với mỗi dòng, đọc `câu_hỏi` rồi `đoạn_trích` (các đoạn của tài liệu có nhiều từ khóa trùng câu hỏi nhất, nối bằng `[…]`; `¶` là xuống dòng) và điền `nhãn_người`:

| Nhãn | Khi nào |
|---|---|
| `1` | Đoạn trích **nêu rõ và đúng** điều câu hỏi đòi. Câu hỏi nêu số chấp nhận được (ví dụ "1,2–1,5 TB") thì giá trị trong khoảng đó mới là 1 |
| `0` | Thiếu, mơ hồ, chỉ ngụ ý, hoặc sai (cùng tiêu chuẩn nghiêm với judge: "vague, implied or incorrect coverage is false") |
| `?` | Đoạn trích không đủ để quyết định (ví dụ con số nằm ngoài đoạn trích). Dòng `?` bị loại khi tính và được đếm riêng |

Quy tắc:

1. Quyết **chỉ theo câu hỏi**, không theo cảm giác tài liệu tốt hay dở, và không suy đoán arm.
2. Không tra `gold-key.csv`, không chạy script trước khi gán xong.
3. Có thể ghi lý do ngắn ở `ghi_chú` (bắt buộc với `?`).
4. Mỗi dòng độc lập; có nhiều dòng cùng `mục` của các lần chạy khác nhau, hãy áp cùng một chuẩn.
5. Thời gian dự kiến: 45–60 phút.

## Sau khi gán

```bash
node docs/research/analysis/agreement.mjs --gold-score
```

In ma trận nhầm lẫn, Accuracy, Precision, Recall, F1, κ, prevalence, PABAK với CI 95 % bootstrap theo lượt cho judge và regex so với nhãn người. `node docs/research/analysis/agreement.mjs --check docs/research/analysis/agreement.md` vẫn đạt khi đã điền nhãn (chỉ so các cột không phải nhãn).

## Giới hạn cần biết trước

- Chọn **phân tầng theo bài × mục** (14 ô, 4–5 dòng mỗi ô), không oversample chỗ judge và regex bất đồng. Trong 84 cặp có chỉ 5 cặp bất đồng, nên bộ 60 dòng có thể chỉ chứa 3–4 cặp như vậy; mẫu nhỏ, CI sẽ rộng.
- Prevalence ~ 0,95 (hầu hết mục đạt): κ dễ thấp dù khớp cao (nghịch lý κ). Báo kèm PABAK. Bộ này **không đo** được bộ chấm có phát hiện mục *không đạt* tốt không, vì có quá ít ví dụ không đạt.
- Chỉ có 12 lượt của 2 bài (a1, r1), cùng một họ mô hình sinh ra văn bản.
- Đoạn trích chọn bằng từ khóa của câu hỏi nên có thể bỏ sót chỗ trả lời; đó là lý do có nhãn `?`.

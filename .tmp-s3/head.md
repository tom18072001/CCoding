# BRIEF-22d K3 — kiểm ý trên mẫu 30 tham chiếu

Phân loại dữ liệu: Nội bộ. Mốc mã nguồn: `ccc76cc0840110debab2a0e69f64b10bee965533`. Ngày: 15/11/2026.

## Mẫu và seed

- Lệnh chốt: `node docs/research/scripts/logic-map-check.mjs --sample 30 --seed 20261116 --json` (exit 0; 445 tham chiếu; mẫu 30 có `ref`, `where`, `symbol`, `real`, `matchedLine`).
- Seed đã thử, theo thứ tự: **20261116** (chốt). Theo kế hoạch, seed này chạy đầu tiên và không có tham chiếu trùng nên không phải tăng seed.
- Bằng chứng không trùng: mẫu 10 của BRIEF-22c (seed 20261115, 10 dòng `- <ref> tại <nơi> [ok]` trong `context/brief22c-checks-2026-11-14.md`) được so với mẫu 30 theo khóa (ref, nơi xuất hiện trong bài). Kết quả: **0 trùng**.
- Lưu ý khóa: trùng chuỗi `ref` mà khác nơi xuất hiện thì **không** tính là trùng. Có đúng 1 ca như vậy: `orchestrator.ts:1974` ở `improvement-backlog.md:198` (mẫu 10) và ở `improvement-backlog.md:306` (mẫu 30, ca #24). Hai câu khác nhau, nên là hai tham chiếu khác nhau trong 445.
- Thăm dò thêm, không dùng: để thử khóa chặt hơn (trùng chuỗi `ref`), tôi chạy thêm seed 20261117 (1 trùng theo (ref, nơi), 3 theo chuỗi ref) và 20261118 (0 theo (ref, nơi), 1 theo chuỗi ref). Không seed nào sạch theo khóa chặt, nên giữ khóa (ref, nơi xuất hiện) và seed 20261116. Hai seed thăm dò đó không dùng để chọn nhãn hay mẫu.

## Giao thức

- Với mỗi tham chiếu: đọc câu trong bài (tệp:dòng của bài), dòng thật do `--sample` in (`matchedLine`, sau sửa m3), và với các ca nghi ngờ đối chiếu thêm `git show ccc76cc0:<tệp>` quanh dải.
- Nhãn: **đúng ý** (dòng thật ủng hộ điều câu nói về ký hiệu), **lệch ý** (dòng thật khớp ký hiệu nhưng không ủng hộ điều câu nói), **không rõ** (không quyết được từ dòng/dải đã khớp).
- Cột "câu" là đoạn cắt quanh tham chiếu (khoảng 260 ký tự), không phải toàn bộ ô bảng.
- Một người đánh giá, chưa có người thứ hai; K4 sẽ tự kiểm 5 ca.

## Kết quả

| Đại lượng | k/30 | Ước lượng | CI 95 % Clopper–Pearson hai phía |
|---|---|---|---|
| lệch ý | 0/30 | 0,0 % | [0,0 %; 11,6 %] |
| cận bảo thủ (lệch ý + không rõ) | 2/30 | 6,7 % | [0,8 %; 22,1 %] |

- Đúng ý: 28; lệch ý: 0; không rõ: 2 (#16, #22).
- Lệnh: `node docs/research/scripts/clopper-pearson.mjs 0 30` → `[0,0 %; 11,6 %]` (cận trên 0,1157 = 1 − 0,025^(1/30)); `node docs/research/scripts/clopper-pearson.mjs 2 30` → `[0,8 %; 22,1 %]` (0,0082; 0,2207).
- Đây là ước lượng trên mẫu 30, không phải kết luận cho toàn bộ 445 tham chiếu. Không có ca lệch ý nên không sửa tham chiếu nào; tổng 445 và khóa `logic-map-refs-total` không đổi.
- Mẫu 10 của BRIEF-22c có 1 ca lệch ý; mẫu 30 này không có. Hai mẫu rời nhau nên không gộp thành một ước lượng.

## Bảng 30 tham chiếu

| # | tệp:dòng trong bài | câu | ref | ký hiệu | dòng thật (nguyên văn) | nhãn | lý do | sửa (commit) |
|---|---|---|---|---|---|---|---|---|

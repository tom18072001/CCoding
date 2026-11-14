# RUNLOG — chỉ số cấu trúc của quyết định chia việc (14/11/2026, người điều phối)

Phân loại dữ liệu: **Nội bộ**. Tệp trong thư mục này chỉ có số tổng hợp: không đề bài, không tiêu đề, không mã nhiệm vụ, không đường dẫn máy. Dữ liệu từng lượt **không** nằm trong repo.

## Nguồn

| Nhóm | Dữ liệu | Cách lấy | n |
|---|---|---|---|
| `P` | 57 nhiệm vụ trên server chính (6 dự án, mã dự án ẩn danh P1–P6), trích ngày 4/11/2026 qua API chỉ đọc. Cùng tệp nguồn với đợt P (`results/p-parallel/RUNLOG.md`) | Tệp trích nằm trên máy giám đốc và trong vùng tạm của người điều phối, không commit | 56 lượt phòng (dev 35, research 21) của nhiệm vụ `done` |
| `office` | Văn phòng phụ (dự án `ccoding-dev`, `ccoding-research`), nhiệm vụ `done` tới 14/11/2026 khoảng 16:20 +07: BRIEF-19, BRIEF-D14 (12/11), BRIEF-D15, BRIEF-20, BRIEF-D16 | Đọc `task.json`, `calls.jsonl` của từng nhiệm vụ (chỉ đọc) | 5 lượt phòng |

## Lệnh

```
node docs/research/analysis/decisions/decomp-metrics.mjs --p <tệp trích P> --office <thư mục runs của văn phòng phụ> --out bench/vs-claude/results/decisions/decomp-agg.json --rows <tệp từng lượt, không commit>
```

## Định nghĩa (mỗi lượt phòng = một kế hoạch)

- `n`: số hạng mục. `roots`: hạng mục không phụ thuộc. `maxDepth`: số hạng mục trên chuỗi phụ thuộc dài nhất.
- Thời lượng hạng mục: `finishedAt − startedAt`, gồm cả lần làm lại.
- `workSec` = Σ thời lượng; `spanSec` = từ hạng mục bắt đầu sớm nhất tới hạng mục xong muộn nhất; `cpSec` = đường găng theo `dependsOn` với thời lượng thật.
- `potentialSpeedup` = work / cp: mức song song tối đa mà **cấu trúc kế hoạch** cho phép, với thời lượng đã xảy ra.
- `achievedSpeedup` = work / span: mức song song đạt được.
- `slackOverCp` = span / cp − 1: thời gian vượt đường găng, do lập lịch, giới hạn luồng hay chờ gộp.
- `longestShare`: tỉ trọng của hạng mục dài nhất trong tổng thời lượng. `imbalance`: dài nhất / trung vị.
- `reworkShare`: tỉ lệ hạng mục có `attempts > 1`.
- `office` thêm:
  - model của lượt lập kế hoạch;
  - cổng phủ kế hoạch (chặn, lập lại);
  - review bị cổng chất lượng bỏ (`"không thuộc diện bắt buộc review"`);
  - kết luận nghiệm thu của CTO;
  - độ phủ hạng mục mã K… của đề bài: hạng mục có mã được nhắc trong ít nhất một hạng mục kế hoạch; với hạng mục nêu id agent có trong roster, có hạng mục giao đúng agent đó.

## Giới hạn

- Dữ liệu quan sát, không có đối chứng; không có phép kiểm.
- Thời lượng gồm cả thời gian chờ hạn mức nếu có.
- Phép đo độ phủ hạng mục đề bài dựa trên regex mã `K\d+`, nên có thể sót cách viết khác.
- `office` chỉ có 5 lượt và đều là việc phát triển chính CCoding.
- Các đề bài D14–D16 do người điều phối viết có dùng tên vai không có trong roster (`dev-backend`, `code-reviewer`). Những dòng đó không được tính vào mẫu số của độ phủ vai.

# Sổ chạy E2: thí điểm bộ bài cài lỗi (đợt 3e, V4-3e-E2)

Phân loại dữ liệu: **Nội bộ**. Bài tổng hợp, không có dữ liệu thật.

| Mục | Giá trị |
|---|---|
| Duyệt | Giám đốc duyệt đợt 3e lúc 10:02 ngày 4/11/2026, giờ VN |
| Server 7425 | worktree `../ccoding-3e` tại `1ab5514946048efe18c35b77e886feca5f5e4de5`. `git status` sạch, chỉ có `ccoding.local.json` (gitignore). Cấu hình: chỉ `claude-cli`, `useApiKey: true`, chặn web bằng `--disallowedTools WebFetch,WebSearch`, cổng 7425. Thư mục dữ liệu mới `ccoding-3e/data` |
| Runner | `run.mjs` của chính worktree `1ab5514`, `--work /tmp/vb3e`, `--timeout 20` |
| Claude Code CLI | 2.1.318 |
| Lệnh 1 | `--arms B7cab,B7cabO --tasks suite:gates --repeats 2` (24 lượt) |
| Lệnh 2 | `--arms B6 --tasks g3-qty-rename,g4-gb-unit --repeats 2` (4 lượt) |
| Thời gian | Lệnh 1 `2026-11-04T03:28:42Z` → `03:51:09Z`, exit 0. Lệnh 2 → `03:55:51Z`, exit 0 |

## Sai lệch quy trình

**4/11/2026 khoảng 10:31 giờ VN, người điều phối.**
- **Diễn biến:** khi kiểm tiến độ bằng `tail` của `run-1.log`, người điều phối thấy cột điểm của 6 lượt đầu (`[1/24]`…`[6/24]`). Runner in điểm ra log.
- **Ảnh hưởng:** không quyết định nào phụ thuộc vào các điểm này.
  - N của E4 đã cố định trước (R_E4 = 16, R_B6 = 32; §9 khối (a) bước 5).
  - E2 là thí điểm mô tả.
- **Cách xử lý từ lúc đó:** chỉ kiểm tiến độ bằng số dòng, đã lọc bỏ cột điểm. Sai lệch này giống V3-09.

## Kết quả chạy (không có điểm)

| Arm | Lượt `done` | Lỗi hạ tầng | Token có trọng số | USD quy giá Sonnet 5.5 | Model ghi nhận | Bản ghi cổng khác `null` (b02 / b10 / cto) |
|---|---|---|---|---|---|---|
| B7cab | 12/12 | 0 | 0,93 M | 2,05 | sonnet | 12 / 4 / 12 |
| B7cabO | 12/12 | 0 | 1,23 M | 2,78 (chưa tính phần Opus) | sonnet, opus | 12 / 6 / 12 |
| B6 | 4/4 | 0 | 0,53 M | 1,19 | haiku, sonnet | 4 / 4 / 4 |

- Wall-sum 0,45 giờ. Không chạm hạn mức hay hết credit.
- `costUsd` của arm CCoding vẫn bằng 0. SR-02 thuộc D11, chưa gộp.
- Phân tích (q̂, tỉ lệ bất đồng, mô tả) do Phòng Nghiên cứu làm theo §9 V4-3e-E2, bằng `docs/research/analysis/gates-pairs.mjs`.

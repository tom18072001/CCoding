# RUNLOG — E9-lite [Khám phá], đợt run1

Chạy theo lệnh khóa ở `docs/research/preregistration.md` §9 (các khối E9-lite của BRIEF-24 và 24b). Người chạy: người điều phối, theo ủy quyền của chủ dự án ngày 14/11/2026 16:44. Không chạy lại, không chọn lọc lượt.

## Bản ghim và môi trường
- Mã: worktree riêng trên máy chạy ở commit `fcd45f2a` (perf, sau khi gộp BRIEF-24 + 24b). `dist/` dựng bằng `npm ci` ngay trước khi chạy.
- `claude --version` = `2.1.318 (Claude Code)`. Script dừng nếu khác.
- `gold.json` sha256 `ee49fc5d…`, `labels.json` sha256 `40596992…`. Script so với giá trị khóa ở §9 trước khi chạy; lệch thì dừng.
- **Server CCoding riêng** (cổng 7441, thư mục dữ liệu riêng), tách khỏi văn phòng phụ và máy chủ chính.
  - Cấu hình runtime chỉ `claude-cli` (đăng nhập gói Max), giống bản ghim E7/E8.
  - `ANTHROPIC_API_KEY` và `ANTHROPIC_AUTH_TOKEN` được gỡ khỏi môi trường của tiến trình server trước khi khởi động.
- Lệnh (khớp §9):

      node bench/vs-claude/run.mjs --arms P-H,P-S,P-O --tasks g1-slug-dedupe,…,t5-logq --repeats 3 --seed e9lite-1 \
        --out bench/vs-claude/results/e9lite/run1 --runtime claude-cli --ccoding-url <server riêng> --ccoding-data <dữ liệu riêng> --timeout 30

- Thứ tự: `order-dry-run.txt` lưu bằng `--dry-run` trước lượt đầu (sha256 `a6aa656fc440a34491a37fcc8d0529b99acccde6463f27eec6ee20d3804d665c`).

## Nhật ký của script (nguyên văn)

    2026-11-14T22:55:19.4613247Z ban ghim fcd45f2a74abc394e4bfde667337033890fb3d1c, cli 2.1.318 (Claude Code); sha256: run.mjs=1435aaee61a5 plan-only.mjs=6d92021b2ad4 ccoding.mjs=f5c8bf16777c arms.json=14ecfe8990db gold.json=ee49fc5da243 labels.json=4059699277ab ccoding.local.json=0ee7b0a6b4ac
    2026-11-14T22:55:24.6061435Z server 7441 len (pid 4008)
    2026-11-14T22:55:24.8678729Z dry-run exit 0, thu tu luu o bench\vs-claude\results\e9lite\run1\order-dry-run.txt
    2026-11-15T00:12:47.4304355Z lan 1 exit 0, 114/117
    2026-11-15T00:15:49.5265272Z lan 2 exit 0, 116/117
    2026-11-15T00:16:50.6477997Z lan 3 exit 0, 117/117
    2026-11-15T00:16:50.7260304Z E9-lite xong: 117/117 khoa done
    2026-11-15T00:16:50.7410601Z het

## Số dòng
- `runs.jsonl`: **121 dòng** = **117 khóa `done`** (đủ 13 bài × 3 arm × 3 lần lặp) + **4 dòng `failed`** ở lần chạy đầu của khóa. Cả 4 khóa đó sau được chạy lại thành `done` theo quy tắc chạy lại của README và §9 (7).
- `authSource`: 117/117 dòng `done` là `none` (phiên đăng nhập CLI, không dùng khóa API); 4 dòng `failed` là `null`. Không lẫn nguồn xác thực ⇒ không có điều kiện dừng cả đợt.
- `planModel.match`: 0 dòng lệch model.
- `ccodingCommit` một giá trị (`fcd45f2a`); `claudeCliVersion` một giá trị.
- sha256 `runs.jsonl`: `bb004f1fda6247524db7015fe2d0a282905d28304eefc69c08e4c01001b436fc`.

## Bốn dòng `failed` (lượt đầu không `done`)

| Khóa | Giờ (UTC) | Nguyên nhân (attention của nhiệm vụ CCoding) | Sau đó |
|---|---|---|---|
| `t5-logq__P-H__r3` | 23:04:19 | `plan-unreadable`: cổng kế hoạch luật B (i), tóm tắt tự khai số hạng mục khác số phân tích được | chạy lại, `done` |
| `t2-orders__P-O__r3` | 23:37:22 | như trên | chạy lại, `failed` lần nữa |
| `l2-chain__P-O__r3` | 00:12:06 | như trên | chạy lại, `done` |
| `t2-orders__P-O__r3` | 00:14:49 | như trên (lần thứ hai của khóa) | chạy lại, `done` |

- Cả 4 là **do kế hoạch bị cổng chặn**, không phải lỗi hạ tầng (không có 403, hết hạn mức hay ngắt kết nối).
- Trường `error` của dòng `runs.jsonl` để trống. Nguyên nhân lấy từ `task.json` của nhiệm vụ CCoding tương ứng trong thư mục dữ liệu riêng của đợt (giữ trên máy chạy).
- Cách báo các lượt này trong phân tích là việc của BRIEF-25 (phụ lục bắt buộc).

## Người điều phối đã và chưa xem gì trong lúc chạy
- **Chỉ xem:** số dòng theo trạng thái, `authSource`, `planModel.match`, phiên bản; và `attention.reason` của 4 nhiệm vụ `failed` để phân loại hạ tầng hay không.
- **Không xem:** nội dung kế hoạch, độ phủ, số hạng mục theo arm, token theo arm. Không chạy `e9lite.mjs`.

## Làm sạch trước khi commit (repo công khai)
- `config.json`, `order-dry-run.txt`: thay đường dẫn tuyệt đối của máy chạy bằng `<máy-chạy>`. `order-dry-run.txt` đổi mã từ UTF-16 sang UTF-8 (đầu ra PowerShell).
- `runs.jsonl`: giữ nguyên byte, không có đường dẫn máy.
- `e9.log` (tiến độ từng lượt, có số hạng mục) không commit; giữ trên máy chạy.

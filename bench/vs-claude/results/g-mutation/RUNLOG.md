# Sổ chạy V4-3f-G: cổng lệnh kiểm tra trên lỗi cài bằng máy

Mốc khóa đăng ký trước: `f5a31dc` (§9 "Đăng ký trước V4-3f").

Phân loại dữ liệu: **Nội bộ**. Bài tổng hợp, không có dữ liệu thật. Không gọi LLM.

| Mục | Giá trị |
|---|---|
| Đầu vào | `results/study-cloud/runs.jsonl` sha256 `0dcee84066a9d9ee2d62a9ff36e594492f1f1dd62a5cbc9e607f24aec2a2cffb`; `results/study-cloud/artifacts/` (440 thư mục) |
| `g-mutation.mjs` | sha256 `a771f0121870522c95af006aac6b7732a896707b678c28085bac200f91c1628f` |
| `g-analyze.mjs` | sha256 `44c28b8f7230d8b86766377f5f2f3eaa43419e7c99d55abd6cd40353fee08760` |
| Máy | container Linux của phiên điều phối, 2 lõi, Node v22.23.4. Không dùng máy giám đốc (đợt 3e đang chạy ở đó) |
| Lệnh | `node docs/research/analysis/g-mutation.mjs --runs bench/vs-claude/results/study-cloud/runs.jsonl --artifacts bench/vs-claude/results/study-cloud/artifacts --tasks bench/vs-claude/tasks --out bench/vs-claude/results/g-mutation/g-mutation.jsonl --perRun 12 --seed 20261104 --jobs 2 --exclude t4-perf` |

## Sai lệch G-a (ghi 4/11 lúc 19:39, trong lúc chạy, trước khi tính G-1/G-2)

- **Phát hiện:** hạn 60 s cho `npm test` ngắn hơn hạn thật của B-02, là `tools.commandTimeoutSec` = 600 s (`src/config.ts`). Phát hiện khi xem tiến độ: có lượt `t4-perf` ở base. Theo §9, bộ test của bài này chạy khoảng 190 s.
- **Xử lý:**
  - G-1 và G-2: mọi lượt base có `vTimeout` được chạy lại `npm test` với hạn 600 s, đúng như B-02, bằng `g-rebase.mjs`. Kết quả lần chạy lại thay cho `vRed`. Số lượt chạy lại được báo.
  - G-3 không đổi. Lượt đủ điều kiện đột biến có base ≤ 30 s. Đột biến quá 60 s gần như chắc là treo, nên với hạn 600 s cũng đỏ. Số đột biến quá hạn được báo.
- Người điều phối chưa xem G-1/G-2 khi ghi mục này.

## Sai lệch G-b (ghi 4/11 lúc 20:12, sau khi có kết quả lần chạy chính, trước khi chạy lại)

- **Phát hiện khi kiểm công cụ:** đối chiếu kết quả test ẩn ở base với `pass` mà bộ chấm chính thức đã ghi trong `runs.jsonl`. Hai bên khớp ở 219/250 lượt. Lệch ở 31 lượt:
  - **`t3-api`, 30/30 lượt:** công cụ báo trượt, bộ chấm báo đạt. Nguyên nhân là artifact thiếu `data/seed.json`. `.gitignore` của repo bỏ mọi thư mục `data/`, nên tệp này không vào commit artifact. Bộ chấm chính thức chạy trên thư mục làm việc thật nên vẫn có tệp. Hệ quả: `t3-api` không có lượt nào đủ điều kiện, và vắng khỏi G-3 và G-1.
  - **`t5-logq__B7__r7`:** lần đầu trượt (57 test). Chạy lại 3 lần đều đạt. Lần đầu trùng lúc người điều phối chạy `npm test` của repo song song (19:44–19:47), nên nhiều khả năng do tranh CPU.
- **Quy tắc sửa, áp chung, không chọn theo kết quả:**
  - Trước khi đánh giá một lượt, chép vào bản sao những tệp của starter mà artifact không có. Không ghi đè tệp đã có. Kiểm toàn bộ artifact code: chỉ thiếu đúng `t3-api/data/seed.json`.
  - Chạy lại mọi lượt mà test ẩn ở base lệch với `pass` chính thức: 31 lượt. Dòng cũ của 31 lượt này được thay.
  - Các lượt khác giữ nguyên.
- **Kiểm độ lặp lại (thêm, mô tả):** chọn 200 đột biến theo hạt giống `20261104|repro`, đánh giá lại, rồi báo tỉ lệ khớp của cặp (lỗi thật, bị chặn).
- Kết quả lần chạy chính, trước khi sửa, được giữ ở `report-run1.md`.

## Chạy

| Lần | Thời gian (giờ VN, 4/11) | Ghi chú |
|---|---|---|
| Chính | 19:32 → 20:07 | 250 lượt, 2 tiến trình. Kết quả trước khi sửa: `report-run1.md` |
| G-a | 20:07 | 0 lượt base quá hạn 60 s, nên không có lượt nào chạy lại (`g-rebase.jsonl` rỗng) |
| G-b | 20:13 → 20:22 | Chạy lại 31 khóa ở `replace-keys.txt`, `g-mutation.mjs` sha256 `2cb16cc5780bd7807f36b89713762aca1f7ba6cf8e58c7ea8eae90c254c771fc` (thêm chép tệp starter còn thiếu và cờ `--replace`). Sau khi chạy, base test ẩn khớp `pass` chính thức ở 250/250 lượt |

**Tệp cuối:**
- `g-mutation.jsonl`: sha256 `782dc8b033b477f24f172509ac3962eec18e7072272b8685012b434919f92a51`.
- `g4-survivors.json` (kho lỗi lọt cổng, đông cứng cho E7): sha256 `8a16ae33eac5a1a8e70745084f327ffb1f7f37199ee995a1f1572a9eac4e0315`.
- `g-analyze.mjs` lúc báo: sha256 `f0fdb520d008d081da93cc19d13c84a3f043846d462c5215c79f754b6cabf7c8`. Bản này chỉ thêm `--rebase` so với bản khóa.

## Kết quả (theo §9 V4-3f khối G)

Đầu ra nguyên văn: `report.md` (`node docs/research/analysis/g-analyze.mjs bench/vs-claude/results/g-mutation/g-mutation.jsonl --rebase bench/vs-claude/results/g-mutation/g-rebase.jsonl`).

| Thước đo | Kết quả |
|---|---|
| Quy mô | 250 lượt có base; 209 đủ điều kiện đột biến (không tính `t4-perf`); **2 436 đột biến**, trong đó **2 097 là lỗi thật** (test ẩn trượt) thuộc **203 lượt, 9 bài** |
| **G-1, chặn nhầm** | **0/239** sản phẩm đúng có `npm test` đỏ (Clopper–Pearson 95 % [0; 1,5 %]) |
| **G-2, giao khi lệnh còn đỏ** | **0/250** lượt ở mọi arm. Agent đơn 0/70 [0; 5,1 %]; làn nhanh 0/60; làn đơn 0/60 |
| **G-3, recall của cổng** | **1 903/2 097 = 90,7 %** (bootstrap hai tầng 95 % [84,3; 95,9]). Nhóm A (agent đơn) 550/601 = 91,5 % [84,9; 96,8]; nhóm C (CCoding) 1 139/1 246 = 91,4 % [84,9; 96,5] |
| **G-3Δ, C − A** | **+0,8 điểm %** (bootstrap 95 % [−4,7; +7,4]), p hoán vị hai phía = **0,74**, 9 bài. **Không phân biệt được** |
| Theo bài | thấp nhất `c2-burst-alert` 73,2 %, `t2-orders` 78,4 %, `c5-tickets-api` 83,0 %; cao nhất `c4-audit-chain` 100 % |
| Theo toán tử | thấp nhất CRP (đổi hằng số) 82,1 %; cao nhất UOI 98,3 % |
| **G-4, lỗi lọt cổng** | **194** lỗi ở 95 lượt, 8 bài: `t2-orders` 57, `c2-burst-alert` 49, `c5-tickets-api` 35, `t3-api` 19, `c3-shop-bugs` 14, `t5-logq` 13, `t1-duration` 4, `c1-iis-ecs` 3 |

**Cách đọc (theo (7) của §9):**
- Trên bộ bài này, chạy test thật bắt khoảng 9/10 lỗi cài máy và không chặn nhầm. Nhưng bộ test do Claude Code đơn viết mạnh ngang bộ test của CCoding.
- Không lượt nào, kể cả Claude Code đơn, giao sản phẩm khi `npm test` còn đỏ. Vì vậy trên study-cloud, cổng bắt buộc **không có gì để chặn** thêm.
- Giá trị riêng mà CCoding còn có thể có ở trục nghiệm thu nằm ở **lớp agent nghiệm thu** với 194 lỗi lọt cổng (E7), và ở các bài mà agent dễ dừng khi còn đỏ (E4, g1).
- G-3 đo độ mạnh của bộ test, không đo CTO. Đột biến không đồng nhất với lỗi tự nhiên. Đơn vị độc lập là 9 bài.
- **Cho E7:** §9 đặt trần 8 lỗi mỗi bài và tối đa 1 lỗi mỗi lượt. Với hai trần đó, kho G-4 chỉ cho được 53 lỗi, chưa đủ 60. Nâng trần lên 10 mỗi bài thì được 65 lỗi. Phòng Nghiên cứu chốt trước khi lấy mẫu (BRIEF-19 K3).

## Kiểm độ lặp lại (G-b, mô tả)

`node docs/research/analysis/g-repro.mjs …` (sha256 `3102f4cb98257d8becfd41f2616fb6873b4785b92c5cccccfb427a2fd5022a71`) đánh giá lại 200 đột biến chọn theo hạt giống `20261104|repro`, lúc 20:14–20:24.
- Dựng lại đúng vị trí: 200/200.
- Khớp cả hai nhãn (lỗi thật, bị chặn): **200/200**.
- Đầu ra ở `g-repro.jsonl` và `repro.log`.

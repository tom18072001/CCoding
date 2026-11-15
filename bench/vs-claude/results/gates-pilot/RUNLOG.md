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

## Phân tích mô tả (K4, 4/11/2026)

Người làm: @data-scientist (T-20261104-110942-567, S3a). Chỉ đọc `runs.jsonl`; không chạy benchmark. Mô tả, không p, không suy diễn recall. Chi tiết và bảng đầy đủ: `docs/research/context/k4-e2-descriptive-b14-step2-n.md`.

**Lệnh** (từ gốc repo; cờ theo `preregistration.md` §9 V4-3e-E2 mục 6):

```
node docs/research/analysis/gates-pairs.mjs bench/vs-claude/results/gates-pilot/runs.jsonl --unit run --gate <b02|b10|cto> --negatives clean --label gate --out <gate>.csv
node docs/research/analysis/k4-e2-descriptive.mjs
node --test docs/research/analysis/gates-pairs.test.mjs   # 17/17 đạt
```

**Sáu lượt 'lỡ thấy điểm'** (6 dòng đầu của lệnh 1, theo thứ tự hoàn thành): g4-gb-unit__B7cabO__r1, g4-gb-unit__B7cab__r1, g1-slug-dedupe__B7cab__r1, g1-slug-dedupe__B7cabO__r1, g5-median-stats__B7cabO__r1, g5-median-stats__B7cab__r1. Danh sách này suy từ thứ tự dòng, không có khóa ghi sẵn ở mục "Sai lệch quy trình".

| Arm · cổng | Gộp: cặp · q̂ [CP 95 %] · bất đồng | Loại 6 lượt: cặp · q̂ [CP 95 %] · bất đồng |
|---|---|---|
| B7cab · b02 | 4 · 0/4 = 0,00 [0,00; 0,60] · 0/4 | 3 · 0/3 = 0,00 [0,00; 0,71] · 0/3 |
| B7cabO · b02 | 4 · 0/4 = 0,00 [0,00; 0,60] · 0/4 | 3 · 0/3 = 0,00 [0,00; 0,71] · 0/3 |
| B7cab · cto | 4 · 0/4 = 0,00 [0,00; 0,60] · 0/4 | 3 · 0/3 = 0,00 [0,00; 0,71] · 0/3 |
| B7cabO · cto | 4 · 0/4 = 0,00 [0,00; 0,60] · 0/4 | 3 · 0/3 = 0,00 [0,00; 0,71] · 0/3 |
| B7cab · b10 | 4 · n/a (nhãn theo bài) · 3/4 (chặn 1) | 3 · n/a · 2/3 (chặn 1) |
| B7cabO · b10 | 4 · n/a · 3/4 (chặn 1) | 3 · n/a · 2/3 (chặn 1) |
| B6 · b10 | 4 · n/a · 4/4 (chặn 0) | 4 · n/a · 4/4 (chặn 0) |

| Arm | Gộp: lượt · token có trọng số TB/lượt · test ẩn đạt | Loại 6: lượt · TB/lượt · test ẩn đạt |
|---|---|---|
| B7cab | 12 · 77.657 · 12/12 | 9 · 78.182 · 9/9 |
| B7cabO | 12 · 102.742 · 11/12 | 9 · 105.915 · 8/9 |
| B6 | 4 · 132.925 · 4/4 | 4 · 132.925 · 4/4 |

- q̂ = 0 ở mọi ô b02 và cto: lỗi cài đã được agent tự sửa trước cổng (`checksRed = 0`, `pass = true`). Không có dương thật, nên không nói gì về recall. Cận trên CP 0,60–0,71 vì n = 3–4.
- Với `--label task` (độ nhạy), b02 và cto đều có 8/8 cặp ref = 1, pred = 0; không đọc là cổng bỏ sót vì lỗi đã được sửa trước cổng.
- b10 có nhãn theo bài nên "bất đồng" chỉ nghĩa là cổng không chặn.
- E2 không có lượt sạch; không đánh giá được điểm dừng 'Có hại'. N của E4 giữ nguyên R = 16 (E4) và R_B6 = 32 (§9 khối (a) bước 5).
- Token có trọng số là `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`. Không so trực tiếp giữa B7cab và B7cabO (khác model ở pha `accept`).

**Định nghĩa arm** (nguồn `bench/vs-claude/arms.json`, chép nhãn):
- **B7cab:** "CCoding làn đơn, B-11(a)+(b)+(c) nghiệm thu brief + mẫu gọn + promptDiet"; `lane: single`, `slim: { accept: "brief", compactTemplate: true, promptDiet: true }`.
- **B7cabO:** "CCoding làn đơn, B7cab + CTO nghiệm thu bằng Opus (B-16, phaseModels.accept)"; như B7cab và thêm `phaseModels: { accept: "opus" }`.
- **B6:** "CCoding làn nhanh".

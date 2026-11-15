# Kiểm phạm vi D18d (T-20261114-221940-1bc)

Tiêu chí CTO: nhánh không sửa `bench/` và `docs/research/`. Dữ liệu: Nội bộ.
Gốc đối chiếu: commit đề bài `f6cec2cf`, không dùng `main` (xem mục giải thích 10109).

## Lệnh đã chạy và đầu ra rút gọn

| Lệnh | Kết quả |
|---|---|
| `git log --oneline f6cec2cf..HEAD` | Đúng 6 commit, đều mang mã T-20261114-221940-1bc: ee7048fd, 56c71715, cce65521, cccd85b4, f6b75870, f620774d |
| `git diff --stat f6cec2cf..HEAD` | 10 tệp, +238/−28 |
| `git diff --name-only f6cec2cf..HEAD -- bench docs/research` | **Rỗng** |
| `git status --porcelain` | **Rỗng** (trước khi thêm tệp này) |
| `npm run typecheck` | Không có lỗi (tsc --noEmit), pass |
| `npm test` | tests 800 · pass 797 · fail 0 · skipped 3 |

Skipped 3 khớp với K3 (2 test win32 và 1 test thiếu qpdf).

## 10 tệp thay đổi so với f6cec2cf

docs/ARCHITECTURE.md · docs/diagnostics/estimate-research.md · docs/diagnostics/skipped-tests.md · src/config.ts · src/orchestrator.ts · src/server.ts · test/accept-followup-d18b.test.ts · test/agent-probes.test.ts · test/audit-verify-unsigned.test.ts · test/estimate-check.test.ts

Không tệp nào thuộc `bench/` hay `docs/research/`.

## Bảng commit → tệp đã chạm

Dùng `git show -m --first-parent --name-only` cho từng commit, kể cả commit gộp.

| Commit | Loại | Tệp |
|---|---|---|
| f620774d | S1 (K1) | docs/diagnostics/estimate-research.md, src/config.ts, src/orchestrator.ts, test/estimate-check.test.ts |
| f6b75870 | gộp S1 | như f620774d |
| cccd85b4 | S3 (K3) | docs/diagnostics/skipped-tests.md, test/agent-probes.test.ts |
| cce65521 | gộp S3 | như cccd85b4 |
| 56c71715 | S2 (K2) | docs/ARCHITECTURE.md, src/orchestrator.ts, src/server.ts, test/accept-followup-d18b.test.ts, test/audit-verify-unsigned.test.ts |
| ee7048fd | gộp S2 | như 56c71715 |

Không commit nào chạm `bench/` hoặc `docs/research/`.

## Vì sao `git diff main...HEAD` ra 10109 tệp

- `git merge-base main HEAD` = `7980ae04`. `main` lệch xa nhánh.
- Giữa `7980ae04` và `f6cec2cf` có 1116 commit (các nhánh D18a/b/c trước đó). Thêm 6 commit của nhiệm vụ này thành 1122 commit trong `main..HEAD`.
- `git diff --shortstat main...HEAD` = 10109 tệp, +753553/−2303. Phần lớn là công việc của các nhiệm vụ trước, không phải của nhóm này.
- Hai tệp `bench/vs-claude/results/decisions/estimate-vs-actual.json` và `docs/research/BRIEF-D18d.md` do commit đề bài `f6cec2cf` thêm (`git show --stat f6cec2cf`: 2 tệp, +153). Đó là đầu vào của nhiệm vụ, không do thành viên sửa. Tính từ gốc `f6cec2cf` thì chúng không nằm trong diff.

## Verdict

```json
{
  "reviewer": "qa-tester",
  "task": "T-20261114-221940-1bc",
  "verdict": "Đạt",
  "criteria": [
    {
      "name": "Phạm vi",
      "result": "pass",
      "evidence": "git diff --name-only f6cec2cf..HEAD -- bench docs/research → rỗng; 6 commit đã kiểm từng cái, không chạm bench/ hay docs/research/; 10 tệp, +238/−28"
    },
    {
      "name": "Cây làm việc sạch",
      "result": "pass",
      "evidence": "git status --porcelain → rỗng"
    },
    {
      "name": "typecheck",
      "result": "pass",
      "evidence": "npm run typecheck → không lỗi"
    },
    {
      "name": "test",
      "result": "pass",
      "evidence": "npm test → tests 800, pass 797, fail 0, skipped 3"
    }
  ],
  "findings": []
}
```

# Phòng Dev, gói D21b: hiệu chỉnh lại ước lượng bằng dữ liệu thật (K3 của D21)

**Gói nhỏ: 2 hạng mục. Ngân sách 3M token.** Giao 15/11/2026.

**Căn cứ:**
- Biên bản CTO của D21: K3 chưa đạt. Phòng không đọc được `office-data` vì hook chặn đọc ngoài worktree, nên không thêm được dòng nào vào `estimate-vs-actual.json`.
- Người điều phối đã trích sẵn 12 nhiệm vụ đã xong (D18a tới BRIEF-24) vào `bench/vs-claude/results/decisions/estimate-vs-actual.json` (nay 17 dòng, xem `note2`). Mỗi dòng có:
  - ước lượng lúc lập kế hoạch: `estimate.tokens`, `basis` (theo hằng số hay theo lịch sử vai), `work`, `criticalPathEstimate`;
  - token thật của cả nhiệm vụ.
- Tỉ số thật/ước lượng của 12 dòng mới trải từ 0,45 tới 3,87. Ước lượng của các dòng mới phần lớn **theo lịch sử vai**, không theo hằng số. `runtimeFactor` chỉ nhân phần hằng số (D18d).

**Phạm vi:**
- **Được sửa:** `src/`, `test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/vs-claude/results/` (dữ liệu chỉ đọc).
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** việc nhỏ, giao một người; mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — senior-swe: tính lại và quyết định**
- **Tách dòng theo `basis`:** hằng số hoặc lịch sử vai.
  - Với nhóm hằng số: trung vị, khoảng tứ phân vị và n của tỉ số thật/ước lượng; so với `runtimeFactor['claude-cli'] = 5`.
  - Với nhóm lịch sử: cùng các số đó, cộng kiểm xem lệch có theo phòng, làn hay số hạng mục không.
- **Quy tắc đã khóa ở D21:** chỉ đổi mặc định khi n ≥ 5 và lệch hệ thống quá 1,5 lần; ngược lại giữ và ghi lý do.
  - Nếu nhóm lịch sử lệch hệ thống, đề xuất cách chỉnh (vd. tính cả vòng bổ sung và review vào lịch sử vai). Chỉ áp khi có test và đủ điều kiện trên.
- **Ghi lại:**
  - bảng và quyết định vào `docs/diagnostics/estimate-research.md`;
  - test trong `test/estimate-factor.test.ts` đọc đúng tệp dữ liệu và kiểm quy tắc.

**K2 — qa-tester: review**
- Kết luận theo mẫu JSON.
- Tự tính lại trung vị và n từ JSON; khớp bảng.
- Bỏ phần đổi hệ số (nếu có) thì test phải đỏ.

# Sổ chạy E5′: B-15 chính, họp ở làn đầy đủ ép (đợt 3e, V4-3e-E5′)

Phân loại dữ liệu: **Nội bộ**. Dữ liệu là bài tổng hợp, không có dữ liệu thật.

Sổ này ghi **trước lượt đầu**, lúc 4/11/2026 13:55 giờ VN. Khi đó chưa có lượt E5′ nào: kịch bản chờ E6 xong.

| Mục | Giá trị |
|---|---|
| Đăng ký | `docs/research/preregistration.md` §9, mục V4-3e-E5′, đặt trước dữ liệu, gộp ở `f36a1d9` |
| Duyệt | Giám đốc duyệt lúc 12:50 ngày 4/11 (`local-3e/RUNLOG.md`, commit `9e3c410`) |
| Cổng (3) | **(i)** D12 đã gộp ở `57148de026103e5fe9451ffc068650580bb4c399`. **(ii)** Test runtime giả "ép làn đầy đủ thì có `discuss`, thêm `discussionRounds: 0` thì không" (`bench/vs-claude/test/arms-full-lane.test.mjs`) xanh trong `npm run test:bench` 245/245. **(iii)** E6 xong: kịch bản chờ dòng "XONG phan sau" của `run3e-b.ps1`. **(iv)** Đã duyệt |
| Hash server và runner (9) | Worktree mới `C:\Users\admin\ccoding-vs-claude\ccoding-e5f`, detached ở `57148de`. `npm ci` và `npm run build` xong. Server và runner chạy chung worktree này, vì `ccodingCommit` lấy theo runner |
| Server | Cổng **7426**. `ccoding.local.json` chép từ `ccoding-3e` và chỉ đổi cổng; sha256 `D9B87197A3A687EDDDB6A7BA0C67D4DE5DD6C3878DA867C737D09B935D0867EA`. Thư mục dữ liệu `ccoding-e5f\data`. Không đụng 7420, 7425 |
| Claude Code CLI | 2.1.312 lúc ghi sổ. **Khi chạy là 2.1.318**: CLI đã tự cập nhật từ lúc bắt đầu E4b. Server log ghi `cli 2.1.318` lúc 5/11 02:07 |
| Lệnh | `run.mjs --arms B0F,B1F --tasks l1-modules,l2-chain --repeats k --timeout 40 --out bench\vs-claude\results\b15f-main`, chạy với k = 1, 2, …, 10. Runner bỏ qua khóa đã `done`, nên mỗi k chỉ chạy thêm lượt r_k |
| Kịch bản | `run3e-c.ps1` (bản sao ở đây), chạy nền từ 13:52, chờ E6 |
| Kiểm cổng | `check-e5f.mjs` (bản sao ở đây), sha256 `e22f5d5ec04a5cf5d8887ef146ca8e013cec270d95be34445a0776d9a0e612d1`. Chỉ đọc `arm`, `task`, `rep`, `status`, `byPhase`; không in điểm, token hay thời gian |
| Kiểm sau r1 | Dừng 1: B0F cặp đầu của bài nào không có `discuss` thì dừng. Kiểm nhiễu: thiếu pha cấu trúc, có pha lạ, hoặc B1F mất pha ngoài `discuss`, `finalize`, `revise` thì dừng |
| Kiểm sau r2…r10 | Dừng 2: một bài có ≥ 3 cặp bị loại theo (8) thì dừng. Khi dừng, kịch bản tạo `ccoding-e5f\STOP-E5F` và giám đốc được báo |
| Hạn mức | Runner thoát mã 3 thì chờ 20 phút rồi chạy tiếp. `STOP-3e` dừng cả kịch bản này |

## Sự cố trước lượt đầu (người điều phối, 4/11/2026 18:42 giờ VN)

- **18:17:** `run3e-b.ps1` tạo `STOP-3e` kèm `STOP-3e.auto` để bàn giao sau E4a. Đây là cơ chế đã ghi ở `local-3e/RUNLOG.md`.
- **18:22:** `run3e-c.ps1` hiểu nhầm tệp bàn giao này là lệnh dừng của giám đốc, nên tự thoát lúc đang chờ. **Lúc đó chưa có lượt E5′ nào.**
- **Cách sửa:** hàm `Stopped` bỏ qua `STOP-3e` khi có kèm `STOP-3e.auto`. Bản sửa nằm trong `run3e-c.ps1` ở thư mục này.
- **18:41:** chạy lại kịch bản, pid 47536. Kịch bản đang chờ E6 xong.
- Không đổi lệnh, arm, bài hay quy tắc dừng nào của V4-3e-E5′.

## Chạy r1 và dừng theo (3) (ghi 5/11/2026 khoảng 10:05 giờ VN)

- **02:07:** E6 xong ("XONG phan sau" lúc 02:05), nên `run3e-c.ps1` khởi động server 7426 (pid 12988, commit `57148de`) và bắt đầu r1.
- **02:30 và 02:50:** thoát mã 3 vì hạn mức; `l2-chain__B0F__r1` có 2 dòng `infra: rate-limit`. Lần 3 bắt đầu 03:10.
- **03:46:** r1 xong, 4/4 khóa `done`.

| Arm | Khóa `done` | Dòng không `done` | Token có trọng số | USD (`pricing.mjs`) | Thời gian thực |
|---|---|---|---|---|---|
| B0F | 2/2 | 2 hạn mức | 2,34 M | 5,66 | 0,63 giờ |
| B1F | 2/2 | 0 | 1,86 M | 4,55 | 0,36 giờ |

- **Kiểm sau r1** (`check-e5f.mjs --first`, chỉ đọc khóa `byPhase`):
  - **Dừng 1 đạt:** B0F có `discuss` ở cả hai bài.
  - Pha của B0F: `route/plan/discuss/finalize/execute/synthesize/accept`. Pha của B1F: `route/plan/execute/synthesize/accept`.
  - **Kiểm nhiễu không đạt:** pha cấu trúc `review` **vắng ở cả hai arm, cả hai bài**. Kịch bản tạo `STOP-E5F` lúc 03:46 và dừng, chờ giám đốc quyết, đúng (3).
- **Nguyên nhân (đọc mã ở `57148de`, chỉ đọc):** từ B-02, cổng chất lượng chạy **trước** reviewer. Khi lệnh kiểm tra xanh, mẫu đầu ra đạt và diff không chạm vùng bảo mật, orchestrator ghi `gate.review` với `decision: 'skip-reviewer'` và không gọi pha `review` ("không thuộc diện bắt buộc review", `src/orchestrator.ts` khối B-02 của làn đầy đủ).
  - Vì vậy `review` là pha **có điều kiện theo cổng**, giống `revise`. Đây không phải pha cấu trúc luôn có.
  - Danh sách `STRUCT` ở (3) và trong `check-e5f.mjs` đặt sai khi đưa `review` vào.
  - Hai arm vắng `review` như nhau, và B1F chỉ mất đúng hai pha họp. Như vậy so sánh họp với không họp không bị nhiễu bởi pha khác.
- **Chưa xem điểm.** Không lượt nào sau r1 được chạy.

## Giám đốc quyết và chạy tiếp (5/11/2026, ghi trước r2)

- **Quyết định:** khoảng 10:05, giám đốc chọn "Chạy tiếp, coi review là pha có điều kiện". Sai lệch ghi ở §9, mục V4-3e-E5′, "Sai lệch (3)".
- **`check-e5f.mjs` sửa:** bỏ `review` khỏi pha cấu trúc; `review` được khác giữa hai arm như `revise`. sha256 mới `87274600f6c2413d0ef29a7a7726c26c5ba102b9a838f32e121f0226da88112f`. Chạy lại `--first` trên r1: đạt (exit 0).
- **Ghim Claude Code CLI:** giám đốc duyệt tắt tự cập nhật. `DISABLE_AUTOUPDATER=1` đặt ở `env` của `~/.claude/settings.json`, ở biến môi trường người dùng, và ở tiến trình kịch bản chạy tiếp. Server 7426 khởi động lại để nhận biến này. Phiên bản ghi ở từng dòng (`claudeCliVersion`).
- **Thứ tự còn lại:**
  1. chạy lại 1 khóa thiếu của E6 (`t2-orders__B0__r3`, §4.1);
  2. E5′ r2…r10;
  3. bước 2 của B-14;
  4. E7, E8 (giám đốc duyệt lúc 10:05).

## Chạy tiếp (5/11/2026)

- **10:10:** `run3e-d.ps1` (pid 20892, `results/local-3e/scripts/run3e-d.ps1`) chạy với `DISABLE_AUTOUPDATER=1`.
  - Khởi động lại server 7425 (pid 20988, `6c454f6`) và server 7426 (pid 39844, `57148de`).
  - Chạy lại khóa thiếu của E6, xong lúc 10:14 (E6 đủ 56/56).
  - E5′: r1 bỏ qua vì đã xong. Kiểm `--first` bằng bản sửa: **đạt**. Bắt đầu **r2 lúc 10:14:52**.
- **Sự cố 10:16–10:18:** kịch bản của bước 2 B-14 bắt đầu nhầm khối 1 và chạy một phiên `claude` khoảng 1–2 phút song song với r2, rồi bị dừng (`b14-step2/RUNLOG.md`). Lượt r2 không bị dừng. Khi phân tích, ghi lượt r2 nào đang chạy trong khoảng này.
- **11:05:** r2 xong (exit 0), kiểm Dừng 2 đạt (2 cặp mỗi bài). Bắt đầu r3 lúc 11:05:25.

## Sự cố 11:10: ứng dụng Claude desktop khởi động lại (5/11/2026)

- **Hiện tượng:** lúc 11:51 kiểm định kỳ thấy không còn `run3e-d.ps1` (pid 20892), không còn `b14-run.ps1` (pid 44828), và không server nào nghe ở 7425, 7426, 7427 (cả 7420).
  - Tiến trình `claude.exe` của ứng dụng desktop mới được tạo lúc **11:10:38**. Máy không khởi động lại (lần khởi động gần nhất 29/10).
  - Các kịch bản được khởi chạy từ công cụ của ứng dụng, nên bị kết thúc cùng cây tiến trình của ứng dụng.
- **Ảnh hưởng tới dữ liệu:**
  - Lượt đầu tiên của r3 đang chạy khi bị giết, **chưa ghi dòng nào** vào `runs.jsonl`. Lúc đó tệp có 10 dòng: 8 `done`, 2 `infra` từ trước.
  - Nhiệm vụ dở trong data của server 7426 sẽ ở trạng thái "bị gián đoạn" khi server khởi động lại, và không tự chạy tiếp.
  - Phần hạn mức đã tiêu cho lượt dở không được ghi lại.
- **Xử lý, theo §4.1 (lỗi hạ tầng → chạy lại đúng khóa):**
  - **11:53:** chạy `run3e-e.ps1` (`results/local-3e/scripts/run3e-e.ps1`, pid 48492) bằng WMI (`Win32_Process.Create`), để kịch bản không nằm trong cây tiến trình của ứng dụng. Đã kiểm trước bằng một tiến trình thử: phiên 1, người dùng admin, `DISABLE_AUTOUPDATER=1`, CLI 2.1.318.
  - Server 7426 khởi động lại (pid 37628, `57148de`). r3 bắt đầu lại lúc 11:53:11; runner bỏ qua khóa đã xong.
  - Không đổi bài, arm, tham số hay quy tắc kiểm.
- Khi phân tích, ghi khóa r3 nào bị chạy lại sau sự cố.
- **11:53–18:14:** r3…r10 chạy bằng `run3e-e.ps1`, không có sự cố mới. Kiểm Dừng 2 sau mỗi cặp đều đạt: mỗi bài đủ k cặp, 0 cặp bị loại.

## Kết thúc (ghi 12/11/2026, không mở điểm)

- **18:14:15 ngày 5/11:** "E5F XONG 10 luot moi o", CLI 2.1.318. Nhật ký đầy đủ ở `results/local-3e/runlog-3e.txt`.
- **`runs.jsonl`: 42 dòng**, trong đó:
  - **40 `done`:** 10 cặp × 2 bài × 2 arm, mỗi khóa đúng một dòng;
  - **2 `infra`:** cùng khóa `l2-chain__B0F__r1`, hạn mức lúc 4/11 19:30 và 19:50. Khóa này đã chạy lại theo §4.1.
- **Lượt chạy lại sau sự cố 11:10:** lượt đầu của r3, bị giết khi chưa có dòng nào. Nó được chạy lại ở lần chạy r3 lúc 11:53, như mọi khóa chưa xong.
- **Thời gian:** lượt `done` đầu tiên 4/11 19:19 UTC, lượt cuối 5/11 11:14 UTC. Tổng `wallSec` của các lượt `done` là 7,98 giờ máy.
- **Chi phí quy đổi** (`costUsd` của runner, bảng giá `pricing.mjs`): 96,85 USD cho 40 lượt. Chỉ đọc trường chi phí; chi phí theo arm để dành cho phân tích.
- **CLI:** 2.1.318 ở mọi dòng (`claudeCliVersion`). Ghim bằng `DISABLE_AUTOUPDATER=1` từ 10:10 ngày 5/11.
- **Tệp:**
  - `runs.jsonl` cuối;
  - 40 thư mục `artifacts/<khóa>`;
  - `config-final.json`, là cấu hình của lần gọi runner cuối (`repeats` 10). `config.json` là của lần gọi đầu, giữ nguyên.
  - Hai cấu hình chỉ khác `repeats` và `startedAt`.
- **Phân tích:** theo §9 V4-3e-E5′, sau khi Phòng Nghiên cứu nhận dữ liệu. Chưa ai xem điểm hay token theo arm trước bước đó.

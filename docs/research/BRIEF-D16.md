# Phòng Dev, gói D16: tạm dừng đúng khi hết hạn mức 5 giờ, ghi đường xác thực, vá chỗ hở của bộ kiểm lệnh ở tầng `full`

**Gói vừa: 3 hạng mục + review. Ngân sách 8M token.** Giao 14/11/2026. Giám đốc 12/11: dùng tối đa hạn mức, chỉ cần kết quả cuối; "đã là đề tài thì phải fix hết, không để đề xuất sửa".
- **Được sửa:** `src/`, `test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/`, `docs/research/`.
- Không chạy benchmark, không gọi `claude -p` thật. Không đổi cơ chế đăng nhập, không thêm khóa API, không dùng 9router.
- Phân loại dữ liệu: **Nội bộ**.

## K1 — dev-backend: hết hạn mức 5 giờ giữa lượt làm việc phải tạm dừng nhiệm vụ, không đánh "thất bại"

**Hiện tượng (vận hành thật, 13/11/2026 23:55 giờ Việt Nam, văn phòng phụ, gói D15):**
- Hai lượt `execute` (S1, S2) chạy được một phần (có văn bản, có 5–8 lượt công cụ) rồi trả lỗi `You've hit your 5-hour limit · resets 1am (Asia/Bangkok)`.
- Mỗi hạng mục thử lại 2 lần trong khoảng 3 giây, đều lỗi, rồi bị đánh "thất bại".
- Trưởng phòng viết báo cáo tổng hợp cũng gặp lỗi đó, và báo cáo tổng hợp ghi chính thông báo lỗi ("Báo cáo tổng hợp đã xong: You've hit your 5-hour limit …").
- Nhiệm vụ kết thúc `failed` ("Còn 2 hạng mục chưa xong … bấm Tiếp tục"); sáng hôm sau phải bấm tiếp tục bằng tay.

**Kỳ vọng:** lỗi hạn mức ⇒ nhiệm vụ `paused` có giờ tự tiếp tục (đường tạm dừng do hạn mức đã có trong `src/orchestrator.ts`), không đốt lượt thử lại, không ghi báo cáo tổng hợp từ thông báo lỗi, token của lượt làm dở vẫn vào sổ.

**Ghi chú:** D15 (đã gộp) đã đổi hai chỗ liên quan: `call()` ném `RuntimeError` khi có `error` dù có `text`, và điều kiện tạm dừng do hạn mức không còn đòi `!result.text`. Có thể D15 đã sửa ca này, nhưng **chưa có test** cho đúng ca này.

**Việc:**
- Test bằng runtime giả: lượt `execute` trả `{ text: '<văn bản làm dở>', error: "You've hit your 5-hour limit · resets 1am (Asia/Bangkok)", usage > 0, toolCalls ≥ 1 }`. Phải ra:
  - nhiệm vụ `paused`, không `failed`, có thời điểm tự tiếp tục;
  - hạng mục không bị đánh lỗi, không có lượt thử lại tức thì;
  - không có tệp FINAL;
  - usage của lượt làm dở vẫn được ghi.
- Cùng thông báo ở khâu báo cáo tổng hợp: không ghi FINAL từ thông báo lỗi.
- Giờ tự tiếp tục: test phải ghi rõ đang dùng giờ đọc từ thông báo ("resets 1am (Asia/Bangkok)") hay `quotaCooldownMs`. Nếu chưa đọc được giờ từ dạng thông báo này thì thêm bộ đọc (múi giờ IANA trong ngoặc; giờ đã qua trong ngày thì lấy ngày hôm sau), kèm test.
- Test đỏ ⇒ sửa `src/` cho xanh. Test xanh ngay ⇒ giữ test và ghi một dòng vào `docs/diagnostics/claude-cli-403.md` (hoặc tệp chẩn đoán mới) rằng D15 đã sửa ca này.

## K2 — dev-backend: ghi đường xác thực của mỗi lượt `claude-cli` (đề xuất của ghi chú chẩn đoán D15, nay làm)

- Đọc trường `apiKeySource` của sự kiện `system/init` trong luồng `stream-json` của `claude-cli`. Ghi nó vào bản ghi lượt gọi dưới tên `authSource`, cùng chỗ đang ghi model và usage.
- Chỉ ghi **nhãn** (vd. `none`, `ANTHROPIC_API_KEY`). **Không bao giờ** ghi giá trị khóa hay token, cũng không ghi giá trị biến môi trường.
- Khi lỗi xác thực (kind `auth`), thông báo lỗi kèm `authSource` và các cờ chẩn đoán an toàn mà `docs/diagnostics/claude-cli-403.md` đã liệt kê (có hay không `CI`; có hay không biến tắt lưu lượng không thiết yếu). Chỉ ghi có/không, không ghi giá trị.
- Nếu `authSource` cho thấy CLI dùng khóa API trong khi cấu hình không bật `useApiKey`, ghi một sự kiện cảnh báo (mức `warn`).
- Test:
  - init có `apiKeySource` ⇒ bản ghi lượt gọi có `authSource`;
  - không có init ⇒ không lỗi, `authSource` vắng;
  - không giá trị bí mật nào lọt vào log; dùng chuỗi mẫu giả, không dùng khóa thật.
- Cập nhật `docs/RUNTIMES.md`.

## K3 — dev-backend (security): vá chỗ hở của bộ kiểm lệnh shell ở tầng `full`

**Căn cứ (đo 14/11/2026, trục 2 phần b, bộ tấn công bên ngoài):**
- Ở tầng `full`, bộ kiểm cho qua mọi lệnh **ghi hoặc xóa tại đường dẫn tuyệt đối kiểu POSIX ngoài thư mục làm việc**: tải tệp bằng `wget -O /usr/…`, `cp` tệp hệ thống sang `/usr/…`, `rm` tệp trong `/etc`, `/var/log`, `/root`.
- Lý do theo mã: `outsidePathReason` (`src/tools/shell-policy.ts`) chỉ nhận đường dẫn tuyệt đối dạng ổ Windows, MSYS `/c/…`, UNC, `~`, `$HOME`; đường dẫn `/usr/…`, `/etc/…` không bị coi là ngoài thư mục làm việc.
- Ngoài ra, thư mục hệ thống trong `systemDirs()` (SystemRoot, ProgramFiles, thư mục tạm…) được phép cho **mọi** thao tác, kể cả ghi và xóa.

**Việc:**
- Chặn lệnh **ghi, xóa, đổi quyền** nhắm vào đường dẫn ngoài thư mục làm việc. Áp cho cả đường dẫn POSIX tuyệt đối và thư mục hệ thống Windows.
- Đích ghi gồm ít nhất:
  - `rm`/`del`/`rmdir`/`Remove-Item`;
  - đích của `cp`/`mv`/`Copy-Item`/`Move-Item`;
  - chuyển hướng `>`, `>>`, `tee`;
  - `wget -O`/`--output-document`, `curl -o`/`--output`, `Invoke-WebRequest -OutFile`;
  - `chmod`/`chown`, `ln`, `dd of=`.
- **Vẫn cho** đọc và chạy từ thư mục hệ thống:
  - `ls /usr/bin`, `cat /etc/os-release`, `/usr/bin/env node x.js`, chạy `node` hay `git` theo đường dẫn tuyệt đối;
  - ghi vào `/dev/null` và thư mục tạm (giữ như hiện nay);
  - mọi thao tác trong thư mục làm việc, kể cả `wget -O vendor/x.js https://…`.
- `rule` của sự kiện chặn: dùng tên mới (vd. `outside-root-write`) để log tách được với `outside-root` cũ.
- Test:
  - thêm ca **tự viết** cho mỗi dạng chặn mới, cả Bash lẫn PowerShell, và ca phải cho qua như trên;
  - mọi ca ALLOWED/DENIED hiện có vẫn đúng.
  - **Không chép** lệnh của bộ RedCode vào test: bộ này dùng để đo lại sau khi vá.
- Ghi vào tài liệu chính sách công cụ (`docs/`):
  - quy tắc mới;
  - giới hạn: đây là phân tích chuỗi lệnh, không phải phân tích shell đầy đủ; biến, `eval` hay lệnh lồng vẫn lách được; sandbox hệ điều hành (B-18) là lớp chính.
- Không đổi hành vi tầng `git-read`. Không đổi `denyCommands` của dự án.

## K4 — code-reviewer

- Review K1–K3.
- Với K3: thử thêm ít nhất 10 lệnh dev thường gặp (`npm test`, `node --test`, `git diff`, `npx tsc`, `cat package.json`, `ls node_modules/.bin`, …) và xác nhận không bị chặn nhầm.
- 🧪 Lệnh kiểm tra của dự án: `npm run typecheck`, `npm test` phải xanh.

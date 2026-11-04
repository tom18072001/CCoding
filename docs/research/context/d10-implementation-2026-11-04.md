# D10: nhật ký triển khai (B-18, B-19, B-12)

Phân loại dữ liệu: Nội bộ. Mục này do S0 (@devops) viết; các hạng mục khác bổ sung phía dưới.

## Spike G1 (sandbox-spec §d.0), không xâm lấn

Máy giám đốc, Windows 11 Pro 10.0.26300, kiểm ngày 2026-11-03. Không cài gì, không chạy `claude -p`.

| Lệnh | Exit | Đầu ra thật |
|---|---|---|
| `wsl -l -v` | 0 | `* docker-desktop  Running  2` (đầu ra gốc là UTF-16, đã bỏ byte NUL khi chép) |
| `claude --version` | 0 | `2.1.312 (Claude Code)` |
| `claude --help` (lọc `settings`) | 0 | `--settings <file-or-json>  Path to a settings JSON file or a JSON string to load additional settings from` |

Không lệnh nào bị hook chặn.

### Đối chiếu
- Phiên bản 2.1.312 ≥ 2.1.219 (ngưỡng `strictAllowlist`): **đạt**.
- `--settings` nhận "JSON string" (cùng cơ chế `buildClaudeArgs` đang dùng). `--help` không liệt kê khóa nào bên trong, nên chưa thể khẳng định từ `--help` rằng khóa `sandbox` được nhận. Tài liệu (`docs/research/sandbox-sources.md` dòng 81, C6, nguồn S-01) nói `sandbox.*` là khóa của `settings.json`; `--settings` nạp "additional settings" cùng lược đồ. Đây là suy luận từ tài liệu, **chưa kiểm bằng chạy thật**.
- WSL2 có bật, nhưng distro duy nhất là `docker-desktop`, distro nội bộ của Docker Desktop, không dành cho chạy Claude Code (không phải nơi cài `claude`, bubblewrap, socat). Chưa có distro dùng được (ví dụ Ubuntu).

### Kết luận G1: chưa xác định
- Phần phiên bản: đạt. Phần `--settings` nhận `sandbox`: chưa xác định (chỉ có bằng chứng tài liệu). Phần WSL2: không đạt tại thời điểm này (chưa có distro dùng được); cần giám đốc duyệt riêng việc cài distro.
- Việc đóng G1 cần: (1) cài distro WSL2 + `claude` + bubblewrap/socat trong đó (giám đốc duyệt); (2) một lượt chạy thật có sandbox để xác nhận khóa `sandbox` được nhận.

### Hệ quả cho backend WSL2
- S1 vẫn dựng khóa `sandbox` và test bằng fake; không cần làm lại.
- Backend WSL2 (`toWslPath`, `wrapForWsl`) đánh dấu "chưa kiểm trên máy thật".
- `sandboxAvailable()` trên máy này phải trả `ok:false` (không có distro dùng được) nên khi bật `osSandbox.enabled` sẽ fail-closed: lỗi tiếng Việt, ghi `sandbox.unavailable`, không chạy. Đây là hành vi đúng.
- Việc còn mở cho S7: thêm "cài distro WSL2 để đóng G1" vào danh sách chờ giám đốc duyệt. Khi chọn distro, `wsl -l -v` phải lọc bỏ `docker-desktop` và `docker-desktop-data`.

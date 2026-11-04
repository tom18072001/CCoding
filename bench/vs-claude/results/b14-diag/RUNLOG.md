# Sổ chạy E1: chẩn đoán cache claude-cli (đợt 3e, V4-3e-E1)

Phân loại dữ liệu: **Nội bộ**. Lời nhắc giả, không có dữ liệu thật.

| Mục | Giá trị |
|---|---|
| Duyệt | Giám đốc duyệt đợt 3e lúc 10:02 ngày 4/11/2026, giờ VN |
| Kho | `perf/vs-claude-loop` tại `a4665c6`; `npm run build` exit 0 |
| Claude Code CLI | 2.1.318 |
| Lệnh | `node bench/vs-claude/cache-diagnostic.mjs --model sonnet --out bench/vs-claude/results/b14-diag/diag.csv` |
| Lần 1 | Khởi động 10:04 giờ VN bằng `nohup`. Môi trường dừng tiến trình, không có CSV hay log. Ước tính khoảng 3 lượt `claude -p`; ghi sai lệch ở `preregistration.md` §9 |
| Lần 2 | `2026-11-04T03:09:43Z` → `03:26:36Z`, tiến trình nền do công cụ quản lý; exit 0; 7 lượt `claude -p` (1 khởi động + 6 đo), không dùng lượt dự phòng |

## Kết quả (`diag.csv`)

h = CR/(CR+CW+IN) của **lượt 2** mỗi cặp. Ngưỡng diễn giải chép từ `analysis/cache-diagnostic-spec.md` 1.4.

| Cặp | Thay đổi giữa lượt 1 và 2 | CW lượt 2 | CR lượt 2 | h lượt 2 | So với dự kiến |
|---|---|--:|--:|--:|---|
| (a) | giống hệt | 815 | 40 059 | 0,98 | khớp: h ≥ 0,9, cache dùng được qua `claude -p` |
| (b) | khác bộ công cụ | 41 464 | 0 | 0,00 | khớp G1: đổi bộ công cụ làm vỡ **toàn bộ** tiền tố |
| (c) | khác `cwd` | 815 | 40 063 | 0,98 | khớp: h(a) − h(c) = 0,00 ≤ 0,05, `cwd` không phá cache |

**Diễn giải theo bảng của CD 1.4:**
- **Nguồn ghi cache:** phần ghi lại cache của mỗi lượt claude-cli đến từ **bộ công cụ thay đổi theo pha**, không đến từ thư mục làm việc (`cwd`).
- **Hệ quả:** ứng viên giảm chi phí là công tắc `runtimes.claude-cli.stablePrefix`. Công tắc này giữ một bộ công cụ cho cả nhiệm vụ và để hook chặn theo pha (B-14b, mặc định tắt).
- **Còn phải đo:** hiệu quả thật cần A/B ở bước 2 của B-14, với mục §9 riêng trước lượt đầu. E1 không ước lượng mức tiết kiệm.
- **Chưa xác định:** TTL thật. Trường usage không có thông tin TTL, nên vẫn chưa kiểm chứng được.
- **Giới hạn:** n = 1 mỗi cặp, nên đây chỉ là chẩn đoán có hoặc không.

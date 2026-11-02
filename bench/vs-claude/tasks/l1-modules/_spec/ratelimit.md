## Module `ratelimit` — giới hạn tần suất (token bucket và cửa sổ trượt)

Tệp: `src/ratelimit/index.js` (ESM, named export, không thêm thư viện ngoài). Module độc lập, không import module khác. **Đồng hồ chỉ đến từ tùy chọn `now`** — hàm `() => số mili giây` do người gọi tiêm vào; module không được dùng `Date.now`, `setTimeout`, `setInterval`. Giả định `now()` trả số nguyên mili giây tăng dần (xem "đồng hồ lùi" ở dưới).

Hai hàm tạo bộ giới hạn: `createTokenBucket(options)` và `createSlidingWindow(options)`. Mỗi bộ giới hạn quản lý **nhiều khóa độc lập** (`key`: chuỗi không rỗng). Cả hai trả đối tượng có cùng các phương thức:

| Phương thức | Ý nghĩa |
|---|---|
| `take(key, cost = 1)` | thử tiêu `cost` đơn vị cho `key`; trả `{ allowed, retryAfterMs, remaining }` |
| `peek(key, cost = 1)` | như `take` nhưng **không tiêu, không tạo khóa** |
| `reset(key)` | xóa trạng thái của `key`; trả `true` nếu khóa có tồn tại, ngược lại `false` |
| `sweep()` | dọn các khóa đã hết hạn (định nghĩa riêng từng loại); trả số khóa đã xóa |
| `size()` | số khóa đang được lưu (kể cả khóa hết hạn chưa được `sweep`) |

Kết quả `{ allowed, retryAfterMs, remaining }`:
- `allowed` (boolean): có được phép không.
- `retryAfterMs`: `0` nếu `allowed`; ngược lại là số mili giây **nguyên, làm tròn lên (ceil)** phải chờ rồi mới có thể `take` cùng `cost` thành công (nếu không có ai khác dùng khóa đó). Chờ đúng `retryAfterMs` thì lần `take` sau chắc chắn được phép.
- `remaining`: số đơn vị nguyên còn lại sau thao tác (xem từng loại). Với `peek`, là số còn lại **hiện tại** (chưa trừ `cost`).

Lần `take` bị từ chối **không tiêu gì**. `take` trên khóa chưa có sẽ tạo khóa; `peek` thì không.

### Kiểm tra đầu vào (thứ tự: khóa → `cost` → `cost` so với sức chứa)

- `key` không phải chuỗi hoặc là chuỗi rỗng → `Error` có `code = "RL_INVALID_KEY"`.
- `cost` (khi truyền, `undefined` = 1) không phải số nguyên ≥ 1 → `code = "RL_INVALID_COST"`.
- `cost` lớn hơn sức chứa (`capacity` của bucket / `limit` của cửa sổ) — không bao giờ thỏa được → **ném** `code = "RL_COST_EXCEEDS_CAPACITY"` (không trả `allowed: false`, không tạo khóa). `cost` đúng bằng sức chứa là hợp lệ.
- Tùy chọn sai khi tạo (xem dưới) → `code = "RL_INVALID_OPTIONS"`. `createTokenBucket()` không đối số cũng là `RL_INVALID_OPTIONS`.

### `createTokenBucket({ capacity, refillAmount = 1, refillIntervalMs = 1000, now })`

`capacity`, `refillAmount`, `refillIntervalMs` là số nguyên ≥ 1; `now` là hàm bắt buộc.

- Khóa mới bắt đầu **đầy** (`capacity` token). Bucket được nạp **liên tục**: mỗi `refillIntervalMs` mili giây thêm `refillAmount` token, tức `refillAmount / refillIntervalMs` token mỗi ms, tính cả phần lẻ, không vượt `capacity`. Tính toán phải chính xác (khuyến nghị dùng số nguyên: nhân mọi lượng token với `refillIntervalMs`) để `retryAfterMs` không bị sai do số thực.
- `take`: nạp bù theo thời gian từ lần cập nhật trước, rồi nếu token ≥ `cost` thì trừ `cost` và `allowed: true`. Ngược lại `allowed: false`, `retryAfterMs = ceil((cost − token hiện có) × refillIntervalMs / refillAmount)`.
- `remaining` = phần nguyên (floor) của số token (kể cả phần lẻ đang nạp dở) sau thao tác.
- **Đồng hồ lùi:** nếu `now()` nhỏ hơn thời điểm cập nhật trước của khóa, coi như không có thời gian trôi qua và **giữ nguyên** mốc cập nhật cũ (không lùi mốc).
- **Khóa hết hạn:** khóa mà bucket đã nạp đầy lại (token = `capacity` tại thời điểm `sweep`) — tương đương khóa mới. `sweep()` xóa các khóa này.

Ví dụ (`capacity: 5`, mặc định nạp 1 token/giây, đồng hồ bắt đầu 0): 5 lần `take("k")` đầu cho `remaining` 4, 3, 2, 1, 0; lần thứ 6 → `{ allowed: false, retryAfterMs: 1000, remaining: 0 }`. Với `{ capacity: 6, refillAmount: 3, refillIntervalMs: 2000 }` và bucket vừa cạn: `take` 1 token cần chờ `ceil(2000/3)` = 667 ms (ở 666 ms vẫn bị từ chối, `retryAfterMs` = 1).

### `createSlidingWindow({ limit, windowMs, now })`

`limit`, `windowMs` là số nguyên ≥ 1; `now` là hàm bắt buộc.

- Cửa sổ trượt **chính xác theo từng sự kiện**: mỗi lần `take` thành công ghi một sự kiện `{ t: now(), cost }`. Một sự kiện tại thời điểm `t` được tính trong cửa sổ khi `t > now − windowMs`, tức hết hiệu lực **đúng** tại `t + windowMs`.
- `used` = tổng `cost` các sự kiện còn hiệu lực. `take` được phép khi `used + cost ≤ limit`. `remaining` = `limit − used` sau thao tác (với `peek`: trước khi trừ `cost`).
- Bị từ chối: `retryAfterMs` là thời gian đến lúc đủ sự kiện cũ hết hiệu lực để `used + cost ≤ limit`: duyệt sự kiện từ cũ đến mới, cộng dồn `cost` đến khi cộng dồn ≥ `used + cost − limit`; với sự kiện cuối cùng đó, `retryAfterMs = ceil(t + windowMs − now())`.
- `take`/`peek` bỏ các sự kiện hết hiệu lực của khóa đó. Không quy định gì khi đồng hồ lùi.
- **Khóa hết hạn:** khóa không còn sự kiện hiệu lực nào tại thời điểm `sweep`. `sweep()` xóa các khóa này (và dọn sự kiện hết hiệu lực của khóa còn lại).

Ví dụ (`limit: 3`, `windowMs: 1000`): ba lần `take("k")` tại t=0 cho `remaining` 2, 1, 0; lần thứ tư tại t=0 → `{ allowed: false, retryAfterMs: 1000, remaining: 0 }`; tại t=999 → `retryAfterMs: 1`; tại t=1000 → được phép.

### Mã lỗi

| Mã | Khi nào |
|---|---|
| `RL_INVALID_KEY` | `key` không phải chuỗi không rỗng |
| `RL_INVALID_COST` | `cost` không phải số nguyên ≥ 1 |
| `RL_COST_EXCEEDS_CAPACITY` | `cost` > `capacity` / `limit` |
| `RL_INVALID_OPTIONS` | tùy chọn tạo bộ giới hạn thiếu hoặc sai kiểu/miền giá trị |

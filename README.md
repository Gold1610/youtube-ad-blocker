# TubeShield - YouTube Ad Blocker (Manifest V3)

Extension chặn quảng cáo YouTube tự viết theo chuẩn Chrome Manifest V3, kết hợp 4 lớp bảo vệ gọn nhẹ và bảng điều khiển popup trực quan.

## Kiến trúc 4 lớp

1. **Lớp Player JSON (MAIN world):** Chặn `adPlacements`, `playerAds`, `adSlots`, `adBreakHeartbeatParams` trong `ytInitialPlayerResponse`, `ytInitialData`, `fetch` và `XMLHttpRequest` của `/youtubei/v1/*` trước khi video phát.
2. **Tự động tua & Skip thông minh (ISOLATED world):** Nếu quảng cáo server-side (SSAI) lọt qua, tự động tắt tiếng tạm (nhớ đúng trạng thái `muted`/`volume` trước đó của bạn), tua 16x đến cuối, bấm nút Bỏ qua, rồi khôi phục âm lượng gốc khi vào video chính.
3. **Ẩn giao diện quảng cáo (CSS):** Ẩn banner, masthead ad, thẻ tài trợ trang chủ/tìm kiếm/sidebar và popup nhắc chặn quảng cáo.
4. **Chặn mạng quảng cáo (DeclarativeNetRequest):** Chặn các request quảng cáo (`doubleclick.net`, `googlesyndication.com`, `googleadservices.com`, `youtube.com/pagead/`, `imasdk.googleapis.com`, v.v.) chỉ giới hạn trong phạm vi YouTube. Có công tắc bật/tắt riêng trong popup.

## Cách cài đặt vào Chrome / Edge

1. Mở `chrome://extensions` (hoặc `edge://extensions`).
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Chọn **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục dự án `youtube-ad-blocker` này.
5. Tải lại tab YouTube đang mở (`F5`).

## Kiểm thử

```bash
npm test
```

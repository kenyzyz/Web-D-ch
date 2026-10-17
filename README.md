# EasyTalk Translator - Tối Ưu Độ Trễ Siêu Thấp & Phiên Dịch 2 Chiều Đa Ngôn Ngữ

Website phiên dịch trực tiếp hai chiều hỗ trợ 5 ngôn ngữ chính:
- 🇻🇳 **Tiếng Việt** (`vi-VN`)
- 🇺🇸 **Tiếng Anh** (`en-US`)
- 🇨🇳 **Tiếng Trung phổ thông** (`zh-CN`)
- 🇹🇭 **Tiếng Thái** (`th-TH`)
- 🇰🇷 **Tiếng Hàn** (`ko-KR`)

---

## ⚡ Các Kỹ Thuật Tối Ưu Hóa Độ Trễ Siêu Thấp (Low-Latency Architecture)

1. **Truyền luồng ký tự trực tiếp (Server-Sent Events - SSE Streaming):**
   - Endpoint `/api/translate-stream` truyền từng token ngay khi model sinh ra.
   - Giảm chỉ số **TTFT (Time-to-First-Token)** xuống mức **~200ms - 300ms**, người dùng nhìn thấy bản dịch xuất hiện ngay lập tức mà không phải chờ dịch xong toàn bộ câu.

2. **Cấu hình Model Gemini Flash Tối Ưu:**
   - Sử dụng model `gemini-3.8-flash` với cấu hình `thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }`, nhiệt độ `temperature: 0.1` và `maxOutputTokens: 300`.
   - Prompt tối giản yêu cầu trả về trực tiếp bản dịch đích, loại bỏ hoàn toàn các câu chào hỏi, giải thích rườm rà.

3. **Tạo Pinyin tức thời (< 2ms) không làm chậm bản dịch:**
   - Sử dụng thư viện `pinyin-pro` chạy song song ngay tại client trên luồng ký tự đang đến, sinh Pinyin có dấu thanh điệu chuẩn xác (ā, á, ǎ, à) tức thì mà không cần chờ round-trip từ máy chủ.

4. **Nhận diện dứt câu siêu nhanh (Quick Silence Cutoff - 650ms):**
   - Thay vì chờ 2 - 3 giây im lặng của trình duyệt mặc định, bộ đếm phát hiện khoảng lặng nhanh 650ms (có thể điều chỉnh trong cài đặt từ 400ms đến 1500ms) sẽ tự động chốt câu và gửi dịch ngay.

5. **Kích hoạt tức thời với từ khóa "dịch" (Zero-Wait Keyword Cutoff):**
   - Khi nói tiếng Việt kết thúc bằng từ *"dịch"* (ví dụ: *"Bạn có thể cho tôi biết nhà ga ở đâu, dịch."*), hệ thống bắt được từ khóa ngay trong luồng nhận dạng giọng nói, bóc tách từ điều khiển và kích hoạt dịch lập tức mà không chờ thời gian im lặng.

6. **Hỗ trợ ngắt lời (Barge-in / Interrupt):**
   - Khi hệ thống đang đọc to bản dịch qua loa, nếu người dùng bắt đầu nói hoặc bấm nút Micro, âm thanh sẽ lập tức dừng phát (`stopSpeaking()`) để tiếp tục lượt nói mới, không gây khóa giao diện hoặc vọng âm ngược.

7. **Bảng đo độ trễ chi tiết 5 giai đoạn & Phân vị 95 (p95):**
   - Đo lường riêng biệt:
     - **STT (ms)**: Thời gian từ lúc nói đến khi nhận diện văn bản hoàn tất.
     - **API Flight (ms)**: Thời gian truyền gói tin mạng đến máy chủ.
     - **TTFT (ms)**: Thời gian từ lúc gửi đến khi nhận ký tự dịch đầu tiên.
     - **Total API (ms)**: Tổng thời gian hoàn tất bản dịch.
     - **Pinyin (ms)**: Thời gian sinh Pinyin có dấu (< 2ms).
     - **TTS Start (ms)**: Thời gian chuẩn bị và kích hoạt âm thanh phát ra loa.
     - **Total E2E (ms)**: Tổng độ trễ toàn trình.
   - Tự động thống kê: Trung bình (Avg), Phân vị 95 (p95), Thấp nhất (Min), Cao nhất (Max).

---

## 🔌 3 Nút Cấu Hình Bộ Máy Dịch Thuật (API Engines)

Hệ thống hỗ trợ 3 tùy chọn Engine dịch thuật linh hoạt:

1. **Google Gemini Flash (Khuyến nghị)**
   - Sử dụng Google Gemini 3.8 Flash qua kết nối SSE Streaming từ backend.
   - Thích hợp nhất cho giao tiếp tự nhiên và phản hồi siêu nhanh.
   - Cấu hình qua biến môi trường: `GEMINI_API_KEY`.

2. **Google Cloud Translation Proxy**
   - Kết nối cổng dịch chuyên dụng của Google Cloud Translation.
   - Cấu hình qua biến môi trường: `GOOGLE_CLOUD_TRANSLATE_API_KEY`.

3. **Dự phòng Cục bộ Siêu tốc (Local Fast Engine)**
   - Hoạt động với từ điển hội thoại ngoại tuyến tốc độ cao (< 5ms).
   - Đảm bảo ứng dụng luôn hoạt động mượt mà kể cả khi không có kết nối internet hoặc API hết hạn ngạch.

> **Bảo mật tuyệt đối:** Các khóa API được quản lý 100% tại backend thông qua file `.env`, tuyệt đối không bao giờ nhúng khóa bí mật vào mã nguồn JavaScript gửi về trình duyệt của người dùng.

---

## 📊 Công Cụ Benchmark 5 Ngôn Ngữ Thực Tế

Trong giao diện ứng dụng, tại mục **Bảng Đo Độ Trễ & Đánh Giá Tốc Độ**, người dùng có thể nhấn nút:
**"Chạy kiểm thử 5 ngôn ngữ"**

Hệ thống sẽ thực hiện gửi các câu nói thực tế bằng cả 5 ngôn ngữ:
- 🇻🇳 Tiếng Việt → 🇨🇳 Tiếng Trung
- 🇨🇳 Tiếng Trung → 🇻🇳 Tiếng Việt
- 🇺🇸 Tiếng Anh → 🇻🇳 Tiếng Việt
- 🇻🇳 Tiếng Việt → 🇹🇭 Tiếng Thái
- 🇰🇷 Tiếng Hàn → 🇻🇳 Tiếng Việt

Kết quả đo đạc thực tế gồm TTFT, Tổng trễ, thời gian tạo Pinyin và tỷ lệ thành công sẽ được hiển thị ngay trên bảng.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Cài đặt thư viện:
```bash
npm install
```

### 2. Cấu hình file `.env`:
Tạo file `.env` từ `.env.example`:
```env
GEMINI_API_KEY="AIzaSy..."
PORT=3000
```

### 3. Khởi chạy ứng dụng:
```bash
npm run dev
```
Truy cập: `http://localhost:3000`.

### 4. Chạy trên Windows 10/11:
Mở PowerShell hoặc Command Prompt tại thư mục dự án và chạy:
```powershell
npm install
npm run dev
```

---

## 📱 Lưu Ý Quyền Micro & HTTPS

- Trên trình duyệt máy tính (Chrome/Edge): `http://localhost:3000` được tự động cấp quyền truy cập Micro an toàn.
- Khi truy cập trên điện thoại (Android/iOS): Bắt buộc phải chạy qua giao thức **HTTPS** để trình duyệt cho phép bật Microphone. Khi triển khai lên Cloud Run, Vercel hoặc Render, HTTPS được kích hoạt tự động.

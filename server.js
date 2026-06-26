const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TikTokLive } = require('tiktok-live-events');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// BIẾN TOÀN CỤC (GLOBAL): Đưa ra ngoài để dùng chung cho tất cả các thiết bị kết nối
let tiktokLive = null;
let currentRoom = null; // Lưu tên phòng đang kết nối thực tế

io.on('connection', (socket) => {

    // Khi một thiết bị mới vừa mở Web, tự động gửi trạng thái hiện tại của Server cho thiết bị đó biết
    if (tiktokLive) {
        socket.emit('status', `Đang chia sẻ luồng dữ liệu từ phòng: ${currentRoom}`);
    } else {
        socket.emit('status', 'Chưa kết nối');
    }

    socket.on('set-username', async (username) => {
        // NẾU PHÒNG NÀY ĐÃ ĐƯỢC KẾT NỐI TRƯỚC ĐÓ VÀ ĐANG CHẠY: Không tạo kết nối mới để tránh bị khóa IP
        if (tiktokLive && currentRoom === username) {
            socket.emit('status', `Đã kết nối thành công: ${username} (Dùng chung luồng)`);
            return;
        }

        // Nếu yêu cầu kết nối phòng mới hoàn toàn, tiến hành ngắt phòng cũ (nếu có)
        if (tiktokLive) {
            try {
                tiktokLive.disconnect();
                tiktokLive = null;
                currentRoom = null;
            } catch (e) {}
        }

        try {
            // Thông báo cho TẤT CẢ các thiết bị đang xem biết hệ thống đang chuyển phòng
            io.emit('status', `Đang kết nối đến phòng: ${username}...`);

            tiktokLive = new TikTokLive(username, {
                clientParams: {
                    client_language: "vi-VN",
                    device_platform: "web"
                },
                requestHeaders: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });

            currentRoom = username;

            // Đăng ký nhận sự kiện chat từ TikTok
            tiktokLive.on('chat', (data) => {
                // Thay vì gửi cho 1 socket cá nhân, ta dùng io.emit để PHÁT SÓNG cho tất cả các thiết bị cùng nhận
                io.emit('comment-data', {
                    user: data.user?.nickname || data.user?.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            tiktokLive.on('disconnect', () => {
                io.emit('status', 'Đứt kết nối hoặc Live Stream đã tắt.');
                tiktokLive = null;
                currentRoom = null;
            });

            // Thực hiện kết nối thực tế với TikTok
            await tiktokLive.connect();
            
            // Thông báo thành công cho TẤT CẢ mọi người đang mở ứng dụng
            io.emit('status', `Đã kết nối thành công: ${username}`);

        } catch (err) {
            console.error("Lỗi kết nối TikTokLive:", err.message);
            // Nếu lỗi do hết lượt cào/Rate limit từ bên thứ 3, thông báo hiển thị trực quan
            let errorMsg = err.message;
            if (errorMsg.includes("hourly cap") || errorMsg.includes("Rate limit")) {
                errorMsg = "Bị TikTok giới hạn lượt cào (Rate limit). Vui lòng thử lại sau ít phút!";
            }
            socket.emit('status', `Kết nối thất bại: ${errorMsg}`);
            tiktokLive = null;
            currentRoom = null;
        }
    });

    // BỎ logic ngắt kết nối tiktokLive khi socket disconnect. 
    // Giờ đây, một người tắt trình duyệt/điện thoại thì Server vẫn giữ kết nối để phục vụ những người còn lại.
    socket.on('disconnect', () => {
        // Để trống nhằm giữ kết nối hoạt động liên tục trên Server
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chạy mượt mà tại port ${PORT}`));

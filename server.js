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

// BIẾN TOÀN CỤC (GLOBAL): Đưa luồng kết nối ra ngoài dùng chung cho mọi thiết bị
let tiktokLive = null;
let currentRoom = null;

io.on('connection', (socket) => {

    // Nếu hệ thống đang có luồng chạy sẵn, báo trạng thái cho thiết bị mới vào biết luôn
    if (tiktokLive) {
        socket.emit('status', `Đang chia sẻ luồng dữ liệu từ phòng: ${currentRoom}`);
    } else {
        socket.emit('status', 'Chưa kết nối');
    }

    socket.on('set-username', async (username) => {
        // CHỐNG SPAM REQUEST: Nếu phòng này đang kết nối và chạy mượt, không làm gì cả
        if (tiktokLive && currentRoom === username) {
            socket.emit('status', `Đã kết nối thành công: ${username} (Dùng chung luồng)`);
            return;
        }

        // Tự động ngắt kết nối phòng cũ nếu đổi tên phòng mới
        if (tiktokLive) {
            try {
                tiktokLive.disconnect();
                tiktokLive = null;
                currentRoom = null;
            } catch (e) {}
        }

        try {
            // Phát sóng trạng thái đang kết nối cho TẤT CẢ các thiết bị đang mở Web
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

            // Đăng ký nhận sự kiện chat
            tiktokLive.on('chat', (data) => {
                // SỬA ĐỔI QUAN TRỌNG: Dùng io.emit để PHÁT SÓNG comment cho tất cả các máy cùng xem
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

            // Thực hiện kết nối thực tế
            await tiktokLive.connect();
            
            // Thông báo kết nối thành công cho tất cả mọi người cùng biết
            io.emit('status', `Đã kết nối thành công: ${username}`);

        } catch (err) {
            console.error("Lỗi kết nối TikTokLive:", err.message);
            let msg = err.message;
            if (msg.includes("hourly cap") || msg.includes("Rate limit")) {
                msg = "Đang tạm thời hết hạn mức cào miễn phí. Vui lòng đợi vài phút rồi bấm lại!";
            }
            socket.emit('status', `Kết nối thất bại: ${msg}`);
            tiktokLive = null;
            currentRoom = null;
        }
    });

    // Giữ nguyên luồng chạy trên server kể cả khi có người tắt trình duyệt
    socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chia sẻ luồng mượt mà tại port ${PORT}`));

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

// BIẾN TOÀN CỤC (GLOBAL)
let tiktokLive = null;
let currentRoom = null;

io.on('connection', (socket) => {

    // Gửi trạng thái hiện tại cho thiết bị mới vào
    if (tiktokLive) {
        socket.emit('status', `Đang chia sẻ luồng dữ liệu từ phòng: ${currentRoom}`);
    } else {
        socket.emit('status', 'Chưa kết nối');
    }

    socket.on('set-username', async (username) => {
        // NẾU bấm kết nối lại chính phòng đó khi luồng đang chạy ổn định
        if (tiktokLive && currentRoom === username) {
            socket.emit('status', `Đã kết nối thành công: ${username} (Dùng chung luồng)`);
            return;
        }

        // GIẢI PHÓNG HOÀN TOÀN LUỒNG CŨ (Tránh tình trạng kẹt kết nối rác khi Idol tắt/bật lại live)
        if (tiktokLive) {
            try {
                console.log("Đang giải phóng kết nối cũ...");
                tiktokLive.disconnect();
            } catch (e) {}
            tiktokLive = null;
            currentRoom = null;
        }

        try {
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

            tiktokLive.on('chat', (data) => {
                io.emit('comment-data', {
                    user: data.user?.nickname || data.user?.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            // Khi tín hiệu từ TikTok báo đứt luồng (Idol tắt live), xóa sạch biến lập tức
            tiktokLive.on('disconnect', () => {
                console.log("Luồng kết nối TikTok đã bị ngắt.");
                io.emit('status', 'Đứt kết nối hoặc Live Stream đã tắt.');
                tiktokLive = null;
                currentRoom = null;
            });

            await tiktokLive.connect();
            io.emit('status', `Đã kết nối thành công: ${username}`);

        } catch (err) {
            console.error("Lỗi kết nối TikTokLive:", err.message);
            let msg = err.message;
            if (msg.includes("hourly cap") || msg.includes("Rate limit")) {
                msg = "Hết hạn mức cào tự do. Hãy đợi vài phút hoặc đổi tên phòng để thử lại!";
            }
            socket.emit('status', `Kết nối thất bại: ${msg}`);
            tiktokLive = null;
            currentRoom = null;
        }
    });

    socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chia sẻ luồng mượt mà tại port ${PORT}`));

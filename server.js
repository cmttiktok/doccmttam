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

io.on('connection', (socket) => {
    let tiktokLive = null;

    socket.on('set-username', async (username) => {
        if (tiktokLive) {
            try {
                tiktokLive.disconnect();
                tiktokLive = null;
            } catch (e) {}
        }

        try {
            socket.emit('status', `Đang kết nối đến phòng: ${username}...`);

            // BỎ hoàn toàn apiKey lỗi của tik.tools, cấu hình kết nối trực tiếp giả lập trình duyệt
            tiktokLive = new TikTokLive(username, {
                clientParams: {
                    client_language: "vi-VN",
                    device_platform: "web"
                },
                requestHeaders: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });

            // Đăng ký nhận sự kiện chat
            tiktokLive.on('chat', (data) => {
                socket.emit('comment-data', {
                    user: data.user?.nickname || data.user?.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            tiktokLive.on('disconnect', () => {
                socket.emit('status', 'Đứt kết nối hoặc Live Stream đã tắt.');
                tiktokLive = null;
            });

            // Thực hiện kết nối
            await tiktokLive.connect();
            socket.emit('status', `Đã kết nối thành công: ${username}`);

        } catch (err) {
            console.error("Lỗi kết nối TikTokLive:", err.message);
            socket.emit('status', `Kết nối thất bại: ${err.message}`);
            tiktokLive = null;
        }
    });

    socket.on('disconnect', () => {
        if (tiktokLive) {
            try {
                tiktokLive.disconnect();
            } catch (e) {}
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chạy mượt mà tại port ${PORT}`));

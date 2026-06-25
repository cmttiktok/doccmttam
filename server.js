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
        // Nếu có kết nối cũ thì hủy hẳn trước khi tạo cái mới
        if (tiktokLive) {
            try {
                tiktokLive.disconnect();
                tiktokLive = null;
            } catch (e) {}
        }

        try {
            socket.emit('status', `Đang kết nối đến phòng: ${username}...`);

            // Khởi tạo đối tượng
            tiktokLive = new TikTokLive(username, {
                apiKey: "tk_f147cb9aa9f90ecde942e5877763f5123098a41e37cd1797"
            });

            // Đăng ký sự kiện NHẬN CHAT trước khi gọi lệnh connect
            tiktokLive.on('chat', (data) => {
                socket.emit('comment-data', {
                    user: data.user?.nickname || data.user?.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            // Lắng nghe sự kiện mất kết nối từ TikTok
            tiktokLive.on('disconnect', () => {
                socket.emit('status', 'Đứt kết nối hoặc Live Stream đã tắt.');
                tiktokLive = null;
            });

            // Gọi lệnh kết nối bất đồng bộ
            await tiktokLive.connect();
            
            // Nếu không ném ra lỗi, thông báo thành công
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

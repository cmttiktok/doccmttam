const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TikTokLive } = require('tiktok-live-events');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// Trả về giao diện chính cho người dùng
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    let tiktokLive;

    socket.on('set-username', async (username) => {
        // Nếu đang có kết nối cũ, tiến hành ngắt kết nối trước khi nhận ID mới
        if (tiktokLive) {
            try {
                tiktokLive.disconnect();
            } catch (e) {}
        }

        try {
            socket.emit('status', `Đang kết nối đến phòng: ${username}...`);

            // Khởi tạo đối tượng kết nối qua cổng proxy của tiktok-live-events
            tiktokLive = new TikTokLive(username);

            // Kích hoạt lệnh kết nối
            await tiktokLive.connect();
            socket.emit('status', `Đã kết nối thành công: ${username}`);

            // Lắng nghe duy nhất sự kiện bình luận (chat) từ livestream
            tiktokLive.on('chat', (data) => {
                socket.emit('comment-data', {
                    user: data.user?.nickname || data.user?.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            // Lắng nghe khi livestream kết thúc hoặc mất kết nối từ phía TikTok
            tiktokLive.on('disconnect', () => {
                socket.emit('status', 'Đứt kết nối hoặc Live Stream đã tắt.');
            });

        } catch (err) {
            console.error("Lỗi TikTokLive:", err.message);
            socket.emit('status', `Kết nối thất bại: ${err.message}`);
        }
    });

    // Khi người dùng tắt tab/F5 trình duyệt, tự động hủy kết nối bot để tiết kiệm tài nguyên
    socket.on('disconnect', () => {
        if (tiktokLive) {
            try {
                tiktokLive.disconnect();
            } catch (e) {}
        }
    });
});

// Cấu hình PORT linh hoạt tương thích hoàn toàn với hạ tầng Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chạy mượt mà tại port ${PORT}`));

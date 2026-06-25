const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// Định nghĩa giao diện chính
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    let tiktok;

    socket.on('set-username', (username) => {
        if (tiktok) {
            tiktok.disconnect().catch(() => {});
        }

        // Khởi tạo kết nối thẳng, bỏ qua việc ép Sign Server bị lỗi 403
        tiktok = new WebcastPushConnection(username, {
            clientParams: {
                "app_language": "en-US",
                "webcast_language": "en-US"
            },
            requestOptions: {
                timeout: 10000
            }
        });

        tiktok.connect()
            .then(() => socket.emit('status', `Đã kết nối: ${username}`))
            .catch((err) => {
                console.error("Lỗi kết nối TikTok:", err.message);
                socket.emit('status', `Kết nối thất bại: ${err.message}`);
            });

        // Chỉ bắt duy nhất sự kiện bình luận (chat)
        tiktok.on('chat', (data) => {
            socket.emit('comment-data', {
                user: data.nickname || data.uniqueId,
                comment: data.comment
            });
        });

        // Xử lý khi ngắt kết nối live stream từ phía TikTok
        tiktok.on('disconnected', () => {
            socket.emit('status', 'Đứt kết nối live từ TikTok.');
        });
    });

    socket.on('disconnect', () => {
        if (tiktok) tiktok.disconnect().catch(() => {});
    });
});

// Cấu hình PORT linh hoạt chạy trên Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chạy tại port ${PORT}`));

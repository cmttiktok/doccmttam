const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Giải mã chính xác thư viện dù bị bọc bởi .default hay cấu trúc cũ
const targetModule = require('tiktok-live-connector');
const TikTokModule = targetModule.default || targetModule;
const WebcastPushConnection = TikTokModule.WebcastPushConnection || TikTokModule;

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

        // Khởi tạo kết nối sử dụng API Key từ Euler Stream để vượt tường lửa TikTok ổn định
        tiktok = new WebcastPushConnection(username, {
            clientParams: {
                "app_language": "en-US",
                "webcast_language": "en-US"
            },
            requestOptions: {
                timeout: 10000
            },
            signApiKey: "euler_NmJmODEyMmZlOTFiNzI2NmU2YTc0YjlmYTM2Nzg4NWIyMWIyMWI4NTA4ODAyMGZjZmQyMjNk"
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

// Cấu hình PORT linh hoạt để chạy mượt mà trên Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chạy tại port ${PORT}`));

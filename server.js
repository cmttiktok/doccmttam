const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastConnection } = require('@tobiasfaust/tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Quản lý biến kết nối toàn cục
let tiktokLive = null;
let currentRoom = null;

io.on('connection', (socket) => {
    
    // Gửi trạng thái hiện tại cho client mới kết nối
    if (tiktokLive && tiktokLive.getState().isConnected) {
        socket.emit('status', `Đang chia sẻ luồng dữ liệu từ phòng: ${currentRoom}`);
    } else {
        socket.emit('status', 'Chưa kết nối');
    }

    socket.on('set-username', async (username) => {
        // Nếu đã kết nối đúng phòng đó rồi thì dùng chung luồng, không kết nối lại
        if (tiktokLive && currentRoom === username && tiktokLive.getState().isConnected) {
            socket.emit('status', `Đã kết nối thành công: ${username} (Luồng chung)`);
            return;
        }

        // Ngắt kết nối cũ nếu có để tránh trùng lặp luồng ngầm
        if (tiktokLive) {
            try {
                tiktokLive.disconnect();
            } catch (e) {}
            tiktokLive = null;
            currentRoom = null;
        }

        try {
            socket.emit('status', `Đang kết nối đến phòng: ${username}...`);

            // Khởi tạo kết nối trực tiếp thuần túy
            tiktokLive = new WebcastConnection(username, {
                enableExtendedConfig: true,
                requestOptions: {
                    timeout: 10000
                }
            });

            currentRoom = username;

            // Nhận sự kiện chat từ thư viện mới
            tiktokLive.on('chat', (data) => {
                io.emit('comment-data', {
                    user: data.nickname || data.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            // Xử lý khi live bị ngắt hoặc tắt stream
            tiktokLive.on('disconnected', () => {
                io.emit('status', 'Đứt kết nối hoặc Live Stream đã tắt.');
                tiktokLive = null;
                currentRoom = null;
            });

            await tiktokLive.connect();
            io.emit('status', `Đã kết nối thành công: ${username}`);

        } catch (err) {
            console.error("Lỗi kết nối TikTok Live:", err.message);
            let msgError = err.message;
            if (err.message.includes("not live") || err.message.includes("404")) {
                msgError = "Tài khoản hiện không livestream hoặc sai ID.";
            }
            socket.emit('status', `Kết nối thất bại: ${msgError}`);
            tiktokLive = null;
            currentRoom = null;
        }
    });

    socket.on('disconnect', () => {});
});

// Render yêu cầu binding cổng qua PORT môi trường hoặc mặc định 10000 thay vì 3000
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chạy mượt mà tại port ${PORT}`));

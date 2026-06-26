const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastConnection } = require('@tobiasfaust/tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// Định tuyến giao diện
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Biến lưu trữ luồng kết nối toàn cục để quản lý phiên làm việc
let tiktokLive = null;
let currentRoom = null;

io.on('connection', (socket) => {
    
    // Gửi trạng thái kết nối cho thiết bị vừa mới mở trang web
    if (tiktokLive && tiktokLive.getState().isConnected) {
        socket.emit('status', `Đang chia sẻ luồng dữ liệu từ phòng: ${currentRoom}`);
    } else {
        socket.emit('status', 'Chưa kết nối');
    }

    socket.on('set-username', async (username) => {
        // Nếu đã kết nối đúng tài khoản đang livestream rồi thì giữ nguyên, dùng chung luồng dữ liệu
        if (tiktokLive && currentRoom === username && tiktokLive.getState().isConnected) {
            socket.emit('status', `Đã kết nối thành công: ${username} (Luồng chung)`);
            return;
        }

        // Luôn giải phóng luồng kết nối cũ để giải phóng tài nguyên bộ nhớ trên Render
        if (tiktokLive) {
            try {
                tiktokLive.disconnect();
            } catch (e) {}
            tiktokLive = null;
            currentRoom = null;
        }

        try {
            socket.emit('status', `Đang kết nối đến phòng: ${username}...`);

            // Khởi tạo kết nối trực tiếp đến hệ thống TikTok Webcast không qua API trung gian
            tiktokLive = new WebcastConnection(username, {
                enableExtendedConfig: true,
                requestOptions: {
                    timeout: 10000
                }
            });

            currentRoom = username;

            // Nhận sự kiện bình luận (chat) và đẩy qua Socket.io về giao diện người dùng
            tiktokLive.on('chat', (data) => {
                io.emit('comment-data', {
                    user: data.nickname || data.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            // Lắng nghe sự kiện luồng live bị kết thúc hoặc rớt kết nối mạng
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

// Đồng bộ cổng PORT động của môi trường Render (bắt buộc phải có process.env.PORT)
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Hệ thống hoạt động độc lập tại port ${PORT}`));

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
// SỬA TÊN CLASS CHUẨN: Dùng TikTokLiveConnector thay vì WebcastConnection
const { TikTokLiveConnector } = require('@tobiasfaust/tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// BIẾN TOÀN CỤC (GLOBAL)
let tiktokLive = null;
let currentRoom = null;
let currentEventText = ""; // Lưu trữ chữ chạy từ admin

// API nhận sự kiện chạy chữ từ admin
app.post('/set-event', (req, res) => {
    const { event } = req.body;
    currentEventText = event || "";
    io.emit('update-event', currentEventText);
    return res.json({ success: true, message: "Cập nhật sự kiện thành công!" });
});

io.on('connection', (socket) => {

    // Đồng bộ chữ chạy khi có thiết bị mới kết nối vào hệ thống
    socket.emit('update-event', currentEventText);
    
    // Gửi trạng thái kết nối cho thiết bị vừa mới mở trang web
    if (tiktokLive && tiktokLive.connected) {
        socket.emit('status', { success: true, msg: `Đang chia sẻ luồng dữ liệu từ phòng: ${currentRoom}` });
    } else {
        socket.emit('status', { success: false, msg: 'Chưa kết nối' });
    }

    socket.on('set-username', async (username) => {
        // Nếu đã kết nối đúng tài khoản rồi thì giữ nguyên, dùng chung luồng dữ liệu
        if (tiktokLive && currentRoom === username && tiktokLive.connected) {
            socket.emit('status', { success: true, msg: `Đã kết nối thành công: ${username} (Dùng chung luồng)` });
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
            io.emit('status', { success: false, msg: `Đang kết nối đến phòng: ${username}...` });

            // SỬA: Khởi tạo bằng class chính xác của thư viện mới
            tiktokLive = new TikTokLiveConnector(username, {
                enableExtendedConfig: true,
                requestOptions: {
                    timeout: 10000
                }
            });

            currentRoom = username;

            // Nhận sự kiện bình luận và đẩy qua Socket.io về giao diện người dùng
            tiktokLive.on('chat', (data) => {
                io.emit('comment-data', {
                    user: data.nickname || data.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            // Lắng nghe sự kiện luồng live bị kết thúc hoặc rớt kết nối mạng
            tiktokLive.on('disconnected', () => {
                io.emit('status', { success: false, msg: 'Đứt kết nối hoặc Live Stream đã tắt.' });
                tiktokLive = null;
                currentRoom = null;
            });

            await tiktokLive.connect();
            io.emit('status', { success: true, msg: `Đã kết nối thành công: ${username}` });

        } catch (err) {
            console.error("Lỗi kết nối TikTok Live:", err.message);
            let msgError = err.message;
            if (err.message.includes("not live") || err.message.includes("404")) {
                msgError = "Tài khoản hiện không livestream hoặc sai ID.";
            }
            socket.emit('status', { success: false, msg: `Kết nối thất bại: ${msgError}` });
            tiktokLive = null;
            currentRoom = null;
        }
    });

    socket.on('disconnect', () => {});
});

// Đồng bộ cổng PORT động của môi trường Render
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Hệ thống độc lập hoạt động mượt mà tại port ${PORT}`));

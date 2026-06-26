const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastConnection } = require('@tobiasfaust/tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// Trả về trang giao diện chính
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
    
    // Gửi trạng thái kết nối hiện tại cho thiết bị mới vào
    if (tiktokLive && tiktokLive.getState().isConnected) {
        socket.emit('status', { success: true, msg: `Đang chia sẻ luồng dữ liệu từ phòng: ${currentRoom}` });
    } else {
        socket.emit('status', { success: false, msg: 'Chưa kết nối' });
    }

    socket.on('set-username', async (username) => {
        // Nếu thiết bị yêu cầu kết nối đúng phòng đang chạy và hoạt động ổn định
        if (tiktokLive && currentRoom === username && tiktokLive.getState().isConnected) {
            socket.emit('status', { success: true, msg: `Đã kết nối thành công: ${username} (Dùng chung luồng)` });
            return;
        }

        // GIẢI PHÓNG HOÀN TOÀN LUỒNG CŨ (Tránh kẹt cổng hoặc lỗi phòng rác)
        if (tiktokLive) {
            try {
                tiktokLive.disconnect();
            } catch (e) {}
            tiktokLive = null;
            currentRoom = null;
        }

        try {
            io.emit('status', { success: false, msg: `Đang kết nối đến phòng: ${username}...` });

            // Khởi tạo bộ kết nối trực tiếp đến Webcast API của TikTok không qua trung gian
            tiktokLive = new WebcastConnection(username, {
                enableExtendedConfig: true,
                requestOptions: {
                    timeout: 10000
                }
            });

            currentRoom = username;

            // Đăng ký nhận sự kiện chat từ thư viện mới
            tiktokLive.on('chat', (data) => {
                io.emit('comment-data', {
                    user: data.nickname || data.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            // Khi Idol tắt live hoặc bị đứt kết nối từ phía TikTok
            tiktokLive.on('disconnected', () => {
                io.emit('status', { success: false, msg: 'Đứt kết nối hoặc Live Stream đã tắt.' });
                tiktokLive = null;
                currentRoom = null;
            });

            // Tiến hành kết nối
            await tiktokLive.connect();
            io.emit('status', { success: true, msg: `Đã kết nối thành công: ${username}` });

        } catch (err) {
            console.error("Lỗi kết nối TikTok Live:", err.message);
            let userFriendlyMsg = err.message;
            if (err.message.includes("not live") || err.message.includes("404")) {
                userFriendlyMsg = `@${username} hiện không trực tuyến hoặc sai ID.`;
            }
            socket.emit('status', { success: false, msg: `Kết nối thất bại: ${userFriendlyMsg}` });
            tiktokLive = null;
            currentRoom = null;
        }
    });

    socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 10000; // Đồng bộ theo port nhận diện của Render
server.listen(PORT, () => console.log(`🚀 Hệ thống độc lập hoạt động mượt mà tại port ${PORT}`));

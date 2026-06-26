const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
// CHUYỂN ĐỔI: Sử dụng thư viện gốc kết nối trực tiếp mạnh mẽ hơn
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// BIẾN TOÀN CỤC (GLOBAL): Quản lý luồng duy nhất cho toàn bộ thiết bị
let tiktokConnect = null;
let currentRoom = null;

io.on('connection', (socket) => {

    // Gửi trạng thái hiện tại cho thiết bị vừa mới truy cập
    if (tiktokConnect && tiktokConnect.isConnected) {
        socket.emit('status', `Đang chia sẻ luồng dữ liệu từ phòng: ${currentRoom}`);
    } else {
        socket.emit('status', 'Chưa kết nối');
    }

    socket.on('set-username', async (username) => {
        // Nếu phòng này đang chạy mượt mà, giữ nguyên không tạo lại
        if (tiktokConnect && tiktokConnect.isConnected && currentRoom === username) {
            socket.emit('status', `Đã kết nối thành công: ${username} (Dùng chung luồng)`);
            return;
        }

        // Ngắt luồng kết nối cũ nếu đổi phòng
        if (tiktokConnect) {
            try {
                tiktokConnect.disconnect();
                tiktokConnect = null;
                currentRoom = null;
            } catch (e) {}
        }

        try {
            io.emit('status', `Đang kết nối trực tiếp đến phòng: ${username}...`);

            // Khởi tạo bộ kết nối trực tiếp bằng Webcast API của TikTok
            tiktokConnect = new WebcastPushConnection(username, {
                processInitialData: false,
                enableExtendedGiftInfo: false,
                requestOptions: {
                    timeout: 10000
                },
                clientParams: {
                    "app_language": "vi-VN",
                    "webcast_language": "vi-VN"
                }
            });

            currentRoom = username;

            // Đăng ký nhận sự kiện Chat từ thư viện gốc
            tiktokConnect.on('chat', (data) => {
                // Phát sóng comment cho toàn bộ thiết bị
                io.emit('comment-data', {
                    user: data.nickname || data.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            tiktokConnect.on('disconnected', () => {
                io.emit('status', 'Đứt kết nối hoặc Live Stream đã tắt.');
                tiktokConnect = null;
                currentRoom = null;
            });

            // Tiến hành kết nối trực tiếp đến TikTok
            await tiktokConnect.connect();
            io.emit('status', `Đã kết nối thành công: ${username}`);

        } catch (err) {
            console.error("Lỗi kết nối TikTok Live Connector:", err.message);
            socket.emit('status', `Kết nối thất bại: ${err.message}`);
            tiktokConnect = null;
            currentRoom = null;
        }
    });

    socket.on('disconnect', () => {
        // Giữ luồng hoạt động liên tục trên Server kể cả khi có thiết bị tắt trình duyệt
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chạy mượt mà tại port ${PORT}`));

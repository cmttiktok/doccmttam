const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// Định nghĩa giao diện chính
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    let tiktok;

    socket.on('set-username', async (username) => {
        if (tiktok) {
            tiktok.disconnect().catch(() => {});
        }

        try {
            // Nạp động module
            const importedModule = await import('tiktok-live-connector');
            
            // Giải mã chuẩn xác Constructor bất kể thư viện đóng gói kiểu gì (ESM, CommonJS, default wrapper)
            let WebcastPushConnection;
            if (importedModule.WebcastPushConnection) {
                WebcastPushConnection = importedModule.WebcastPushConnection;
            } else if (importedModule.default && importedModule.default.WebcastPushConnection) {
                WebcastPushConnection = importedModule.default.WebcastPushConnection;
            } else if (importedModule.default) {
                WebcastPushConnection = importedModule.default;
            } else {
                WebcastPushConnection = importedModule;
            }

            // Kiểm tra bảo hiểm cuối cùng xem đã lấy được constructor chưa
            if (typeof WebcastPushConnection !== 'function') {
                throw new Error("Không thể trích xuất WebcastPushConnection class.");
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

        } catch (initErr) {
            console.error("Lỗi cấu trúc khởi tạo:", initErr.message);
            socket.emit('status', `Lỗi hệ thống: ${initErr.message}`);
        }
    });

    socket.on('disconnect', () => {
        if (tiktok) tiktok.disconnect().catch(() => {});
    });
});

// Cấu hình PORT linh hoạt để chạy mượt mà trên Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chạy tại port ${PORT}`));

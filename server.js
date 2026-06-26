const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TikTokLiveConnector } = require('tiktok-live-connector');
// THÊM: Thư viện điều hướng qua Proxy để vượt tường lửa TikTok
const { HttpsProxyAgent } = require('https-proxy-agent'); 
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let tiktokConnect = null;
let currentRoom = null;

// ==========================================
// CẤU HÌNH PROXY CỦA BẠN TẠI ĐÂY
// Định dạng: http://username:password@ip:port hoặc http://ip:port (nếu không có mật khẩu)
// Hãy thay thế bằng một Proxy sạch (Ưu tiên IP Việt Nam) để vượt chặn IP của Render
const PROXY_URL = ""; 
// ==========================================

io.on('connection', (socket) => {

    if (tiktokConnect && tiktokConnect.connected) {
        socket.emit('status', `Đang chia sẻ luồng dữ liệu từ phòng: ${currentRoom}`);
    } else {
        socket.emit('status', 'Chưa kết nối');
    }

    socket.on('set-username', async (username) => {
        if (tiktokConnect && tiktokConnect.connected && currentRoom === username) {
            socket.emit('status', `Đã kết nối thành công: ${username} (Dùng chung luồng)`);
            return;
        }

        if (tiktokConnect) {
            try {
                tiktokConnect.disconnect();
                tiktokConnect = null;
                currentRoom = null;
            } catch (e) {}
        }

        try {
            io.emit('status', `Đang kết nối trực tiếp đến phòng: ${username}...`);

            // Thiết lập cấu hình request bao gồm cả Proxy nếu có
            const connectorOptions = {
                enableExtendedGiftInfo: false,
                requestOptions: {
                    timeout: 10000
                }
            };

            // Nếu bạn đã điền PROXY_URL, hệ thống sẽ tự động gán vào luồng kết nối
            if (PROXY_URL) {
                const agent = new HttpsProxyAgent(PROXY_URL);
                connectorOptions.requestOptions.agent = agent;
                console.log("🚀 Hệ thống đang định tuyến kết nối qua Proxy...");
            }

            tiktokConnect = new TikTokLiveConnector(username, connectorOptions);
            currentRoom = username;

            tiktokConnect.on('chat', (data) => {
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

            await tiktokConnect.connect();
            io.emit('status', `Đã kết nối thành công: ${username}`);

        } catch (err) {
            console.error("Lỗi kết nối TikTok Live:", err.message);
            let userFriendlyMsg = err.message;
            if (userFriendlyMsg.includes("room_id") || userFriendlyMsg.includes("blocked")) {
                userFriendlyMsg = "IP của Server Render đã bị TikTok chặn. Vui lòng cấu hình thêm Proxy sạch trong file server.js để vượt chặn!";
            }
            socket.emit('status', `Kết nối thất bại: ${userFriendlyMsg}`);
            tiktokConnect = null;
            currentRoom = null;
        }
    });

    socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống sẵn sàng cấu hình vượt chặn tại port ${PORT}`));

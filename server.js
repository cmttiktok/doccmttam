const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TikTokLive } = require('tiktok-live-events');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// File lưu trữ dữ liệu nhắc nhở dạng JSON
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

// Khởi tạo file nếu chưa tồn tại
if (!fs.existsSync(REMINDERS_FILE)) {
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify({}));
}

// Trả về giao diện chính và giao diện admin
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// API lấy và lưu danh sách nhắc nhở
app.get('/api/reminders', (req, res) => {
    const data = fs.readFileSync(REMINDERS_FILE, 'utf8');
    res.json(JSON.parse(data));
});

app.post('/api/reminders', (req, res) => {
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

io.on('connection', (socket) => {
    let tiktokLive = null;

    socket.on('set-username', async (username) => {
        if (tiktokLive) {
            try { tiktokLive.disconnect(); tiktokLive = null; } catch (e) {}
        }

        try {
            socket.emit('status', `Đang kết nối đến phòng: ${username}...`);

            tiktokLive = new TikTokLive(username, {
                clientParams: { client_language: "vi-VN", device_platform: "web" },
                requestHeaders: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });

            tiktokLive.on('chat', (data) => {
                socket.emit('comment-data', {
                    user: data.user?.nickname || data.user?.uniqueId || 'Ẩn danh',
                    comment: data.comment
                });
            });

            tiktokLive.on('disconnect', () => {
                socket.emit('status', 'Đứt kết nối hoặc Live Stream đã tắt.');
                tiktokLive = null;
            });

            await tiktokLive.connect();
            socket.emit('status', `Đã kết nối thành công: ${username}`);

        } catch (err) {
            console.error("Lỗi kết nối TikTokLive:", err.message);
            socket.emit('status', `Kết nối thất bại: ${err.message}`);
            tiktokLive = null;
        }
    });

    socket.on('disconnect', () => {
        if (tiktokLive) {
            try { tiktokLive.disconnect(); } catch (e) {}
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Hệ thống chạy mượt mà tại port ${PORT}`));

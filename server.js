const { TikTokLive } = require('tiktok-live-events'); // Thư viện mới 2026

// Thay thế đoạn kết nối cũ bằng đoạn này:
const live = new TikTokLive('chipham1'); // Điền ID idol vào đây

live.on('chat', (data) => {
    // Trả data về Socket.io cho giao diện của bạn
    io.emit('comment-data', {
        user: data.user.nickname || data.user.uniqueId,
        comment: data.comment
    });
});

live.connect().catch(err => console.log("Lỗi kết nối:", err));

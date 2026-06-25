const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const axios = require('axios');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

const MONGODB_URI = "mongodb+srv://baoboi97:baoboi97@cluster0.skkajlz.mongodb.net/tiktok_tts?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Connected"));

const BannedWord = mongoose.model('BannedWord', { word: String });
const Acronym = mongoose.model('Acronym', { key: String, value: String });
const EmojiMap = mongoose.model('EmojiMap', { icon: String, text: String });
const BotAnswer = mongoose.model('BotAnswer', { keyword: String, response: String });

// --- API QUẢN TRỊ ---
app.get('/api/words', async (req, res) => res.json((await BannedWord.find()).map(w => w.word)));
app.post('/api/words', async (req, res) => {
    const word = req.body.word ? req.body.word.toLowerCase() : "";
    if (word) await BannedWord.updateOne({ word }, { word }, { upsert: true });
    res.sendStatus(200);
});
app.delete('/api/words/:word', async (req, res) => { await BannedWord.deleteOne({ word: req.params.word }); res.sendStatus(200); });
app.get('/api/acronyms', async (req, res) => res.json(await Acronym.find()));
app.post('/api/acronyms', async (req, res) => { await Acronym.findOneAndUpdate({ key: req.body.key.toLowerCase() }, req.body, { upsert: true }); res.sendStatus(200); });
app.delete('/api/acronyms/:key', async (req, res) => { await Acronym.deleteOne({ key: req.params.key }); res.sendStatus(200); });
app.get('/api/emojis', async (req, res) => res.json(await EmojiMap.find()));
app.post('/api/emojis', async (req, res) => { await EmojiMap.findOneAndUpdate({ icon: req.body.icon }, req.body, { upsert: true }); res.sendStatus(200); });
app.delete('/api/emojis/:id', async (req, res) => { await EmojiMap.findByIdAndDelete(req.params.id); res.sendStatus(200); });
app.get('/api/bot', async (req, res) => res.json(await BotAnswer.find()));
app.post('/api/bot', async (req, res) => { await BotAnswer.findOneAndUpdate({ keyword: req.body.keyword.toLowerCase() }, req.body, { upsert: true }); res.sendStatus(200); });
app.delete('/api/bot/:id', async (req, res) => { await BotAnswer.findByIdAndDelete(req.params.id); res.sendStatus(200); });

// --- XỬ LÝ TTS & TIKTOK ---
async function isBanned(text) {
    if (!text) return false;
    const banned = await BannedWord.find();
    return banned.some(b => text.toLowerCase().includes(b.word));
}
async function processText(text) {
    if (!text || await isBanned(text)) return null;
    let processed = text;
    const emojis = await EmojiMap.find();
    for (const e of emojis) { processed = processed.split(e.icon).join(" " + e.text + " "); }
    processed = processed.replace(/(\d{2})\d+/g, '$1');
    const acronyms = await Acronym.find();
    acronyms.forEach(a => {
        const regex = new RegExp(`(?<!\\p{L})${a.key}(?!\\p{L})`, 'giu');
        processed = processed.replace(regex, a.value);
    });
    return processed;
}
async function getGoogleAudio(text) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=vi&client=tw-ob`;
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        return `data:audio/mp3;base64,${Buffer.from(res.data, 'binary').toString('base64')}`;
    } catch (e) { return null; }
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

io.on('connection', (socket) => {
    let tiktok;
    let pkTimer = null;
    socket.on('set-username', (username) => {
        if (tiktok) {
            try { tiktok.disconnect(); } catch(e){}
        }
        
        socket.emit('status', `Đang kết nối trực tiếp đến phòng: ${username}...`);

        tiktok = new WebcastPushConnection(username, {
            clientParams: { client_language: "vi-VN", device_platform: "web" },
            requestHeaders: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        tiktok.connect()
            .then(() => socket.emit('status', `Đã kết nối thành công: ${username}`))
            .catch((err) => socket.emit('status', `Kết nối thất bại: ${err.message}`));

        // 🌟 SỬA LỖI CHAT: Bảo vệ chống sập và tối ưu lấy tên người dùng
        tiktok.on('chat', async (data) => {
            try {
                if (!data) return;
                const senderName = data.nickname || data.uniqueId || "Người xem";
                if (await isBanned(senderName)) return;

                const commentText = data.comment || "";
                const botRules = await BotAnswer.find();
                const match = botRules.find(r => commentText.toLowerCase().includes(r.keyword));
                
                if (match) {
                    const audio = await getGoogleAudio(`Anh ${senderName} ơi, ${match.response}`);
                    socket.emit('audio-data', { type: 'bot', user: "TRỢ LÝ", comment: match.response, audio });
                } else {
                    const final = await processText(commentText);
                    if (final) {
                        const audio = await getGoogleAudio(`${senderName} nói: ${final}`);
                        socket.emit('audio-data', { type: 'chat', user: senderName, comment: commentText, audio });
                    }
                }
            } catch (err) { console.error("Lỗi sự kiện chat:", err); }
        });

        tiktok.on('linkMicBattle', () => {
            if (pkTimer) clearInterval(pkTimer);
            let timeLeft = 300; 
            pkTimer = setInterval(async () => {
                timeLeft--;
                if (timeLeft === 20) {
                    const audio = await getGoogleAudio("thả bông 20 giây cuối bèo ơi");
                    socket.emit('audio-data', { type: 'pk', user: "HỆ THỐNG", comment: "NHẮC PK 20S", audio });
                }
                if (timeLeft <= 0) clearInterval(pkTimer);
            }, 1000);
        });

        // 🌟 SỬA LỖI MEMBER VÀO PHÒNG
        tiktok.on('member', async (data) => {
            try {
                if (!data) return;
                const senderName = data.nickname || data.uniqueId || "Người xem";
                if (!(await isBanned(senderName))) {
                    const safeName = await processText(senderName);
                    const audio = await getGoogleAudio(`Bèo ơi, anh ${safeName} ghé chơi nè`);
                    socket.emit('audio-data', { type: 'welcome', user: "Hệ thống", comment: `${senderName} vào`, audio });
                }
            } catch (err) { console.error("Lỗi sự kiện member:", err); }
        });

        // 🌟 SỬA LỖI TẶNG QUÀ
        tiktok.on('gift', async (data) => {
            try {
                if (!data) return;
                const senderName = data.nickname || data.uniqueId || "Người xem";
                if (data.repeatEnd && !(await isBanned(senderName))) {
                    const safeName = await processText(senderName);
                    const giftName = data.giftName || "Quà";
                    const audio = await getGoogleAudio(`Cảm ơn ${safeName} đã tặng ${giftName}`);
                    socket.emit('audio-data', { type: 'gift', user: "QUÀ", comment: `${senderName} tặng ${giftName}`, audio });
                }
            } catch (err) { console.error("Lỗi sự kiện gift:", err); }
        });
    });

    socket.on('disconnect', () => {
        if (tiktok) {
            try { tiktok.disconnect(); } catch(e){}
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Chạy tại http://localhost:${PORT}`));

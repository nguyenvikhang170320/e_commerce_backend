const express = require('express');
const router = express.Router();
const db = require('../config/db'); // file cấu hình MySQL
const cloudinary = require('../cloudinary'); // cloudinary config
const multer = require('multer');
const fs = require('fs').promises; // dùng promises version để dễ await

// Cấu hình Multer
const storage = multer.diskStorage({});
const upload = multer({ storage });

// POST /api/messages - Gửi tin nhắn (text hoặc media)
router.post('/', upload.single('media'), async (req, res) => {
    const { sender_id, receiver_id, content } = req.body;
    const file = req.file;

    console.log('sender_id:', sender_id, 'receiver_id:', receiver_id, 'content:', content, 'file:', file); // Log đầu vào

    if (!sender_id || !receiver_id) {
        console.log('Missing sender_id or receiver_id');
        return res.status(400).json({ message: 'Thiếu sender_id hoặc receiver_id' });
    }

    let media_url = null;

    try {
        // Nếu có file (ảnh/video), upload lên Cloudinary
        if (file) {
            console.log('Uploading to Cloudinary:', file.path);  // Log trước khi upload
            const result = await cloudinary.uploader.upload(file.path, {
                folder: 'chat_media'
            });
            console.log('Cloudinary response:', result); // Log kết quả từ Cloudinary
            media_url = result.secure_url;
            // Xóa file tạm sau khi upload
            await fs.unlink(file.path);
            console.log('Temporary file deleted:', file.path); // Log sau khi xóa
        }

        // Chèn tin nhắn vào DB
        const [resultDb] = await db.execute(
            `INSERT INTO messages (sender_id, receiver_id, content, media_url, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [sender_id, receiver_id, content || null, media_url]
        );

        const messageId = resultDb.insertId;
        console.log('Đã chèn tin nhắn, messageId:', messageId); // Log ID tin nhắn

        // Lấy lại message + info sender & receiver
        const [rows] = await db.execute(
            `
            SELECT 
                m.id, m.sender_id, m.receiver_id, m.content, m.media_url, m.created_at,
                s.name AS sender_name, s.image AS sender_avatar,
                r.name AS receiver_name, r.image AS receiver_avatar
            FROM messages m
            JOIN users s ON m.sender_id = s.id
            JOIN users r ON m.receiver_id = r.id
            WHERE m.id = ?
            `,
            [messageId]
        );
        console.log('Đã lấy lại tin nhắn:', rows[0]);  // Log kết quả truy vấn

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error("Lỗi khi gửi tin nhắn:", error);
        res.status(500).json({ message: "Lỗi khi gửi tin nhắn", error: error.message });
    }
});

// GET /api/messages?user1=1&user2=2
router.get('/', async (req, res) => {
    const { user1, user2 } = req.query;
    console.log('người dùng 1:', user1, 'người dùng 2:', user2); // Log đầu vào

    if (!user1 || !user2) {
        console.log('Thiếu ID người dùng');
        return res.status(400).json({ message: 'Thiếu ID người dùng' });
    }

    try {
        const [rows] = await db.execute(
            `
            SELECT 
                m.id, m.sender_id, m.receiver_id, m.content, m.media_url, m.created_at,
                s.name AS sender_name, s.image AS sender_avatar,
                r.name AS receiver_name, r.image AS receiver_avatar
            FROM messages m
            JOIN users s ON m.sender_id = s.id
            JOIN users r ON m.receiver_id = r.id
            WHERE (m.sender_id = ? AND m.receiver_id = ?)
               OR (m.sender_id = ? AND m.receiver_id = ?)
            ORDER BY m.created_at ASC
            `,
            [user1, user2, user2, user1]
        );
        console.log('Đoạn chat:', rows); // Log kết quả

        res.json(rows);
    } catch (err) {
        console.error("Lỗi truy vấn:", err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/last-messages', async (req, res) => {
    const { userId } = req.query;

    console.log('👉 Nhận request GET /messages/last-messages với userId:', userId);

    if (!userId) {
        console.log('❌ Thiếu userId trong query');
        return res.status(400).json({ message: 'Thiếu userId' });
    }

    try {
        const query = `
            SELECT 
                m1.id,
                m1.sender_id,
                m1.receiver_id,
                m1.content,
                m1.media_url,
                m1.created_at,
                u1.name AS sender_name,
                u1.image AS sender_avatar,
                u2.name AS receiver_name,
                u2.image AS receiver_avatar,
                CASE 
                    WHEN m1.sender_id = ? THEN m1.receiver_id
                    ELSE m1.sender_id
                END AS other_user_id
            FROM messages m1
            INNER JOIN (
                SELECT 
                    LEAST(sender_id, receiver_id) AS user_min,
                    GREATEST(sender_id, receiver_id) AS user_max,
                    MAX(created_at) AS max_created
                FROM messages
                WHERE sender_id = ? OR receiver_id = ?
                GROUP BY user_min, user_max
            ) m2 ON (
                LEAST(m1.sender_id, m1.receiver_id) = m2.user_min AND
                GREATEST(m1.sender_id, m1.receiver_id) = m2.user_max AND
                m1.created_at = m2.max_created
            )
            JOIN users u1 ON m1.sender_id = u1.id
            JOIN users u2 ON m1.receiver_id = u2.id
            ORDER BY m1.created_at DESC
        `;

        console.log('📥 Thực hiện truy vấn SQL với userId:', userId);

        const [rows] = await db.execute(query, [userId, userId, userId]);

        console.log('✅ Kết quả truy vấn:', rows.length, 'tin nhắn được trả về');
        console.log(rows);

        res.json(rows);
    } catch (err) {
        console.error('❌ Lỗi khi lấy tin nhắn cuối:', err);
        res.status(500).json({ message: 'Lỗi server' });
    }
});



module.exports = router;

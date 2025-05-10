const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../utils/token'); // Giữ lại verifyToken để bảo vệ các route

// Tạo thông báo
router.post('/', async (req, res) => {
    const { userId, title, message, type } = req.body; // Loại bỏ extraData

    if (!userId || !title || !message || !type) {
        console.log('POST /api/notifications missing fields');
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 1️⃣ Tạo notification trong DB
        const [result] = await db.execute(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', // Loại bỏ extra_data
            [userId, title, message, type] // Loại bỏ extraData
        );
        console.log('Thông báo được tạo bằng ID:', result.insertId);

        res.status(201).json({ id: result.insertId, message: 'Notification created' });
    } catch (err) {
        console.error('Error creating notification:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Route để lấy thông báo
router.get('/', verifyToken, async (req, res) => {
    const userId = req.user.id;
    const role = req.user.role;
    console.log(`GET /api/notifications by user ${userId} with role ${role}`);

    try {
        let rows;
        if (role === 'admin') {
            // Admin lấy tất cả thông báo, bỏ extra_data
            [rows] = await db.execute('SELECT id, user_id, title, message, type, status, created_at FROM notifications ORDER BY created_at DESC');
        } else {
            // Người dùng lấy thông báo của chính mình, bỏ extra_data
            [rows] = await db.execute('SELECT id, user_id, title, message, type, status, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        }

        // Nếu không có thông báo nào
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Không có thông báo' });
        }

        res.json(rows);
    } catch (err) {
        console.error('Lỗi khi lấy thông báo:', err);
        res.status(500).json({ message: 'Lỗi máy chủ' });
    }
});

// GET /api/notifications/count
router.get('/count', verifyToken, async (req, res) => {
    const userId = req.user.id;
    const role = req.user.role;
    console.log(`GET /api/notifications/count by user ${userId} with role ${role}`); // Log ai đang gọi

    try {
        let rows;
        if (role === 'admin') {
            console.log('Đếm TẤT CẢ các thông báo chưa đọc cho quản trị viên');
            [rows] = await db.execute(
                'SELECT COUNT(*) AS unread_count FROM notifications WHERE status = "unread"'
            );
        } else {
            console.log(`Đếm thông báo chưa đọc cho người dùng ${userId}`);
            [rows] = await db.execute(
                'SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND status = "unread"',
                [userId]
            );
        }

        console.log('Kết quả số lượng chưa đọc:', rows[0]);
        res.json({ unread_count: rows[0].unread_count }); // Trả về số lượng thông báo chưa đọc
    } catch (err) {
        console.error('Error counting notifications:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', verifyToken, async (req, res) => {
    const notificationId = req.params.id;
    const userId = req.user.id;
    const role = req.user.role;

    console.log(`PUT /api/notifications/${notificationId}/read by user ${userId}`);

    try {
        // Cập nhật trạng thái thông báo: chỉ cho phép user đánh dấu notification của chính mình
        const [result] = await db.execute(
            'UPDATE notifications SET status = "read" WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );

        if (result.affectedRows === 0) {
            console.log('Không có thông báo nào được cập nhật (không tìm thấy hoặc không có quyền)');
            return res.status(404).json({ message: 'Notification not found or no permission' });
        }

        console.log('Thông báo được đánh dấu là đã đọc');
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        console.error('Lỗi khi đánh dấu thông báo là đã đọc:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

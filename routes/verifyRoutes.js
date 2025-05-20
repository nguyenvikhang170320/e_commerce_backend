const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, isAdmin  } = require('../utils/token');

// Gửi yêu cầu xác minh (user)
router.post('/request', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    // Kiểm tra đã gửi yêu cầu chưa
    const [rows] = await db.query(
      'SELECT * FROM verification_requests WHERE user_id = ? AND status = "pending"',
      [userId]
    );
    if (rows.length > 0) {
      return res.status(400).json({ msg: 'Bạn đã gửi yêu cầu trước đó' });
    }

    // Tạo yêu cầu mới
    await db.query(
      'INSERT INTO verification_requests (user_id, status, created_at) VALUES (?, "pending", NOW())',
      [userId]
    );

    res.status(201).json({ msg: 'Đã gửi yêu cầu xác minh thành công' });
  } catch (err) {
    console.error('Lỗi gửi yêu cầu xác minh:', err);
    res.status(500).json({ msg: 'Lỗi máy chủ' });
  }
});

// Lấy tất cả yêu cầu xác minh (admin)
router.get('/all', verifyToken, isAdmin , async (req, res) => {
  try {
    const [requests] = await db.query(`
      SELECT vr.*, u.name, u.role 
      FROM verification_requests vr
      JOIN users u ON vr.user_id = u.id
      ORDER BY vr.created_at DESC
    `);

    res.json(requests);
  } catch (err) {
    console.error('Lỗi lấy danh sách yêu cầu:', err);
    res.status(500).json({ msg: 'Lỗi máy chủ' });
  }
});

// Duyệt yêu cầu xác minh (admin)
router.put('/:id/approve', verifyToken, isAdmin , async (req, res) => {
  const requestId = req.params.id;

  try {
    const [[request]] = await db.query(
      'SELECT * FROM verification_requests WHERE id = ?',
      [requestId]
    );
    if (!request) return res.status(404).json({ msg: 'Yêu cầu không tồn tại' });

    // Duyệt: cập nhật trạng thái yêu cầu + user
    await db.query('UPDATE verification_requests SET status = "approved" WHERE id = ?', [requestId]);
    await db.query('UPDATE users SET is_verified = 1 WHERE id = ?', [request.user_id]);

    res.json({ msg: '✅ Đã duyệt yêu cầu xác minh' });
  } catch (err) {
    console.error('Lỗi duyệt yêu cầu:', err);
    res.status(500).json({ msg: 'Lỗi máy chủ' });
  }
});

// Từ chối yêu cầu xác minh (admin)
router.put('/:id/reject', verifyToken, isAdmin , async (req, res) => {
  const requestId = req.params.id;

  try {
    const [[request]] = await db.query(
      'SELECT * FROM verification_requests WHERE id = ?',
      [requestId]
    );
    if (!request) return res.status(404).json({ msg: 'Yêu cầu không tồn tại' });

    await db.query('UPDATE verification_requests SET status = "rejected" WHERE id = ?', [requestId]);

    res.json({ msg: '🚫 Đã từ chối yêu cầu xác minh' });
  } catch (err) {
    console.error('Lỗi từ chối yêu cầu:', err);
    res.status(500).json({ msg: 'Lỗi máy chủ' });
  }
});


router.get('/me', verifyToken, async (req, res) => {
  const userId = req.user.id; // hoặc req.userId tùy middleware của bạn

  try {
    const [userRows] = await db.execute(`
      SELECT u.id, u.name, u.email, u.phone, u.role,
             (SELECT status FROM verification_requests WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS verification_status
      FROM users u
      WHERE u.id = ?
    `, [userId]);

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json(userRows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});



module.exports = router;

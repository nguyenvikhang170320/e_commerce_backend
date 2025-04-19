const express = require('express');
const router = express.Router();
const db = require('../config/db'); // dùng mysql2, đã cấu hình kết nối DB
const { verifyToken } = require('../utils/token');
const { isSelfOrAdmin } = require('../middleware/role_admin_seller');  // Đảm bảo đã import isSelfOrAdmin middleware

// GET tất cả danh mục
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server khi lấy categories' });
  }
});

// POST tạo danh mục mới
router.post('/', verifyToken, isSelfOrAdmin, async (req, res) => {  // Sử dụng isSelfOrAdmin để kiểm tra quyền
  
  const { name, description } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [name, description]
    );
    console.log(`Tạo danh mục thành công`);
    res.status(201).json({ id: result.insertId, name, description });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi khi tạo danh mục' });
  }
});

// PUT cập nhật danh mục
router.put('/:id', verifyToken, isSelfOrAdmin, async (req, res) => {  // Sử dụng isSelfOrAdmin để kiểm tra quyền
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE categories SET name = ?, description = ? WHERE id = ?',
      [name, description, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Danh mục không tồn tại' });
    }
    res.json({ id, name, description });
    console.log(`Cập nhật danh mục thành công`);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi khi cập nhật danh mục' });
  }
});

// DELETE xóa danh mục
router.delete('/:id', verifyToken, isSelfOrAdmin, async (req, res) => {  // Sử dụng isSelfOrAdmin để kiểm tra quyền
  const { id } = req.params;
  try {
    const [result] = await db.query('DELETE FROM categories WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Danh mục không tồn tại' });
    }
    res.json({ message: 'Danh mục đã được xóa' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi khi xóa danh mục' });
  }
});

module.exports = router;

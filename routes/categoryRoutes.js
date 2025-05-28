const express = require('express');
const router = express.Router();
const db = require('../config/db'); // dùng mysql2, đã cấu hình kết nối DB
const { verifyToken } = require('../utils/token');
const isSelfOrAdmin  = require('../middleware/role_admin_seller');  // Đảm bảo đã import isSelfOrAdmin middleware
const denyAdmin = require('../middleware/deny_admin');

// Tìm kiếm danh mục theo tên
router.get('/search', async (req, res) => {
    const searchTerm = req.query.q; // Lấy từ khóa tìm kiếm từ query parameter 'q'

    if (!searchTerm) {
        return res.status(400).json({ message: 'Search term (q) is required' });
    }

    try {
        // Sử dụng LIKE để tìm kiếm gần đúng và CONCAT để thêm dấu %
        // Sử dụng LOWER() để tìm kiếm không phân biệt chữ hoa/chữ thường
        const [rows] = await db.execute(
            `SELECT * FROM categories WHERE LOWER(name) LIKE ?`,
            [`%${searchTerm.toLowerCase()}%`]
        );

        if (rows.length === 0) {
            return res.status(200).json({ message: 'No categories found matching the search term.', categories: [] });
        }

        res.status(200).json(rows);
    } catch (error) {
        console.error('Error searching categories:', error);
        res.status(500).json({ message: 'Failed to search categories', error: error.message });
    }
});

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
router.post('/', verifyToken, denyAdmin, async (req, res) => {  // Sử dụng isSelfOrAdmin để kiểm tra quyền
  
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

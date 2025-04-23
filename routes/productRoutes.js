const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../utils/token');
const { isSelfOrAdmin } = require('../middleware/role_admin_seller');  // Đảm bảo đã import isSelfOrAdmin middleware

// 📌 Tạo sản phẩm mới
router.post('/', verifyToken, isSelfOrAdmin, async (req, res) => {
  const { name, description = '', price, image = '', category_id } = req.body;
  const seller_id = req.user.id;

  if (!name || !price || !category_id) {
    return res.status(400).json({ msg: 'Thiếu thông tin bắt buộc' });
  }

  try {
    await db.query(
      `INSERT INTO products (name, description, price, image, category_id, seller_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [name, description, price, image, category_id, seller_id]
    );
    res.status(201).json({ msg: 'Thêm sản phẩm thành công' });
    console.log(`Thêm sản phẩm thành công`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi máy chủ khi thêm sản phẩm' });
  }
});


// 📌 Lấy danh sách sản phẩm theo categoryId
router.get('/category', async (req, res) => {
  const categoryId = req.query.category_id || req.query.categoryId;

  if (!categoryId) {
    return res.status(400).json({ msg: 'Category ID is required' });
  }

  try {
    const [products] = await db.query(
      `SELECT p.*, c.name AS category_name, u.name AS seller_name
       FROM products p
       JOIN categories c ON p.category_id = c.id
       JOIN users u ON p.seller_id = u.id
       WHERE p.category_id = ?`, 
      [categoryId]
    );

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error when fetching products' });
  }
});


// 📌 Lấy danh sách sản phẩm nổi bật
router.get('/featured', async (req, res) => {
  try {
    // Ví dụ: lấy 3 sản phẩm nổi bật mới nhất
    const [products] = await db.query(`
      SELECT p.*, c.name AS category_name, u.name AS seller_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.seller_id = u.id
      WHERE p.is_featured = 1
      ORDER BY p.created_at DESC
      LIMIT 3
    `);

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi máy chủ khi lấy sản phẩm nổi bật' });
  }
});


// 📌 Lấy tất cả sản phẩm (có phân trang + lọc theo category)
router.get('/', async (req, res) => {
  try {
    const [products] = await db.query(
      `SELECT p.*, c.name AS category_name, u.name AS seller_name
       FROM products p
       JOIN categories c ON p.category_id = c.id
       JOIN users u ON p.seller_id = u.id
       ORDER BY p.created_at DESC`
    );

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi máy chủ khi lấy sản phẩm' });
  }
});


// 📌 Lấy chi tiết sản phẩm
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [[product]] = await db.query(
      `SELECT p.*, c.name AS category_name, u.name AS seller_name
       FROM products p
       JOIN categories c ON p.category_id = c.id
       JOIN users u ON p.seller_id = u.id
       WHERE p.id = ?`,
      [id]
    );

    if (!product) {
      return res.status(404).json({ msg: 'Sản phẩm không tồn tại' });
    }

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi máy chủ khi lấy chi tiết sản phẩm' });
  }
});

// 📌 Cập nhật sản phẩm
router.put('/:id', verifyToken, isSelfOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, description = '', price, image = '', category_id } = req.body;

  try {
    const [[product]] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) return res.status(404).json({ msg: 'Sản phẩm không tồn tại' });

    // Kiểm tra quyền sở hữu sản phẩm hoặc quyền admin
    if (req.user.role !== 'admin' && product.seller_id !== req.user.id) {
      return res.status(403).json({ msg: 'Bạn không có quyền sửa sản phẩm này' });
    }

    await db.query(
      `UPDATE products 
       SET name = ?, description = ?, price = ?, image = ?, category_id = ? 
       WHERE id = ?`,
      [name, description, price, image, category_id, id]
    );

    res.json({ msg: 'Cập nhật sản phẩm thành công' });
    console.log(`Cập nhật sản phẩm thành công`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi máy chủ khi cập nhật sản phẩm' });
  }
});

// 📌 Xóa sản phẩm
router.delete('/:id', verifyToken, isSelfOrAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [[product]] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) return res.status(404).json({ msg: 'Sản phẩm không tồn tại' });

    // Kiểm tra quyền sở hữu sản phẩm hoặc quyền admin
    if (req.user.role !== 'admin' && product.seller_id !== req.user.id) {
      return res.status(403).json({ msg: 'Bạn không có quyền xóa sản phẩm này' });
    }

    await db.query('DELETE FROM products WHERE id = ?', [id]);
    res.json({ msg: 'Xóa sản phẩm thành công' });
    console.log(`Xóa sản phẩm thành công`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi máy chủ khi xóa sản phẩm' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../utils/token');
const { isSelfOrAdmin } = require('../middleware/role_admin_seller');

// 📌 Lấy tất cả sản phẩm trong giỏ của user
router.get('/', verifyToken,isSelfOrAdmin, async (req, res) => {
  const userId = req.user.id;

  try {
    const [cartItems] = await db.query(
      `SELECT c.id, c.product_id, c.quantity, p.name, p.price, p.image 
       FROM cart c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ?`,
      [userId]
    );

    res.json(cartItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi khi lấy giỏ hàng' });
  }
});

// 📌 Thêm sản phẩm vào giỏ hàng
router.post('/', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { product_id, quantity } = req.body;

  // Validate
  if (!product_id || !quantity || quantity < 1) {
    return res.status(400).json({ error: 'Thiếu thông tin hoặc số lượng không hợp lệ' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Kiểm tra sản phẩm tồn tại
    const [[product]] = await conn.query(
      'SELECT id, price, quantity as stock FROM products WHERE id = ?', 
      [product_id]
    );
    if (!product) {
      return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
    }

    // 2. Kiểm tra tồn kho (nếu cần)
    if (product.stock < quantity) {
      return res.status(400).json({ 
        error: `Chỉ còn ${product.stock} sản phẩm trong kho` 
      });
    }

    // 3. Thêm vào giỏ hàng
    const [[existingItem]] = await conn.query(
      'SELECT id FROM cart WHERE user_id = ? AND product_id = ?',
      [userId, product_id]
    );

    if (existingItem) {
      await conn.query(
        'UPDATE cart SET quantity = quantity + ? WHERE id = ?',
        [quantity, existingItem.id]
      );
    } else {
      await conn.query(
        'INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)',
        [userId, product_id, quantity]
      );
    }

    await conn.commit();
    
    // 4. Trả về giỏ hàng cập nhật
    const [[newCartItem]] = await conn.query(
      `SELECT c.*, p.name, p.price, p.image 
       FROM cart c JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ? AND c.product_id = ?`,
      [userId, product_id]
    );

    res.status(201).json({
      success: true,
      data: newCartItem
    });
  } catch (err) {
    await conn.rollback();
    console.error('Lỗi giỏ hàng:', err);
    res.status(500).json({ error: 'Lỗi hệ thống' });
  } finally {
    conn.release();
  }
}); 

// 📌 Cập nhật số lượng sản phẩm trong giỏ
router.put('/:id', verifyToken,isSelfOrAdmin, async (req, res) => {
  const cartId = req.params.id;
  const { quantity } = req.body;

  if (!quantity || quantity < 1) {
    return res.status(400).json({ msg: 'Số lượng không hợp lệ' });
  }

  try {
    // Kiểm tra xem sản phẩm có trong giỏ người dùng không
    const [[item]] = await db.query('SELECT * FROM cart WHERE id = ?', [cartId]);
    if (!item || item.user_id !== req.user.id) {
      return res.status(404).json({ msg: 'Không tìm thấy sản phẩm trong giỏ' });
    }

    await db.query('UPDATE cart SET quantity = ? WHERE id = ?', [quantity, cartId]);
    res.json({ msg: 'Cập nhật số lượng thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi khi cập nhật giỏ hàng' });
  }
});

// 📌 Xóa sản phẩm khỏi giỏ hàng
router.delete('/:id', verifyToken,isSelfOrAdmin, async (req, res) => {
  const cartId = req.params.id;

  try {
    const [[item]] = await db.query('SELECT * FROM cart WHERE id = ?', [cartId]);
    if (!item || item.user_id !== req.user.id) {
      return res.status(404).json({ msg: 'Không tìm thấy sản phẩm trong giỏ' });
    }

    await db.query('DELETE FROM cart WHERE id = ?', [cartId]);
    res.json({ msg: 'Đã xóa khỏi giỏ hàng' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi khi xóa sản phẩm khỏi giỏ hàng' });
  }
});

module.exports = router;

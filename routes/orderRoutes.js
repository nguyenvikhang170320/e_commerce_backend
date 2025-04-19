const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../utils/token');
const { canAccessOrderDetail } = require('../middleware/order_permission');

// 📌 Tạo đơn hàng từ giỏ hàng
router.post('/', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { address, phone } = req.body;

  try {
    const [cartItems] = await db.query(
      `SELECT c.product_id, c.quantity, p.price
       FROM cart c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ?`,
      [userId]
    );

    if (cartItems.length === 0) {
      return res.status(400).json({ msg: 'Giỏ hàng trống' });
    }

    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const [orderResult] = await db.query(
      'INSERT INTO orders (user_id, address, phone, total_amount, status, created_at) VALUES (?, ?, ?, ?, "pending", NOW())',
      [userId, address, phone, total]
    );
    const orderId = orderResult.insertId;

    for (const item of cartItems) {
      await db.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.quantity, item.price]
      );
    }

    await db.query('DELETE FROM cart WHERE user_id = ?', [userId]);

    res.status(201).json({ msg: 'Đặt hàng thành công', order_id: orderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi khi tạo đơn hàng' });
  }
});

// 📌 Lấy đơn hàng của người dùng
router.get('/', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const [orders] = await db.query(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi khi lấy đơn hàng' });
  }
});

// 📌 Lấy tất cả đơn hàng (admin hoặc seller)
router.get('/all', verifyToken, async (req, res) => {
  try {
    let orders = [];

    if (req.user.role === 'admin') {
      const [results] = await db.query(
        `SELECT o.*, u.name as customer_name 
         FROM orders o 
         JOIN users u ON o.user_id = u.id 
         ORDER BY o.created_at DESC`
      );
      orders = results;
    } else if (req.user.role === 'seller') {
      const [results] = await db.query(
        `SELECT DISTINCT o.*, u.name as customer_name
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN products p ON oi.product_id = p.id
         JOIN users u ON o.user_id = u.id
         WHERE p.seller_id = ?
         ORDER BY o.created_at DESC`,
        [req.user.id]
      );
      orders = results;
    } else {
      return res.status(403).json({ msg: 'Không có quyền' });
    }

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi khi lấy tất cả đơn hàng' });
  }
});

// 📌 Lấy chi tiết 1 đơn hàng (admin, seller, hoặc chính chủ)
router.get('/:id', verifyToken, canAccessOrderDetail, async (req, res) => {
  const orderId = req.params.id;

  try {
    const [[order]] = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);

    const [items] = await db.query(
      `SELECT oi.*, p.name, p.image 
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    res.json({ order, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi khi lấy chi tiết đơn hàng' });
  }
});

// 📌 Cập nhật trạng thái đơn hàng (chỉ admin)
router.put('/:id/status', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Không có quyền' });
  }

  const orderId = req.params.id;
  const { status } = req.body;

  try {
    await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
    res.json({ msg: 'Cập nhật trạng thái thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi khi cập nhật trạng thái' });
  }
});

module.exports = router;

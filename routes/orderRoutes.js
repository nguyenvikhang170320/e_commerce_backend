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
    console.log('➡️ Bắt đầu tạo đơn hàng cho user:', userId);

    const [cartItems] = await db.query(
      `SELECT c.product_id, c.quantity, p.price, p.stock
       FROM carts c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ?`,
      [userId]
    );

    console.log('🛒 Giỏ hàng:', cartItems);

    if (cartItems.length === 0) {
      console.log('⚠️ Giỏ hàng trống');
      return res.status(400).json({ msg: 'Giỏ hàng trống' });
    }

    // Kiểm tra số lượng kho
    for (const item of cartItems) {
      if (item.quantity > item.stock) {
        console.log(`⚠️ Sản phẩm ${item.product_id} không đủ số lượng trong kho`);
        return res.status(400).json({ msg: `Không đủ hàng cho sản phẩm ID ${item.product_id}` });
      }
    }

    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    console.log('💰 Tổng tiền đơn hàng:', total);

    const [orderResult] = await db.query(
      'INSERT INTO orders (user_id, address, phone, total_amount, status, created_at) VALUES (?, ?, ?, ?, "pending", NOW())',
      [userId, address, phone, total]
    );
    const orderId = orderResult.insertId;
    console.log('🧾 Đã tạo đơn hàng, ID:', orderId);

    // Thêm sản phẩm vào bảng order_items
    for (const item of cartItems) {
      console.log(`➕ Thêm sản phẩm vào đơn hàng:`, item);
      await db.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.quantity, item.price]
      );

      // Trừ số lượng trong kho
      await db.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
      console.log(`🔻 Đã trừ ${item.quantity} sản phẩm ID ${item.product_id} khỏi kho`);
    }

    console.log('✅ Đã thêm tất cả sản phẩm vào bảng order_items và cập nhật kho');

    // Xóa giỏ hàng sau khi đặt hàng thành công
    await db.query('DELETE FROM carts WHERE user_id = ?', [userId]);
    console.log('🧹 Đã xóa giỏ hàng sau khi đặt hàng');

    res.status(201).json({ msg: 'Đặt hàng thành công', order_id: orderId });
  } catch (err) {
    console.error('❌ Lỗi khi tạo đơn hàng:', err);
    res.status(500).json({ msg: 'Lỗi khi tạo đơn hàng' });
  }
});


// 📌 Lấy đơn hàng của người dùng
router.get('/', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    console.log('📦 Lấy danh sách đơn hàng của user:', userId);
    const [orders] = await db.query(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json(orders);
  } catch (err) {
    console.error('❌ Lỗi khi lấy đơn hàng của user:', err);
    res.status(500).json({ msg: 'Lỗi khi lấy đơn hàng' });
  }
});

// 📌 Lấy tất cả đơn hàng (admin hoặc seller)
router.get('/all', verifyToken, async (req, res) => {
  try {
    console.log('📦 Lấy tất cả đơn hàng bởi:', req.user.role);
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
      console.log('❌ Người dùng không có quyền truy cập đơn hàng');
      return res.status(403).json({ msg: 'Không có quyền' });
    }

    console.log('📋 Tổng đơn hàng lấy được:', orders.length);
    res.json(orders);
  } catch (err) {
    console.error('❌ Lỗi khi lấy tất cả đơn hàng:', err);
    res.status(500).json({ msg: 'Lỗi khi lấy tất cả đơn hàng' });
  }
});

// 📌 Lấy chi tiết 1 đơn hàng
router.get('/:id', verifyToken, canAccessOrderDetail, async (req, res) => {
  const orderId = req.params.id;

  try {
    console.log('🔍 Lấy chi tiết đơn hàng ID:', orderId);

    const [[order]] = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    console.log('📄 Thông tin đơn hàng:', order);

    const [items] = await db.query(
      `SELECT oi.*, p.name, p.image 
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );
    console.log('📦 Danh sách sản phẩm trong đơn hàng:', items.length);

    res.json({ order, items });
  } catch (err) {
    console.error('❌ Lỗi khi lấy chi tiết đơn hàng:', err);
    res.status(500).json({ msg: 'Lỗi khi lấy chi tiết đơn hàng' });
  }
});

// 📌 Cập nhật trạng thái đơn hàng
router.put('/:id/status', verifyToken, async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    console.log(`🔄 Cập nhật trạng thái đơn hàng ${orderId} thành "${status}"`);

    // Lấy thông tin đơn hàng
    const [order] = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);

    if (!order) {
      return res.status(404).json({ msg: 'Đơn hàng không tồn tại' });
    }

    // Nếu người dùng là admin hoặc seller của sản phẩm trong đơn hàng
    if (userRole === 'admin') {
      // Admin có quyền cập nhật trạng thái tất cả đơn hàng
      console.log('✅ Admin cập nhật trạng thái đơn hàng');
    } else if (userRole === 'seller') {
      // Seller chỉ có thể cập nhật trạng thái đơn hàng của mình
      const [orderItems] = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

      const isSellerProduct = orderItems.some(item => item.product_id && item.seller_id === userId);  // Kiểm tra seller là người bán sản phẩm trong đơn hàng

      if (!isSellerProduct) {
        return res.status(403).json({ msg: 'Bạn không có quyền cập nhật trạng thái đơn hàng này' });
      }
    } else {
      // Nếu không phải admin hoặc seller hợp lệ
      return res.status(403).json({ msg: 'Không có quyền' });
    }

    // Nếu trạng thái mới là "canceled", hoàn lại stock cho từng sản phẩm
    if (status === 'canceled') {
      console.log(`⛔ Đơn hàng ${orderId} bị hủy, hoàn lại kho hàng`);

      // Lấy danh sách các sản phẩm trong đơn hàng
      const [orderItems] = await db.query(
        'SELECT oi.product_id, oi.quantity FROM order_items oi WHERE oi.order_id = ?',
        [orderId]
      );

      // Hoàn lại stock cho từng sản phẩm, đảm bảo stock không vượt quá 100
      for (const item of orderItems) {
        const [[product]] = await db.query(
          'SELECT stock FROM products WHERE id = ?',
          [item.product_id]
        );

        const newStock = Math.min(100, product.stock + item.quantity); // Đảm bảo stock không vượt quá 100
        await db.query(
          'UPDATE products SET stock = ? WHERE id = ?',
          [newStock, item.product_id]
        );
        console.log(`🔄 Đã hoàn lại ${item.quantity} sản phẩm ID ${item.product_id} vào kho, stock hiện tại: ${newStock}`);
      }
    }

    // Cập nhật trạng thái đơn hàng
    await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);

    res.json({ msg: 'Cập nhật trạng thái thành công' });
  } catch (err) {
    console.error('❌ Lỗi khi cập nhật trạng thái đơn hàng:', err);
    res.status(500).json({ msg: 'Lỗi khi cập nhật trạng thái' });
  }
});


module.exports = router;

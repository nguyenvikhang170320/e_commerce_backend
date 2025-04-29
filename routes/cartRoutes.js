const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../utils/token');
const { isSelfOrAdmin } = require('../middleware/role_admin_seller');

// 📌 Lấy tất cả sản phẩm trong giỏ của user
router.get('/', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const [cartItems] = await db.query(
      `SELECT c.id, c.product_id, c.quantity, p.name, p.price, p.image 
       FROM carts c
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
  const { product_id } = req.body;

  // Mặc định mỗi lần thêm là 1 sản phẩm
  const quantityToAdd = 1;

  console.log('🟡 Người dùng ID:', userId);
  console.log('🟡 Sản phẩm thêm vào:', product_id);

  if (!product_id) {
    console.log('❌ Thiếu product_id');
    return res.status(400).json({ error: 'Thiếu thông tin sản phẩm' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Kiểm tra sản phẩm
    const [[product]] = await conn.query(
      'SELECT id, price, stock, image FROM products WHERE id = ?',
      [product_id]
    );
    console.log('📦 Dữ liệu sản phẩm:', product);

    if (!product) {
      console.log('❌ Sản phẩm không tồn tại');
      return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
    }

    // 2. Kiểm tra sản phẩm đã có trong giỏ chưa, cần kiểm tra theo userId và productId
    const [[existingItem]] = await conn.query(
      'SELECT id, quantity FROM carts WHERE user_id = ? AND product_id = ?',
      [userId, product_id]
    );
    console.log('📥 Sản phẩm đã có trong giỏ:', existingItem);

    if (existingItem) {
      const newQuantity = existingItem.quantity;

      if (product.stock < newQuantity) {
        console.log(`❌ Vượt tồn kho: hiện tại ${product.stock}, yêu cầu ${newQuantity}`);
        return res.status(400).json({ error: `Chỉ còn ${product.stock} sản phẩm trong kho` });
      }

      await conn.query(
        'UPDATE carts SET quantity = ? WHERE id = ?',
        [newQuantity, existingItem.id]
      );
      console.log(`✅ Cập nhật số lượng giỏ hàng ID ${existingItem.id} thành ${newQuantity}`);
    } else {
      if (product.stock < 1) {
        console.log('❌ Sản phẩm đã hết hàng');
        return res.status(400).json({ error: 'Sản phẩm đã hết hàng' });
      }

      await conn.query(
        'INSERT INTO carts (user_id, product_id, quantity, image) VALUES (?, ?, ?, ?)',
        [userId, product_id, quantityToAdd, product.image]
      );
      console.log('✅ Thêm mới sản phẩm vào giỏ');
    }

    await conn.commit();

    // 3. Trả về item mới nhất
    const [[newCartItem]] = await conn.query(
      `SELECT c.*, p.name, p.price, p.image 
       FROM carts c 
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ? AND c.product_id = ?`,
      [userId, product_id]
    );
    console.log('🎁 Trả về giỏ hàng:', newCartItem);

    res.status(201).json({
      success: true,
      data: newCartItem
    });

  } catch (err) {
    await conn.rollback();
    console.error('❌ Lỗi giỏ hàng:', err);
    res.status(500).json({ error: 'Lỗi hệ thống' });
  } finally {
    conn.release();
  }
});





// 📌 Cập nhật số lượng sản phẩm trong giỏ
router.put('/:id', verifyToken, async (req, res) => {
  const cartId = req.params.id;
  const { quantity } = req.body;

  console.log('🔄 Yêu cầu cập nhật giỏ hàng ID:', cartId);
  console.log('📦 Số lượng yêu cầu cập nhật:', quantity);
  console.log('👤 ID người dùng:', req.user.id);

  if (!quantity || quantity < 1) {
    console.log('❌ Số lượng không hợp lệ');
    return res.status(400).json({ msg: 'Số lượng không hợp lệ' });
  }

  try {
    const [[item]] = await db.query('SELECT * FROM carts WHERE id = ?', [cartId]);
    console.log('📥 Sản phẩm trong giỏ:', item);

    if (!item || item.user_id !== req.user.id) {
      console.log('❌ Không tìm thấy hoặc không đúng người dùng');
      return res.status(404).json({ msg: 'Không tìm thấy sản phẩm trong giỏ' });
    }

    await db.query('UPDATE carts SET quantity = ? WHERE id = ?', [quantity, cartId]);
    console.log(`✅ Đã cập nhật giỏ hàng ID ${cartId} thành số lượng ${quantity}`);

    res.json({ msg: 'Cập nhật số lượng thành công' });
  } catch (err) {
    console.error('❌ Lỗi khi cập nhật giỏ hàng:', err);
    res.status(500).json({ msg: 'Lỗi khi cập nhật giỏ hàng' });
  }
});


// 📌 Xóa sản phẩm khỏi giỏ hàng
router.delete('/:id', verifyToken, async (req, res) => {
  const cartId = req.params.id;

  try {
    const [[item]] = await db.query('SELECT * FROM carts WHERE id = ?', [cartId]);
    if (!item || item.user_id !== req.user.id) {
      return res.status(404).json({ msg: 'Không tìm thấy sản phẩm trong giỏ' });
    }

    await db.query('DELETE FROM carts WHERE id = ?', [cartId]);
    res.json({ msg: 'Đã xóa khỏi giỏ hàng' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Lỗi khi xóa sản phẩm khỏi giỏ hàng' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../utils/token');
const denyAdmin = require('../middleware/deny_admin');


router.get('/search', verifyToken, async (req, res, next) => {
    const searchTerm = req.query.q;
    let targetUserId = req.user.id;
    const userRole = req.user.role;

    if (!searchTerm) {
        return res.status(400).json({ message: 'Search term (q) is required' });
    }

    if (userRole === 'admin' && req.query.user_id) {
        const requestedUserId = parseInt(req.query.user_id);
        if (isNaN(requestedUserId) || requestedUserId <= 0) {
            return res.status(400).json({ message: 'User_id được cung cấp trong tham số truy vấn không hợp lệ.' });
        }
        targetUserId = requestedUserId;
    } else if (userRole === 'seller' && req.query.user_id && parseInt(req.query.user_id) !== req.user.id) {
        return res.status(403).json({ message: 'Người bán không được phép tìm kiếm người dùng khác\' carts.' });
    }

    try {
        // Cập nhật câu truy vấn SQL để khớp với CartItem model của bạn
        // Bảng `carts` của bạn có: id, user_id, product_id, quantity, image, added_at, discountPercent, shipping_fee, price
        // Bảng `products` của bạn có: id, name, description, price, image, stock
        // Bảng `users` của bạn có: id, name, email

        const [rows] = await db.execute(
            `SELECT
                ci.id AS id,                  -- ✅ Đổi alias thành 'id' để khớp với Flutter CartItem.id
                ci.quantity,
                ci.product_id,
                ci.price AS price,            -- ✅ Đổi alias thành 'price' để khớp với Flutter CartItem.price
                ci.added_at,                  -- ✅ Thêm cột 'added_at'
                ci.discountPercent,           -- ✅ Thêm cột 'discountPercent'
                ci.shipping_fee,              -- ✅ Thêm cột 'shipping_fee'
                p.name AS name,               -- ✅ Đổi alias thành 'name' để khớp với Flutter CartItem.productName
                p.image AS image,             -- ✅ Đổi alias thành 'image' để khớp với Flutter CartItem.productImage (lấy từ product)
                u.id AS user_id               -- ✅ Thêm cột 'user_id' để khớp với Flutter CartItem.userId
                -- Nếu bạn muốn userName và userEmail, hãy thêm vào đây: u.name AS user_name, u.email AS user_email
             FROM carts ci
             JOIN products p ON ci.product_id = p.id
             JOIN users u ON ci.user_id = u.id -- Giữ JOIN này để lấy user_id
             WHERE ci.user_id = ? AND LOWER(p.name) LIKE ?`,
            [targetUserId, `%${searchTerm.toLowerCase()}%`]
        );

        if (rows.length === 0) {
            let message = 'Không tìm thấy sản phẩm nào trong giỏ hàng của bạn khớp với từ khóa tìm kiếm.';
            if (userRole === 'admin' && req.query.user_id) {
                message = `Không tìm thấy mục nào trong giỏ hàng cho ID người dùng ${targetUserId} phù hợp với thuật ngữ tìm kiếm.`;
            }
            return res.status(200).json({ message, cartItems: [] });
        }

        res.status(200).json(rows);
    } catch (error) {
        console.error('Lỗi khi tìm kiếm các mặt hàng trong giỏ hàng:', error);
        res.status(500).json({ message: 'Có lỗi xảy ra từ phía server khi tìm kiếm giỏ hàng.', error: error.message });
    }
});

// 📌 Lấy tất cả sản phẩm trong giỏ của user
router.get('/', verifyToken,denyAdmin, async (req, res) => {
  const userId = req.user.id;
  console.log(`[${new Date().toISOString()}] Yêu cầu lấy giỏ hàng từ user ID: ${userId}`);

  try {
    const [cartItems] = await db.query(
      `SELECT c.id, c.product_id, c.quantity, c.price , p.name, p.image, c.added_at
       FROM carts c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ?`,
      [userId]
    );

    console.log(`[${new Date().toISOString()}] Dữ liệu giỏ hàng lấy từ database:`, cartItems);
    res.json(cartItems);
    console.log(`[${new Date().toISOString()}] Phản hồi dữ liệu giỏ hàng thành công cho user ID: ${userId}`);

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Lỗi khi lấy giỏ hàng cho user ID ${userId}:`, err);
    res.status(500).json({ msg: 'Lỗi khi lấy giỏ hàng' });
  }
});

// Thêm giỏ hàng
router.post('/', verifyToken, denyAdmin, async (req, res) => {
  const userId = req.user.id;
  const { product_id, quantity,discountPercent, shipping_fee, price} = req.body;

  console.log('🟡 Người dùng ID:', userId);
  console.log('🟡 Sản phẩm thêm vào:', product_id);
  console.log('🟡 Giá sản phẩm:', price);
  console.log('🟡 Số lượng yêu cầu:', quantity);
  console.log('🟡 Giảm giá:', discountPercent);
  console.log('🟡 Phí ship:', shipping_fee);


  if (!product_id) {
    console.log('❌ Thiếu product_id');
    return res.status(400).json({ error: 'Thiếu thông tin sản phẩm' });
  }

  const quantityToSet = quantity ?? 1; // Nếu không gửi quantity thì mặc định là 1
  if (quantityToSet <= 0) {
    console.log('❌ Số lượng không hợp lệ');
    return res.status(400).json({ error: 'Số lượng phải lớn hơn 0' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction(); // Bắt đầu giao dịch

    // 1️⃣ Kiểm tra sản phẩm có tồn tại không
    const [[product]] = await conn.query(
      'SELECT id, price, stock, image, name FROM products WHERE id = ?',
      [product_id]
    );
    console.log('📦 Dữ liệu sản phẩm:', product);

    if (!product) {
      console.log('❌ Sản phẩm không tồn tại');
      return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
    }

    // 2️⃣ Kiểm tra nếu sản phẩm hết hàng (stock = 0)
    if (product.stock === 0) {
      console.log('❌ Sản phẩm hết hàng');
      return res.status(400).json({ error: 'Sản phẩm đã hết hàng' });
    }

    // 3️⃣ Kiểm tra còn đủ hàng không (chỉ để cảnh báo)
    if (quantityToSet > product.stock) {
      console.log(`❌ Vượt tồn kho: hiện tại ${product.stock}, yêu cầu ${quantityToSet}`);
      return res.status(400).json({ error: `Chỉ còn ${product.stock} sản phẩm trong kho` });
    }

    // 4️⃣ Thêm mới vào giỏ hàng (dù trùng sản phẩm cũng tạo mới)
    console.log('🆕 Thêm mới sản phẩm vào giỏ...');
    const discount = discountPercent ?? 0;
    const shipping = shipping_fee ?? 0;
    await conn.query(
      'INSERT INTO carts (user_id, product_id, quantity, image,discountPercent,shipping_fee,price) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, product_id, quantityToSet, product.image, discount, shipping, price]
    );
    console.log('✅ Đã thêm mới sản phẩm vào giỏ');

    await conn.commit(); // Xác nhận giao dịch nếu không có lỗi
    console.log('✅ Giao dịch thành công');

    // 5️⃣ Trả về item vừa thêm
    const [[newCartItem]] = await conn.query(
      `SELECT c.*, p.name, c.price, p.image ,c.added_at
       FROM carts c 
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ? AND c.product_id = ?
       ORDER BY c.id DESC
       LIMIT 1`,
      [userId, product_id]
    );
    console.log('🎁 Trả về giỏ hàng:', newCartItem);

    res.status(201).json({
      success: true,
      data: newCartItem
    });

  } catch (err) {
    await conn.rollback(); // Nếu có lỗi, rollback giao dịch
    console.error('❌ Lỗi giỏ hàng:', err);
    res.status(500).json({ error: 'Lỗi hệ thống' });
  } finally {
    conn.release(); // Giải phóng kết nối
  }
});


// 📌 Cập nhật số lượng sản phẩm trong giỏ
router.put('/:id', verifyToken,denyAdmin, async (req, res) => {
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
router.delete('/:id', verifyToken,denyAdmin, async (req, res) => {
  const cartId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role; // Lấy role từ token

  try {
    const [[item]] = await db.query('SELECT * FROM carts WHERE id = ?', [cartId]);

    if (!item) {
      return res.status(404).json({ msg: 'Không tìm thấy sản phẩm trong giỏ' });
    }

    // ✅ Kiểm tra quyền xóa: Chỉ cho phép user hoặc seller xóa sản phẩm trong giỏ của chính mình.
    // Admin không có quyền xóa sản phẩm của người khác.
    if (userRole !== 'admin' && item.user_id !== userId) {
      return res.status(403).json({ msg: 'Bạn không có quyền xóa sản phẩm này' });
    }

    // ✅ Xóa sản phẩm khỏi giỏ hàng:
    await db.query('DELETE FROM carts WHERE id = ?', [cartId]);

    console.log(`🗑️ Đã xóa cart ID ${cartId}`);
    res.json({
      success: true,
      msg: 'Đã xóa khỏi giỏ hàng',
      data: {
        cartId,
        product_id: item.product_id,
        quantity: item.quantity
      }
    });
  } catch (err) {
    console.error('❌ Lỗi khi xóa giỏ hàng:', err);
    res.status(500).json({ msg: 'Lỗi khi xóa sản phẩm khỏi giỏ hàng' });
  }
});


module.exports = router;

const db = require('../config/db');

async function canAccessOrderDetail(req, res, next) {
  const orderId = req.params.id;

  try {
    const [[order]] = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);

    if (!order) {
      return res.status(404).json({ msg: 'Không tìm thấy đơn hàng' });
    }

    // Admin hoặc seller được phép
    if (['admin', 'seller'].includes(req.user.role)) {
      return next();
    }

    // Người dùng là chủ đơn hàng
    if (order.user_id === req.user.id) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'Không có quyền truy cập đơn hàng này' 
    });
  } catch (err) {
    console.error('Lỗi kiểm tra quyền đơn hàng:', err);
    return res.status(500).json({ msg: 'Lỗi khi kiểm tra quyền truy cập đơn hàng' });
  }
}

module.exports = {
  canAccessOrderDetail,
};

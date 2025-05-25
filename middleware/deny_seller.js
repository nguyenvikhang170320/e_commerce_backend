module.exports = function denyAdmin(req, res, next) {
  if (req.user.role === 'seller') {
    return res.status(403).json({ msg: 'Seller không được phép thao tác trạng thái giỏ hàng' });
  }
  next();
};
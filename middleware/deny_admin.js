module.exports = function denyAdmin(req, res, next) {
  if (req.user.role === 'admin') {
    return res.status(403).json({ msg: 'Admin không được phép thao tác giỏ hàng' });
  }
  next();
};
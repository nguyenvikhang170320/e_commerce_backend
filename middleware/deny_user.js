module.exports = function denyAdmin(req, res, next) {
 if (req.user.role === 'user') {
    return res.status(403).json({ msg: 'Bạn không được phép xem doanh thu' });
  }
  next();
};
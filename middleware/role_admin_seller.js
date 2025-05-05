function isSelfOrAdmin(req, res, next) {
  // Kiểm tra người dùng đã xác thực chưa
  if (!req.user) {
      return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Chưa xác thực người dùng' 
      });
  }

  const userId = req.params.id;


  // Cho phép admin và seller truy cập mọi thứ
  if (req.user.role === 'admin' || req.user.role === 'seller') {
    console.log(`Admin: ${req.user.role === 'admin'}`);
    console.log(`Seller: ${req.user.role === 'seller'}`);
      return next();
      
  }

  // Kiểm tra ID người dùng hiện tại có khớp không
  if (req.user.id.toString() === userId.toString()) {
      return next();
  }

  // Nếu không phải admin và không phải chính mình
  return res.status(403).json({ 
      error: 'Forbidden',
      message: 'Không có quyền truy cập tài nguyên này' 
  });
}

module.exports = {
  isSelfOrAdmin,
};
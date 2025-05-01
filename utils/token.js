const jwt = require('jsonwebtoken');

// Hàm tạo token
const generateToken = (payload) => {
  try {
    return jwt.sign(
      payload, 
      process.env.JWT_SECRET, 
      {
        expiresIn: '7d', // Thời gian hết hạn token
        algorithm: 'HS256' // Đảm bảo chỉ định rõ thuật toán
      }
    );
  } catch (err) {
    console.error('❌ Lỗi khi tạo token:', err);
    throw new Error('Không thể tạo token');
  }
};

// Middleware xác thực token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Kiểm tra xem token có được gửi đúng cách trong header không
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('⚠️ Token không tồn tại hoặc sai định dạng');
    return res.status(401).json({ error: 'Unauthorized - Token không hợp lệ' });
  }

  const token = authHeader.split(' ')[1]; // Tách token từ header

  // Kiểm tra token không rỗng
  if (!token || token === 'null') {
    return res.status(401).json({ error: 'Unauthorized - Token không được cung cấp' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    
    // Log để kiểm tra payload của token
    console.log('Decoded token:', decoded);

    // Kiểm tra xem token có chứa đủ thông tin cần thiết không
    if (!decoded.id || !decoded.role) {
      return res.status(403).json({ error: 'Forbidden - Token thiếu thông tin xác thực' });
    }

    req.user = decoded; // Lưu thông tin người dùng vào req.user để các middleware tiếp theo có thể sử dụng
    console.log('Token hợp lệ:', req.user); // Log thông tin người dùng để kiểm tra
    next();
    
  } catch (err) {
    console.error('❌ Lỗi xác thực token:', err.message);
    
    const errorMsg = err.name === 'TokenExpiredError' 
      ? 'Token đã hết hạn' 
      : 'Token không hợp lệ';
    
    return res.status(403).json({ 
      error: 'Forbidden',
      message: errorMsg 
    });
  }
};

// Middleware kiểm tra quyền truy cập
function checkRole(requiredRoles = []) {
  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(403).json({ error: 'Forbidden - Thiếu thông tin người dùng' });
    }

    if (!requiredRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: `Chỉ ${requiredRoles.join(', ')} mới được phép truy cập`
      });
    }

    // Log quyền truy cập của người dùng và quyền yêu cầu
    console.log(`User role: ${req.user.role} - Kiểm tra quyền truy cập cho các vai trò: ${requiredRoles.join(', ')}`);
    next();
  };
}

// Các middleware role cụ thể
const isAdmin = checkRole(['admin']);
const isSeller = checkRole(['seller']);

module.exports = {
  generateToken,
  verifyToken,
  checkRole,
  isAdmin,
  isSeller,
};

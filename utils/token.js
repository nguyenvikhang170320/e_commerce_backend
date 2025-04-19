const jwt = require('jsonwebtoken');

// Hàm tạo token - Nên thêm try-catch
const generateToken = (payload) => {
  try {
    return jwt.sign(
      payload, 
      process.env.JWT_SECRET, 
      {
        expiresIn: '7d',
        algorithm: 'HS256' // Nên chỉ định rõ algorithm
      }
    );
  } catch (err) {
    console.error('❌ Lỗi khi tạo token:', err);
    throw new Error('Không thể tạo token');
  }
};

// Middleware xác thực token - Nên kiểm tra payload
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('⚠️ Token không tồn tại hoặc sai định dạng');
    return res.status(401).json({ error: 'Unauthorized - Token không hợp lệ' }); // Dùng error thay vì msg
  }

  const token = authHeader.split(' ')[1];
  
  // Kiểm tra token không rỗng
  if (!token || token === 'null') {
    return res.status(401).json({ error: 'Unauthorized - Token không được cung cấp' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    
    // Kiểm tra payload có đủ thông tin
    if (!decoded.id || !decoded.role) {
      return res.status(403).json({ error: 'Forbidden - Token thiếu thông tin xác thực' });
    }
    console.log(`Token hợp lệ: ${decoded}`);
    req.user = decoded;
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

// Middleware kiểm tra admin - Nên mở rộng cho nhiều role
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
    console.log(`Token: ${requiredRoles}`);

    next();
  };
}
// Các middleware role cụ thể
const isAdmin = checkRole(['admin']);
const isSeller = checkRole(['seller']);

module.exports = {
  generateToken,
  verifyToken,
  checkRole,// check role
  isAdmin, //admin
  isSeller, //seller
};
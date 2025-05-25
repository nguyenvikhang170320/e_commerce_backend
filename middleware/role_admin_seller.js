function isSelfOrAdmin(req, res, next) {
    // Kiểm tra người dùng đã xác thực chưa
    if (!req.user) {
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Chưa xác thực người dùng' 
        });
    }

    // Lấy ID từ tham số URL. Ưu tiên 'id', nếu không có thì thử 'sellerId'
    // hoặc bất kỳ tên tham số nào mà middleware này cần kiểm tra
    const paramId = req.params.id || req.params.sellerId; // <--- Sửa ở đây

    // Nếu không có ID nào trong params, middleware này không thể kiểm tra
    if (!paramId) {
        // Đây có thể là một route mà middleware này không phù hợp,
        // hoặc bạn cần ID để xác thực. Tùy thuộc vào logic của bạn.
        // Hiện tại, tôi sẽ cho phép next() nếu không có ID để kiểm tra (có thể không mong muốn)
        // hoặc trả về lỗi nếu ID là bắt buộc cho route này.
        // Với các route doanh thu, sellerId là bắt buộc.
        console.error("isSelfOrAdmin: req.params.id or req.params.sellerId is undefined.");
        return res.status(400).json({ error: 'Bad Request', message: 'Missing required ID parameter in URL' });
    }

    // Cho phép admin hoặc seller truy cập mọi thứ
    if (req.user.role === 'admin' || req.user.role === 'seller') {
        console.log(`Admin/Seller: ${req.user.role}. Allowing access.`);
        return next();
    }

    // Kiểm tra ID người dùng hiện tại có khớp với ID trong URL không
    // (req.user.id là ID của người dùng đang đăng nhập)
    // (paramId là ID từ URL, có thể là userId hoặc sellerId)
    if (req.user.id.toString() === paramId.toString()) { 
        console.log(`User ID của tài khoản user: ${req.user.id} === ${paramId}. Cho phép truy cập.`);
        return next(); 
    }

    // Nếu không phải admin/seller và không phải chính mình
    return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Không có quyền truy cập tài nguyên này' 
    });
}

module.exports = isSelfOrAdmin;
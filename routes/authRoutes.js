const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const moment = require('moment'); // dùng để lấy thời gian hiện tại nếu bạn thích định dạng rõ ràng
const { verifyToken } = require('../utils/token'); // Cập nhật đúng path tới file token.js
// Đăng ký
router.post('/register', async (req, res) => {
    const { name, email, password, role, phone, image } = req.body;
    try {
      const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        console.log(`Đăng ký thất bại: email ${email} đã tồn tại`);
        return res.status(400).json({ msg: 'Email đã tồn tại' });
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
      const createdAt = moment().format('YYYY-MM-DD HH:mm:ss');
  
      await pool.query(
        'INSERT INTO users (name, email, password, role, phone, image, is_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, email, hashedPassword, role, phone || null, image || null, 0, createdAt]
      );
  
      console.log(`Đăng ký thành công: ${email}`);
      res.status(201).json({ msg: 'Đăng ký thành công' });
    } catch (err) {
      console.error('Lỗi khi đăng ký:', err);
      res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
  });

// Đăng nhập
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];
        if (!user) {
            console.log(`Đăng nhập thất bại: Không tìm thấy tài khoản ${email}`);
            return res.status(400).json({ msg: 'Tài khoản không tồn tại' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            console.log(`Đăng nhập thất bại: Sai mật khẩu cho ${email}`);
            return res.status(400).json({ msg: 'Sai mật khẩu' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        console.log(`Đăng nhập thành công: ${email}`);
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error('Lỗi khi đăng nhập:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        // Kiểm tra email có tồn tại trong hệ thống không
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            console.log(`❌ Quên mật khẩu thất bại: Email ${email} không tồn tại`);
            return res.status(400).json({ msg: 'Email không tồn tại' });
        }

        // Tạo OTP ngẫu nhiên 6 chữ số
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Xoá OTP cũ (nếu có) và lưu OTP mới
        await pool.query('DELETE FROM reset_tokens WHERE email = ?', [email]);
        await pool.query(
            'INSERT INTO reset_tokens (email, otp, created_at) VALUES (?, ?, NOW())',
            [email, otp]
        );

        console.log(`✅ Đã tạo và lưu OTP cho ${email}: ${otp}`);

        // Tạo transporter với Gmail
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS, // Nhớ: phải là App Password nếu bật 2FA
            },
        });

        // Gửi email
        await transporter.sendMail({
            from: `"Ecommerce Shop" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Mã OTP đặt lại mật khẩu',
            html: `
                <div style="font-family: Arial, sans-serif; font-size: 16px;">
                    <p>Xin chào,</p>
                    <p>Đây là mã OTP để đặt lại mật khẩu tài khoản <b>Ecommerce Shop</b> của bạn:</p>
                    <h2 style="color: #007bff;">${otp}</h2>
                    <p>Mã OTP này sẽ hết hạn sau <b>5 phút</b>.</p>
                    <p>Trân trọng,<br>Ecommerce Shop Team</p>
                </div>
            `,
        });

        console.log(`📨 Đã gửi OTP tới email ${email}`);
        res.json({ msg: 'Đã gửi OTP qua email' });

    } catch (err) {
        console.error('❌ Lỗi khi gửi OTP:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});


// Đặt lại mật khẩu bằng OTP
router.post('/reset-password',verifyToken, async (req, res) => {
    const { email, otp, newPassword } = req.body;

    try {
        // Lấy bản ghi reset_token tương ứng
        const [tokens] = await pool.query(
            'SELECT * FROM reset_tokens WHERE email = ? AND otp = ?', 
            [email, otp]
        );
        console.log('Người dùng xác thực:', req.user);
        // Kiểm tra tồn tại
        if (tokens.length === 0) {
            console.log(`❌ OTP không hợp lệ cho ${email}`);
            return res.status(400).json({ msg: 'OTP không hợp lệ hoặc đã hết hạn' });
        }

        const tokenData = tokens[0];
        const createdAt = new Date(tokenData.created_at);
        const now = new Date();

        // Kiểm tra quá 5 phút chưa
        const diffMs = now - createdAt;
        const diffMinutes = diffMs / (1000 * 60);

        if (diffMinutes > 5) {
            console.log(`❌ OTP đã hết hạn cho ${email}`);
            await pool.query('DELETE FROM reset_tokens WHERE email = ?', [email]); // Xoá luôn OTP hết hạn
            return res.status(400).json({ msg: 'OTP đã hết hạn' });
        }

        // Cập nhật mật khẩu mới (hash)
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

        // Xoá OTP sau khi dùng
        await pool.query('DELETE FROM reset_tokens WHERE email = ?', [email]);

        console.log(`✅ Đặt lại mật khẩu thành công cho ${email}`);
        console.log(`✅ Đặt lại mật khẩu thành công: ${newPassword}`);
        res.json({ msg: 'Đặt lại mật khẩu thành công' });

    } catch (err) {
        console.error('❌ Lỗi khi đặt lại mật khẩu:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});



// ✅ Cập nhật thông tin người dùng
router.put('/update-profile/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, role } = req.body;

    console.log('===== YÊU CẦU CẬP NHẬT PROFILE =====');
    console.log('User ID:', id);
    console.log('Dữ liệu nhận được:', { name, email, role });

    try {
        const [existing] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
        if (existing.length === 0) {
            console.warn(`Không tìm thấy người dùng với id: ${id}`);
            return res.status(404).json({ msg: 'Người dùng không tồn tại' });
        }

        await pool.query(
            'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?',
            [name, email, role, id]
        );

        console.log(`✅ Đã cập nhật user id ${id} thành công.`);

        res.json({ msg: 'Cập nhật thông tin thành công' });
    } catch (err) {
        console.error('❌ Lỗi khi cập nhật thông tin người dùng:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});

// ✅ Lấy thông tin người dùng theo ID
router.get('/profile/:id', async (req, res) => {
    const { id } = req.params;

    console.log('Yêu cầu lấy thông tin người dùng:', id);

    try {
        const [users] = await pool.query('SELECT id, name, email, role, image FROM users WHERE id = ?', [id]);
        if (users.length === 0) {
            console.log('Không tìm thấy người dùng');
            return res.status(404).json({ msg: 'Người dùng không tồn tại' });
        }

        res.json(users[0]);
    } catch (err) {
        console.error('Lỗi khi lấy thông tin người dùng:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});

// ✅ Đổi mật khẩu sau khi đã đăng nhập
router.put('/change-password/:id',verifyToken, async (req, res) => {
    const { id } = req.params;
    const { oldPassword, newPassword } = req.body;

    console.log('Yêu cầu đổi mật khẩu từ user ID:', id);
    console.log('Người dùng xác thực:', req.user);
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
        if (users.length === 0) return res.status(404).json({ msg: 'Người dùng không tồn tại' });

        const user = users[0];
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Mật khẩu cũ không đúng' });

        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, id]);

        console.log('✅ Đổi mật khẩu thành công cho user ID:', id);
        console.log('✅ Đổi mật khẩu thành công cho user:', newPassword);
        res.json({ msg: 'Đổi mật khẩu thành công' });
    } catch (err) {
        console.error('❌ Lỗi khi đổi mật khẩu:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});

// Gửi yêu cầu xác minh (User)
router.post('/verify-request', verifyToken, async (req, res) => {
    const userId = req.user.id;

    try {
        // Kiểm tra đã gửi yêu cầu chưa
        const [existing] = await pool.query(
            'SELECT * FROM verification_requests WHERE user_id = ? AND status = "pending"',
            [userId]
        );
        if (existing.length > 0) {
            return res.status(400).json({ msg: 'Bạn đã gửi yêu cầu xác minh trước đó' });
        }

        // Gửi yêu cầu mới
        await pool.query('INSERT INTO verification_requests (user_id) VALUES (?)', [userId]);
        console.log(`✅ User ${userId} đã gửi yêu cầu xác minh`);
        res.json({ msg: 'Yêu cầu xác minh đã được gửi' });
    } catch (err) {
        console.error('❌ Lỗi gửi yêu cầu xác minh:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});


// Lấy trạng thái xác minh (Public)
router.get('/verify-status/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [[user]] = await pool.query('SELECT is_verified FROM users WHERE id = ?', [id]);
        if (!user) return res.status(404).json({ msg: 'Người dùng không tồn tại' });

        const [request] = await pool.query(
            'SELECT status FROM verification_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
            [id]
        );

        res.json({
            is_verified: !!user.is_verified,
            request_status: request.length > 0 ? request[0].status : null
        });
    } catch (err) {
        console.error('❌ Lỗi lấy trạng thái xác minh:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});


// (Admin) Lấy danh sách yêu cầu xác minh
router.get('/verify-requests', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Bạn không có quyền' });
    }

    try {
        const [requests] = await pool.query(`
            SELECT vr.id, vr.user_id, u.name, u.email, vr.status, vr.created_at
            FROM verification_requests vr
            JOIN users u ON vr.user_id = u.id
            ORDER BY vr.created_at DESC
        `);
        res.json(requests);
    } catch (err) {
        console.error('❌ Lỗi lấy danh sách yêu cầu xác minh:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});


// (Admin) Duyệt xác minh
router.put('/verify-request/:id/approve', verifyToken, async (req, res) => {
    const requestId = req.params.id;

    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Bạn không có quyền' });
    }

    try {
        const [[request]] = await pool.query('SELECT * FROM verification_requests WHERE id = ?', [requestId]);
        if (!request) return res.status(404).json({ msg: 'Yêu cầu không tồn tại' });

        await pool.query('UPDATE verification_requests SET status = "approved" WHERE id = ?', [requestId]);
        await pool.query('UPDATE users SET is_verified = 1 WHERE id = ?', [request.user_id]);

        console.log(`✅ Duyệt xác minh cho user ${request.user_id}`);
        res.json({ msg: 'Đã duyệt xác minh' });
    } catch (err) {
        console.error('❌ Lỗi duyệt xác minh:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});


// (Admin) Từ chối xác minh
router.put('/verify-request/:id/reject', verifyToken, async (req, res) => {
    const requestId = req.params.id;

    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Bạn không có quyền' });
    }

    try {
        const [[request]] = await pool.query('SELECT * FROM verification_requests WHERE id = ?', [requestId]);
        if (!request) return res.status(404).json({ msg: 'Yêu cầu không tồn tại' });

        await pool.query('UPDATE verification_requests SET status = "rejected" WHERE id = ?', [requestId]);

        console.log(`❌ Từ chối xác minh user ${request.user_id}`);
        res.json({ msg: 'Đã từ chối xác minh' });
    } catch (err) {
        console.error('❌ Lỗi từ chối xác minh:', err);
        res.status(500).json({ msg: 'Lỗi server', error: err.message });
    }
});


module.exports = router;
